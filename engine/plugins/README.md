# plugins/ — araç (tool) katmanı

opencode'a **yeni araç** eklemenin doğru yolu: **yerel TS/JS plugin** (offline'ı bozmaz).

- Konum: `.opencode/plugins/` (proje) veya `~/.config/opencode/plugins/` (global)
- Custom tool: `import { type Plugin, tool } from "@opencode-ai/plugin"` + Zod şeması (`args`)
- Hook'lar: `tool.execute.before` / `tool.execute.after`, `permission.ask`, `shell.env`, `chat.message` …
  **Dikkat:** `session.idle`/`session.compacted` gibi olaylar ayrı bir hook anahtarı DEĞİL — bunlar genel
  `event` hook'una gelen `Event.type` değerleridir (`event: async ({event}) => { if (event.type !== "...")
  return; ... }`). Üst seviyede `"session.idle": async () => {...}` gibi bir anahtar tanımlamak **derlenir
  ama hiçbir zaman çağrılmaz** — bu proje bunu 1.x `audit-log.ts`'de yaşadı (2026-10-28'de kaldırıldı), bkz. aşağıdaki tablo.
- Ağırlıklı yükleme yok: opencode ayarı **açılışta bir kez** okur → plugin ekleyince kapat-aç.

⚠️ **npm plugin KULLANMA** — açılışta Bun ile npm'den çeker, kurum offline'ını bozar.
Yerel dosya plugin tercih edilir (gerekirse yanına `package.json` ile bağımlılık bildirilir).

## Nerede `beceri` yeter, nerede `tool` gerekir?

| İhtiyaç | Katman |
|---|---|
| "Şu işi şöyle yap" (usül bilgisi, karar, kontrol listesi) | **Beceri** (`knowledge/skills/approved/…/SKILL.md`) |
| Var olan komutları çalıştırmak (ssh, kubectl, ansible, curl) | **Yerleşik `bash`** |
| Deterministik iş: çıktı ayrıştırma, sayı doğrulama, format üretme | **Tool (plugin)** |
| Zorunlu kapı: yıkıcı komut engeli, kapsam dışı yol reddi | **Tool (hook) / `permission`** |

## Mevcut plugin'ler

| Dosya | Ne yapar | Durum |
|---|---|---|
| `lib/kilit.ts`, `lib/maskele.ts` | **Motordan bağımsız çekirdek** (ADR-0005): kilit kararları, yetki satırı okuma, maskeleme/denylist. Girdi → karar; motor kancası bilmez. `plugins/lib/` alt dizin olduğu için opencode bunları eklenti diye yüklemez. Test: `lib/kilit.test.ts` (kancasız). | Kodlandı |

`kur.sh`, `~/.config/opencode/plugins/`'e yalnız `*-v2.ts` + `plugins/lib/`'i kopyalar; 1.x adaptörleri (`audit-log.ts`,
`guard.ts`) 2026-10-28'de repodan da kaldırıldı — 2.x'te yüklenmez, eski kurulumlardan silinir (bkz. kur.sh "plugin" adımı).
Bileşik komut allowlist aşımı (GOREV oc-T5) 2.x'te motorun kendisi tarafından kapatılır: shell izni alt komut başına
değerlendirilir (`packages/core/src/tool/plugin/shell.ts` `ShellParse.scan` → `permission.assert` kaynak listesi).
Auto-discovery ile ek config gerekmez.

## Aday araçlar (henüz kodlanmadı — öneri, önceliği deneme belirler)

| Araç | Ne yapar | Neden beceri yetmez |
|---|---|---|
| `envanter-dogrula` | hosts.ini / CSV-XLSX ayrıştır, satır toplamlarını tek tek doğrula | Elle aritmetik hata yapıyor; deterministik olmalı |
| `rapor` | Tablo → Markdown/Excel/PDF (font/kütüphane kontrolüyle) | Tekrarlı üretim, tutarlı biçim |
| `kapsam-gate` | Kök dizin dışı erişimi reddet (plugin `tool.execute.before`) | `AGENTS.md` kuralı "rica"; tool "kapı" |
| ~~`guvenlik-kapisi`~~ | **Yapıldı** (2026-09-24) — 1.x'te `audit-log.ts` içinde K5/K1 (dosya 2026-10-28'de kaldırıldı; 2.x'te `guvenlik-v2.ts`); **bileşik komut aşımı** ise ayrıca `guard.ts` (GOREV oc-T5; 2026-10-28'de kaldırıldı — 2.x shell iznini alt komut başına değerlendirir) | — |

> Not: Bu liste **öneridir**. Gerçek öncelik, test-sunucu canlı denemesinde "canımızı yakan" noktaya göre belirlenir.
