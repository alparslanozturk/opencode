---
name: rke2-denetim
description: Rancher'ın yönettiği RKE2 kümesini (test, nonprod, prod) uçtan uca denetlerken kullan — sürüm envanteri ve matris, control plane (etcd, apiserver), node NotReady/Unavailable/donma/kısa takılma, Antrea/OVS, conntrack, sistem pod'ları, node işletim sistemi. "kümeyi incele", "küme denetimi", "kümede neler oluyor", "node unavailable", "notready", "node düşüyor", "donma", "takılma", "rke2 incele", "rancher kümesi", "antrea", "ovs", "antrea-ovs restart", "liveness", "ovs soketi", "tmpmounts", "nfs mi", "etcd", "control plane", "kube-system" isteklerinde tetiklenir. GPU kümesi için ayrıca `rke2-gpu`, EDR/AV ajanları (SEP, XDR, Twistlock) için `rke2-edr`, güvenlik için `rke2-guvenlik`, yükseltme için `rke2-yukseltme`. Yalnız okur; değişiklik önerir, uygulamaz.
---

# RKE2 küme denetimi (her küme)

GPU kümesinde (`gpu-dtx`, `gpu-prod`) önce bu becerinin §1 sürüm envanteri ve §4 node durumu, sonra **`rke2-gpu`**.

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
- **Çok node'a aynı komut → ansible ad-hoc** (tek izin, paralel): `filo-kontrol` becerisi; node başına ssh
  döngüsü kurma (saha G6). Tek node'u derinlemesine incelerken ssh.
- **Bağlamı koru:** çıktıyı sınırla (`--tail`, `head`, `grep`); katman bitince en fazla 5 satır ara özet; sonraki
  katmanda ham çıktıyı tekrarlama (saha G20/G22).

### 0. Ortam (Alp ve Rancher ekranları, 2026-10-15)

- Nonprod Rancher (`rke-nonprod.<kurum>`) **v2.14.3**. Prod Rancher (`rke-prod.<kurum>`) sürümü `[SAHA]`.
- Nonprod downstream RKE2 kümeleri (`gpu-dtx`, `test`, `test-sasviya`, `peaka-poc`, `vibecode-test`, `devops-utilities`
  …) ve `local`: **v1.33.13+rke2r1**. Anthos (GKE) kümeleri de Rancher'da görünür — bu becerinin kapsamı dışı (`anthos-erisim`).
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
- **Uyum + destek sonu (EOL) + en son yama kararı betikten:** `python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py
  kontrol --rancher … --rke2 … --antrea … --rhel …` — çıktıyı olduğu gibi aktar (`rke2-yukseltme`). Güvenlik puan kartı: `rke2-guvenlik`.
