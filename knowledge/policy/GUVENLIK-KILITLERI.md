# GÜVENLİK KİLİTLERİ — kural kitabı (K1–K7)

> Karar: `../architecture/decisions/0004-guvenlik-kilitleri.md` · Kod: `engine/plugins/audit-log.ts`
> ("güvenlik kilitleri" bölümü) + `engine/opencode.json` → `permission` · Testler:
> `engine/plugins/audit-log.test.ts` (`cd engine/plugins && bun test ./audit-log.test.ts`).
> Kaynak: Alp, 2026-09-24 — "CN olmadan ve sunucu adları verilmeden değişiklik yapılmıyor…".

## Özet

| # | Kilit | Ne yapar | Kim açabilir |
|---|---|---|---|
| **K1** | Değişiklik kilidi | Sunucuda/sistemde değişiklik ancak **yetki + hedef listede** ise çalışır | Yalnız kullanıcı, kendi mesajıyla |
| **K2** | Dizin dışı | Çalışma dizini dışına çıkan her okuma/yazma **onay sorar** | Kullanıcı (onay ekranı) |
| **K3** | Okuma (A104/A105: kapsam tabanlı) | Çalışma dizini (kapsam) İÇİNDE okuma **istisnasız** serbest (A105 — `hosts*`/`env`/`*.key`/… denylist'i de dahil, kapsam içinde artık uygulanmaz); DIŞINA çıkan okuma K2'nin onayına düşer, denylist'e uyan kapsam-dışı dosyalar audit-log plugin'inde hâlâ reddedilir | Kullanıcı (K2 onay ekranı, "always" = o oturum boyunca) |
| **K4** | İzin listesi | Sorusuz çalışan komutlar yalnız salt-okunur olanlar; `ss`≠`ssh`, `ps`≠`psql` vb. | — |
| **K5** | Yıkıcı komut | `rm -rf /`-benzeri, mkfs, diske `dd`, force-push, `kill -9 -1` … **hiç çalışmaz** | Kimse (gerekirse insan elle çalıştırır) |
| **K6** | Öz-koruma | Ajan kendi ayarını/eklentisini/audit log'unu değiştiremez, anahtar dosyasını okuyamaz, kilitsiz ikinci opencode başlatamaz | Kimse |
| **K7** | Varsayılan kilitli | Kilitler her açılışta açık; gözlem modu yalnız bilerek | İnsan: `OPS_AGENT_KAPI=GOZLEM opencode` |

**Neden eklentide?** opencode'da oturumda bir kez verilen "always" onayı ayar dosyasındaki yasakları
ezer (ör. `rm a.txt` için "always" → `rm -rf …` de serbest kalır). K1/K5/K6 bu yüzden eklentide sert red
olarak durur; onay ekranı bunları açamaz. K2/K3/K4 motorun onay sistemindedir (onay istemek için).

## K1 — yetki nasıl verilir (sohbete yazılır)

Biçim serbest (Alp, 2026-10-17: "formatsız verdiğimde anlayabiliyor olması lazım — bu bir zeka göstergesi"). Aşağıdaki
kalıplar örnektir, zorunlu değildir; büyük/küçük harf, `-`, `**`, tırnak, virgül/boşluk/alt alta fark etmez:

```
CHG0012345 numaralı change ile stlrancherwor07, stlrancherwor08 ve stlrancherwor09 sunucularında çalışacağım
```

```
değişiklik numarası 4471230
şu sunucular:
- srvsatellite
- 10.14.9.70
```

```
CHG0000001: wor01 wor02 sunucuları
CHG0000002 için db01 sunucusu          ← birden çok CN; yetki = hepsinin birleşimi
```

Nasıl okunur (`engine/plugins/lib/kilit.ts` `yetkiSatirlariniOku`, testleri `kilit.test.ts` "G67"):
- **CN:** satır başında `CN …`, cümle içinde `CHG/CRQ/RFC/CR` + en az 4 rakam, ya da "change / değişiklik (numarası|no) …" + numara.
- **Sunucular:** `sunucular: …` satırı; ya da CN / sunucu sözcüğü (sunucu, hedef, makine, host, node, server) geçen satırdaki
  **sunucu biçimli** adlar (IP, harfli FQDN, rakam içeren ad — düz sözcük, sürüm `v1.33.13`, dosya adı, `rke2`/`rhel9` gibi ürün
  adları alınmaz); bu satırların altındaki alt alta / maddeli liste (burada rakamsız ad da olur: `srvsatellite`).
- **Güvenlik sınırları:** "hariç / dışında / değil" geçen satırdaki sunucular **eklenmez**, ajan uyarı görür (yanlış hedefe yetki
  riski). Serbest adlar yalnız **aynı mesajda CN ya da KURULUM beyanı varsa** sayılır — sıradan bir soru ("web05 sunucusunda disk
  dolu") açık yetkinin listesini değiştirmez. **KRİZ**'de yalnız açık `sunucular:` satırı geçerli (yapıştırılan mail yetki açmaz).

### Tanınmayan komut — engel değil, onay (G68, Alp 2026-10-17)

Uzak komut üç sınıftan birine düşer (`engine/plugins/lib/kilit.ts`):
- **Bilinen okuma** (`saltOkunur`: ls, kubectl get, rke2 certificate check, hammer list …) → sorusuz çalışır.
- **Bilinen değişiklik** (`BILINEN_ARAC` içinde ama okuma biçiminde değil: systemctl restart, dnf install, rm, chronyc
  makestep …) → yetki (CN/KURULUM/KRİZ + hedef listede) yoksa **engel**.
- **Belirsiz** (kilidin hiç tanımadığı araç: kurum aracı, özel betik, `python3 x.py`) → engel yerine **kullanıcıya sorulur**
  (opencode onay ekranı); onaylarsa çalışır. "Her zaman izin ver" bunu atlatamaz: eklentinin `permission.evaluate` kancası
  kayıtlı kurallardan sonra çalışır ve effect'i yine "ask" yapar (core `permission.ts`). Aynı komutta bilinen değişiklik de
  varsa sorulmaz, engellenir. Onaylanan komut audit'e `ONAY K1? :: …` diye yazılır — sık onaylananlar okuma listesine aday.

Eski kalıplar aynen geçerli:

```
CN: CHG0012345
sunucular: web01, web02
```

```
KURULUM
sunucular: yeni01, yeni02
```

```
KRİZ
<kriz maili ya da toplantı notu buraya yapıştırılır>
sunucular: db01
```

- **CN**: numara + sunucu listesi ikisi de şart.
- **KURULUM** (ya da `YENİ KURULUM`): yeni makinelerde kurulum — **değişiklik numarası (CN) istenmez**, yalnız
  kurulacak sunucular (ya da `--limit` grubunun adı, ör. `rke2-workers-new`) yazılır. Ajan yeni kurulumda CN
  önermez (T28 — Alp, 2026-09-30: "yeni kurulumda değişiklik numarasına ihtiyaç yok"). Beyan **harf duyarsız ve doğal
  cümlede** de tanınır (T30): `kurulum yapacağım`, `Kurulum`, `bu makinelere kurulum yapacağım`. Ekli biçimler
  (`kurulumu`, `kurulumda`) ve olumsuz cümle (`kurulum yapmayacağım`) beyan sayılmaz. Sunucu listesi yine şart.
- **KRİZ**: mail/toplantı notu (en az birkaç satır) + sunucu listesi. Mail ayrı mesajla da yapıştırılabilir.
  Beyan **cümle içinde** de tanınır (G73, Alp 2026-10-20): "kriz var", "krizdeyiz", "kriz durumundayız", "acil kriz",
  "KRİZ wor14 düştü"; "kriz yok/değil/bitti", "kriz mi?", "kriz raporunu incele" beyan değildir. Aynı mesajda CN varsa CN
  geçerlidir. Kısa kriz cümlesindeki sunucu adları ("kriz var, wor14 ve wor07'de …") ve altındaki alt alta liste geçer;
  mail yapıştırılan mesajda yalnız açık `sunucular:` satırı (yapıştırılan metin yetki açmaz). Aralık yazımı `wor07-14`,
  `10.0.0.127-134` açılır (her yetki türünde).
  Önerilen akış: mail yapıştırılır → ajan maildan etkilenen sunucuları çıkarıp **önerir** → sen
  `sunucular: …` yazınca iş başlar. Ajanın önerdiği liste sen yazana kadar geçersizdir.
- **Bu makine** için listeye `localhost` yaz (örn. bu makinede `systemctl restart`, `/etc` düzenleme).
- Liste her `sunucular:` satırında **yenilenir** (eklenmez). `YETKİ KAPAT` yetkiyi kaldırır.
  Yetki oturuma bağlıdır ve 12 saat sonra düşer; opencode kapanınca biter.
- Kısa ad eşleşir: listede `web01` varsa `web01.kurum.local` da geçer. IP ile bağlanılıyorsa IP'yi de yaz.

**Değişiklik sayılanlar:** `--check`'siz `ansible-playbook` (hedef `--limit` ile verilmek zorunda),
`ansible -m <yazan modül>`, `ssh <sunucu> '<salt-okunur olmayan komut>'`, `scp/rsync` ile sunucuya
kopyalama, `ssh-copy-id`, `kubectl apply/delete/…`, `helm install/…`, `curl -X POST/PUT/DELETE`,
bu makinede servis/paket/kullanıcı/ağ/disk komutları ve çalışma dizini dışına (sistem yollarına) yazma.
**Serbest (yetkisiz):** ssh ile okuma (`df`, `systemctl status`, `journalctl`, `rpm -q`, `cat` …),
`--check`'li playbook, `ansible -m ping/setup`, `kubectl get/logs`, çalışma dizini içindeki işler ve
**yalnız okuyan playbook** (T28): kilit playbook dosyasını okur; tüm görevler okuyan modüller (`ping`, `setup`,
`debug`, `stat`, `assert`, `set_fact`, `service_facts`, `find`, `slurp` …) ya da salt-okunur `command`/`shell`
(`df -h`, `systemctl is-active` …) ise yetki sorulmaz. Rol, include/import, bilinmeyen modül, Jinja'lı komut ya da
okunamayan dosya → değişiklik sayılır (kilit devrede). Playbook içindeki `command`/`shell` komutlarına **K5 de
uygulanır** (`rm -rf /` gibi yıkıcı komut, KURULUM/CN yetkisi olsa bile engellenir).

## Kilitlerin sınırları (dürüst liste)

- K1 kabuk komutlarını, ansible'ı, ssh'ı, kubectl/helm'i ve modelin yazıp çalıştırdığı `.sh` betiklerini
  inceler. **Python/Perl vb. betiklerin içi incelenmez** — onlar motorda zaten onaya düşer (`"*": "ask"`).
- Uzakta hangi komutun salt-okunur olduğu bir listeyle belirlenir; listede olmayan komut değişiklik sayılır
  (şüphede kilit). Yanlış pozitif görürsen bildir, listeye eklenir.
- Hedef çalışma anında belli oluyorsa (`for h in …; do ssh $h …`) denetlenemez → değişiklikse reddedilir,
  sunucu başına komut istenir.
- Asıl son kapı hâlâ **sunucu tarafı** (forced-command, `PERMISSION-MATRIX.md` §3) — istemci kilidi onun
  yerini tutmaz.

## Nasıl doğrulanır

- Her red audit log'a düşer: `result_status: "denied"`, `target: "K1 :: <komut>"`. Yetki verme/kapama
  `tool: "yetki"` kaydıyla görünür (CN numarası ve sunucu listesi dahil).
- Kayıtların sonradan silinmediğini/değiştirilmediğini `script/dogrula-audit-zinciri.sh` doğrular.
- Gözlem modunda (`OPS_AGENT_KAPI=GOZLEM`) red yerine `result_status: "asked"`, `target: "K1 [GOZLEM] :: …"`.

## Denylist artık `bash` aracına da uygulanır (A81/A92, 2026-09-25)

Hassas dosya denylist'i (`hosts*`, `*.vault`, `*credential*`, `*secret*`, `env`, `*.key`, `*.pem`, `*token*`
…) önceden yalnız `read`/`write`/`edit`/`list`/`glob`/`grep` araçlarının `filePath`/`path` alanına
bakıyordu; `bash` üzerinden `cat hosts.ini` ya da `cp ansible/inventories/hosts.ini /tmp/x; cat /tmp/x`
ile aynı içerik dolaylı okunup kilit aşılabiliyordu (sahada `ops-agent`'ın kendisi bu yolu önerdi). Artık
`bash` komutunun tüm argümanları (alt kabuk, yazma hedefleri, modelin yazdığı yerel `.sh` betiğinin içeriği
dahil) aynı desenlere karşı taranır — bkz. `engine/plugins/audit-log.ts` `bashDenylistHit()`. Ajan bypass
**önermez**: kilit reddederse etrafından dolaşma yolu sunmaz (bkz. `engine/AGENTS.md` "Güvenlik kilitleri").
