---
name: rke2-denetim
description: Rancher'ın yönettiği RKE2 kümesini (test, nonprod, prod) uçtan uca denetlerken kullan — sürüm envanteri ve matris, control plane (etcd, apiserver), node NotReady/Unavailable/donma/kısa takılma, Antrea/OVS, conntrack, sistem pod'ları, node işletim sistemi. "kümeyi incele", "küme denetimi", "kümede neler oluyor", "node unavailable", "notready", "node düşüyor", "donma", "takılma", "rke2 incele", "rancher kümesi", "antrea", "ovs", "antrea-ovs restart", "liveness", "ovs soketi", "tmpmounts", "nfs mi", "etcd", "control plane", "kube-system" isteklerinde tetiklenir. GPU kümesi için ayrıca `rke2-gpu`, EDR/AV ajanları (SEP, XDR, Twistlock) için `rke2-edr`, güvenlik için `rke2-guvenlik`, yükseltme için `rke2-yukseltme`. Yalnız okur; değişiklik önerir, uygulamaz.
---

# RKE2 küme denetimi (her küme)

GPU kümesinde (`gpu-dtx`, `gpu-prod`) önce bu becerinin §1 sürüm envanteri ve §4 node durumu, sonra **`rke2-gpu`**.

Doğrulama: Doktor'un makinesinde küme yok — komutlar sahada ilk kullanımda doğrulanacak; emin olmadığın bayrakta
`--help`. Kaynak etiketi: **(Alp)** kurum bilgisi · **(saha G…)** saha gözlemi · **(genel)** Kubernetes/RKE2 genel
bilgisi — "(genel)" maddeyi öneri olarak yaz, kural olarak değil.

**Ek dosya** (ayrıntı komutları, bölüm A–H): `/root/ai/opencode/knowledge/skills/approved/rke2-denetim/node-takilma.md` —
"ek dosya bölüm X" denen yerde o belirti varsa **önce o bölümü oku**.

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
- **Çok node'a aynı komut → ansible ad-hoc** (tek izin, paralel): `filo-kontrol` becerisi; node başına ssh
  döngüsü kurma (saha G6). Tek node'u derinlemesine incelerken ssh.
- **Bağlamı koru:** çıktıyı sınırla (`--tail`, `head`, `grep`); katman bitince en fazla 5 satır ara özet; sonraki
  katmanda ham çıktıyı tekrarlama (saha G20/G22).

### Önce sor (tek mesaj, numaralı — oturumda/kurumsal bilgide cevabı varsa sorma)

