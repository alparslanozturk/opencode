---
name: idm-kurulum
description: Red Hat IdM (FreeIPA) sunucusu/replikası kurarken ve AD trust kurarken kullan — AD alanının alt alanında IdM (idm.<ad-alan>), entegre DNS YOK (DNS ve NTP MS AD'den), AD DNS'e girilecek kayıt listesi (ipa dns-update-system-records --dry-run), entegre CA'lı kurulum + https (isteğe bağlı ldaps) için kurum MSCA sertifikası (şifresiz PEM key + sertifika), sertifika takibi ve yenileme (süresi dolmadan / dolmuş / yeni subCA), IPv6 çekirdek şartı, umask 0022 (CIS çakışması), NetBIOS adı, portlar, ipa-adtrust-install / ipa trust-add, sertifika yenileme, istemci katılımı. "idm kur", "ipa kur", "freeipa", "ipa-server-install", "replica", "ad trust", "trust kur", "ipa-adtrust-install", "idm sertifika", "ldaps sertifika", "sertifika yenile", "sertifika süresi", "subca değişti", "ara sertifika", "getcert", "idm dns kayıtları", "ipa-client-install", "idm join" isteklerinde tetiklenir. HBAC/sudo/AD grup eşleme ve erişim denetimi `idm-erisim`. Kurulum değişikliktir (kurulum yetkisi + sunucular).
---

# IdM sunucusu + AD trust — AD DNS'li ortam

Kaynak: Red Hat *Installing Identity Management* (RHEL 9: hazırlık §1, entegre DNS'siz kurulum, CA'sız kurulum, replica), *Installing trust
between IdM and AD* (önkoşullar, DNS, portlar, trust kurulumu), *Managing certificates in IdM* (web/LDAP sertifikası değiştirme: süresi dolmadan §15, tümünde dolmuş §16) — indirme
2026-10-24; *Using IdM Healthcheck* (§10 sertifika denetimi), `ipa-server-certinstall(1)`, `ipa-cacert-manage(1)` ve FreeIPA kaynağı
(`ipa_server_certinstall.py`, `ipapython/certdb.py` — PIN/şifresiz anahtar) — 2026-10-25. **(Alp)** kurum politikası (2026-10-24) · **(genel)** doğrulanmadı. Kurum alan/sunucu adları burada yok: `<ad-alan>` (ör. AD alanı),
`idm.<ad-alan>` (IdM alanı) — gerçek adı kullanıcıdan/envanterden al.

## 0. Kurum politikası (Alp, 2026-10-24)

- IdM alanı AD alanının alt alanı: AD `<ad-alan>` → IdM `idm.<ad-alan>` (Red Hat bu düzeni destekler: "example.com for AD and idm.example.com
  for IdM"; Kerberos realm = alanın büyük harfi, ör. `IDM.<AD-ALAN>`).
- **Tüm sunucular DNS ve NTP'yi MS AD'den alır** → IdM **entegre DNS'siz** kurulur; DNS kayıtlarını Alp listeler, **AD yöneticileri AD DNS'e girer**.
- **CA (Alp, 2026-10-25):** IdM **entegre CA ile** kurulur. Kurum (MSCA) sertifikası yalnız **https** (web arayüzü) ve **ldaps** için;
  ldaps'e de MSCA takılıp takılmayacağı **Alp'in kararı** (§3 A/B). Güvenlik birimi key + sertifikayı **base64 PEM** verir, anahtar
  **şifresiz** (PIN yok, PFX/keystore yok). Sertifika adı kalıbı (wildcard mı, sunucu FQDN'i mi) `[SAHA]` — §3.
- MSCA'da kök aynı kalıp **yalnız subCA yenilenebilir**; eski subCA IdM'de **durabilir** (Alp, 2026-10-25) — §6.3.
- Satellite'tan gelen VM'lerde kurum CA + subCA zaten güvenilir (Alp) — istemci tarafında CA dağıtma işi yok.
- Kurulum dokümanı Alp'te var; kurum ayrıntısı gerekiyorsa sahada yerelde kaydettirilir (`kurum-bilgisi-yerelde`).

## 1. Ön kontroller (okuma — her IdM sunucusu adayında)

```bash
ssh root@<idm-aday> 'hostname; getent ahosts $(hostname) | cut -d" " -f1 | sort -u; dig +short -x $(hostname -I | cut -d" " -f1); cat /etc/hosts; sysctl net.ipv6.conf.all.disable_ipv6; grep -o "ipv6.disable=[01]" /proc/cmdline; umask; chronyc sources | head -5; grep ^VERSION_ID= /etc/os-release; rpm -q ipa-server ipa-server-trust-ad 2>/dev/null'
```
| Şart | Kaynak | Not |
|---|---|---|
| **IPv6 çekirdekte açık** (ağda gerekmez) | RH hazırlık §1.3.1; trust önkoşulu | Kapalıysa CLDAP eklentisi açılmaz. **Kurum şablonunda IPv6 kapatılmış olabilir** (AGENTS) → `ipv6.disable=1` / `disable_ipv6=1` görürsen kurulumu durdur, Alp'e sor |
| FQDN, küçük harf, kalıcı; `localhost` değil; tek A + tek PTR | RH §1.5 | Ad kurulumdan sonra **değiştirilemez**; PTR birden çok ad dönerse httpd öngörülemez davranır |
| `/etc/hosts`: ya hiç kayıt yok ya da FQDN kısa addan önce, localhost satırında değil | RH §1.5 | |
| **root umask 0022** (kurulum sırasında) | RH §1.9 | CIS root umask'ı kısıtlar (`rhel-cis` §3) → kurulum oturumunda `umask 0022`; aksi halde ör. replica kurulamaz |
| Saat senkron (Kerberos ≤ 5 dk) | trust önkoşulu | NTP AD'den (Alp) |
| Temiz sistem (DNS/Kerberos/Apache/DS özel ayarı yok); fapolicyd kuralı engellemesin | RH §1.2, §1.10 | Kurulum dosyaları `/var/lib/ipa/sysrestore/`'a yedekler |

**Portlar (kurum firewalld kapalı; ağ güvenlik duvarı için liste):** IdM sunucuları arası ve istemciden: 80/443 TCP, 389/636 TCP, 88/464 TCP+UDP
(DNS 53 yalnız entegre DNS'te) · **AD trust:** 135 TCP, 445 TCP+UDP, 49152–65535 TCP (dinamik RPC), 3268 TCP (GC), 389 TCP+UDP; 138/139 gerekmez
(ipa-adtrust-install özeti listelese de) — RH trust "Ports". İstemci → AD DC Kerberos 88 (SSSD varsayılan TCP).

## 2. Ad planı (geri dönüşsüz — Alp onayı)

- Alan `idm.<ad-alan>`, realm `IDM.<AD-ALAN>`, sunucu FQDN'leri (`<idm01>.idm.<ad-alan>` gibi) — kurulumdan sonra değişmez.
- **NetBIOS adı** (trust): tek kelime, nokta yok, ≤ 15 karakter, AD'ninkinden **farklı** (genelde alanın ilk etiketi — IdM için `IDM`).

## 3. Sertifika (CA'lı kurulum — https/ldaps'e kurum MSCA'sı)

- CA'lı kurulumda IdM CA ana makine/servis sertifikalarını verir; **certmonger** bunları süresi dolmadan kendisi yeniler (RH *Managing
  certificates*). Kurulumda sertifika bayrağı verilmez; MSCA sertifikası kurulumdan **sonra** takılır (§6.1 → §6.2).
- Dış CA'nın imzaladığı web/LDAP sertifikasını IdM **yenilemez** — yenileme elle (§6), takibi §7.
- **Seçenek A — yalnız https MSCA:** LDAP sertifikası IdM CA'dan gelir, certmonger yeniler; elle iş sunucu başına 1 sertifika. IdM'e
  katılmamış ama ldaps'e bağlanan uygulama IdM CA'ya (`/etc/ipa/ca.crt`) güvenmeli (genel — katılmış istemcilere `ipa-client-install` /
  `ipa-certupdate` dağıtır).
- **Seçenek B — https + ldaps MSCA:** tüm VM'ler MSCA'ya zaten güvenir (Satellite); elle iş sunucu başına 2 sertifika; tümünde süresi
  dolarsa §6.4'teki elle NSS adımları LDAP'ı da kapsar.
- **Sertifika adı:** sunucu başına kendi FQDN'i SAN'da — RH: her IdM sunucusunun anahtar çifti ve subject'i farklıdır, ayrı yenilenir.
  ACME açıksa web sertifikasında SAN `ipa-ca.<idm-alan>` şart (`ipa-server-certinstall(1)`). Wildcard için RH belgesinde açık kural
  bulunamadı (2026-10-24) → **bilinmiyor**; FQDN'li iste, wildcard isteniyorsa önce test ortamında dene.
- **Şifresiz anahtar:** `--pin ''` ya da PIN isteminde Enter — FreeIPA kaynağı: PEM `PRIVATE KEY` / `RSA PRIVATE KEY` boş PIN ile
  parolasız okunur, parola yalnız `ENCRYPTED PRIVATE KEY` için. Kabul edilen biçimler: PEM, DER, PKCS#7, PKCS#8, ham anahtar, PKCS#12.
- **Takmadan önce dosyaları denetle:** `sertifika-kontrol.py <crt> <key> <subca.pem> <kok.pem> --ad <fqdn>` (`rancher-sertifika`
  becerisinde) — kalan gün, anahtar eşleşmesi, zincir, verify; özel anahtarı basmaz.
- `ipa-server-certinstall` zinciri IdM'in CA deposunda arar; yoksa durur ("Please run ipa-cacert-manage install and ipa-certupdate",
  FreeIPA kaynağı) → MSCA kök + subCA önce §6.1 ile eklenir.

## 4. Kurulum sırası (değişiklik — "kurulum yapacağım" + `sunucular:`)

1. Paket: `dnf install ipa-server ipa-server-trust-ad` (Satellite reposundan; `dnf install --assumeno` ile önce dene).
2. Sunucu (DNS'siz, entegre CA'lı, NTP'ye dokunmadan): `umask 0022; ipa-server-install --domain idm.<ad-alan> --realm IDM.<AD-ALAN>
   --netbios-name <NB> --no-ntp` — sertifika bayrağı yok (IdM CA kurulur); MSCA sertifikası kurulumdan sonra §6.1 → §6.2. `--no-ntp` chrony'ye dokunmaz (AD NTP'si kalır; RH NTP seçenekleri); parolalar etkileşimli
   girilsin, komut satırına/loga yazdırma. Bayrakları `ipa-server-install --help` ile doğrula (sürüme göre).
3. Kurulum sonunda `/tmp/ipa.system.records.<rastgele>.db` dosyası basılır — "kayıtlar DNS'e eklenmeden kurulum **tamamlanmış sayılmaz**" (RH).
4. **Trust hazırlığı:** `kinit admin` → `ipa-adtrust-install` (DNS'siz kurulumda eklenmesi gereken servis kayıtlarını listeler) — bunu yaptığın
   sunucu "AD trust controller" olur; bir kez çalıştırılır (RH).
5. **AD yöneticilerine gidecek liste (okuma):** `ipa dns-update-system-records --dry-run` — Kerberos/LDAP SRV, `_kerberos` TXT, `_ipa-ca` A ve trust
   kayıtları. Listeyi aynen ilet; IdM sunucularının A + PTR kayıtları ayrıca. AD tarafında koşullu yönlendirme yerine kayıtlar AD DNS'te tutulur (kurum).
6. Kayıtlar girildikten sonra doğrula (okuma, her IdM sunucusundan ve bir istemciden):
   ```bash
   dig +short -t SRV _kerberos._udp.idm.<ad-alan>.; dig +short -t SRV _ldap._tcp.idm.<ad-alan>.; dig +short -t TXT _kerberos.idm.<ad-alan>.
   dig +short -t SRV _kerberos._tcp.dc._msdcs.<ad-alan>.; dig +short -t SRV _ldap._tcp.dc._msdcs.<ad-alan>.
   ```
   RH: `ipa-adtrust-install`'dan sonra (IdM ya da AD entegre DNS kullanmıyorsa özellikle) DNS doğrulamasını her seferinde yap.
7. Trust: `ipa trust-add --type=ad <ad-alan> --admin <ad-yönetici> --password --range-type=ipa-ad-trust` (AD kullanıcılarına IdM ID üretir;
   AD'de POSIX öznitelikleri (uidNumber/gidNumber) tutuluyorsa `ipa-ad-trust-posix`) — AD kullanıcılarının UID/GID'leri bu seçimden gelir;
   hangisi olacağını AD'deki öznitelik durumuna göre **Alp karar verir**. Sonradan özel grup eşlemesi: `ipa idrange-mod --auto-private-groups=hybrid <range>` (RH).
8. Doğrulama: `kinit <kullanıcı>@<AD-ALAN>` · `ipa trust-show <ad-alan>` · `ipa server-role-find --role 'AD trust controller'` ·
   `smbclient -L <idm01-fqdn> -U <kullanıcı> --use-kerberos=required` (RH) · `id <kullanıcı>@<ad-alan>` · `ipa-healthcheck --failures-only`.
9. Replica (ikinci sunucu): aynı ön kontroller; CA yedekliliği için `--setup-ca` (genel — RH replica bölümünden doğrula); kendi MSCA sertifikası §6.2; trust ajanı/denetleyicisi gerekiyorsa `ipa-adtrust-install --add-agents` (RH).

## 5. İstemci katılımı (kurum playbook'u `05-ipa` — `rhel-teslim`)

`ipa-client-install --domain idm.<ad-alan> --mkhomedir --no-ntp` (NTP AD'den) — sunucu bulma DNS SRV kayıtlarıyla; kayıtlar yoksa `--server`
verilir (genel). Sonra `authselect current` (sssd profili beklenir) · `id <ad-kullanıcı>@<ad-alan>` · erişim kuralları → `idm-erisim`.
CIS taramasından **önce** katıl (`rhel-cis` §3 authselect notu).

## 6. MSCA sertifika işleri (değişiklik — elle; IdM CA'nın verdiklerini certmonger yeniler)

Her adım her IdM sunucusunda ayrı; Directory Manager parolası istenir (etkileşimli gir, komut satırına yazma). Servisler kendiliğinden
yeniden başlamaz (`ipa-server-certinstall(1)`). Realm'in tireli biçimi: `dirsrv@IDM-<AD-ALAN>` (RH örneği `dirsrv@IDM-EXAMPLE-COM`).

**6.1 MSCA kök + subCA'yı IdM'e tanıt** (ilk kurulumdan sonra bir kez; yeni subCA geldiğinde yeniden):
`ipa-cacert-manage install kok.pem` · `ipa-cacert-manage install subca.pem` — dosya başına **tek** sertifika (komut yalnız ilkini okur, RH)
→ `ipa-certupdate` **tüm IdM sunucularında ve istemcilerde** (man) → `ipa-cacert-manage list` (okuma). `install` IdM CA'yı değiştirmez,
bilinen CA ekler (man).

**6.2 Takma / süresi dolmadan yenileme** (RH §15; ön koşul: başka en az bir replikada sertifika geçerli):
`ipa-server-certinstall -w --pin '' <key> <crt>` (web) · B seçeneğinde ayrıca `-d` (LDAP) → `systemctl restart httpd` (+ B'de
`dirsrv@<REALM-TIRELI>`) → istemcilerde `ipa-certupdate` (RH) → §7 canlı uç kontrolü.

**6.3 Yeni subCA (kök aynı):**
1. Yeni subCA'yı 6.1 ile ekle ve `ipa-certupdate`'i her yerde çalıştır — yeni subCA'nın imzaladığı yaprağı **bundan önce takma**
   (zincir denetimi durdurur).
2. Yeni subCA aynı ada (subject) sahipse: man — aynı subject'li CA'lar birlikte durabilir, NSS takma adı aynı kalır; doğru zincir için
   **AKID/SKID** uzantıları şart → `openssl x509 -noout -ext authorityKeyIdentifier,subjectKeyIdentifier -in subca.pem` (okuma).
3. Yeni yaprakları 6.2 ile tak; §7 ile uçların yeni zinciri gönderdiğini doğrula.
4. Eski subCA **durabilir** (Alp). Temizlik istenirse: `ipa-cacert-manage prune` süresi dolmuş CA'ları siler; tek tek
   `ipa-cacert-manage delete <takma-ad>` (önce zincirin yaprak tarafı) → her yerde `ipa-certupdate` (man). Sürümde varlığını
   `ipa-cacert-manage --help` ile doğrula.
5. Satellite'tan gelen VM'lerin sistem güvenine yeni subCA'nın kimin tarafından eklendiği `[SAHA]` — uç ara CA'yı göndermiyorsa
   (§7 uyarısı) bu belirleyici olur.

**6.4 Süresi dolmuş:** tek sunucuda dolmuş, başka replikada geçerli → 6.2 yeter (RH §15 ön koşulu). **Tüm sunucularda** dolmuş → RH §16
yordamı, adım adım belgeden: önce yedek (`/etc/dirsrv/slapd-<REALM-TIRELI>/`, `/etc/httpd/alias`, `/var/lib/certmonger`,
`/var/lib/ipa/certs/`; isteğe bağlı `/var/lib/ipa/private`, `/var/lib/ipa/passwds`) → farklı CA ise 6.1 → web sertifikasını
`/var/lib/ipa/certs/`'e kopyala → LDAP için NSS'e `certutil`/`pk12util` ile elle → httpd + dirsrv yeniden başlat → her sunucuda
`ipa-server-certinstall -w/-d` ile kayda geçir (`--pin ''`). Tahmin (belgede yazmıyor): A seçeneğinde LDAP sertifikası IdM CA'dan
geldiği ve certmonger yenilediği için §16'nın LDAP adımları gerekmeyebilir — uygulamadan önce `getcert list` ile LDAP sertifikasının
durumuna bak.

## 7. Sertifika takibi (okuma — süresi dolmadan yakala; kurum kararı: otomatik izleme yok, on-demand)

- **Canlı uç:** `sertifika-kontrol.py --uc <fqdn>:443 --uc <fqdn>:636 kok.pem` — sunucunun gönderdiği zincir, kalan gün (❌ < 30,
  ⚠ < 120; `--esik`), SAN, verify (kök dosyasıyla), "uç yalnız yaprağı gönderiyor" uyarısı. Her IdM sunucusu için.
- `getcert list` — certmonger'ın takip ettiği sertifikalar (durum, bitiş). MSCA yapraklarının burada görünüp görünmediği bilinmiyor →
  MSCA için esas kontrol canlı uç.
- `ipa-healthcheck --source=ipahealthcheck.ipa.certs --failures-only` — certmonger süreleri (varsayılan bitişe 28 gün kala uyarı;
  `/etc/ipahealthcheck/ipahealthcheck.conf` → `cert_expiration_days`) ve sertifika dosyaları (RH Healthcheck §10).
- `ipa-cacert-manage list` — IdM'in tanıdığı CA'lar (yeni subCA eklenmiş mi).
- Sonucu kalan güne göre sıralı bildir; ❌ olan sunucu için 6.2'yi öner, uygulamak değişikliktir.

## Yapmayacakların

- IPv6 kapalı sunucuya kurulum; FQDN/realm'i "sonra düzeltiriz" diye geçici adla kurma.
- Entegre DNS (`--setup-dns`) kurma — kurum DNS'i AD'de (Alp).
- AD DNS'e kendin kayıt girme / AD'de değişiklik — listeyi AD yöneticilerine Alp iletir.
- Yeni subCA'yı 6.1 + her yerde `ipa-certupdate` yapmadan o subCA'nın imzaladığı yaprağı takma.
- MSCA yaprağı için `ipa-cacert-manage renew` — bu komut IdM CA'nın kendi sertifikası içindir (man); yaprak 6.2 ile değişir.
- `allow_all` HBAC kuralını özel kurallar yazılmadan kapatma (herkesin erişimi kesilir) → `idm-erisim`.