- **Uyumluluk yorumu yalnız `surum-uyum` becerisindeki çevrimdışı matristen (`uyum.py`)** (Rancher ↔ RKE2 ↔ RHEL; Antrea notu
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

- etcd logunda `apply request took too long` / `slow fdatasync` (genel) → master diski yavaş; `rhel-performans` becerisi
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
- `hung task` / `blocked for more than` → çekirdek düzeyinde G/Ç ya da kilit; `rhel-sorun` becerisi.
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

**Tek node'da tekrarlayan `antrea-ovs` yeniden başlaması (saha G71 — wor14: 10-12, 10-15, 10-19 05:30):**

Mekanizma (genel — Antrea v2.3.0 upstream manifesti; kümedekini oku, chart farklı olabilir): `antrea-ovs` liveness =
`timeout 10 container_liveness_probe ovs`, `periodSeconds: 10`, `failureThreshold: 5` → OVS **~50 sn** cevap vermezse
kubelet konteyneri öldürür, soketler (`/var/run/antrea/openvswitch/*.sock`, host yolu) yeniden açılana kadar yoktur —
"OVS soketi kayboldu" çoğu zaman budur. Asıl soru: **OVS neden ~1 dk cevap vermedi** — OVS mi takıldı, node mu durdu?

```bash
kubectl -n kube-system get ds -l app=antrea -o jsonpath='{range .items[*].spec.template.spec.containers[*]}{.name}{" "}{.livenessProbe}{"\n"}{end}'
kubectl -n kube-system get pod <antrea-agent-pod> -o jsonpath='{range .status.containerStatuses[*]}{.name}{" restart="}{.restartCount}{" "}{.lastState.terminated.reason}{" exit="}{.lastState.terminated.exitCode}{" bitis="}{.lastState.terminated.finishedAt}{"\n"}{end}'
kubectl -n kube-system logs <antrea-agent-pod> -c antrea-ovs --previous --tail=60     # öldürülmeden önceki son satırlar
```

- `exit=137` → kubelet öldürdü (liveness); başka kod → OVS kendisi çıktı. Event'ler varsayılan ~1 saat tutulur, eski olay
  event'te yoktur — kanıt **node'daki dosyalarda**, konteyner yeniden başlasa da kalır (genel, manifest `hostPath`):

```bash
ls -la --time-style=+%F_%T /var/log/antrea/ /var/log/antrea/openvswitch/                      # node'da (ssh)
# örnek pencere: wor14 olayı 05:30 (yerel) → OVS logu UTC (…Z) yazar, Türkiye UTC+3 → 02:30Z; kendi saatini çevir
grep -h -e "Unreasonably long" -e "blocked" -e "timeout" -e "Dropped" -e "exit" /var/log/antrea/openvswitch/ovs-vswitchd.log* | grep "2026-10-19T02:[1-4]" | tail -30
grep -h "2026-10-19T02:[1-4]" /var/log/antrea/openvswitch/ovsdb-server.log* | tail -20
journalctl --since "2026-10-19 05:15" --until "2026-10-19 05:45" -p warning --no-pager | tail -40
journalctl -k --since "2026-10-19 05:15" --until "2026-10-19 05:45" --no-pager | tail -30
sar -u -q -r -d -s 05:15:00 -e 05:45:00 -f /var/log/sa/sa19 | tail -50                       # o gün: saYY = ayın günü
```

Ayırt et (her satır "tahmin:" ile başlar, kanıt gelince kesinleşir):

| Kanıt | Ne gösterir |
|---|---|
| `Unreasonably long NNNNms poll interval (… user, … system)` — duvar saati büyük, user+system küçük | ovs-vswitchd **çalıştırılmadı/bekledi** (CPU açlığı, G/Ç, VM duraklaması) — OVS'nin hatası değil |
| Aynı dakikada `chronyd` sıçraması, `%steal`, başka node'larda da takılma | hipervizör/datastore (§5b) |
| `hung task` / `blocked for more than` — çağrı yığınında `fanotify`/`fsnotify` ya da `sisap`/`sisevt` | dosya açma, **erişimde tarama yapan güvenlik ajanının** kararını bekliyor (`rke2-edr`) |
| Aynı yığında `nfs_`/`rpc_` | NFS — ama node'da NFS bağlaması yoksa bu yol kapalı (aşağıda) |
| `sar` o pencerede `%iowait`/`await` yüksek, PSI `io` | disk/datastore |
| Hiçbiri yok, yalnız OVS satırları | OVS'nin kendisi — Antrea sürüm/matris (§1), `antrea-agent` logu |

**Eleme — NFS** (Alp, 2026-10-20: "NFS bağlanabiliyor 14 nolu worker"): "sunucuya erişiliyor" NFS'i elemek için yetmez,
soru **node'da asılı bir NFS bağlaması var mı**. Okuma komutları (kilitten geçer — bağlama denemesi yapma, o değişiklik):

```bash
findmnt -t nfs,nfs4 || echo "NFS baglamasi yok"; grep -c " nfs" /proc/mounts
journalctl -k --since -7d --no-pager | grep -i -e "nfs: server" -e "not responding" | tail
showmount -e <nfs-sunucu>; rpcinfo -s <nfs-sunucu> | head; timeout 3 bash -c '</dev/tcp/<nfs-sunucu>/2049' && echo "2049 acik"
kubectl get pods -A -o wide --field-selector spec.nodeName=<node> | grep -v -e kube-system -e cattle-   # node'da PVC'li iş yükü var mı
```

Node'da NFS bağlaması ve "not responding" yoksa NFS o node'un donmasının sebebi olamaz → "kök neden NFS değil" yazılabilir.

**Eleme — güvenlik ajanları (SEP, Cortex XDR, Twistlock):** envanter, kanıt sırası (yığın izi → ajan logu → kaynak → karşılaştırma
→ kapat-gözle) ve "kapatınca düzeldi" doğrulaması **`rke2-edr`** becerisinde (saha G72: wor14'te XDR kaldırılınca node toparlandı;
gözlem sürüyor). Ajanı kök neden yazmadan önce o beceriyi yükle.

**`tmpmounts` birikimi** (`/var/lib/rancher/rke2/agent/containerd/tmpmounts/containerd-mount*`): containerd imaj açarken
geçici bağlama yapar; bağlama çözülemezse (`device or resource busy` — başka bir süreç bağlamayı tutuyor; genel, containerd
#10239'da sebep tüm `/`'u bağlayan izleme ajanıydı) dizin kalır. Belirti olarak oku, sebep yazma:

```bash
ls -la --time-style=+%F_%T /var/lib/rancher/rke2/agent/containerd/tmpmounts/ | tail -40      # oluşma saatleri → olay saatleriyle eşleşiyor mu
findmnt | grep -c tmpmounts                                                                   # hâlâ bağlı olan (0 → yalnız boş dizin)
grep -i -e "failed to unmount" -e tmpmounts /var/lib/rancher/rke2/agent/containerd/containerd.log | tail -20
```

Boş dizinler tek başına zarar vermez (tahmin); saatleri OVS olaylarıyla aynıysa ortak sebebin (takılma anı) izidir.

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

- Çekirdek ve RHEL minor'ün node'lar arası farkı; `ip_forward=1`, swap kapalı (RKE2 gereği — `rke2-kurulum`).
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
- Sürüm yükseltme önerisini matrise bakmadan yapma (`surum-uyum`, `rke2-yukseltme`)
