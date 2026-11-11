---
name: rke2-gpu
description: GPU kümesini (gpu-dtx, gpu-prod — H200/B300) denetlerken kullan — GPU dağılımı deterministik `gpu-dagilim.py` ile (pod başına GPU/Run:ai kesir/vLLM parametreleri/shm/NCCL); NVIDIA GPU Operator, sürücü/CUDA, vLLM pod limitleri ve shm, Run:ai, hostPath /models (RAID10/NVMe), GPU node işletim sistemi, ölçüm. "gpu", "gpu kümesi", "h200", "b300", "nvidia", "gpu operator", "vllm", "runai", "/models", "dcgm", "nvlink", "limitler doğru mu", "gpu-dtx", "gpu-prod" isteklerinde tetiklenir. Temel katmanlar (sürüm, control plane, node, Antrea) için önce `rke2-denetim`. Sürücü kurulumu `rhel-gpu-surucu`, GPU Operator/containerd kurulumu `rke2-gpu-kurulum`, Run:ai sağlık/matris `rke2-runai`. Yalnız okur; değişiklik önerir, uygulamaz.
---

# GPU kümesi denetimi

Doğrulama: Doktor'un makinesinde GPU ve küme yok — komutlar sahada **ilk kullanımda** doğrulanacak.
Bir bayraktan emin değilsen önce `--help` / `nvidia-smi --help-query-gpu` çıktısını oku, ezberden yazma.
Kaynak etiketi: **(Alp)** = kurum bilgisi · **(genel)** = NVIDIA/vLLM/Kubernetes genel bilgisi, sahada
doğrulanmadı — raporda "öneri" olarak yaz, "kural" olarak değil.

**Ek dosya** (§0 tarihli saha kayıtları; §4–§6 komutları): `/root/ai/opencode/knowledge/skills/approved/rke2-gpu/gpu-node.md` —
"ek dosya" denen yerde o katmana gelince **önce o bölümü oku**.

### Önce sor (tek mesaj, numaralı — oturumda/kurumsal bilgide cevabı varsa sorma)

1. **Küme:** `gpu-dtx` mi, `gpu-prod` mu — `gpu-prod` yalnız açıkça istenirse (§0).
2. **Kapsam:** uçtan uca mı, tek katman mı (GPU dağılımı, GPU Operator, vLLM pod'u, node işletim sistemi, `/models`, ölçüm).
3. **Belirti varsa:** hangi model/pod, ne oluyor (OOMKilled, yavaşlık, açılmıyor), ne zamandan beri.
4. **Ölçüm istenirse:** şu an gerçek yük var mı — bu beceri yük üretmez; ölçüm var olan yük altında okunur (§6).

Sorma: GPU sayısı ve dağılımı, sürücü, pod limitleri, shm, depolama — `gpu-dagilim.py` ve §1–§5 okur. Run:ai nesnelerinin yorumu
(proje kotası, kesir kararı) kullanıcıya sorulur (§0).

### 0. Ortam (Alp, 2026-10-14)

- Rancher → RKE2 kümeleri; her kümede 3 master + worker'lar (sanal ya da fiziksel). İşletim sistemi genelde RHEL 9.
- **İki GPU kümesi:**
  - `gpu-prod` — prod Rancher'ın (`rke-prod.<kurum>`) altında; **3 fiziksel H200** worker.
  - `gpu-dtx` — nonprod Rancher'ın (`rke-nonprod.<kurum>`) altında (dev/test/prep = `d`/`t`/`x`); **1 fiziksel H200**
    (`h200w1`) + **L40S'li VM worker'lar** (VMware sanallaştırması).
  - `gpu-dtx` node'ları: 3 master (`gpumaster1-3`) + 3 VM worker (`gpuworker1-3`, rol `runai-system`; L40S bunlarda mı `[SAHA]`) + fiziksel
    `h200w1` (`NVIDIA-H200` × 8). H200 node'unun RKE2/RHEL/containerd sürümü diğerlerinden **farklıydı** (2026-10-15 kaydı ve donanım:
    ek dosya §0) — sapmayı her incelemede yeniden oku (`rke2-denetim` §1); 9.4 bilinçli olabilir (Satellite'ta 9.4 CV'si var, Alp).
  - **Şimdilik yalnız `gpu-dtx` incelenir** (Alp, 2026-10-14). `gpu-prod`'a Alp açıkça istemedikçe komut çalıştırma.
