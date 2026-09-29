# skills/ — beceri kütüphanesi

opencode becerileri **talep üzerine** yükler: ajan listeyi görür (isim + `description`),
gerektiğinde `skill` aracıyla içeriği çeker → bağlam şişmez.

## Yaşam döngüsü

| Dizin | Kim koyar | opencode okur mu? |
|---|---|---|
| `approved/` | insan (onay) | ✅ **evet — tek canlı yer** |
| `experimental/` | ajan/insan (deneme) | ❌ hayır |
| `generated/` | ajan (ham üretim) | ❌ hayır |

Dosya biçimi her üç dizinde aynı: `<ad>/SKILL.md`, frontmatter'da `name` + `description`.

**Kural (2026-09-28):** `approved/`'daki her beceri `./kur.sh` ile sahaya kurulur — ayrı bir liste yok,
sayı hedefi yok (eski "6-10" hedefi kaldırıldı; şu an 14). Kullanılmayan beceri silinmez, `parked/`'a taşınır.
