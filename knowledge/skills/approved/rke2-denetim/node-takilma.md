# rke2-denetim — ek dosya: node takılması ayrıntıları

`rke2-denetim` becerisinin eki: SKILL.md §0, §2, §4 ve §5b'nin komutları ve karar satırları. **Yalnız okuma** — SKILL.md'deki "İlkeler" ve
"Yapmayacakların" burada da geçerli. Metindeki § numaraları SKILL.md bölümleridir; `kubectl …` satırları SKILL.md §0'daki erişim
kalıbıyla çalışır. Yalnız ilgili belirtinin bölümünü oku (dosyanın tamamı gerekmez).

İçindekiler: **A.** `antrea-ovs` yeniden başlaması · **B.** NFS — ele ya da kanıtla · **C.** `tmpmounts` birikimi · **D.** Yük/boyut
sorusu · **E.** conntrack · **F.** Node donması, kısa takılma, VMware VM · **G.** Control plane: rke2-server döngüde çöküyor,
sertifika uyarısı · **H.** Nonprod Rancher ve `test` kümesi tarihli kayıtlar

## A. Tek node'da tekrarlayan `antrea-ovs` yeniden başlaması (saha G71 — wor14: 10-12, 10-15, 10-19 05:30)

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
python3 /root/ai/opencode/knowledge/skills/approved/rhel-sorun/olay-penceresi.py "2026-10-19 05:30" --tz +0300   # ya da UTC damgası: 2026-10-19T02:30:00Z
```

Pencereyi ve tarihli komutları **sen çevirme** — betik yerel↔UTC'yi, `saDD`'yi ve gece yarısını hesaplar; bastığı `journalctl` (uyarı,
çekirdek, rke2), `sar` ve OVS-log komutlarını node'da çalıştır (örnek: wor14 olayı 05:30 yerel = 02:30Z). OVS loglarında aranan:
`Unreasonably long`, `blocked`, `timeout`, `Dropped`, `exit` (`ovs-vswitchd.log*`); aynı dakika desenini
`/var/log/antrea/openvswitch/ovsdb-server.log*` üzerinde de çalıştır.

Sonra SKILL.md §4 "Ayırt et" tablosuna dön — kanıt satırını oradan sınıflandır.

## B. NFS — ele ya da kanıtla (Alp, 2026-10-20: "NFS bağlanabiliyor 14 nolu worker"; saha G80)

"Sunucuya erişiliyor" NFS'i elemez, soru **node'da asılı bir NFS bağlaması var mı**; bağlama sayısı (1/2/3) ve "yüksek I/O" da kanıt
değildir. Okuma (bağlama denemesi yapma — değişiklik):

```bash
findmnt -t nfs,nfs4 -o TARGET,SOURCE,FSTYPE,OPTIONS || echo "NFS baglamasi yok"          # hard/soft, timeo, retrans, vers
journalctl -k --since -7d --no-pager | grep -i -e "nfs: server" -e "not responding" -e "server .* OK" | tail -20   # reset olduysa ayrıca: -b -1
journalctl -k -b -1 --no-pager | grep -A25 "blocked for more than" | grep -e "blocked for" -e "nfs_" -e "rpc_" -e "sisevt" -e "sisap" -e fanotify -e fsnotify | head -40
showmount -e <nfs-sunucu>; rpcinfo -s <nfs-sunucu> | head; timeout 3 bash -c '</dev/tcp/<nfs-sunucu>/2049' && echo "2049 acik"
nfsiostat 5 2 2>/dev/null | head -40                                       # şimdiki gecikme (RTT/exe ms)
kubectl get pods -A -o wide --field-selector spec.nodeName=<node> | grep -v -e kube-system -e cattle-   # node'daki iş yükü (NFS PVC'li hangisi)
```

- Node'da NFS bağlaması ve `not responding` **yoksa** NFS o node'un donmasının sebebi olamaz → "kök neden NFS değil" yazılabilir.
- **NFS bağlaması VARSA:** `not responding` saatleri NotReady/ssh timeout saatleriyle örtüşüyor + takılan sürecin yığınında `nfs_`/`rpc_` → NFS **kanıtlı**.
- Yığında `sisevt`/`sisap`/`fanotify` **ve** `nfs_` birlikte → güvenlik ajanı + NFS etkileşimi kanıtlı (`rke2-edr`). Yığın yoksa
  "SISEVT NFS I/O'sunu engelliyor" bir **mekanizma tahminidir** — kök neden diye yazılmaz.
- `hard` bağlamada sunucu cevap vermezse dosyaya dokunan süreç (kubelet'in volume istatistiği, containerd) süresiz bekler (genel,
  `man 5 nfs` "hard") → node NotReady görünebilir; bu bir **olasılık**, saat örtüşmesi ve yığınla kesinleşir.

## C. `tmpmounts` birikimi

Dizin `/var/lib/rancher/rke2/agent/containerd/tmpmounts/containerd-mount*`: containerd imaj açarken
geçici bağlama yapar; bağlama çözülemezse (`device or resource busy` — başka bir süreç bağlamayı tutuyor; genel, containerd
#10239'da sebep tüm `/`'u bağlayan izleme ajanıydı) dizin kalır. Belirti olarak oku, sebep yazma:

```bash
ls -la --time-style=+%F_%T /var/lib/rancher/rke2/agent/containerd/tmpmounts/ | tail -40      # oluşma saatleri → olay saatleriyle eşleşiyor mu
findmnt | grep -c tmpmounts                                                                   # hâlâ bağlı olan (0 → yalnız boş dizin)
grep -i -e "failed to unmount" -e tmpmounts /var/lib/rancher/rke2/agent/containerd/containerd.log | tail -20
```

Boş dizinler tek başına zarar vermez (tahmin); saatleri OVS olaylarıyla aynıysa ortak sebebin (takılma anı) izidir.

## D. "Sorun yükte olabilir mi?" — boyut/yük sorusu (saha G92)

Anlık `load average`/`free` (özellikle reboot'tan saatler sonra) olay anındaki yükü **göstermez** → "yükten kaynaklı sorun YOK" yazılmaz; en fazla "şu an düşük — olay anı ölçülmedi". Kanıt sırası (okuma):

```bash
kubectl describe node <node> | sed -n '/Allocated resources/,/Events/p'        # requests/limits toplamı vs allocatable (aşırı taahhüt)
sar -q -r -u -s <olaydan 15 dk önce> -e <olay> -f /var/log/sa/saDD | tail -40   # olay penceresinde yük, bellek, %iowait/%steal (node'da)
journalctl -k -b -1 --no-pager | grep -i -e "out of memory" -e oom -e "invoked oom-killer" | tail      # OOM önceki açılışta
kubectl get events -A --field-selector reason=Evicted -o wide | tail; cat /proc/pressure/memory        # tahliye, bellek baskısı
```

Hangi iş yükü (ör. milvus) hangi boyuttaki node'da → bölüm B'deki `--field-selector spec.nodeName=<node>` listesi. Karşılaştır: sorunlu
node'ların **boyutu** (vCPU/RAM) ile sağlamlarınki — sorunlu kümede hem büyük hem küçük node varsa boyut tek
başına sebep değildir (tablo-sonuç çelişkisi, §6). Küçük node'a büyük `limits`'li iş yükü düşüp olay anında bellek/CPU tükeniyorsa
kanıtı `sar`/OOM/eviction satırıdır; yoksa "olabilir".

## E. conntrack (genel bilgi)

kube-proxy açılışta `nf_conntrack_max`'ı `max(32768 × çekirdek, 131072)` yapar (varsayılan
`--conntrack-max-per-core`) → node'lar arası farklı değer çoğu zaman **vCPU farkıdır**, yanlış ayar değil (`nproc` ile
doğrula: 786432 = 24×32768, 393216 = 12×32768). Elle sysctl ile yükseltilen değeri kube-proxy yeniden başlarken kendi
hesabına geri çekebilir (tahmin — restart sonrası değeri oku); kalıcı yol kube-proxy argümanı (`conntrack-max-per-core`,
değişiklik). Tablo dolduysa çekirdek `nf_conntrack: table full, dropping packet` yazar ve **yeni SYN düşer** → ssh
`Connection timed out` verir, `banner exchange` değil (banner'da TCP kurulmuştu).

```bash
nproc; sysctl net.netfilter.nf_conntrack_max net.netfilter.nf_conntrack_count
journalctl -k --since -7d --no-pager | grep -c "table full"        # 0 → tablo hiç dolmamış
```

## F. Node donması, kısa takılma, VMware VM (SKILL.md §4 ve §5b)

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
- OVS günlüğünde `Unreasonably long NNNNms poll interval` (§4 tablo) — birden çok node'da aynı dakikada ise ortak altyapı.
- etcd: `slow fdatasync`, `apply request took too long`, `leader failed to send out heartbeat on time` → disk/CPU duraklaması.
- Çekirdek: `soft lockup`, `rcu_sched … stall`, `blocked for more than 120 seconds` (hung task), `pvscsi`/`sd … abort`
  (disk komutu zaman aşımı), `nfs: server … not responding`.
- Bellek: balloon > 0 (ESX belleği geri alıyor — aşağıda "VMware VM"), `sar -W` swap, PSI `memory`.
- Kendiliğinden düzelen olayın kanıtı **şu an** node'da: reboot ya da log dönmeden topla (birden çok node → ansible ad-hoc).

**Kısa takılma (kendiliğinden düzelen)** — ssh banner timeout sonra tekrar çalıştı, ya da node kısa NotReady→Ready (saha
G65: mas01 01:2x banner timeout → 01:29 `up 229 days`, reboot yok; wor03 00:48 NotReady→Ready). "Bağlantı hatasıydı, sorun
yok" **yazma**: banner timeout'ta TCP kurulmuştu, sshd o an cevap verememişti (§4 tablo). Kullanıcı "neden" diye sorduysa
yeniden denemek cevap değildir; olay penceresini oku — komutları betik üretir (saati ±5 dk, node'un yerel saatiyle):

```bash
python3 /root/ai/opencode/knowledge/skills/approved/rhel-sorun/olay-penceresi.py "00:48" --dk 5 --tz +0300   # journalctl (uyarı, çekirdek, rke2) + sar
cat /proc/pressure/{cpu,memory,io}                                                     # node'da: şimdiki baskı (avg300 = son 5 dk)
```

rke2 journal'ında aranan: `not ready`, `pleg`, `lease`, `deadline`, `timeout`; çekirdekte: hung task / soft lockup / vmxnet / i/o.

Aynı gece birden çok node kısa takıldıysa saatleri yan yana yaz (aynı dakika mı → ortak altyapı: datastore/ESX/ağ).

**VMware VM** (genel; komutlar open-vm-tools ile gelir — yoksa `rpm -q open-vm-tools`):

```bash
vmware-toolbox-cmd stat balloon; vmware-toolbox-cmd stat swap     # ESX bu VM'den bellek geri alıyor mu (MB)
sar -u 1 5 | tail -2                                               # %steal — hipervizör CPU vermiyor mu (performans §3)
journalctl -k --since -3h --no-pager | grep -i -e vmxnet -e pvscsi -e "clocksource" -e "time jump" | tail -20
journalctl -u chronyd --since -3h --no-pager | grep -i -e "step" -e "jump" | tail
```
Balloon/swap > 0, yüksek `%steal`, saat sıçraması (vMotion/snapshot sonrası) → VM'in donması hipervizör kaynaklı
olabilir (tahmin olarak yaz); kanıtı vCenter tarafı (host CPU ready, bellek baskısı, olay zamanı) kesinleştirir.

Kullanıcıdan istenecek vCenter bilgisi ve öneri satırı SKILL.md §5b'de.

## G. Control plane: rke2-server döngüde çöküyor / `context deadline exceeded`, sertifika uyarısı (SKILL.md §2; saha G98)

Saha G98 (2026-10-22): test-sasviya master01, 3 günde 2566 restart; ajan "en temiz çözüm reboot" deyip kanıt toplamadan reboot önerdi
(G11'deki hatanın tekrarı). Restart/reboot **değişikliktir ve kanıtı siler**; önce oku (hepsi okuma, kilitten geçer), sonra en hafif
adımdan öner:

```bash
ssh root@<master> "systemctl show rke2-server -p NRestarts -p ActiveEnterTimestamp; systemctl status rke2-server --no-pager | head -12"
ssh root@<master> "journalctl -u rke2-server -n 200 --no-pager | grep -i -e error -e fatal -e 'context deadline' -e etcd -e 'failed to' | tail -30"
ssh root@<master> "tail -n 300 /var/log/pods/kube-system_etcd-*/etcd/*.log | grep -i -e error -e warn -e 'took too long' -e fdatasync -e leader -e 'no space' | tail -30"
ssh root@<master> "df -h /var/lib/rancher; du -sh /var/lib/rancher/rke2/server/db/etcd; cat /proc/pressure/io; chronyc tracking | head -4"
```

- Diğer master'lardan küme gözüyle: `k8s-sorun` "Durum özeti" (`k8s-ozet.py`) + `kubectl get --raw='/readyz?verbose' | grep -v ' ok$'`.
- Olayın başladığı saat (`ActiveEnterTimestamp`, ilk hata satırı) → `rhel-sorun/olay-penceresi.py` ile o pencerenin journal/sar komutları.
- Ayırt et (her biri "tahmin:" ile, kanıt gelince kesinleşir — genel): etcd logunda `fdatasync`/`took too long` + PSI io yüksek → disk;
  `no space`/alarm → etcd veritabanı/disk doluluğu; etcd logu temiz, yalnız rke2-server tarafında deadline → sertifika/yerel bağlantı
  ya da rke2-server'ın kendisi; saat sıçraması → chrony.
- Öneri sırası (değişiklik — CN/KRİZ yetkisi, kullanıcı karar verir): kanıt çıktıları kaydedildi mi → tek servis
  (`systemctl restart rke2-server`) → node reboot en son. Önerirken hedefi `sunucular: <ad>` satırıyla yaz, yalnız onay iste (AGENTS).
- Sonrası doğrulama: `NRestarts` artmayı kesti mi (10 dk sonra tekrar oku), `k8s-ozet.py` ile node Ready + etcd/apiserver pod'ları.
  "Düzeldi" yalnız bu iki okumayla (G12).

**Sertifika uyarısı** (RKE2 docs security/certificates): 365 gün geçerli; **120 gün** kala (v1.33.1+rke2r1'den beri, öncesi 90)
`CertificateExpirationWarning` event'i çıkar ve sertifika **rke2'nin bir sonraki yeniden başlamasında kendiliğinden yenilenir** → uyarı =
"bu master uzun süredir yeniden başlamadı"; elle rotasyon gerekmez (yenileme/restart değişikliktir — öneri). Bulgu eşiği: 30 günden az.
Kalan günü kafadan hesaplama (saha G65: 120 gün eşiği "120 gün sonra" diye yazıldı; gerçek kalan 84 gündü) — SKILL.md §2'deki
`sertifika-kontrol.py` komutu hesaplar.

## H. Nonprod Rancher ve `test` kümesi — tarihli kayıtlar (Rancher ekranı ve saha; yeniden oku, ezberden yazma)

- **Sürümler (Rancher ekranı, 2026-10-15):** nonprod Rancher **v2.14.3**; prod Rancher sürümü `[SAHA]`. Nonprod downstream RKE2 kümeleri
  (`gpu-dtx`, `test`, `test-sasviya`, `peaka-poc`, `vibecode-test`, `devops-utilities` …) ve `local`: **v1.33.13+rke2r1**.
- **Yaş kalıbı (Rancher, 2026-10-15):** wor01-03 535 gün, wor04-06 304 gün, wor07-14 **13 gün** (son eklenen grup); o gün Unavailable:
  wor03 (eski grup) + wor08-11 (yeni grup), wor07 yeni ama sağlam → önce karşılaştır: wor07 ↔ wor08 ve wor01 ↔ wor03.
- Önceki kayıtlar: 2026-10-12 wor03/wor12/wor14 (saha G7-G11: wor03/wor14'te OVS transaction timeout), 2026-10-15 wor14'te `antrea-ovs`
  liveness hatası; wor14: 10-12, 10-15, 10-19 05:30 (G71, bölüm A).
- Bu satırlar o günün gözlemidir; bugünkü durum kümeden okunur (SKILL.md §4 "Küme tarafı").