- Worker'lar (H200 fiziksel ve L40S VM'ler) RKE2 kümesinin worker node'larıdır — **ikisi de denetim kapsamında.** VM
  worker'da ayrıca hipervizör etkisine bak (`rhel-performans` §3 `%steal`) ve GPU'nun VM'e nasıl verildiğini
  (`nvidia-smi -q` ürün/sanallaştırma alanları) yaz.
- B300 yakında gelecek. NVIDIA GPU Operator iki kümede de çalışıyor. H200 host'unda (RHEL 9) `nvidia-smi` çalışıyor.
- `/models`: host'ta NVMe RAID10 (+2 yedek) → LVM → xfs, ~10 TB; **yazılabilir** — modelleri ekip NFS ya da scp ile
  kopyalıyor. Disk düzeni ve saha ölçüsü: ek dosya §0; RAID sağlığı `rhel-depolama` A §8.
- **vLLM pod'ları modelleri hostPath `/models` ile okur — bilinçli kurum kararı, "kötü uygulama" diye bulgu yazma:** eskiden
  `nfs-sc` StorageClass kullanılıyordu; blok StorageClass yok, Longhorn kurulu değil ve tercih edilmiyor → tek seçenek hostPath;
  model açılışı ~45 dk'dan saniyeler düzeyine indi. **Geçiş sürüyor:** `vllm` namespace pod'larında hâlâ
  **NFS PVC** (`nfs-sc`) görülebilir — DevOps tarafında; bulgu değil, yalnız "geçiş durumu" olarak yaz (Alp; saha kaydı ek dosya §0).
- vLLM deployment'ları fiziksel H200'e sabitleniyor; yöntem (nodeSelector mı taint/toleration mı) `[SAHA]` — §1/§3'te
  bul ve yaz.
- **opencode'un kendi modeli (kurum Qwen) `gpu-dtx`'te vLLM ile çalışıyor** (Alp; saha 2026-10-15): ns `runai-inference`,
  pod `qwen36-35b-a3b-fp8-00001-deployment-…` (model dizini
  `/models/models--Qwen--Qwen36-35B-A3B-FP8`). **Kesinlikle dokunma** — yeniden başlarsa ajan işin ortasında cevapsız
  kalır. vLLM parametrelerini (`--max-model-len`, `--max-num-seqs`, `--gpu-memory-utilization`) ve Run:ai ayırmasını
  yaz; opencode tarafındaki değerler `./kur.sh kontrol` "ayar" satırında (bağlam / çıktı) ya da opencode `env`'inde.
- **opencode modeli ↔ model kartı** (önerilen vLLM sürümü/bayrakları ile sahadaki değerlerin karşılaştırması): ek dosya §0. Pod `image`
  ve `args`'tan oku; karttan düşükse "model kartı altı" diye yaz (kural değil, DevOps'a öneri).
