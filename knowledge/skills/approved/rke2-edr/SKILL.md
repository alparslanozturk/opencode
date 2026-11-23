---
name: rke2-edr
description: RKE2/Kubernetes node'larındaki ve RHEL sunuculardaki (SEP yüksek CPU, NFS taraması, istisnalar, donma — §2b) güvenlik ajanlarının (EDR/AV — Symantec SEP, Palo Alto Cortex XDR/Traps, Prisma Cloud/Twistlock Defender) node takılmasına, antrea-ovs/containerd beklemesine, yüksek CPU/belleğe etkisini incelerken ve "ajanı kapattım, düzeldi mi" sorusunu doğrularken kullan. "edr", "xdr", "cortex", "traps", "traps_pmd", "pmd", "sep", "symantec", "sisamddaemon", "antivirüs", "av", "twistlock", "prisma", "defender", "güvenlik ajanı", "xdr kaldırdım", "sep kapat", "sep sınır", "sep limit", "cpu %100", "%100 cpu", "cpu yüksek", "master cpu", "load average", "yük dağılmıyor", "node sağlık", "node durumu", "dmesg", "kernel log", "oom", "erişilemeyen node", "sdcss.slice", "cpuquota", "memorymax", "scan.threads", "ajan kapatınca düzeldi" isteklerinde tetiklenir. Node takılmasının genel incelemesi `rke2-denetim` §4. Yalnız okur; ajanı durdurmak/kaldırmak/istisna eklemek kullanıcının ve güvenlik ekibinin işi.
---

# Güvenlik ajanları (EDR/AV) ve node takılması

Kaynak etiketi: **(Alp)** kurum bilgisi · **(saha G…)** saha gözlemi · **(üretici)** üretici dokümanı · **(genel)** genel bilgi —
"(genel)" ve "tahmin:" maddeleri öneri olarak yazılır, kesin bulgu olarak değil.

## 0. Kurum durumu

- **Güncel (Alp, 2026-11-03):** k8s node'larında OS üzerine **XDR kurulmadı**; **Twistlock (Prisma Cloud Defender)** OS'e kurulu değil,
  kümede **DaemonSet** olarak çalışıyor — süreci OS'te `defender` diye görünür (bu yüzden `systemctl` listesinde servis olarak çıkmaz,
  `ps`'te çıkar). Alp tahmini: "sanırım izleme modunda" — mod (alert / prevent-block) Prisma Console'daki runtime kuralındadır, node'dan
  okunmaz → `[SAHA]`, güvenlik ekibine sor; "izleme modunda, etkisi yok" diye yazma. **SEP** OS'te kurulu; Alp'e göre Symantec'in
  gerçek zamanlı AV taraması + IPS + IDS ürünü (Alp: "sanırım" — bileşenleri sunucuda ölç: `lsmod` `sisap`/`sisevt`, `sisidsdaemon`
  süreci, §1). RHEL makinelerde SEP'in bazı istisnaları (exception) var — hangi yol/süreç `[SAHA]`.
  Ölç (okuma): `kubectl get ds -A | grep -i -e defender -e twistlock` (1. master) · node'da `pgrep -a defender` · `lsmod | grep -i sis`.
  Aşağıdaki maddeler tarihseldir; ajan durumu her olayda §1 komutuyla ölçülür.

- Test kümesi worker'larında üç ajan (Alp, saha G72, 2026-10-20): **SEP** (Symantec, `sisamdagent`; `sisap`/`sisevt` modülleri —
  saha G44), **Cortex XDR** (Palo Alto Networks — eski adı Traps; systemd `traps_pmd`, `/opt/traps/bin/pmd`, sürüm `/opt/traps/version.txt`, araç `/opt/traps/bin/cytool` — Palo Alto Cortex XDR Agent belgesi), **Twistlock** (Prisma Cloud Defender,
  `/usr/local/bin/defender`). Kurum SEP kaynak sınırı: CPU %400, MemoryHigh 2G, Max 3G (saha G44, kaynak `08-sep-sinirlama` `[SAHA]`).
