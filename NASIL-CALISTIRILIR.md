# NASIL ÇALIŞTIRILIR — opencode (kurum içi / offline)

> Hedef: `test-sunucu` (RHEL). Kaynak kod **gerekmez** — tek ikili + ayar + beceriler yeter.
> Sonuçta çalışacak komut: **`opencode`** (kısa ad: **`oc`**).
> **Offline güvence:** `opencode.json`'daki `"npm": "@ai-sdk/openai-compatible"` alanı çalışma anında
> npm/network tetiklemez — bu SDK opencode'un tek ikilisine derleme zamanında gömülüdür. İnternet/npm
> erişimi olmayan bir makinede de sorunsuz çalışır (ayrıntı: `README.md` "Offline güvence" — eski
> `GELISTIRME-RAPORU-OPENCODE-CILA.md` atıfı bu depoda hiç var olmamış bir dosyaydı, kaldırıldı,
> denetim bulgusu #16).

---

## Sahada kullanıcıya görünen **TEK BETİK**

| Komut | Ne işe yarar |
|---|---|
| **`./kur.sh`** | **VARSAYILAN = kur.** Gerekirse derler → kurar → kısayolu düzeltir → sonda kontrol raporunu basar |
| `./kur.sh kur` | aynı iş (açık yazım) |
| `./kur.sh derle` | yalnız kaynaktan derleme (kurulum/kısayol yok) |
| `./kur.sh kontrol` | yalnız kontrol/teşhis: kurulum + kurum AI ucu; sonda tek satır `SORUN:` |
| `./kur.sh yardim` (`-h` \| `--help`) | kısa kullanım ekranı |
| bilinmeyen parametre | dostça hata + kullanım ekranı, çıkış kodu `2` |

Seçenekler (kontrole aktarılır; `kur`/varsayılan akışta da verilebilir):
**`--zaman-asimi <sn>`** (varsayılan 60) · **`--ayrintili`** (raporu kırpmadan bas) ·
**`--url`** / **`--key`** / **`--model`** (kontrolde env yerine tek seferlik değer).

Saha akışı: **`al.sh`** (senkron, git+rsync) → **`./kur.sh`** → (sorun varsa) **`./kur.sh kontrol`**.
Derleme ve kurulum tek betiğin içindeki aşamalardır (`derle()`/`kur()`/`kontrol()`) — ayrı betik YOK.

> **Env oluşturma adımı GEREKMEZ:** `env` yoksa `kur.sh` önce `env.local`'i, o da yoksa
> `env.example`'ı (gerçek saha varsayılanları) `env` olarak kopyalar (izin 600, içerik ekrana
> basılmaz). Elle `cp env.example env` / `vi env` adımı kalktı; yalnız farklı bir uç/adres
> kullanacaksan `env`'i düzenle.

> **Neden tek betik (Alp, 2026-09-22):** *"Tek kur.sh yap, parametre alsın, default parametre
> kurmak olsun. Diğer sh'ları sil."* — Kararları betik verir: ikili yok **veya** kaynak ağacı
> ikiliden yeniyse derler, aksi halde yalnız kurar; başka yeri gösteren `opencode`/`oc` kısayolunu
> soru sormadan yedekler ve düzeltir.
>
> **Eski adlar:** `alp-kur.sh`, `alp-kontrol.sh`, `alp-derle.sh`, `oc-teshis.sh`, `oc-dogrula.sh`,
> `01-derle.sh`/`02-kur.sh`/`03-kontrol.sh` **tarihsel/kullanılmıyor** — üçü de `kur.sh`'ın içine
> fonksiyon olarak taşındı. Daha eski `alp.sh` **artık yok** — sahada rsync'ten kalmış bir kopya
> görürsen yok say.

---

## 3 adımda kurulum

```bash
# 1) paketi getir (KOK = kur.sh'ın bulunduğu dizin, adı önemli değil —
#    kur.sh kendi yolunu otomatik bulur; aşağıda örnek olarak /root/ai/opencode kullanıldı)
tar xJf opencode-paket.tar.xz -C /root      # -> /root/ai/opencode/   (.tar.gz ise: tar xzf ...)

# 2) kur — TEK BETİK (offline; env yoksa env.example'daki hazır saha varsayılanlarından
#    otomatik oluşturulur; gerekirse kaynaktan derler, sonra ikili + ayar +
#    10 çekirdek beceri + oc/opencode kısayolları + rg kurulur, bağlam penceresi kurum uçtan
#    otomatik tespit edilir, sonda otomatik doğrulama + tek ekran özet)
/root/ai/opencode/kur.sh

# 3) çalıştır
cd /root/ai/work/opencode/<proje-adi>   # örn. /root/ai/work/opencode/envanter — bkz. docs/PROJE-YAPISI.md
opencode              # kısa ad: oc
```
**git ile çektiysen** (paket yerine `git pull`/`git clone` ile kuruyorsan):
```bash
cd /root/ai/opencode   # repo nerede ise
./kur.sh               # env otomatik oluşturulur (env.local → env.example sırasıyla)
```
> ℹ️ Taze bir `git clone` sonrası `bin/opencode` yoksa normaldir. `./kur.sh` kaynak ağacı varsa
> kaynaktan derler; hazır ikili arşivi beklemez.

İlk açılışta **`/models`** → `kurum / Qwen3.6-35B-A3B-FP8` seç (bir kez; sonra hatırlar).

**Doğrulama** (istediğin zaman tekrar çalıştırılabilir; kurulum bölümü internet gerektirmez):
```bash
/root/ai/opencode/kur.sh kontrol
```

---

## Ortam değişkenleri

**Ana yol yalnız `env` dosyasıdır** — `kur.sh` onu okur (yoksa otomatik oluşturur), sen elle hiçbir şey export etmezsin.
Aşağıdaki `OPENCODE_*` değişkenleri yalnız **kaçış kapısı / teşhis** amaçlıdır, günlük kullanım
akışının bir parçası DEĞİLDİR.

