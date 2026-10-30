---
name: rhel-depolama
description: Disk/depolama işlerinin hepsinde kullan — teşhis (disk dolması, inode, LVM, mount, yazılım RAID mdadm, NVMe sağlığı) ve değişiklik (disk ekleme, yeni birim/mount, LVM/bölüm büyütme, fstab). "raid", "mdadm", "mdstat", "degraded", "nvme", "smart", "disk dol", "yer kalmadı", "no space", "inode", "lvm", "mount", "partition", "nfs", "disk ekle", "mount et", "pvcreate", "vgextend", "lvextend", "xfs_growfs", "growpart", "büyüt", "yer aç", "fstab", "/data" isteklerinde tetiklenir. Değişiklik yapmadan önce **B. Disk ekleme** bölümünü oku.
---

Bu beceri iki bölüm: **A. Teşhis** (salt-okunur) ve **B. Disk ekleme / büyütme** (değişiklik — kurallarıyla).

## A. Teşhis

Disk dolması bir numaralı olaydır ve iki tuzağı vardır: inode ayrı dolar,
silinen dosya yer açmayabilir.

### 1. Genel tablo

```bash
df -h                # blok kullanımı
df -i                # inode kullanımı — AYRI DOLAR
```

`df -h` %40 gösterirken `df -i` %100 olabilir. O durumda "disk dolu" hatası
alırsın ama yer vardır; sorun dosya *sayısı*dır. Genelde küçük dosya üreten
bir dizin (oturum dosyaları, mail kuyruğu, cache) suçludur.

### 2. Yeri kim yiyor

```bash
du -xh --max-depth=1 / 2>/dev/null | sort -rh | head -15
du -xh --max-depth=1 /var 2>/dev/null | sort -rh | head -15
```

`-x` şart: dosya sistemi sınırında dursun, yoksa NFS ve bind mount'lara dalıp
saatlerce sürer ve yanlış sayı verir.

En sık suçlular: `/var/log`, `/var/lib/docker`, `/var/lib/containers`,
`/var/cache`, kullanıcı ev dizinleri, uygulamanın kendi log dizini.

### 3. Silinmiş ama açık tutulan dosyalar

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

### 4. Log şişmesi

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

### 5. Container katmanı

```bash
docker system df
podman system df
```

`/var/lib/docker` şişmişse önce ne olduğuna bak. `docker system prune`
kullanılmayan **volume'ları da** silebilir — veri kaybı riski, onaysız
çalıştırma. Güvenli sıra: önce `-a` olmadan imaj temizliği, volume'lara en son
ve ancak sahibiyle konuşup dokun.

### 6. LVM ile büyütme

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

### 7. Mount sorunları

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

### 8. Yazılım RAID (mdadm) ve NVMe sağlığı

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
açmak değişikliktir (onay ekranı).

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

Disk değiştirme (`mdadm --fail/--remove/--add`) **değişikliktir** (onay ekranı);
teşhis edip öner, kendin yapma.


### Raporlama

Sayıyı ve nedeni birlikte ver: "`/var` %98 dolu, `/var/log/app` 40 GB, en
büyük dosya 12 GB'lık `app.log` — logrotate yapılandırılmamış." Yalnızca
"disk dolu" demek raporlama değildir.

Temizlik önerirken hangisinin geri alınamaz olduğunu ayrıca belirt.

## B. Disk ekleme / büyütme

Doğrulandı: AlmaLinux 10.2 — 2026-08-29; lvextend -r — RHEL 10, 2026-09-10; `findmnt --verify`,
`lsblk -f` bayrakları util-linux 2.40 — 2026-09-26; `disk-durum.py` + `blkid -p` — 2026-10-21 (A24/A26-A28 dersleriyle yeniden yazıldı).

**Yanlış diske yazmak veri kaybıdır.** Sıra her zaman: **keşfet → kurum düzenini oku → plan göster → onay
(CN/KURULUM yetkisi) → uygula → doğrula.** Değişiklik adımlarını güvenlik kilidi yetkisiz çalıştırmaz.

### 1. Keşif — hiçbir şeyi varsayma (A27, A28) → `disk-durum.py`

