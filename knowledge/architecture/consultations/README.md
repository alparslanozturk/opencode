# consultations/ — yapay zekâ danışma kayıtları

Mimari karar alınmadan önce **birden fazla modelin aynı brief'e verdiği yanıtlar** burada saklanır. Kararlar bu ham kayıtlara değil, `../decisions/` altındaki ADR'lere dayanır.

| Kayıt | Tur | Modeller | Konu |
|---|---|---|---|
| `CONSULTATION-1-ARCHITECTURE.md` | 1 | Doktor/Sonnet 5 · Codex gpt-5.5 · Gemini 3.6-flash | Mimari yaklaşım, fork sorusu, onay kapısı |
| `CONSULTATION-2-HIGH-MODELS.md` | 2 | Claude Opus 5 · Codex gpt-5.5 · Gemini 3.1 Pro | v1 kapsamı, onay mimarisi, secrets/audit/eval + internet araştırması sentezi |

Kurallar:
- Ham yanıtlar **değiştirilmeden** saklanır (kesilmez, yumuşatılmaz).
- Gerçek IP / hostname / kullanıcı adı / sunucu adı bulunmaz.
- Yanıtlar **kanıt** değil **girdi**dir; nihai karar `decisions/` altındadır.
