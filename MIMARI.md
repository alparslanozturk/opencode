# MİMARİ — opencode ajan kiti

Aider fork'unda (15 faz) biriken tecrübeyi **opencode**'a taşıyan ajan kiti.
Bundan sonraki kodlama ajanı geliştirmesi bu depo üzerinden yürür. Referans sürüm: **opencode 1.18.30**
(vendor/upstream — `package.json`'lar burada sabit). **Ürün sürümü ayrı**: `kur.sh`'ın derlediği
ikili **1.0.1**'i basar (`SURUM` sabiti, `kur.sh` içinde; bkz. `SURUM-NOTLARI.md` "ürün sürümü 1.0.0"
ve "derlenmiş ikili çöküyordu" kayıtları).

> **Motor ≠ Bilgi.** Motor (`engine/`) güncellenebilir; bilgi (`knowledge/`) kalıcıdır. Kurumsal değer bilgide birikir.

## Katmanlar

| # | Katman | Nedir | Nerede |
|---|---|---|---|
| 1 | **Beceri (skill)** | Tekrar kullanılabilir usül bilgisi | `knowledge/skills/approved/<ad>/SKILL.md` (frontmatter: `name`+`description`) |
| 2 | **Araç (tool)** | Modelin çağırdığı fonksiyon | Yerleşik + `plugins/` (yerel TS) + MCP |
| 3 | **Ajan** | Ayrı prompt/model/izinli asistan | `opencode.json` → `agent` veya `.opencode/agents/*.md` |
| 4 | **Kural (rule)** | Davranış direktifi | `AGENTS.md` (proje kökü ve/veya global) |
| 5 | **Hafıza** | Kalıcılık | opencode'ta **otomatik yok** → `knowledge/` (git tabanlı bilgi deposu) + `engine/AGENTS.md` |

### 1) Beceriler
- opencode becerileri şu konumlardan okur: `.opencode/skills/`, `~/.config/opencode/skills/`,
  `.claude/skills/`, `~/.claude/skills/`, `.agents/skills/`, `~/.agents/skills/`.
- Ajan **listeyi görür** (isim + `description`), içeriği **gerektiğinde `skill` aracıyla yükler** → bağlam şişmez.
- İzin: `permission.skill` (`allow`/`ask`/`deny`, `internal-*` gibi jokerler).

### 2) Araçlar
- Yerleşikler: `read`, `write`, `edit`, `bash`, `glob`, `grep`, `list`, `task` (alt-ajan), `skill` (+ TODO).
- Yeni araç 3 yolla eklenir; **bizim yolumuz = yerel plugin** (bkz. `plugins/README.md`).
- İzinler: `permission.bash/edit/read/external_directory` → `rm -rf*`, `mkfs*`, force-push = **deny**.

### 3) Ajanlar
- Primary: **Build** (tam yetki) + **Plan** (değişiklik yok). `Tab` ile geçiş.
- Subagent: **General / Explore / Scout** (`@` veya `task` aracıyla; paralel iş).
- Ajan başına `model`, `prompt`, `permission` tanımlanır.

### 4) Kurallar
- Proje: `AGENTS.md` · Global: `~/.config/opencode/AGENTS.md` · (uyumluluk: `CLAUDE.md`)
- `opencode.json` → `instructions: [...]` ile ek dosyalar da bağlama alınır.

### 5) Hafıza (bilgi deposu)
- opencode'ta **otomatik uzun-dönem hafıza YOK** (oturum + otomatik compaction + `opencode stats`).
- Kalıcılık **`knowledge/`** dizininde, **git tabanlı** kurulur: beceriler + runbook + incident +
  lessons-learned + operations-notes + architecture/decisions + roadmap.
- **Onay kapısı:** ajan yalnız `knowledge/skills/approved/`'ı okur; öneriler `generated/` → `experimental/` → `approved/`
  sırasıyla **insan onayıyla** canlıya geçer — *"AI kendi kendine öğrenmez, öğrenme önerir."*
- Motor (opencode/Qwen) güncellense de `knowledge/` sabit kalır.

## Genişletme sırası — "önce uzat, en son fork"

```
engine/opencode.json (ayar) → engine/AGENTS.md (kural) → knowledge/skills/ (beceri) → engine/plugins/ (yerel tool) → (yetmezse) fork
```
Fork yalnızca plugin API'sinin yapamadığı iş (UI paritesi, TUI davranışı) için.

## Geliştirme (self-improvement) döngüsü

