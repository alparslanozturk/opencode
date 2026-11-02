---
name: veeam-linux
description: Veeam'in yönettiği Linux sunucuda (restore hedefi, repository, Linux mount/transport sunucusu) restore ya da iş hatası — "dosya ya da dizin bulunamadı", "No such file or directory", "Permission denied", veeamtransport/veeamservice/veeamdeployment/veeamimmurepo/veeamnetfsmount servisleri, /tmp noexec, reboot/OS yaması sonrası Veeam sunucusu offline. Deterministik `veeam-tani.py` (salt-okunur komut + bilinen sebep kararı, kaynaklı). "veeam", "mongodb restore", "vemdb", "veeam mongo", "fingerprint", "parmak izi", "Failed to validate ssh fingerprint", "restore hatası", "geri yükleme hatası", "veeamtransport", "veeam servisleri", "yedekçi", "backup restore", "file not found restore" isteklerinde tetiklenir.
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

## 2b. SSH parmak izi — "Failed to validate ssh fingerprint settings" (saha 2026-11-02)

Restore sihirbazında (MongoDB primary node bağlantısı) `ExplorerManagementService: Failed to validate ssh fingerprint settings (sessionId = …),
Restore session already closed`. VBR, Linux sunucunun SSH host anahtar parmak izini saklar ve her bağlantıda karşılaştırır.
- Sunucunun gerçek parmak izleri ve anahtar dosya tarihleri `veeam-tani.py komut` çıktısında (NOT satırı) — yedekçinin VBR'de gördüğüyle
  karşılaştırsın. Anahtar dosyası son açılıştan/bugünden yeniyse betik BULGU der (anahtar değişmiş).
- VBR tarafı (yedekçi): **Options → Security → Linux hosts authentication** ("Add unknown hosts to the list manually" seçiliyse yeni/değişen
  parmak izi **Inventory → Untrusted** altında onay bekler) · ya da Backup Infrastructure → Managed servers → sunucu → düzenle → parmak izini
  yeniden onayla. KB4524 aynı sınıf hatayı (12.1 yükseltmesi sonrası boş parmak izi) bu yolla çözer.
- "Restore session already closed" → sihirbaz önceki hatada oturumu kapatmış; düzelttikten sonra restore'u Explorer'dan **baştan** başlat.
- Kripto politikası DEFAULT değilse ya da sshd'de AllowUsers/AllowGroups varsa betik NOT yazar (Veeam hesabı listede mi; algoritma uyuşmazlığı
  — tahmin, VBR logunda doğrula).
- Bu doğrulama **VBR tarafında** (Windows, ExplorerManagementService) yapılır → Linux sunucunun loglarında görünmemesi beklenir, "logda yok"
  karşı kanıt değildir (saha: ajan "failed to validate ssh logda yok" diye bu katmanı eledi). VBR sunucusunun Veeam logları (genel:
  `C:\ProgramData\Veeam\Backup` altı) yedekçide.
- **Zaman damgası eşleşmeli:** "kök neden" yalnız bu denemenin saatindeki satırla söylenir. Gece 03:50–05:10 transport kopmaları ya da
  aylar önceki `vemdb…sock` satırı gündüzki restore'un sebebi değildir; ayrı yaz.
- Kimlik bilgisi (parola) doğru olsa da parmak izi onaylanmadan bu adım geçmez — yedekçi parolayla birlikte §2b'deki onayı da yapsın.
- Hatalar art arda değişebilir (önce "No such file", sonra parmak izi): her denemede **yeni** hata satırını ve saatini al; ajanın log yorumu
  ("RPC bağlantı hatası") ile Veeam'in ekrandaki hatası çelişirse ekrandaki/VBR logundaki metin esastır.

## 3. MongoDB restore (Veeam v13 — Veeam Explorer for MongoDB / plug-in)

