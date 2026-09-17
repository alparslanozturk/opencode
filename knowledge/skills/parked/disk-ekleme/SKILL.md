---
name: disk-ekleme
description: Disk eklerken, bölüm ya da LVM birimi büyütürken kullan. "disk ekle", "lvm", "pvcreate", "vgextend", "lvextend", "xfs_growfs", "growpart", "büyüt", "yer aç", "disk göründü mü" isteklerinde tetiklenir. NFS paylaşımı için `nfs-mount`, disk dolduğu için buradaysan önce `depolama`.
---

Doğrulandı: AlmaLinux 10.2 — 2026-08-29; lvextend -r — RHEL 10, 2026-09-10

**Yanlış diske yazmak veri kaybıdır** — cihazı iki kez doğrula. Adımların bir
kısmı geri alınamaz.

## Adım 0 — LVM var mı? İki tamamen farklı yol var

```bash
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT
pvs
```

**`pvs` boş dönerse LVM YOKTUR** ve `pvcreate`/`vgextend`/`lvextend` yolu
geçersizdir. LVM yoksa `pvs` hata vermez — çıkış kodu 0, sıfır satır (satır
yoksa LVM yok).

| Durum | Yol |
|---|---|
| `pvs` PV listeliyor | Yol A — LVM |
| `pvs` boş, `lsblk` doğrudan bölüm gösteriyor | Yol B — düz bölüm |

## Disk görünmüyorsa: SCSI taraması

Çalışan VM'e eklenen diski çekirdek görmeyebilir. Tarama salt-okunur.

```bash
for h in /sys/class/scsi_host/host*/scan; do echo "- - -" > "$h"; done
lsblk                                        # şimdi göründü mü
```

**Var olan disk büyütüldüyse** cihazın kendisi taranır:

```bash
echo 1 > /sys/class/block/sda/device/rescan
lsblk /dev/sda                               # yeni boyut göründü mü
```

## Yol A — LVM

Yeni disk `/dev/sdb`, hedef `/dev/vg0/lv_var`:

```bash
pvcreate /dev/sdb                          # PV olarak işaretle
vgextend vg0 /dev/sdb                      # VG'ye kat
vgs                                        # VFree arttı mı, DOĞRULA
lvextend -r -l +100%FREE /dev/vg0/lv_var   # -r: dosya sistemini de büyütür
df -h /var
```

**`-r` (`--resizefs`) aksi belirtilmedikçe her zaman kullan.** XFS ve ext4'te
dosya sistemini birimle birlikte kendiliğinden büyütür; ayrı `xfs_growfs` ya
da `resize2fs` adımı gerekmez.

Kanıt: 10.0.0.20'te `lvextend -r /dev/rhel/root /dev/sdc` → `df -h /` %97→%94.

Sıfırdan yeni birim:

```bash
pvcreate /dev/sdb
vgcreate vg_veri /dev/sdb
lvcreate -l 100%FREE -n lv_veri vg_veri
mkfs.xfs /dev/vg_veri/lv_veri
```

## Yol B — LVM yok, bölüm büyütme

Sıra: bölüm tablosu → dosya sistemi.

```bash
parted -s /dev/sda print   # salt-okunur, mevcut durumu gör
growpart /dev/sda 4        # DİKKAT: disk ve bölüm AYRI argüman
xfs_growfs /               # mount noktası
df -h /
```

`growpart /dev/sda4` **yanlıştır** — komut `growpart <disk> <bölüm-no>` alır.
Bölüm tablosu değişikliği geri alınamaz — önce `parted print` çıktısını
göster ve onay al.

## İki kalıcı tuzak

- **`xfs_growfs` mount noktası alır, `resize2fs` cihaz alır.** Karıştırmak
  sık yapılan hatadır. `lvextend -r` kullanıldıysa bu adıma hiç girilmez;
  yalnız `-r` desteği yoksa (çok eski lvm2) elle bu adıma düşülür.
- **XFS küçültülemez.** Yalnızca büyür. Yanlış boyutta oluşturduysan tek yol
  yedekleyip yeniden oluşturmaktır.

## fstab — atlanırsa yeniden başlatmada kaybolur

**UUID kullan.** `/dev/sdb` yeniden başlatmada `/dev/sdc` olabilir, sistem
açılmaz.

```bash
blkid /dev/vg_veri/lv_veri   # UUID'yi al
echo 'UUID=<uuid>  /veri  xfs  defaults  0 0' >> /etc/fstab
```

Yeniden başlatmadan doğrula — bozuk fstab = açılmayan makine:

```bash
mount -a   # hata vermemeli
systemctl daemon-reload
findmnt /veri
```

## Durum kontrolü

```bash
pvs -o +pv_used   # PV kullanımı
vgs -o +vg_free   # VG boş alan
lvs -o +devices   # LV hangi diskte
findmnt /veri -o SOURCE,FSTYPE,OPTIONS
```

## Raporlama

Hangi cihazı hangi VG'ye kattığını / hangi bölümü büyüttüğünü, yeni boyutu,
fstab satırını ve `df -h` öncesi/sonrasını göster. Geri alınamaz adım attıysan
açıkça söyle.
