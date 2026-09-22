# opencode — Geliştirme Öneri Listesi (tut listesi)

> Repo kopyası — kaynak: Patron'un `/root/.openclaw/workspace/queue/opencode-ONERI-LISTESI.md`
> tut listesi (Alp offline, tek kanal git). B5/B1 uyarınca buraya taşındı; A/B bölümleri
> kaynakla birebir aynıdır (ID, sütun, ifade değişmez), C bölümünü Doktor doldurmuştur.
> İlgili: `knowledge/roadmap/README.md`, `knowledge/architecture/decisions/0001-v1-scope-and-guardrails.md`.

Kaynak: Alp, 2026-09-22 19:44 — *"Ekran görüntülerini inceleyerek geliştirme önermesini bir tut listesi yap…
Orada önerilerini yaz, Doktor'a söyle önerilerini yazsın. Ondan sonra yavaş yavaş yaparız."*

Kural: her madde **tek satır başlık + kaynak + etki/zorluk**; durum sütunu `öneri → onaylı → yapıldı`.
Bu dosya **maskeleme kuralına uyar**: kurum hostname/IP/URL yazılmaz (yerine `<kurum-host>`, `<kurum-uç>`).

## A) Saha kullanımından çıkan öneriler (ekran görüntüleri, 2026-09-22)

