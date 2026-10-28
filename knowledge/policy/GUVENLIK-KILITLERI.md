# GÜVENLİK KİLİTLERİ — kural kitabı (K1–K7)

> Temel karar: `../architecture/decisions/0004-guvenlik-kilitleri.md` · Güncel 2.x kod: `engine/plugins/guvenlik-v2.ts` +
> `engine/plugins/lib/kilit.ts` · Motor izinleri: `engine/opencode.json` → `permission`.
> Kaynak: Alp, 2026-09-24 — "CN olmadan ve sunucu adları verilmeden değişiklik yapılmıyor…".

> **Güncel session davranışı (Alp, 2026-10-28):** eski süre ve biçim kuralları yerine yetki doğal dilden, session konuşmasının
> tamamından çıkarılır; özel satır biçimi istenmez. CN, KURULUM ve KRİZ yetkileri session silinene kadar sürer; motor/TUI yeniden
> başlatması ve zaman aşımı yetkiyi düşürmez. Yetki dosyası `session.deleted` olayında silinir. Hedefi kapsayan session yetkisi varsa
> tekrar CN/sunucu sorulmaz; kapsam yoksa değişiklik onay akışına gider. K5/K6 sert sınırları ve yıkıcı disk komutlarının her-komut
> onayı korunur.

## Özet

| # | Kilit | Ne yapar | Kim açabilir |
|---|---|---|---|
| **K1** | Değişiklik kilidi | Session yetkisi + hedef kapsamı varsa çalışır; yoksa işlem bazında kullanıcı onayı ister | Kullanıcı; session'a bağlı |
| **K2** | Dizin dışı | Çalışma dizini dışına çıkan her okuma/yazma **onay sorar** | Kullanıcı (onay ekranı) |
| **K3** | Okuma (A104/A105: kapsam tabanlı) | Çalışma dizini (kapsam) İÇİNDE okuma **istisnasız** serbest (A105 — `hosts*`/`env`/`*.key`/… denylist'i de dahil, kapsam içinde artık uygulanmaz); DIŞINA çıkan okuma K2'nin onayına düşer, korunan yollar (anahtar/audit kaydı) K6 ile reddedilir | Kullanıcı (K2 onay ekranı, "always" = o oturum boyunca) |
| **K4** | İzin listesi | Sorusuz çalışan komutlar yalnız salt-okunur olanlar; `ss`≠`ssh`, `ps`≠`psql` vb. | — |
| **K5** | Yıkıcı komut | `rm -rf /`-benzeri, `chmod -R /`, force-push, `kill -9 -1` … **hiç çalışmaz**. **Disk yıkıcı** (`mkfs*`, `wipefs -a/-o`, blok aygıtına `dd`/`>`, `blkdiscard`, `sgdisk --zap`, diske `shred`/`mkswap`; ansible ad-hoc/playbook içinde de): K1 yetkisi (hedef listede) **+ her komutta onay ekranı** — "her zaman izin ver" atlatamaz (Alp, 2026-10-22) | Felaket: kimse · Disk: yetki + kullanıcının o komuta onayı |
| **K6** | Öz-koruma | Ajan kendi ayarını/eklentisini/audit log'unu değiştiremez, anahtar dosyasını okuyamaz, kilitsiz ikinci opencode başlatamaz | Kimse |
| **K7** | Varsayılan kilitli | Kilitler her açılışta açık; gözlem modu yalnız bilerek | İnsan: `OPS_AGENT_KAPI=GOZLEM opencode` |

**Neden eklentide?** K1 session yetkisini ve hedef kapsamını konuşmadan çıkarır; eksik kapsamı biçim dayatmadan onay akışına verir.
K5/K6 eklentide sert red olarak kalır; sıradan onay bunları açamaz. K2/K3/K4 motorun onay sistemindedir.

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
  riski). CN ve hedefler aynı session'ın kullanıcı mesajlarından çıkarılır; sıradan bir soru ("web05 sunucusunda disk dolu") mevcut
  yetki listesini değiştirmez. Yapıştırılan mail tek başına yetki açmaz; kullanıcının beyanı ve kastettiği hedefler belirleyicidir.
- **Ayrı mesajlar:** CN/değişiklik numarası ve hedefler aynı cümlede olmak zorunda değildir. Session konuşmasındaki önceki
  kullanıcı mesajlarını kullan; tekrar "nerede verdin?" deme. Yalın liste tek başına yetki vermez, ancak aynı session'da kullanıcının
  yetki beyanıyla ilişkilendirilebilir. Yetki verildikten sonra session boyunca korunur; yeni CN/hedef açıkça verilirse kapsamı
  güncelle ve anladığını özetle.