| Değişken | Nerede | Zorunlu mu | Ne işe yarar |
|---|---|---|---|
| `KURUM_URL` | `env` | evet | Kurum vLLM ucu, `/v1` ile biter (`kur.sh` bunu okuyup `opencode.json`'a yazar) |
| `KURUM_KEY` | `env` | evet | Uç kimlik doğrulaması istemiyorsa `dummy` yeterli |
| `MODEL_ID` | `env` | evet | `/v1/models` çıktısındaki model kimliği |
| `KURUM_MAX_CONTEXT` | `env` | hayır | Bağlam penceresi (token) — `kur.sh` önce `${KURUM_URL}/models`'ten otomatik tespit etmeyi dener; başarısız olursa bu değeri kullanır; o da yoksa mevcut `limit.context` korunur |
| `OPENCODE_VERSION` | `env.local` / kabukta elle (kaçış kapısı) | hayır | Ürün sürümü — derleme adımı ikiliye bunu yazar; varsayılan `1.0.0` (`kur.sh` içindeki `SURUM`). Değiştir: `OPENCODE_VERSION=1.0.1 ./kur.sh derle` |
| `OPENCODE_CHANNEL` | kabukta elle (kaçış kapısı) | hayır | Derleme kanalı — varsayılan `main`; bilerek böyle (DB dosyası adı kanala göre seçiliyor, bkz. SURUM-NOTLARI). Günlük akışta değiştirilmez |
| `OPENCODE_DISABLE_AUTOCOMPACT` | kabukta elle (kaçış kapısı) | hayır | Auto-compaction'ı tamamen kapatır — yalnız teşhis için; context taşarsa sert hata verebilir (bkz. aşağı) |
| `OPENCODE_LOG_LEVEL` | kabukta elle (kaçış kapısı) | hayır | `DEBUG/INFO/WARN/ERROR` — sorun ararken `--log-level DEBUG` ile aynı iş |

---

## Depo düzeni: motor / bilgi

| Katman | Yer | Ne |
|---|---|---|
| **Motor** | `engine/` | `AGENTS.md` (kurallar) · `opencode.json` (ayar) · `plugins/` (araç) |
| **Bilgi** | `knowledge/` | `skills/approved/` (canlı beceriler) · `experimental/` · `generated/` · `runbooks/` · `incidents/` · `lessons-learned/` · `operations-notes/` · `architecture/` · `roadmap/` |

`kur.sh` becerileri **yalnız `knowledge/skills/approved/`**'dan kurar; ajan `experimental/` + `generated/`'ı okumaz
(onay kapısı — *"AI kendi kendine öğrenmez, öğrenme önerir"*).

---

## Kaynaktan derleme (ikili yerine kaynak koddan build)

> **Doğrulandı (2026-09-17, skyup/`/root/ai/opencode-build`, gerçek koşum — tahmin yok).** Saha makinesi
> (saha-makinesi) **ayrıca doğrulandı (2026-09-19, Alp)**: npm, Node.js, bun kurulu; Node header'ları
> manuel kuruldu; kurum içi npm proxy ayarlı. **Derleme tarafında bilinen bir sorun yok** — bkz.
> `knowledge/architecture/2026-09-saha-topolojisi.md`.

---

## 🛠️ Saha kurulumu (saha-makinesi, offline) — `al.sh` → **`kur.sh`**

> **Kime:** dış interneti olmayan, yalnız **kurum içi npm proxy**'sine erişen saha makinesi.
> **Doğrulandı: 2026-09-21** — skyup'ta, `pkg.pr.new` / `api.github.com` / `github.com` / `models.dev`
> host'ları bir mount namespace'inde karartılarak (`unshare -m` + sahte `/etc/hosts`) ve **boş bun
> önbelleğiyle** (`BUN_INSTALL_CACHE_DIR`) gerçekten koşuldu; kanıt ölçümleri aşağıda.
> **2026-09-22:** tek betiğe geçildi — `./kur.sh` (parametresiz = `kur`) derleme+kurulum+son kontrol
> raporunu tek komutta yapar; `./kur.sh derle` yalnız derler, `./kur.sh kontrol` yalnız raporlar.

```bash
# 1) kodu çek (senkron — Alp'in kendi akışı: git pull + rsync)
./al.sh

# al.sh sonuna bunu ekleyebilirsin; env.local varsa kur.sh otomatik env yapar:
cat > /root/ai/opencode/env.local <<'EOF'
KURUM_URL=https://SUNUCU:8000/v1
KURUM_KEY=dummy
MODEL_ID=MODEL_ID_YER_TUTUCU
EOF

# 2) TEK KOMUT: gerekirse derler, sonra kurar (ayar+beceri+plugin+rg+kısayol) ve doğrular
cd /root/ai/opencode && ./kur.sh

# 3) kullan
cd <veri/proje dizini> && opencode        # kısa ad: oc

# 4) bir şey ters giderse — TEK kontrol komutu (tek ekranlık rapor + "SORUN:" satırı)
cd /root/ai/opencode && ./kur.sh kontrol
```

**Kararı `kur.sh` verir, sen parametre öğrenmezsin:**

| Durum | Ne olur |
|---|---|
| `bin/opencode` yok | Kaynaktan **derlenir** (kur.sh derleme aşaması) |
| Kaynak ağacı ikiliden **yeni** | Kaynaktan **yeniden derlenir** (eski ikiliyle kurulum yapılmaz) |
| İkili sürümü **istenenden farklı** (`bin/opencode --version` ≠ `1.0.0`) | Kaynaktan **yeniden derlenir** — ürün sürümü uyuşmuyor; `al.sh` + `./kur.sh` ikiliyi kendiliğinden `1.0.0`'a geçirir |
| İkili güncel | Derleme yok — yalnız kurulum (birkaç saniye) |

> **Kısayolun tek sahibi kurulum aşamasıdır:** `/usr/local/bin/opencode` (+ `oc`) →
> `~/.opencode/bin/opencode`. Kısayol başka bir hedefi gösteriyorsa **soru sormadan** yedeklenir
> (`.bak-<tarih>`) ve doğru ikiliye çevrilir. Derleme aşaması kısayol kurmaz — eskiden iki betik aynı
> kısayolu farklı hedefe kuruyordu ve "son çalışan kazanıyordu"; tek sahip kuralı bunu bitirdi.

### Derleme aşaması (iç detay): `kur.sh derle`

`kur.sh derle` **yalnız derler** — normalde elle çalıştırılmaz, kurulum akışı kendisi çağırır. İçinde `git pull` YOKTUR
(saha makinesinde git kaynağı yok; senkron `al.sh`'ın işi). Yaptıkları sırayla:

| Adım | Ne yapar | Neden |
|---|---|---|
| bun bulma | PATH → `$HOME/.bun/bin` → `/root/.bun/bin` (ya da `BUN=` ile elle) | Saha makinesinde bun PATH'te olmayabiliyor |
| `MODELS_DEV_API_JSON` | Repodaki `packages/opencode/script/models-dev-api.json` snapshot'ını gösterir | Derleme `https://models.dev/api.json`'a **hiç bağlanmasın** |
| `bun install --filter="./packages/opencode"` | Yalnız CLI workspace'inin bağımlılıkları | Web/console paketlerinin **npm dışı** bağımlılıklarını hiç çözmez |
| `build.ts --single --skip-embed-web-ui --skip-install` | Tek platform, web UI gömmeden | Kurum senaryosu yalnız CLI/TUI |
| symlink | **kurmaz** — sahibi kurulum aşaması | Tek sahip kuralı — kısayol çakışması bitti |

İç bayrakları kurulum akışı verir (`--bin-kopyala`, gerekirse `--kurulum-yok`); tanınmayan bayraklar
`bun install`'a aktarılır. Native derleme sorunlu bir makinede ek bun bayrağı gerekiyorsa
`ALP_DERLE_EK="--ignore-scripts" ./kur.sh` (ayıklama kaçış kapısı — normal akışta gerekmez).

### Kurum içi npm proxy — `~/.bunfig.toml` (repoya GİRMEZ)

Registry ayarı **kişisel/makine yereldir**; repodaki `bunfig.toml` upstream opencode'un kendi install
ayarıdır, kurum adresi oraya yazılmaz (public repo). Saha makinesinde:

```toml
# ~/.bunfig.toml
[install]
registry = "https://<kurum-npm-proxy>/repository/npm-proxy/"
```

Tek seferlik alternatif: `BUN_CONFIG_REGISTRY="https://<kurum-npm-proxy>/..." ./kur.sh`
(değişken derleme aşamasına olduğu gibi geçer).

### Offline'da patlayan iki şey ve çözümleri (2026-09-21, Alp'in saha hatalarından)

**1) `bun install` → 2 bağımlılık inmiyor.** Kök `package.json` catalog'unda
`@solidjs/start: https://pkg.pr.new/@solidjs/start@dfb2020`, `packages/app/package.json`'da
`ghostty-web: github:anomalyco/ghostty-web#83c0a07...` var — ikisi de **npm registry dışı** (pkg.pr.new ve
api.github.com), kurum proxy'si bunları aynalamıyor.
**Çözüm: bu paketlere hiç ihtiyaç duymamak.** İkisi de yalnız `packages/app` / `packages/console/*` /
`packages/enterprise` / `packages/stats/*` tarafında; CLI (`packages/opencode`) bunlara **hiç bağlı değil**
(`packages/opencode/package.json`'da ne app ne console geçiyor). Bu yüzden `kur.sh` derleme aşaması
`bun install --filter="./packages/opencode"` kullanıyor:

- kurulan paket sayısı **2708 → 1000**'e iniyor,
- `node_modules/ghostty-web` ve `node_modules/@solidjs/start` **hiç oluşmuyor** (dolayısıyla indirilmiyor),
- `bun.lock` **değişmiyor** (`git status` temiz kalıyor — filtreli kurulum lockfile'ı bozmuyor).
- Daha sıkı istersen (ayıklama): `ALP_DERLE_EK="--frozen-lockfile" ./kur.sh` — lockfile ile
  `package.json` ayrışmışsa hata verir.

**2) `bun run build` → `models.dev` ECONNRESET.** `build.ts` ilk satırlarda `./generate.ts`'i import ediyor,
o da model kataloğunu (`https://models.dev/api.json`, ~4.7 MB) çekip derleme zamanı sabiti olarak
(`OPENCODE_MODELS_DEV`) ikiliye gömüyor. Ağsız makinede bağlantı ECONNRESET ile kopuyor ve build duruyor.
**Çözüm (iki katmanlı, online davranış bozulmadan):**

- Repoda **snapshot**: `packages/opencode/script/models-dev-api.json` (2026-09-21 tarihli, 222 sağlayıcı).
- `generate.ts` sırası: `MODELS_DEV_API_JSON` (açık override) → canlı `fetch` (30 sn zaman aşımı, JSON
  doğrulaması ile) → **başarısız olursa snapshot**. Yani internetli makinede davranış eskisi gibi (taze
  katalog), ağsız makinede sessizce snapshot'a düşüyor (uyarı satırı basarak).
- `kur.sh` derleme aşaması ayrıca `MODELS_DEV_API_JSON`'u snapshot'a ayarlıyor → sahada **fetch hiç denenmiyor** (zaman
  aşımı beklemesi de yok).

**Snapshot'ı tazelemek** (internetli makinede, ör. skyup; sonra commit'le):
```bash
curl -sSf https://models.dev/api.json -o packages/opencode/script/models-dev-api.json
```
> Yeni bir model/sağlayıcı sahada görünmüyorsa nedeni budur: ikiliye gömülü katalog, snapshot'ın
> tarihindeki hâlidir. Kurum ucu (`openai-compatible`) zaten `opencode.json`'dan tanımlandığı için
> günlük kullanımda snapshot tazeliği kritik değildir.

### Doğrulama koşumu (2026-09-21, skyup — gerçek çıktı)

Kurulum ve derleme, **boş bun önbelleğiyle** ve `pkg.pr.new` / `api.github.com` / `github.com` /
`models.dev` host'ları karartılmış bir mount namespace'inde koşuldu (npm registry açık — kurum proxy'si
senaryosu):

```
==> bun: /root/.bun/bin/bun (1.4.2)
==> models.dev snapshot: .../packages/opencode/script/models-dev-api.json
==> bun install --filter=./packages/opencode        -> 1000 packages installed [20.65s]
==> build.ts --single --skip-embed-web-ui --skip-install
Loaded models.dev snapshot
building opencode-linux-x64
Smoke test passed: 0.0.0--202609211229
==> ikili: .../dist/opencode-linux-x64/bin/opencode (135M)
real 0m35s   (kurulum + derleme toplamı)
```

- `node_modules/ghostty-web` ve `node_modules/@solidjs/start` **oluşmadı**, `bun.lock` **değişmedi**.
- Üretilen ikili **ağı tamamen kapalı** ortamda (`unshare -n opencode models`) model listesini bastı →
  katalog gerçekten ikiliye gömülü.
- `generate.ts`'in iki yolu ayrı ayrı denendi: internetli koşumda canlı `fetch` (uyarı yok), `unshare -n`
  koşumunda `models.dev unreachable ... falling back to snapshot` + başarılı devam.

### Ön koşullar

- **Bun.** Repo kökü `package.json` → `"packageManager": "bun@1.3.14"` istiyor; bu makinede kurulu olan
  **1.4.2** ile hiçbir sorun çıkmadı (saha makinesiyle aynı sürüm/aynı sonuç). `packages/script/src/index.ts`
  yalnız `^<packageManager sürümü>` aralığını **build script'i çalışırken** kontrol ediyor — 1.3.14 ile 1.4.2
  aynı major.minor değil (`^1.3.14` aralığı 1.4.x'i kapsamaz) ama bu makinede build script hatasız çalıştı;
  yani ya bu kontrol beklenenden gevşek davranıyor ya da build script'in bu satırına hiç girilmedi (statik
  olarak doğrulanmadı — saha koşumunda `packageManager` uyarısı çıkarsa not düş).
- Bu makinede `bun` **PATH'te değildi**, ikili `/root/.bun/bin/bun` altında duruyordu →
  `export PATH="/root/.bun/bin:$PATH"` gerekti. Saha makinesinde PATH durumu ayrı kontrol edilmeli.
- **`g++` (gcc-c++) eksikti** (`gcc` var, `gcc-c++` yok — `rpm -q gcc-c++` → kurulu değil). Bu, tam
  `bun install`'ı kırıyor (aşağıya bak) — opencode/bun'ın kendi sorunu değil, bu makinenin C++ derleyici
  eksikliği.

### 1) Bağımlılıkları kur

> Aşağısı **elle/tam workspace** koşumunu anlatır (2026-09-17 ölçümü). Saha/offline makinesinde bunun
> yerine `./kur.sh` kullan — gerekirse derleme aşamasını çağırıp filtreli kurulumu ve models.dev snapshot'ını
> kendisi ayarlar, ardından kurulumu ve doğrulamayı da yapar (yukarıdaki "Saha kurulumu").

```bash
cd /root/ai/opencode-build   # repo kökü (workspace bütünlüğü için şart — bkz. aşağı "kaynak yoksa")
export PATH="/root/.bun/bin:$PATH"   # bun PATH'te değilse
bun install                          # tam workspace (2708 paket) — internet gerekir (pkg.pr.new + github)
# offline/kurum ağı: yalnız CLI (1000 paket, npm dışı kaynak istemez)
bun install --filter="./packages/opencode"
```

**Bu makinede düz `bun install` yarıda kesildi:** `tree-sitter-powershell`'in native `node-gyp` derlemesi
`make: g++: No such file or directory` ile patladı (paket: `node_modules/.bun/tree-sitter-powershell@.../`).
2708 paketin çoğu o ana kadar zaten indirilip `.bun` store'una açılmıştı, yalnız son adım (postinstall +
top-level linkleme) yarıda kaldı.