Saha (Alp, 2026-11-02): dtlmrestore, v13, MongoDB 7.0.15 (port 27023), CardCampaign → CardCampaignRest; "daha önce çok restore edilmiş".
Ajan `/var/tmp/vemdb<guid>.sock` yok, üretim mongod'u `/tmp/mongodb-27023.sock`'ta diye "Veeam farklı soket bekliyor" dedi ve parolasız
`mongodump … --out /tmp/…` denemek istedi — **ikisi de yanlış yol** (aşağıda).

**Nasıl çalışır (resmi, v13 User Guide "How Restore Works", build 13.1.2.57):** Explorer → Mount Service → Explorers Recovery Service, hedef
replica set'in **primary** node'una *Veeam MongoDB Restore Agent* koyar → ajan kullanıcı yetkisini ve **boş alanı** denetler → Mount Service
yedeği **FUSE** ile `/run/media` altına bağlar → ajan bağlanan dosyalardan **geçici bir MongoDB instance** başlatır → `mongodump` (stdout) |
`mongorestore` (stdin) ile koleksiyonları hedefe yazar → biter, geçici instance kapanır, ajan silinir, bağlama kalkar.
Tahmin (belgede yok, adından): `/var/tmp/vemdb<guid>.sock` bu **geçici** instance'ın soketidir; üretim mongod'unun soketiyle ilgisi yok. Soket yoksa
→ geçici mongod **başlamamış**; sebep aynı zaman damgalı log satırlarındadır. Eski tarihli "Removing file …vemdb….sock" satırı önceki başarılı
restore'un temizliğidir — bugünkü denemenin saatine bak.

**Koşullar (resmi):**
- OS **RHEL 8.4 – 9.6** (x86_64) · MongoDB **7.0 / 8.0 / 8.2 / 8.3** · **standalone desteklenmez** (replica set), sharded desteklenmez.
- Restore eden plug-in build'i, yedeği alan build'den **eşit ya da yeni** olmalı — build numarası dahil (ör. 13.0.1.1071 ile 13.0.1.2067'nin
  yedeği açılmaz).
- Hedef MongoDB kullanıcısı **root** rolünde; Linux tarafı root yetkili kullanıcı.

"Daha önce çalışıyordu" → **neyin değiştiğine** bak: bugünkü OS yaması (9.6 üstü sürüm destek listesi dışı), VBR/plug-in yükseltmesi (build
sırası), kaynak MongoDB'nin sürüm yükseltmesi (geçici instance hedefteki mongod ile açılamayabilir — tahmin, log ile doğrula).

```bash
python3 $B/veeam-tani.py mongo-komut       # basılan komutu <sunucu> ile çalıştır:
ssh root@<sunucu> '<basılan komut>' | python3 $B/veeam-tani.py tani -
```

Betik: OS sürümü / mongod sürümü / replica set / `/dev/fuse` / vemdb geçen loglar ve hata satırları → BULGU + EKSİK KANIT. Yedekçiden:
restore oturumunun tam hata satırı ve **zamanı**, yedeği alan ve restore eden plug-in build'leri, kaynak mongod sürümü.

**Yapma:** tanı için `mongodump`/`mongorestore` çalıştırma (veri kopyalar, `-u` ile parola ister, `/tmp`'yi doldurur — Veeam'in hatasını
göstermez); üretim mongod'unu yeniden başlatma; soket dosyası elle oluşturma.

## Yapmayacakların

- Kanıt toplamadan servis yeniden başlatma / `mkdir` / fstab değiştirme (değişiklik — onay ekranı; önce §1, sebep görünürse sor).
- `/tmp` noexec'i "kaldırayım" deme — CIS sertleştirmesi, güvenlik kararı; KB2099'un registry yolu yedekçinin işi.
- Veeam sürümü, hata metni, restore türü uydurma — `[SAHA]`, yedekçiye sor. Servis sayısını elle toplama (betik çıktısını aktar).