- **İş envanteri eşlemeye girmez (G101):** `hosts-<x>-YYYYMMDD[-HHMM].ini` / `hosts-YYYYMMDD-<x>.ini` (ajanın yazdığı türetilmiş
  kopya) ad ↔ IP kaynağı değildir; içindeki iş grubu yetkiyi genişletmez — yetki kullanıcının verdiği adlarla.
- **`--limit`'siz ansible-playbook (G101, Alp: "yeni dosyada sadece değişiklik yapılan sunucular var"):** hedef `-i` ile verilen INI
  dosya(lar)ının host'ları; her host adı ve `ansible_host` değeri ayrı hedef (ikisi de yetkide olmalı — yetkili ada başka IP yazılamaz).
  `-i` yok / dizin / YAML / betik / okunamayan / `[g:vars]`'ta `ansible_host` → hedef belirsiz (K1). Göreli yol için `cd x && …`
  izlenir. Sınır: envanterin yanındaki `host_vars/`'ta `ansible_host` denetlenmez.

### Tanınmayan komut — engel değil, onay (G68, Alp 2026-10-17)

Uzak komut üç sınıftan birine düşer (`engine/plugins/lib/kilit.ts`):
- **Bilinen okuma** (`saltOkunur`: ls, kubectl get, rke2 certificate check, hammer list …) → sorusuz çalışır.
- **Bilinen değişiklik** (`BILINEN_ARAC` içinde ama okuma biçiminde değil: systemctl restart, dnf install, rm, chronyc
  makestep …) → hedefi kapsayan session yetkisi varsa çalışır; yoksa işlem için kullanıcı onayı istenir.
- **Belirsiz** (kilidin hiç tanımadığı araç: kurum aracı, özel betik, `python3 x.py`) → engel yerine **kullanıcıya sorulur**
  (opencode onay ekranı); onaylarsa çalışır. "Her zaman izin ver" bunu atlatamaz: eklentinin `permission.evaluate` kancası
  kayıtlı kurallardan sonra çalışır ve effect'i yine "ask" yapar (core `permission.ts`). Aynı komutta bilinen değişiklik de
  varsa sorulmaz, engellenir. Onaylanan komut audit'e `ONAY K1? :: …` diye yazılır — sık onaylananlar okuma listesine aday.

**Okuma her zaman çalışmalı (Alp, 2026-10-22):** kilit yalnız **değişikliğe** bakar; okuyan komutu yanlışlıkla engellemesi hatadır.
Yıkıcı araçların okuma kipi de okumadır: `wipefs` seçeneksiz / `-n` / `--no-act` → serbest; silen `wipefs -a/-o` → K5 (asla açılmaz).
Kabuk sözdizimi komut sayılmaz: `$(( … ))` aritmetiği ve `case … in desen) … ;; esac` desenleri; içlerindeki `$( … )` ikameleri ve
dal gövdeleri yine tek tek denetlenir (test: `kilit.test.ts` "G96"). Becerilerdeki sabit okuma satırlarının kilitten geçtiği
`script/beceri-komut-kilit.ts` ile denetlenir.