- **Çözüm A (sistem paketi eksik — kurulmadı, onay gerektirir):** `dnf install -y gcc-c++`, sonra düz
  `bun install` muhtemelen sorunsuz tamamlanır. **Bu koşumda kasıtlı olarak çalıştırılmadı** (sistem paketi
  kurulumu, minimal-değişiklik ilkesi dışında — Alp karar versin).
- **Çözüm B (denendi, ÇALIŞTI, sistem değişikliği gerektirmez):**
  ```bash
  bun install --ignore-scripts
  ```
  Tüm postinstall/native-derleme adımlarını atlar. Bu depoda gözlenen tek yan etki: `packages/core`'un kök
  `postinstall` betiği (`fix-node-pty`) de atlanır — ama bu paket artık `@lydell/node-pty` + `bun-pty`
  kullanıyor, betiğin aradığı eski yol (`packages/core/node_modules/node-pty/prebuilds`) zaten **mevcut
  değildi** (paket adı değişmiş) — yani bu betik zaten no-op durumdaydı, `--ignore-scripts` ekstra bir
  şey kaybettirmedi (bu depo/sürüm için; başka bir sürümde farklı olabilir, koşarken kontrol et).
  Sonuç: `Checked 2436 installs across 2708 packages` — workspace tam kuruldu.