**Disk sınıfını sen çıkarma — betik çıkarsın** (saha G38: `lsblk` okunmadan "sda (Sistem) / sdb (Boş)" başlıklı tablo dolduruldu,
OS diski sdb'deydi ve "boş" yazıldı; o tabloyla `mkfs` atılsaydı sunucu giderdi). Sabit okuma komutu + betik:

```bash
ssh root@<sunucu> "echo '#LSBLK'; lsblk -P -b -o NAME,KNAME,PKNAME,TYPE,SIZE,FSTYPE,MOUNTPOINT,UUID 2>/dev/null || lsblk -P -b -o NAME,KNAME,TYPE,SIZE,FSTYPE,MOUNTPOINT,UUID; echo '#PVS'; pvs --noheadings --separator '|' -o pv_name,vg_name 2>/dev/null; echo '#MOUNT'; findmnt -rn -o SOURCE,TARGET; echo '#SWAP'; cat /proc/swaps; echo '#FSTAB'; grep -v '^[[:space:]]*#' /etc/fstab; echo '#IMZA'; for d in \$(lsblk -dn -o NAME -e 7,11); do echo \"== /dev/\$d\"; blkid -p -o export /dev/\$d 2>&1; done" | python3 /root/ai/opencode/knowledge/skills/approved/rhel-depolama/disk-durum.py - --ad <sunucu>
```

Çok sunucu: aynı tırnak içi komutu `ansible <grup> -m shell -T 10 --task-timeout 30 -t cikti/disk/<etiket> -a '…'` ile çalıştır,
`disk-durum.py cikti/disk/<etiket>`. (Betiğin başındaki yorumda komut tek parça durur; oradan kopyala.)

Betik her disk için **OS DİSKİ / KULLANIMDA / BOŞ ADAY** ve gerekçesini basar. BOŞ ADAY = şunların **hepsi**: bölüm/alt aygıt
yok · FSTYPE yok · LVM PV değil · bağlı/swap değil · fstab'da (ad/UUID/mapper) yok · diskte imza yok (`blkid -p`; `wipefs -n` / seçeneksiz
`wipefs` de okumadır, kilitten geçer — silen `wipefs -a/-o` yetki + onay ister). OS diski adından değil `/`, `/boot`, `/boot/efi` ya da
kök VG'nin PV'sinden bulunur (RHEL 7 `lsblk`'ında PKNAME yoksa da çalışır). Sonuç satırı:
- "BOŞ disk yok" → yıkıcı adım (`pvcreate`, `mkfs`, `parted`) **yok**, çıktıyı kullanıcıya göster;
- `mkfs`/`wipefs -a`/`dd` kilitte "yetki + her komutta onay": onay istemeden önce betiğin satırını (aygıt BOŞ ADAY) kullanıcıya göster;
- "Aynı boyutta birden çok boş aday" → boyuttan seçme, **sor**;
- yıkıcı adımdan **hemen önce** betiği aynı sunucuda yeniden çalıştır — reboot'ta sda/sdb yer değiştirebilir (G38, 2026-10-14).

Tabloyu aynen aktar; başlığa sabit "sda (Sistem)" yazma. Ek okuma (VG/LV adları için): `vgs`, `lvs -o +devices`.

### 2. Kurumun düzenine uy — ad uydurma (A28)

- VG/LV adlarını **aynı sunucudaki ya da kullanıcının gösterdiği örnek sunucudaki** mevcut adlardan türet
  (`vgs`, `lvs` çıktısındaki önek/sonek kalıbı). Kalıp çıkmıyorsa **sor**; `vg_veri` gibi kendi adını koyma.
- Bağlama noktası: kurumun ek diskleri nereye bağladığını mevcut `findmnt` çıktısından ya da kullanıcıdan
  öğren; hedef dizine doğrudan mı, ortak bir veri dizininin altına mı — **varsayma**.
- Bunları **planın başında** yaz: "örnek: <sunucu> → <vg>/<lv>, bağlama <dizin> — bu düzene uydum".

### 3. Uygulama

Disk görünmüyorsa (salt-okunur tarama): `for h in /sys/class/scsi_host/host*/scan; do echo "- - -" > "$h"; done`
— var olan disk büyütüldüyse `echo 1 > /sys/class/block/<disk>/device/rescan`.

**Yol A — LVM varsa, mevcut birimi büyüt:**
```bash
pvcreate /dev/<disk> && vgextend <vg> /dev/<disk> && vgs     # VFree arttı mı
lvextend -r -l +100%FREE /dev/<vg>/<lv>                         # -r: dosya sistemini de büyütür
```
**Yeni birim:** `pvcreate` → `vgcreate <vg>` → `lvcreate -l 100%FREE -n <lv> <vg>` → `mkfs.xfs /dev/<vg>/<lv>`
(adlar 2. adımdan).

**Yol B — LVM yok, bölüm büyüt:** `parted -s /dev/<disk> print` (göster, onay al) → `growpart /dev/<disk> <no>`
(disk ve bölüm **ayrı** argüman) → `xfs_growfs <mount-noktası>` (XFS mount noktası alır; `resize2fs` cihaz alır).
XFS **küçültülemez**.

### 4. fstab — tekrar çalıştırılabilir olmalı (A26)

```bash
cp -a /etc/fstab /etc/fstab.$(date +%Y%m%d-%H%M)                   # önce yedek (tarih: AGENTS "Dosya adlarında tarih")
mkdir -p <dizin>                                                  # verify'dan ÖNCE (yoksa [E] target)
grep -q "^/dev/<vg>/<lv>[[:space:]]" /etc/fstab || echo "/dev/<vg>/<lv>  <dizin>  xfs  defaults  0 0" >> /etc/fstab
findmnt --verify                                                  # [E] satırı varsa DUR, yeniden başlatma
systemctl daemon-reload && mount <dizin> && findmnt <dizin>
```
- **LVM birimi → LV yolu** (`/dev/<vg>/<lv>`; kurum düzeni, Alp 2026-10-14 — örnek `/dev/kt_rhel_vg/kt_rhel_lv /data xfs
  defaults 0 0`). LV yolu disk sırasından bağımsızdır, UUID gerekmez. LVM'siz bölümde **UUID** kullan. Hiçbir zaman
  `/dev/sdX` yazma — 2026-10-14'te iki sunucuda reboot sonrası sda/sdb yer değiştirdi.
- Satır zaten varsa **ekleme** (plan ikinci kez çalışırsa çift satır = açılışta hata). Çıplak `>> /etc/fstab` yazma.
- `mount -a` yerine yalnız yeni dizini bağla: `mount -a` ilgisiz, bozuk başka satırları da tetikler.

### 5. Doğrulama ve rapor

`lsblk -f`, `vgs`, `lvs -o +devices`, `df -h <dizin>`, `findmnt <dizin>` — öncesi/sonrası. Raporda: hangi cihaz
(keşif kanıtıyla), hangi ad kalıbına uyuldu, fstab satırı, yedek dosyasının adı, geri alınamaz adımlar.

### Plan istenince (uygulamadan)

Plan = keşif komutları + çıktılarına göre dallanan adımlar, **sabit cihaz harfi ya da uydurma ad içermez**.
Her yıkıcı adımın önünde onun ön koşulu yazar ("yalnız 1. adımda `/dev/<disk>` boş çıktıysa").
