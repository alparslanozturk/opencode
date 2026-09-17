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
