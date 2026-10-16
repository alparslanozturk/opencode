---
name: sunucu-teslim
description: Yeni sunucu devralma, Satellite'e kaydetme, güncelleme ve ilgili birime teslim akışında kullan. "yeni sunucu", "teslim", "devral", "satellite", "kaydet", "subscription", "abonelik", "güncelle", "hazırla", "yeni sunucular kurulacak", "kurulum", "playbook sırası", "sep", "ipa" isteklerinde tetiklenir.
---

## Bağlam

Sunucular **CIS uyumlu, kurumsal regülasyona uygun RHEL şablonundan** (RHEL 9 de var — 2026-10-14 splsplunksh kurulumunda `el9` çekirdek görüldü)
kuruluyor. Bu şu anlama gelir:

- Sıkılaştırma ve temel yapılandırma **zaten hazır** — yeniden yapma (DNS ve NTP'yi kurumun
  playbook seti yine de uygular — bölüm 0)
- AD ekibi DNS A kaydını girer, sunucu sana öyle gelir
- **SELinux ve firewalld şablondan kapalı gelir** (kurum kararı; Alp, 2026-10-14; AGENTS.md "Kurum sunucu gerçekleri").
  `Disabled` / `inactive` normaldir — eksik sayma, açmayı önerme, sorun sebebi sayma. Ağ erişim izinlerini
  sunucuda değil ağ tarafında FW ekibi verir — sen açmazsın, **talep edersin**

Şablonun getirdiği bir şeyi "eksik" sanıp yeniden yapılandırma. Bir ayar
beklediğinden farklıysa önce şablonda öyle mi diye sor; CIS gereği bilinçli
olarak öyle bırakılmış olabilir.

Senin işin: devralma kontrolü → kurulum playbook'ları (bölüm 0) → teslim.

## 0. Kurumun kurulum playbook seti (Alp, 2026-10-13)

Kurulum elle komutla değil, çalışma dizinindeki `ansible/playbooks/` ile yapılır. Önce dizini listele
(adlar değişebilir), her playbook'u çalıştırmadan önce oku ve ne yapacağını/hangi değişkeni istediğini söyle.
Sıra (2026-10-13 itibarıyla):

```
01-ping            erişim
02-dns-nmcli       DNS — önce gelir: NTP, Satellite kaydı ve IPA join adla çözmeye bağlı
03-ntp
04-subs            Satellite kaydı (kurumun abonelik playbook'u)
05-ipa             IdM/IPA'ya katılım
06-dnf             paket güncellemesi
07-sep-install     SEP (Symantec Endpoint Protection)
08-sep-sinirlama   SEP kaynak sınırı
09-disks-extend-*  ek disk → mevcut LV'yi büyüt (/, /var …)   ┐ disk başına BİRİ seçilir,
10-disks-add-*     ek disk → yeni bağlama noktası (/data …)  ┘ ikisi aynı diske uygulanmaz
11-reboot
```

- **Adım adım, kullanıcı kontrolünde (Alp, 2026-10-14):** her adım bitince dur, sonucu göster, sonraki adımı **sor**.
  Araya başka iş girdiyse (disk düzeltme, reboot) önceki "X ile devam et" onayı düşer — sıradaki adıma yeniden sor.
  "Verilen işi sonuna kadar yap" (AGENTS.md) bu akışta adımın **içi** içindir, adımlar arası geçiş için değil.
- **Her zaman `-l <sunucu>` ile çalıştır** — playbook'ların çoğu `hosts: all`; limitsiz çalıştırma envanterdeki
  tüm sunuculara uygular. Birden çok yeni sunucuda önce birinde bitir, sonra diğerlerine geç.
- **DNS:** yalnız NetworkManager üzerinden (`nmcli`); RHEL'de `/etc/resolv.conf`'u NM yazar, elle düzenleme
  kaybolur (eski `resolv.conf` playbook'ları bu yüzden kaldırıldı). Değerler playbook içinde (2026-10-13'te Alp
  doğruladı): `spl*` bir DNS çifti, `stl*`/`sxl*`/`sdl*` başka bir çift kullanır — IP'leri playbook'tan oku.
