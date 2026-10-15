---
name: gpu-kume-denetim
description: GPU kümesini ve fiziksel GPU worker'ını (H200, ileride B300) uçtan uca denetlerken kullan — NVIDIA GPU Operator, vLLM pod'larının kaynak/limit ayarı, hostPath /models, işletim sistemi optimizasyonu, NVMe RAID10. "gpu", "h200", "b300", "nvidia", "gpu operator", "vllm", "model sunucusu", "/models", "gpu kümesi", "gpu performans", "dcgm", "nvlink", "fabric manager", "gpu iyi mi konfigüre", "limitler doğru mu" isteklerinde tetiklenir. Yalnız okur; değişiklik önerir, uygulamaz.
---

Doğrulama: Doktor'un makinesinde GPU ve küme yok — komutlar sahada **ilk kullanımda** doğrulanacak.
Bir bayraktan emin değilsen önce `--help` / `nvidia-smi --help-query-gpu` çıktısını oku, ezberden yazma.
Kaynak etiketi: **(Alp)** = kurum bilgisi · **(genel)** = NVIDIA/vLLM/Kubernetes genel bilgisi, sahada
doğrulanmadı — raporda "öneri" olarak yaz, "kural" olarak değil.

## 0. Ortam (Alp, 2026-10-14)

- Rancher → RKE2 kümeleri; her kümede 3 master + worker'lar (sanal ya da fiziksel). İşletim sistemi genelde RHEL 9.
- **İki GPU kümesi:**
  - `gpu-prod` — prod Rancher'ın (`rke-prod.<kurum>`) altında; **3 fiziksel H200** worker.
  - `gpu-dtx` — nonprod Rancher'ın (`rke-nonprod.<kurum>`) altında (dev/test/prep = `d`/`t`/`x`); **1 fiziksel H200**
    (`h200w1`) + **L40S'li VM worker'lar** (VMware sanallaştırması).
  - `gpu-dtx` node'ları (saha `get nodes -o wide`, 2026-10-15): `sdlgpumaster1-3` (control-plane), `sdlgpuworker1-3`
    (rol etiketi `runai-system`, **GPU etiketi yok** — L40S bunlarda mı `[SAHA]`), `sdlgpuh200w1` (rol `runai-system`,
    `NVIDIA-H200` × 8). H200 node'u o gün **RKE2 v1.32.6 / RHEL 9.4 / containerd 2.0.5**, diğerleri v1.33.13 / 9.6 / 2.2.5
    — sapmayı her incelemede yeniden oku (`kume-denetim` §1); 9.4 bilinçli olabilir (Satellite'ta 9.4 CV'si var, Alp).
  - **Şimdilik yalnız `gpu-dtx` incelenir** (Alp, 2026-10-14). `gpu-prod`'a Alp açıkça istemedikçe komut çalıştırma.
- Worker'lar (H200 fiziksel ve L40S VM'ler) RKE2 kümesinin worker node'larıdır — **ikisi de denetim kapsamında.** VM
  worker'da ayrıca hipervizör etkisine bak (`performans` §3 `%steal`) ve GPU'nun VM'e nasıl verildiğini
  (`nvidia-smi -q` ürün/sanallaştırma alanları) yaz.
- B300 yakında gelecek. NVIDIA GPU Operator iki kümede de çalışıyor. H200 host'unda (RHEL 9) `nvidia-smi` çalışıyor.
- Node RAM'i ~1 TB (H200 sunucusu).
- `/models`: host'ta NVMe RAID10 (+2 yedek) → LVM → xfs, ~10 TB; **yazılabilir** — modelleri ekip NFS ya da scp ile
  kopyalıyor. Ayrıntı: 16 × 1.7 TB NVMe, 12'si yazılım RAID10 (mdadm), 2'si yedek — `depolama` §8; LV düzeni
  (`vg_gpu` → `lv_models`, xfs `noatime`) — `rke2-ansible` "Elle worker ekleme".
- vLLM pod'ları modelleri **hostPath `/models`** ile okur. Neden hostPath: eskiden `nfs-sc` StorageClass kullanılıyordu;
  blok StorageClass yok, Longhorn kurulu değil ve tercih edilmiyor → tek seçenek hostPath. Sonuç: model açılışı
  ~45 dk'dan saniyeler düzeyine indi. hostPath'i "kötü uygulama" diye bulgu yazma — bilinçli kurum kararı.
- vLLM deployment'ları fiziksel H200'e sabitleniyor; yöntem (nodeSelector mı taint/toleration mı) `[SAHA]` — §1/§3'te
  bul ve yaz.