### 2) Derle

```bash
./packages/opencode/script/build.ts --single --skip-embed-web-ui --skip-install
```

- `--single`: yalnız çalıştığın platform+mimari için derler (burada `linux-x64`). Bayраksız hâli
  `script/build.ts` içindeki **12 platform×mimari** listesinin tamamını derlemeye çalışır — çok daha uzun
  sürer ve her hedef için ayrı prebuilt paket ister; tek makine kullanımı için gerekmez.
- `--skip-embed-web-ui`: web UI'yi ikiliye gömme adımını atlar (`packages/app`'in ayrı bir `bun run build`'ini
  gerektirir) — yalnız CLI/TUI kullanımı için (kurumun senaryosu) gerekli değil.
- `--skip-install`: `build.ts`'in normalde **her hedef platform için** `@opentui/core`/`@parcel/watcher`/
  `@ff-labs/fff-bun`'ı yeniden çekme adımını atlar; adım 1'deki workspace install zaten bu makinenin
  platformu için doğru paketleri getirmişti.
- CONTRIBUTING.md'nin "Building a localcode" bölümü de aynı komutu (bayraksız `--single`) belgeliyor —
  burada eklenenler yalnız bu kurum ortamına özgü bayraklar (`--skip-embed-web-ui`, `--skip-install`) ve
  offline/Nexus notu.

**Çıktı (bu makinede gerçekten üretildi ve ölçüldü):**
```
packages/opencode/dist/opencode-linux-x64/bin/opencode
```
- 135 MB, `ELF 64-bit LSB executable, x86-64 ... for GNU/Linux 3.2.0`, en yüksek gerekli `GLIBC_2.17`
  → RHEL9 (glibc 2.34) / RHEL10 (glibc 2.39) ile uyumlu.
- Build script kendi **smoke testini** otomatik koşuyor (`dist/.../bin/opencode --version`) — bu koşumda
  geçti: `Smoke test passed: 0.0.0-main-<tarih>` (preview kanal versiyonu; `OPENCODE_VERSION` env'i verilmezse
  ve `git branch --show-current` "latest" değilse otomatik böyle üretiliyor, network gerekmiyor).
- **Süre (bu makinede, sıcak bun cache + `--skip-install` + `--skip-embed-web-ui` ile):** derleme adımının
  kendisi **~7 saniye**. `bun install` adımı (2708 paket) de saniyeler sürdü çünkü bu makinenin global bun
  paket önbelleği (`~/.bun/install/cache`) muhtemelen başka bir işten zaten ısınmıştı — **bu süre soğuk
  önbellek/gerçek ağ ile karşılaştırılabilir değil**, saha koşumunda yeniden ölçülmeli.

### 3) `kur.sh` ile kullan

`kur.sh`, ikilinin nereden geldiğini ayırt etmez — derlenmiş ikiliyi doğrudan `bin/opencode` yerine koyman
yeterli (bu koşumda denendi, `kur.sh` + `kur.sh kontrol` ile uçtan uca doğrulandı, bkz. aşağıdaki
"kur.sh uyumluluğu"):

```bash
cp packages/opencode/dist/opencode-linux-x64/bin/opencode bin/opencode
chmod +x bin/opencode
./kur.sh
```

### Offline / Nexus npm proxy notu

`bun install`, varsayılan olarak `registry.npmjs.org`'a bağlanır (bu makinede ağ erişimi vardı, test bu şekilde
yapıldı). Bu repoda **kurum içi bir npm registry override'ı yok** — offline/kurum-ağı senaryosunda `bun`'ı bir
Nexus npm-proxy'sine yönlendirmek için (repoya commitlenmemesi gereken, yerel bir ayar):

```bash
# proje kökünde ya da $HOME/.bunfig.toml içinde:
[install]
registry = "https://<nexus-kurum-ici>/repository/npm-proxy/"
# ya da tek seferlik:
BUN_CONFIG_REGISTRY="https://<nexus-kurum-ici>/repository/npm-proxy/" bun install
```

Bu ayar bu depoda **denenmedi** (kurum Nexus adresi bu makineden erişilebilir değil) — söz dizimi bun'ın kendi
dokümantasyonuna dayanıyor, saha koşumunda gerçek bir Nexus npm-proxy'sine karşı doğrulanmalı.

> **Ama registry tek başına yetmez:** kurum proxy'si npm'i aynalasa bile, tam `bun install` **npm dışı** iki
> kaynağa (pkg.pr.new, api.github.com) gitmeye çalışır ve orada patlar. Offline çözüm yukarıdaki
> "Saha kurulumu" bölümünde: `bun install --filter="./packages/opencode"` + models.dev snapshot (kur.sh
> derleme aşaması ikisini de kendisi yapar).

### Kaynak yoksa / erişim yoksa (derleme senaryosu, kurulum değil)