- **Disk:** OS diski **beklenen** `sda`'dır (VM şablonu) ama açılışta sıra değişebilir — hangi diskin OS olduğunu
  adından değil `lsblk` çıktısından oku (altında `/boot`, `/` ya da LVM üyesi olan disk OS'tur), her sunucu için ayrı.
  Tablo başlığına "sda (Sistem) / sdb (Boş)" yazma. Disk işinde playbook kullanılmıyorsa **önce `depolama`
  becerisini yükle**. Kurum `/data` düzeni LVM'dir (Alp'in örneği, splsplunksh02: `sdb` → `kt_rhel_vg/kt_rhel_lv` →
  `/data`, xfs; fstab'da LV yolu `/dev/kt_rhel_vg/kt_rhel_lv`, UUID değil); diske doğrudan `mkfs` yapılmaz. Ek disklerin (sdb, sdc …) ne olacağı **kurulum talebinde
  sorulur** — `/` büyütme, `/var` büyütme, `/data` ya da proje adıyla yeni dizin (ör. `/genesys/gcti`). Hedefi
  tahmin etme, kullanıcıya sor. Disk adı sabit değildir: `lsblk -f` ile oku, boş olduğunu `depolama`
  becerisindeki kontrolle kanıtla. OS `sda`'da değilse sunucu yeniden başlatılarak düzeltilir (Alp, 2026-10-14 — beklenen akış):
  1) kullanıcıya açıkça söyle: "<sunucu>'da OS `sdX`'te, `sda` boş — reboot gerekiyor, disk işine geçmiyorum";
  2) onayla yeniden başlat; 3) açılınca `lsblk`'ı **tekrar** çalıştır ve göster; 4) OS `sda`'ya geçtiyse disk adımına
  devam, hâlâ değilse dur ve sor. Bu sunucuda reboot öncesi `lsblk` sonucuyla disk işlemi yapılmaz.
- **Ön kontrol:** iki sunucu adı aynı IP'ye çözülüyorsa (`getent hosts`) o sunucuya hiçbir playbook çalıştırma —
  ikinci sunucuya giden iş ilkinin üstüne uygulanır. IP tahsisi/DNS kaydını düzeltecek ekibe bildir.

## 1. Devralma kontrolü

Kendi işine başlamadan önce, önceki ekiplerin işini doğrula. Bir eksik varsa
**o ekibe geri gider**, sen düzeltmezsin.

```bash
hostnamectl                                  # FQDN doğru mu
getent hosts $(hostname -f)                  # DNS A kaydı çözülüyor mu
dig +short $(hostname -f)                    # AD ekibinin kaydı
timedatectl                                  # NTP senkron mu
chronyc sources -v | head                    # kaynak var mı, '^*' satırı
cat /etc/os-release | grep VERSION_ID        # beklenen sürüm mü
```

Sık çıkan eksikler ve kime ait:

| Eksik | Kime |
|---|---|
| DNS A kaydı yok / yanlış | AD ekibi |
| Ters DNS (PTR) yok | AD ekibi |
| NTP senkron değil | şablon/sanallaştırma |
| Beklenen port kapalı | FW ekibi (talep aç) |

## 2. Satellite kaydı

```bash
subscription-manager status
subscription-manager identity                # zaten kayıtlı mı
```

Zaten kayıtlıysa tekrar kaydetme; şablondan gelen kayıt olabilir.

Kayıt (yan etkili, **onay al**): kurumun `04-subs` playbook'u ile, `-l <sunucu>` vererek. Kendi
`subscription-manager register` komutunu kurma; organizasyon ve aktivasyon anahtarı playbook'ta/kurulum
talebinde — tahmin etme (yanlış anahtar yanlış yama setine bağlar).

Doğrulama:

Kurum Satellite'ı **Simple Content Access (SCA)** modunda: bu modda `Overall Status` sürüme göre `Disabled` ya da
`Registered` görünür (saha 2026-10-14: 9.2'de `Disabled`, 9.8'de `Registered`) — ikisi de **normaldir** — çıktının kendisi "This host has access to content, regardless of
subscription status" der (saha, 2026-10-14). Kayıt sorunu sanıp yeniden kayıt (`04-subs`/`register`) önerme;
kayıt kanıtı `identity` + `dnf repolist`'te kurum depolarının (`rhel-9-for-x86_64-baseos-rpms` …) görünmesidir.

```bash
subscription-manager status                  # SCA: "Disabled" + "Simple Content Access" satırı = normal
subscription-manager identity                # kayıtlı mı, hangi organizasyon/ortam
subscription-manager repos --list-enabled | grep -E '^Repo ID'
dnf repolist
```

Kayıt başarısız olursa hata mesajını aynen göster. Satellite sunucusunun içi (content view, `hammer`)
kapsam dışıdır (`rhel-yonetim` → "Satellite kaydı"); sorunu Satellite yöneticisine ilet.

## 3. Güncelleme

