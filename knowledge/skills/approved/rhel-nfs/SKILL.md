---
name: rhel-nfs
description: RHEL NFS istemcisi — açılışta NFS dizini boş/eksik görünüyor, yeniden bağlayınca (mount) dizinler geliyor, uygulama/konteyner NFS'e yazamıyor ya da yerel diske yazmış olabilir, NFS yavaş. Deterministik `nfs-tani.py` (salt-okunur: fstab/etkin seçenekler, bu açılıştaki bağlama zamanı ve hataları, docker/podman konteynerinin NFS'ten önce başlayıp başlamadığı, motor servis sırası, readahead) + kaynaklı karar. "nfs", "mount", "dizin gelmiyor", "dizin boş", "açılışta", "reboot sonrası", "yeniden mount", "remount", "nfsidmap", "idmapd", "readahead", "nfsiostat", "mountstats", "nfs performans", "nfs yavaş", "nfsv3", "nfsv4", "nfs v3", "nfs v4", "vers=3", "vers=4", "nconnect", "retrans", "soft mount", "rsize", "wsize", "nofail", "_netdev", "medya kayıtları", "/ab" isteklerinde tetiklenir.
---

# NFS istemcisi — açılış sırası, konteyner, performans

Saha (Alp, 2026-11-03, G118): splastnginx* (`/ab` ← `splbtfile:/splbtfile_NFS_FS/Assistbox_PROD`, nfs4 vers=4.1; medya kayıtları)
açılışında "dizin istemede sorun oldu, tekrar mount edildiğinde dizinler geldi; yazma konusunda da". Ajan `nfsidmap` satırlarını
"yavaşlatıyor, kök neden" yazdı ve `man`'de olmayan `RPCIDMAPD_ARGS="-g"` önerdi — **ikisi de kanıtsız** (aşağıda).
Etiketler: **(man)** makinedeki man sayfası · **(ölçüldü)** komut çıktısı + sürüm · **(saha)** · tahmin açıkça `tahmin:` · bilinmeyen `[SAHA]`.

## 0. Önce sor (cevap gelmeden "kök neden" yazma)

Kullanıcı vermediyse tek mesajda, numaralı:
1. **Belirti:** dizin boş mu görünüyor, hata mı (hangi metin), uygulama mı yazamıyor, yavaşlık mı — hangi işlemde (okuma, yazma, listeleme)?
2. **Kapsam:** hangi sunucular — hepsi mi, biri mi? (saha G118: üç sunucudan biri farklı NFS ucuna bağlıydı; ajan "üçü aynı" dedi)
3. **Zaman:** hangi açılış/saat; bir değişiklikten (güncelleme, reboot) önce de var mıydı?
4. **Ne yapıldı:** yeniden bağlama nasıl (`mount -a`? `umount`+`mount`?), konteyner/servis o arada yeniden başlatıldı mı, kayıt yazımı sürdü mü?
Ölçülebilenleri sorma — §1'in komutu toplar.

## 1. Kanıt (salt-okunur, onay sormaz)

```bash
B=/root/ai/opencode/knowledge/skills/approved/rhel-nfs
python3 $B/nfs-tani.py komut              # basılan ssh komutunu <sunucu> ile çalıştır, çıktıyı borula:
ssh root@<sunucu> '<basılan komut>' | python3 $B/nfs-tani.py tani -
```