1. **Gözlem/hata** — saha kullanımında yakalanan eksik
2. **Sınıfla** — kural mı (AGENTS.md) · bilgi mi (beceri) · yetenek mi (plugin/tool) · ayar mı (config)?
3. **Yaz** — ilgili katmana
4. **Test + kıyas** — aynı görevi tekrar koştur: doğru cevap · süre · token · gereksiz araç çağrısı
5. **Biriktir + sadeleştir** — kullanılmayan beceriyi at (kullanılmayan özellik geliştirilmez)

## Yol haritası

> **2026-09-16 düzeltmesi (denetim bulgusu F1):** Bu tablo `engine/plugins/`'i **Faz 2**'ye koyuyordu; ama
> `knowledge/architecture/decisions/0001-v1-scope-and-guardrails.md` (ADR-0001, 2026-09-14, Alp onaylı) ve
> `knowledge/roadmap/PHASE0-ACCEPTANCE.md` audit hook plugin'i açıkça **Faz 0**'ın kapsamına koyuyor — ve
> `engine/plugins/audit-log.ts` zaten kodlanmış durumda. Kod ile belge çelişince **kod + ADR esas alındı**,
> aşağıdaki tablo ADR-0001'in faz sırasıyla (**-1 → 0 → 1 → 2 → 3**) hizalandı. Ayrıntı: ADR-0001,
> `PHASE0-ACCEPTANCE.md`.

| Faz | İş | Kim |
|---|---|---|
| **-1** | Politika katmanı: tehdit modeli + izin matrisi + audit formatı + Faz 0 kabul kriterleri | Doktor |
| **0** | Salt-okunur izin bloğu uygulanır + audit hook plugin (`engine/plugins/audit-log.ts`) + 3 gerçek görevi koştur, kıyasla | Alp + Doktor |
| **1** | Acıyan yerleri kural + beceri ince ayarıyla kapat + eval altın seti (`knowledge/eval/`) | Doktor |
| **2** | Mutasyon/grant zinciri açılır (plan → grant → runner) + MCP/Ansible entegrasyonu | Doktor |
| **3** | (Opsiyonel) UI paritesi için fork | Doktor |

## Depo yapısı

```
engine/                  # MOTOR katmanı (güncellenebilir)
  AGENTS.md              #   kurallar
  opencode.json          #   sağlayıcı + izin
  plugins/               #   araç (tool) katmanı — ilk plugin (audit-log.ts, Faz 0) kodlandı
knowledge/               # BİLGİ katmanı (kalıcı, git tabanlı)
  skills/approved/*/SKILL.md   # 10 çekirdek beceri (opencode'un okuduğu TEK yer, kur.sh varsayılanı)
  skills/parked/*/SKILL.md     # 28 park edilmiş beceri (2026-09-16 sadeleştirmesi, kurulmaz; bkz. parked/README.md)
  skills/experimental/         # onay bekleyen öneriler
  skills/generated/            # ham üretim
  runbooks/ · incidents/ · lessons-learned/ · operations-notes/
  architecture/decisions/ · roadmap/
kur.sh                  # TEK BETİK, kökte tek .sh dosyası: ./kur.sh <derle|kur|kontrol|yardim>
                        #   parametresiz çağrı = kur (varsayılan); 01/02/03 betikleri KALDIRILDI
node-v24.19.0-headers.tar.gz   # node-gyp header arşivi (depoda izlenir, kur.sh acar/symlink kurar)
bin/ripgrep.tar.xz       # bin/ altında TEK izlenen dosya (statik rg); opencode ikilisi repoya girmez
README.md · NASIL-CALISTIRILIR.md · DENEYIM-AKTARIM.md · MIMARI.md · SURUM-NOTLARI.md
```

> `bin/opencode` (185 MB derlenmiş ikili) ve `env` (sırlar) **repoya girmez** — `bin/` içinde git'e
> giren tek dosya `ripgrep.tar.xz`'dir, ikili ayrı paketle taşınır.
>
> **Derleme bayrağı (2026-09-22):** `packages/opencode/script/build.ts`'de `Bun.build(...)` çağrısı
> `splitting: false` kullanır — `splitting: true` tek-dosya `compile` çıktısında dairesel import
> sırasını bozup `a.name` çökmesine yol açtığı için (sürüm 1.0.1'de düzeltildi). Bu bayrağı bir daha
> açma; detay: `knowledge/incidents/2026-09-22-derlenmis-ikili-a-name-cokmesi.md`.