- **Run:ai kurulu (saha 2026-10-15, doğrulandı):** iş yükleri Run:ai üzerinden zamanlanır (proje kotası, kesirli GPU) → §3'teki
  `nvidia.com/gpu` limiti tek kaynak değil: kesirli ayırma limitte **görünmez** — pod annotation'larında: `runai-allocated-gpus`
  (ör. "0.35"), `runai-allocated-gpu-memory` (MiB), `runai-nodepools`. Değeri **pod adıyla** birlikte al (`gpu-dagilim.py`; `grep -A`
  ile birden çok pod'u karıştırma). Kesirli pod'lar aynı fiziksel GPU'yu paylaşır → gecikmeyi o GPU'daki diğer modellerle birlikte
  değerlendir. Run:ai nesnelerini de listele, yorumu kullanıcıya sor. Başka kümede var mı: `kubectl get ns | grep -i runai`. Saha pod
  listesi: ek dosya §0. Sürüm/sağlık, rezervasyon pod'ları, Run:ai ↔ K8s ↔ GPU Operator matrisi → `rke2-runai`
  (`uyum.py kontrol --rke2 … --gpu-operator … --runai … --gpu H200,L40S`).
- Geçmişte vLLM pod'ları **OOMKilled** oldu; `/dev/shm` boyutu (8 GB olabilir) ve pod bellek limiti belirsiz — §3'te
  mutlaka incele.
- OS ayarı örneği (Alp): `/tmp`'nin inode sayısı artırılıyor — kurumun hedef değeri `[SAHA]`.
- SELinux ve firewalld kurum kararıyla kapalı — bulgu sayma (`engine/AGENTS.md` "Kurum sunucu gerçekleri").

**Erişim (Alp, 2026-10-14):** `engine/AGENTS.md` "SSH ve Kubernetes erişimi" kalıbı (`rke2-denetim` §0) — kubectl master'a ssh ile:
`ssh root@<master1> "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml …"`; OS komutları `ssh root@<node>`
(master ve worker'ların hepsine ssh açık). Node adlarını envanterden (`ansible/inventories/`) oku, tahmin etme. Aşağıdaki
`kubectl …` satırlarının hepsi bu kalıpla çalışır.

### Canlı ortam — yalnız okuma (Alp, 2026-10-14)

Kümeler canlı. Amaç **öğrenmek**: yalnız durum okuyan komut çalıştır. Yük bindiren test (`fio`, `dd`, benchmark,
`stress`), `kubectl exec`, pod/node üzerinde herhangi bir değişiklik **yok** — gerekirse öneri olarak yaz.

### Bağlamı koru

Sahadaki model uzun oturumda öncekini unutur ve sayı uydurur (saha G20, G22). Bu yüzden:

- Her komutun çıktısını sınırla (`--tail`, `head`, `grep`, `custom-columns`); tam `-o yaml`'ı yalnız tek pod için al.
- Tek node / tek pod ile başla, sonra diğerine geç. Katman bitince **en fazla 5 satır ara özet** yaz; sonraki katmanda
  ham çıktıyı tekrar etme, ara özete dayan.
- İki küme varsa önce birini bitir (önerilen: `gpu-dtx`), raporu ver, sonra diğerine geç.

### Akış

**Temel küme katmanları (sürüm matrisi, control plane, node NotReady, Antrea, OS) `rke2-denetim` becerisinde** — önce onu uygula
(en azından `rke2-denetim` §1 sürüm envanteri ve §4 node durumu); bu bölüm GPU'ya özgü katmanları ekler.

Katman katman git, her katmanda **kanıt topla → değerlendir**. Bir katmanda ❌ varsa sonrakine geçmeden önce kullanıcıya
söyle (ör. operator bozuksa pod ayarını tartışmak boşa).

1. Küme ve GPU node'ları  2. GPU Operator  3. Pod'lar (vLLM)  4. Node işletim sistemi  5. Depolama `/models`
6. Ölçüm (yük altında)  7. Rapor

### 1. Küme ve GPU node'ları

```bash
kubectl config current-context
kubectl get nodes -o wide
kubectl get nodes -l nvidia.com/gpu.present=true -L nvidia.com/gpu.product,nvidia.com/gpu.count
kubectl describe node <gpu-node> | sed -n '/Taints/,/Events/p'   # taint, Allocatable, Allocated resources
```

- **Node'un tam `-o yaml`'ını alma** — yüzlerce `feature.node.kubernetes.io/cpu-cpuid.*` etiketi bağlamı doldurur
  (saha G50). Gerekeni seçerek al:
  ```bash
  kubectl get node <gpu-node> -o jsonpath='{.metadata.labels}' | tr ',' '\n' | grep -e 'nvidia.com/' -e runai | head -40
  kubectl get node <gpu-node> -o jsonpath='{.status.capacity}'; echo     # memory Ki cinsinden — GiB'e çevirirken hesabı göster
  ```
- **Sürümler kümeden okunur, tahmin edilmez; sapma ilk bulgu:** `get nodes -o wide`'daki VERSION (`v1.xx.y+rke2rN`) / OS-IMAGE /
  KERNEL-VERSION / CONTAINER-RUNTIME sütunlarında GPU node'u diğerlerinden farklıysa ilk özete yaz (`rke2-denetim` §1). Rancher →
  `kubectl -n cattle-system get deploy cattle-cluster-agent -o jsonpath='{.spec.template.spec.containers[0].image}'` (ajan imaj
  etiketi, genel).
  Uyumluluk yorumu yalnız `surum-uyum`'daki veri tablosundan.
- **Üretici matrisi — NVIDIA GPU Operator "Platform Support"** (sürüme özel sayfa; operator sürümünü kümeden oku): RKE2/Kubernetes
  aralığı, RHEL, GPU (H200/B300) ve sürücü listesi **yalnız betikten** — `uyum.py kontrol --gpu-operator <v> --surucu <v> --gpu H200,B300
  --rke2 … --rhel …`; buraya liste kopyalama (v25.3.4 kaydı: ek dosya §0). Listede olmayan (ör. RHEL 9.8, K8s 1.34) → "NVIDIA doğrulama
  listesinde yok — destek kapsamı dışı olabilir", çalışmaz demek değil.
- `nvidia.com/gpu.*` etiketlerini GPU Feature Discovery koyar (genel). Etiket yoksa operator'ün GFD bileşenine bak (§2).
- `Allocatable` içindeki `nvidia.com/gpu` sayısı = node'daki fiziksel GPU sayısı mı? Karşılaştır: node'da `nvidia-smi -L | wc -l`.
- GPU node'unda taint var mı? Yoksa GPU'suz iş yükleri de oraya düşebilir — bulgu olarak yaz (genel).
- `gpu-dtx`'te L40S VM node'ları da GPU node'u olarak görünür: ürün adı etiketinden H200 ile ayır; vLLM pod'larının
  hangisinde çalıştığını §3'teki `NODE` sütunundan doğrula.

### 2. NVIDIA GPU Operator

```bash
kubectl get pods -A -o wide | grep -i -e gpu-operator -e nvidia        # namespace'i buradan öğren
kubectl get clusterpolicies.nvidia.com
kubectl get clusterpolicies.nvidia.com -o yaml | sed -n '/^  spec:/,/^  status:/p' | head -120
kubectl get clusterpolicies.nvidia.com -o jsonpath='{.items[*].status.state}'; echo
```

Bakılacaklar:

| Ne | Nasıl | İyi |
|---|---|---|
| Durum | `status.state` | `ready` |
| Bileşen pod'ları | driver, container-toolkit, device-plugin, dcgm-exporter, gpu-feature-discovery, operator-validator | hepsi `Running`/`Completed`, restart artmıyor |
| Sürücü kimde | `spec.driver.enabled` + host'ta `rpm -qa \| grep -i -e nvidia -e cuda \| head` | `true` = sürücüyü operator kurar (driver pod'u); `false` = host'a kurulu. Host'ta `nvidia-smi` çalışıyor (Alp) — hangisi olduğunu bu iki kanıtla yaz; ikisi birden olmamalı (genel) |
| GPU paylaşımı | `spec.devicePlugin.config` → ConfigMap, `timeSlicing` / `replicas`; device-plugin `sharing-strategy` | Varsa yaz: bir GPU birden çok pod'a bölünüyor; vLLM için genelde istenmez (genel). `sharing-strategy: none` olsa da Run:ai kesirli GPU (`runai-allocated-gpus`) ayrıca paylaştırır — "GPU paylaşımı yok" yazmadan önce Run:ai annotation'larına bak (saha G52) |
| MIG | `spec.mig.strategy`, node etiketi `nvidia.com/mig.config` | Bilinçli mi? Kullanıcıya sor |
| DCGM | `spec.dcgmExporter.enabled` ve `spec.dcgm.enabled` **ayrı** alanlar | Metrik için bakılacak `dcgmExporter`; `dcgm.enabled: false` yalnız ayrı DCGM hostengine'in kapalı olduğunu söyler, "metrik yok" demek değildir (genel; saha G52) |
| Validator | `kubectl logs -n <ns> <nvidia-operator-validator-…> --all-containers --tail=50` | hata yok (`Could not create symlink … file exists` uyarısı zararsız — genel) |
| Restart | `get pods -n <ns> -o wide` RESTARTS sütunu; sebep: `describe pod` → `Last State`, `logs --previous` | Artmıyor. **OOM yalnız `Reason: OOMKilled` / `Exit Code: 137`** ise denir; `Reason: Error, Exit Code: 2` + loglarda `panic at …go:NN` = programın kendi hatası (Go panic) — "bellek limiti düşük" deme (saha G59). |

Sürüm (operator, sürücü, CUDA) **tahmin edilmez** — pod imaj etiketinden ve `nvidia-smi` başlığından oku.

### 3. Pod'lar (vLLM)

**Önce dağılım tablosu — `gpu-dagilim.py`** (saha G51/G52/G59: `grep -A` ile pod alanları karıştı, aynı pod'lar bir raporda
"0.35 GPU" diğerinde "1 GPU" yazıldı, çelişen bayrak ve shm elle arandı):

```bash
ssh root@<master> "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes,pods -A -o json" | python3 /root/ai/opencode/knowledge/skills/approved/rke2-gpu/gpu-dagilim.py -
```

Basar: GPU node'u başına ürün/kapasite/ayrılabilir, Running iş pod'larına ayrılan toplam (Run:ai rezervasyonu ayrı); GPU kullanan
**her pod tek blokta**: GPU limiti, Run:ai annotation'ları (`runai-allocated-gpus`, `…-gpu-memory`), scheduler, bellek limiti,
`/dev/shm` sizeLimit, vLLM parametreleri (tp, pp, max-model-len, gpu-memory-utilization, max-num-seqs), `NCCL_*`/`CUDA_VISIBLE_*`,
restart + son çıkış; ⚠ tp×pp ≠ GPU limiti, çelişen `--x/--no-x`, çok GPU'lu pod'da shm sınırsız. Değerleri **pod adıyla** aynen aktar.
Ayrıntı için aşağıdaki komutlarla tek pod'a in.

GPU isteyen pod'ları bul (elle):

```bash
kubectl get pods -A -o custom-columns='NS:.metadata.namespace,POD:.metadata.name,NODE:.spec.nodeName,GPU:.spec.containers[*].resources.limits.nvidia\.com/gpu,QOS:.status.qosClass' | awk 'NR==1 || $4!="<none>"'
kubectl get pod <pod> -n <ns> -o yaml          # tek pod'un tam tanımı — aşağıdaki listeyi buna göre doldur
kubectl describe pod <pod> -n <ns> | sed -n '/Last State/,/Ready/p;/Events/,$p'
```

Her vLLM pod'u için (kanıt = yaml'daki alan):

