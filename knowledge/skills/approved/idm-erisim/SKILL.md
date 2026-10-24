---
name: idm-erisim
description: IdM'e katılmış RHEL sunucularda kimin ssh ile girebildiğini ve sudo yetkisini denetlerken, AD grubunu IdM'e eşlerken (external grup → POSIX grup), HBAC ve sudo kuralı tasarlarken ve "kullanıcı giremiyor / sudo çalışmıyor" sorununu okurken kullan — ipa hbactest, sssctl user-checks, sudo -l -U, allow_all kuralı, birincil grup kısıtı, AD grup kapsamı (global/universal), CIS root-ssh istisnasının telafi kanıtı. "hbac", "sudo kuralı", "sudo rule", "ad grubu", "grup eşleme", "external group", "kim girebilir", "ssh erişimi", "giriş yapamıyor", "sssd", "sssctl", "allow_all", "idm erişim" isteklerinde tetiklenir. IdM/trust kurulumu `idm-kurulum`. Denetim yalnız okur; kural değişikliği yetki ister.
---

# IdM erişim denetimi — HBAC, sudo, AD grup eşleme

Kaynak: Red Hat *Managing IdM users, groups, hosts and access control rules* (HBAC; "Granting sudo access to an AD user"), *Configuring
authentication and authorization in RHEL* (SSSD sorun giderme) · SSSD kaynak kodu (`sssctl user-checks` varsayılan eylemi `acct`) — indirme
2026-10-24. **(Alp)** kurum · **(genel)** doğrulanmadı.

## 0. Kurum modeli (Alp)

Kullanıcılar MS AD'de. Linux sunucular IdM'e katılır; AD trust ile AD grupları IdM'de eşlenir; **ssh erişimi HBAC kuralıyla, yetki sudo
kuralıyla** verilir. Bu, CIS'in "root ssh kapat" maddesinin (5.1.20) kurumdaki **telafi** düzenidir (`rhel-cis` §0) — denetimde kanıt bu becerinin
çıktısıdır.

## 1. AD grubu → IdM (RH yordamı; değişiklik — yetki)

1. AD'de grup (güvenlik grubu, kapsamı **global ya da universal**; `Domain users`/`Domain admins` gibi **domain local** gruplar kullanılamaz — RH).
2. IdM'de **external** (POSIX olmayan) grup: `ipa group-add --desc='…' <ad_x_external> --external`
3. AD grubunu/kullanıcısını tam adla ekle: `ipa group-add-member <ad_x_external> --external '<AD-GRUP>@<ad-alan>'` (SID'e çevrilir).
4. POSIX IdM grubu + external grubu üye yap: `ipa group-add <ad_x>` · `ipa group-add-member <ad_x> --groups <ad_x_external>`
5. HBAC ve sudo kuralları **POSIX gruba** bağlanır. RH: AD kullanıcılarının **ID override'ını sudo kuralında kullanma**.

## 2. HBAC (RH)

- Varsayılan `allow_all` kuralı herkese her yere izin verir. **Önce özel kuralları yaz, sonra `allow_all`'u kapat** — tersinde kimse giremez.
- Kural bileşenleri: kimler (kullanıcı/grup) · nereye (host/hostgroup) · hangi servis (`sshd`, `sudo`, …; servis grubu). HBAC yalnız **ek (supplementary)
  grupları** görür; kullanıcının birincil grubu (gidNumber) kurala yazılamaz.
- Sudo'da PAM hesap denetimi de çalışır: `sudo` HBAC servisine izin + sudo kuralı (komut/host/kullanıcı) birlikte gerekir (genel —
  `ipa hbactest --service=sudo` ve istemcide `sssctl user-checks -s sudo` ile doğrula; RH HBAC örneği `--service=sudo` ile sınar).

## 3. Denetim (okuma)

IdM sunucusunda (`ipa` komutları geçerli bir Kerberos bileti ister — bileti kullanıcı kendi oturumunda `kinit` ile alır; ajan parola girmez):
```bash
ssh root@<idm01> 'ipa hbacrule-find --sizelimit=200 | grep -E "Rule name|Enabled|User category|Host category|Service category"'
ssh root@<idm01> 'ipa hbacrule-show allow_all | grep -E "Rule name|Enabled"'
ssh root@<idm01> 'ipa hbactest --user=<kullanıcı>@<ad-alan> --host=<sunucu-fqdn> --service=sshd'     # kural sınaması (değiştirmez)
ssh root@<idm01> 'ipa sudorule-find --sizelimit=200 | grep -E "Rule name|Enabled|User category|Host category|Command category|RunAs"'
ssh root@<idm01> 'ipa group-show <ad_x> ; ipa group-show <ad_x_external>'                           # eşleme zinciri
ssh root@<idm01> 'ipa trust-show <ad-alan>; ipa idrange-find'
```
İstemci sunucuda (IdM'e katılmış — bilet gerekmez):
```bash
ssh root@<sunucu> 'authselect current | head -3; sssctl domain-list; sssctl domain-status idm.<ad-alan>'
ssh root@<sunucu> 'id <kullanıcı>@<ad-alan>; sssctl user-checks -s sshd <kullanıcı>@<ad-alan>'     # PAM acct = HBAC kararı, parola sormaz
ssh root@<sunucu> 'sssctl user-checks -s sudo <kullanıcı>@<ad-alan>; sudo -l -U <kullanıcı>@<ad-alan>'
ssh root@<sunucu> 'grep -E "^(PermitRootLogin|UsePAM|GSSAPIAuthentication)" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null; sshd -T | grep -E "^(permitrootlogin|usepam|authorizedkeyscommand)"'
```
- `sssctl user-checks` eylemi verilmezse `acct` (hesap/HBAC) — `-a auth` parola sorar, kilit onu değişiklik sayar.
- `id` AD kullanıcısını çözemiyorsa sorun trust/SSSD'de (HBAC'a bakmadan önce) — RH "Narrowing the scope": `id` → `sssctl user-checks` → loglar.
- SSSD log düzeyini artırmak (`sssctl debug-level 6`) ve önbelleği silmek (`sssctl cache-expire`) **değişikliktir**; öner.

## 4. Puan kartı / denetim kanıtı (CIS 5.1.20 telafisi, BDDK m.11)

```
IdM erişim · <sunucu/hostgroup> · <tarih> · yalnız okuma
allow_all: açık/kapalı (kanıt)
sshd HBAC kuralları: <kural> → <grup> → <hostgroup>   (hbactest sonucu)
sudo kuralları: <kural> → komut kategorisi (all / liste), RunAs
root ssh: PermitRootLogin <değer> — kurum kararı; telafi = yukarıdaki HBAC/sudo + kişisel AD hesabı
ölçülmedi: … (bilet yok vb.)
```
- `allow_all` açık → HBAC fiilen yok (herkes her yere): ⚠️ (karar Alp'in — kapatma sırası §2).
- Sudo kuralında komut kategorisi `all` + geniş hostgroup → ayrıcalıklı yetki geniş: bilgi olarak yaz (BDDK m.11/7 "ayrıcalıklı yetkiler yalnız
  gerekli kullanıcılara" — `bankacilik-uyum`).

## Yapmayacakların

- `ipa hbacrule-disable allow_all`, kural/grup ekleme-silme, `sssctl cache-expire`, `authselect select` — değişiklik (yetki).
- AD tarafında grup/üyelik değişikliği — AD yöneticileri.
- Parola ya da bilet içeriğini ekrana basma.
