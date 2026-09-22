# knowledge/ — kurumsal bilgi deposu (git tabanlı hafıza)

Bu dizin **motor değil, hafızadır**. Motor (opencode + Qwen) değişebilir; buradaki birikim kalıcıdır.

> **Ana kural:** AI kendi kendine öğrenmez — **öğrenme önerir**. Yeni bilgi ancak **insan onayından sonra** kurumsal bilgi olur.

## Katmanlar

| Dizin | Ne tutulur | Örnek |
|---|---|---|
| `skills/` | Tekrar kullanılabilir usül (agent'ın yüklediği beceriler) | `approved/disk-ekleme/SKILL.md` |
| `runbooks/` | Uzun, adım adım operasyon prosedürleri | `satellite-patch-haftasi.md` |
| `incidents/` | Gerçek olay kayıtları (ne oldu, kök neden, çözüm) | `2026-09-14-....md` |
| `lessons-learned/` | Görev sonu öneri kayıtları (ajan yazar, insan onaylar) | `2026-09-14-....yaml` |
| `operations-notes/` | Gündelik operasyon notları, ortam künyeleri | `envanter-kaynaklari.md` |
| `architecture/` | Mimari anlatım + kararlar (ADR) + danışma kayıtları | `decisions/0001-....md` |
| `policy/` | Politika belgeleri: tehdit modeli, izin matrisi, audit formatı | `PERMISSION-MATRIX.md` |
| `roadmap/` | Backlog · planlanan özellikler · fikirler · haftalık raporlar | `backlog.md` |

## Beceri yaşam döngüsü (onay kapısı)

    görev → ajan gözlemler → öneri (skills/generated veya skills/experimental)
          → İNSAN inceler → skills/approved/ → opencode kullanır
                         ↘ reddedilirse silinir (kullanılmayan biriktirilmez)

- **`skills/approved/`** = opencode'un **okuduğu tek yer** (`kur.sh` varsayılan olarak buradan kurar). Buradakiler canlıdır.
- **`skills/parked/`** = onaylanmış ama varsayılan kurulumdan çıkarılmış beceriler (2026-09-16 sadeleştirmesi,
  bkz. `parked/README.md`) — içerik silinmedi; gereken beceri `approved/`'a taşınıp `./kur.sh` ile kurulur.
- **`skills/experimental/`** ve **`skills/generated/`** = opencode **okumaz** → onaysız içerik davranışı değiştiremez.

## Kim, neyi, nereye besler?

| Kim | Nereye | Ne zaman |
|---|---|---|
| Ajan (opencode) | `lessons-learned/` (görev sonu YAML), `skills/generated` | görev bittiğinde öneri |
| İnsan (Alp) | `incidents/`, `operations-notes/`, `runbooks/` | olay sonrası / elle |
| İnsan (Alp) | `experimental` → `approved` taşıma (onay) | öneri incelendikten sonra |
| Doktor/Patron | `roadmap/reports/haftalik-*.md` | haftalık |
| Doktor/Patron | `policy/`, `architecture/decisions/` | mimari karar anında |

## Sürüm kontrolü
Bu depo git'tir: her bilgi değişikliği izlenir, geri alınabilir.
Amaç: **yılların birikimini kaybetmemek** ve motoru serbestçe güncelleyebilmek.