- **GPU sayısı ↔ vLLM paralelliği:** `limits.nvidia.com/gpu` = `--tensor-parallel-size` × `--pipeline-parallel-size`
  (pod `args`/`command`). Fazlaysa GPU boşta kilitli, azsa başlamaz (genel).
- **CPU:** CPU `limit` var mı? Varsa kısıtlama (throttling) ölç: `rhel-sorun` "CPU gecikmesi" a) — `cpu.stat`
  `nr_throttled` artıyorsa GPU'yu besleyen iş parçacıkları bekliyor. `requests` = `limits` ise QoS `Guaranteed`.
- **Bellek:** `limits.memory`. Ağırlık yükleme ve vLLM'in CPU tarafı (`--swap-space`, varsayılanı GPU başına GiB
  düzeyinde — sürümde `--help` ile oku) host RAM'i kullanır. Geçmişte `OOMKilled` (`Last State`) var mı?
- **`/dev/shm` (Alp: mutlaka incele — geçmişte OOMKilled):**
  - Yaml'da `volumes` → `emptyDir: {medium: Memory, sizeLimit: …}` ve `volumeMounts` → `/dev/shm` var mı, `sizeLimit` kaç?
    Birden çok GPU'lu (tensor parallel) pod'da yoksa konteynerin küçük varsayılan shm'si NCCL'i bozar (genel; vLLM
    belgesi `--ipc=host`/büyük shm ister).
  - **Bellek tabanlı emptyDir'e yazılan veri pod'un bellek hesabına sayılır** (genel, Kubernetes belgesi): shm kullanımı +
    süreç belleği `limits.memory`'yi aşarsa pod OOMKilled olur → `sizeLimit` ile `limits.memory`'yi **birlikte** değerlendir.
    `sizeLimit` yoksa tmpfs boyutu pod'un bellek limitine, o da yoksa node'un ayrılabilir belleğine eşitlenir (genel, Kubernetes
    `SizeMemoryBackedVolumes`) — limitsiz pod node'daki diğer pod'ları riske atar. tp=1 pod'da NCCL shm'yi az kullanır (tahmin);
    risk asıl tp>1 pod'larında. Ölçmeden "OOM olur" deme: `df` ile shm doluluğu + `kubectl top pod`.
  - Gerçek boyutu pod'a girmeden, node'dan oku (okuma):
    ```bash
    kubectl get pod <pod> -n <ns> -o jsonpath='{.metadata.uid}'; echo
    ssh root@<gpu-node> "findmnt -t tmpfs | grep <pod-uid>; df -h /var/lib/kubelet/pods/<pod-uid>/volumes/kubernetes.io~empty-dir/*"
    ```
  - OOMKilled kanıtı: `describe pod` → `Last State: Terminated, Reason: OOMKilled` + restart sayısı; node'da
    `journalctl -k --since -7d | grep -i -e oom -e "memory cgroup" | tail -20`.
