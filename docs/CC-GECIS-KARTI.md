# Claude Code → opencode Geçiş Kartı

Amaç: Alp'in CC'de alıştığı her işi opencode'da **nasıl** yapacağını göstermek.
Kaynak: opencode resmi dokümanları (tui / cli / permissions / agents / commands / rules) + kurum paketi kurulumumuz.
Konum: `docs/` — repoya girer; `git pull` / `rsync` ile sahadaki kopyaya gelir.
Genel kural (Alp, 2026-09-15): belge `docs/` altına, standart yere konur.

---

## 1) Başlatma

| CC | opencode |
|---|---|
| `claude` | `opencode` (bizde kısayol: `oc`) |
| `claude` başka dizinde | `opencode /path/to/project` |
| `claude -c` (son oturumu sürdür) | `opencode --continue` (kısa: `-c`) |
| `claude --resume` | `/sessions` (ctrl+x l) veya `--session <id>` |
| `claude -p "..."` | `opencode run "..."` |
| `claude -p "..." --dangerously-skip-permissions` | `opencode run --auto "..."` (deny kuralları yine geçerli → daha güvenli) |
| `claude --model X` | `opencode --model provider/model` (veya TUI'de `/models`) |

## 2) Oturum içi (TUI)

| CC | opencode |
|---|---|
| `@dosya` referansı | `@dosya` ✅ (aynı, fuzzy arama) |
| `!komut` bash | `!komut` ✅ (aynı) |
| `Shift+Tab` (mod/oto-onay) | `Tab` = agent değiştir (Build ↔ Plan). Oto-onay: komut paleti → "Enable auto-approve" veya `--auto` |
| `/init` | `/init` ✅ (AGENTS.md üretir/iyiler) |
| `/clear` | `/new` (alias `/clear` ✅) |
| `/compact` | `/compact` (alias `/summarize`) |
| `/rewind` (checkpoint) | `/undo` (ctrl+x u) · `/redo` (ctrl+x r) — **git tabanlı**, repo olmalı |
| `/model` | `/models` (ctrl+x m) |
| `/login` | `opencode auth login` |
| `/resume` | `/sessions` (ctrl+x l) |
| `/export` | `/export` (ctrl+x x) |
| `/help` | `/help` |
| `/agents` | `opencode agent list` / `opencode agent create` |
| Esc (durdur) | `Esc` (session_interrupt) |
| verbose/ayrıntı | `/details` |
| düşünme bloğu | `/thinking` |
| — | `/share` `/unshare`, `/themes` (ctrl+x t), `/editor` (ctrl+x e) |

**Leader tuşu = `ctrl+x`.** Özet: `ctrl+x m` model · `n` yeni · `l` oturumlar · `u` geri al · `c` compact · `q` çıkış.

## 3) Kural / hafıza dosyaları

| CC | opencode |
|---|---|
| `CLAUDE.md` (proje) | `AGENTS.md` (proje) — CLAUDE.md de okunur (fallback) |
| `~/.claude/CLAUDE.md` | `~/.config/opencode/AGENTS.md` (yoksa `~/.claude/CLAUDE.md`) |
| `#` ile hafızaya ekleme | **YOK.** Agent'a "AGENTS.md'ye şunu ekle" de ya da `/init` |
| `@dosya.md` import (otomatik) | **YOK.** `opencode.json → instructions: ["docs/*.md"]` (glob + https URL) |
| `.claude/settings.json` | `opencode.json` (global: `~/.config/opencode/opencode.json`, proje: `<proje>/opencode.json`) |

**Birleşme kuralı (kaynaktan doğrulandı):** global + proje `AGENTS.md` **birleşir** (silme yok).
Aynı kategoride ilk eşleşen kazanır: globalde `AGENTS.md` > `~/.claude/CLAUDE.md`; projede `AGENTS.md` > `CLAUDE.md` > `CONTEXT.md`.
`instructions` listesi de eklemeli.

## 4) İzinler (CC'de en çok kullanılan yer)

- Değerler: `allow` / `ask` / `deny`.
- İnce kalıp: `"bash": {"*":"ask","git *":"allow","rm *":"deny"}` — **son eşleşen kural kazanır**, `*` en başa yazılır.
- `~` ve `$HOME` kalıpta kullanılabilir. Çalışma dizini dışı: `external_directory` anahtarı.
- **Oto-onay:** `--auto` veya TUI komut paleti. **`deny` kuralları yine uygulanır** (CC'nin skip-all'ından farklı).
- Bizim kurulum: 37 salt-okunur bash kalıbı `allow`, 10 tehlikeli kalıp `deny`, `external_directory: ask`, `agent.plan` = edit/bask deny.

## 5) Eklentiler

| CC | opencode |
|---|---|
| `.claude/commands/*.md` | `.opencode/commands/*.md` (global: `~/.config/opencode/commands/`) — `$ARGUMENTS`, `$1 $2`, `!shell`, frontmatter: `description/agent/model` |
| `.claude/agents/*.md` | `.opencode/agent/*.md` + `opencode agent create` — özel agent (model + izin seti) |
| `.claude/skills/` | `~/.config/opencode/skills/` — `.claude/skills` de okunur (uyumluluk) |
| `.mcp.json` | `opencode.json` içindeki `mcp` bölümü |
| hooks (`settings.json`) | **plugin** katmanı (opencode plugin API) |
| — | `opencode serve` / `opencode web` / `opencode attach` (uzak/mobil istemci — CC'de yok) |

## 6) Yerleşik agent'lar (CC'deki "mod" mantığının karşılığı)

- **Build** (primary, tüm araçlar) = varsayılan çalışma modu
- **Plan** (primary, edit+bash kısıtlı) = CC'nin plan modu
- Subagent'lar: **general** (çok adımlı iş, paralel), **explore** (salt-okunur kod gezme), **scout** (dış doküman/bağımlılık araştırma)
- Subagent çağırma: mesajda `@explore ...` veya ana agent kendisi devreye alır
- Agent değiştirme: `Tab`

## 7) Bizim pakete özel notlar

- Kurulum: `./kur.sh` (parametresiz = `kur`; sonda kontrol raporunu basar) → kısayol `oc` → gerekirse `./kur.sh kontrol`.
- Kurallar global: `~/.config/opencode/AGENTS.md` + `opencode.json` (bu dosyayı elle düzenlemeyin, `engine/` altındaki kaynak güncellenir).
- Modeller: `Qwen3.6-35B-A3B-FP8 (kurum)` — 256K pencere, `limit.context=262144` otomatik yazılır.
- Bilinen sınır: araçsız metin yanıtında döngü riski (harness livelock) — olursa `Esc`, sonra `~/.local/share/opencode/log/` son satırları.
