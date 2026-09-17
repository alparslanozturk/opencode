# incidents/ — olay geçmişi

Gerçek olayların kaydı. Amaç: **aynı olay ikinci kez olduğunda ajan (ve insan) geçmişi görebilsin.**

- Bir olay = bir dosya: `YYYY-MM-DD-kisa-ad.md` (şablon: `_TEMPLATE.md`)
- Özet tablo: `INDEX.md`
- Geri besleme: olayda öğrenilen → `../lessons-learned/` (öneri) → onaylanırsa `../skills/approved/` veya `../runbooks/`

> opencode `skills/approved/` dışını kendiliğinden okumaz; incident kaydı bilinçli olarak verilir
> (ajan `incidents/` içinde arama yapar ya da ilgili kayıt bağlama eklenir).

**Maskeleme kuralı:** gerçek IP / hostname / kullanıcı adı / domain yazma (ör. `test-sunucu`, `KUME-A`).