- **hostPath `/models`:** host'ta yazılabilir olması normal (kopyalama oradan yapılıyor). Pod tarafında `readOnly: true`
  önerilebilir (genel; vLLM yalnız okur) — mevcut değeri yaz. `type`, pod'un H200'e sabitlenme yöntemi
  (`nodeSelector` / `affinity` / `tolerations`) ve namespace PSA istisnası (`rke2-kurulum`).
- **Prob'lar:** model yüklemesi dakikalar sürebilir. `startupProbe` yok ve `livenessProbe` erken başlıyorsa pod yükleme
  sırasında öldürülür → `CrashLoopBackOff`. `initialDelaySeconds`/`failureThreshold`'u gerçek yükleme süresiyle karşılaştır.
- **Çelişen bayraklar:** aynı args'ta hem `--enable-X` hem `--no-enable-X` (ör. `--no-enable-prefix-caching` +
  `--enable-prefix-caching`, saha G59/G77) → bulgu; hangisinin geçerli olduğunu pod logundaki vLLM açılış satırından oku
  (`non-default args` / `enable_prefix_caching=`) — argparse kuralından ("sonuncu kazanır") çıkarım yapma.
- **vLLM parametreleri** (değerini yaz, iş yükü bilinmeden "yanlış" deme): `--gpu-memory-utilization`,
  `--max-model-len`, `--max-num-seqs`, `--tensor-parallel-size`, `--dtype`/`--quantization`, `--enforce-eager`.
