---
name: depolama
description: Disk dolması, LVM, mount, dosya sistemi, yazılım RAID (mdadm) ve NVMe disk sağlığı sorunlarında kullan. "raid", "mdadm", "mdstat", "degraded", "nvme", "smart", "disk dol", "disk doldu", "yer kalmadı", "yer yok", "no space", "lvm", "mount", "partition", "inode", "nfs" isteklerinde tetiklenir.
---

Disk dolması bir numaralı olaydır ve iki tuzağı vardır: inode ayrı dolar,
silinen dosya yer açmayabilir.

## 1. Genel tablo

```bash
df -h                # blok kullanımı
df -i                # inode kullanımı — AYRI DOLAR
```

`df -h` %40 gösterirken `df -i` %100 olabilir. O durumda "disk dolu" hatası
alırsın ama yer vardır; sorun dosya *sayısı*dır. Genelde küçük dosya üreten
bir dizin (oturum dosyaları, mail kuyruğu, cache) suçludur.

## 2. Yeri kim yiyor

```bash
du -xh --max-depth=1 / 2>/dev/null | sort -rh | head -15
du -xh --max-depth=1 /var 2>/dev/null | sort -rh | head -15
```

`-x` şart: dosya sistemi sınırında dursun, yoksa NFS ve bind mount'lara dalıp
saatlerce sürer ve yanlış sayı verir.

En sık suçlular: `/var/log`, `/var/lib/docker`, `/var/lib/containers`,
`/var/cache`, kullanıcı ev dizinleri, uygulamanın kendi log dizini.

## 3. Silinmiş ama açık tutulan dosyalar

`df` doluyu, `du` boşu gösteriyorsa sebep budur: bir süreç silinmiş bir
dosyayı hâlâ açık tutuyor, alan ancak süreç kapanınca serbest kalır.

```bash
lsof +L1 2>/dev/null | head -20
```

**`lsof` minimal RHEL/AlmaLinux kurulumlarında YOKTUR** (doğrulandı: AlmaLinux
10.2). Kurmadan, `/proc` üzerinden aynı bilgiye ulaşılır:

```bash
ls -l /proc/*/fd 2>/dev/null | grep deleted
```

Hangi sürecin tuttuğunu bulmak için PID'i yoldan oku:

```bash
for p in /proc/[0-9]*; do
  ls -l $p/fd 2>/dev/null | grep -q deleted && echo "$p $(cat $p/comm)"
done

Çözüm: ilgili servisi yeniden başlat (yan etkili, **onay al**). Genelde
suçlu, log dosyası döndürülmüş ama yeniden başlatılmamış bir servistir.

## 4. Log şişmesi

```bash
journalctl --disk-usage
du -sh /var/log/* | sort -rh | head
```

Yan etkili, onay al:

```bash
journalctl --vacuum-time=7d
journalctl --vacuum-size=500M
```

Tekrarlıyorsa `/etc/systemd/journald.conf` içinde `SystemMaxUse` ayarla ve
`logrotate` yapılandırmasına bak. Kalıcı çözüm budur; elle temizlemek
belirtiyi bastırır.

## 5. Container katmanı

```bash
docker system df
podman system df
```

`/var/lib/docker` şişmişse önce ne olduğuna bak. `docker system prune`
kullanılmayan **volume'ları da** silebilir — veri kaybı riski, onaysız
çalıştırma. Güvenli sıra: önce `-a` olmadan imaj temizliği, volume'lara en son
ve ancak sahibiyle konuşup dokun.

## 6. LVM ile büyütme

```bash
lsblk
pvs ; vgs ; lvs
vgdisplay <vg> | grep Free
```

Boş alan varsa (yan etkili, **onay al**, önce yedek doğrula):

```bash
lvextend -L +10G /dev/<vg>/<lv>
xfs_growfs /mount/noktasi        # XFS
resize2fs /dev/<vg>/<lv>         # ext4
```

XFS **küçültülemez**, yalnızca büyütülür. Bu geri alınamaz bir yön, karar
verirken bunu hesaba kat.

## 7. Mount sorunları

```bash
findmnt
mount | grep -i " ro,"           # salt-okunur geçmiş dosya sistemleri
dmesg | tail -30                 # G/Ç hataları
cat /etc/fstab
```

Dosya sistemi kendini salt-okunur yaptıysa neredeyse her zaman donanım ya da
G/Ç hatası vardır. `dmesg`'e bakmadan yeniden mount etme.

NFS asılı kaldıysa `df` de asılır. `findmnt` ile hangi mount'un sorunlu
olduğunu bul, `df` ile aramaya çalışma.

## 8. Yazılım RAID (mdadm) ve NVMe sağlığı

GPU sunucusu: 16 × 1.7 TB NVMe, 12'si **yazılım RAID10** (mdadm, RHEL 9), 2'si
yedek (spare) — Alp, 2026-10-08. RAID10 bir disk kaybında çalışmaya devam
eder; **aynı ayna çiftinden ikinci kayıp veri kaybıdır.** Bu yüzden düşen
diski ve yıpranan diski erken görmek asıl iş. Hepsi salt okunur.

**RAID durumu:**

```bash
cat /proc/mdstat
mdadm --detail /dev/md<N>       # N'yi mdstat'tan al
```

| Görülen | Anlamı |
|---|---|
| `[12/12] [UUUUUUUUUUUU]` | Tüm üyeler ayakta |
| `[12/11]`, dizide `_` | Bir üye düşmüş — hangisi: `mdadm --detail` alt tablosu |
| `recovery = %…` / `resync` | Yeniden kurma sürüyor; bitene kadar o çift tek ayak |
| `State : … degraded` | Eksik üyeyle çalışıyor |
| `Spare Devices : 2` | İki yedek boşta bekliyor; 0'a düştüyse yedek kullanılmış |
| `(F)` üye adının yanında | Arızalı işaretlenmiş disk |

Bir üye düşünce md yedeği **kendiliğinden** devreye alır ve rebuild başlar
— bunun için komut gerekmez. Rebuild sürerken ikinci bir arıza riski en
yüksek dönemdir; raporda belirt.

**Hangi diskler ayna çifti:** `mdadm --detail` çıktısında `Layout : near=2`
ise (RAID10'un varsayılanı) çift sayılı üyede komşu `RaidDevice`
numaraları (0-1, 2-3, …) aynı veriyi taşır. Layout farklıysa çifti
tahmin etme, çıktıyı raporla.

**Periyodik tarama:** `systemctl status raid-check.timer` — RHEL'in
`mdadm` paketi tüm diski okuyup tutarsızlık arayan bir zamanlayıcıyla
gelir. Son taramanın bulduğu tutarsızlık:
`cat /sys/block/md<N>/md/mismatch_cnt`.

**Uyarı servisi:** `systemctl is-active mdmonitor` — arıza olayını
yalnız `/etc/mdadm.conf`'ta `MAILADDR`/`PROGRAM` tanımlıysa bildirir.
Kapalı ya da tanımsızsa düşen disk sessiz kalır; durumu raporla,
açmak değişikliktir (K1).

**Her diskin kendi sağlığı (NVMe):**

```bash
nvme list                           # nvme0..nvme15 görünmeli
nvme smart-log /dev/nvme0           # önce tek diskte alan adlarına bak
```

| Alan | Bakış |
|---|---|
| `critical_warning` | 0 değilse disk kendisi uyarı veriyor |
| `percentage_used` | Üreticinin ömür tahmininin tüketilen yüzdesi |
| `available_spare` | Diskin **içindeki** yedek flash alanı (RAID yedeğiyle karıştırma) |
| `media_errors` | Artıyorsa disk bozuluyor — RAID'den düşmeden önce görülebilir |
| `temperature` | Isınma |

RAID üyesi ile NVMe diski eşle: `mdadm --detail` üye listesindeki
`/dev/nvmeXn1` → `nvme smart-log /dev/nvmeX`. Aynı çiftteki iki diskin
`percentage_used` değeri birlikte yüksekse bunu ayrıca yaz — aynı anda
yıpranan çift, aynı anda arızalanabilir.

Disk değiştirme (`mdadm --fail/--remove/--add`) **değişikliktir** (K1);
teşhis edip öner, kendin yapma.

## Disk eklemek gerekiyorsa

Bu beceri teşhis içindir. Alan açmak yerine **disk eklemek** ya da var olanı
büyütmek gerekiyorsa `disk-ekleme` becerisine geç: LVM, XFS büyütme, fstab ve
NFS orada.

## Raporlama

Sayıyı ve nedeni birlikte ver: "`/var` %98 dolu, `/var/log/app` 40 GB, en
büyük dosya 12 GB'lık `app.log` — logrotate yapılandırılmamış." Yalnızca
"disk dolu" demek raporlama değildir.

Temizlik önerirken hangisinin geri alınamaz olduğunu ayrıca belirt.