| # | Öneri | Kaynak | Etki | Zorluk | Durum |
|---|---|---|---|---|---|
| A1 | `kontrol` çıktısı kurum host/port'unu **ekrana tam basıyor** → maskeleme modu (`--gizle` ya da otomatik `<kurum-host>:443`) | 19:06/16:41 ekranı | Yüksek (ekran → Telegram) | Düşük | öneri |
| A2 | İki uçlu modda rapor **33 satıra** çıkıyor → ≤29 satıra indir (bilgi kaybı yok) | 16:36 rapor | Orta | Düşük | öneri |
| A3 | `kontrol` son hata satırını **kısaltmasız** ve net göstersin; `--ayrintili` ile log kesiti | 19:06 raporu | Orta | Düşük | öneri |
| A4 | Derlenmiş ikili için **duman testi** zaten eklendi (`script/smoke-ikili.sh`) → `kur.sh derle` sonunda **opsiyonel** çağrı + uyarı | olay kaydı 1.0.1 | Yüksek | Düşük | öneri |
| A5 | `kur.sh` sürüm/derleme **izlenebilirliği**: `kontrol` ekranında `sürüm + commit + derleme zamanı` | denetim bulgusu 3 | Orta | Düşük | öneri (T4) |
| A6 | İlk açılışta `/models` seçimi **kalıcı** olsun (config'e yazılsın), sonraki açılışta sorulmasın | saha ilk kurulum | Orta | Düşük | öneri |
| A7 | TUI oturum adları okunabilir olsun (`ses_f362…` yerine `ansible: baseline` gibi) + `/sessions` başlıkları | 19:07/19:35 footer | Düşük | Orta | öneri |
| A8 | `AGENTS.md` **proje rehberi şablonu** kuralım içersin (onay kapıları, envanter yeri, sabitler) → sahada tek komutla üretilsin | 19:41 Alp kuralı | Yüksek | Orta | öneri |
| A9 | Tehlikeli komut kalıpları için **(belge) politika bloğu**: canlıya `--check`'siz playbook, `rm -rf`, `systemctl restart` | 19:41 kuralı | Yüksek | Orta | öneri (T7) |
| A10 | Uzun yanıtlarda **context uyarısı + otomatik özet** (belirli eşikte) ve `session export` kolaylığı | 19:35 (40K/%15), 19:41 (44K/%17) | Orta | Orta | öneri |
| A11 | Offline kurulum için **npm proxy/ağ ön kontrolü** (`kontrol` içinde uyarı satırı) | 1.0.1 saha kurulumu | Orta | Düşük | öneri |
| A12 | `output` limiti uçtan öğrenilsin (şu an şablon 4096 sabit) | kontrolde `baglam` satırı | Orta | Orta | öneri (T3) |
| A13 | `bin/opencode.tar.xz` gitignore'a alınsın / `bin/` düzeni netleşsin | denetim bulgusu 5 | Düşük | Düşük | öneri (T5) |
| A14 | main'e **CI**: `bash -n` + `shellcheck` + duman testi (ucuz, çevrimdışı) | denetim bulgusu 7 | Orta | Orta | öneri (T5) |
| A15 | `bash` izinlerinin **bileşik komutla aşılması** (`ls; rm -rf …`) engellensin | denetim bulgusu 1 | Yüksek | Orta | öneri (T5/T7) |
| A16 | `KURUM_KEY`'in `ps` çıktısına düşmesi engellensin (dosyadan okuma/`env -i`) | denetim bulgusu 4 | Yüksek | Düşük | öneri (T5) |

## B) Patron (Şef) önerileri

| # | Öneri | Gerekçe | Durum |
|---|---|---|---|
| B1 | Yeni bir dosya: `knowledge/roadmap/ONERI-LISTESI.md` (bu listenin repo kopyası) → Alp `git pull` ile okuyabilsin, Doktor üzerine ekleyebilsin | Alp offline; tek kanal git | öneri |
| B2 | Her öneriye **ID + durum** verilsin; "yavaş yavaş yaparız" akışı bu sütunla yürüsün (öneri → onaylı → yapıldı) | takip kolaylığı | öneri |
| B3 | Öneriler **iki kovaya** ayrılsın: (i) saha deneyimi/ürün, (ii) güvenlik/denetim — Alp hangi kovadan başlayacağını seçsin | öncelik kararı Alp'te | öneri |
| B4 | Saha sabitleri (satellite `pub` dizini, NTP/AD değerleri, envanter yeri) **`AGENTS.md` şablonunda** örnek satır olarak yer alsın | her oturumda tekrar anlatılmasın | öneri |
| B5 | Ekran görüntüsü → öneri akışı kalıcı olsun: her görüntü geldiğinde Patron bu listenin A bölümüne satır ekler, Doktor C bölümüne kendi önerisini yazar | Görev #1 hattı | yapıldı |
| B6 | Doktor'un önerileri **koda yakın** olsun: hangi dosya/modül, tahmini zorluk, riskli mi (vendor/upstream'e gidiyor mu) | uygulanabilirlik | öneri |
| B7 | Upstream'e gidebilecek düzeltmeler ayrı işaretlensin (`upstream-uygun`) — "fork yok" ilkesi ile uyum | karar 2026-09-14 | öneri |
| B8 | Sürüm notu kuralı: her `yapıldı` maddesi `SURUM-NOTLARI.md`'de tek satır | izlenebilirlik | öneri |

## C) Doktor (Claude Code) önerileri

> Doktor dolduracak: her madde için **öneri · ilgili dosya/modül · tahmini zorluk · risk/upstream notu**.
> En az 8 madde; kod/derleme/izin/audit/test/doküman eksenlerinden en az 3'üne dağılsın.

Aşağıdaki maddeler mevcut kod/dokümanı okuyarak doğrulanmıştır (A/B'deki maddelerin tekrarı değil, onlara
teknik derinlik ekler ya da ayrı, doğrulanmış boşlukları hedefler).