- **Sınır SEP'in bütün servislerinde olmalı (Alp, 2026-11-23):** SEP'in üreticinin durum betiği `/usr/lib/symantec/status.sh` — saha
  ekranı (srvsatellite, 2026-11-23, SEPM 14.3.9681.9100): daemon'lar `cafagent`, `sisamdagent`, `sisidsagent`, `sisipsagent`, `sisevtd`
  (hepsi running), modüller `sisevt`, `sisap` (loaded). Kurum ekibinin `08-sep-sinirlama` playbook'u hepsine sınır koymalı. Yalnız
  `sisamdagent`'a bakıp "sınırlı" deme — her birini ölç (salt-okunur; systemd 257'de denendi; systemd birim adı daemon adından farklıysa
  listede görünür):
  ```bash
  /usr/lib/symantec/status.sh
  for u in $(systemctl list-units --all --plain --no-legend --type=service 'sis*' 'caf*' 'sdcss*' | awk '{print $1}'); do
    systemctl show "$u" -p Id -p ActiveState -p Slice -p CPUQuotaPerSecUSec -p MemoryHigh -p MemoryMax | paste -sd' '; done
  ```
  `infinity` = o birimde sınır yok. **Kurum playbook'u sınırı slice'a koyar:** `08-sep-sinirlama.yaml` → `sdcss.slice` ve
  `sdcss-amd.slice` (kurumsal bilgi, SEP kurulum akışı, 2026-11-04). Asıl denetim:
  ```bash
  systemctl show sdcss.slice sdcss-amd.slice -p Id -p CPUQuotaPerSecUSec -p MemoryHigh -p MemoryMax
  ```
  Beklenen (CPU %400, MemoryHigh 2G, Max 3G) systemd'de `CPUQuotaPerSecUSec=4s MemoryHigh=2147483648 MemoryMax=3221225472`
  (ölçüldü: systemd 257, `systemd-run -p CPUQuota=400% -p MemoryHigh=2G -p MemoryMax=3G`). Servislerin `Slice=` alanı bu iki slice'tan
  biri değilse sınır o servise işlemiyor → "sınır eksik: <servis> (Slice=…)". Sürüm: RU9 en son kurulan, RU4 da olabilir (Alp) — her
  sunucuda `rpm -qa | grep -iE "sdcss|symantec"`; saha kaydı: stlrancherwor07-14'te `14.3.9681.9100` (2026-09-30 kurulum).
- 2026-10-20 wor14: önce ssh zaman aşımı + `antrea-agent` liveness `connection refused`; Alp **XDR'ı kaldırdı** → Ready, antrea
  2/2 Running (ajan raporu). SEP belki kapatılacak; **Twistlock kalacak** (kaldırılamaz). wor14'te ağır iş yükü: Milvus.
- **2026-10-20 akşam (Alp):** XDR (`traps_pmd`) wor07-14'te `disable`; SEP de kapatılıyor (Alp kararı — iki ajan birlikte, tüm
  grupta). Bundan sonraki olayda ilk soru: ajanlar gerçekten kapalı mı (`systemctl is-active`, `lsmod`) — kapalıysa sebep
  ajanların dışında aranır (hipervizör §5b, OVS/Antrea `rke2-denetim` §4).