- **opencode'un kendi modeli (kurum Qwen) bu GPU kümelerinden birinde vLLM ile çalışıyor** (Alp; hangi küme `[SAHA]`).
  O pod'u bulursan (imaj/args'ta model adı, `env` dosyasındaki `MODEL_ID` ile eşle): **kesinlikle dokunma** — yeniden
  başlarsa ajan işin ortasında cevapsız kalır. Args'ındaki `--max-model-len`, `--max-num-seqs`,
  `--gpu-memory-utilization` değerlerini yaz ve opencode `env`'deki `KURUM_MAX_CONTEXT` / `KURUM_MAX_OUTPUT` ile
  karşılaştır (uyuşmazlık = opencode ayarı önerisi; saha G2).
- **Run:ai olabilir:** kurum Qwen ucunun adı `runai.gpudtx.<kurum>` (saha `kur.sh kontrol`, 2026-10-15) — tahmin: `gpu-dtx`'te
  NVIDIA Run:ai kurulu. Doğrula: `kubectl get ns | grep -i runai`. Varsa iş yükleri Run:ai üzerinden zamanlanır (proje
  kotası, kesirli GPU) — §3'teki `nvidia.com/gpu` limiti tek kaynak olmayabilir; Run:ai nesnelerini de listele, yorumu
  kullanıcıya sor.
- Geçmişte vLLM pod'ları **OOMKilled** oldu; `/dev/shm` boyutu (8 GB olabilir) ve pod bellek limiti belirsiz — §3'te
  mutlaka incele.
- OS ayarı örneği (Alp): `/tmp`'nin inode sayısı artırılıyor — kurumun hedef değeri `[SAHA]`.
- SELinux ve firewalld kurum kararıyla kapalı — bulgu sayma (`engine/AGENTS.md` "Kurum sunucu gerçekleri").

**Erişim (Alp, 2026-10-14):** kubectl, kümenin master node'larından birine ssh ile bağlanıp orada çalıştırılır —
`engine/AGENTS.md` "SSH ve Kubernetes erişimi" kalıbı:
`ssh root@<master1> "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml …"`.
Master ve worker'ların hepsine ssh açık; OS komutları için `ssh root@<node>`. Master/worker adlarını envanterden
(`ansible/inventories/`) oku, tahmin etme. Aşağıdaki `kubectl …` satırlarının hepsi bu kalıpla çalışır.

## Canlı ortam — yalnız okuma (Alp, 2026-10-14)

Kümeler canlı. Amaç **öğrenmek**: yalnız durum okuyan komut çalıştır. Yük bindiren test (`fio`, `dd`, benchmark,
`stress`), `kubectl exec`, pod/node üzerinde herhangi bir değişiklik **yok** — gerekirse öneri olarak yaz.

## Bağlamı koru

Sahadaki model uzun oturumda öncekini unutur ve sayı uydurur (saha G20, G22). Bu yüzden:

- Her komutun çıktısını sınırla (`--tail`, `head`, `grep`, `custom-columns`); tam `-o yaml`'ı yalnız tek pod için al.
- Tek node / tek pod ile başla, sonra diğerine geç. Katman bitince **en fazla 5 satır ara özet** yaz; sonraki katmanda
  ham çıktıyı tekrar etme, ara özete dayan.
- İki küme varsa önce birini bitir (önerilen: `gpu-dtx`), raporu ver, sonra diğerine geç.

## Akış

**Temel küme katmanları (sürüm matrisi, control plane, node NotReady, Antrea, OS) `kume-denetim` becerisinde** —
önce onu uygula (en azından §1 sürüm envanteri ve §4 node durumu), bu beceri GPU'ya özgü katmanları ekler.

Katman katman git, her katmanda **kanıt topla → değerlendir**. Bir katmanda ❌ varsa sonrakine geçmeden önce kullanıcıya
söyle (ör. operator bozuksa pod ayarını tartışmak boşa).

1. Küme ve GPU node'ları  2. GPU Operator  3. Pod'lar (vLLM)  4. Node işletim sistemi  5. Depolama `/models`
6. Ölçüm (yük altında)  7. Rapor

## 1. Küme ve GPU node'ları

```bash
kubectl config current-context
kubectl get nodes -o wide
kubectl get nodes -l nvidia.com/gpu.present=true -L nvidia.com/gpu.product,nvidia.com/gpu.count
kubectl describe node <gpu-node> | sed -n '/Taints/,/Events/p'   # taint, Allocatable, Allocated resources
```