**Hedef sürüm (Alp, 2026-10-14):** amaç sunucuyu sorunsuz biçimde **ana sürümünün en son minor'üne** getirmek
(RHEL 8 → 8'in, RHEL 9 → 9'un en sonu). Belirli bir minor'de kalacaksa Alp `subscription-manager release --set 9.4`
gibi sabitler; o zaman 9.4'ü geçmez. `release` boşsa (`Release not set`) en son sürüme gider — Satellite bunu
Content View ile yönetir:

- Kayıt varsayılan olarak ana sürümün CV'sine bağlanır (RHEL8 / RHEL9 / RHEL10); bu CV'ler genelde en son minor'ü
  taşır (2026-10-14 itibarıyla RHEL 9 için **9.8**).
- 9.4 özel durum: o sürümde tutulacak sunucular için ayrı bir CV yapıldı ve `release --set 9.4` ile sabitlendi.
  Kullanıcı istemedikçe sunucuyu bu CV'ye bağlama, `release` ayarına dokunma.
- Güncelleme sonrası `cat /etc/redhat-release` CV'deki minor'ü göstermeli; göstermiyorsa (ör. `release` boş ama 9.2'de
  kaldı) teslim etme, kullanıcıya bildir.

Güncellemeden önce oku, tahmin etme, sonucu kullanıcıya söyle:

```bash
subscription-manager release --show          # sabit minor var mı
cat /etc/redhat-release                      # şu anki minor
```

```bash
dnf check-update                             # önce ne geleceğini gör
dnf update --security --assumeno             # kuru çalıştırma
```

Uygulama (yan etkili, **onay al**): kurumun `06-dnf` playbook'u ile, `-l <sunucu>` vererek — önce playbook'u oku.
Aynı işi `ssh … "dnf update -y"` döngüsüyle yapma; `--skip-broken` ekleme (bozuk bağımlılığı sessizce atlar).
Sonucu playbook çıktısından (`failed=0`) oku; kendi "tamamlandı" mesajını basma — `| tail` çıkış kodunu yutar.

```bash
needs-restarting -r                          # yeniden başlatma gerekiyor mu (okuma)
```

**Güncelleme sırasında bağlantı koptuysa** işlem yarım kalmış olabilir. Hafızadan durum söyleme, sunucudan oku
(hepsi okuma; komutlar dnf 4.20'de denendi):

```bash
pgrep -a dnf                                 # hâlâ çalışıyor mu — çalışıyorsa bekle, ikinci dnf başlatma
dnf history list | head -5                   # son işlem tamamlandı mı ("Altered" sütununda E/EE = hata)
dnf history info last                        # son işlemin ayrıntısı
dnf check                                    # bağımlılık/çift paket sorunu
dnf repoquery --duplicates                   # yarım kalan işlemden çift paket
```

Sorun görürsen düzeltmeyi kendin seçme — çıktıyı göster, kullanıcıya sor.

`needs-restarting -r` sıfırdan farklı dönerse çekirdek ya da temel kütüphane
güncellenmiştir; yeniden başlatma gerekir. Bunu **teslimden önce** yap,
teslim ettiğin birime bırakma.

Yeniden başlatma sonrası:

```bash
uptime                                       # gerçekten yeniden başladı mı
systemctl --failed                           # açılışta düşen servis var mı
journalctl -p err -b --no-pager | tail -20
```

`systemctl --failed` boş olmalı. Değilse teslim etme, önce çöz.

## 4. Teslim öncesi son kontrol

```bash
subscription-manager status
dnf repolist
timedatectl
systemctl --failed
df -h
free -h
```

SELinux ve firewalld şablondan kapalı gelir — `getenforce` / `firewall-cmd` teslim kontrolü değildir.

## 5. Teslim raporu

Teslim ettiğin birime şunları yaz:

- FQDN ve IP
- RHEL sürümü ve çekirdek sürümü (`uname -r`)
- Satellite kaydı: organizasyon ve içerik görünümü
- Uygulanan güncellemelerin tarihi, yeniden başlatıldı mı
- Ek ağ erişimi gerekiyorsa FW ekibine talep açmaları gerektiğini belirt
- Bilinen eksik ya da beklemede olan bir şey varsa açıkça

Rapor `rapor-envanter` becerisiyle CSV ya da HTML olarak da üretilebilir.

## Yapmayacakların

- SELinux / firewalld durumunu değiştirme (şablonda kapalı; açmayı da önerme)
- Şablondan gelen sıkılaştırma ayarlarını "kolaylık olsun" diye gevşetme
- Parola politikası, `sshd_config`, `auditd` yapılandırmasına dokunma

Bunların hepsi CIS uyumluluk denetiminde çıkar ve sunucu geri gelir.
