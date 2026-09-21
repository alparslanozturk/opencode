# opencode paketi — Alp (kurum içi)

Aider fork'unda biriken tecrübeyi (**38 beceri** — 10 çekirdek + 28 park edilmiş, bkz. aşağı — + çalışma kuralları) opencode'a taşıyan hazır paket.
Kod geliştirme YOK — sadece ayar + içerik. Amaç: **önce denemek**, sonuç iyiyse sonra kod.

**İki katman:** `engine/` = motor (opencode ayarı, güncellenebilir) · `knowledge/` = kurumsal bilgi deposu (kalıcı).

## Ne var içinde
| Dosya | Ne işe yarar |
|---|---|
| `bin/opencode` | opencode 1.18.30 — **tek ikili dosya** (185 MB), kurulum gerektirmez |
| `env` | **Doldurulacak 3 satır** (kurum endpoint + anahtar + model kimliği) |
| `engine/opencode.json` | Sağlayıcı ayarı: kurum Qwen'i OpenAI uyumlu uçtan bağlar · bağlam penceresi (`kur.sh` otomatik tespit eder) · zaman aşımları · izin kuralları |
| `engine/AGENTS.md` | Kurum kuralları: dil, envanter disiplini, güvenlik, beceri disiplini, pencere/endpoint notu |
| `engine/plugins/` | Araç (tool) katmanı — yerel TS plugin'ler; ilk plugin (`audit-log.ts`, Faz 0) kodlandı |
| `knowledge/skills/approved/` | **10 çekirdek beceri** — opencode'un **okuduğu tek yer**, `kur.sh` varsayılan olarak bunları kurar |
| `knowledge/skills/parked/` | Kalan **28 beceri** (2026-09-16 sadeleştirmesi, Alp kararı) — `--tum-beceriler` ile approved/ ile birlikte kurulur, bkz. `parked/README.md` |
| `knowledge/` | Kurumsal bilgi deposu: `skills` · `runbooks` · `incidents` · `lessons-learned` · `operations-notes` · `architecture` · `roadmap` |
| `kur.sh` | **TEK GİRİŞ NOKTASI** — gerekirse kaynaktan derler (`alp.sh`'ı çağırır), kurar (ayar+beceri+plugin+rg), `opencode`+`oc` kısayollarını kurar (**kısayolun tek sahibi budur**), sonda `oc-dogrula.sh` çalıştırır |
| `alp.sh` | *İç detay — derleyici.* Kaynaktan derler (saha/offline: yalnız CLI workspace + models.dev snapshot), **kısayol kurmaz**. Normalde elle çalıştırılmaz; `kur.sh` çağırır — bkz. `NASIL-CALISTIRILIR.md` → "Saha kurulumu" |
| `oc-dogrula.sh` | Kurulumu doğrular (offline; kurum ucu erişilemezse hata değil uyarı verir) |
| `NASIL-CALISTIRILIR.md` | **Adım adım çalıştırma + sorun giderme** (önce bunu oku) |
| `DENEYIM-AKTARIM.md` | Aider'da öğrendiklerimizin opencode karşılığı — ne aktarıldı, ne aktarılamadı |

## Kurulum (3 adım — internet/npm gerekmez)
```bash
# 1) 3 satırı doldur:
vi env            # KURUM_URL=http(s)://sunucu:port/v1 (+ KURUM_KEY, MODEL_ID)
# 2) kur — tek komut (gerekirse kaynaktan derler; ikili + ayar + 10 çekirdek beceri kurulur,
#    bağlam penceresi otomatik tespit edilir, sonda otomatik doğrulama çalışır,
#    kısayollar: opencode + oc; hepsi için: --tum-beceriler):
./kur.sh
# 3) çalıştır:
opencode          # kısa ad: oc
```
**Sahada (offline) akış:** `./al.sh` (senkron) → **`./kur.sh`** (derle + kur + doğrula) → `opencode`.
`bin/opencode` yoksa `kur.sh` kaynaktan derler; zorlamak için `./kur.sh --derle`, hiç derlememek için
`--derleme-yok`. **Kısayolun tek sahibi `kur.sh`'tır** (`/usr/local/bin/opencode` →
`~/.opencode/bin/opencode`); `alp.sh` kısayol kurmaz.
İlk açılışta **`/models`** → `kurum / Qwen3.6-35B-A3B-FP8` seç. Beceriler otomatik görünür.

**Elle doğrulamak istersen:** `./oc-dogrula.sh` (internet gerektirmez, kurum ucuna erişemezse hata değil uyarı verir).

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
3. Küçük pencerede uzun envanter okuma: kırpma/özetleme opencode'un kendi bağlam yönetimine bırakıldı (aider'daki elle bütçe yok). **Bilinen sınır (Aşama 2 ile ölçüldü):** taban bağlam (sistem promptu + AGENTS.md + beceri listesi + araç şemaları) tek başına 16384'lük bir pencerenin %60'ından fazlasını dolduruyor — bkz. `NASIL-CALISTIRILIR.md` → "Compaction thrash".

## Motor (Engine) ve fork kararı
- Motor = **opencode** (kaynak: `anomalyco/opencode`, MIT — eski adı `sst/opencode`). Kurulum **upstream** sürümüyle yapılır.
- **Karar: ilk aşamada fork YOK** — yeni sürümler kolay alınsın, güvenlik güncellemeleri kaçmasın, bakım maliyeti düşsün.
- Yalnız görünürlük için açılmış **birebir kopya** (0 commit, sapma yok): `https://github.com/alparslanozturk/opencode` — kaldırılabilir.

## Bu depo (git) — geliştirme burada yürür

Bu dizin artık bir **git deposu**dur (opencode ajan kiti). Bkz. `MIMARI.md` (katmanlar + yol haritası).

- **Takip edilenler:** `engine/` (motor ayarı), `knowledge/` (bilgi deposu), `kur.sh`, `oc-dogrula.sh`, `*.md`
- **Takip EDİLMEYENLER:** `bin/` (185 MB opencode ikilisi — ayrı `opencode-paket.tar.gz` ile taşınır), `env` (sırlar)
- Genişletme sırası: `engine/opencode.json` → `engine/AGENTS.md` → `knowledge/skills/` → `engine/plugins/` → (yetmezse) fork
