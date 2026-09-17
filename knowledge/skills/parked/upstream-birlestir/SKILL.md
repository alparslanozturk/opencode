---
name: upstream-birlestir
description: Upstream Aider-AI/aider'dan güncelleme alırken kullan. Fork'un beş dokunuş noktasının merge'den sağ çıktığını doğrular. "upstream", "güncelle", "merge", "yeni sürüm", "rebase" isteklerinde tetiklenir.
---

> ⚠️ **opencode-agent notu (2026-09-16, denetim bulgusu #1):** Bu beceri **aider fork'undan** (`/root/ai/aider`)
> aktarılmıştır ve aşağıdaki komut/yol referansları **bu depoda (opencode-agent) geçersizdir**: `scripts/`,
> `aider/`, `tests/` dizinleri burada **yok** — ADR-0001 gereği opencode-agent'ın kendisi bir fork **değildir**
> ("Fork yok (v1)"), yalnız `engine/` (ayar) + `knowledge/` (bilgi) katmanlarından oluşur; upstream'den
> merge alınacak bir kaynak kodu yok. Bu beceri `/root/ai/aider` dizininde çalışırken hâlâ geçerlidir (o depo
> gerçek bir aider fork'u); opencode-agent bağlamında tetiklenirse gövdeyi uygulama, önce hangi depoda
> çalışıldığını doğrula.

Bu fork upstream aider'ın beş dosyasına dokunuyor. Merge'in asıl riski
çakışma değil — çakışma görünür. Asıl risk, merge'in yama satırlarını koruyup
**davranışı** bozmasıdır.

## Yordam

```bash
./scripts/upstream_birlestir.sh              # en son upstream main
./scripts/upstream_birlestir.sh v0.90.0      # belirli bir etiket
```

Betik şunları yapar: upstream'i getirir, dokunduğumuz dosyalarda ne
değiştiğini gösterir, merge eder, fork değişmezlerini doğrular, testleri
çalıştırır. Çakışma çıkarsa durur ve kararı sana bırakır.

Elle yapıyorsan merge'den sonra **mutlaka**:

```bash
.venv/bin/python scripts/fork_dogrula.py
.venv/bin/python -m pytest tests/basic -q
```

## Dokunulan beş nokta

| Dosya | Ne var | Bozulursa belirti |
|---|---|---|
| `aider/models.py` | `send_completion` çok araçlı `tool_choice="auto"` | Model tek araca kilitlenir, döngü ilerlemez |
| `aider/coders/__init__.py` | `AgentCoder` kaydı | `Unknown edit format agent` |
| `aider/args.py` | `--agent`, `--plan`, `--auto`, `--permission-mode` | Bayrak tanınmaz |
| `aider/main.py` | Agent kwarg aktarımı | Plan/izin modu yok sayılır |
| `.gitignore` | `.env`, `.mcp.json` ignore | Gizli bilgi depoya sızar |

En kırılganı `models.py`. Upstream `send_completion`'ı değiştirirse yamamız
sessizce etkisiz kalabilir: satırlar durur ama `tool_choice` yine sabitlenir.
`fork_dogrula.py` bunu kodu **çağırarak** sınadığı için yakalar.

## Çakışma çözerken

- Yamayı en küçük blokta tut; upstream'in yeni kodunu koru, kendi bloğunu
  onun içine yerleştir.
- Neden orada olduğunu yorumda yaz — bir sonraki merge'de sen ya da başkası
  bunu silmeye kalkacak.
- `.gitignore`'da `!` negasyonu **kullanma**. Aider dosyanın sonuna `.aider*`
  ekleyebiliyor ve negasyonlar sessizce ölüyor.

## Bittiğinde

```bash
git diff <merge-oncesi>..HEAD --stat
git push fork <dal>
```

Test başarısızsa çıktısıyla söyle. Doğrulamadan "merge temiz" deme.