Toplanan (fstab'daki her NFS bağlaması): fstab ve etkin seçenekler · bu açılışta ilk "Mounted" zamanı, bağlama sayısı, hata satırları
(`journalctl -b -u <birim>.mount`) · readahead (`/sys/class/bdi/<MAJ:MIN>/read_ahead_kb`) · çekirdek NFS satırları · docker/podman
servisinin sırası (`After` içinde `remote-fs.target`, `RequiresMountsFor`) · NFS yolunu kullanan konteynerlerin başlama zamanı ve bağlama
yayılımı. Betik **BULGU / NOT / EKSİK KANIT** basar; tabloyu sen kurma.

## 2. Açılış sırası — bilinen sebepler (betiğin kuralları)

| Bulgu | Anlamı | Kaynak |
|---|---|---|
| fstab'da `nofail` | Ağ bağlaması normalde `remote-fs.target`'tan ÖNCE sıralanır, `nofail` (ya da `x-systemd.wanted-by=`/`required-by=`) bu sıralamayı kaldırır | (man) systemd.mount |
| Konteyner, NFS'in bu açılıştaki ilk bağlamasından ÖNCE başlamış | tahmin: yayılım `rprivate` ise konteyner NFS yerine bağlama noktasının altındaki **yerel** dizini görür, yazdığı dosyalar yerel diske düşer ve NFS bağlanınca altında gizli kalır | zaman damgaları (ölçüldü); podman 5.8 bind yayılımı `rprivate` (ölçüldü, yerel); docker'da `nfs-tani` satırındaki değer |
| `docker/podman.service` `remote-fs.target`'tan sonra değil ve `RequiresMountsFor` boş | Motor (ve restart politikalı konteynerler) NFS'i beklemeden başlayabilir | (man) systemd.unit `RequiresMountsFor=` "adds dependencies of type Requires= and After=" |
| Bağlama hata satırı / çekirdek "server … not responding" | Bağlama gecikmiş ya da düşmüş; zamanı konteynerin başlamasıyla karşılaştır | journalctl (ölçüldü) |

**Kesinleştiren kanıt** (yazmadan önce): aynı anda konteyner içinden ve host'tan dizin listesi — `<motor> exec <konteyner> ls <hedef>`
ile host'ta `ls <hedef>`. Farklıysa konteyner yerel dizini görüyor.

**Olası düzeltmeler — hepsi değişiklik, karar uygulama/sunucu sahibinin (kurum politikası: OS işinde uygulama içine müdahale yok):**
- Motor servisine drop-in `[Unit] RequiresMountsFor=<hedef>` (man systemd.unit) — motor, bağlama olmadan başlamaz.
- `nofail` varsa kaldırmak — bağlama gelmezse açılış `remote-fs.target`'ta bekler/başarısız olur (risk: sunucu açılışı etkilenir).
- Bağlama noktasının **altında** kalmış yerel dosyaları görmek: NFS'i ayırmadan görmenin salt-okunur yolu yok; geçici bind mount
  (`mount --bind / /mnt/x; ls /mnt/x/<hedef>`) değişikliktir → onay. Kayıt kaybı şüphesinde önce bunu sahibine söyle.

## 3. Ölçülmemiş/yanlış iddialar (saha G118) — tekrarlama

- `nfsidmap: name 'root@localdomain' does not map into domain '<kurum>.local'` = sunucu sahibi `localdomain` ile gönderiyor, istemci
  domain'i `<kurum>.local`. Etkisi **sahiplik görünümü** (ör. `nobody`); eşleme sonucu önbellekte tutulur (man nfsidmap: `-t`
  varsayılan 600 sn — saha logunda satırlar 10–15 dk arayla). "Her işlemi yavaşlatıyor" kanıtsız. İstemcide `Domain = <kurum>.local`
  önerisi zaten olan değer; düzeltme ya sunucu tarafında (depolama ekibi) ya istemcide `localdomain` — sahiplik kararı, sahibine.
- `RPCIDMAPD_ARGS="-g"`: man idmapd (nfs-utils 2.8.3, ölçüldü) seçenekleri `-h -v -f -p -c -C -S` — `-g` **yok**; `nfs-idmapd.service`
  `BindsTo=nfs-server.service` (NFS **sunucusu** tarafı). Önerme.
- `systemctl restart rpcidmapd nfs-client.target` canlı `hard` bağlamada: kazancı yok, risk var — önerme.
- `rsize/wsize=1048576` önerisi: değer pazarlıkla belirlenir, etkin hâli `/proc/mounts`'ta (man 5 nfs: "client and server negotiate the
  largest rsize value that they can both support"; Linux istemci üst sınırı 1048576). Etkin 262144 ve fstab'da değer yoksa sınır
  sunucuda olabilir (tahmin) — önce fstab satırına bak.
- Başka yapay zekanın cevabı kaynak değildir (G118: `-g` için iki yapay zeka iki ayrı anlam yazdı).
- **SEP ve NFS:** Auto-Protect'in ağ dosyalarını taraması ("Scan files on remote computers", Broadcom KB 162599), geçersiz istisna
  (KB 250717) ve güvenlik ajanı + NFSv4 ID eşleme upcall kilitlenmesi (Red Hat 5201171) → `rke2-edr` §2b (RHEL için de geçerli). Donma
  olursa ilk kanıt olay anının çekirdek yığını; nfsidmap satırları tek başına sebep değildir.

## 4. Performans — NFSv3 ve NFSv4 (yalnız ölçümle)

Alp (2026-11-23): "genel anlamda nfs v3 ve nfsv4 için performans" — iki sürüm aynı araçla ölçülür. "Yavaş" iddiası
**throughput (kB/s) · IOPS (op/s) · gecikme (avg RTT / avg exe, ms)** ile kurulur; kaynak `/proc/self/mountstats` (yük üretmez).