- **Ortam değişkenleri:** `CUDA_VISIBLE_DEVICES`/`NVIDIA_VISIBLE_DEVICES` elle verilmişse device plugin'in atamasıyla
  çakışabilir — neden verildiğini sor (genel). `NCCL_*` değişkenlerini **pod adıyla** listele. `NCCL_P2P_DISABLE=1` NVLink/NVSwitch'li
  node'da (`topo -m` → `NV#`) P2P taşımasını kapatır (NCCL belgesi: "disables the peer to peer (P2P) transport"); tensor parallel
  trafiği host belleği üzerinden gider (genel). Bulgu olarak yaz ve **neden konduğunu sor** — bir hatayı aşmak için bilinçli konmuş
  olabilir; "kaldırın" deme, etkisini **ölçmeden** "kayıp var" yazma (saha G77). Etkisi yalnız tp>1 / pp>1 pod'larda.
- **GPU belleği %90+ normaldir:** vLLM `--gpu-memory-utilization` kadarını baştan ayırır (genel) — doluluk sorun değil.
- **Restart sayısı ve son loglar:** `kubectl logs <pod> -n <ns> --tail=200 | grep -i -e error -e warn -e "out of memory" -e weights`
  — ağırlık yükleme süresini veren satır (`/models` hızı için §5).

