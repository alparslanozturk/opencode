# Incident Index

| Tarih | Kısa ad | Etki | Kök neden | Kalıcı önlem | Dosya |
|---|---|---|---|---|---|
| 2026-09-19 | Root'tan typecheck makineyi dondurdu | Sunucu 5x tamamen dondu, hard-reset gerekti | `bun turbo typecheck` sinirsiz paralel `tsgo` acti (2 vCPU, swapsiz) | `script/safe-concurrency.sh` (CPU+RAM farkinda concurrency), koke tasindi | `2026-09-19-typecheck-donma.md` |

> Yeni kaydı eklerken bu tabloya bir satır ekle.
