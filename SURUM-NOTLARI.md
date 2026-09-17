# SÜRÜM NOTLARI — opencode ajan kiti

## 2026-09-16 — Paket sadeleştirmesi: bin/ git'ten çıkarıldı + beceri parkı (Alp kararları)

**Ne değişti (`faz0-yuzeye-getir` branch, `notlar/FAZ0-KARARLAR-RAPORU.md`):**
- **`bin/opencode.tar.xz` + `bin/ripgrep.tar.xz` git izlemesinden çıkarıldı** (`git rm --cached`,
  `.gitignore`'da zaten `bin/` vardı) — dosyalar **diskte kaldı**, yalnız git geçmişine yeni commit
  girmiyor. `kur.sh` artık ikili yoksa "git'ten gelmez, ayrı paketten al" diye net mesaj veriyor.
- **Beceriler sadeleştirildi:** `knowledge/skills/approved/` 38 → **10 çekirdek** (kur.sh `CORE_SKILLS`
  ile birebir); kalan 28 beceri **silinmeden** `knowledge/skills/parked/`'a taşındı (`git mv`, bkz.
  `parked/README.md`). `kur.sh --tum-beceriler` approved/+parked/ birlikte kurar (toplam hâlâ 38).
- **Gerçek kurum hostname'i genelleştirildi:** `engine/AGENTS.md`'deki gerçek iç bulut hostname'i →
  çalışan ağaçta `dahili-bulut.ornek.local` (geçmişte kalan blob'lar rewrite edilmedi — bilinçli
  karar, repo private tutulmalı; **bu changelog satırının kendisi eskiden gerçek adı tekrar yazıyordu
  — 2026-09-17 denetiminde (Patron) fark edildi, burada da genelleştirildi**).
- `bash` audit maskelemesi: boşlukla ayrılmış CLI bayrakları (`--apiKey sk-...`) artık maskeleniyor
  (`engine/plugins/audit-log.ts` `INLINE_SECRET_RE`).

## 2026-09-15 — Çekirdek becerilere Excel/PDF eklendi (9 → 10)

**Ne değişti:**
- **`kur.sh`**: `CORE_SKILLS` dizisine `rapor-excel-pdf` eklendi (varsayılan kurulum 9 → **10 çekirdek
  beceri**); `--tum-beceriler` yorumundaki eski "6-10" ifadesi gerçek sayıyla ("10") hizalandı.
- **`oc-dogrula.sh`**: kurulu beceri sayısı satırındaki "6-10" metni "10" olarak güncellendi (asıl sayım
  zaten dinamik, `find | wc -l` ile yapılıyor — bu yalnız etiket metniydi).
- **Dokümanlar**: `NASIL-CALISTIRILIR.md`, `README.md`, `docs/PROJE-YAPISI.md` içindeki varsayılan
  beceri sayısı referansları 9 → 10'a güncellendi.
- Gerekçe: Alp envanter/rapor işlerinde Excel (xlsx) ve PDF çıktısı istiyor; beceri kurulu olmayınca
  agent bunu bilmiyor ve devreye giremiyor. `rapor-excel-pdf` paket içinde zaten vardı, yalnız
  `CORE_SKILLS` listesinde eksikti.
- Rapor: `notlar/EXCEL-PDF-RAPOR.md`.

## 2026-09-15 — Aşama 2: "kur ve çalıştır" + kalıcı sertleştirme (A-J paketleri)

**Ne değişti:**
- **`kur.sh`**: `${KURUM_URL}/models`'ten bağlam penceresini otomatik tespit edip `limit.context` +
  `compaction` (prune/reserved/preserve_recent_tokens) yazıyor (env `KURUM_MAX_CONTEXT` yedek yol);
  varsayılan kurulum 38 → **9 çekirdek beceri** (`--tum-beceriler` ile hepsi); `bin/ripgrep.tar.xz`'den
  `~/.cache/opencode/bin/rg` kuruyor (opencode'un grep/glob araçlarının beklediği tam yol — kurum ağında
  ağdan indirilemediği için `ripgrep execution failed` hatasının kaynağıydı); kurulum sonunda çalışma
  dizini rehberliği içeren tek ekranlık özet basıyor.
- **`engine/opencode.json`**: `default_agent: build`; `agent.plan.permission` (`edit`/`bash`: `deny`,
  Plan artık gerçekten yalnızca planlıyor); `permission.bash`'e 37 salt-okunur allow kalıbı eklendi
  (`ls*`, `cat*`, `git status*`, `find*`, ... — resmi opencode dokümanındaki "last matching rule wins"
  kuralına göre `"*": "ask"` başta, spesifik kalıplar sonra). `agent.build.steps` **denendi ve
  kaldırıldı** — livelock hatasını durdurmadığı ölçüldü (bkz. aşağı).
- **`engine/AGENTS.md`**: mutlak "ssh/kubectl YOK" yasağı kaldırıldı, yerine hiyerarşi ("kullanıcı açıkça
  isterse serbest, aksi halde salt-okunur") + gerçek envanter yolları (`~/ansible/hosts-*.ini`,
  `KUBECONFIG`, dahili-bulut kısıtı) + "izinler burada tanımlanmaz, opencode.json'da" netleştirmesi +
  "tüm dosya sistemini tarama, @explore kullan" kuralı eklendi.
- **`oc-dogrula.sh`**: rg kontrolü, kurulu/toplam beceri sayısı ayrımı, `limit.context`/`compaction`/
  `default_agent`/`steps` özeti, tek ekranlık ÖZET bloğu eklendi (7 adım).
- Rapor: `notlar/ASAMA-2-RAPOR.md`.

