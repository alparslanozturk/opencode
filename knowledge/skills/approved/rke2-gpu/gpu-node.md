# rke2-gpu — ek dosya: GPU node'u (ortam kayıtları, işletim sistemi, depolama, ölçüm)

`rke2-gpu` becerisinin eki. **Yalnız okuma** — SKILL.md'deki "Canlı ortam — yalnız okuma" ve "Yapmayacakların" burada da geçerli: yük
bindiren test, `kubectl exec`, değişiklik yok. § numaraları SKILL.md ile aynıdır (§0–§3 ve §7 SKILL.md'de); `kubectl …` satırları
SKILL.md "Erişim" kalıbıyla çalışır. Yalnız ilgili bölümü oku.

İçindekiler: **§0** ortam — tarihli saha kayıtları (node'lar, H200 donanımı, `/models`, Run:ai pod'ları, opencode modeli ↔ model kartı,
hostPath geçişi, GPU Operator matrisi kaydı) · **§4** GPU node işletim sistemi (GPU/sürücü, Xid, CPU/bellek/NUMA, `/tmp` inode) ·
**§5** depolama `/models` · **§6** ölçüm (yük altında)

## 0. Ortam — tarihli saha kayıtları (o günün gözlemi; bugünkü değeri kümeden oku)

- `gpu-dtx` node'ları (saha `get nodes -o wide`, 2026-10-15): `gpumaster1-3` (control-plane), `gpuworker1-3`
  (rol etiketi `runai-system`, **GPU etiketi yok** — L40S bunlarda mı `[SAHA]`), `h200w1` (rol `runai-system`,
  `NVIDIA-H200` × 8). H200 node'u o gün **RKE2 v1.32.6 / RHEL 9.4 / containerd 2.0.5**, diğerleri v1.33.13 / 9.6 / 2.2.5
  — sapmayı her incelemede yeniden oku (`rke2-denetim` §1); 9.4 bilinçli olabilir (Satellite'ta 9.4 CV'si var, Alp).
- `h200w1` donanımı (saha, 2026-10-15): 2 × AMD EPYC 9575F (256 iş parçacığı, NUMA 0: GPU0-3, NUMA 1: GPU4-7),
  RAM **2266 GiB** (`free -g`), 8 × H200 SXM — NVSwitch, `topo -m` hepsi `NV18`, Fabric `Completed/Success`; sürücü
  580.82.07, CUDA 13.0; `tuned` kurulu değil; THP `always`.
- `/models` ayrıntı: 16 × 1.7 TB NVMe, 12'si yazılım RAID10 (mdadm), 2'si yedek — `rhel-depolama` A §8; LV düzeni
  (`rke2-node-ekle` "Elle worker ekleme" planı). **Sahada (2026-10-15):** `/dev/mapper/vg_models-lv_models` → `/models`,
  xfs, 13T (900G dolu), seçenek `relatime` (`noatime` değil) — planla fark varsa yaz, değiştirme.
- **Run:ai pod'ları (saha 2026-10-15, doğrulandı; kurum Qwen ucunun adı da `runai.gpudtx.<kurum>`):** h200w1'de `runai-inference`
  pod'ları (qwen36-35b, qwen3-14b, qwen3-32b-vlm, qwen3-4b-embd) + `runai-reservation` ns'te 2 `gpu-reservation-<node>-…` pod'u +
  `vllm` ns'te 2 deployment (qwen3-235b: 2 GPU, qwen35-397b: 3 GPU). CPU/RAM isteği `--cpu-core-request/limit`,
  `--cpu-memory-request/limit` (bir pod'da `limit 8Gi` görüldü — hangi pod olduğunu `-o jsonpath` ile pod adıyla birlikte al).
  `-00001-deployment` adı Knative revizyonu olabilir (tahmin).
- **opencode modeli ↔ model kartı (Qwen3.6-35B-A3B-FP8, Hugging Face model kartı, okundu 2026-10-26):** kart
  `vllm>=0.19.0` ister; önerilen bayraklar `--reasoning-parser qwen3`, araç çağrısı için `--enable-auto-tool-choice
  --tool-call-parser qwen3_coder`; isteğe bağlı `--language-model-only` (görüntü kodlayıcısı yüklenmez, KV-cache'e yer —
  opencode yalnız metin), MTP `--speculative-config '{"method":"qwen3_next_mtp","num_speculative_tokens":2}'`; bağlam
  en az 128K tutulmalı (düşünme için). Saha: `--max-model-len 262144`, `--gpu-memory-utilization 0.92`, `--max-num-seqs 16`
  (G52); imaj sürümü ve parser bayrakları bu pod için **bilinmiyor** — pod `image` ve `args`'tan oku, karttan düşükse
  "model kartı altı" diye yaz (kural değil, DevOps'a öneri). Örnekleme opencode tarafında: `engine/opencode.json` model
  `options` (0.6 / 0.95 / 20 / presence 0 — kartın "kod" satırı); vLLM'e dokunmaz.
- **hostPath geçişi (saha 2026-10-15, gpu-dtx):** `runai-inference` pod'ları hostPath `/models` (readOnly), `vllm` namespace pod'ları
  hâlâ **NFS PVC** (`nfs-sc`, ör. `vllm-qwen3-235b-fp8-storage-claim` 250Gi) — DevOps tarafında; kalan PVC tanımları eski, bulgu değil.
- **Sürüm ve restart kaydı (2026-10-15):** nonprod Rancher v2.14.3, `gpu-dtx` v1.33.13+rke2r1 — yine de okunan değeri yaz.
  `node-feature-discovery-worker` pod'ları 270-313 restart (27 günde), `master` 65 → sebebini SKILL.md §2 "Restart" satırındaki kanıtla oku.
- **GPU Operator matrisi kaydı** (sürüme özel sayfa:
  `docs.nvidia.com/datacenter/cloud-native/gpu-operator/<minor>/platform-support.html`; operator sürümünü kümeden oku). **v25.3.4**
  (indirme 2026-10-24, `uyum.py --gpu-operator`): RKE2 **1.29–1.33** ve Kubernetes 1.29–1.33 · RHEL **9.2, 9.4, 9.5, 9.6** ve 8.8, 8.10 ·
  GPU listesinde **HGX H200 / DGX H200 / H200, H200 NVL**, **HGX B300 yok** (25.10'dan itibaren var) · varsayılan sürücü **580.82.07** (D),
  önerilen **580.126.16** (R — NVIDIA 2026-10-21'den sonra "recommended update" ekledi); tam sürücü listesi ve diğer operator sürümleri
  **betikten** (`uyum.py kontrol --gpu-operator <v> --surucu <v> --gpu H200,B300`), buraya liste kopyalama; bilinen sorun: 570.124.06/570.133.20/
  570.148.08/570.158.01 sürücülerinde MIG + tam GPU karışık node'da pod Pending (NVIDIA/gpu-operator#1361). Listede olmayan
  (ör. RHEL 9.8, K8s 1.34) → "NVIDIA doğrulama listesinde yok — destek kapsamı dışı olabilir", çalışmaz demek değil.

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
- **XID → pod eşlemesi:** Xid satırındaki `PCI:0000:29:00` → `nvidia-smi --query-gpu=index,pci.bus_id --format=csv`
  ile GPU numarası; o GPU'daki süreç `nvidia-smi --query-compute-apps=gpu_bus_id,pid,process_name --format=csv`;
  pid → pod: `cat /proc/<pid>/cgroup` (pod UID) → `kubectl get pods -A -o custom-columns=NS:.metadata.namespace,AD:.metadata.name,UID:.metadata.uid | grep <uid>`.
  Aynı GPU + aynı birimde (`GPCCLIENT_…`) tekrar eden Xid + `KGSP`/`nvAssert` satırı → donanım/sürücü olasılığını da
  yaz, ama tek başına "GPU arızalı" deme (tahmin) — NVIDIA/sunucu üreticisi destek kaydı önerisi.
- **Anlık güç/saat yorumlama:** tek okumadaki yüksek güç o anda iş yapan GPU demektir, "anormal" değildir —
  `nvidia-smi dmon -s pucm -c 10` ile zaman içinde bak (§6).
- **XID:** her XID bir sürücü/donanım olayıdır; kodu, tarihi, sayısı ve satırdaki `pid=…, name=…`'yi raporla. Diğer kodların
  anlamını uydurma — kaynak: NVIDIA *XID Catalog* (`docs.nvidia.com/deploy/xid-errors/analyzing-xid-catalog.html`).
- **Xid 31 (MMU fault) — NVIDIA'nın kendi akışı** (XID Catalog, `WORKFLOW_XID_31`, indirme 2026-10-21): "Typically these are
  application-level bugs, but can also be driver bugs or hardware bugs." Ayırt etme: **aynı GPU'da (PCI-ID) tekrar eden** MMU
  fault → `RUN_DCGMEUD` (olası donanım; geçerse field diag) · **farklı GPU'larda** tekrar → uygulama/CUDA (`CHECK_APP`) · tek
  seferlik → uygulama. Önerilen uygulama araçları: Compute Sanitizer memcheck, `CUDA_DEVICE_WAITS_ON_EXCEPTION=1` + cuda-gdb.
  **Tuzak (saha G77, gpu-dtx GPU1 = `29:00`):** "hep aynı GPU" kalıbı, o GPU'ya **hep aynı iş yükü** düşüyorsa uygulama hatasını da
  aynı biçimde gösterir. Yazmadan önce her Xid satırındaki pid'i o saatteki pod/modelle eşle (pid kısa ömürlü — Xid zamanındaki
  `journalctl` satırıyla vLLM pod'unun yeniden başlama zamanını karşılaştır: `kubectl get pod <p> -o jsonpath='{.status.containerStatuses[0].lastState.terminated}'`).
  - Hepsi aynı model/pod ve o pod hep GPU1'de → "uygulama mı donanım mı **ayırt edilemedi** — aynı model başka GPU'da çalışırsa
    belli olur" (tahmin). Farklı modeller GPU1'de aynı hatayı veriyorsa → donanım olasılığı güçlenir (yine tahmin).
  - Kanıt sırası: ECC/row remap (`nvidia-smi -q -d ECC,ROW_REMAPPER`, `retired pages`) → aynı dönemde başka Xid (48/63/64/79/94/95)
    → DCGM tanı (`dcgmi diag -r 3` — **GPU'yu meşgul eder, iş yükünü etkiler**: değişiklik sayılır, bakım penceresi + kullanıcı onayı).
  - "Donanım sorunu ihtimalini güçlendirir" gibi bir cümle yalnız yukarıdaki ayırt etme yapıldıysa; yoksa "olabilir" + eksik kanıt.
- **ECC uncorrected > 0**, sürekli düşük saat, `power.limit` beklenenden düşük → bulgu.
- **PCIe:** boşta `gen.current` güç tasarrufuyla düşer (genel) — karşılaştırmayı **yük altında** yap.

**CPU / bellek / çekirdek:**

```bash
tuned-adm active
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_driver /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>&1
cpupower frequency-info -p 2>/dev/null
lscpu | grep -i -e numa -e 'model name' -e '^cpu(s)'
free -g; swapon --show                       # RKE2 için swap kapalı olmalı (`rke2-kurulum`)
cat /sys/kernel/mm/transparent_hugepage/enabled
cat /proc/cmdline                            # iommu, isolcpus, hugepages gibi açılış parametreleri
grep -i -e kubelet-arg -A15 /etc/rancher/rke2/config.yaml
cat /var/lib/kubelet/cpu_manager_state 2>/dev/null
```

- **Frekans yöneticisini yalnız `scaling_governor` dosyasından yaz.** `lscpu` bayrağındaki `nonstop_tsc` yönetici değildir;
  `CPU(s) scaling MHz: 69%` frekansın değiştiğini gösterir, "scaling yok" demez (saha G52).
- `tuned` profili, CPU frekans yöneticisi (`performance` mı `powersave` mı), THP: değeri **raporla**; kurum hedef
  değeri `[SAHA]` — tek başına "yanlış" deme, kullanıcıya hedefi sor.
- **NUMA (genel):** `topo -m`'deki CPU yakınlığı ile pod'un çalıştığı CPU'lar örtüşüyor mu? kubelet
  `cpu-manager-policy=static` + `topology-manager-policy` (`kubelet-arg`) yoksa pod CPU'ları GPU'ya uzak NUMA'ya düşebilir
  — öneri olarak yaz; değiştirmek kubelet yeniden başlatması ister (onay ekranı).

**`/tmp` ve inode (Alp):**

```bash
findmnt /tmp; df -h /tmp; df -i /tmp
```

`IUse%` ve toplam inode'u yaz; kurumun hedef değeri `[SAHA]`. Ayrıca pod'ların cache/geçici dizinleri hostPath ile
host'a bağlıysa (`kubectl get pod -o yaml` → `volumes`) o dizinin `df -i`'sine de bak.

## 5. Depolama `/models`

RAID ve NVMe sağlığı → **`rhel-depolama` A §8** (mdstat, `mdadm --detail`, yedek sayısı, `nvme smart-log`). Burada ek olarak:

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
- Anlık tur: `nvidia-smi dmon -s pucm -c 10` (10 örnek; güç, kullanım, saat, bellek) + aynı anda `rhel-sorun`
  CPU kısıtlaması ölçümü.
- Bekleyen istek kuyruğu büyürken GPU kullanımı düşükse darboğaz GPU dışında (CPU kısıtlaması, tokenizer, ağ) —
  "GPU yetmiyor" demeden önce bunu ayır.