**Ajanın önerisini onaylamak:** kullanıcı hedefi tekrar yazmadan “evet, sadece onu restart et” diyorsa hedefi önceki kullanıcı
mesajlarından ve aynı session'daki iş bağlamından çöz. Ajanın kendi yazdığı hedef listesi tek başına yetki oluşturmaz. Hedef
bağlamdan tek anlamlı biçimde çıkmıyorsa yalnız belirsiz hedefi sor; özel satır biçimi dayatma. İşlem onayı K1'in session yetkisini
genişletmez; kapsam dışındaki hedef için normal onay ekranı geçerlidir.
**Ad ↔ IP:** envanterde yok ya da IP'siz ad için yetki verildiği anda `getent hosts` (/etc/hosts + DNS) ile IP eklenir (en çok
20 ad, 2 sn zaman aşımı); envanter eşlemesi gibi o anda donar.

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
kriz var, db01 ve wor07-08'de ödeme servisi durdu
```

- **CN**: numara ve hedef kapsamı session konuşmasından çıkarılır; özel format şartı yoktur. Hedef gerçekten belirsizse yalnız o
  belirsizlik sorulur.
- **KURULUM** (ya da `YENİ KURULUM`): yeni makinelerde kurulum — **değişiklik numarası (CN) istenmez**. Hedefler session
  bağlamından anlaşılır; belirsizse yalnız eksik hedef açıklığa kavuşturulur. Ajan yeni kurulumda CN önermez (T28 — Alp,
  2026-09-30: "yeni kurulumda değişiklik numarasına ihtiyaç yok"). Beyan harf duyarsız ve doğal cümlede tanınır.
- **KRİZ**: kriz beyanı + hedef kapsamı yeter (G74, Alp 2026-10-20: "kriz cümlesi yeterli olsun" — eskiden mail/toplantı
  notu şarttı; yapıştırılırsa audit'e kaydedilir, şart değil).
  Beyan **cümle içinde** de tanınır (G73, Alp 2026-10-20): "kriz var", "krizdeyiz", "kriz durumundayız", "acil kriz",
  "KRİZ wor14 düştü"; "kriz yok/değil/bitti", "kriz mi?", "kriz raporunu incele" beyan değildir. Aynı mesajda CN varsa CN
  geçerlidir. Kısa kriz cümlesindeki sunucu adları ("kriz var, wor14 ve wor07'de …") ve altındaki alt alta liste geçer;
  mail yapıştırılan mesajda yalnız açık `sunucular:` satırı (yapıştırılan metin yetki açmaz). Aralık yazımı `wor07-14`,
  `10.0.0.127-134` açılır (her yetki türünde).
  Yapıştırılan mail hedefleri tek başına yetki sayılmaz; kullanıcının session içindeki beyanı ve serbest metindeki hedefleri esas alınır.
- Bu makinede git'in kullanıcı ayar/kimlik dosyaları (`~/.gitconfig`, `~/.git-credentials`, `~/.config/git/`, `~/.cache/git/`) K1 dışıdır —
  kullanıcının araç ayarı (G109, Alp 2026-10-26). Uzak makinede aynı dosya yine K1.
- **Bu makine** için listeye `localhost` yaz (örn. bu makinede `systemctl restart`, `/etc` düzenleme).
- Açıkça yeni hedef listesi verildiğinde kapsam güncellenir; `YETKİ KAPAT` yetkiyi kaldırır.
  Yetki session'a bağlıdır; CN/KURULUM/KRİZ türünden bağımsız olarak session silinene kadar geçerlidir. Yeniden başlatma veya uzun
  süre kullanılmama düşürmez (`yetki/<session>.json`, 0600); `session.deleted` olayı dosyayı siler.
- Kısa ad eşleşir: listede `web01` varsa `web01.kurum.local` da geçer.
- **Envanter eşlemesi (G74):** yetki verildiği anda çalışma dizinindeki `ansible/`, `inventories/` altındaki INI envanter(ler)
  okunur (`OPS_AGENT_ENVANTER=yol1:yol2` ile değiştirilebilir); listedeki her öğe ad, kısa ad (envanterde adı onunla biten
  **tek** host varsa — `wor07` → `stlrancherwor07`), `ansible_host` IP'si ve grup adı (üyeleri, `:children` dahil) olarak
  genişletilir. Genişletme yetki anında dondurulur: sonradan envanter dosyası değişse (ajan yazabilir) verilmiş yetki
  genişlemez. Bulunamayan / birden çok host'a uyan ad yetki özetinde ve K1 mesajında "Envanter: …" notuyla söylenir.
  Yalın numara aralığı (`07-14`, G78): aralıktaki her numarayı eksiksiz karşılayan **tek** ad öneki varsa (stlrancherwor07…14)
  o host'lar; iki önek tutarsa (wor01-02 ve mas01-02) ya da hiç tutmazsa hiçbir host açılmaz, notta söylenir. Kriz beyanında
  yazım hatası ("kiriz var", "kriiz var") beyan sözcüğüyle birlikte tanınır.

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

## Denylist kaldırıldı (2026-09-28)

A81/A92 ile `bash` aracına da uygulanan hassas dosya denylist'i (`hosts*`, `*.vault`, `*credential*`, …) 2026-09-28'de
**tamamen kaldırıldı** (Alp: kurum içi offline sistem; bkz. `engine/plugins/lib/maskele.ts` başı). Kalan koruma K6'nın
`korunanYol` listesidir (erişim anahtarı, audit kaydı — okuma kapalı).
