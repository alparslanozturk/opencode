---
name: sunucu-teslim
description: Yeni sunucu devralma, Satellite'e kaydetme, güncelleme ve ilgili birime teslim akışında kullan. "yeni sunucu", "teslim", "devral", "satellite", "kaydet", "subscription", "abonelik", "güncelle", "hazırla", "yeni sunucular kurulacak", "kurulum", "playbook sırası", "sep", "ipa" isteklerinde tetiklenir.
---

## Bağlam

Sunucular **CIS uyumlu, kurumsal regülasyona uygun RHEL 10 şablonundan**
kuruluyor. Bu şu anlama gelir:

- Sıkılaştırma ve temel yapılandırma **zaten hazır** — yeniden yapma (DNS ve NTP'yi kurumun
  playbook seti yine de uygular — bölüm 0)
- AD ekibi DNS A kaydını girer, sunucu sana öyle gelir
- Güvenlik duvarı izinlerini FW ekibi verir — sen açmazsın, **talep edersin**

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

- **Her zaman `-l <sunucu>` ile çalıştır** — playbook'ların çoğu `hosts: all`; limitsiz çalıştırma envanterdeki
  tüm sunuculara uygular. Birden çok yeni sunucuda önce birinde bitir, sonra diğerlerine geç.
- **DNS:** yalnız NetworkManager üzerinden (`nmcli`); RHEL'de `/etc/resolv.conf`'u NM yazar, elle düzenleme
  kaybolur (eski `resolv.conf` playbook'ları bu yüzden kaldırıldı). Değerler playbook içinde; 2026-10-13'te Alp
  doğruladı: `spl*` → 10.13.8.1 / 10.13.9.1, `stl*`/`sxl*`/`sdl*` → 10.14.6.1 / 10.14.6.2.
- **Disk:** `sda` = OS diski, VM şablonundan gelir. Ek disklerin (sdb, sdc …) ne olacağı **kurulum talebinde
  sorulur** — `/` büyütme, `/var` büyütme, `/data` ya da proje adıyla yeni dizin (ör. `/genesys/gcti`). Hedefi
  tahmin etme, kullanıcıya sor. Disk adı sabit değildir: `lsblk -f` ile oku, boş olduğunu `disk-ekleme`
  becerisindeki kontrolle kanıtla. OS `sda`'da değilse sunucu yeniden başlatılarak düzeltilir.
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

```bash
subscription-manager status                  # Overall Status: Current
subscription-manager repos --list-enabled | grep -E '^Repo ID'
dnf repolist
```

Kayıt başarısız olursa hata mesajını aynen göster. Satellite sunucusunun içi (content view, `hammer`)
kapsam dışıdır (`rhel-yonetim` → "Satellite kaydı"); sorunu Satellite yöneticisine ilet.

## 3. Güncelleme

```bash
dnf check-update                             # önce ne geleceğini gör
dnf update --security --assumeno             # kuru çalıştırma
```

Uygulama (yan etkili, **onay al**):

```bash
dnf update -y
needs-restarting -r                          # yeniden başlatma gerekiyor mu
```

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
getenforce                                   # CIS şablonunda Enforcing olmalı
firewall-cmd --list-all
```

`getenforce` **Enforcing** dönmeli. `Permissive` ya da `Disabled` ise şablon
bozulmuş demektir — teslim etme, araştır. Bunu sen kapatmadıysan biri
kapatmıştır ve regülasyon ihlalidir.

## 5. Teslim raporu

Teslim ettiğin birime şunları yaz:

- FQDN ve IP
- RHEL sürümü ve çekirdek sürümü (`uname -r`)
- Satellite kaydı: organizasyon ve içerik görünümü
- Uygulanan güncellemelerin tarihi, yeniden başlatıldı mı
- Açık portlar (`firewall-cmd --list-all`) — ek port gerekiyorsa FW ekibine
  talep açmaları gerektiğini belirt
- Bilinen eksik ya da beklemede olan bir şey varsa açıkça

Rapor `rapor-uret` becerisiyle CSV ya da HTML olarak da üretilebilir.

## Yapmayacakların

- SELinux'u kapatma, `getenforce` çıktısını değiştirme
- Güvenlik duvarına kalıcı kural ekleme — o FW ekibinin işi
- Şablondan gelen sıkılaştırma ayarlarını "kolaylık olsun" diye gevşetme
- Parola politikası, `sshd_config`, `auditd` yapılandırmasına dokunma

Bunların hepsi CIS uyumluluk denetiminde çıkar ve sunucu geri gelir.
