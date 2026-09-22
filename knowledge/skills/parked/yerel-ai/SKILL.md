---
name: yerel-ai
description: Yerel bir modelle (Ollama, llama.cpp, LM Studio) agent modunu çalıştırırken kullan. "yerel model", "yerel ai", "ollama", "kendi modelim", "offline model", "agent yerelde çalışmıyor", "yerel model araç çağırmıyor" isteklerinde tetiklenir.
---

> ⚠️ **opencode-agent notu (2026-09-16, denetim bulgusu #1):** Bu beceri **aider fork'undan** aktarılmıştır.
> `/model-ekle`, `~/.aider.conf.yml`, `aider --version`, `.venv/bin/pip install .` gibi komutlar/dosyalar
> **aider'a özgüdür**, opencode-agent'ta karşılığı yok. opencode-agent'ta model tanımı `engine/opencode.json`
> → `provider.<ad>.options` (baseURL/apiKey) + `models.<ad>.limit` üzerinden yapılır (bkz. `alp-kur.sh`, bağlam
> penceresini `${KURUM_URL}/models`'ten otomatik tespit eder — elle `/model-ekle` yok). Araç-çağırma
> matrisindeki genel bilgi (hangi model boyutu tool-call destekler, 4B altı modellerin güvenilmez olduğu)
> **hâlâ geçerli bir referans**; yalnız komutları opencode-agent'ta çalıştırmaya kalkma.

## Amaç

Agent döngüsü fonksiyon çağırmaya bağlı. Yerel bir modelin işe yaraması için
iki şey lazım: OpenAI uyumlu bir `/v1` ucu ve **araç (tool) desteği**.
`/model-ekle` ikisini de sınıyor; bu beceri hangi modeli seçeceğini ve
çıkmazları anlatıyor.

## Hızlı kurulum (Ollama)

```bash
# 1 — Ollama'yı başlat (varsayılan port 11434, /v1 ucu hazır gelir)
ollama serve &

# 2 — araç destekli bir model çek
ollama pull qwen2.5-coder:7b        # 7B, tool çağırır, 32K pencere
#   alternatif: llama3.1:8b, mistral-nemo:12b, qwen3:8b

# 3 — aider içinden tanımla
/model-ekle
#   Endpoint adresi: http://localhost:11434/v1
#   Model: qwen2.5-coder:7b   (liste otomatik gelir)
```

`/model-ekle` bitişte "Araç çağırma çalışıyor" derse hazırsın. Demezse
aşağıya bak.

## Model matrisi (Ollama `/v1`, ölçülen davranış)

| Model | Boyut | Araç çağırma | Pencere | Not |
|---|---|---|---|---|
| `qwen2.5-coder:7b` | 7B | evet, iyi | 32K | agent için ilk tercih |
| `qwen2.5-coder:32b` | 32B | evet, iyi | 32K | daha isabetli, yavaş |
| `qwen3:8b` | 8B | evet | 40K | düşünce modu var; `/no_think` gerekebilir |
| `llama3.1:8b` | 8B | evet, orta | 128K | uzun bağlam, araç seçimi zayıf |
| `mistral-nemo:12b` | 12B | evet | 128K | dengeli |
| `gemma2:9b` | 9B | **hayır** | 8K | tool yok — agent modu çalışmaz |
| `phi3:*` | 3–14B | zayıf | 4–128K | tek adımlık işler dışında güvenilmez |
| `deepseek-r1:*` (Ollama) | — | **hayır** | — | reasoning modeli, tool emitlemiyor |

Kural: **4B altı model agent modunda güvenilmez.** 7–14B arası tatlı nokta.

## Araç desteği yoksa / zayıfsa

`/model-ekle` "auto ile çağırmadı ama required ile çağırdı" derse: sorun
yok, agent döngüsü ilk turu `tool_choice=required` ile atıyor (metadata'ya
yazıldı).

"düz metinle yanıt verdi (required dahil)" derse: model gerçekten tool
desteklemiyor. İki yol:

1. **Metin-protokol fallback devrede.** `/model-ekle` bu durumda
   `supports_function_calling=false` yazar; agent sistem promptuna
   `<tool_call>{"name": ..., "arguments": {...}}</tool_call>` biçimini
   ekler ve modelin metin yanıtından bu bloğu ayıklar. Qwen türevleri bu
   biçimi bilir, çoğu zaman yeterli.
2. **Model değiştir.** Yukarıdaki matristen "evet" olan birine geç.

## Pencere ve bağlam

Yerel modeller çoğu zaman 8–32K. Fork'un bağlam disiplini (repo haritası
kapalı, beceri katalogu kısılır, Read sayfalanır, uzun oturum özetlenir)
bunu hedefliyor; ekstra ayar gerekmez. Yine de:

- `/ozet` uzun oturumu erken sıkıştırır.
- Büyük dosyayı `Read` sayfa sayfa okur; başlıkta `Read(offset=…)` yazar.
- Toplu dönüşümü modele yazdırma — `Bash` betiği yaz.

## Çevrimdışı

Hedef makine ağa çıkamıyorsa `~/.aider.conf.yml`'e `offline: true` ekle:
sürüm denetimi, analitik, model fiyat listesi indirmesi kapanır. Yerel
endpoint'e istek yine gider (loopback/özel ağ). `npx`/`uvx` ile başlayan MCP
sunucuları çevrimdışı modda başlatılmaz.

## Kod güncellendiyse kurulumu tazele

Fork'un kurulumu editable DEĞİL (`pip install .`). Depoyu `git pull`
(ya da rsync) ile güncellediysen `aider` komutu hâlâ eski kopyayı çalıştırır.
Değişiklikler etkili olsun diye:

```bash
./kur.sh                          # aider fork'unun kendi kurulumu (opencode'unki degil), ya da:
venv/bin/pip install . -q
```

Belirti: yeni bir bayrak/davranış "yokmuş gibi" — `aider --version` eski
sürümü yazar.

## Doğrulama

```
/model             gezilebilir liste; hangi model aktif, araç desteği var mı
/model-ekle        aynı endpoint'i yeniden verirsen prob (pencere + araç) tekrar çalışır
```

Gerçek iş sınaması: küçük bir dosya oku, bir satır düzenlet, `Bash` ile
`git diff` çalıştır. Üçü de tek turda dönüyorsa model iş görür.
