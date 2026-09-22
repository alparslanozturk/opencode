# Incident Index

| Tarih | Kısa ad | Etki | Kök neden | Kalıcı önlem | Dosya |
|---|---|---|---|---|---|
| 2026-09-19 | Root'tan typecheck makineyi dondurdu | Sunucu 5x tamamen dondu, hard-reset gerekti | `bun turbo typecheck` sinirsiz paralel `tsgo` acti (2 vCPU, swapsiz) | `script/safe-concurrency.sh` (CPU+RAM farkinda concurrency), koke tasindi | `2026-09-19-typecheck-donma.md` |
| 2026-09-22 | Derlenmiş ikili `a.name` çökmesi | Sahada `oc` ilk prompt'ta çöküyordu, hiç istek gitmiyordu | `build.ts`'de `splitting: true` — tek-dosya derlemede dairesel import sırası bozuluyordu | `splitting: false` (sürüm 1.0.1, commit `cca807db28`) + reference guard (`9ad34675c6`); `script/smoke-ikili.sh` | `2026-09-22-derlenmis-ikili-a-name-cokmesi.md` |

> Yeni kaydı eklerken bu tabloya bir satır ekle.