Kaynaktan derlemek için **tek başına `packages/opencode` yetmez** — bu bir Bun workspace'i
(`package.json` → `workspaces.packages: ["packages/*", ...]`, `bunfig.toml`'daki `catalog:` sürüm
kilitleri, `bun.lock` kök seviyesinde tek dosya). Taşınması gerekenler:
- Reponun **tamamı** (git clone/rsync ile — `node_modules` ve `packages/opencode/dist` hariç tutulabilir,
  `.gitignore`'da zaten dışlanıyorlar).
- `bun` ikilisinin kendisi (offline hedefse `bun`'ın kendi tek-dosya kurulumu ayrıca taşınmalı — bu deponun
  kapsamı dışında).
- npm paketlerine erişim: ya kurum içi Nexus npm-proxy'si (yukarı bak) ya da önceden doldurulmuş bir
  `~/.bun/install/cache` dizini (taşınabilirse `bun install` ağsız/registry'siz de tamamlanabilir —
  bu koşumda denenmedi).

### ✅ Root'tan typecheck artık güvenli — otomatik sınırlı (2026-09-19, düzeltildi; önceki hali: makine 5 kez donup rebootlandı)

**Geçmiş:** Kök `typecheck` script'i (`bun turbo typecheck`), workspace'teki ~30 paketin **her biri için
paralel bir `tsgo`** (TypeScript native-preview derleyicisi) süreci başlatıyordu, concurrency sınırı yoktu.
Saha/geliştirme makinesi tipik olarak **2 vCPU, 8GB RAM, 0B swap** — bu kadar `tsgo` süreci aynı anda
RAM'i tüketince swap olmadığı için kernel OOM-killer yetişmeden makine tamamen donuyordu (SSH dahil
hiçbir şey yanıt vermiyordu), kurtarmak için host seviyesinde hard-reset gerekiyordu. 2026-09-19'da bu
şekilde ~40 dakikada 5 reboot yaşandı. Detaylı kayıt: `knowledge/incidents/2026-09-19-typecheck-donma.md`.

**Kalıcı düzeltme (commit `18999221c4`):** `script/safe-concurrency.sh`, hem `nproc` hem
`/proc/meminfo`'daki `MemAvailable` değerine bakıp güvenli bir concurrency hesaplıyor (~700MB/süreç
varsayımıyla, ikisinin küçüğü kullanılıyor). Kök `package.json`'daki `typecheck` script'i artık bunu
kullanıyor, `.husky/pre-push` de kendi kopyasını tutmadan yalnız `bun typecheck`'i çağırıyor — yani
**hangi yoldan çağrılırsa çağrılsın** (`git push`, CI, doğrudan `bun run typecheck`, başka bir sunucuda
başka bir ajan) aynı korumadan geçiyor. Bu fix repoya gömülü olduğu için klonlanan **her** sunucuda
(kurum filosu dahil) otomatik geçerli — host bazında ayrı kurulum gerekmiyor. Karar gerekçesi:
`knowledge/architecture/decisions/0002-typecheck-guvenli-calisma.md`.

- 2026-09-19'da iki gerçek `git push` ile canlı doğrulandı: bellek boyunca GB'larca boş kaldı, makine
  hiç zorlanmadı, 30/30 typecheck task'ı geçti.
- **Yine de dikkat:** Bu, "sınırsız paralellik" riskini kapatır, "sıfır yük" değil — çok büyük/ağır bir
  workspace'te ya da çok daha kısıtlı bir makinede (ör. 1 vCPU/1GB RAM konteyner) yine de dikkatli olun;
  tek paket bazında çalıştırmak (`cd packages/opencode && bun typecheck`) her zaman en hafif yol.
- **Açık kalem (henüz uygulanmadı, zorunlu değil):** bu sınıf makinelerde swap yok — en az 2-4GB swap
  eklemek ek bir savunma katmanı olurdu, ama kök neden zaten kod seviyesinde kapatıldığı için acil değil.

---

## Teşhis — `kur.sh kontrol` (kurum ucunu test eder)

> **Ne zaman:** TUI `Failed to send prompt` / `Unexpected server error` dediğinde, `/models`
> boş geldiğinde, cevap yarıda kesildiğinde — yani **"uç mu bozuk, opencode mu?"** sorusunda.

```bash
/root/ai/opencode/kur.sh kontrol          # tek satır; env'deki KURUM_URL/KURUM_KEY/MODEL_ID ile
```

Tek seferlik başka bir uç denemek istersen:
`./kur.sh kontrol --url https://sunucu:8000/v1 --model <model-id> [--key <anahtar>] [--zaman-asimi 120]`

**Tek komut — parametresiz çağrı iki bölümü birden raporlar:**

| Bölüm | Neyi doğrular | Ağ gerekir mi |
|---|---|---|
| KURULUM | ikili, env, ayar dosyası, beceriler, `rg`, izinler, kısayol | hayır |
| KURUM AI UCU | DNS, TCP, `/models`, sohbet, akış, araç çağrısı, bağlam penceresi, log | evet |

(Gelişmiş: `--ayrintili` aynı raporu kırpmadan basar — uçtaki tüm model listesi, tam gövdeler, ham süreler.)

**Ne yapar:** URL biçimi → DNS → TCP → `GET /models` (`MODEL_ID` listede mi; yoksa aday modelleri
basar) → `POST /chat/completions` (akışsız) → **akış testi** (`"stream": true` — opencode her
istekte akış kullanır) → **araç çağrısı** (`tools`) → bağlam penceresi (`max_model_len`) + kurulu
`opencode.json` karşılaştırması → opencode log'undaki son `err_`/`ERROR` satırı.

**Çıktı sözleşmesi — tek ekran:** rapor **≈16 satır** ve **≤100 sütun** (env'de `KURUM_URL_2`
varsa karşılaştırma bloğu için **+3 satır** — aşağıdaki "İki ucu karşılaştırma"); uzun URL/gövde kırpılır,
satır sarması olmaz. Yani ekran görüntüsünü tek karede alıp gönderebilirsin. Her şeyi görmek
istersen `--ayrintili`. KURULUM bölümünün ilk satırı ikilinin sürümünü de söyler:
`ikili … kurulu: ~/.opencode/bin/opencode · surum 1.0.0` (ürün sürümü — farklıysa `./kur.sh`
yeniden derler; bkz. "Ortam değişkenleri" → `OPENCODE_VERSION`).

**Güvenlik:** salt okunur (sistemde/ayarlarda hiçbir şeyi değiştirmez), uca yalnız 16 token'lık
kısa istekler gider. `KURUM_KEY` **ekrana basılmaz** (`abc****yz (uzunluk: 20)` şeklinde maskelenir)
ve `ps` çıktısında görünmesin diye curl'e geçici, 600 izinli config dosyasıyla verilir. Çıktının
tamamını olduğu gibi kopyalayıp gönderebilirsin.

**Çıktı nasıl okunur** — **son satırdaki `SORUN:` yeter.** Kök nedeni tek satırda, kanıtıyla söyler:

