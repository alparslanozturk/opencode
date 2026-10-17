---
name: kume-denetim
description: Rancher'ın yönettiği RKE2 kümesini uçtan uca incelerken kullan — sürüm/uyumluluk matrisi, control plane (etcd, apiserver), node NotReady/Unavailable/donma, Antrea/OVS, sistem pod'ları, node OS ve çekirdek; GPU kümesinde ayrıca NVIDIA GPU Operator, vLLM pod limitleri, Run:ai, hostPath /models, H200/B300 node. "kümeyi incele", "kümede neler oluyor", "node unavailable", "notready", "node düşüyor", "donma", "rke2 incele", "rancher kümesi", "antrea", "ovs", "etcd", "control plane", "kube-system", "uyumlu mu", "matris", "gpu", "h200", "b300", "nvidia", "gpu operator", "vllm", "runai", "/models", "dcgm", "nvlink", "limitler doğru mu" isteklerinde tetiklenir. Yalnız okur; değişiklik önerir, uygulamaz.
---

Bu beceri iki bölüm: **A. Temel küme denetimi** (her küme) ve **B. GPU kümesi** (yalnız GPU kümesi — `gpu-dtx`, `gpu-prod`;
önce A'nın §1 sürüm envanteri ve §4 node durumu).

## A. Temel küme denetimi

Doğrulama: Doktor'un makinesinde küme yok — komutlar sahada ilk kullanımda doğrulanacak; emin olmadığın bayrakta
`--help`. Kaynak etiketi: **(Alp)** kurum bilgisi · **(saha G…)** saha gözlemi · **(genel)** Kubernetes/RKE2 genel
bilgisi — "(genel)" maddeyi öneri olarak yaz, kural olarak değil.

### İlkeler (önce oku)

- **Canlı ortam — yalnız okuma** (Alp, 2026-10-14). Reboot, pod/servis yeniden başlatma, drain/cordon, `kubectl exec`,
  event silme yok. Gerekirse **öneri** yaz, en hafif adımdan başlayarak (saha G11: "fiziksel reboot" daha hafif
  adımlar düşünülmeden önerildi).
- **Önce altyapı, sonra uygulama** (Alp, saha G9): altyapı = rke2-server/agent, kubelet, containerd, etcd, apiserver,
  **Antrea/OVS**, CoreDNS, ingress, Rancher ajanları (`cattle-*`), node işletim sistemi/disk/ağ. Uygulama pod'ları
  (milvus, kafka, fluent, prometheus, starburst …) ayrı başlık — Alp ayrıca istemedikçe derine inme.
- **Her sayı ve iddia bir çıktıdan:** "container runtime down", "ağ kopması", "%61 CPU" gibi ifadeler yalnız o turda
  görülen çıktıya dayanır; yoksa "tahmin:" de (saha G7, G8). `kubectl top` `<unknown>` dediyse yüzde yazma.
- **Kanıt reboot'tan önce toplanır:** reboot logları ve bellek durumunu siler (saha G11: wor03 kanıtı kayboldu).
  Kullanıcı reboot edecekse önce §4'teki node komutlarını çalıştırmayı öner.
- **Çok node'a aynı komut → ansible ad-hoc** (tek izin, paralel): `filo-durum-kontrolu` becerisi; node başına ssh
  döngüsü kurma (saha G6). Tek node'u derinlemesine incelerken ssh.
- **Bağlamı koru:** çıktıyı sınırla (`--tail`, `head`, `grep`); katman bitince en fazla 5 satır ara özet; sonraki
  katmanda ham çıktıyı tekrarlama (saha G20/G22).

### 0. Ortam (Alp ve Rancher ekranları, 2026-10-15)

- Nonprod Rancher (`rke-nonprod.<kurum>`) **v2.14.3**. Prod Rancher (`rke-prod.<kurum>`) sürümü `[SAHA]`.
- Nonprod downstream RKE2 kümeleri (`gpu-dtx`, `test`, `test-sasviya`, `peaka-poc`, `vibecode-test`, `devops-utilities`
  …) ve `local`: **v1.33.13+rke2r1**. Anthos (GKE) kümeleri de Rancher'da görünür — bu becerinin kapsamı dışı (`k8s-anthos`).
- **Masterlar ve VM worker'lar VMware üzerinde**; GPU worker'lar (H200) fiziksel sunucu (Alp, 2026-10-15). Bir VM'in
  hangi ESX host'unda/datastore'da olduğu kümeden görünmez → `[SAHA]`, gerekirse kullanıcıdan vCenter bilgisi iste.
- CNI: **Antrea** (OVS veri yolu). İşletim sistemi RHEL (8/9/10 — node başına `get nodes -o wide`'dan oku).
- `test` kümesi: 3 master (`stlranchermas01-03`) + 14 worker (`stlrancherwor01-14`). Worker'ların bir kısmı zaman
  zaman `Unavailable` oluyor. **Yaş kalıbı (Rancher, 2026-10-15):** wor01-03 535 gün, wor04-06 304 gün, wor07-14 **13 gün**
  (son eklenen grup); o gün Unavailable: wor03 (eski grup) + wor08-11 (yeni grup), wor07 yeni ama sağlam. Önce
  karşılaştır: wor07 ↔ wor08 (aynı grup, biri sağlam) ve wor01 ↔ wor03. Önceki kayıtlar: 2026-10-12 wor03/wor12/wor14 (saha G7-G11: wor03/wor14'te OVS transaction timeout),
  2026-10-15 wor03/wor08 Unavailable, wor14'te `antrea-ovs` liveness hatası (Rancher ekranı). **Aynı node'lar
  tekrarlıyor** — kalıp ara (§4).
- Erişim: kubectl → bir master'a ssh, `/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml`
  (`engine/AGENTS.md`). Node'lara ssh açık. Envanter: **çalışma dizinindeki** `ansible/inventories/` — cwd dışında
  (`~/ai`, `/root`) glob'lama, izin kapısı açar (saha G3, G60) (test kümesi grubu `hosts-rke2.ini` içinde,
  ör. `[rke-nonprod-test]` — adı dosyadan oku).

Aşağıda `kubectl …` yazan her satır bu kalıpla çalışır.

### 1. Sürüm envanteri ve uyumluluk

```bash
kubectl get nodes -o wide      # VERSION (RKE2), OS-IMAGE (RHEL minor), KERNEL-VERSION, CONTAINER-RUNTIME — tek komut
kubectl -n kube-system get pods -l app=antrea -o jsonpath='{range .items[*]}{.spec.containers[0].image}{"\n"}{end}' | sort | uniq -c
```

- Node'lar arasında **sapma** var mı: farklı RKE2, RHEL minor, çekirdek, containerd → bulgu (aynı kümede çekirdek farkı
  davranış farkı demektir).
- Rancher sürümü: Rancher arayüzü sol alt ya da downstream'de `kubectl -n cattle-system get deploy cattle-cluster-agent
  -o jsonpath='{.spec.template.spec.containers[0].image}'` (genel).
- **Uyum + destek sonu (EOL) + en son yama kararı betikten:** `python3 /root/ai/opencode/knowledge/skills/approved/yukseltme-plani/uyum.py
  kontrol --rancher … --rke2 … --antrea … --rhel …` — çıktıyı olduğu gibi aktar (`yukseltme-plani`). Güvenlik puan kartı: `guvenlik-saglik`.
- **Uyumluluk yorumu yalnız `rke2-ansible` becerisindeki çevrimdışı matristen** (Rancher ↔ RKE2 ↔ RHEL; Antrea notu
  orada). **Antrea ↔ K8s satırı her raporda zorunlu** (Alp, 2026-10-17: "matris çok önemli, supported olmalı"); Antrea RKE2
  ile gelmez, ayrı yükseltilir — K8s yükseltilip Antrea unutulabilir. Bilinen: `test` Antrea v2.3.0 + 1.33 → ❌ (v2.3 →
  1.29–1.32); saha G65 raporunda bu satır hiç yoktu. Matriste olmayan sürüm → "matriste yok — `--kaydet` ile eklenmeli" de, tahmin etme.

### 2. Control plane

```bash
kubectl get --raw='/readyz?verbose' | grep -v ' ok$' | head        # boşsa hepsi ok; etcd dahil
kubectl -n kube-system get pods -o wide | grep -e etcd -e kube-apiserver -e kube-controller -e kube-scheduler -e cloud-controller
```

Master'da (ssh, okuma):

```bash
systemctl is-active rke2-server; journalctl -u rke2-server --since -3h --no-pager | grep -i -e error -e "took too long" -e leader -e "slow" | tail -30
for f in /var/lib/rancher/rke2/server/tls/*.crt; do printf '%s ' "$f"; openssl x509 -enddate -noout -in "$f"; done | sort -t= -k2 | head
df -h /var/lib/rancher; cat /proc/pressure/io
```

- etcd logunda `apply request took too long` / `slow fdatasync` (genel) → master diski yavaş; `performans` becerisi
  disk bölümü. Üç master'da da aynı mı, tek birinde mi?
- Sertifika (RKE2 docs security/certificates): istemci/sunucu sertifikaları 365 gün geçerli; **120 gün** kala (v1.33.1+rke2r1'den
  beri, öncesi 90) `CertificateExpirationWarning` event'i çıkar ve sertifika **rke2 bir sonraki yeniden başlatmada kendiliğinden
  yenilenir**. Yani uyarı event'i = "bu master uzun süredir yeniden başlamadı", elle rotasyon gerekmez; yükseltme ya da planlı
  restart yeniler (yenileme değişikliktir — öneri). Bulgu eşiği: 30 günden az kaldıysa. **Kalan günü kafadan hesaplama**, komutla:
  `echo $(( ($(date -d "2027-01-09" +%s) - $(date +%s)) / 86400 ))` (saha G65: event'teki 120 gün eşiği "120 gün sonra" diye
  yazıldı; gerçek kalan 84 gündü).

**Control plane kararı (saha G62/G65 — iki kez yanlış "✅" yazıldı):**
- "Control plane ✅" yalnız readyz temiz **ve** her master'a ssh bu turda başarılıysa. Bir master'a ssh banner timeout →
  Control plane **⚠️, en yüksek bulgu** (§4 tablo, §5b). "Geçici" yazmak için sonradan başarılı bir ssh çıktısı gerekir.
- API'deki pod "Running" / node "Ready" donmuş node'da bir süre eski kalır; kubelet canlılığının kanıtı lease
  (genel: ~10 sn'de yenilenir): `kubectl -n kube-node-lease get lease <node> -o jsonpath='{.spec.renewTime}'; date -u`.
- **İnceleme sırasında erişim kaybı** (aynı node'a önce ssh çalıştı, sonra banner timeout) → kullanıcıya hemen söyle;
  2-3 dk sonra **bir kez** daha dene. Hâlâ yoksa donma (§5b: vCenter konsol ekranı reset'ten **önce**); döndüyse kısa takılma
  (§5b "Kısa takılma": olay penceresinin logu — "sorun yok" deme).

### 3. Sistem pod'ları (altyapı)

```bash
kubectl get pods -A -o wide | grep -v -e Running -e Completed | head -30
kubectl get pods -n kube-system -o wide --sort-by='.status.containerStatuses[0].restartCount' | tail -15
kubectl get pods -n cattle-system -o wide; kubectl get pods -n cattle-fleet-system 2>/dev/null | head
```

Altyapı namespace'leri: `kube-system` (antrea, coredns, ingress, metrics), `cattle-system`, `cattle-fleet-*`,
`cattle-monitoring-system` (varsa). Restart sayısı yüksek altyapı pod'u → hangi node'da? (§4'teki kalıpla karşılaştır.)

### 4. Node'lar — NotReady / Unavailable

**Küme tarafı (önce):**

```bash
kubectl get nodes
kubectl describe node <node> | sed -n '/Conditions:/,/Addresses:/p'          # Ready satırının Reason/Message'ı
kubectl get events -A --field-selector involvedObject.kind=Node -o custom-columns='ZAMAN:.lastTimestamp,NODE:.involvedObject.name,NEDEN:.reason' | sort | tail -40
kubectl -n kube-node-lease get lease <node> -o jsonpath='{.spec.renewTime}'; echo
```

Ready mesajını sınıflandır (genel):

| Mesaj | Ne demek | Nereye |
|---|---|---|
| `Kubelet stopped posting node status` / `NodeStatusUnknown` | kubelet API'ye ulaşamıyor ya da duruk | node: rke2-agent, ağ, yük |
| `container runtime is down` / `PLEG is not healthy` | containerd ya da pod yaşam döngüsü takılı | node: containerd, CNI DEL, hung task |
| `NetworkUnavailable` / `network plugin not ready` | CNI hazır değil | antrea-agent / OVS |
| `MemoryPressure` / `DiskPressure` / `PIDPressure` | kaynak eşiği | node: bellek, `/var/lib` diskleri |

**Kalıp ara:** hangi node'lar, hangi saatler, ne sıklıkla? Aynı node'lar tekrar ediyorsa (test kümesi: wor03, wor08,
wor14) o node'larda ortak olan ne — aynı hipervizör/ESX, aynı RHEL/çekirdek, aynı iş yükü (ör. milvus)? Hipervizör
bilgisi kümeden görünmez → kullanıcıya sor. Aynı dakikada birden çok node düşüyorsa ortak altyapıyı (ağ, depolama,
yedekleme penceresi, vMotion) sor.

**ssh hatasını sınıflandır (genel — node'un hangi katmanda takıldığını söyler):**

| ssh çıktısı | Ne demek |
|---|---|
| `Connection timed out` (bağlantı kurulamadı) | TCP cevabı yok: node kapalı/donmuş ya da ağ yolu kesik |
| `Connection refused` | Node ayakta, sshd çalışmıyor |
| `No route to host` | Ağ/ARP katmanı — node ağda görünmüyor |
| `Connection timed out during banner exchange` | **TCP kuruldu (çekirdek cevap veriyor) ama sshd banner gönderemiyor** → kullanıcı alanı takılı: bellek baskısı/swap, G/Ç beklemesi (datastore), hung task, CPU açlığı |

Banner timeout'ta tekrar tekrar ssh deneme (her deneme sürer, bağlam yer): bir kez dene, sonucu yaz. Node donukken
kanıt dışarıda: VMware konsolu / vCenter (CPU ready, balloon, datastore gecikmesi, olay zamanı) — kullanıcıdan iste.
Node düzelince önceki açılışı oku: `journalctl -b -1 -p warning --no-pager | tail -50` (reboot olduysa),
`journalctl -k --since "<düşüş saati>"`. Erişilemeyen node sayısını **listeyle** ver ("belki başkaları" yazma).

**Node tarafı (ssh, okuma — reboot'tan önce):**

```bash
uptime; cat /proc/pressure/{cpu,memory,io}
systemctl is-active rke2-agent; journalctl -u rke2-agent --since -3h --no-pager | grep -i -e "not ready" -e pleg -e "context deadline" -e error | tail -40
journalctl -k --since -3h --no-pager | grep -i -e "hung task" -e "blocked for more than" -e "soft lockup" -e oom -e "link is down" -e openvswitch | tail -30
CRI_CONFIG_FILE=/var/lib/rancher/rke2/agent/etc/crictl.yaml /var/lib/rancher/rke2/bin/crictl ps 2>&1 | head -5
free -g; df -h / /var/lib/rancher /var/lib/kubelet
chronyc tracking | head -5
```

- `crictl` cevap vermiyor / zaman aşımı → containerd takılı (saha G10: `KillPodSandbox … context deadline exceeded`).
- `hung task` / `blocked for more than` → çekirdek düzeyinde G/Ç ya da kilit; `sorun-giderme` becerisi.
- **VMware VM ise** (genel; komutlar open-vm-tools ile gelir — yoksa `rpm -q open-vm-tools`):
  ```bash
  vmware-toolbox-cmd stat balloon; vmware-toolbox-cmd stat swap     # ESX bu VM'den bellek geri alıyor mu (MB)
  sar -u 1 5 | tail -2                                               # %steal — hipervizör CPU vermiyor mu (performans §3)
  journalctl -k --since -3h --no-pager | grep -i -e vmxnet -e pvscsi -e "clocksource" -e "time jump" | tail -20
  journalctl -u chronyd --since -3h --no-pager | grep -i -e "step" -e "jump" | tail
  ```
  Balloon/swap > 0, yüksek `%steal`, saat sıçraması (vMotion/snapshot sonrası) → VM'in donması hipervizör kaynaklı
  olabilir (tahmin olarak yaz); kanıtı vCenter tarafı (host CPU ready, bellek baskısı, olay zamanı) kesinleştirir.

**Antrea / OVS (saha G10-G11 — test kümesinde tekrar eden):**

```bash
kubectl -n kube-system get pods -o wide | grep antrea | grep <node>
kubectl -n kube-system logs <antrea-agent-pod> -c antrea-agent --tail=100 | grep -i -e error -e timeout -e rejoin
kubectl -n kube-system logs <antrea-agent-pod> -c antrea-ovs --tail=100 | grep -i -e error -e timeout -e "unreasonably long"
lsmod | grep -e openvswitch -e br_netfilter -e overlay              # node'da (ssh)
```

- `OVS transaction timeout`, `Failed to rejoin any members` (saha G11) → node-yerel Antrea/OVS sorunu: kümesel ağ
  değil ama **ağ veri yolu** — "ağ sorunu yok" deme, "node-yerel CNI sorunu" de.
- Neden-sonuç yönünü (OVS mi containerd'yi, containerd mi OVS'yi kilitledi) kanıt olmadan yazma.
- Node bir süre durursa (§5b) ovsdb transaction timeout, antrea liveness hatası ve memberlist `connection refused` **sonuç**
  olarak da görülür; aynı dakikada master'da da takılma varsa Antrea'yı kök neden yazma (Antrea master'da sshd'yi dondurmaz).

**conntrack (genel bilgi):** kube-proxy açılışta `nf_conntrack_max`'ı `max(32768 × çekirdek, 131072)` yapar (varsayılan
`--conntrack-max-per-core`) → node'lar arası farklı değer çoğu zaman **vCPU farkıdır**, yanlış ayar değil (`nproc` ile
doğrula: 786432 = 24×32768, 393216 = 12×32768). Elle sysctl ile yükseltilen değeri kube-proxy yeniden başlarken kendi
hesabına geri çekebilir (tahmin — restart sonrası değeri oku); kalıcı yol kube-proxy argümanı (`conntrack-max-per-core`,
değişiklik). Tablo dolduysa çekirdek `nf_conntrack: table full, dropping packet` yazar ve **yeni SYN düşer** → ssh
`Connection timed out` verir, `banner exchange` değil (banner'da TCP kurulmuştu).

```bash
nproc; sysctl net.netfilter.nf_conntrack_max net.netfilter.nf_conntrack_count
journalctl -k --since -7d --no-pager | grep -c "table full"        # 0 → tablo hiç dolmamış
```

### 5. Node işletim sistemi — toplu (ansible ad-hoc, tek izin)

```bash
ansible <grup> -i <envanter> -m shell -o -a 'uname -r; cat /etc/redhat-release; uptime; free -g | sed -n 2p; sysctl -n net.ipv4.ip_forward; swapon --show | wc -l'
```

- Çekirdek ve RHEL minor'ün node'lar arası farkı; `ip_forward=1`, swap kapalı (RKE2 gereği — `rke2-ansible`).
- SELinux ve firewalld kapalı olması **normal** (kurum kararı) — bulgu sayma.
- Sorunlu node'larla sağlıklı node'ları yan yana koy: fark neyse aday sebep odur (yine "tahmin:").

### 5b. Node donması (VM tamamen cevapsız, hipervizörden reset gerekiyor)

Test kümesinde master ve worker'lar **tamamen donuyor** (ssh banner timeout, Rancher Unavailable, sanallaştırma ekibi
reset atıyor — Alp, 2026-10-16). Bu Kubernetes'in değil, **işletim sistemi ya da hipervizör** katmanının işidir; pod
restart'ları (antrea, ingress, fluent-bit) çoğunlukla bunun **sonucu**, sebebi değil. Önceliklendirmeyi buna göre yap:
inceleme sırasında bir master'a ssh banner timeout alınırsa ya da Rancher→master `i/o timeout` görülürse bu "düşük"
değil **en yüksek** bulgudur; "Control plane sağlam" yazma.

Reset sonrası (okuma):

```bash
journalctl --list-boots | tail -3                       # önceki açılış var mı (journal kalıcı mı)
ls -d /var/log/journal 2>/dev/null || echo "journal kalici DEGIL — donma oncesi log yok"
journalctl -b -1 -n 80 --no-pager                       # donmadan önceki son satırlar — kesildiği an
journalctl -b -1 -k --no-pager | grep -i -e "hung task" -e "blocked for" -e "soft lockup" -e "rcu.*stall" -e oom -e "i/o error" -e vmxnet -e pvscsi | tail -30
sar -q -r -f /var/log/sa/sa$(date -d yesterday +%d) | tail -30   # donma saatine yakın yük/bellek (performans §6)
```

**Duraklama göstergeleri (genel bilgi)** — "node bir süre durdu mu, durduysa neden" sorusunun izleri:
- Birden çok node **aynı dakikalarda**, rol (master/worker) ve yaştan bağımsız takılıyor → Kubernetes'in altı: hipervizör /
  datastore (VM stun: snapshot, yedek, vMotion; CPU ready; datastore gecikmesi). Saatleri yan yana yaz; vCenter'dan host +
  datastore eşlemesini iste.
- `chronyd` günlüğünde saat sıçraması (`System clock wrong by`, `Forward time jump`) → VM bir süre durmuş.
- OVS günlüğünde `Unreasonably long NNNNms poll interval` → ovs-vswitchd o kadar ms çalışamamış; birden çok node'da aynı
  dakikada ise ortak altyapı. (Antrea'da: `kubectl logs <antrea-agent> -c antrea-ovs`.)
- etcd: `slow fdatasync`, `apply request took too long`, `leader failed to send out heartbeat on time` → disk/CPU duraklaması.
- Çekirdek: `soft lockup`, `rcu_sched … stall`, `blocked for more than 120 seconds` (hung task), `pvscsi`/`sd … abort`
  (disk komutu zaman aşımı), `nfs: server … not responding`.
- Bellek: `vmware-toolbox-cmd stat balloon` > 0 (ESX belleği geri alıyor), `sar -W` swap, PSI `memory`.
- Kendiliğinden düzelen olayın kanıtı **şu an** node'da: reboot ya da log dönmeden topla (birden çok node → ansible ad-hoc).

**Kısa takılma (kendiliğinden düzelen)** — ssh banner timeout sonra tekrar çalıştı, ya da node kısa NotReady→Ready (saha
G65: mas01 01:2x banner timeout → 01:29 `up 229 days`, reboot yok; wor03 00:48 NotReady→Ready). "Bağlantı hatasıydı, sorun
yok" **yazma**: banner timeout'ta TCP kurulmuştu, sshd o an cevap verememişti (§4 tablo). Kullanıcı "neden" diye sorduysa
yeniden denemek cevap değildir; olay penceresini oku (saati ±5 dk, node'un yerel saatiyle):

```bash
journalctl --since "00:43" --until "00:53" -p warning --no-pager | tail -40           # her şey, uyarı ve üstü
journalctl -k --since "00:43" --until "00:53" --no-pager | tail -30                   # hung task / soft lockup / vmxnet / i/o
journalctl -u rke2-agent -u rke2-server --since "00:43" --until "00:53" --no-pager | grep -i -e "not ready" -e pleg -e lease -e deadline -e timeout | tail -20
sar -q -r -d -s 00:40:00 -e 00:55:00 | tail -40                                        # yük, bellek, disk await o pencerede
cat /proc/pressure/{cpu,memory,io}                                                     # şimdiki baskı (avg300 = son 5 dk)
```

Aynı gece birden çok node kısa takıldıysa saatleri yan yana yaz (aynı dakika mı → ortak altyapı: datastore/ESX/ağ).

Kullanıcıdan (vCenter — kümeden görünmez): donma saatinde VM'in **CPU ready / co-stop**, **balloon / swap**, **datastore
gecikmesi**, aynı anda snapshot/yedek/vMotion olayı; donan VM'ler aynı ESX host'unda ya da datastore'da mı. Donmuş
VM'in konsol ekranı (panic/hung task mesajı) reset'ten **önce** alınırsa en değerli kanıttır.

Öneri (değişiklik — uygulamak kullanıcının işi): journal kalıcı değilse `Storage=persistent`; kdump açık değilse açmak;
`kernel.hung_task_panic`/`softlockup_panic` ile donma yerine dökümlü panic (kdump ile birlikte, test kümesinde).

### 6. Sonuç (ekrana, kısa)

```
Küme <ad> · Rancher v… · RKE2 v… · <tarih>
Sürüm/uyumluluk: ✅/⚠️ … (matris satırı)
Control plane: ✅/⚠️ … (kanıt)
Altyapı pod'ları: …
Node'lar: wor03, wor08 Unavailable — Ready: "<mesaj>" · kalıp: … · node kanıtı: …
Uygulama tarafı (yalnız not): …
Öneri (uygulanmadı, en hafiften): …
Açık kalanlar: [SAHA] …
```

Yazmadan önce tutarlılık (saha G65): DaemonSet sayısı ilgili node sayısına eşit mi (antrea-agent = tüm node, ingress =
worker); eşit değilse farkı yaz, ✅ koyma. Aynı olay iki yerde farklı zamanla geçmesin ("84g önce" ↔ "4 gün önce").
Bu turda iki node etkilendiyse (ör. biri NotReady→Ready, biri ssh banner timeout) ayrı satır değil **tek kalıp** olarak yaz.

### Yapmayacakların

- Reboot, `systemctl restart rke2-*`, antrea/coredns pod'u silme, `kubectl drain/cordon/delete`, `kubectl exec`
- Event silme (Rancher'daki "Delete" düğmesi dahil), Rancher'da düzenleme
- Sürüm yükseltme önerisini matrise bakmadan yapma (`rke2-ansible`)

## B. GPU kümesi

Doğrulama: Doktor'un makinesinde GPU ve küme yok — komutlar sahada **ilk kullanımda** doğrulanacak.
Bir bayraktan emin değilsen önce `--help` / `nvidia-smi --help-query-gpu` çıktısını oku, ezberden yazma.
Kaynak etiketi: **(Alp)** = kurum bilgisi · **(genel)** = NVIDIA/vLLM/Kubernetes genel bilgisi, sahada
doğrulanmadı — raporda "öneri" olarak yaz, "kural" olarak değil.

### 0. Ortam (Alp, 2026-10-14)

- Rancher → RKE2 kümeleri; her kümede 3 master + worker'lar (sanal ya da fiziksel). İşletim sistemi genelde RHEL 9.
- **İki GPU kümesi:**
  - `gpu-prod` — prod Rancher'ın (`rke-prod.<kurum>`) altında; **3 fiziksel H200** worker.
  - `gpu-dtx` — nonprod Rancher'ın (`rke-nonprod.<kurum>`) altında (dev/test/prep = `d`/`t`/`x`); **1 fiziksel H200**
    (`h200w1`) + **L40S'li VM worker'lar** (VMware sanallaştırması).
  - `gpu-dtx` node'ları (saha `get nodes -o wide`, 2026-10-15): `sdlgpumaster1-3` (control-plane), `sdlgpuworker1-3`
    (rol etiketi `runai-system`, **GPU etiketi yok** — L40S bunlarda mı `[SAHA]`), `sdlgpuh200w1` (rol `runai-system`,
    `NVIDIA-H200` × 8). H200 node'u o gün **RKE2 v1.32.6 / RHEL 9.4 / containerd 2.0.5**, diğerleri v1.33.13 / 9.6 / 2.2.5
    — sapmayı her incelemede yeniden oku (A §1); 9.4 bilinçli olabilir (Satellite'ta 9.4 CV'si var, Alp).
  - **Şimdilik yalnız `gpu-dtx` incelenir** (Alp, 2026-10-14). `gpu-prod`'a Alp açıkça istemedikçe komut çalıştırma.
- Worker'lar (H200 fiziksel ve L40S VM'ler) RKE2 kümesinin worker node'larıdır — **ikisi de denetim kapsamında.** VM
  worker'da ayrıca hipervizör etkisine bak (`performans` §3 `%steal`) ve GPU'nun VM'e nasıl verildiğini
  (`nvidia-smi -q` ürün/sanallaştırma alanları) yaz.
- B300 yakında gelecek. NVIDIA GPU Operator iki kümede de çalışıyor. H200 host'unda (RHEL 9) `nvidia-smi` çalışıyor.
- `sdlgpuh200w1` donanımı (saha, 2026-10-15): 2 × AMD EPYC 9575F (256 iş parçacığı, NUMA 0: GPU0-3, NUMA 1: GPU4-7),
  RAM **2266 GiB** (`free -g`), 8 × H200 SXM — NVSwitch, `topo -m` hepsi `NV18`, Fabric `Completed/Success`; sürücü
  580.82.07, CUDA 13.0; `tuned` kurulu değil; THP `always`.
- `/models`: host'ta NVMe RAID10 (+2 yedek) → LVM → xfs, ~10 TB; **yazılabilir** — modelleri ekip NFS ya da scp ile
  kopyalıyor. Ayrıntı: 16 × 1.7 TB NVMe, 12'si yazılım RAID10 (mdadm), 2'si yedek — `depolama` A §8; LV düzeni
  (`rke2-ansible` "Elle worker ekleme" planı). **Sahada (2026-10-15):** `/dev/mapper/vg_models-lv_models` → `/models`,
  xfs, 13T (900G dolu), seçenek `relatime` (`noatime` değil) — planla fark varsa yaz, değiştirme.
- **Depolama iki türlü (saha 2026-10-15, gpu-dtx):** `runai-inference` pod'ları **hostPath `/models`** (readOnly);
  `vllm` namespace pod'ları **NFS PVC** (`nfs-sc`, ör. `vllm-qwen3-235b-fp8-storage-claim` 250Gi). Alp: hedef hostPath,
  geçiş DevOps tarafında **sürüyor**; kalan PVC tanımları eski — bulgu değil, yalnız "geçiş durumu" olarak yaz.
- vLLM pod'ları modelleri **hostPath `/models`** ile okur. Neden hostPath: eskiden `nfs-sc` StorageClass kullanılıyordu;
  blok StorageClass yok, Longhorn kurulu değil ve tercih edilmiyor → tek seçenek hostPath. Sonuç: model açılışı
  ~45 dk'dan saniyeler düzeyine indi. hostPath'i "kötü uygulama" diye bulgu yazma — bilinçli kurum kararı.
- vLLM deployment'ları fiziksel H200'e sabitleniyor; yöntem (nodeSelector mı taint/toleration mı) `[SAHA]` — §1/§3'te
  bul ve yaz.
- **opencode'un kendi modeli (kurum Qwen) bu GPU kümelerinden birinde vLLM ile çalışıyor** (Alp; hangi küme `[SAHA]`).
  Saha (2026-10-15): `gpu-dtx`, ns `runai-inference`, pod `qwen36-35b-a3b-fp8-00001-deployment-…` (model dizini
  `/models/models--Qwen--Qwen36-35B-A3B-FP8`). **Kesinlikle dokunma** — yeniden başlarsa ajan işin ortasında cevapsız
  kalır. vLLM parametrelerini (`--max-model-len`, `--max-num-seqs`, `--gpu-memory-utilization`) ve Run:ai ayırmasını
  yaz; opencode tarafındaki değerler `./kur.sh kontrol` "ayar" satırında (bağlam / çıktı) ya da opencode `env`'inde.
- **Run:ai (saha 2026-10-15, doğrulandı):** h200w1'de `runai-inference` pod'ları (qwen36-35b, qwen3-14b, qwen3-32b-vlm,
  qwen3-4b-embd) + `runai-reservation` ns'te 2 `gpu-reservation-<node>-…` pod'u + `vllm` ns'te 2 deployment
  (qwen3-235b: 2 GPU, qwen35-397b: 3 GPU). Kesirli GPU ayırması `nvidia.com/gpu` limitinde **görünmez** — pod
  annotation'larında: `runai-allocated-gpus` (ör. "0.35"), `runai-allocated-gpu-memory` (MiB), `runai-nodepools`;
  CPU/RAM isteği `--cpu-core-request/limit`, `--cpu-memory-request/limit` (bir pod'da `limit 8Gi` görüldü — hangi pod
  olduğunu `-o jsonpath` ile pod adıyla birlikte al, `grep -A` ile birden çok pod'u karıştırma). `-00001-deployment`
  adı Knative revizyonu olabilir (tahmin). Kesirli pod'lar aynı fiziksel GPU'yu paylaşır → gecikmeyi o GPU'daki diğer
  modellerle birlikte değerlendir.
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

**Temel küme katmanları (sürüm matrisi, control plane, node NotReady, Antrea, OS) A bölümünde** — önce onu uygula
(en azından A §1 sürüm envanteri ve A §4 node durumu); bu bölüm GPU'ya özgü katmanları ekler.

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
- **İlk özete sürüm sapmasını yaz:** `get nodes -o wide`'daki VERSION / OS-IMAGE / KERNEL-VERSION / CONTAINER-RUNTIME
  sütunlarında GPU node'u diğerlerinden farklıysa bunu ilk bulgu olarak ver (A §1, matris `rke2-ansible`).

- **Sürümler küme üzerinden okunur, tahmin edilmez:** RKE2/Kubernetes → `get nodes` `VERSION` sütunu
  (`v1.xx.y+rke2rN` biçimi); Rancher → `kubectl -n cattle-system get deploy cattle-cluster-agent -o
  jsonpath='{.spec.template.spec.containers[0].image}'` (ajan imaj etiketi, genel). Nonprod Rancher ekranı (2026-10-15):
  Rancher v2.14.3, `gpu-dtx` v1.33.13+rke2r1 — yine de okunan değeri yaz. Uyumluluk yorumu yalnız `rke2-ansible`'daki veri tablosundan.
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
| GPU paylaşımı | `spec.devicePlugin.config` → ConfigMap, `timeSlicing` / `replicas` | Varsa yaz: bir GPU birden çok pod'a bölünüyor; vLLM için genelde istenmez (genel) |
| MIG | `spec.mig.strategy`, node etiketi `nvidia.com/mig.config` | Bilinçli mi? Kullanıcıya sor |
| DCGM | `spec.dcgmExporter.enabled` ve `spec.dcgm.enabled` **ayrı** alanlar | Metrik için bakılacak `dcgmExporter`; `dcgm.enabled: false` yalnız ayrı DCGM hostengine'in kapalı olduğunu söyler, "metrik yok" demek değildir (genel; saha G52) |
| Paylaşım (Run:ai) | device-plugin `sharing-strategy: none` | Run:ai kesirli GPU (`runai-allocated-gpus`) ayrıca paylaştırır — "GPU paylaşımı yok" yazmadan önce Run:ai annotation'larına bak (saha G52) |
| Validator | `kubectl logs -n <ns> <nvidia-operator-validator-…> --all-containers --tail=50` | hata yok (`Could not create symlink … file exists` uyarısı zararsız — genel) |
| Restart sebebi | `describe pod` → `Last State` | **OOM yalnız `Reason: OOMKilled` / `Exit Code: 137`** ise denir. `Reason: Error, Exit Code: 2` + loglarda `panic at …go:NN` = programın kendi hatası (Go panic) — "bellek limiti düşük" deme (saha G59) |
| Restart | `get pods -n <ns> -o wide` RESTARTS sütunu | Artmıyor. Saha 2026-10-15: `node-feature-discovery-worker` pod'ları 270-313 restart (27 günde), `master` 65 → `logs --previous` ve `describe` (`Last State` OOMKilled mi) ile sebebini oku |

Sürüm (operator, sürücü, CUDA) **tahmin edilmez** — pod imaj etiketinden ve `nvidia-smi` başlığından oku.

### 3. Pod'lar (vLLM)

GPU isteyen pod'ları bul:

```bash
kubectl get pods -A -o custom-columns='NS:.metadata.namespace,POD:.metadata.name,NODE:.spec.nodeName,GPU:.spec.containers[*].resources.limits.nvidia\.com/gpu,QOS:.status.qosClass' | awk 'NR==1 || $4!="<none>"'
kubectl get pod <pod> -n <ns> -o yaml          # tek pod'un tam tanımı — aşağıdaki listeyi buna göre doldur
kubectl describe pod <pod> -n <ns> | sed -n '/Last State/,/Ready/p;/Events/,$p'
```

Her vLLM pod'u için (kanıt = yaml'daki alan):

- **GPU sayısı ↔ vLLM paralelliği:** `limits.nvidia.com/gpu` = `--tensor-parallel-size` × `--pipeline-parallel-size`
  (pod `args`/`command`). Fazlaysa GPU boşta kilitli, azsa başlamaz (genel).
- **CPU:** CPU `limit` var mı? Varsa kısıtlama (throttling) ölç: `sorun-giderme` "CPU gecikmesi" a) — `cpu.stat`
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
  - `sizeLimit` yoksa tmpfs boyutu pod'un bellek limitine (yoksa node'un ayrılabilir belleğine) eşitlenir (genel,
    Kubernetes `SizeMemoryBackedVolumes`) — yani shm, `limits.memory` ile aynı havuzdan yer. tp=1 pod'da NCCL shm'yi az
    kullanır (tahmin); risk asıl tp>1 pod'larında. Ölçmeden "OOM olur" deme: `df` ile shm doluluğu + `kubectl top pod`.
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
- **Çelişen bayraklar:** aynı args'ta hem `--enable-X` hem `--no-enable-X` (ör. prefix caching, saha G59) → bulgu;
  hangisinin geçerli olduğu sıraya bağlı (argparse'ta sonuncu kazanır — genel), vLLM başlangıç logundan doğrula.
- **vLLM parametreleri** (değerini yaz, iş yükü bilinmeden "yanlış" deme): `--gpu-memory-utilization`,
  `--max-model-len`, `--max-num-seqs`, `--tensor-parallel-size`, `--dtype`/`--quantization`, `--enforce-eager`.
- **Ortam değişkenleri:** `CUDA_VISIBLE_DEVICES`/`NVIDIA_VISIBLE_DEVICES` elle verilmişse device plugin'in atamasıyla
  çakışabilir — neden verildiğini sor (genel). `NCCL_*` değişkenlerini **pod adıyla** listele.
  `NCCL_P2P_DISABLE=1` NVLink/NVSwitch'li node'da (`topo -m` → `NV#`) GPU'lar arası doğrudan yolu kapatır; tensor
  parallel trafiği host belleği üzerinden gider (genel). Bulgu olarak yaz ve **neden konduğunu sor** — geçmişte bir
  hatayı aşmak için bilinçli konmuş olabilir; "kaldırın" deme. Etkisi yalnız tp>1 / pp>1 pod'larda.
- **GPU belleği %90+ normaldir:** vLLM `--gpu-memory-utilization` kadarını baştan ayırır (genel) — doluluk sorun değil.
- **Restart sayısı ve son loglar:** `kubectl logs <pod> -n <ns> --tail=200 | grep -i -e error -e warn -e "out of memory" -e weights`
  — ağırlık yükleme süresini veren satır (`/models` hızı için §5).

### 4. GPU node işletim sistemi (ssh, okuma)

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
- **XID:** her XID bir sürücü/donanım olayıdır; kodu, tarihi, sayısı ve satırdaki `pid=…, name=…`'yi raporla. Xid 31 =
  GPU bellek sayfa hatası (MMU fault) — NVIDIA belgesine göre çoğunlukla uygulama kaynaklı (genel); süreç adını
  (`VLLM::EngineCor…`) ve GPU'yu pod'la eşle. Diğer kodların anlamını uydurma.
- **ECC uncorrected > 0**, sürekli düşük saat, `power.limit` beklenenden düşük → bulgu.
- **PCIe:** boşta `gen.current` güç tasarrufuyla düşer (genel) — karşılaştırmayı **yük altında** yap.

**CPU / bellek / çekirdek:**

```bash
tuned-adm active
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_driver /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>&1
cpupower frequency-info -p 2>/dev/null
lscpu | grep -i -e numa -e 'model name' -e '^cpu(s)'
free -g; swapon --show                       # RKE2 için swap kapalı olmalı (rke2-ansible)
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
  — öneri olarak yaz; değiştirmek kubelet yeniden başlatması ister (K1).

**`/tmp` ve inode (Alp):**

```bash
findmnt /tmp; df -h /tmp; df -i /tmp
```

`IUse%` ve toplam inode'u yaz; kurumun hedef değeri `[SAHA]`. Ayrıca pod'ların cache/geçici dizinleri hostPath ile
host'a bağlıysa (`kubectl get pod -o yaml` → `volumes`) o dizinin `df -i`'sine de bak.

### 5. Depolama `/models`

RAID ve NVMe sağlığı → **`depolama` A §8** (mdstat, `mdadm --detail`, yedek sayısı, `nvme smart-log`). Burada ek olarak:

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

### 6. Ölçüm (yük altında)

Boştaki node "iyi" görünür; darboğaz istek varken çıkar.

- **DCGM exporter** (operator'ün parçası) metrikleri Prometheus/Rancher Monitoring'de olabilir — var mı `[SAHA]`.
  `nvidia-smi`'deki GPU kullanım % yalnız "bir kernel çalışıyordu" demektir, doygunluk değildir (genel); varsa
  DCGM'in `PROF` metriklerine bak.
- **vLLM `/metrics`:** çalışan/bekleyen istek sayısı, KV-cache doluluğu. Metrik adları sürüme göre değişir — adları
  ezberden yazma, `curl -s http://<pod-ip>:<port>/metrics | grep -i -e running -e waiting -e cache` çıktısından oku.
- Anlık tur: `nvidia-smi dmon -s pucm -c 10` (10 örnek; güç, kullanım, saat, bellek) + aynı anda `sorun-giderme`
  CPU kısıtlaması ölçümü.
- Bekleyen istek kuyruğu büyürken GPU kullanımı düşükse darboğaz GPU dışında (CPU kısıtlaması, tokenizer, ağ) —
  "GPU yetmiyor" demeden önce bunu ayır.

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
- `/models` üzerinde herhangi bir test, `mdadm` değişikliği (`depolama` A §8)
- `kubectl exec` (pod içine girmek) — gereken bilgiyi yaml'dan, loglardan ve node'dan oku