- **2026-10-21 sabah (saha G77):** wor12 ve wor13 yine erişilemez (ansible ad-hoc 60 sn'de takıldı; wor13 07:03'te Ready'di).
  XDR 10-20'de yalnız `disable` edildi (`stop` görünmedi) → önce `systemctl is-active traps_pmd` ve `lsmod | grep traps` ile
  gerçekten kapalı mı oku. **Kapalıysa** bu olay XDR adayını zayıflatır (§4: tekrar = aday elenir).
- wor14'ün önceki olayları: 10-12, 10-15, 10-19 05:30, 10-20 (saha G7-G11, G48, G71) — aralık 1-4 gün.

**Ajanlar gerçekten kapalı mı — node başına tek tablo** (G76: XDR yalnız `disable` edilmişti, `stop` görünmedi; "kapalı" sanıldı):

```bash
ansible <grup|wor07,wor08,> -i <envanter> -m shell -f 20 -T 10 --task-timeout 30 -t cikti/filo/edr -a 'echo sep_servis=$(systemctl is-active sisamdagent 2>/dev/null); echo sep_acilista=$(systemctl is-enabled sisamdagent 2>/dev/null); echo sep_modul=$(lsmod | awk "/^sis/{printf \"%s,\", \$1}"); echo xdr_servis=$(systemctl is-active traps_pmd 2>/dev/null); echo xdr_acilista=$(systemctl is-enabled traps_pmd 2>/dev/null); echo xdr_modul=$(lsmod | awk "/^traps/{printf \"%s,\", \$1}"); echo twistlock=$(pgrep -f /usr/local/bin/defender >/dev/null && echo calisiyor || echo yok); echo acik_gun=$(awk "{print int(\$1/86400)}" /proc/uptime)'
python3 /root/ai/opencode/knowledge/skills/approved/filo-kontrol/filo-tablo.py cikti/filo/edr --kv
```

`*_servis` = şu an çalışıyor mu (`active`), `*_acilista` = açılışta başlar mı (`enabled`/`disabled`/`not-found`), `*_modul` = yüklü
çekirdek modülleri (servis durdurulsa da modül kalabilir — "kapalı" demek için ikisi de boş/`inactive` olmalı), `acik_gun` = son
açılıştan beri gün (reboot sonrası modül gelmiş mi). Ölçüldü (ajansız makinede): `inactive · not-found · (boş)`. Kilitten geçiyor.

## Önce sor (tek mesaj, numaralı — oturumda/kurumsal bilgide cevabı varsa sorma)

1. **Belirti:** node takılması mı, yüksek CPU/bellek mi, NFS yavaşlığı mı, donma mı — ne zaman, ne sıklıkta.
2. **Nerede:** hangi node/sunucu(lar); küme node'u mu, düz RHEL sunucu mu.
3. **Değişiklik oldu mu:** ajan kapatıldı / kaldırıldı / istisna eklendi mi, ne zaman ("kapatınca düzeldi" iddiası §4 ile doğrulanır).
4. **Amaç:** "sebep ajan mı" sorusu mu (§3 kanıt), ilgili ekibe öneri / istisna listesi mi (§5).

Sorma: hangi ajan kurulu, süreçleri, CPU payı — §1 okur. Ajanın modu/politikası konsoldadır; node'dan okunamıyorsa "bilinmiyor".

## 1a. Node sağlığı — `node-durum.py` (CPU · RAM · disk · ağ · loglar; Alp 2026-11-23)

"Node/sunucu durumu", "neden yavaş", "dmesg/kernel log", "OOM", "%100" — **tek betik, beş eksen** (yalnız CPU sorusunda `node-cpu.py`, aşağıda):

```bash
python3 /root/ai/opencode/knowledge/skills/approved/rke2-edr/node-durum.py komut <node> [--saat N]   # log penceresi, varsayılan 24
#  1) master'da kubectl (IP, koşullar, taint, olaylar, restart, top) — master erişilmezse SIRADAKİ master (k8s-sorun)
#  2) node'da: top + /proc/diskstats + /proc/net/dev iki örnek, meminfo, df/inode, conntrack, PSI, D-state, çekirdek logları
#     (journal -k son N saat · dmesg · /var/log/messages), journal uyarıları birim başına, sysstat durumu
{ <1. komut>; <2. komut>; } | python3 /root/ai/opencode/knowledge/skills/approved/rke2-edr/node-durum.py tani <node> -
```

- **Node'a ssh olmuyorsa** (banner timeout / refused) yalnız 1. çıktıyı ver → **erişilemeyen node modu** (çıkış 4): Kubernetes'in son bildiği
  koşullar, `unreachable` taint, olaylar, restart; sonraki adım vCenter/konsol. Kümede olmayan sunucuda yalnız 2. komut (çıkış 0/1).
- Eşikler yalnız kaynaklı: kubelet varsayılan tahliye eşikleri (memory.available<100Mi, nodefs.available<10%, nodefs.inodesFree<5% —
  kubernetes.io "Node-pressure Eviction"). Disk await/%util, ağ hızı, PSI, conntrack **sayı olarak** basılır, eşik uydurulmaz.
- Çekirdek mesajları sınıflanır (OOM, hung task, lockup/rcu stall, disk/FS hatası, conntrack dolu, link down/up, Call Trace, segfault;
  anlamları `rhel-sorun` §3), her sınıf için ilk/son satır. **"Desen yok" ≠ "sorun yok":** betik kaynak derinliğini yazar (journal kalıcı
  mı, boot sayısı, dmesg ilk satırı, en eski messages) — kalıcı olmayan journal'da reboot öncesi görünmez.
- Geçmiş eğilim: aynı pencereyle `rhel-performans/sar-ozet.py --son <N>h` (disk, ağ, swap, kuyruk dahil). sysstat kurulu/açık değilse betik söyler.
- Çıkış: 0 bulgu yok · 1 bulgu · 2 eksik · 3 yanlış sunucu (hostname) · 4 node erişilemedi. Ölçüldü: bu makinede node komutu (~2.5 sn) +
  saha değerleriyle (erişilemeyen master, OOM/dolu disk/ağ hatası).

## 1a-2. Yalnız CPU %100 — `node-cpu.py` (saha G127)

"Master/node neden %100 CPU?", "yük neden dağılmıyor?" sorusunda **elle ps/top yorumlama — betiği çalıştır** (2026-11-23: ajan başka kümeye,
sonra başka master'a baktı, `kubectl top node`'a "SAHTE" deyip kaynaksız açıklama uydurdu; gerçek sebep SEP `sisamddaemon` %356 / 4 çekirdek,
%94 sy idi — hiç ölçülmedi):

```bash
python3 /root/ai/opencode/knowledge/skills/approved/rke2-edr/node-cpu.py komut <node>   # iki salt-okunur komut basar
#  1) 1. master'da kubectl → node IP'si, kapasite, top node, node'daki pod'lar + top pod
#  2) node'un KENDİSİNDE (IP 1. çıktıdan) → hostname, nproc, yük, top (2 sn örnek), SEP slice kotası/throttling
{ <1. komut>; <2. komut>; } | python3 /root/ai/opencode/knowledge/skills/approved/rke2-edr/node-cpu.py tani <node> -
```

Betik: hostname node adıyla eşleşmezse **DUR** (çıkış 3, sonuç yazma) · `kubectl top node − pod'ların toplamı = pod dışı süreçler` · süreçleri
sahibine göre toplar (SEP / XDR / Twistlock / Kubernetes / izleme) · SEP kotası ≥ çekirdek sayısıysa "sınır bu makinede ETKİSİZ" · `top` ile
`kubectl top node` farklıysa ikisini de gösterir, "sahte" demez. Çıkış: 0 bulgu yok · 1 bulgu · 2 eksik · 3 yanlış sunucu. Sonra §2c
(sınır/istisna değerlendirmesi) ve §3 (olay anı kanıtı). Ölçüldü: bu makinede node komutu (SEP yok → yanlış bulgu yok) + saha değerleriyle.

## 1. Envanter (okuma)

Tek node (ssh):

```bash
systemctl list-units --type=service --all --no-pager | grep -i -e sisam -e sdcss -e traps -e cortex -e twistlock -e defender -e falcon
ps -eo pid,pcpu,rss,etime,cmd --sort=-pcpu | grep -i -e sisamd -e /opt/traps -e defender -e falcon | grep -v grep | head -15
lsmod | grep -i -e sisap -e sisevt -e traps -e falcon
cat /proc/sys/kernel/tainted; journalctl -k -b --no-pager | grep -i -e "module verification" -e traps -e sisap -e sisevt | tail -10
```

Küme tarafı (DaemonSet olarak kurulanlar): `kubectl get ds -A | grep -i -e twistlock -e defender -e cortex -e xdr`.

Bütün grup (ansible ad-hoc, tek izin — `filo-kontrol`); sorunlu ve sağlam node'ları yan yana koy (wor07 sağlam ↔ wor03, wor08, wor14):

```bash
ansible <grup> -i <envanter> -m shell -o -f 20 -T 10 --task-timeout 30 -a 'systemctl is-active sisamdagent traps_pmd | tr "\n" " "; lsmod | grep -c -i -e traps -e sisap; uptime'
```

## 2. Neden önemli

- Üçü de dosya/süreç olaylarını çekirdek düzeyinde yakalar: SEP Auto-Protect erişilen ya da değişen her dosyayı tarar, yoğun disk
  kullanan sunucuda CPU/bellek yükselir, çözüm sık erişilen yollara istisna (üretici: Broadcom KB 237314). Cortex XDR çekirdek
  kipinde `traps.ko` modülü yükler (`/lib/modules/<çekirdek>/traps/traps.ko`); 5.0+ çekirdekte eBPF tabanlı kullanıcı kipi de var
  (üretici: Cortex XDR Linux dokümanı). Twistlock Defender konteynerlerin dosya sistemi olaylarını izler (üretici: Prisma Cloud).
- Konteyner node'unda dosya olayı çok: imaj açma (tmpmounts), overlay katmanları, Milvus gibi yoğun yazan iş yükü. tahmin: aynı
  olayı birden çok ajan sırayla bekletirse, ajan yavaşladığında dosya açan süreçler (containerd, ovs-vswitchd, sshd) bekler →
  node "donmuş" görünür. Bu bir **mekanizma adayıdır**, kanıt §3'tedir.
- **Cortex XDR ve Kubernetes (üretici):** "Palo Alto Networks supports only Cortex XDR agent deployments carried out with the
  original YAML installation package generated directly from the Cortex XDR management console and carried out as a DaemonSet"
  (Install the Cortex XDR Agent for Kubernetes Hosts). Node'a systemd hizmeti olarak kurulan ajan bu tanıma uymuyor olabilir →
  güvenlik ekibine **soru** olarak ilet ("Kubernetes node'u için DaemonSet kurulumu mu kullanılmalı?"); kesin hüküm yazma.
- SEP IDS bileşeni varsayılan olarak her sürece (konteynerler dahil) girer, çok sayıda `sisidsdaemon` görülebilir; çözüm
  `/opt/Symantec/sdcssagent/IDS/system/LocalAgent.ini` → `Enable Container Monitor=0` + reboot, 14.3 RU1 ve üstü (üretici:
  Broadcom KB 240470). Değişikliktir — SEP yöneticisi yapar.

## 2b. SEP — yüksek CPU, donma, NFS: belgede ne var, ne yok (araştırma 2026-11-03, Alp sorusu)

Soru (Alp): "Aşırı CPU kullanımından kaynaklı sunucu donması ve NFS performansını etkiliyor mu?" — RHEL sunucular için de geçerli.
- **Yüksek CPU — belgeli:** "By default, Auto-Protect will scan any file that is accessed or modified… On busy servers, this activity can
  cause high CPU / Memory usage" (Broadcom KB 237314; Linux Agent 14.3 RU1+). Hangi dosyaların tarandığı: `su - sisips -c
  "./sisipsconfig.sh -approfile 10"` → `/var/log/sdcsslog/amdlog/profile.log` (yalnız "Completed" satırlar taranmıştır). `top`'taki CPU
  tüm iş parçacıklarının toplamıdır — tek başına "aşırı" kanıtı değil.
- **NFS (ağ dosyaları) — belgeli:** "For best performance, files should be scanned by the local host and not by remote clients" — SEPM'de
  Policies → Virus and Spyware Protection → Linux Settings → Auto-Protect → Scan Details → Advanced Scanning and Monitoring → **"Scan files
  on remote computers"** (Broadcom KB 162599; sürüm belirtilmemiş). Bu ayar sizde açık mı `[SAHA]` — SEP yöneticisi. Saha logu
  `SISEVT … fopmap_check_entry: patched fop … (nfs4)` SEP modülünün NFS4 dosya işlemlerine bağlandığını gösterir; **etkisinin büyüklüğü
  ölçülmedi** (ölçüm: `rhel-nfs` §4 `nfsiostat`, SEP'li ↔ SEP'siz ya da ayar önce ↔ sonra).
- **İstisnalar çalışmıyor olabilir — belgeli:** ROOT/HOME/BIN/ETC/USR/OPT önek değişkeniyle yazılan Linux istisnası **geçersiz** olur →
  sisamddaemon yüksek CPU; çözüm önek `[NONE]` + tam yol (Broadcom KB 250717; SEP/SES 14.3 RU1–RU5, SEPLINUX-1552). Kurumdaki RHEL
  istisnalarının yazımı `[SAHA]` — SEP yöneticisine sorulacak ilk şey.
- **Donma (hung task) — kısmen belgeli, SEP için doğrudan değil:** Red Hat 5201171 (RHEL 7.9–10): güvenlik ajanı fanotify izin
  yanıtını beklerken, kendisi **NFSv4 ID eşleme upcall'ını** (`request-key` → `/usr/sbin/nfsidmap`) bekliyor → kilitlenme, "blocked for
  more than 120 seconds", yığında `fanotify_handle_event`/`fsnotify`. Listede **Twistlock Defender** var; Symantec yalnız VMware vsep ile
  birlikte anılıyor, SEP'in `sisap/sisevt` modülleri anılmıyor — SEP'in fanotify kullanıp kullanmadığı bilinmiyor. Red Hat 2302001: eski
  Symantec CSP `sisfim` modülünde hung task (RHEL 6). Yani "SEP sunucuyu dondurur" **belgede yok**; kanıt yalnız olay anının yığını (§3.1).
- **Sonuç yazımı:** "SEP yavaşlatıyor/donduruyor" ancak §3 kanıtıyla; yoksa "belgede mümkün gösterilen mekanizma şu, sizde ölçülmedi".
- **Kurum (Alp, 2026-11-03):** "Scan files on remote computers" sanırım **açık** `[SAHA]` — SEP yöneticisi doğrular; ajan sürümü "1.4 diye
  duydum, 1.6 downgrade / 1.3 upgrade yapıyoruz galiba" `[SAHA]` → `sep-istisna.py komut` paket adını okur. Saha ekranı (2026-11-03): `07-sep-install` kaynağı Satellite `pub/SAL/1.4` —
  Broadcom depo dizini; KB 222816 `SAL/1.4`'ü 14.3 RU9 ile eşler, başka bir Broadcom KB RU4 ile (çelişkili). RU9 ise KB 250717'deki
  önek hatası (RU1–RU5) bu sürümde **geçerli olmayabilir** — paket sürümü okunmadan söyleme.

### İstisna listesi — sunucudan, tam yol, kaynaklı (`sep-istisna.py`)

```bash
B=/root/ai/opencode/knowledge/skills/approved/rke2-edr
python3 $B/sep-istisna.py komut           # basılan ssh komutunu <sunucu> ile çalıştır:
ssh root@<sunucu> '<basılan komut>' | python3 $B/sep-istisna.py liste -
```

Yalnız sunucuda **var olan** yolları üç bölümde basar: **KAYNAKLI** (Broadcom KB 244505: /proc /sys /dev /var/spool /var/lib/rpm ·
RKE2 yolları — UiPath Automation Suite belgesi, SUSE'nin resmi listesi yok · MongoDB Production Notes: dbPath + log yolu, mongod.conf/
süreçten okunur · NFS bağlamaları — KB 162599, tercih politikada uzak taramayı kapatmak), **KURUM KARARI** (`/data` — Alp), **KAYNAKSIZ
ADAY** (PostgreSQL veri dizini — resmi belge yok, topluluk görüşü; docker/podman deposu). Yazım: önek `[NONE]` + tam yol (önek değişkeni
14.3 RU1–RU5'te geçersiz, KB 250717); 14.3 RU1'den beri alt dizinler her zaman dahil (Broadcom TechDocs). `/tmp`, `/var/run` bilinçli
dışarıda (güvenlik ekibi). İstisnayı SEPM'de SEP yöneticisi uygular; sonra KB 237314 profiliyle CPU'nun düştüğü ölçülür.

## 2c. SEP/EDR kaynak sınırı — sunucunun rolüne göre değerlendirme (araştırma 2026-11-23, Alp sorusu)

Alp (2026-11-23): "SEP sınırlamada doğrusu nedir bilemiyoruz … sunucu veritabanı mı, Kubernetes node'u mu, Mongo mu bilmediğimiz için
böyle ayarladık … derin bir çalışma yapmadık." Bugünkü ayar **her sunucuda aynı**: `sdcss.slice` + `sdcss-amd.slice` CPU %400, MemoryHigh
2G, MemoryMax 3G (§0). Bu bölüm karar vermez; değeri Alp ve güvenlik ekibi **ölçümle** seçer.

**Kaynaklar ne diyor:**
- **Üretici (Broadcom KB 236571 "High CPU usage by sisamddaemon", SEP 14.3 RU1+):** cgroup/systemd sınırından **hiç söz etmez**. Belgelenen
  kaldıraç tarama iş parçacığı sayısıdır — `/opt/Symantec/sdcssagent/AMD/system/AntiMalware.ini` **ve** `AntiMalware.ini.1`:
  `amdmanagement.ap.scan.threads=` (gerçek zamanlı/AutoProtect) ve `amdmanagement.ondemand.scan.threads=`. "By default, SEP assigns in
  threads as much as CPU assigned to the system"; en az 4, en çok 16; ≥16 çekirdekte yarıya ya da çeyreğe indirilebilir; "The minimum
  recommended amount of CPU core … with SEP client is 4". Uygulama: null policy (`su - sisips` → `./sisipsconfig.sh -r`) → `/usr/lib/symantec/stop.sh`
  → iki dosya → `start.sh` → `./sisipsconfig.sh -s` (değişiklik — güvenlik ekibiyle, önce test sunucusunda).
- **systemd (man systemd.resource-control, systemd 257):** `CPUQuota` yüzdesi **tek CPU'ya göredir** — %400 = en çok 4 CPU'luk süre, makine
  kaç çekirdekli olursa olsun (4 çekirdekte fiilen sınırsız, 64 çekirdekte payı küçük). `MemoryHigh` = "throttling limit … main mechanism";
  `MemoryMax` = aşılırsa "out-of-memory killer is invoked inside the unit" — "use MemoryMax= as the last line of defense". Yani 3G aşılırsa
  **SEP süreci öldürülür, koruma kesilir**. `CPUWeight` (1–10000, varsayılan 100) yalnız CPU için yarış olduğunda pay böler, boşta kısmaz.
- **Hesap (kaynak değil, aritmetik):** iş parçacığı varsayılanı çekirdek sayısı; 32 çekirdekli sunucuda 32 tarama iş parçacığı %400 kotaya
  sıkışır. Tahmin: gerçek zamanlı tarama dosya açılışını bekletiyorsa kısılan CPU uygulama gecikmesine döner — belgede yok, ölç.
- **Veritabanı — MongoDB (Production Notes, "MongoDB dbPath"):** AV/EDR taramasından **veri yolu (`storage.dbPath`) ve log yolu
  (`systemLog.path`) hariç tutulmalı**: "The I/O and CPU costs to scan these files may significantly decrease performance without
  providing any security benefits"; tutulmazsa "the scanner could quarantine or delete important files … corrupt your database". DB
  sunucusunda asıl iş sınır değil **istisna** (§2b istisna listesi). PostgreSQL için resmi bir AV notu bulunamadı (arama 503 verdi) — `[araştırılmadı]`.
- **Kubernetes node (kubernetes.io "Reserve Compute Resources for System Daemons", v1.34 — sayfa özetinden, birebir alıntı değil):**
  kubelet `systemReserved`, sshd/udev gibi **işletim sistemi daemon'ları** içindir — node'a doğrudan kurulu SEP/XDR bu sınıftadır;
  ayrılmazsa pod'lar o kaynağı da kullanır. Pod olarak çalışan ajan (Twistlock Defender DaemonSet) `systemReserved`'a girmez, kendi pod
  `resources`'ıyla sınırlanır. Sayfa: önce pod'lar için Allocatable'ı uygula; `systemReserved`'ı cgroup ile **zorlamak** kritik servisleri
  aç bırakabilir — yalnız ölçümden sonra. RKE2'de `kubelet-arg` ile verilir `[doğrula: rke2 config.yaml, kurum kümesi]`.

**Ölçüm (salt-okunur; sınır var mı, değdi mi):** bir hafta, aynı saatlerde, rol başına en az bir sunucu.

```bash
for s in sdcss.slice sdcss-amd.slice; do echo "== $s"; systemctl show $s -p CPUQuotaPerSecUSec -p MemoryHigh -p MemoryMax -p MemoryCurrent -p MemoryPeak -p CPUUsageNSec | paste -sd' ';
  grep -E 'nr_throttled|throttled_usec' /sys/fs/cgroup/$s/cpu.stat; tr '\n' ' ' < /sys/fs/cgroup/$s/memory.events; echo; done
grep -E 'scan.threads' /opt/Symantec/sdcssagent/AMD/system/AntiMalware.ini; nproc
```

Okuma: `nr_throttled`/`throttled_usec` artıyorsa CPU kotası tarama hızını kısıyor · `memory.events` `high` artıyorsa MemoryHigh'a değiyor
(yavaşlatılıyor), `max`/`oom_kill` > 0 ise SEP **öldürülmüş** (koruma kesintisi — raporda en üstte) · `MemoryPeak` gerçek tepe.
(Alanlar bu makinede `system.slice` üzerinde doğrulandı; SEP slice'ı sahada yoksa "sınır uygulanmamış" de.)

**Rol → değerlendirme (öneri iskeleti; sayı ölçümden gelir):**

| Rol | Önce | Sınır için bakılacak |
|---|---|---|
| Veritabanı (Mongo, Postgres …) | Veri + log yolu istisnası (MongoDB belgesi) | throttling varken sorgu gecikmesi; MemoryMax'e değiyorsa yükselt |
| Kubernetes node | Ajan toplamı kubelet `systemReserved`'a sığıyor mu | node'da `kubectl describe node` Allocatable; Defender pod limiti ayrı |
| Uygulama / genel | Bugünkü değer başlangıç | `oom_kill` > 0 ya da sürekli throttling → değeri artır ya da `CPUWeight`'e geç |
| Az çekirdekli (≤4) | Üretici en az 4 çekirdek önerir | %400 kotası zaten sınırsız — sınır yerine iş parçacığı |

Önerilen ilke (Alp onayı bekler): **MemoryHigh asıl sınır, MemoryMax yalnız taşma koruması** (man); CPU kotası ile tarama iş parçacığı sayısı
birbirine uygun (iş parçacığı ≤ kota CPU sayısı, üretici alt sınırı 4); DB'de önce istisna.

## 3. Kanıt — sebep ajan mı? (en güçlüden zayıfa)

1. **Takılma anının çekirdek yığını:** `hung task` / `blocked for more than` izinde ajan modülü (`[traps]`, `[sisap]`, `[sisevt]`) ya
   da `fanotify`/`fsnotify` → ajanı doğrudan gösterir. Reset sonrası: `journalctl -b -1 -k` (journal kalıcıysa — `rke2-denetim` §5b).
2. **Ajan logu, olay saatinde:** XDR `/var/log/traps/` (kurulum logu `/var/log/traps-install.log`), SEP `/var/log/sdcsslog/`;
   `ls -la --time-style=+%F_%T` ile o saate düşen dosyayı bul, `grep` ile pencereyi oku.
3. **Ajanın kaynak durumu:** `ps` CPU/RSS; SEP cgroup sayaçları (`systemctl show sisamdagent -p ControlGroup` → o yolda
   `memory.events` `high`/`max`, `cpu.stat` `nr_throttled`). XDR `lted` süreçleri bellek sayfası paylaşır — RSS toplamı yanıltır,
   üretici `smem` (PSS) öneriyor.
4. **Karşılaştırma:** ajanı olan/olmayan, sorunlu/sağlam node'lar (§1 ansible). Ajan her node'da aynıysa tek başına sebep değildir;
   iş yüküyle birlikte değerlendir (Milvus hangi node'larda: `kubectl get pods -A -o wide | grep -i milvus`).
5. **Kapat-gözle** (değişiklik — kullanıcı yapar): bir node'da **tek** ajan, gözlem süresi §4. Aynı anda iki ajan kapatılırsa
   hangisinin etkili olduğu bilinemez — sırayla.

Yalnız 5 varsa rapor dili: **"tahmin ediyorum: XDR — emin değilim; <tarih> kaldırıldı, <tarih>'e kadar gözlemde"**. Tersi de
aynı: "OVS'in kendi donması, XDR ile bağlantılı değil" demek için de kanıt gerekir — soket kaybı ve crash logu olmaması OVS'in
mi takıldığını, node'un mu durduğunu ayırmaz; ayıran `rke2-denetim` §4 tablosundaki `poll interval` satırıdır. "Kök neden XDR", "kernel modülü OVS ve
containerd'yi engelliyordu" gibi cümleler yalnız 1 ya da 2 ile yazılır (saha G72: ajan yığın izi göstermeden yazdı).

## 4. "Kapatınca düzeldi" nasıl doğrulanır

- Hemen sonraki `Ready` / `2/2 Running` / düşük load **kanıt değil**: node olaylar arasında zaten günlerce sağlam. Load tek başına
  kararlılık ölçütü değildir; ölçüt olayın **tekrarlamaması**.
- **Zaman çizelgesini yaz** (saha G73: reboot 14:24 → XDR durdurma 15:44 → "stabil" 15:50): ajandan önce reboot olduysa düzelme
  ajana yazılamaz, reboot'a da yazılamaz — ikisi de "tahmin". Tek değişkenli deneme: önce reboot, gözlem; sonra ajan.
  `journalctl --list-boots | tail -3`, `systemctl show traps_pmd -p InactiveEnterTimestamp` (ajan ne zaman durdu) ile saatleri
  komutla al, kafadan yazma.
- Gözlem süresi: en uzun olay aralığının en az iki katı (wor14: aralık ≤4 gün → **en az 7-8 gün**, ~2026-10-28'e kadar).
- Başlangıç değerini **şimdi** yaz, sonra karşılaştır:

```bash
kubectl -n kube-system get pods -l app=antrea -o wide --field-selector spec.nodeName=<node> -o jsonpath='{range .items[*].status.containerStatuses[*]}{.name}{" restart="}{.restartCount}{"\n"}{end}'
kubectl get node <node> -o jsonpath='{range .status.conditions[*]}{.type}{" "}{.status}{" "}{.lastTransitionTime}{"\n"}{end}'
kubectl get events -A --field-selector involvedObject.name=<node> -o custom-columns='ZAMAN:.lastTimestamp,NEDEN:.reason' | tail
```

- Node'da (ssh): `uptime`, `lsmod | grep -i traps` — kaldırılan ajanın modülü yüklü kalmış olabilir (tahmin: reboot'a kadar);
  yüklüyse "kaldırıldı" yazma, "hizmet kapalı, modül yüklü" yaz. `ls /var/log/antrea/openvswitch/` dosyalarında yeni
  `Unreasonably long` satırı var mı (`rke2-denetim` §4).
- Aynı dönemde başka node'larda (XDR'ı duran) olay sürüyor mu: sürüyorsa ve wor14 sakinse aday güçlenir; wor14'te tekrar olursa XDR
  elenir, sıradaki aday (SEP, Twistlock, hipervizör §5b).

## 5. Kalan ajanlar için öneri (değişiklik — ilgili ekip uygular, test kümesinde önce)

- **Twistlock (kalıyor):** Defender kaynak kullanımı (`kubectl top pod -n <ns>` ya da node'da `ps`), Milvus pod'larında runtime
  dosya sistemi izleme olayı yoğun mu — Prisma konsolunda. Öneri: Milvus için runtime kuralı istisnası, Defender'a kaynak sınırı;
  sürüm notu: fsmon_v2 34.01'den beri varsayılan dosya sistemi izleme süreci (üretici: Prisma Cloud) — kurumdaki sürüm `[SAHA]`.
- **SEP (kapatılmayacaksa):** Auto-Protect profili (`su - sisips -c "./sisipsconfig.sh -approfile 10"` → `/var/log/sdcsslog/amdlog/profile.log`;
  KB 237314 — değişiklik değil ama ajan yükü getirir, kullanıcıya sor), konteyner yollarına istisna (`/var/lib/rancher`,
  `/var/lib/kubelet`, `/run/containerd`, `/var/run/antrea`, `/var/log/antrea`), IDS konteyner izleme (§2).
- **Birden çok EDR/AV aynı node'da:** ajanların birbirini istisna listesine alıp almadığı güvenlik ekibine sorulur `[SAHA]`.

## Yapmayacakların

- Ajan hizmetini durdurma, kaldırma, modül boşaltma (`rmmod`), istisna ekleme, `LocalAgent.ini`/`AntiMalware.ini` düzenleme —
  hepsi değişiklik; kullanıcıya öner.
- Ajanın kendi tanı aracını (profil, tarama) sormadan çalıştırma.
- **Açılışı değiştiren öneri** (`/etc/modprobe.d/` kara liste, `dracut --force`, grub/çekirdek parametresi) yalnız modülün sebep
  olduğu §3.1-3.2 kanıtıyla ve **geri alma adımıyla** önerilir; yanlış initramfs node'u açılmaz bırakabilir (genel). Ajanı kaldırmak
  güvenlik ekibinin kararıdır. Saha G79: kanıt yokken kara liste + `dracut --force` önerildi.
- Kullanıcı bir adayı kapattıysa ("SEP ve XDR'ı unut, ben kapattım") o aday için öneri üretme; sıradaki katmana geç (`rke2-denetim`
  §4-§5b: node logu, hipervizör, OVS) ve kapalılığı yalnız bir kez komutla doğrula (`systemctl is-active`, `lsmod`).
