# opencode paketi — Alp (kurum içi)

Aider fork'unda biriken tecrübeyi (**38 beceri** — 10 çekirdek + 28 park edilmiş, bkz. aşağı — + çalışma kuralları) opencode'a taşıyan hazır paket.
Kod geliştirme YOK — sadece ayar + içerik. Amaç: **önce denemek**, sonuç iyiyse sonra kod.

**İki katman:** `engine/` = motor (opencode ayarı, güncellenebilir) · `knowledge/` = kurumsal bilgi deposu (kalıcı).

## Ne var içinde
| Dosya | Ne işe yarar |
|---|---|
| `bin/opencode` | Derleme çıktısı — **yerel kalır** (git'te değil); `kur.sh` gerekirse kaynaktan üretir (hazır ikili indirme yolu YOK) |
| `env` | **Gerçek değerlerin tek yeri** (git'te değil) — yoksa `kur.sh` önce `env.local`'den, o da yoksa `env.example` şablonundan otomatik oluşturur (izin 600; içerik ekrana basılmaz). Şablondan üretildiyse yer tutucular gerçek uç/anahtarla doldurulmalı |
| `engine/opencode.json` | Sağlayıcı ayarı: kurum Qwen'i OpenAI uyumlu uçtan bağlar · bağlam penceresi (`kur.sh` kurulum akışı otomatik tespit eder) · zaman aşımları · izin kuralları |
| `engine/AGENTS.md` | Kurum kuralları: dil, envanter disiplini, güvenlik, beceri disiplini, pencere/endpoint notu |
| `engine/plugins/` | Araç (tool) katmanı — yerel TS plugin'ler; ilk plugin (`audit-log.ts`, Faz 0) kodlandı |
| `knowledge/skills/approved/` | **10 çekirdek beceri** — opencode'un **okuduğu tek yer**, `kur.sh` varsayılan olarak bunları kurar |
| `knowledge/skills/parked/` | Kalan **28 beceri** (2026-09-16 sadeleştirmesi, Alp kararı) — varsayılan kurulumda kurulmaz, bkz. `parked/README.md` |
| `knowledge/` | Kurumsal bilgi deposu: `skills` · `runbooks` · `incidents` · `lessons-learned` · `operations-notes` · `architecture` · `roadmap` |
| `kur.sh` | **TEK BETİK.** Parametresiz çağrı (= `kur`) gerekirse derler, kurar, `opencode`+`oc` kısayollarını düzeltir ve en sonda kontrol raporunu basar. Alt komutlar: `kur` · `derle` · `kontrol` · `yardim` |
| `kur.sh kontrol` | **Tek kontrol/teşhis.** Kurulum (ikili/sürüm-commit/env/ayar/beceri/`rg`/izin/kısayol) + kurum AI ucu (ağ/`/models`/sohbet/akış/araç çağrısı/bağlam+çıktı sınırı). Çıktı **her modda ≤29 satır**, sonda tek satır `SORUN:`; `env`'de `KURUM_URL_2` varsa iki ucu **iki sütunda** ölçüp "daha hızlı" karar satırını basar |
| `NASIL-CALISTIRILIR.md` | **Adım adım çalıştırma + sorun giderme** (önce bunu oku) |
| `DENEYIM-AKTARIM.md` | Aider'da öğrendiklerimizin opencode karşılığı — ne aktarıldı, ne aktarılamadı |

## Kurulum (2 adım — internet/npm gerekmez)
```bash
# 1) kur — TEK BETİK, parametresiz (env yoksa önce env.local'den, o da yoksa
#    env.example şablonundan otomatik oluşturulur; elle kopyalama adımı YOK):
./kur.sh          # = ./kur.sh kur
# 2) çalıştır:
opencode          # kısa ad: oc
```
**Sahada (offline) akış:** `./al.sh` (senkron) → **`./kur.sh`** → `opencode`.
`kur.sh` derleme kararını kendi verir: ikili yoksa **veya** kaynak ağacı ikiliden yeniyse derler,
aksi halde yalnız kurar (birkaç saniye). **Kısayolun tek sahibi kurulum aşamasıdır**
(`/usr/local/bin/opencode` → `~/.opencode/bin/opencode`); başka bir yeri gösteren `opencode`/`oc`
kısayolunu soru sormadan yedekler (`.bak-<tarih>`) ve düzeltir.
İlk açılışta **`/models`** → `kurum / Qwen3.6-35B-A3B-FP8` seç. Beceriler otomatik görünür.

**Elle doğrulamak istersen:** `./kur.sh kontrol` (kurulum bölümü ağ gerektirmez).

> **Güncel saha yüzeyi (2026-09-22):** `./kur.sh` TEK giriş betiğidir — alt komut alır
> (`derle` · `kur` · `kontrol` · `yardim`), parametresiz çağrı = `kur`.
> Eski `alp-*`, `oc-teshis.sh`, `oc-dogrula.sh`, `01-derle.sh`/`02-kur.sh`/`03-kontrol.sh` adları
> **tarihsel/kullanılmıyor**; sahada rsync'ten kalmış bir kopya görürsen yok say — `./kur.sh` kullan.

## Bir şey çalışmıyorsa: `./kur.sh kontrol`
TUI `Failed to send prompt` / `Unexpected server error` dediyse **tek satır**:
```bash
/root/ai/opencode/kur.sh kontrol
```
Önce kurulumu, sonra kurum ucunu sırayla test eder (URL biçimi · ağ (DNS+TCP) · `/models` + MODEL_ID
listede mi · sohbet · **akış** · **araç çağrısı** · bağlam penceresi + **çıktı sınırı** · log'daki son
`err_`/ERROR satırı). **Çıktı tek ekrana sığar** — **her modda ≤29 satır**, ≤100 sütun — ve sonda tek
satırlık `SORUN:` teşhisi verir; kök nedeni kanıtıyla söyler ("uç erişilemiyor", "MODEL_ID uçta yok",
"stream çalışmıyor" ya da "yok — uç sağlıklı, sorun opencode tarafında"). `env`'de `KURUM_URL_2` varsa
raporun sonuna iki ucu **iki sütunda** ölçen karşılaştırma + "daha hızlı" karar satırı eklenir
(toplam 2 satır; uç başına tam döküm için `-a`). Ekran görüntüsü alıp olduğu gibi gönderebilirsin.
Salt okunur; **anahtar her zaman maskelidir** (`abc****yz`).

> **Sürebilir:** uç bölümünde 4 ayrı ağ isteği vardır (`/models` · sohbet · akış · araç çağrısı), her biri
> kendi `--zaman-asimi`'ni (varsayılan 60 sn) ayrı ayrı bekler ve aralarında ilerleme çıktısı basılmaz —
> uç yanıt vermiyorsa (asılı kalmış proxy vb.) en kötü durumda toplam **4 × zaman aşımı** (varsayılanla ~4 dk)
> sürebilir, ekran o süre boyunca boş kalır. Daha hızlı sonuç için `--zaman-asimi` küçült.

İlk satır **sürüm izlenebilirliğini** de verir: `ikili ✓ surum 1.0.1 · commit c6f1ce7 (=HEAD) ·
derleme <tarih> · HEAD c6f1ce7`. İkili başka bir commit'ten geldiyse (ya da derleme künyesi yoksa)
hemen altına tek satırlık `surum !` uyarısı düşer — sağlamsa hiç basılmaz.

| Komut | Ne yapar | Ağ ister mi |
|---|---|---|
| `./kur.sh kontrol` | **Tüm rapor:** kurulum (ikili, env, ayar, beceri, `rg`, izin, kısayol) + kurum AI ucu teşhisi | kurulum bölümü hayır, uç bölümü evet |
| `./kur.sh kontrol --ayrintili` | (gelişmiş) Aynı rapor, kırpma yok — tüm model listesi, tam gövdeler | duruma göre |

Çıkış kodu: `0` = sorun yok · `1` = sorun var. Ayrıntı: `NASIL-CALISTIRILIR.md` → **"Teşhis"**.

## Offline güvence — ne garanti, ne değil
**Garanti edilen:** `opencode.json`'daki `"npm": "@ai-sdk/openai-compatible"` alanı **çalışma anında npm/network
tetiklemez** — bu SDK derlenmiş ikiliye (şu an **~203 MB**, `ls -lh bin/opencode` ile teyit edilir; sayı
sürümle değişir) **derleme zamanında gömülüdür** (binary içinde `strings` ile doğrulanabilir;
`@ai-sdk/openai-compatible` dahil 18 sağlayıcı SDK'sı statik olarak paketli).

**Garanti EDİLMEYEN (2026-09-27'de `unshare --net -- opencode run` ile yeniden ölçüldü):** ikili tamamen
sessiz/offline değil, iki ayrı arka plan ağ denemesi vardır ve ikisi de **başarısızlığı yutar** (çöktürmez,
kullanıcıya göstermez):
1. Her `opencode run`/oturum açılışında modeller.dev kataloğunu **ağdan tazelemeye çalışır**
   (`GET https://models.opencode.ai/api.json`); offline'da `ENOTFOUND` ile `level=ERROR` log satırı düşer,
   session durmaz (log: `~/.local/share/opencode/log/opencode.log`). Bu, `kur.sh`'ın derleme zamanında
   gömdüğü statik `models-dev-api.json` anlık görüntüsünden **ayrı** bir mekanizma.
2. Her config dizini için (bizim plugin'imiz olsun olmasın, opencode her zaman yapar) arka planda
   (`Effect.forkDetach`, sonucu beklenmez) `@opencode-ai/plugin` paketini npm ile kurmayı dener
   (`packages/opencode/src/config/config.ts:451-462`); başarısız olursa yalnız `Effect.logWarning` basar,
   akışı durdurmaz. `engine/plugins/audit-log.ts` bizim tarafımızda `import type` kullandığı için kendi
   plugin'imiz ayrıca bir runtime bağımlılığı eklemiyor — ama opencode'un kendi denemesi yine de olur.
   Kısaca iddia "hiç network denemesi yok" değil, "denemeler sessizce başarısız oluyor ve akışı bozmuyor".

> **Not (2026-09-16, denetim bulgusu #16):** Bu paragrafın eskiden atıfta bulunduğu
> `GELISTIRME-RAPORU-OPENCODE-CILA.md` dosyası bu depoda **hiç var olmamış** (`git log --diff-filter=A`
> boş döndü) — referans kaldırılmıştı. 2026-09-27'de ölçüm tazelendi (yukarıdaki iki madde); eski "11 ms,
> tek hata" iddiası bu yeni ölçümle değiştirildi.

> **models.dev anlık görüntüsü donuk kalabilir:** `kur.sh derle`, repoda `packages/opencode/script/models-dev-api.json`
> varsa **ağ olsa bile** onu tercih eder (ağa hiç bakmaz) — güncel dosya 2026-09-21 tarihli. Yeni
> model/bağlam-penceresi bilgisi gerekiyorsa dosyayı elle tazele (ağ varsa `curl https://models.dev/api.json`
> ile üzerine yaz) ya da `MODELS_DEV_API_JSON=<yol>` ile geçici olarak farklı bir anlık görüntü ver;
> bizim `kurum` sağlayıcımızı etkilemez (o zaten `engine/opencode.json`'da elle tanımlı), yalnız diğer
> sağlayıcıların model listesi/limitleri bu kataloğa bakar.

## Bilmeceler (denemede bakılacaklar)
1. ~~`@ai-sdk/openai-compatible` eklentisi offline yüklenebiliyor mu?~~ **Çözüldü:** evet, ikiliye gömülü — npm gerekmiyor.
2. Kurum ucu **araç çağrısı (tool calling)** destekliyor mu? Desteklemiyorsa ajan modu çalışmaz → haber ver.
   **Ölçmek için:** `./kur.sh kontrol` → rapordaki `tool_call` satırı bunu tek başına yanıtlar (adımlar
   artık numarasız basılıyor — eski "7/8" ifadesi güncel çıktıyla eşleşmiyordu, kaldırıldı).
3. Küçük pencerede uzun envanter okuma: kırpma/özetleme opencode'un kendi bağlam yönetimine bırakıldı (aider'daki elle bütçe yok). **Bilinen sınır (Aşama 2 ile ölçüldü):** taban bağlam (sistem promptu + AGENTS.md + beceri listesi + araç şemaları) tek başına 16384'lük bir pencerenin %60'ından fazlasını dolduruyor — bkz. `NASIL-CALISTIRILIR.md` → "Compaction thrash".

## Motor (Engine) ve fork kararı
- Motor = **opencode** (kaynak: `anomalyco/opencode`, MIT — eski adı `sst/opencode`). Kurulum **upstream** sürümüyle yapılır.
- **Karar (ADR-0001): çekirdeğe dokunuş küçük tutulur** — yeni sürümler kolay alınsın, güvenlik güncellemeleri
  kaçmasın, bakım maliyeti düşsün. Bu "sıfır sapma" değil "küçük ve upstream'e uygun sapma" demektir.
- **Güncel durum (2026-09-27):** `https://github.com/alparslanozturk/opencode` artık birebir kopya değil —
  son vendor senkronundan (`vendor: opencode 1.18.30 -> 1.18.32`, commit `47a024456c`) bu yana **2 fork
  commit'i**, **14 dosya**, **+162/-26 satır** (`packages/` altında; `git diff 47a024456c..HEAD -- packages/`
  ile ölçülür). İkisi de "upstream-uygun" işaretli (yamalar upstream'e PR olarak gönderilebilecek küçüklükte):
  pano kopyalama sonucunun dürüstçe bildirilmesi (A22/C15) ve otomatik tekrar denemeler tükenince kullanıcıya
  haber verilmesi (A23). Ayrıntı ve gerekçe: `knowledge/architecture/decisions/0006-fork-sapmasi.md`.
- Upstream **takip edilir** (ADR-0003, `script/upstream-kontrol.sh`); sürüm yükseltme adımları:
  `knowledge/runbooks/upstream-guncelleme.md`. `upstream` remote'u `git remote -v` ile görülebilir
  (yalnız referans — takip betiği kendi `UPSTREAM_URL`'ini kullanır, `git fetch upstream` şart değildir).

## Bu depo (git) — geliştirme burada yürür

Bu dizin artık bir **git deposu**dur (opencode ajan kiti). Bkz. `MIMARI.md` (katmanlar + yol haritası).

- **Takip edilenler:** `engine/` (motor ayarı), `knowledge/` (bilgi deposu), `kur.sh`, `node-v24.19.0-headers.tar.gz`, `*.md`
- **Takip EDİLMEYENLER:** `bin/opencode` (yerel derleme çıktısı), `env` / `env.local` (sırlar)
- Genişletme sırası: `engine/opencode.json` → `engine/AGENTS.md` → `knowledge/skills/` → `engine/plugins/` → (yetmezse) fork
