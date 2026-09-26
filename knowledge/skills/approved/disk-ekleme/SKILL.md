---
name: disk-ekleme
description: Disk eklerken, yeni birim/mount planlarken, bölüm ya da LVM birimi büyütürken kullan. "disk ekle", "mount et", "lvm", "pvcreate", "vgextend", "lvextend", "xfs_growfs", "growpart", "büyüt", "yer aç", "disk göründü mü" isteklerinde tetiklenir. NFS için `nfs-mount`; disk doluysa önce `depolama`.
---

Doğrulandı: AlmaLinux 10.2 — 2026-08-29; lvextend -r — RHEL 10, 2026-09-10; `findmnt --verify`,
`wipefs -n`, `lsblk -f` bayrakları util-linux 2.40 — 2026-09-26 (A24/A26-A28 dersleriyle yeniden yazıldı).

**Yanlış diske yazmak veri kaybıdır.** Sıra her zaman: **keşfet → kurum düzenini oku → plan göster → onay
(CN/KURULUM yetkisi) → uygula → doğrula.** Değişiklik adımlarını güvenlik kilidi yetkisiz çalıştırmaz.

## 1. Keşif — hiçbir şeyi varsayma (A27, A28)

```bash
lsblk -f -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS   # cihaz harfi VARSAYILMAZ, buradan okunur
pvs; vgs; lvs -o +devices                       # LVM var mı, hangi disk nerede
findmnt -t xfs,ext4 -o TARGET,SOURCE,FSTYPE     # mevcut bağlama düzeni
```

**Hedef diskin boş olduğu kanıtlanmadan yıkıcı adım yok** (`pvcreate`, `mkfs`, `parted`). Boş sayılması için:
`lsblk -f`'te FSTYPE yok **ve** alt bölümü yok **ve** `pvs`'te yok **ve** mount edilmemiş **ve**
`wipefs -n /dev/<disk>` hiçbir imza listelemiyor. Biri bile tutmazsa **dur**, çıktıyı kullanıcıya göster.
Aynı boyutta iki disk varsa hangisi olduğunu kullanıcıya sor — boyuttan tahmin etme.

## 2. Kurumun düzenine uy — ad uydurma (A28)

- VG/LV adlarını **aynı sunucudaki ya da kullanıcının gösterdiği örnek sunucudaki** mevcut adlardan türet
  (`vgs`, `lvs` çıktısındaki önek/sonek kalıbı). Kalıp çıkmıyorsa **sor**; `vg_veri` gibi kendi adını koyma.
- Bağlama noktası: kurumun ek diskleri nereye bağladığını mevcut `findmnt` çıktısından ya da kullanıcıdan
  öğren; hedef dizine doğrudan mı, ortak bir veri dizininin altına mı — **varsayma**.
- Bunları **planın başında** yaz: "örnek: <sunucu> → <vg>/<lv>, bağlama <dizin> — bu düzene uydum".

## 3. Uygulama

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

## 4. fstab — tekrar çalıştırılabilir olmalı (A26)

```bash
cp -a /etc/fstab /etc/fstab.$(date +%F-%H%M)                       # önce yedek
mkdir -p <dizin>                                                  # verify'dan ÖNCE (yoksa [E] target)
UUID=$(blkid -s UUID -o value /dev/<vg>/<lv>)
grep -q "UUID=$UUID" /etc/fstab || echo "UUID=$UUID  <dizin>  xfs  defaults  0 0" >> /etc/fstab
findmnt --verify                                                  # [E] satırı varsa DUR, yeniden başlatma
systemctl daemon-reload && mount <dizin> && findmnt <dizin>
```
- **UUID kullan** — `/dev/sdb` yeniden başlatmada `/dev/sdc` olabilir.
- Satır zaten varsa **ekleme** (plan ikinci kez çalışırsa çift satır = açılışta hata). Çıplak `>> /etc/fstab` yazma.
- `mount -a` yerine yalnız yeni dizini bağla: `mount -a` ilgisiz, bozuk başka satırları da tetikler.

## 5. Doğrulama ve rapor

`lsblk -f`, `vgs`, `lvs -o +devices`, `df -h <dizin>`, `findmnt <dizin>` — öncesi/sonrası. Raporda: hangi cihaz
(keşif kanıtıyla), hangi ad kalıbına uyuldu, fstab satırı, yedek dosyasının adı, geri alınamaz adımlar.

## Plan istenince (uygulamadan)

Plan = keşif komutları + çıktılarına göre dallanan adımlar, **sabit cihaz harfi ya da uydurma ad içermez**.
Her yıkıcı adımın önünde onun ön koşulu yazar ("yalnız 1. adımda `/dev/<disk>` boş çıktıysa").
