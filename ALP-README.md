# opencode paketi — Alp (kurum içi)

Aider fork'unda biriken tecrübeyi (**38 beceri** — 10 çekirdek + 28 park edilmiş, bkz. aşağı — + çalışma kuralları) opencode'a taşıyan hazır paket.
Kod geliştirme YOK — sadece ayar + içerik. Amaç: **önce denemek**, sonuç iyiyse sonra kod.

**İki katman:** `engine/` = motor (opencode ayarı, güncellenebilir) · `knowledge/` = kurumsal bilgi deposu (kalıcı).

## Ne var içinde
| Dosya | Ne işe yarar |
|---|---|
| `bin/opencode` | opencode 1.18.30 — **tek ikili dosya** (185 MB), kurulum gerektirmez |
| `env` | **Doldurulacak 3 satır** (kurum endpoint + anahtar + model kimliği) |
| `engine/opencode.json` | Sağlayıcı ayarı: kurum Qwen'i OpenAI uyumlu uçtan bağlar · bağlam penceresi (`02-kur.sh` otomatik tespit eder) · zaman aşımları · izin kuralları |
| `engine/AGENTS.md` | Kurum kuralları: dil, envanter disiplini, güvenlik, beceri disiplini, pencere/endpoint notu |
| `engine/plugins/` | Araç (tool) katmanı — yerel TS plugin'ler; ilk plugin (`audit-log.ts`, Faz 0) kodlandı |
| `knowledge/skills/approved/` | **10 çekirdek beceri** — opencode'un **okuduğu tek yer**, `02-kur.sh` varsayılan olarak bunları kurar |
| `knowledge/skills/parked/` | Kalan **28 beceri** (2026-09-16 sadeleştirmesi, Alp kararı) — varsayılan kurulumda kurulmaz, bkz. `parked/README.md` |
| `knowledge/` | Kurumsal bilgi deposu: `skills` · `runbooks` · `incidents` · `lessons-learned` · `operations-notes` · `architecture` · `roadmap` |
| `01-derle.sh` | *İç detay — derleyici.* Kaynaktan derler (saha/offline: yalnız CLI workspace + models.dev snapshot), **kısayol kurmaz**. Normalde elle çalıştırılmaz; `02-kur.sh` çağırır — bkz. `NASIL-CALISTIRILIR.md` → "Saha kurulumu" |
| `02-kur.sh` | **TEK KOMUT — bayrak almaz.** Gerekirse kaynaktan derler (kararı kendi verir), kurar (ayar+beceri+plugin+rg), `opencode`+`oc` kısayollarını kurar/düzeltir (**kısayolun tek sahibi budur**), sonda doğrular ve tek ekran özet basar |
| `03-kontrol.sh` | **TEK KONTROL BETİĞİ — bayrak almaz.** Bayraksız çağrı tüm raporu verir: kurulum (ikili/env/ayar/beceri/`rg`/izin/kısayol) + kurum AI ucu (DNS/TCP/`/models`/sohbet/akış/araç çağrısı). Çıktı tek ekrana sığar, sonda tek satır `SORUN:` |
| `NASIL-CALISTIRILIR.md` | **Adım adım çalıştırma + sorun giderme** (önce bunu oku) |
| `DENEYIM-AKTARIM.md` | Aider'da öğrendiklerimizin opencode karşılığı — ne aktarıldı, ne aktarılamadı |

## Kurulum (3 adım — internet/npm gerekmez)
```bash
# 1) 3 satırı doldur:
vi env            # KURUM_URL=http(s)://sunucu:port/v1 (+ KURUM_KEY, MODEL_ID)
# 2) kur — TEK KOMUT, bayrak yok (gerekirse derler, kurar, kısayolu düzeltir, doğrular):
./02-kur.sh
# 3) çalıştır:
opencode          # kısa ad: oc
```
**Sahada (offline) akış:** `./al.sh` (senkron) → **`./02-kur.sh`** → `opencode`.
`02-kur.sh` kararı kendi verir: ikili yoksa **veya** kaynak ağacı ikiliden yeniyse derler,
aksi halde yalnız kurar (birkaç saniye). **Kısayolun tek sahibi `02-kur.sh`'tır**
(`/usr/local/bin/opencode` → `~/.opencode/bin/opencode`); başka bir yeri gösteren `opencode`/`oc`
kısayolunu soru sormadan yedekler (`.bak-<tarih>`) ve düzeltir.
İlk açılışta **`/models`** → `kurum / Qwen3.6-35B-A3B-FP8` seç. Beceriler otomatik görünür.

**Elle doğrulamak istersen:** `./03-kontrol.sh` (kurulum bölümü ağ gerektirmez).

> **Betik adları numaralı (2026-09-22):** `01-derle.sh` (iç) → `02-kur.sh` (tek giriş) →
> `03-kontrol.sh` (teşhis); `ls` sırası akış sırasıdır. Eski adlar: `alp-kur.sh`/`kur.sh` →
> `./02-kur.sh`, `alp-kontrol.sh`/`oc-teshis.sh`/`oc-dogrula.sh` → `./03-kontrol.sh`,
> `alp-derle.sh` → `01-derle.sh`. Daha eski `alp.sh` **artık yok** (sahada rsync'ten kalmış bir
> kopya görürsen yok say — `./02-kur.sh` kullan).

