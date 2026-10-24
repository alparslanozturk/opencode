---
name: idm-kurulum
description: Red Hat IdM (FreeIPA) sunucusu/replikası kurarken ve AD trust kurarken kullan — AD alanının alt alanında IdM (idm.<ad-alan>), entegre DNS YOK (DNS ve NTP MS AD'den), AD DNS'e girilecek kayıt listesi (ipa dns-update-system-records --dry-run), CA'sız kurulum + kurum MSCA sertifikası (PFX → PEM, https/ldaps), IPv6 çekirdek şartı, umask 0022 (CIS çakışması), NetBIOS adı, portlar, ipa-adtrust-install / ipa trust-add, sertifika yenileme, istemci katılımı. "idm kur", "ipa kur", "freeipa", "ipa-server-install", "replica", "ad trust", "trust kur", "ipa-adtrust-install", "idm sertifika", "ldaps sertifika", "idm dns kayıtları", "ipa-client-install", "idm join" isteklerinde tetiklenir. HBAC/sudo/AD grup eşleme ve erişim denetimi `idm-erisim`. Kurulum değişikliktir (kurulum yetkisi + sunucular).
---

# IdM sunucusu + AD trust — AD DNS'li ortam

Kaynak: Red Hat *Installing Identity Management* (RHEL 9: hazırlık §1, entegre DNS'siz kurulum, CA'sız kurulum, replica), *Installing trust
between IdM and AD* (önkoşullar, DNS, portlar, trust kurulumu), *Managing certificates in IdM* (web/LDAP sertifikası değiştirme) — indirme
2026-10-24. **(Alp)** kurum politikası (2026-10-24) · **(genel)** doğrulanmadı. Kurum alan/sunucu adları burada yok: `<ad-alan>` (ör. AD alanı),
`idm.<ad-alan>` (IdM alanı) — gerçek adı kullanıcıdan/envanterden al.

## 0. Kurum politikası (Alp, 2026-10-24)

- IdM alanı AD alanının alt alanı: AD `<ad-alan>` → IdM `idm.<ad-alan>` (Red Hat bu düzeni destekler: "example.com for AD and idm.example.com
  for IdM"; Kerberos realm = alanın büyük harfi, ör. `IDM.<AD-ALAN>`).
- **Tüm sunucular DNS ve NTP'yi MS AD'den alır** → IdM **entegre DNS'siz** kurulur; DNS kayıtlarını Alp listeler, **AD yöneticileri AD DNS'e girer**.
- **Sertifika:** https ve ldaps için kurum sertifikası talep edilir; kurumda **MSCA**; güvenlik birimi **PFX** üretir → key/cert PEM'e ayrılıp
  yüklenir. Sertifika adı kalıbı (wildcard mı, sunucu FQDN'i mi) `[SAHA]` — §3.
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

## 3. Sertifika (CA'sız kurulum — kurum MSCA)

RH: CA'sız kurulumda LDAP ve Apache sertifikası + özel anahtar ve **tam CA zinciri** verilir (öz-imzalı 3. taraf sertifika kabul edilmez):
`--dirsrv-cert-file`, `--dirsrv-pin`, `--http-cert-file`, `--http-pin`, gerekirse `--ca-cert-file`; PKINIT sertifikası yoksa `--no-pkinit`.
Dosya biçimleri: PEM (birleşik olur), DER, PKCS#7, PKCS#8, **PKCS#12** (yani PFX doğrudan da verilebilir; PEM'e ayırmak şart değil — RH listesi).
- PFX → PEM ayırma, zincir sırası, anahtar eşleşmesi: `rancher-sertifika` becerisinin PFX adımları; doğrulama `sertifika-kontrol.py` (kalan gün,
  anahtar eşleşmesi, zincir, verify).
- **Sertifika adı:** RH örnekleri her sunucu için kendi FQDN'ini SAN'a koyar (`subjectAltName = DNS:server.idm.example.com`); replica'ya **kendi**
  sertifika dosyaları verilir (CA'sız replica: `ipa-replica-install --dirsrv-cert-file … --http-cert-file … --no-pkinit`). Wildcard sertifika
  için RH belgesinde açık kural bulunamadı (2026-10-24) → **bilinmiyor**; sunucu başına FQDN'li sertifika iste (güvenli seçenek), wildcard
  isteniyorsa önce test ortamında dene.
- CA'sız kipte IdM ana makine/servis sertifikası vermez ve web/LDAP sertifikasını **kendisi yenilemez** → bitiş tarihini takvime koy (`sertifika-kontrol.py`).

## 4. Kurulum sırası (değişiklik — "kurulum yapacağım" + `sunucular:`)

1. Paket: `dnf install ipa-server ipa-server-trust-ad` (Satellite reposundan; `dnf install --assumeno` ile önce dene).
2. Sunucu (DNS'siz, CA'sız, NTP'ye dokunmadan): `umask 0022; ipa-server-install --domain idm.<ad-alan> --realm IDM.<AD-ALAN> --netbios-name <NB>
   --dirsrv-cert-file <cert> --dirsrv-cert-file <key> --dirsrv-pin <pin> --http-cert-file <cert> --http-cert-file <key> --http-pin <pin>
   --ca-cert-file <zincir> --no-pkinit --no-ntp` — `--no-ntp` chrony'ye dokunmaz (AD NTP'si kalır; RH NTP seçenekleri); parolalar etkileşimli
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
9. Replica (ikinci sunucu): aynı ön kontroller + kendi sertifikası; trust ajanı/denetleyicisi gerekiyorsa `ipa-adtrust-install --add-agents` (RH).

## 5. İstemci katılımı (kurum playbook'u `05-ipa` — `rhel-teslim`)

`ipa-client-install --domain idm.<ad-alan> --mkhomedir --no-ntp` (NTP AD'den) — sunucu bulma DNS SRV kayıtlarıyla; kayıtlar yoksa `--server`
verilir (genel). Sonra `authselect current` (sssd profili beklenir) · `id <ad-kullanıcı>@<ad-alan>` · erişim kuralları → `idm-erisim`.
CIS taramasından **önce** katıl (`rhel-cis` §3 authselect notu).

## 6. Sertifika yenileme (CA'sız — elle)

Diğer en az bir replikada sertifika hâlâ geçerliyken (RH ön koşulu): yeni CA farklıysa zincir **tek tek** `ipa-cacert-manage install <dosya>`
(komut dosyadaki **yalnız ilk** sertifikayı okur) → `ipa-certupdate` (sunucu ve istemcilerde) → `ipa-server-certinstall -w --pin=… <key> <crt>`
(web) ve `-d` (LDAP) → `systemctl restart httpd` ve `dirsrv@<REALM>` (RH). Hepsinin süresi geçtiyse RH'nin "expired in the whole deployment" yordamı.

## Yapmayacakların

- IPv6 kapalı sunucuya kurulum; FQDN/realm'i "sonra düzeltiriz" diye geçici adla kurma.
- Entegre DNS (`--setup-dns`) kurma — kurum DNS'i AD'de (Alp).
- AD DNS'e kendin kayıt girme / AD'de değişiklik — listeyi AD yöneticilerine Alp iletir.
- `allow_all` HBAC kuralını özel kurallar yazılmadan kapatma (herkesin erişimi kesilir) → `idm-erisim`.
