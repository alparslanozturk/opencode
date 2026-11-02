---
name: veeam-linux
description: Veeam'in yönettiği Linux sunucuda (restore hedefi, repository, Linux mount/transport sunucusu) restore ya da iş hatası — "dosya ya da dizin bulunamadı", "No such file or directory", "Permission denied", veeamtransport/veeamservice/veeamdeployment/veeamimmurepo/veeamnetfsmount servisleri, /tmp noexec, reboot/OS yaması sonrası Veeam sunucusu offline. Deterministik `veeam-tani.py` (salt-okunur komut + bilinen sebep kararı, kaynaklı). "veeam", "restore hatası", "geri yükleme hatası", "veeamtransport", "veeam servisleri", "yedekçi", "backup restore", "file not found restore" isteklerinde tetiklenir.
---

# Veeam — Linux sunucuda restore/iş hatası

Saha (Alp, 2026-11-02): dtlmrestore'da restore başlatınca yedekçi "dosya ya da dizin bulunamadı" hatası alıyor — "temp diziniyle mi alakalı?"
Ajan kanıt toplamadan 6 servisi yeniden başlattı ve "5 serviden 6'sı" yazdı. **Önce kanıt, sonra (gerekirse) değişiklik.**
Etiketler: **(KB)** Veeam bilgi bankası · **(forum)** Veeam R&D forumu, resmi değil · **(saha)** · bilinmeyen `[SAHA]`.

## 0. Servisler (saha ekranı, Veeam v12/v13 Linux bileşenleri)

`veeamservice` · `veeamtransport` (Data Mover; `/opt/veeam/transport/veeamtransport --run-service`) · `veeamdeployment` · `veeamenvironment` ·
`veeamimmurepo` (değiştirilemez/hardened repository) · `veeamnetfsmount` — **koşullu**: `ExecCondition=/opt/veeam/transport/veeamnetfsmount
-checkserver`; NFS bağlantısı yoksa `inactive (dead)` normaldir, hata değil. `systemctl status a b c` çıkış **3** = listedeki en az bir birim
çalışmıyor (systemd) — tek başına sorun değil.

## 1. Kanıt (salt-okunur, onay sormaz)

```bash
B=/root/ai/opencode/knowledge/skills/approved/veeam-linux
python3 $B/veeam-tani.py komut              # basılan ssh komutunu <sunucu> ile çalıştır, çıktısını borula:
ssh root@<sunucu> '<basılan komut>' | python3 $B/veeam-tani.py tani -
```

Toplanan: açılış zamanı (bugünkü OS yaması/reboot ile ilişki), veeam paketleri, `/tmp` `/var/tmp` `/opt` bağlama seçenekleri (noexec), `/tmp`
boş alan, `/run/veeamtransport`, `/opt/veeam`, servis durumları, `/var/log/VeeamBackup` + `/var/log/veeam` içindeki son "No such file /
Permission denied / Failed to create" satırları. Betik **BULGU** (kaynaklı) + **EKSİK KANIT** basar; tabloyu sen kurma.

**Asıl kanıt çoğu zaman VBR tarafındadır:** yedekçiden restore oturumunun **tam hata satırı**, restore türü (dosya/dizin geri yükleme · tam VM ·
Instant Recovery · Explorer) ve **hedef yol**. Bunu iste; hangi dosya/dizinin bulunamadığı orada yazar.

## 2. Bilinen sebepler (betiğin kuralları)

| Bulgu | Neden | Çözüm kimin | Kaynak |
|---|---|---|---|
| `/tmp` **noexec** (kurum RHEL 9 template'i CIS'li — `/tmp` noexec olabilir, sunucuda ölç) | Veeam betikleri `/tmp`'ye yükleyip oradan çalıştırır; noexec engeller — tipik hata "Permission denied" | Yedekçi: VBR sunucusunda `HKLM\SOFTWARE\Veeam\Veeam Backup and Replication\LinAgentFolder` (REG_SZ, sondaki `/` yok, ör. `/opt/veeam`) — klasörü Veeam oluşturmaz, **her** Linux sunucuda olmalı, tüm Linux iletişimini etkiler. Ya da `/tmp`'den noexec kaldırmak = CIS sapması, güvenlik kararı | KB2099 |
| `/run/veeamtransport` yok + transport çalışmıyor / logda `POSIX: Failed to create or open file [/var/run/veeamtransport/veeamtransport.pid]` + `No such file or directory` | OS yaması + reboot sonrası (V13; sunucu daha önce V12 ile kullanılmışsa) transport açılamıyor, sunucu VBR'de offline | Destek önerisi: `veeamtransport.service` dosyasını kenara al → reboot → VBR'de Managed servers → sunucuyu yeniden onayla. Geçici: `mkdir` + `chmod 755` (her reboot'ta kaybolur) | forum t=100308 (resmi KB yok) |
| Logda `/tmp/Veeam.Mount.FS.<GUID>/…` için "No such file" (`chown`) | Explorer (ör. Oracle) restore'unda mount yolu izin verilirken yok | Yedekçi + Veeam desteği (forumda çözüm yok) | forum t=86837 |
| Etkin servis `failed` | — | `journalctl -u <servis> -n 50` oku | systemd |

Hiçbiri yoksa: karar VBR iş logundaki satırla verilir. "Servisleri restart ettim, düzeldi" kanıt değildir — restore'u yedekçi yeniden denesin,
sonucu (başarılı/aynı hata) raporla.

## Yapmayacakların

- Kanıt toplamadan servis yeniden başlatma / `mkdir` / fstab değiştirme (değişiklik — onay ekranı; önce §1, sebep görünürse sor).
- `/tmp` noexec'i "kaldırayım" deme — CIS sertleştirmesi, güvenlik kararı; KB2099'un registry yolu yedekçinin işi.
- Veeam sürümü, hata metni, restore türü uydurma — `[SAHA]`, yedekçiye sor. Servis sayısını elle toplama (betik çıktısını aktar).