```bash
python3 $B/nfs-tani.py perf-komut 10       # iki okuma, arada 10 sn — basılan komutu sunucuda çalıştır, çıktıyı borula:
ssh root@<sunucu> '<basılan komut>' | python3 $B/nfs-tani.py perf -
# çok sunucu: ansible <grup> -i <iş envanteri> -m shell -t cikti/filo/nfsperf -a '<komut>' → nfs-tani.py perf cikti/filo/nfsperf/<sunucu>
```

Betik her NFS bağlaması için sürümü (`vers=`), etkin seçenekleri (rsize/wsize/proto/timeo/retrans/hard-soft/nconnect) ve işlem başına
op/s · kB/s · kB/op · yeniden gönderim (%) · RTT · exe · kuyruk · hata basar — hesap `nfsiostat` ile aynı (`/usr/sbin/nfsiostat`,
nfs-utils 2.8.3; man nfsiostat: exe RTT'yi içerir, kuyruk = istek oluşturma → gönderim). **BULGU** yalnız: `soft`/`softerr` bağlama
(man nfs: "silent data corruption"), sıfırdan farklı yeniden gönderim, hata durumlu işlem. Eşik yok; tabloyu karşılaştırmada kullan:
**aynı komutla** sorunlu ↔ sağlam sunucu ya da önce ↔ sonra. Yük yokken ölçülen tablo boş çıkar — yük anında tekrar al.
Ölçüldü: sentetik mountstats ile (biçim nfsiostat ayrıştırıcısından) ve bu makinede (NFS bağlaması yok → çıkış 2). Gerçek NFS'te sahada
denenmedi.

**v3 ↔ v4 farkı — performansı ilgilendiren (man nfs, nfs-utils 2.8.3):**

| Konu | NFSv3 | NFSv4 (4.0/4.1/4.2) |
|---|---|---|
| Sürüm seçimi | `vers=3` | belirtilmezse istemci **4.2'den başlar, aşağı pazarlık eder** (`nfsvers=n`); `vers=4.1` = `vers=4,minorversion=1` |
| Taşıma | TCP ya da UDP (`proto=`) | TCP zorunlu desteklenir, varsayılan TCP ("Options for NFS version 4 only") |
| Portlar | NFS + **mountd + rpcbind** (+ NLM kilidi) — `mountport`, `mountproto` | tek port **2049**, rpcbind'e sormadan (`port=n`) |
| Kilit | **NLM yan protokolü** (`lock`/`nolock`; `/var` NFS ise `nolock` şart) | protokolün içinde |
| Önbellek tutarlılığı | close-to-open (`cto`/`nocto`) dosya + öznitelik | `cto`/`nocto` yalnız **dizinler** için ("File data caching behavior is not affected") |
| Kimlik | UID/GID sayıyla | ad ↔ UID/GID eşlemesi NFSv4 alanıyla (`idmapd.conf` Domain) — §3 |
| 4.1+ | — | oturumlar (sessions) `minorversion=1` ile |

Her iki sürümde aynı (man nfs, "Options supported by all versions"):
- `rsize`/`wsize`: Linux istemcide üst sınır **1 048 576** bayt; verilmezse istemci ve sunucu **en büyük ortak değeri pazarlık eder**;
  etkin değer `/proc/mounts`'ta (betik mountstats'tan okur). Küçük değer görürsen önce fstab'da elle mi yazılmış bak.
- `nconnect=n` (TCP): istemci–sunucu arasında birden çok bağlantı, **en fazla 16**; man: çok NIC'li yapılarda yükü dağıtıp "may improve
  overall performance". Ölçmeden önerme.
- `hard` varsayılan (istek süresiz yinelenir); `soft`/`softerr` `retrans` sonrası EIO/ETIMEDOUT döner — veri bütünlüğü riski (man).
- `timeo` TCP'de varsayılan 600 (60 sn), doğrusal geri çekilme, üst sınır 600 sn; `retrans` TCP'de varsayılan 2. "server not responding"
  `retrans` denemeden sonra basılır.
- Öznitelik önbelleği `ac`/`noac`, `actimeo`, `acregmin/max`, `acdirmin/max`; `lookupcache=` — ayrıntı man nfs "DATA AND METADATA
  COHERENCE". `noac` performansı düşürür ("noac" maddesi), yalnız ihtiyaç ölçülünce.
- Readahead: `/etc/nfs.conf` `[nfsrahead]` (man nfsrahead — varsayılan 128); ayar önerisi yalnız ölçülmüş farkla ve o makinenin man
  satırıyla.

## Yapmayacakların

- Kanıt toplamadan `umount`/`mount`/servis yeniden başlatma (değişiklik — onay ekranı; önce §0 ve §1).
- `docker compose down -v` (adlı volume'ları siler) — hiçbir NFS sorununun çözümü değil.
- `idmapd.conf`, `nfs.conf`, fstab değişikliği — sahibin kararı, öncesinde mevcut değeri oku.