### 4–6. GPU node işletim sistemi · Depolama `/models` · Ölçüm → ek dosya

Komutlar ve yorum satırları ek dosyada (§4 GPU/sürücü, Xid, CPU/bellek/NUMA, `/tmp` inode · §5 `/models` · §6 ölçüm) — o katmana
gelince **önce oku**. Dosyayı okumadan da geçerli kurallar:

- **Xid:** kodu, tarihi, sayısı ve satırdaki `pid=…, name=…`'yi raporla; pid'i o saatteki pod/modelle eşlemeden "GPU arızalı" deme.
  "Hep aynı GPU" kalıbı, o GPU'ya hep aynı iş yükü düşüyorsa uygulama hatasını da aynı biçimde gösterir (saha G77). Kodun anlamını
  uydurma — kaynak NVIDIA *XID Catalog*.
- `dcgmi diag` GPU'yu meşgul eder → **değişiklik** sayılır (bakım penceresi + kullanıcı onayı).
- Frekans yöneticisini yalnız `scaling_governor` dosyasından yaz (saha G52). `tuned`, governor, THP: değeri raporla; kurum hedefi
  `[SAHA]` — tek başına "yanlış" deme.
- `/models`: `fio` / `dd` / benchmark **yok**, `du` çalıştırma; okuma hızının tek ölçüsü vLLM logundaki ağırlık yükleme süresi (§3).
- Ölçüm: `nvidia-smi` GPU kullanım %'si doygunluk değildir; bekleyen istek büyürken GPU kullanımı düşükse darboğaz GPU dışında —
  "GPU yetmiyor" demeden önce ayır. Metrik adlarını ezberden yazma.

### 7. Sonuç (ekrana — dosya/rapor üretme gerekmez, Alp)

Katman başına kısa satırlar; her satırda **kanıt** (komut + ilgili çıktı satırı):

```
GPU kümesi denetimi — <bağlam> · <tarih>
Node <ad>: H200 × <n> (nvidia-smi -L), sürücü <sürüm>, operator ready
✅ GPU Operator: tüm bileşenler Running, validator temiz
⚠️ vllm-<x>: CPU limit 8, cpu.stat nr_throttled 10 sn'de +412 → kısıtlanıyor
❌ vllm-<y>: 4 GPU istiyor, --tensor-parallel-size 2 → 2 GPU boşta
⚠️ /dev/shm emptyDir yok (tensor parallel 4)
ℹ️ tuned: throughput-performance · THP: always · kurum hedefi [SAHA]
Öneriler (uygulanmadı): … — her birinde etkisi ve yeniden başlatma gerekip gerekmediği
Açık kalanlar: [SAHA] … 
```

- "(genel)" kaynaklı maddeleri **öneri** bölümüne yaz; kurum kararı gibi sunma.
- Sayıları birden çok node/pod için tablo halinde topluyorsan her değerin hangi komuttan geldiğini koru; iki node'da
  birebir aynı değer görürsen kopyalama hatası olabilir — tekrar ölç (saha G22).

### Yapmayacakların (hepsi değişiklik — onay ve yetki ister, bu beceri uygulamaz)

- `nvidia-smi -pm/-pl/-ac/-r/-mig`, `nvidia-smi --gpu-reset` — güç/saat/MIG/sıfırlama
- vLLM pod'unu silme/yeniden başlatma — model yeniden yüklenir, dakikalarca kesinti
- `kubectl drain/cordon` GPU node'u, ClusterPolicy'yi düzenleme, operator/sürücü yükseltme
- `tuned-adm profile`, sysctl, kubelet argümanı, `/tmp` düzeni değişikliği — öneri olarak yaz
- `/models` üzerinde herhangi bir test, `mdadm` değişikliği (`rhel-depolama` A §8)
- `kubectl exec` (pod içine girmek) — gereken bilgiyi yaml'dan, loglardan ve node'dan oku