## Bir şey çalışmıyorsa: `./03-kontrol.sh`
TUI `Failed to send prompt` / `Unexpected server error` dediyse **tek satır**:
```bash
/root/ai/opencode/03-kontrol.sh
```
Önce kurulumu, sonra kurum ucunu sırayla test eder (URL biçimi · DNS · TCP · `/models` + MODEL_ID listede mi ·
sohbet · **akış** · **araç çağrısı** · bağlam penceresi · log'daki son `err_`/ERROR satırı).
**Çıktı tek ekrana sığar** (≈30 satır, ≤100 sütun) ve sonda tek satırlık `SORUN:` teşhisi verir —
kök nedeni kanıtıyla söyler ("uç erişilemiyor", "MODEL_ID uçta yok", "stream çalışmıyor" ya da
"yok — uç sağlıklı, sorun opencode tarafında"). Ekran görüntüsü alıp olduğu gibi gönderebilirsin.
Salt okunur; **anahtar her zaman maskelidir** (`abc****yz`).

| Komut | Ne yapar | Ağ ister mi |
|---|---|---|
| `./03-kontrol.sh` | **Tüm rapor:** kurulum (ikili, env, ayar, beceri, `rg`, izin, kısayol) + kurum AI ucu teşhisi | kurulum bölümü hayır, uç bölümü evet |
| `./03-kontrol.sh --ayrintili` | (gelişmiş) Aynı rapor, kırpma yok — tüm model listesi, tam gövdeler | duruma göre |

Çıkış kodu: `0` = sorun yok · `1` = sorun var. Ayrıntı: `NASIL-CALISTIRILIR.md` → **"Teşhis"**.

## Offline güvence
`opencode.json`'daki `"npm": "@ai-sdk/openai-compatible"` alanı **çalışma anında npm/network tetiklemez** —
bu SDK opencode'un 185 MB'lık tek ikilisine **derleme zamanında gömülü**dür (binary içinde `strings` ile
doğrulanabilir; `@ai-sdk/openai-compatible` dahil 18 sağlayıcı SDK'sı statik olarak paketli). Ağ erişimi tamamen
kapalı bir `unshare --net` ortamında `opencode run` denenmiş, SDK 11 ms'de yüklenmiş, tek hata sahte uç
adresine bağlanamamak olmuş (beklenen) — npm/node_modules/lockfile hiç oluşmamış.

> **Not (2026-09-16, denetim bulgusu #16):** Bu paragrafın eskiden atıfta bulunduğu
> `GELISTIRME-RAPORU-OPENCODE-CILA.md` dosyası bu depoda **hiç var olmamış** (`git log --diff-filter=A`
> boş döndü) — referans kaldırıldı. Yukarıdaki ölçüm iddiasının kendisi (11 ms, `unshare --net`) ayrı
> bir kanıt dosyasıyla doğrulanamadı; tekrar üretmek istersen aynı komutu (`unshare --net -- opencode run
> ...`) burada çalıştırıp gerçek çıktıyı yeni bir `notlar/` raporuna yaz.

## Bilmeceler (denemede bakılacaklar)
1. ~~`@ai-sdk/openai-compatible` eklentisi offline yüklenebiliyor mu?~~ **Çözüldü:** evet, ikiliye gömülü — npm gerekmiyor.
2. Kurum ucu **araç çağrısı (tool calling)** destekliyor mu? Desteklemiyorsa ajan modu çalışmaz → haber ver.
   **Ölçmek için:** `./03-kontrol.sh` → "7/8 araç çağrısı (tool_call) testi" adımı bunu tek başına yanıtlar.
3. Küçük pencerede uzun envanter okuma: kırpma/özetleme opencode'un kendi bağlam yönetimine bırakıldı (aider'daki elle bütçe yok). **Bilinen sınır (Aşama 2 ile ölçüldü):** taban bağlam (sistem promptu + AGENTS.md + beceri listesi + araç şemaları) tek başına 16384'lük bir pencerenin %60'ından fazlasını dolduruyor — bkz. `NASIL-CALISTIRILIR.md` → "Compaction thrash".

## Motor (Engine) ve fork kararı
- Motor = **opencode** (kaynak: `anomalyco/opencode`, MIT — eski adı `sst/opencode`). Kurulum **upstream** sürümüyle yapılır.
- **Karar: ilk aşamada fork YOK** — yeni sürümler kolay alınsın, güvenlik güncellemeleri kaçmasın, bakım maliyeti düşsün.
- Yalnız görünürlük için açılmış **birebir kopya** (0 commit, sapma yok): `https://github.com/alparslanozturk/opencode` — kaldırılabilir.

## Bu depo (git) — geliştirme burada yürür

Bu dizin artık bir **git deposu**dur (opencode ajan kiti). Bkz. `MIMARI.md` (katmanlar + yol haritası).

- **Takip edilenler:** `engine/` (motor ayarı), `knowledge/` (bilgi deposu), `02-kur.sh`, `03-kontrol.sh`, `01-derle.sh`, `*.md`
- **Takip EDİLMEYENLER:** `bin/` (185 MB opencode ikilisi — ayrı `opencode-paket.tar.gz` ile taşınır), `env` (sırlar)
- Genişletme sırası: `engine/opencode.json` → `engine/AGENTS.md` → `knowledge/skills/` → `engine/plugins/` → (yetmezse) fork
