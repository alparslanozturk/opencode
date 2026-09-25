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

Satır başında, büyük/küçük harf fark etmez; `-`, `**`, tırnak gibi işaretler sorun değil.

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
- **KURULUM**: CN gerekmez, kurulacak sunucular yazılır.
- **KRİZ**: mail/toplantı notu (en az birkaç satır) + sunucu listesi. Mail ayrı mesajla da yapıştırılabilir.
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
`--check`'li playbook, `ansible -m ping/setup`, `kubectl get/logs`, çalışma dizini içindeki işler.

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
- Gözlem modunda (`OPS_AGENT_KAPI=GOZLEM`) red yerine `result_status: "asked"`, `target: "K1 [GOZLEM] :: …"`.

## Denylist artık `bash` aracına da uygulanır (A81/A92, 2026-09-25)

Hassas dosya denylist'i (`hosts*`, `*.vault`, `*credential*`, `*secret*`, `env`, `*.key`, `*.pem`, `*token*`
…) önceden yalnız `read`/`write`/`edit`/`list`/`glob`/`grep` araçlarının `filePath`/`path` alanına
bakıyordu; `bash` üzerinden `cat hosts.ini` ya da `cp ansible/inventories/hosts.ini /tmp/x; cat /tmp/x`
ile aynı içerik dolaylı okunup kilit aşılabiliyordu (sahada `ops-agent`'ın kendisi bu yolu önerdi). Artık
`bash` komutunun tüm argümanları (alt kabuk, yazma hedefleri, modelin yazdığı yerel `.sh` betiğinin içeriği
dahil) aynı desenlere karşı taranır — bkz. `engine/plugins/audit-log.ts` `bashDenylistHit()`. Ajan bypass
**önermez**: kilit reddederse etrafından dolaşma yolu sunmaz (bkz. `engine/AGENTS.md` "Güvenlik kilitleri").
