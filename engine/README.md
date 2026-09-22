# engine/ — motor katmanı (opencode)

Motorun **ayar ve kural** katmanı. Kod değil; davranış ayarı.

| Dosya | Ne |
|---|---|
| `AGENTS.md` | Kurum kuralları → `~/.config/opencode/AGENTS.md` |
| `opencode.json` | Sağlayıcı + izin ayarları (`alp-kur.sh`, kökteki `env`'den doldurur) |
| `plugins/` | Araç (tool) katmanı — yerel TS plugin'ler; ilk plugin (`audit-log.ts`, Faz 0) kodlandı, bkz. `plugins/README.md` |

`alp-kur.sh` bunları `~/.config/opencode/` altına kurar; beceriler `../knowledge/skills/approved/`'dan gelir.

**Motor güncellenebilir olmalı:** opencode sürümü yükseltilince burası (özellikle `opencode.json` şeması)
gözden geçirilir; bilgi katmanı (`../knowledge/`) etkilenmez.
