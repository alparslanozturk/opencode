---
name: idm-bakim
description: Red Hat IdM (FreeIPA) sunucusunun bakımı — disk/log şişmesi (krb5kdc.log, SSSD, 389-ds dirsrv logları), log döndürme (logrotate) ayarı, SSSD debug düzeyinin açık kalıp kalmadığı, KDC'ye en çok istek atan istemci, sparse lastlog yanılgısı. "idm diski doldu", "krb5kdc log", "kerberos log şişti", "sssd debug açık kalmış", "sssd log büyük", "dirsrv log", "idm log temizliği", "splidm" isteklerinde tetiklenir. Kurulum `idm-kurulum`, HBAC/sudo `idm-erisim`, genel disk dolması `rhel-depolama`.
---

# IdM sunucusu bakımı — log şişmesi ve debug

Saha G112 (Alp, 2026-10-27): iki IdM sunucusunda kök %95–96; `krb5kdc.log-*` 13 aylık, dosya başına 2–6 GB, sıkıştırılmamış (~40 GB).
Alp: "SSSD debug açılıyor bazen kapanıyor, açık unutulmuş galiba." Etiketler: **(saha G…)** görüldü · **(genel)** RHEL/IdM genel bilgisi,
ilk koşuda çıktıyla doğrula — değer yoksa `?`, uydurma.

## 1. Teşhis — hepsi okuma (her IdM sunucusunda ayrı)

```bash
ssh root@<idm> 'df -h / /var /var/log 2>/dev/null; du -xsh /var/log/* 2>/dev/null | sort -h | tail -15'
ssh root@<idm> 'ls -lsh --time-style=+%F /var/log/krb5kdc.log* /var/log/lastlog; cat /etc/logrotate.d/krb5kdc 2>/dev/null'
ssh root@<idm> 'sssctl debug-level 2>&1 | head -20; grep -rn debug_level /etc/sssd/ 2>/dev/null; du -sh /var/log/sssd/* 2>/dev/null | sort -h | tail -8'
ssh root@<idm> 'du -sh /var/log/dirsrv/slapd-*/* 2>/dev/null | sort -h | tail -8; grep -hE "^nsslapd-(accesslog|errorlog|auditlog)(-level|-maxlogsize|-logexpirationtime|-logmaxdiskspace|-logrotationtime)?:" /etc/dirsrv/slapd-*/dse.ldif'
```

```bash
ssh root@<idm> 'cat /etc/sysconfig/krb5kdc 2>/dev/null; systemctl show krb5kdc -p Environment -p EnvironmentFiles -p DropInPaths; ls /etc/krb5.conf.d/ /etc/systemd/system/krb5kdc.service.d/ 2>/dev/null'
ssh root@<idm> 'tail -3 /var/log/krb5kdc.log; grep -c -E "AS_REQ|TGS_REQ" /var/log/krb5kdc.log; wc -l < /var/log/krb5kdc.log'
```

Okuma kuralları:
- `ls -s` ilk sütun = **diskte gerçek yer**. `lastlog` yüzlerce GB görünüp ilk sütunu KB ise **sparse** — yer kaplamıyor, dokunma (G112).
- Döndürülmüş dosya **sayısı ve aralığı** ayarı ele verir (aylık tarih + 13 dosya + `.gz` yok → `monthly`/`rotate 12`/`compress` yok —
  `logrotate.d/krb5kdc` çıktısıyla teyit et, tahmini olgu diye yazma).
- **KDC'nin `debug_level` ayarı yoktur** (genel, MIT krb5): `krb5.conf` `[logging]` yalnız dosya yeridir (saha G112: splidm02 `krb5.conf`'ta
  debug yok — Alp). KDC'nin "debug"ı **`KRB5_TRACE`** ortam değişkenidir (`/etc/sysconfig/krb5kdc`, systemd drop-in) — açıksa her istek
  ayrıntılı yazılır. Ayırt et: `AS_REQ|TGS_REQ` satır sayısı ≈ toplam satır → normal kayıt, büyüklük = istek sayısı (§2); çok azsa
  (`[pid] <epoch>: Sending request…` gibi satırlar) trace açık. `includedir /etc/krb5.conf.d/` ek ayar getirebilir — oraya da bak.