- **Sürümler küme üzerinden okunur, tahmin edilmez:** RKE2/Kubernetes → `get nodes` `VERSION` sütunu
  (`v1.xx.y+rke2rN` biçimi); Rancher → `kubectl -n cattle-system get deploy cattle-cluster-agent -o
  jsonpath='{.spec.template.spec.containers[0].image}'` (ajan imaj etiketi, genel). Nonprod Rancher ekranı (2026-10-15):
  Rancher v2.14.3, `gpu-dtx` v1.33.13+rke2r1 — yine de okunan değeri yaz. Uyumluluk yorumu yalnız `rke2-ansible`'daki veri tablosundan.
- `nvidia.com/gpu.*` etiketlerini GPU Feature Discovery koyar (genel). Etiket yoksa operator'ün GFD bileşenine bak (§2).
- `Allocatable` içindeki `nvidia.com/gpu` sayısı = node'daki fiziksel GPU sayısı mı? Karşılaştır: node'da `nvidia-smi -L | wc -l`.
- GPU node'unda taint var mı? Yoksa GPU'suz iş yükleri de oraya düşebilir — bulgu olarak yaz (genel).
- `gpu-dtx`'te L40S VM node'ları da GPU node'u olarak görünür: ürün adı etiketinden H200 ile ayır; vLLM pod'larının
  hangisinde çalıştığını §3'teki `NODE` sütunundan doğrula.

## 2. NVIDIA GPU Operator

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
| GPU paylaşımı | `spec.devicePlugin.config` → ConfigMap, `timeSlicing` / `replicas` | Varsa yaz: bir GPU birden çok pod'a bölünüyor; vLLM için genelde istenmez (genel) |
| MIG | `spec.mig.strategy`, node etiketi `nvidia.com/mig.config` | Bilinçli mi? Kullanıcıya sor |
| Validator | `kubectl logs -n <ns> <nvidia-operator-validator-…> --all-containers --tail=50` | hata yok |

Sürüm (operator, sürücü, CUDA) **tahmin edilmez** — pod imaj etiketinden ve `nvidia-smi` başlığından oku.

## 3. Pod'lar (vLLM)

GPU isteyen pod'ları bul:

```bash
kubectl get pods -A -o custom-columns='NS:.metadata.namespace,POD:.metadata.name,NODE:.spec.nodeName,GPU:.spec.containers[*].resources.limits.nvidia\.com/gpu,QOS:.status.qosClass' | awk 'NR==1 || $4!="<none>"'
kubectl get pod <pod> -n <ns> -o yaml          # tek pod'un tam tanımı — aşağıdaki listeyi buna göre doldur
kubectl describe pod <pod> -n <ns> | sed -n '/Last State/,/Ready/p;/Events/,$p'
```

Her vLLM pod'u için (kanıt = yaml'daki alan):

- **GPU sayısı ↔ vLLM paralelliği:** `limits.nvidia.com/gpu` = `--tensor-parallel-size` × `--pipeline-parallel-size`
  (pod `args`/`command`). Fazlaysa GPU boşta kilitli, azsa başlamaz (genel).
- **CPU:** CPU `limit` var mı? Varsa kısıtlama (throttling) ölç: `cekirdek-teshis` "CPU gecikmesi" a) — `cpu.stat`
  `nr_throttled` artıyorsa GPU'yu besleyen iş parçacıkları bekliyor. `requests` = `limits` ise QoS `Guaranteed`.
- **Bellek:** `limits.memory`. Ağırlık yükleme ve vLLM'in CPU tarafı (`--swap-space`, varsayılanı GPU başına GiB
  düzeyinde — sürümde `--help` ile oku) host RAM'i kullanır. Geçmişte `OOMKilled` (`Last State`) var mı?