1. **Küme:** hangisi (adı ya da Rancher'daki adı), prod mu nonprod mu — bilinmiyorsa `kume-bul`.
2. **Kapsam:** uçtan uca denetim mi, tek belirti mi (node NotReady/Unavailable, donma, kısa takılma, etcd, Antrea).
3. **Belirti ise:** hangi node(lar), ne zaman (tarih-saat; yerel mi UTC mi), tekrarlıyor mu.
4. **Yakında ne değişti:** reboot, yama, node ekleme, yükseltme — ne zaman. Reboot edilecekse önce kanıt toplanır (§4).
5. **Uygulama pod'ları:** derine inilsin mi (varsayılan: yalnız altyapı — İlkeler).

Sorma: sürümler, node durumu, event'ler, sistem pod'ları, node işletim sistemi — §1–§5 okur. ESX host/datastore bilgisi kümeden
görünmez; gerekiyorsa kullanıcıdan vCenter bilgisi istenir (§0).

### 0. Ortam (Alp ve Rancher ekranları, 2026-10-15)

- İki Rancher: nonprod (`rke-nonprod.<kurum>`) ve prod (`rke-prod.<kurum>`). Sürümleri ve downstream küme listesini kümeden/Rancher'dan
  oku (§1; 2026-10-15 kaydı: ek dosya bölüm H). Anthos (GKE) kümeleri de Rancher'da görünür — kapsam dışı (`anthos-erisim`).
- **Masterlar ve VM worker'lar VMware üzerinde**; GPU worker'lar (H200) fiziksel sunucu (Alp, 2026-10-15). VM'in ESX host'u/
  datastore'u kümeden görünmez → `[SAHA]`, kullanıcıdan (§5b listesi).
- CNI: **Antrea** (OVS veri yolu). İşletim sistemi RHEL (8/9/10 — node başına `get nodes -o wide`'dan oku).
- `test` kümesi: 3 master (`mas01-03`) + 14 worker (`wor01-14`); worker'ların bir kısmı zaman zaman `Unavailable` ve **aynı node'lar
  tekrarlıyor** (wor03, wor08-11, wor12, wor14) — kalıp ara (§4). Tarihli kayıtlar ve node yaş grupları: ek dosya bölüm H.
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
- **Uyum, destek sonu (EOL), en son yama: yalnız betikten** — `python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py
  kontrol --rancher … --rke2 … --antrea … --rhel …`; çıktıyı olduğu gibi aktar (`surum-uyum`, `rke2-yukseltme`). Güvenlik puan kartı: `rke2-guvenlik`.
- **Antrea ↔ K8s satırı her raporda zorunlu** (Alp, 2026-10-17: "matris çok önemli, supported olmalı"); Antrea RKE2
  ile gelmez, ayrı yükseltilir — K8s yükseltilip Antrea unutulabilir. Satırı **kanıt katmanlarıyla** yaz (`surum-uyum` §"Kanıt
  zorunluluğu": upstream garanti · VMware VCN matrisi · VMware VKr ikilisi · bilinen kayıt). `test` Antrea v2.3.0 + 1.33 → ⚠️ garanti/
  matris dışı, VKr'de paketli, **kanıtlı uyumsuzluk yok** (G77 — eskiden yanlışlıkla ❌ yazılıyordu). Matris durumu node donmasının ya
  da pod hatasının sebebi olarak **yazılmaz**. Veride olmayan sürüm → "veri yok — uyumlu/uyumsuz olabilir" de, tahmin etme.

### 2. Control plane

**Önce genel özet** (node/pod/restart/DaemonSet/olay — hepsi tek çağrı, betik birleştirir): `k8s-sorun` → "Durum özeti"
(`… get nodes,pods,events,ds,leases -A -o json | python3 /root/ai/opencode/knowledge/skills/approved/k8s-sorun/k8s-ozet.py -`).
Bu bölümdeki ve §3-§4'teki komutlar o özetin işaret ettiği **tek** master/node/pod'a inmek içindir.

```bash
kubectl get --raw='/readyz?verbose' | grep -v ' ok$' | head        # boşsa hepsi ok; etcd dahil
kubectl -n kube-system get pods -o wide | grep -e etcd -e kube-apiserver -e kube-controller -e kube-scheduler -e cloud-controller
```

Master'da (ssh, okuma):

```bash
systemctl is-active rke2-server; journalctl -u rke2-server --since -3h --no-pager | grep -i -e error -e "took too long" -e leader -e "slow" | tail -30
df -h /var/lib/rancher; cat /proc/pressure/io
```

- etcd logunda `apply request took too long` / `slow fdatasync` (genel) → master diski yavaş; `rhel-performans` becerisi
  disk bölümü. Üç master'da da aynı mı, tek birinde mi?
- Sertifika: **kalan günü kafadan hesaplama** (saha G65) — betik hesaplar, kalan güne göre sıralar; bulgu eşiği 30 günden az.
  `CertificateExpirationWarning` event'i tek başına bulgu değil (anlamı ve 120 gün eşiği: ek dosya bölüm G):
  `ssh root@<master> 'cd /var/lib/rancher/rke2/server/tls && for f in *.crt */*.crt; do [ -f "$f" ] && { echo "#DOSYA $f"; base64 -w0 "$f"; echo; }; done' | python3 /root/ai/opencode/knowledge/skills/approved/rancher-sertifika/sertifika-kontrol.py - --ozet`

**rke2-server döngüde çöküyor / `context deadline exceeded`** (saha G98: kanıt toplanmadan reboot önerildi — G11'in tekrarı).
Restart/reboot **değişikliktir ve kanıtı siler**: önce oku (`NRestarts`, rke2-server ve etcd logu, disk/PSI/chrony — hepsi okuma)
→ komutlar ve ayırt etme: ek dosya bölüm G.
- Öneri sırası (değişiklik — CN/KRİZ yetkisi, kullanıcı karar verir): kanıt kaydedildi mi → tek servis (`systemctl restart rke2-server`)
  → node reboot en son. Hedefi `sunucular: <ad>` satırıyla yaz, yalnız onay iste (AGENTS).
- "Düzeldi" yalnız iki okumayla (G12): `NRestarts` artmayı kesti (10 dk sonra tekrar) + `k8s-ozet.py`'de node Ready, etcd/apiserver pod'ları.

**Control plane kararı (saha G62/G65 — iki kez yanlış "✅" yazıldı):**
- "Control plane ✅" yalnız readyz temiz **ve** her master'a ssh bu turda başarılıysa. Bir master'a ssh banner timeout →
  Control plane **⚠️, en yüksek bulgu** (§4 tablo, §5b). "Geçici" yazmak için sonradan başarılı bir ssh çıktısı gerekir.
- API'deki pod "Running" / node "Ready" donmuş node'da bir süre eski kalır; kubelet canlılığının kanıtı lease
  (genel: ~10 sn'de yenilenir; komut §4 "Küme tarafı") — `renewTime`'ı `date -u` ile karşılaştır.
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

**Kalıp ara:** hangi node'lar, hangi saatler, ne sıklıkla? Aynı node'lar tekrar ediyorsa (§0) o node'larda ortak olan ne — aynı
hipervizör/ESX, aynı RHEL/çekirdek, aynı iş yükü (ör. milvus)? Aynı dakikada birden çok node düşüyorsa ortak altyapıyı (ağ,
depolama, yedekleme penceresi, vMotion) sor.

**ssh hatasını sınıflandır (genel — node'un hangi katmanda takıldığını söyler):**

| ssh çıktısı | Ne demek |
|---|---|
| `Connection timed out` (bağlantı kurulamadı) | TCP cevabı yok: node kapalı/donmuş ya da ağ yolu kesik |
| `Connection refused` | Node ayakta, sshd çalışmıyor |
| `No route to host` | Ağ/ARP katmanı — node ağda görünmüyor |
| `Connection timed out during banner exchange` | **TCP kuruldu (çekirdek cevap veriyor) ama sshd banner gönderemiyor** → kullanıcı alanı takılı: bellek baskısı/swap, G/Ç beklemesi (datastore), hung task, CPU açlığı |

Banner timeout'ta tekrar tekrar ssh deneme (her deneme sürer, bağlam yer): bir kez dene, sonucu yaz. Node donukken
kanıt dışarıda: VMware konsolu / vCenter — kullanıcıdan iste (§5b listesi).
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
- `hung task` / `blocked for more than` → çekirdek düzeyinde G/Ç ya da kilit; `rhel-sorun` becerisi.
- **VMware VM ise:** balloon/swap, `%steal`, saat sıçraması okuması → ek dosya bölüm F "VMware VM"; sonucu tahmin olarak yaz
  (donma hipervizör kaynaklı **olabilir**), kanıtı vCenter kesinleştirir.

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

**Tek node'da tekrarlayan `antrea-ovs` yeniden başlaması (saha G71):** "OVS soketi kayboldu" çoğu zaman liveness'in konteyneri
öldürmesidir (OVS ~50 sn cevap vermedi); asıl soru **neden cevap vermedi** — OVS mi takıldı, node mu durdu? Mekanizma, `exit=137`
okuması, node'da kalan log dosyaları ve olay penceresi komutları → **önce oku:** ek dosya bölüm A.
Olay saatini tarihli komuta **sen çevirme** — `rhel-sorun/olay-penceresi.py` üretir.

Ayırt et (her satır "tahmin:" ile başlar, kanıt gelince kesinleşir):

| Kanıt | Ne gösterir |
|---|---|
| `Unreasonably long NNNNms poll interval (… user, … system)` — duvar saati büyük, user+system küçük | ovs-vswitchd **çalıştırılmadı/bekledi** (CPU açlığı, G/Ç, VM duraklaması) — OVS'nin hatası değil |
| Aynı dakikada `chronyd` sıçraması, `%steal`, başka node'larda da takılma | hipervizör/datastore (§5b) |
| `hung task` / `blocked for more than` — çağrı yığınında `fanotify`/`fsnotify` ya da `sisap`/`sisevt` | dosya açma, **erişimde tarama yapan güvenlik ajanının** kararını bekliyor (`rke2-edr`) |
| Aynı yığında `nfs_`/`rpc_` | NFS — ama node'da NFS bağlaması yoksa bu yol kapalı (ek dosya bölüm B) |
| `sar` o pencerede `%iowait`/`await` yüksek, PSI `io` | disk/datastore |
| Hiçbiri yok, yalnız OVS satırları | OVS'nin kendisi — Antrea sürüm/matris (§1), `antrea-agent` logu |

**NFS — ele ya da kanıtla** (Alp, 2026-10-20; saha G80): "sunucuya erişiliyor" NFS'i elemez; soru **node'da asılı bir NFS bağlaması
var mı** (`findmnt -t nfs,nfs4`). Bağlama ve çekirdekte `not responding` **yoksa** "kök neden NFS değil" yazılabilir. **NFS bağlaması
VARSA:** `not responding` saatleri olay saatleriyle örtüşmeden ve takılan sürecin yığınında `nfs_`/`rpc_` görülmeden NFS kök neden
yazılmaz. Bağlama denemesi yapma (değişiklik). Komutlar ve karar satırları → ek dosya bölüm B.

**Eleme — güvenlik ajanları (SEP, Cortex XDR, Twistlock):** envanter, kanıt sırası ve "kapatınca düzeldi" doğrulaması **`rke2-edr`**
becerisinde (saha G72: wor14'te XDR kaldırılınca node toparlandı; gözlem sürüyor). Ajanı kök neden yazmadan önce o beceriyi yükle.

**Diğer ayırıcılar (ek dosya):**
- **`tmpmounts` birikimi** (containerd'nin geçici bağlamaları): belirti olarak oku, sebep yazma → bölüm C.
- **"Sorun yükte olabilir mi?"** (saha G92): anlık `load average`/`free` olay anını **göstermez** → "yükten kaynaklı sorun YOK"
  yazılmaz; kanıt olay penceresinin `sar`'ı, OOM ve eviction satırı → bölüm D.
- **conntrack:** node'lar arası farklı `nf_conntrack_max` çoğu zaman vCPU farkıdır, yanlış ayar değil; tablo dolarsa ssh
  `Connection timed out` verir (`banner exchange` değil) → bölüm E.

### 5. Node işletim sistemi — toplu (ansible ad-hoc, tek izin)

```bash
ansible <grup> -i <envanter> -m shell -o -f 20 -T 10 --task-timeout 30 -a 'uname -r; cat /etc/redhat-release; uptime; free -g | sed -n 2p; sysctl -n net.ipv4.ip_forward; swapon --show | wc -l'
```

- Çekirdek ve RHEL minor'ün node'lar arası farkı; `ip_forward=1`, swap kapalı (RKE2 gereği — `rke2-kurulum`).
- SELinux ve firewalld kapalı olması **normal** (kurum kararı) — bulgu sayma.
- Sorunlu node'larla sağlıklı node'ları yan yana koy: fark neyse aday sebep odur (yine "tahmin:").

### 5b. Node donması (VM tamamen cevapsız, hipervizörden reset gerekiyor)

Test kümesinde master ve worker'lar **tamamen donuyor** (ssh banner timeout, Rancher Unavailable, sanallaştırma ekibi
reset atıyor — Alp, 2026-10-16). Bu Kubernetes'in değil, **işletim sistemi ya da hipervizör** katmanının işidir; pod
restart'ları (antrea, ingress, fluent-bit) çoğunlukla bunun **sonucu**, sebebi değil. Bir master'a ssh banner timeout ya da
Rancher→master `i/o timeout` = **en yüksek** bulgu (§2 "Control plane kararı").

Reset sonrası ilk okuma (önceki açılışın journal'ı, çekirdek satırları, `sar`), **duraklama göstergeleri**
(çok node aynı dakikada → hipervizör/datastore; `chronyd` saat sıçraması; OVS `Unreasonably long`; etcd `slow fdatasync`; hung task /
soft lockup; balloon) ve **kısa takılma** (kendiliğinden düzelen — saha G65) komutları → **önce oku:** ek dosya bölüm F.

- Kısa takılmada "bağlantı hatasıydı, sorun yok" **yazma** (banner timeout'ta TCP kurulmuştu — §4 tablo); yeniden denemek "neden"in
  cevabı değildir: olay penceresini oku — komutları `rhel-sorun/olay-penceresi.py` üretir.
- Kendiliğinden düzelen olayın kanıtı **şu an** node'da: reboot ya da log dönmeden topla (birden çok node → ansible ad-hoc).

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

**Karşılaştırma tablonla sonucun çelişmesin (saha G80):** bir aday faktör (modül, ajan, sürüm, RHEL) **sağlam node'larda da**
varsa tek başına sebep değildir — "X tüm node'larda var" yazıp sonra "kök neden X" deme. En fazla "X + Y birlikte **olabilir**
(tahmin) — ayıran kanıt: …" yaz. Başlık "Kök neden" yalnız olayın kendi kanıtı (yığın izi, log saati) varsa; yoksa başlık
"**Aday sebepler (kanıt durumu)**" ve her satırda kanıtlı / tahmin + eksik kanıt.

### Yapmayacakların

- Reboot, `systemctl restart rke2-*`, antrea/coredns pod'u silme, `kubectl drain/cordon/delete`, `kubectl exec`
- Event silme (Rancher'daki "Delete" düğmesi dahil), Rancher'da düzenleme
- Sürüm yükseltme önerisini matrise bakmadan yapma (`surum-uyum`, `rke2-yukseltme`)