- Aylık dosya boyunda **sıçrama** (G112: 2026-02/03 5–6 GB, diğerleri 2.3–2.9 GB) = o dönem trace ya da istek seli — §2'yi o dosyada çalıştır.
- **SSSD debug** iki yerden gelir: `sssd.conf`/`conf.d` içindeki `debug_level` (kalıcı) ve `sssctl debug-level <n>` (çalışırken; conf'ta
  **görünmez**, servis yeniden başlayana kadar kalır — "açılıyor kapanıyor" belirtisi). Kararı `sssctl debug-level` çıktısı verir;
  yalnız conf'a bakıp "debug kapalı" deme (G112'de böyle denmişti). SSSD varsayılanı (genel): `0x0070`; 6+ ayrıntılı, 9 en çok.

## 2. KDC'yi kim yoruyor? (okuma — büyümenin sebebi)

```bash
ssh root@<idm> 'tail -n 200000 /var/log/krb5kdc.log | grep -oE "\}\) [0-9a-fA-F.:]+: [A-Z_]+" | sort | uniq -c | sort -rn | head -15'
```

Çıktı: `sayı  }) <istemci IP>: <sonuç>` (genel — KDC satır biçimi; sahada ilk koşuda doğrula, eşleşme yoksa `tail -3` ile satırı göster).
`ISSUE` normal; aynı IP'den binlerce `PREAUTH_FAILED` / `CLIENT_NOT_FOUND` / `NEEDED_PREAUTH` → yanlış parolalı servis hesabı ya da bozuk
keytab'lı istemci — log selinin asıl kaynağı. IP → sunucu adı `kume-bul <IP>`. Düzeltmesi o istemcide (keytab, servis parolası) — öner.

## 3. Kalıcı çözüm (değişiklik — K1; iki IdM sunucusu birlikte, ansible ile)

- **`/etc/logrotate.d/krb5kdc`:** `compress` + `delaycompress`, daha sık döndürme (`weekly`) ve `maxsize`, `rotate` = kurumun saklama süresi.
  Saklama süresini **sorma-uydurma**: kullanıcıya sor (kimlik doğrulama logu denetim kaydıdır — BDDK/bankacılık saklama; Splunk'a gidiyorsa
  yerelde kısa tutulabilir `[SAHA]`). Değişiklik playbook'la (`ansible` §1b, `playbook-denetim.py`), elle tek sunucuda değil.
  Deneme: `logrotate -d /etc/logrotate.d/krb5kdc` (kuru, okuma).
- **SSSD debug açık kalmışsa:** `sssctl debug-level 0x0070` (çalışırken, kalıcı değil) + conf'ta `debug_level` varsa kaldır/düşür;
  sorun gidermek için açan kişiye söyle — kapatmak değişiklik, öner.
- **dirsrv:** `nsslapd-*log-logmaxdiskspace` / `-logexpirationtime` ayarı `dsconf` ile (Directory Manager parolası ister — kullanıcı yapar).

## 4. Acil yer açma (değişiklik — onay)

- Yalnız **döndürülmüş** dosyalar (`krb5kdc.log-YYYYMMDD`): silmeden önce saklama gereği var mı sor; önce sıkıştırmak yeter çoğu zaman
  (`gzip krb5kdc.log-2026*` — 2–6 GB metin ~%90 küçülür, genel). Etkin `krb5kdc.log`'u `rm` etme — KDC dosyayı açık tutar, yer açılmaz
  (`rhel-depolama` §3); gerekiyorsa `logrotate -f /etc/logrotate.d/krb5kdc`.
- `lastlog`'u `truncate` etme (yer kaplamıyor; son giriş bilgisi gider).
- Sonra `df -h /` ile ölçüp söyle (G112: elle silme sonrası %96 → %41).

## Yapmayacakların

- Ajan "debug kapalı" sonucunu yalnız `sssd.conf`/`sshd_config`/`/proc/cmdline`'dan çıkarmaz (§1).
- İki sunucudan birini düzeltip ötekini bırakma — IdM çoğaltmalı; aynı ayar ikisine.
- `ipactl restart` / `systemctl restart krb5kdc sssd dirsrv@…` kimlik doğrulamayı keser — yalnız kullanıcı isterse, sırayla.