- **`/dev/shm` (Alp: mutlaka incele — geçmişte OOMKilled):**
  - Yaml'da `volumes` → `emptyDir: {medium: Memory, sizeLimit: …}` ve `volumeMounts` → `/dev/shm` var mı, `sizeLimit` kaç?
    Birden çok GPU'lu (tensor parallel) pod'da yoksa konteynerin küçük varsayılan shm'si NCCL'i bozar (genel; vLLM
    belgesi `--ipc=host`/büyük shm ister).
  - **Bellek tabanlı emptyDir'e yazılan veri pod'un bellek hesabına sayılır** (genel, Kubernetes belgesi): shm kullanımı +
    süreç belleği `limits.memory`'yi aşarsa pod OOMKilled olur. Yani `sizeLimit` ile `limits.memory`'yi **birlikte**
    değerlendir; limit yoksa pod node belleğiyle (~1 TB) sınırlıdır — bu da node'daki diğer pod'ları riske atar.
  - Gerçek boyutu pod'a girmeden, node'dan oku (okuma):
    ```bash
    kubectl get pod <pod> -n <ns> -o jsonpath='{.metadata.uid}'; echo
    ssh root@<gpu-node> "findmnt -t tmpfs | grep <pod-uid>; df -h /var/lib/kubelet/pods/<pod-uid>/volumes/kubernetes.io~empty-dir/*"
    ```
  - OOMKilled kanıtı: `describe pod` → `Last State: Terminated, Reason: OOMKilled` + restart sayısı; node'da
    `journalctl -k --since -7d | grep -i -e oom -e "memory cgroup" | tail -20`.
- **hostPath `/models`:** host'ta yazılabilir olması normal (kopyalama oradan yapılıyor). Pod tarafında `readOnly: true`
  önerilebilir (genel; vLLM yalnız okur) — mevcut değeri yaz. `type`, pod'un H200'e sabitlenme yöntemi
  (`nodeSelector` / `affinity` / `tolerations`) ve namespace PSA istisnası (`rke2-ansible`).
- **Prob'lar:** model yüklemesi dakikalar sürebilir. `startupProbe` yok ve `livenessProbe` erken başlıyorsa pod yükleme
  sırasında öldürülür → `CrashLoopBackOff`. `initialDelaySeconds`/`failureThreshold`'u gerçek yükleme süresiyle karşılaştır.
- **vLLM parametreleri** (değerini yaz, iş yükü bilinmeden "yanlış" deme): `--gpu-memory-utilization`,
  `--max-model-len`, `--max-num-seqs`, `--tensor-parallel-size`, `--dtype`/`--quantization`, `--enforce-eager`.
- **Ortam değişkenleri:** `CUDA_VISIBLE_DEVICES`/`NVIDIA_VISIBLE_DEVICES` elle verilmişse device plugin'in atamasıyla
  çakışabilir — neden verildiğini sor (genel). `NCCL_*` değişkenlerini listele.
- **Restart sayısı ve son loglar:** `kubectl logs <pod> -n <ns> --tail=200 | grep -i -e error -e warn -e "out of memory" -e weights`
  — ağırlık yükleme süresini veren satır (`/models` hızı için §5).

## 4. GPU node işletim sistemi (ssh, okuma)

**GPU ve sürücü:**

```bash
nvidia-smi                                   # sürücü/CUDA sürümü, GPU listesi, süreçler
nvidia-smi --query-gpu=index,name,persistence_mode,temperature.gpu,power.draw,power.limit,clocks.sm,clocks.max.sm,memory.used,memory.total,ecc.errors.uncorrected.volatile.total,pcie.link.gen.current,pcie.link.gen.max,pcie.link.width.current --format=csv
nvidia-smi -q -d PERFORMANCE                 # saat düşürme sebepleri (thermal, power, HW slowdown)
nvidia-smi topo -m                           # GPU↔GPU bağlantısı (NV#), CPU/NUMA yakınlığı
nvidia-smi -q | grep -i -A3 fabric           # NVSwitch'li kartta Fabric State
journalctl -k --since -7d | grep -i -e xid -e nvrm | tail -30
```

- **Fabric Manager (genel):** NVSwitch'li 8 GPU'lu HGX kartta fabric manager çalışmıyorsa GPU'lar arası NVLink
  kullanılamaz, CUDA başlatma hata verir. Sürücü host'taysa `systemctl status nvidia-fabricmanager` (sürümü sürücüyle
  aynı olmalı); operator kuruyorsa driver pod'unun içinde çalışır. H200'ün kart tipi (SXM/HGX mi, PCIe mi) `[SAHA]` —
  `nvidia-smi -q` ürün adı ve `topo -m`'den oku.
- **XID:** her XID bir sürücü/donanım olayıdır; kodu ve tarihi raporla, anlamını uydurma (NVIDIA XID belgesine bak).
- **ECC uncorrected > 0**, sürekli düşük saat, `power.limit` beklenenden düşük → bulgu.
- **PCIe:** boşta `gen.current` güç tasarrufuyla düşer (genel) — karşılaştırmayı **yük altında** yap.

**CPU / bellek / çekirdek:**