| # | Öneri | Dosya/modül | Zorluk | Risk / upstream notu |
|---|---|---|---|---|
| C1 | **[derleme/ikili]** Derleme sonunda tek bir `bin/BUILD-MANIFEST.json` (sürüm, kanal, commit, ISO-tarih, ikili sha256, bun/node sürümü) yazılsın; `kur.sh kontrol` A5/T4'ü bu tek dosyadan okusun — şu an sürüm bilgisi yalnız `--version` çıktısından ve `kur.sh`'ın kendi `SURUM`/`KANAL` değişkenlerinden (kur.sh:57-67, 311-313) geliyor, ayrı bir doğrulanabilir kayıt yok | `packages/opencode/script/build.ts`, `kur.sh` (`kontrol()`, `kontrol_kurulum()`) | Düşük (D) | Vendor dosyasına (`build.ts`) enjekte alan eklemek upstream sync çakışma yüzeyini büyütür — değişiklik küçük, izole bir fonksiyonda tutulmalı. `upstream-uygun` değil (fork'a özel sürüm izleme ihtiyacı). |
| C2 | **[izin & politika]** `permission/evaluate.ts`'de bash izin eşleşmesi, komutta shell metakarakteri (`;`, `&&`, `\|\|`, `\|`, backtick, `$()`) varsa whitelist'i **bypass edip otomatik `ask`/`deny`'a düşsün** — A15/A9'un işaret ettiği "`ls; rm -rf …`" açığının kök nedeni burada; şu an eşleştirme tek komut varsayımıyla çalışıyor | `packages/opencode/src/permission/evaluate.ts`, `packages/opencode/src/permission/arity.ts` | Orta (O) | Davranış değişikliği geniş — bugün izinli sayılan bazı meşru bileşik komutlar (`cd x && npm test` gibi) "ask"a düşebilir; saha AGENTS.md'lerinde whitelist gözden geçirmesi gerekir. Genel güvenlik iyileştirmesi olduğundan `upstream-uygun`. |
| C3 | **[audit/log]** Faz 0'ın `engine/plugins/audit-log.ts`'i `prev_hash` zinciri yazıyor (AUDIT-FORMAT.md §3) ama zincirin **bütünlüğünü sahada doğrulayan bağımsız bir script yok** — `logrotate` (günlük, `compress`) sonrası sessiz bir kopma fark edilmeyebilir. `script/dogrula-audit-zinciri.sh` eklensin: `/var/log/ops-agent/audit.jsonl*` üzerinde `prev_hash` sırasını baştan sona doğrulasın, kopma varsa satır numarasıyla raporlasın | `engine/plugins/audit-log.ts`, `knowledge/policy/AUDIT-FORMAT.md`, yeni `script/dogrula-audit-zinciri.sh` | Orta (O) | Salt-okunur, sahaya yazma yapmıyor — düşük risk. Log yolu (`/var/log/ops-agent/...`) fork'a özel, `upstream-uygun` değil. |
| C4 | **[test/CI]** `packages/opencode/src/session/system.ts:104`'teki `.toSorted((a,b) => a.name.localeCompare(b.name))` çökme kalıbı (9ad34675c6'da düzeltildi, test eklendi) **`packages/opencode/src/skill/index.ts`'de 3 ayrı yerde aynı desenle tekrar ediyor** (298, 312, 328, 343 satırları) — malformed skill kaydı (isim alanı eksik) aynı sınıf çökmeye yol açabilir; bu dosyalara da savunmacı filtre + regresyon testi eklensin | `packages/opencode/src/skill/index.ts`, `packages/opencode/test/skill/*.test.ts` (yoksa oluştur) | Düşük (D) | Küçük, izole değişiklik; mevcut düzeltmenin deseni tekrarı — risk düşük. Genel sağlamlaştırma, `upstream-uygun`. |
| C5 | **[performans/bağlam yönetimi]** `KURUM_MAX_CONTEXT` (kur.sh:550-555) yalnız `kontrol` ekranında **gösteriliyor**, opencode'un kendi provider/model config'ine (context-limit hesaplayan katman) hiç yazılmıyor — A10'daki "context uyarısı" (%15/%17) muhtemelen uçtan gelen gerçek pencere yerine varsayılan/modeldev değeriyle hesaplanıyor. `kur.sh` bu değeri kurulumda `opencode.json`/model config'ine yazsın ki TUI'nin kendi yüzde hesabı doğru pencereyi kullansın | `kur.sh` (env → config yazımı), `packages/opencode/src/provider/provider.ts` | Orta (O) | Yanlış değer yazılırsa TUI'nin context uyarısı yanıltıcı olur (düşük ama gerçek risk) — kurulum sırasında tek satır doğrulama (`kontrol` çıktısındaki pencere ile config'teki değer eşleşmeli) eklenmeli. `upstream-uygun` değil (kurum-özel env). |
| C6 | **[izin & politika]** `AGENTS.md` şablonu (A8) yazılırken, alt-ajan (Task/Agent tool) çağrılarının `packages/opencode/src/agent/subagent-permissions.ts` üzerinden **üst ajanın izin setini miras alıp almadığı** açıkça belgelenmeli — aksi halde A9'daki "tehlikeli komut" politikası alt-ajan katmanında sessizce delinebilir. Şablona "alt-ajan izin devri" bölümü eklensin | `packages/opencode/src/agent/subagent-permissions.ts`, `AGENTS.md` şablonu (A8 kapsamı) | Düşük (D) | Dokümantasyon + doğrulama; kod değişikliği gerektirmiyorsa risksiz. Kod değişikliği gerekiyorsa önce mevcut davranış test edilip netleştirilmeli. |
| C7 | **[dokümantasyon]** `knowledge/incidents/` ve `knowledge/architecture/decisions/`'ın aksine `knowledge/roadmap/` dizininde bir `INDEX.md` yok (`backlog.md`/`ideas.md`/`planned-features.md`/bu dosya arasında gezinme tek tek `README.md` satırına bağlı) — `knowledge/incidents/INDEX.md` deseniyle uyumlu kısa bir `knowledge/roadmap/INDEX.md` eklensin | `knowledge/roadmap/INDEX.md` (yeni), `knowledge/roadmap/README.md` | Düşük (D) | Salt dokümantasyon, davranış değişikliği yok. Repo-özel düzen, `upstream-uygun` değil. |
| C8 | **[derleme/ikili]** `script/smoke-ikili.sh` şu an yalnız `a.name` çökmesini (2026-09-22 olayı) hedefliyor; A4/A14 ile birlikte genişletilirken **ikinci bir gerçek regresyon senaryosu** eklenmeli: `kur.sh derle` sonrası `--version` çıktısının `SURUM`/`KANAL` ile eşleştiğini doğrulamak (C1'deki manifest hazır olursa ona karşı) — böylece duman testi yalnız "çökmüyor" değil "doğru sürümü basıyor" da doğrular | `script/smoke-ikili.sh` | Düşük (D) | Mevcut testin küçük bir uzantısı, geriye dönük uyumlu. `upstream-uygun` değil (kurum sürüm şeması fork'a özel). |
| C9 | **[test/CI]** A14'teki CI önerisi somutlaştırılırsa: mevcut `.github/workflows/*.yml` tamamı upstream'den geliyor (typecheck.yml, test.yml, vb.) — fork'un kendi minimal doğrulaması (`bash -n kur.sh`, `shellcheck kur.sh`, `script/smoke-ikili.sh`) **ayrı, açıkça "fork-özel" işaretli bir dosyada** olmalı (örn. `.github/workflows/fork-kur-duman.yml`) ki upstream sync PR'larında yanlışlıkla silinmesin/upstream değişikliğiyle çakışmasın | yeni `.github/workflows/fork-kur-duman.yml` | Orta (O) | CI runner'da bun/node kurulumu + derleme süresi maliyeti var; offline kısıtı sahaya özgü, CI'a uygulanmaz. Dosya başına açık "fork-özel, upstream sync'te dokunma" yorumu şart. `upstream-uygun` değil. |

## D) Uygulama notu

- Alp: *"ondan sonra yavaş yavaş yaparız"* → tek seferde 1-2 madde; her madde kanıt + commit + push.
- `yapıldı` işaretlenen maddeler bu dosyada kalır (silinmez), sürüm notuna link verilir.
- Son güncelleme: 2026-09-22 (B5 + C bölümü Doktor tarafından dolduruldu).