**Ölçülen sonuçlar (gerçek istek gövdesi + `tiktoken cl100k_base` proxy tokenizer, 16384 pencere varsayımıyla):**
- Taban bağlam: 38 beceri **%89,3** → 9 çekirdek beceri **%63,6** (hedef olan "≤%40" bu pencerede
  **matematiksel olarak ulaşılamaz** — 0 beceriyle bile %53,7; asıl kaldıraç gerçek pencerenin
  16384'ten büyük olması, bu yüzden otomatik tespit kritik).
- `agent.build.steps` (1/5/steps yok, 3 ayrı test): **livelock'u durdurmuyor** — hepsinde 10 saniyede
  86-138 istek. Config'e eklenmedi.
- `opencode 1.18.31` (npm'den indirilip test edildi): **aynı hata var** (135 istek/10sn) — sürüm
  yükseltmesi çözmüyor.
- `OPENCODE_DISABLE_AUTOCOMPACT=1` + taban pencereyi aşıyor: backend isteği sessizce kabul ederse
  (200 OK) **hata vermeden livelock'a düşüyor** (Alp'in "hiç açılmadı" gözlemini açıklıyor); backend
  gerçekten reddederse (HTTP 400) opencode temiz `ContextOverflowError` ile 2 istekte çıkıyor.
- `compaction.prune`: izole ölçülemedi — test senaryosu compaction eşiğine ulaşmadan önce livelock
  hatasına düştü (0 compaction olayı). Zararsız varsayılan olarak bırakıldı, kanıtlanmış çözüm olarak
  sunulmuyor.

## 2026-09-15 — Compaction thrash düzeltmesi (Vaka 1 + Vaka 2)

**Ne değişti:**
- `engine/opencode.json`: `permission.webfetch/task/todowrite = "deny"` — baseline araç şeması
  21.1K → 13.1K karakter (ölçülen, ~%16 bağlam kazancı); `task` alt-agent'ların iç içe thrash riskini
  kapatır, `webfetch` zaten "dış ağa veri gönderme yok" kuralıyla çelişiyordu.
- `engine/AGENTS.md`: "Tek adım disiplini" (araç sonrası dur, plan metni üretme) ve "Çalışma dizini
  boşsa" (sessizce döngüye girme, açıkça söyle) kuralları eklendi.
- `NASIL-CALISTIRILIR.md`: kanıtlı kök neden (baseline ~%87 doluluk + araç-çağrısız yanıtta harness'in
  adım döngüsünü durdurmaması), canlıda denenebilecek teşhis adımları, context ölçüm adımı, dağıtım
  kontrolü (boş çalışma dizini ≠ kural yüklenmedi — global kurulum) eklendi.
- Rapor: `notlar/QWEN-COMPACTION-RAPOR.md`.

**Kök neden özet:** İki katmanlı. (1) 38 beceri listesi + yerleşik sistem promptu + araç şemaları,
boş bir dizinde bile ilk istekte 16k pencerenin ~%87'sini dolduruyor (gerçek istek gövdesi ölçülerek
doğrulandı). (2) Model araç çağırmayan bir yanıt döndürdüğünde opencode 1.18.30'un adım döngüsü
**durmuyor** — yerel bir mock LLM ile modelden bağımsız olarak yeniden üretildi (12 saniyede 178 adım,
üst sınır/bekleme yok). İkinci madde ikiliye gömülü bir harness hatası; repo düzeyinde düzeltilemez,
yalnız alanı büyütüp tetiklenme ihtimalini azaltabildik.

## 2026-09-14 — Faz -1 paketi

**Ne değişti:**
- **Motor/bilgi ayrımı:** kökteki `skills/` kaldırıldı. Yeni düzen:
  - `engine/` → **motor tarafı**: `AGENTS.md`, `opencode.json`, `plugins/` (opencode'un okuduğu çalışma ayarları)
  - `knowledge/` → **kurumsal hafıza**: `skills/approved/` (38 beceri), `runbooks/`, `incidents/`, `lessons-learned/`, `operations-notes/`, `architecture/`, `policy/`, `roadmap/`
  - Kural: **AI kendi kendine öğrenmez, öğrenme önerir** → yeni beceri `knowledge/skills/experimental/` (open **okumaz**) → insan onayı → `approved/` (open **okur**)
- **Yeni politika katmanı `knowledge/policy/`** (Faz -1 çıktısı):
  - `THREAT-MODEL.md` — varlıklar, aktörler, saldırı yüzeyleri, "v1 mutlak sınır: salt-okunur"
  - `PERMISSION-MATRIX.md` — 9 araç için allow/ask/deny önerisi + "kural atlanabilir / hook atlanamaz" tablosu
  - `AUDIT-FORMAT.md` — 17 alanlı JSONL (OTel GenAI adları), `prev_hash` zinciri, repo dışı konum
- **`knowledge/roadmap/PHASE0-ACCEPTANCE.md`** — Faz 0 kabul kriterleri (5 madde) + ölçüm + rapor şablonu
- **`knowledge/architecture/`** — ADR-0001 (`decisions/0001-v1-scope-and-guardrails.md`) + `consultations/` (2 tur çoklu-model danışma kaydı)
- `oc-dogrula.sh`: knowledge iskeleti artık **10 dizin** kontrol ediyor (`policy/` eklendi)

**Kurulum:** `tar xJf opencode-paket.tar.xz -C /root` → `env` doldur → `./kur.sh` → `opencode` (kısa ad `oc`)

**Sırada (Faz 0):** izin bloğunu `engine/opencode.json`'a uygula · audit hook plugin (`engine/plugins/`) · 3 gerçek salt-okunur görevle test → `PHASE0-ACCEPTANCE.md` şablonuyla rapor.