```bash
tuned-adm active
cpupower frequency-info -p 2>/dev/null || cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
lscpu | grep -i -e numa -e 'model name' -e '^cpu(s)'
free -g; swapon --show                       # RKE2 için swap kapalı olmalı (rke2-ansible)
cat /sys/kernel/mm/transparent_hugepage/enabled
cat /proc/cmdline                            # iommu, isolcpus, hugepages gibi açılış parametreleri
grep -i -e kubelet-arg -A15 /etc/rancher/rke2/config.yaml
cat /var/lib/kubelet/cpu_manager_state 2>/dev/null
```

- `tuned` profili, CPU frekans yöneticisi (`performance` mı `powersave` mı), THP: değeri **raporla**; kurum hedef
  değeri `[SAHA]` — tek başına "yanlış" deme, kullanıcıya hedefi sor.
- **NUMA (genel):** `topo -m`'deki CPU yakınlığı ile pod'un çalıştığı CPU'lar örtüşüyor mu? kubelet
  `cpu-manager-policy=static` + `topology-manager-policy` (`kubelet-arg`) yoksa pod CPU'ları GPU'ya uzak NUMA'ya düşebilir
  — öneri olarak yaz; değiştirmek kubelet yeniden başlatması ister (K1).

**`/tmp` ve inode (Alp):**

```bash
findmnt /tmp; df -h /tmp; df -i /tmp
```

`IUse%` ve toplam inode'u yaz; kurumun hedef değeri `[SAHA]`. Ayrıca pod'ların cache/geçici dizinleri hostPath ile
host'a bağlıysa (`kubectl get pod -o yaml` → `volumes`) o dizinin `df -i`'sine de bak.

## 5. Depolama `/models`

RAID ve NVMe sağlığı → **`depolama` §8** (mdstat, `mdadm --detail`, yedek sayısı, `nvme smart-log`). Burada ek olarak:

```bash
findmnt /models                              # kaynak lv_models mi, seçenekler (noatime)
df -h /models; df -i /models
lvs -o +devices; vgs
xfs_info /models
mdadm --detail /dev/md<N> | grep -i -e level -e layout -e chunk -e 'array size'
```

- **Okuma hızı:** tek ölçü vLLM'in kendi logundaki ağırlık yükleme süresi (§3). `fio` / `dd` / benchmark **yok**
  (canlı ortam, Alp).
- Kaç model var: `ls /models | head -50` yeterli; `du` büyük dizinde disk okuması yapar, çalıştırma.

## 6. Ölçüm (yük altında)

Boştaki node "iyi" görünür; darboğaz istek varken çıkar.

- **DCGM exporter** (operator'ün parçası) metrikleri Prometheus/Rancher Monitoring'de olabilir — var mı `[SAHA]`.
  `nvidia-smi`'deki GPU kullanım % yalnız "bir kernel çalışıyordu" demektir, doygunluk değildir (genel); varsa
  DCGM'in `PROF` metriklerine bak.
- **vLLM `/metrics`:** çalışan/bekleyen istek sayısı, KV-cache doluluğu. Metrik adları sürüme göre değişir — adları
  ezberden yazma, `curl -s http://<pod-ip>:<port>/metrics | grep -i -e running -e waiting -e cache` çıktısından oku.
- Anlık tur: `nvidia-smi dmon -s pucm -c 10` (10 örnek; güç, kullanım, saat, bellek) + aynı anda `cekirdek-teshis`
  CPU kısıtlaması ölçümü.
- Bekleyen istek kuyruğu büyürken GPU kullanımı düşükse darboğaz GPU dışında (CPU kısıtlaması, tokenizer, ağ) —
  "GPU yetmiyor" demeden önce bunu ayır.

## 7. Sonuç (ekrana — dosya/rapor üretme gerekmez, Alp)

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

## Yapmayacakların (hepsi değişiklik — onay ve yetki ister, bu beceri uygulamaz)

- `nvidia-smi -pm/-pl/-ac/-r/-mig`, `nvidia-smi --gpu-reset` — güç/saat/MIG/sıfırlama
- vLLM pod'unu silme/yeniden başlatma — model yeniden yüklenir, dakikalarca kesinti
- `kubectl drain/cordon` GPU node'u, ClusterPolicy'yi düzenleme, operator/sürücü yükseltme
- `tuned-adm profile`, sysctl, kubelet argümanı, `/tmp` düzeni değişikliği — öneri olarak yaz
- `/models` üzerinde herhangi bir test, `mdadm` değişikliği (`depolama` §8)
- `kubectl exec` (pod içine girmek) — gereken bilgiyi yaml'dan, loglardan ve node'dan oku