| `SORUN:` satırı | Anlamı | Ne yapılır |
|---|---|---|
| `yok — uc saglikli, sorun opencode tarafinda` | Uç akışlı+akışsız yanıt veriyor, model doğru | Sorun **opencode tarafında**: satırın sonundaki log alıntısına bak; toast'taki `err_xxxxxxxx` ref'ini `grep -r 'err_xxxxxxxx' ~/.local/share/opencode/log` ile ara → `cause` alanını gönder |
| `uc erisilemiyor (TCP <host>:<port> kapali)` / `DNS cozulemiyor` | Ağ/erişim | **Uç/ağ tarafı.** opencode'u kurcalama; `getent hosts`, güvenlik duvarı, `http_proxy` |
| `kimlik dogrulama — /models HTTP 401` | Anahtar yanlış/eksik | `env` içindeki `KURUM_KEY`'i düzelt → `./kur.sh` |
| `MODEL_ID ucta yok — <id>` | Model uçtaki listede yok | Raporun bastığı listeden **birebir** kopyala → `env` → `./kur.sh` |
| `/chat/completions HTTP <kod> — <gövde>` | Uç sohbet isteğini reddetti | Gövdedeki mesajı uç ekibine gönder |
| `stream calismiyor (HTTP 200, SSE parcasi 0)` / `stream <kod>` | Akış kırık | Uç/proxy tarafı: nginx `proxy_buffering off`, ya da uç SSE desteklemiyor. opencode akışsız çalışamaz |
| `uc tool_call kabul etmiyor (HTTP <kod>)` | `tools` reddedildi | opencode her isteğe araç şeması ekler; bu tek başına `Failed to send prompt` sebebi olabilir (ALP-README "Bilmeceler" #2) |

**Çıkış kodu:** `0` sorun yok · `1` sorun var · `2` env/kullanım hatası · `3` `curl` yok.
(Otomasyon için; ekrana bakarken `SORUN:` satırı zaten her şeyi söyler.)

### İki ucu karşılaştırma (opsiyonel — `KURUM_URL_2`)

İki kurum ucun varsa hangisinin daha iyi olduğuna bakmak için **yeni komut/bayrak yok**:
`env` (veya `env.local`) dosyasına ikinci ucu ekle, `./kur.sh kontrol` raporun sonuna
karşılaştırma bloğunu kendiliğinden ekler.

```bash
# env — 1. uç zaten dolu; şu üç satır opsiyonel (KURUM_KEY_2/MODEL_ID_2 boşsa 1. uçunki kullanılır)
KURUM_URL_2=https://sunucu2:8000/v1
KURUM_KEY_2=dummy
MODEL_ID_2=<2. uçtaki model id>
```

Rapor sonunda çıkan blok (3 satır):

```
 uc1       ✓ sunucu1:8000 · model var · baglam 32768 · medyan 41 ms
 uc2       ✓ sunucu2:8000 · model var · baglam 131072 · medyan 88 ms
 >> daha hizli: uc1 (41 vs 88 ms) · genis baglam: uc2 (131072 vs 32768) · uc2 modeli farkli
```

- **Gecikme:** her uç için `GET /v1/models`'e **3 örnek**, **medyan** ms. Ek sohbet isteği
  açılmaz (en küçük istek kullanılır), `--zaman-asimi` iki uç için de geçerlidir — erişilemeyen
  uçta ölçüm yapılmaz, rapor asılı kalmaz.
- **`model var` / `model YOK`:** o uçtaki `/v1/models` listesinde `MODEL_ID` (uc2 için `MODEL_ID_2`)
  var mı. **`baglam`:** uçun bildirdiği `max_model_len` (python3 yoksa `?`).
- Son satır karar ipucudur; **çıkış kodunu ve `SORUN:` satırını değiştirmez** — 2. uç erişilemezse
  bu yalnız `!` uyarısı olarak görünür, rapor yine 1. uca göre sonuçlanır.
- `KURUM_URL_2` boşken **çıktı birebir eskisi gibidir** (satır satır aynı). Anahtarlar hiçbir
  durumda ekrana basılmaz.

> **Not:** 2026-09-21'den itibaren sunucu, tanıdığı hataları artık `Unexpected server error`
> yerine **gerçek sebebiyle** döndürüyor (ör. `Model not found: kurum/... (ref: err_1a2b3c4d)`,
> `Cannot reach the provider endpoint (llm.internal): ECONNREFUSED (ref: ...)`). Toast'ta artık
> `ref` de yazıyor — log'da onu aratmak en hızlı yol. Tanınmayan hatalar hâlâ genel 500 döner
> (güvenlik: rastgele yığın izi istemciye sızmaz), tam `cause` yine log'dadır.

---

## Sorun giderme

| Belirti | Ne yapılır |
|---|---|
| `Failed to send prompt` → `Unexpected server error. Check server logs for details.` | **Önce `./kur.sh kontrol`** (yukarıdaki "Teşhis"). Toast'ta `(ref: err_xxxxxxxx)` varsa: `grep -r 'err_xxxxxxxx' ~/.local/share/opencode/log` |
| `Failed to send prompt` (0 token, ayarla ilgisi yok) + log'da `TypeError: undefined is not an object (evaluating 'a.name')` (stack `SystemPrompt.environment` → `resolve` → `map`) | **Derlenmiş ikilideki paketleme hatasıydı** — `bun build`'in `splitting: true` ayarı, tek dosyalık `compile` çıktısında dairesel import'ların (`LayerNode` bağımlılık ağacı, `core/src/location-services.ts`) sırasını bozup bir düğümü `undefined` bırakıyordu; kaynaktan (`bun run src/index.ts`) çalıştırınca hiç görünmüyordu, yalnız derlenmiş ikilide çöküyordu. Sürüm **1.0.1+**'de düzeltildi (`packages/opencode/script/build.ts`: `splitting: false`). Sahada `./kur.sh derle` (veya `kur.sh` sürüm uyuşmazlığında kendiliğinden) yeniden derleyince geçer. Ayrıca 1.0.1'de defansif koruma var: bozuk/eksik `reference` girdisi de ortam bloğunu çökertmez, `skipping invalid reference...` uyarısı loglanır |
| `Endpoint 180 sn'dir yeni içerik göndermedi` | Zaman aşımları 900/300/180 sn'ye çekildi; sorun model tarafında — aynı isteği üst üste yineleme |
| Uzun dosya/log okurken kesilme | Pencere kurulumda tespit edilen değer kadar (bkz. "Ortam değişkenleri"); model `offset`/`limit` ile parça parça okumalı |
| Beceriler görünmüyor | `~/.config/opencode/skills/` altında mı? `opencode debug skill` ile say. Kurulum **10 çekirdek beceriyi** kurar; park edilmiş bir beceri gerekiyorsa `knowledge/skills/parked/<ad>`'ı `approved/`'a taşı ve `./kur.sh`'ı tekrar çalıştır |
| Ayar değişti, etki yok | opencode ayarı açılışta bir kez okunur, sıcak yükleme yok → opencode'u tamamen kapat-aç |
| TUI bozuk görünüyor (glif/kutu) | Terminal fontu/UTF-8; `TERM=xterm-256color` |
| `opencode`/`oc` PATH'te yok | `kur.sh` çıktısındaki NOT satırına bak; `export PATH="<kısayol-dizini>:$PATH"` |
| Var olan başka bir `opencode`/`oc` kısayolu var | `./kur.sh` bunu **kendisi çözer**: eskisini `.bak-<tarih>` olarak yedekler, kısayolu doğru ikiliye çevirir |
| Ekranda sürekli `⠋ Thinking` + `Compaction`/`Build` art arda dönüyor, hiç ilerlemiyor | **Bilinen sorun, aşağıya bak** ("Compaction thrash / sonsuz döngü") |
| Çalışma dizini boş (`ll` → `total 0`) ama opencode yine de çalışıyor | Paket o makinede **açılmamış olabilir** — aşağıdaki "Dağıtım kontrolü"ne bak |
| `ripgrep execution failed` / arama (grep/glob) çalışmıyor | `rg` eksik. `./kur.sh kontrol` çalıştır → `rg` satırına bak. `kur.sh` normalde `bin/ripgrep.tar.xz`'yi `~/.cache/opencode/bin/rg`'ye kurar; hâlâ yoksa elle bir statik `rg` ikilisini o yola koy |
| Çıplak `ls`/`cat`/`git log` gibi salt-okunur komutlar hâlâ izin soruyor | `~/.config/opencode/opencode.json` güncel mi? (`kur.sh`'ı tekrar çalıştır) — Aşama 2'den önceki paketlerde bu kalıplar yoktu |
| Aynı görevde defalarca "Plan" ajanına düşüyor, komut denemiyor | `Tab` ile **Build** ajanına geç; `kur.sh` artık `default_agent: build` yazıyor ama TUI önceki oturumdan Plan'da kalmış olabilir |
| Makine tamamen donuyor / SSH yanıt vermiyor (reboot gerekiyor) | 2026-09-19 öncesi bilinen bir sorundu (root'tan sınırsız paralel `tsgo`); **artık düzeltildi**, bkz. yukarıda "Root'tan typecheck artık güvenli". Yine de oluyorsa `script/safe-concurrency.sh`'ın çalıştığını doğrula, `knowledge/incidents/2026-09-19-typecheck-donma.md`'ye yeni bulgu ekle |

---

## Compaction thrash / sonsuz döngü (2026-09-15 Aşama 1 + 2, kanıtlı kök neden)

**Belirti:** Basit bir istekte (`ls`, "dizini listele") bile ekran sürekli `⠋ Thinking` →
`Compaction · Qwen...` → `Build · ...` arasında dönüyor, context doluyor (`%86 used` gibi), agent
tool çağırmak yerine "Next Move / Receive user response..." tipi plan metni üretip duruyor. `esc` ile
kesmek gerekiyor.

**Kök neden (iki katmanlı; offline olarak `bin/opencode` ile ölçüldü — kurum endpoint'i gerekmedi):**

1. **Baseline bağlam pencerenin büyük bir kısmını kaplıyor.** Ölçüm yöntemi: `opencode.json`'daki
   `baseURL`'i yerel bir mock HTTP sunucuya yönlendirip (`opencode run "..." --format json`), sunucuya
   gelen **gerçek istek gövdesi** kaydedildi — tahmin yok, gerçek bayt sayısı + gerçek tokenizer
   (`tiktoken cl100k_base`, Qwen'in kendi tokenizer'ı yerine en yakın kamuya açık BPE proxy'si).
2. **Model araç çağırmayan (plan metni gibi) bir yanıt döndürdüğünde, opencode'un adım döngüsü
   DURMUYOR.** `finish_reason: "stop"` + düz metin içeren geçerli bir OpenAI-uyumlu yanıt geldiğinde,
   opencode aynı isteği **saniyede onlarca kez, hiç bekleme/üst sınır olmadan** tekrar gönderiyor;
   her `step-finish` olayı `"reason":"unknown"`. **Bu, modelden bağımsız, ikiliye gömülü bir harness
   hatası** — repo içinden düzeltilemez.

   > **Kök neden kaynak kodunda bulundu + upstream issue açıldı (2026-09-17):**
   > `packages/opencode/src/session/prompt.ts` (`SessionPrompt.run`, ~satır 1111) döngü çıkış koşulu
   > `finish` değeri `"tool-calls"` VEYA `"unknown"` olduğunda kırılmıyor; `"unknown"` da
   > `packages/opencode/src/session/llm/ai-sdk.ts:23`'te AI SDK'nin döndürdüğü ama opencode'un kendi
   > `FinishReason` şemasında (`packages/llm/src/schema/ids.ts:39`) tanınmayan her değer için düşülen
   > varsayılan — kurum vLLM ucu gibi standart-olmayan bir `finish_reason` döndüren her backend'de
   > **her zaman** tetiklenir. Issue: **https://github.com/anomalyco/opencode/issues/49414**.
   > **Düzeltme:** "unknown"'ı tamamen hariç tutma listesinden çıkarmak yanlış çıktı — reponun kendi
   > test takımında bunu bilerek kapsayan bir test var (`"loop continues when finish is unknown"`,
   > tek seferlik "stream finish sinyali gelmedi" durumunu kurtarmak için). Asıl doğru düzeltme: ardışık
   > "unknown" denemesine sayaçlı bir üst sınır koymak (`MAX_UNKNOWN_FINISH_RETRIES`) — tek seferlik
   > kurtarma davranışı korunur, sonsuz tekrar kapanır. Draft PR: **https://github.com/anomalyco/opencode/pull/49418**
   > (yeni regresyon testiyle: düzeltmeden önce test 5 saniyede timeout ile fail, düzeltmeden sonra pass;
   > `bun test test/session/ test/agent/` → 463 pass/0 fail; `typecheck` + `oxlint` temiz). Takip: bu
   > issue/PR kapanırsa bu bölüm ve `SURUM-NOTLARI.md`'deki ilgili girişler güncellenmeli.

   Aşama 2'de doğrulanan ek bulgular:
   - **`agent.build.steps` bu hatayı durdurmuyor** — `steps=1`, `steps=5` ve steps hiç yokken üçünde de
     10 saniyede 86-138 istek arasında, fark yok. Bu yüzden config'e **eklenmedi** (yanıltıcı olurdu).
   - **`opencode 1.18.31`'de de aynı hata var** (npm'den indirilip test edildi): 10 saniyede 135 istek,
     aynı `"reason":"unknown"` imzası. **Sürüm yükseltmesi çözmüyor.**
   - **`OPENCODE_DISABLE_AUTOCOMPACT=1` + taban pencereyi aşıyor + backend isteği sessizce kabul
     ediyorsa (200 OK, boyut kontrolü yok):** opencode context-taşması hatası VERMEDEN doğrudan bu
     livelock'a düşüyor — ekranda hiçbir ilerleme/hata görünmez. Bu, Alp'in "hiç açılmadı" gözlemiyle
     örtüşüyor: TUI donmuş görünür çünkü arka planda sessizce saniyede onlarca istek atıyor.
   - **Backend isteği gerçekten reddederse (HTTP 400 `context_length_exceeded`):** opencode bunu doğru
     tanıyor (`ContextOverflowError`), 2 istekte temiz hata verip **çıkıyor** — bu YOLDA livelock YOK.
     Yani sonuç kurum vLLM'in davranışına bağlı: reddederse temiz hata, sessizce kabul ederse livelock.

**Bu pakette yapılan azaltmalar (kökü düzeltmez, alanı küçültür + tetiklenme ihtimalini azaltır):**
- `engine/opencode.json`: `permission.webfetch/task/todowrite = "deny"` (Aşama 1) — araç şeması
  ~%38 küçüldü.
- **Aşama 2:** varsayılan kurulum 38 → **9 çekirdek beceri**. Ölçüm (gerçek istek gövdesi,
  9 çekirdek vs 38 beceri, aynı 16384 pencere varsayımıyla):

  | | sistem mesajı (ham karakter) | istek gövdesi (bayt) | cl100k token tahmini | pencerenin % (16384) |
  |---|---|---|---|---|
  | 38 beceri (Aşama 1 sonu) | 28.705 | 47.031 | 14.633 | %89,3 |
  | 9 çekirdek beceri (Aşama 2) | 18.692 | 35.162 | 10.413 | %63,6 |
  | 0 beceri (teorik alt sınır) | 14.967 | 30.734 | 8.793 | %53,7 |

  **Açık kalan:** paketin hedefi olan "taban ≤ pencerenin %40'ı" bu ölçümle **tutturulamadı** —
  9 beceriyle bile %63,6'da, hatta sıfır beceriyle bile %53,7'de kalıyor (opencode'un kendi yerleşik
  sistem promptu + 7 zorunlu araç şeması + `AGENTS.md` tek başına pencerenin yarısından fazlasını
  yiyor, ve göreve dokunulmaması istendi). **%40 hedefi, 16384'lük bir pencerede matematiksel olarak
  ulaşılamaz** — bu yüzden Paket A'daki gerçek pencere tespiti kritik: pencere gerçekte örn. 32768 ise
  aynı taban oranı otomatik olarak ~%32'ye düşer.

  **Not (2026-09-15):** çekirdek liste 9 → **10**'a çıktı (`rapor-excel-pdf` eklendi, Excel/PDF çıktı
  talepleri için). Yukarıdaki ölçüm 9 becerilik eski listeyle yapıldı, yeniden ölçülmedi — oran hafifçe
  yükselir, sonuç yönü (**%40 hedefi bu pencerede tutturulamıyor**) değişmez.
- `engine/AGENTS.md`: "Tek adım disiplini", "Çalışma dizini boşsa", "Dosya arama" kuralları — modelin
  araç çağırmayıp plan metni üretme/tüm diski tarama ihtimalini azaltmayı hedefler; harness hatasını
  düzeltmez.
- `compaction.prune=true` (+ `reserved`/`preserve_recent_tokens`) artık `kur.sh` tarafından otomatik
  yazılıyor. **Etkisi bu ortamda izole ölçülemedi:** büyüyen-geçmiş senaryosunu simüle eden test,
  compaction eşiğine ulaşmadan **önce** yukarıdaki #2 livelock hatasına düştü (0 compaction olayı
  gözlendi) — yani hatanın kendisi o kadar agresif ki, compaction ayarının devreye girme şansı bile
  olmuyor adversarial senaryoda. `prune=true` yine de belgelenmiş, zararsız bir varsayılan olarak
  bırakıldı (eski tool çıktılarını budamak mantıken thrash'i azaltır), ama "kanıtlanmış çözüm" olarak
  sunulmuyor.

### Gerçek context penceresini ölçme — artık otomatik (Aşama 2, Paket A)
`kur.sh` artık kurulum anında `${KURUM_URL}/models`'e sorup `max_model_len` /`context_length` /
`max_context_length` / `context_window` alanlarından **otomatik tespit** ediyor ve `limit.context`'e
yazıyor (kaynağıyla birlikte ekrana basar). Tespit başarısız olursa `KURUM_MAX_CONTEXT` (env) kullanılır;
o da yoksa mevcut değer (`16384`) korunur ve sarı uyarı basılır. Elle doğrulamak istersen:
```bash
curl -sS "${KURUM_URL%/}/models" | python3 -m json.tool | grep -iE "max_model_len|context_length|context_window"
opencode debug config | grep -A3 '"limit"'
```

**Saha ölçümü (2026-09-16):** saha-sunucu.ornek.local'da kurulu config `limit.context=262144` (256K) gösterdi
(provider `kurum/qwen3.6-35b-a3b`) — yani kurum uçtaki otomatik tespit gerçekten çalışıyor ve varsayılan
`16384` şablon değerinin çok üzerinde bir pencere tespit ediliyor. Bu, yukarıdaki "%40 hedefi 16384'te
matematiksel olarak ulaşılamaz" bulgusunu da hafifletir: gerçek pencere 262144 ise taban bağlam oranı
otomatik olarak ~%4'e düşer (16 kat büyüme). Şablondaki `16384` değeri **bilinçli olarak değiştirilmedi**
— bu, kurum uca erişimi olmayan/ölçüm yapmamış bir kurulumda kullanılacak worst-case varsayımdır; gerçek
değer her zaman `kur.sh`'ın kurulum-anı tespitiyle ezilir.

### Dağıtım kontrolü (Vaka 2: saha-sunucu.ornek.local'da boş çalışma dizini)
`/root/ai/work/opencode-agent` gibi bir dizinin **boş olması normaldir** — `kur.sh`, `AGENTS.md`'yi ve
becerileri **global** `~/.config/opencode/`'a kurar, proje dizinine değil (yukarıdaki "3 adımda kurulum"a
bak: adım 3'te `cd` edilen dizin keyfi bir çalışma dizinidir, paketin kendisi değil). Yani **boş dizin
başlı başına "kurallar yüklenmedi" anlamına gelmez** — test ederken bunu doğrula:
```bash
ls ~/.config/opencode/AGENTS.md          # varsa: global kurallar kurulu
opencode debug skill 2>&1 | grep -c '"name"'   # 10 çekirdek beceri + yerleşikler
```
Eğer bu ikisi de boşsa/yoksa, o makinede **`kur.sh` hiç çalıştırılmamış** demektir — paket açılmış olsa
bile kurulum adımı atlanmış olabilir; `kur.sh`'ı çalıştır.

---

## Dizin kapsamı davranışı (Alp kuralı, 2026-09-11)

- Proje **içinde** okuma/arama serbest; **proje kökünün dışına çıkmak = izin ister** (`external_directory: "ask"`).
- `AGENTS.md`: açılışta çalışma dizinini duyur, `cd` ile başka klasöre geçme, kök dışında `find`/`grep`/`ls` yapma.
- **Sertleştirmek istersen:** `opencode.json` → `"external_directory": "deny"` (hiç sormaz, direkt engeller).
- Kabuk komutları yine sorar (`bash: { "*": "ask" }`); `rm -rf`, `mkfs`, force-push **deny**.

---

## Yanındaki kol: aider (fork)

```bash
cd /root/ai/aider
./kur.sh          # aider fork'unun KENDİ kurulumu (venv + paketler, birkaç dakika) — opencode ile ilgisi yok
aider             # ya da venv/bin/aider
```
- **İlk açılışta:** `/model-ekle` → kurum endpoint adresi + model + anahtar; sonrasında her dizinde düz `aider` yeter.
- **Modlar:** `shift+tab` → `⏸ plan` → `⏵ onay` → `⏵⏵ oto` (plan modu hiçbir dosyaya dokunmaz).
- Glif/kutu bozulursa: program içinde `/terminal-setup` ya da `AIDER_ASCII=1 aider`.
- Ayrıntılı kurulum: `/root/ai/aider/README.md` ("Kurulum" bölümü).

---

## Dosya düzeni

| Ne | Nerede |
|---|---|
| opencode ikilisi | `~/.opencode/bin/opencode` · kısayollar: `opencode` / `oc` (`/usr/local/bin` ya da `~/.local/bin`) |
| opencode ayarı | `~/.config/opencode/opencode.json` |
| kurallar | `~/.config/opencode/AGENTS.md` |
| beceriler | `~/.config/opencode/skills/<ad>/SKILL.md` (10 çekirdek beceri) |
| rg (ripgrep) | `~/.cache/opencode/bin/rg` (`kur.sh` `bin/ripgrep.tar.xz`'den kurar) |
| paket (kaynak dosyalar) | `/root/ai/opencode/` |
| kaynak klonu (çalıştırmak için gerekmez) | `/root/work/opencode` |
| aider fork + venv | `/root/ai/aider/` |

---
*Patron/Doktor · 2026-09-14 · opencode v1.18.30*
