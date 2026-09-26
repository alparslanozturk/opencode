# SÜRÜM NOTLARI — opencode ajan kiti

> **Güncel saha yüzeyi (2026-09-22):** **`./kur.sh`** TEK betiktir — parametresiz çağrı = `kur`
> (gerekirse derler, kurar, sonda kontrol raporunu basar); alt komutlar: `derle` · `kontrol` ·
> `yardim` (`-h`/`--help`). `01-derle.sh`/`02-kur.sh`/`03-kontrol.sh` kaldırıldı, üçü `kur.sh`
> içinde fonksiyon oldu. Aşağıdaki eski kayıtlarda geçen `alp-*`, `oc-*`, `01/02/03-*` ve önceki
> `kur.sh` anlamları **tarihseldir** — o günkü durumu anlatır.

## 2026-09-26 — kurulum: MobaXterm kopyalama + CI (A22 kararı, A14)

- **Kopyalama (A22, Alp kararı):** `./kur.sh` artık `~/.config/opencode/tui.json`'a `"mouse": false` yazar →
  seçimi terminal yapar, MobaXterm "copy on select" panoya gerçekten kopyalar. Bedel: TUI içinde fareyle
  kaydırma/tıklama yok. `mouse` zaten ayarlıysa dokunulmaz; istemeyen `ALP_TUI_FARE=1 ./kur.sh`.
  İkili değişmedi (sürüm 1.0.3 kalır) — yalnız `./kur.sh` yeniden çalıştırılır.
- **CI (A14):** `.github/workflows/alp-ci.yml` — her push/PR'da bash sözdizimi, shellcheck, kilit+audit
  testleri, maskeleme taraması (`script/maskeleme-tara.sh`, yeni). Derleme gerektiren duman testleri yerelde.
- **Açık:** upstream'den gelen 27 iş akışı fork'ta da çalışıyor (issue/PR kapatan botlar dahil, 102 çalıştırma);
  kapatılması Alp'e bırakıldı.

## 2026-09-26 — ürün 1.0.3: anahtar sızıntısı, audit doğrulayıcı, dürüst kopyalama bildirimi

Sahaya `./kur.sh` ile gider (sürüm 1.0.3 → yeniden derler).

- **A16 — anahtar `ps`'te görünmüyor:** kurulum sırasında kurum anahtarı `curl`/`python` komut satırına
  yazılıyordu (aynı makinedeki herkes `ps` ile görebilirdi); artık stdin/ortam değişkeninden gidiyor.
  Ek düzeltme: anahtarda `"` ya da `\` varsa curl onu sessizce kırpıyordu → kaçış eklendi.
- **C3 — `script/dogrula-audit-zinciri.sh`:** audit kayıtlarının silinip/değiştirilmediğini doğrular
  (döndürülmüş `.gz` dosyalar dahil); kopmayı `dosya:satır` ile gösterir. Salt-okunur.
- **A22 — "Copied to clipboard" yalanı:** pano aracı yoksa (MobaXterm + ssh) artık "başarılı" demiyor;
  yalnız terminal yolu (OSC 52) denendiyse **uyarı** gösteriyor, hiçbir yol yoksa hata. Sahada gerçek
  kopyalama için hâlâ bir karar bekleniyor (aşağıdaki not).
- **C4 — kapatıldı (gerek yok):** beceri listesinde çökme riski teorikti; beceri isimleri kayda girmeden
  doğrulanıyor (`skill/index.ts` `isSkillFrontmatter`). Çekirdeğe gereksiz yama yapılmadı.

- **Doğrulama düzeltmesi:** 24 Eylül'deki "1.18.32 duman testi geçti" kaydı yanlıştı — test derleme yapmadan
  eski `bin/opencode` (1.18.30) ile koşmuştu. 1.18.32 motorlu ikili ilk kez bugün derlendi (1.0.3):
  duman testi GEÇTİ, kilit senaryoları (K1 yetkisiz/CN'li, K5, K6, salt-okunur) aynı sonucu verdi.

> **Karar bekleyen (A22 devamı):** MobaXterm'de seçip kopyalamanın gerçekten çalışması için TUI'nin fare
> yakalamasını kapatmak gerekir (`~/.config/opencode/tui.json` → `"mouse": false`; seçim terminale kalır,
> MobaXterm "copy on select" çalışır). Bedeli: TUI içinde fareyle kaydırma/tıklama olmaz.

## 2026-09-24 — ürün 1.0.2: güvenlik kilitleri K1–K7 (ADR-0004)

Tek sayfa: `knowledge/policy/GUVENLIK-KILITLERI.md`. Sahaya `./kur.sh` ile gider (sürüm 1.0.2 → yeniden derler).

- **K1 değişiklik kilidi:** sunucuda/sistemde değişiklik yalnız sohbete yazılan yetkiyle —
  `CN: <no>` + `sunucular: …` · `KURULUM` + `sunucular: …` · `KRİZ` + kriz maili/toplantı notu +
  `sunucular: …`. Hedef listede değilse red. Bu makine için `localhost`. `YETKİ KAPAT` ile kapanır.
- **K2** dizin dışı onay sorar (vardı, korunuyor) · **K3** proje dosyalarını okumak onay sorar ("always" =
  o oturumda serbest) · **K4** izin listesi düzeltildi (`ss*`→`ssh`, `ps*`→`psql` açığı; `find -delete`,
  `hostname x`, `date -s`, `ip … del` artık sorulur).
- **K5** yıkıcı komutlar (`rm -rf /`-benzeri, mkfs, diske dd, force-push) yetkiyle bile çalışmaz ·
  **K6** ajan kendi ayarını/eklentisini/audit log'unu değiştiremez, anahtarı okuyamaz · **K7** varsayılan
  kilitli (gözlem modu: `OPS_AGENT_KAPI=GOZLEM`).
- Düzeltmeler: git'siz dizinde eklentinin kapsam denetimi çalışmıyordu (worktree `/`); `kur.sh` test
  dosyasını da eklenti klasörüne kopyalıyordu (artık `*.test.ts` hariç, eskisi silinir).
- Doğrulama: `audit-log.test.ts` 97 test; derlenmiş ikiliyle uçtan uca 6 senaryo; `duman-kontrol-rapor.sh` 22/22.

## 2026-09-24 — motor opencode 1.18.30 → 1.18.32 + upstream takibi (ADR-0003)

- Motor upstream **1.18.32**'ye alındı (ayrı `vendor:` commit'i). Bizim çekirdek yamalarımıza upstream
  dokunmamış; tek çakışma bir test dosyasıydı. Gelenler: TUI hata çıkış kodu, uzak ayar giriş hatası
  mesajı, AI SDK bağımlılık güncellemeleri. #49414 (sonsuz yeniden deneme) upstream'de hâlâ açık → yama duruyor.
- Yeni: `script/upstream-kontrol.sh` (rapor / `uygula`) + `knowledge/runbooks/upstream-guncelleme.md`.
  Kural: en fazla 2 sürüm geride; 2.x ana sürüm (upstream'de etiketli, npm `latest` değil) ayrı karar.
- Ürün sürümü (`kur.sh SURUM`) değişmedi; sahaya bir sonraki derlemeyle gider.

## 2026-09-23 — saha raporu & sürüm izlenebilirliği (T2 + T3 + T4)

Üçü de `kur.sh` içinde; kökte yeni dosya yok, yardımcılar `script/` altında.

**T2 — kontrol raporu her modda ≤29 satır.** İki uç tanımlıyken (`KURUM_URL_2`) rapor 33 satıra
çıkıyordu. Bilgi kaybı olmadan kısaltıldı:

- Bölüm ayracı + bölüm başlığı **tek satırda** birleşti (`bolum()`): `-- KURULUM (ag gerekmez) ---`.
  Hem KURULUM hem KURUM AI UCU bölümünde birer satır kazandı.
- Uç başlığı iki satırdan bire indi: `-- KURUM AI UCU · <url> ---` + `model: … · anahtar: … ·
  zaman asimi …`. (`ayar kaynagi` satırı `-a`'ya taşındı.)
- `DNS` ve `TCP` satırları tek `ag` satırında birleşti — aynı veri: çözümlenen IP'ler, port açık mı,
  tanımlı proxy değişkenleri.
- İki uç bloğu **4 satırdan 2 satıra** indi: ayraç kaldırıldı, iki uç **iki sütunda** tek satırda
  basılıyor, altında karar satırı. Uç başına veri korundu (erişim · model listede mi · bağlam ·
  3 ölçümün medyanı). Sütun taşarsa **yalnız host kısalır**, ölçüm sayıları hep görünür; iki ucun
  bağlam penceresi ayrıca karar satırına yazılıyor. Tam döküm (uç başına 3 satır) `--ayrintili`/
  yeni kısa yazımı **`-a`** ile.

**Ölçüm (sahte uçla, `wc -l`):** tek uçlu **25**, iki uçlu **27** satır — ikisi de ≤29. Ölçüm
`script/duman-kontrol-rapor.sh` içinde bir test olarak duruyor, elle sayılmıyor.

**T3 — çıktı (output) sınırı artık uçtan öğreniliyor.** `opencode.json`'daki `limit.output`
şablondan gelen sabit 4096'ydı. Sıra: (1) `/v1/models` alanları (`max_output_tokens`,
`max_completion_tokens`, `max_output_len`, `max_generated_tokens`, `max_tokens`, `output_limit`,
`limit.output`) → (2) **probe**: tek istek, `max_tokens` bilerek aşırı büyük; uç reddedip sınırını
hata mesajında söylerse oradan okunur → (3) `env` → `KURUM_MAX_OUTPUT` → (4) **güvenli varsayılan
4096**. Probe `stream: true` gider ve uç isteği kabul ederse akış ilk parçada kesilir (uçta uzun
üretim başlamaz); vLLM'in "maximum **context** length is N" mesajı bilerek eşleşmez — o sayı çıktı
sınırı değildir. Bulunan değer bağlam penceresini aşarsa kırpılır, 512'nin altındaysa yok sayılır.
**Sessizce sabit kalmaz:** kurulum hangi basamağın kazandığını `~/.config/opencode/kur-durum`
künyesine yazar, kontrol raporu da `ayar` satırında basar — fallback hâlinde
`cikti 4096 (uctan alinamadi → 4096)`. `env.example` **şablon kaldı** (yer tutucu `KURUM_MAX_OUTPUT`
satırı yorumlu); gerçek değer `env`/`env.local`'a yazılır.

**T4 — ikili ↔ sürüm ↔ commit (denetim bulgusu 3).** Derleme anında ikilinin yanına künye yazılıyor
(`bin/opencode.derleme`: `surum`/`kanal`/`commit`/`kirli`/`boyut`/`tarih`); kurulum onu ikiliyle
birlikte `~/.opencode/bin/`'e taşıyor. Rapor `ikili` satırında `surum … · commit … (=HEAD) ·
derleme <tarih> · HEAD …` gösteriyor. Tutarsızlıkta tek satırlık `surum !` uyarısı düşüyor:
ikili sürümü `kur.sh`'ın beklediğinden farklı · ikili commit'i repo HEAD'inden farklı · künye yok
(izlenemiyor) · künye başka ikiliye ait (boyut tutmuyor) · derleme anında çalışma ağacı kirliydi.
**Sağlam kurulumda bu satır basılmaz**, bütçe korunur. Künye `.gitignore`'da (yerel derleme çıktısı).

**Testler.** Yeni `script/duman-kontrol-rapor.sh` — sahte uç (`script/sahte-uc.py`, loopback) ile
22 durum: T3'ün dört basamağı (alan/probe/env/varsayılan) uçtan uca (`opencode.json` + künye +
rapor metni), T2 satır bütçesi `wc -l` ile (tek uç/iki uç), 100 sütun taşması, `-a` dökümü, uç
başına verinin korunduğu, T4'ün beş uyarı yolu + `kunye_yaz`. Her durum kendi geçici `HOME`'unda
koşar; gerçek `~/.opencode` ve `~/.config/opencode` değişmez. `kur.sh` `source` edilince ana akışı
çalıştırmıyor (`BASH_SOURCE`/`$0` kapısı) — fonksiyonlar derleme yapmadan sınanabiliyor.

**Doğrulama:** `bash -n kur.sh` temiz · `shellcheck -S warning` temiz · `script/smoke-ikili.sh`
geçti · `script/duman-kontrol-rapor.sh` 22/22 geçti.

**CANLI DOĞRULANMADI:** kurum ağına erişim yok. Gerçek kurum ucunda doğrulanmayanlar: (a) uçun
`/v1/models` yanıtında çıktı sınırı alanı **gerçekten var mı**, adı hangisi; (b) probe'un gerçek
uçtaki hata mesajı biçimi — kalıplar tutmazsa 4096'ya düşer ve rapor bunu yazar (sessiz sabit yok);
(c) iki uç karşılaştırmasının gerçek gecikme değerleri. Ölçülen satır sayıları sahte uçla alındı;
gerçek uçta satır **sayısı** değişmez (içerik uzunluğu değişir, kırpma devrede).

## 2026-09-22 — derlenmiş ikili çöküyordu: `splitting: false` (build.ts) — sürüm 1.0.1

**Sorun (Alp):** sahada `oc` hiçbir prompt gönderemiyordu — TUI'de `Failed to send prompt` /
`Unexpected server error`, log'da `TypeError: undefined is not an object (evaluating 'a.name')`
(stack: `resolve` → `map` (×3) → `SystemPrompt.environment`). Ayarla ilgisi yoktu: boş dizin, config'te
`references` bile yokken tetikleniyordu. `bun run packages/opencode/src/index.ts` ile **kaynaktan**
çalıştırınca hiç çökmüyordu — yalnız `bin/opencode` (derlenmiş tek-dosya ikili) çöküyordu.

**Kök neden:** `packages/opencode/script/build.ts`'deki `Bun.build(...)` çağrısı `splitting: true`
kullanıyordu. Bu ayar tarayıcı paketlerinde gecikmeli (lazy) chunk yüklemesi için var — tek dosyalık
`compile` çıktısında hiçbir faydası yok, ama dairesel import'ları ayrı chunk'lara bölüp değerlendirme
sırasını bozuyor: `core/src/location-services.ts`'deki `locationServices` (bir `LayerNode.group([...])`
dizisi, ör. `Reference.node`) elemanlarından biri, kendi modülü henüz tam başlatılmadan okunduğu için
`undefined` kalıyordu. `LayerNode.hoist`'in `resolve: (a) => replacementMap.get(a.name) ?? a`
fonksiyonu bu `undefined` düğümle çağrılınca `a.name` patlıyordu — ilk prompt gönderiminde
`SystemPrompt.environment` bu ağacı (referans listesi için) kurarken tetikleniyordu.

**Düzeltme:** `splitting: true` → `splitting: false` (`packages/opencode/script/build.ts`). Kod
değişmedi, yalnız derleme bayrağı. `kur.sh`'ın derleme adımı zaten bu dosyayı çağırıyor, başka bir
değişiklik gerekmedi.

**Doğrulama (bu koşumda gerçekten çalıştırıldı)**
- Aynı kaynağı `splitting: true`/`false` ile ayrı ayrı derleyip ikisini de minimal sahte sağlayıcı
  config'iyle (`{"provider":{"sahte":{...}}}`, boş dizin, git deposu değil) çalıştırdım:
  `splitting: true` → aynı `a.name` çökmesi birebir tekrarladı; `splitting: false` → çökme yok,
  istek modele kadar gitti (sahte uca `Cannot connect to API` — beklenen, uç zaten yok).
- Gerçek üretim derlemesi (`OPENCODE_VERSION=1.0.0 OPENCODE_CHANNEL=main bun run
  ./packages/opencode/script/build.ts --single --skip-embed-web-ui --skip-install`, `kur.sh`'ın
  kullandığı komutun aynısı): smoke test `1.0.0` geçti, `bin/opencode --version` → `1.0.0`,
  aynı repro komutu artık `a.name` hatası vermeden modele kadar gidiyor.
- `turbo typecheck` **çalıştırılmadı** (bilinen donma riski, bkz. `knowledge/incidents/2026-09-19-typecheck-donma.md`).

**Ayrıca (defansif koruma, aynı sürüm):** aynı çökmeyi başka bir yoldan (bozuk/eski config'teki
`reference` girdisi veya plugin dönüşümü) imkânsız kılan katman da eklendi — core config plugin'i
ve Reference materialize geçersiz girdiyi **uyarı loguyla** (hangi config dosyası + hangi anahtar)
eler; `SystemPrompt.environment` ve `Agent` ise `list()` çıktısındaki tanımsız/eksik alanlı kayıtları
atlar. Gerileme testleri: `packages/core/test/reference.test.ts` ve
`packages/opencode/test/session/system.test.ts` (düzeltmeden önce aynı `a.name` çökmesiyle
kırmızıydı).

**Sürüm:** asıl düzeltme `cca807db28` (`splitting: false` + sürüm 1.0.1), defansif koruma
`9ad34675c6` (bozuk `reference` girdisi guard'ı) — ikisi de aynı sürümde (1.0.1) birlikte gitti.
Olay kaydı: `knowledge/incidents/2026-09-22-derlenmis-ikili-a-name-cokmesi.md`.

Detay: `NASIL-CALISTIRILIR.md` → "Sorun giderme" tablosu.

## 2026-09-22 — ürün sürümü 1.0.0 (kanal `main`)

**Sorun (Alp):** saha ikilisinin `--version` çıktısı `0.0.0-main-202609221336` idi — kanal git
branch adından (`main`) geldiği için "preview" sayılıyor, sürüm tarih damgalı üretiliyordu.
*"Sürüm numarasını 1.0.0 yap iyi olmaz mı?"* → ürün sürümü **vendor sürümünden ayrıldı**: **1.0.0**.

**Ne değişti**
- `kur.sh` derleme adımı `build.ts`'i `OPENCODE_VERSION` + `OPENCODE_CHANNEL` ile çağırır; sabitler
  bölümünde **tek yer**: `SURUM` (varsayılan `1.0.0`) ve `KANAL` (varsayılan `main`). `bin/opencode
  --version` artık **`1.0.0`** basar.
- **Nasıl değiştirilir:** `OPENCODE_VERSION=1.0.1 ./kur.sh derle` ya da `env.local`'a
  `OPENCODE_VERSION=1.0.1` satırı ekleyip `./kur.sh` (kurulum akışı env'i okur, sabiti ezer).
- **Kanal bilerek `main` kalır:** `packages/core/src/database/database.ts` DB dosyası adını kanala göre
  seçiyor (`opencode-<kanal>.db`); kanal `latest` olursa sahadaki mevcut oturum verisi `opencode.db`'ye
  kayar (istenmiyor). `main` kalınca davranış aynıdır, yalnız sürüm 1.0.0 olur.
- **Sürüm uyuşmazlığı tetikleyicisi:** `kur.sh` artık `bin/opencode --version`'ı `SURUM` ile
  karşılaştırır — farklıysa (ya da sürüm okunamıyorsa) kendiliğinden yeniden derler. Sahada
  `al.sh` + `./kur.sh` yeterli, elle `ALP_DERLE=1` gerekmez.
- **Vendor/upstream değişmedi:** `package.json`'lar upstream `1.18.30`'da kalır — bunlar vendor
  sürümüdür; ürün sürümünü yalnız `kur.sh` içindeki `SURUM` satırı belirler.

**Doğrulama (bu koşumda gerçekten çalıştırıldı)**
- `bash -n` + `shellcheck -S warning` → 0 bulgu; `Script.version/Script.channel` çözümü `1.0.0 main`.
- Gerçek derleme (`ALP_DERLE=1 ./kur.sh derle --bin-kopyala`) → `bin/opencode --version` = `1.0.0`
  (build smoke test'i de `1.0.0`); ikinci `./kur.sh` koşumu derleme yapmadı
  ("hazır bin/opencode güncel"); `./kur.sh kontrol` `ikili` satırı `surum 1.0.0`, satır sayısı aynı.
- Uyuşmazlık tetikleyicisi: saha ikilisi taklit edilince (`--version` = `0.0.0-main-202609221336`)
  `0/4` adımı **"sürüm uyuşmuyor (kurulu: …, istenen: 1.0.0)"** ile yeniden derledi ve ikili
  kendiliğinden `1.0.0`'a döndü.

## 2026-09-22 — tek betik: `kur.sh <parametre>`; 01/02/03 kaldırıldı

**Sorun (Alp):** *"Tek kur.sh yap, parametre alsın, default parametre kurmak olsun. Diğer sh'ları sil."*

**Ne değişti**
- `01-derle.sh`, `02-kur.sh`, `03-kontrol.sh` **`git rm` ile silindi**; içerikleri `kur.sh` içine
  bash fonksiyonu olarak taşındı (`derle()` · `kur()` · `kontrol()`; ortak yardımcılar tek yerde).
  Kök dizinde `*.sh` olarak **yalnız `kur.sh`** kaldı.
- **Parametre düzeni (bayrak değil, alt komut):** parametresiz = `kur`; `kur` · `derle` · `kontrol` ·
  `yardim`/`-h`/`--help`; bilinmeyen parametre → dostça Türkçe hata + kullanım, çıkış kodu `2`.
- Seçenekler korundu ve kontrol aşamasına bağlandı: `--zaman-asimi <sn>` · `--ayrintili` ·
  `--url`/`--key`/`--model` (`kur`/varsayılan akışta verilirse kontrol aşamasına aktarılır).
- `env.example` artık **gerçek saha varsayılanlarını** taşıyor (`KURUM_URL` kurum adresi,
  `KURUM_KEY=***` yer tutucu, `MODEL_ID`; `KURUM_URL_2`/`KURUM_KEY_2`/`MODEL_ID_2` ve
  `KURUM_MAX_CONTEXT` yorum satırı) — `env` yoksa `kur.sh` onu otomatik oluşturur (izin 600).
- Davranış aynen korundu: env kapısı, node header tgz idempotentliği, hazır ikili yolu YOK
  (her zaman kaynaktan derlenir; `bin/ripgrep.tar.xz` korunur), kısayol tek sahibi kurulum,
  kontrol ekranı ≤30 satır + iki uç karşılaştırması (`KURUM_URL_2`), kurulum çıkış kodunu kontrol
  bulguları bozmaz.
- Dokümanlar 01/02/03 referanslarından arındırıldı (`ALP-README.md`, `NASIL-CALISTIRILIR.md`
  — parametre tablosu + "env oluşturma adımı gerekmez" notu —, `MIMARI.md`, `DENEYIM-AKTARIM.md`,
  `docs/CC-GECIS-KARTI.md`, `engine/`, `knowledge/`, `env.example`, `.gitignore`).

**Doğrulama (bu koşumda gerçekten çalıştırıldı)**
- `bash -n` tüm `*.sh` temiz; `shellcheck -S warning` → 0 bulgu.
- İzole `HOME` + geçici kopya: `./kur.sh yardim` → kullanım; bilinmeyen parametre → hata + çıkış 2;
  `env` yokken `./kur.sh` → `env` `env.example`'dan oluştu (izin 600), çıktıda anahtar yok.
- İki yerel sahte uçla (biri yapay gecikmeli) `./kur.sh kontrol`: karşılaştırma bloğu + "daha hızlı"
  karar satırı doğru; `KURUM_URL_2` yokken blok hiç basılmıyor. Gerçek kurum ucuna istek atılmadı,
  derleme yapılmadı.

## 2026-09-22 — saha yüzeyi `./kur.sh`, hazır ikili yolu kaldırıldı

**Sorun (Alp):** *"tek giriş `./kur.sh` olsun; binary durmasın, kaynaktan derliyoruz; env'i sahada elle yazmayalım."*

**Ne değişti**
- **`./kur.sh` saha komutu oldu.** `02-kur.sh` iç uygulama adımı olarak kalır; kurulum bitince
  bayraksız `03-kontrol.sh` raporu basılır.
- **Hazır ikili arşiv/indirme yolu kaldırıldı.** Çözümleme sırası artık yalnız:
  `bin/opencode` varsa kullan → yoksa `01-derle.sh` ile kaynaktan derle.
- `env` yoksa ve `env.local` varsa `env.local` → `env` kopyalanır, izin `600` yapılır. İkisi de yoksa
  dostça hata verilir; kontrol raporu çağrılmaz.
- `node-v24.19.0-headers.tar.gz` **repoya alınır** (sahada ağ yok, kaybolmasın). `.gitignore` artık
  yalnız *açılan* ağacı dışlar: `/node-v[0-9]*/` + `/node-v*-headers` (dizin ya da bağ).
- `01-derle.sh` derleme öncesi header ağacını hazırlar. **Dikkat:** resmi arşiv `node-v24.19.0/`
  dizinine açılır (içinde `include/node/`), adında `-headers` **geçmez**; node-gyp ise sahada
  `node-v24.19.0-headers` adını bekliyor. Betik bu yüzden arşivi açar ve `-headers` adını o dizine
  **symlink** ile bağlar — sahada elle konulmuş gerçek `node-v24.19.0-headers/` dizinine **dokunmaz**.
  Hazırsa tekrar açmaz (idempotent); hata olursa **tek satır uyarı** verip kuruluma devam eder.

## 2026-09-22 — betik adları **numaralandı**: `01-derle.sh` · `02-kur.sh` · `03-kontrol.sh`

**Sorun (Alp):** *"Başına alp yerine 01-derle yaz bari."* — Kişi adı ön eki (`alp-`) saha akışı
hakkında hiçbir şey söylemiyordu; `ls` çıktısı alfabetik sıralıyordu (`alp-derle` → `alp-kontrol`
→ `alp-kur`), yani **yanlış** sırayı gösteriyordu.

**Ne değişti (yalnız adlandırma — davranış birebir aynı):**
- `alp-derle.sh` → **`01-derle.sh`** · `alp-kur.sh` → **`02-kur.sh`** · `alp-kontrol.sh` →
  **`03-kontrol.sh`** (`git mv`, geçmiş korundu). `ls` artık akış sırasını gösteriyor.
- Yönlendiriciler güncellendi: `kur.sh` → `./02-kur.sh`, `oc-teshis.sh` → `./03-kontrol.sh`,
  `oc-dogrula.sh` → `./03-kontrol.sh --kurulum`. Repoya `alp` adlı yeni dosya **eklenmedi**;
  daha eski `alp.sh` depoda zaten yok (sahada rsync'ten kalan kopya varsa yok sayılır).
- Dokümanlarda `alp-*` geçişlerinin tamamı yeni adlara çevrildi (`ALP-README.md`,
  `NASIL-CALISTIRILIR.md`, `MIMARI.md`, `DENEYIM-AKTARIM.md`, `docs/`, `knowledge/`, `engine/`,
  `env.example`, `.gitignore`). Bu dosyadaki **eski kayıtlar** tarihçe olduğu için olduğu gibi
  bırakıldı (yukarıdaki not).
- Saha akışı tek komut olarak aynı: `al.sh` → **`./02-kur.sh`** → **`./03-kontrol.sh`**.

**Doğrulama (bu koşumda gerçekten çalıştırıldı)**
- `bash -n` tüm `*.sh` temiz; `shellcheck -S warning *.sh` → **0 bulgu**.
- İzole `HOME` + izole `KISAYOL_DIZIN`: ikili **yokken** parametresiz `./02-kur.sh` derledi + kurdu
  (çıkış 0); hemen ardından ikinci koşum derleme yapmadan yalnız kurdu (çıkış 0).
- Parametresiz `./03-kontrol.sh`: tek ekran, sonda tek satır `SORUN:`, anahtar maskeli, çökme yok.
- Eski adlarla çağrı (`./kur.sh`, `./oc-teshis.sh`, `./oc-dogrula.sh`) yeni betiğe yönleniyor.
- Ağır turbo typecheck **çalıştırılmadı** (bilerek — bkz. 2026-09-19 donma olayı).

## 2026-09-22 — **bayraklar kaldırıldı**: parametresiz tek komut (`./alp-kur.sh`)

**Sorun (Alp):** *"scriptlerin parametre almasına gerek yok; zaten amaç kurmak :-) Ne gerekçeyle
`--derle` ekledin? Zaten build + setup yapmasını bekliyorum."* — Kullanıcıya dönük bayrak listesi
(bkz. bir alttaki kayıt) sahada öğrenilmesi gereken bir yüzeydi; kararı betiğin kendisi vermeliydi.

**Ne değişti**
- **`./alp-kur.sh` bayrak almaz.** Parametresiz çağrı tam işi yapar: (gerekirse) derler → kurar
  (ayar + kurallar + beceri + plugin + rg) → kısayolu düzeltir → doğrular → **tek ekran özet**
  ("HAZIR — çalıştır: ..." ya da "HAZIR DEĞİL").
- **Derleme kararı otomatik:** `bin/opencode` yok → (paketten aç / kaynaktan derle); kaynak ağacı
  (`packages/opencode/src|script`, `package.json`, `bun.lock`) ikiliden **yeni** → yeniden derle;
  aksi halde derleme yok, yalnız kurulum (**~1.4 sn** ölçüldü). Derleme başarısız olur ama elde
  ikili varsa kurulum eski ikiliyle devam eder ve bunu açıkça söyler.
- **Kısayol çakışması artık soru sormuyor:** `opencode`/`oc` başka bir hedefi gösteriyorsa
  `.bak-<tarih>` olarak yedeklenir ve doğru ikiliye çevrilir (eski davranış: uyarıp dokunmamak +
  `--baglanti-zorla` istemek). Ayrıca PATH'te **önce** gelen başka bir `opencode` varsa uyarı basar.
- **`./alp-kontrol.sh` bayraksız çağrıda TÜM raporu verir:** önce KURULUM (ağ gerekmez), sonra
  KURUM AI UCU; tek ekran (**29 satır** ölçüldü, ≤100 sütun), sonda tek satır `SORUN:`, anahtar maskeli.
  `--ayrintili` gelişmiş seçenek olarak duruyor; `--kurulum`/`--uc` yalnız **iç** kullanımdır
  (`alp-kur.sh` kurulum sonrası doğrulamada `--kurulum` çağırır — ağ beklemesin diye).
- **`alp-derle.sh` sadeleşti:** kullanıcıya dönük `--kisayol` bayrağı kaldırıldı (kısayolun tek
  sahibi `alp-kur.sh`); dosya başlığında "İÇ DETAY — KULLANICI BUNU ÇAĞIRMAZ" yazıyor.
- **Gizli kaçış kapıları** (dokümanda yok, yalnız ayıklama için ortam değişkeni): `ALP_DERLE=1`,
  `ALP_DERLEME_YOK=1`, `ALP_TUM_BECERILER=1`, `ALP_DERLE_EK="..."`, `KISAYOL_DIZIN`.
- **Dokümanlar:** akış her yerde `al.sh` → **`./alp-kur.sh`** → **`./alp-kontrol.sh`**; bayrak
  tabloları kaldırıldı (`ALP-README.md`, `NASIL-CALISTIRILIR.md`, `MIMARI.md`, `docs/`, `knowledge/`).
  Yan düzeltme: aider fork'unun kendi `kur.sh`'ına giden iki atıf yanlışlıkla `alp-kur.sh` diye
  yeniden adlandırılmıştı — geri düzeltildi.

**Doğrulama (bu koşumda gerçekten çalıştırıldı)**
- İzole `HOME` + izole `KISAYOL_DIZIN`, sahte kaynak ağacı: ikili **yokken** parametresiz
  `./alp-kur.sh` derledi + kurdu (çıkış 0); ikili **güncelken** derlemedi; kaynak dosyaya `touch`
  sonrası yeniden derledi.
- Gerçek depoda parametresiz koşum: kaynak ağacı ikiliden yeni olduğu için **gerçekten derledi**
  (`alp-derle.sh`, 140 MB ikili), kurdu, doğruladı, çıkış 0. Hemen ardından ikinci koşum: derleme
  yok, **1.4 sn**, çıkış 0 (derleme döngüsüne girmiyor).
- Kısayol çakışması: `opencode → /bin/true`, `oc → /bin/false` iken parametresiz koşum ikisini de
  `.bak-20260922-…` olarak yedekleyip doğru ikiliye çevirdi.
- `./alp-kontrol.sh` parametresiz: 29 satır, sonda `SORUN:`, anahtar `dummy (yer tutucu)` diye
  maskeli. Hiç kurulum yapılmamış boş `HOME` ile de çökmedi (`SORUN: kurulum yapilmamis`).
- `./alp-kur.sh --derle` gibi bir çağrı artık **çıkış 2** + "bayrak almaz" mesajı veriyor.
- `bash -n` temiz; `shellcheck -S warning alp-kur.sh alp-kontrol.sh alp-derle.sh` → **0 bulgu**.
  Ağır turbo typecheck **çalıştırılmadı** (bilerek — bkz. 2026-09-19 donma olayı).

## 2026-09-21 (üçüncü tur) — saha yüzeyi **2 betiğe** indi: `alp-kur.sh` + `alp-kontrol.sh`

**Sorun (Alp):** *"`oc-teshis.sh` nedir? `kontrol.sh` ile iki ayrı script aynı şeyi yapıyor galiba.
Onu da tek bir script yap. Hatta şöyle olsun: `alp-kur.sh`, `alp-kontrol.sh` olsun."* — Sahada
kontrol için **iki ayrı betik** (`oc-teshis.sh` = uç teşhisi, `oc-dogrula.sh` = kurulum doğrulaması)
vardı; hangisinin ne yaptığı her seferinde yeniden anlatılıyordu.

**Ne değişti:**
- **Kullanıcıya görünen yüzey TAM 2 betik:**
  - **`alp-kur.sh`** (eski `kur.sh`) — tek kurulum/derleme girişi. Tüm bayraklar aynen çalışıyor
    (`--derle`/`--kaynak`, `--derleme-yok`, `--baglanti-yok`, `--baglanti-zorla`, `--tum-beceriler`,
    `--ikili-indir`, `-- <iç bayraklar>`).
  - **`alp-kontrol.sh`** (eski `oc-teshis.sh` + `oc-dogrula.sh`) — tek kontrol betiği.
    Varsayılan = kurum AI ucu teşhisi; **`--kurulum`** = kurulum doğrulaması (eski `oc-dogrula.sh`);
    **`--ayrintili`** = kırpmasız uzun rapor.
- **`alp-derle.sh`** (eski `alp.sh`) — iç detay/derleyici; `alp-kur.sh` çağırır, elle çalıştırılmaz.
- **Tek ekran sözleşmesi (Alp'in isteği: "tek bir ekranda tüm sorunu göstersin"):**
  `alp-kontrol.sh` raporu **≈16 satır**, **≤100 sütun** — uzun URL/gövde kırpılır, satır sarması yok.
  Sonda tek satırlık **`SORUN:`** bloğu kök nedeni kanıtıyla söyler: `uc erisilemiyor (TCP ...)` ·
  `MODEL_ID ucta yok — <id>` · `/chat/completions HTTP <kod> — <gövde>` · `stream calismiyor (...)` ·
  `uc tool_call kabul etmiyor (HTTP <kod>)` · `yok — uc saglikli, sorun opencode tarafinda; log: ...`.
  Anahtar **her zaman maskeli**. Çıkış kodu: `0` sorun yok, `1` sorun var.
- **Uç teşhisine eklenenler:** opencode log dizinindeki son `err_`/`ERROR`/`FATAL` satırı raporda
  (sağlıklı uçta "sorun opencode tarafında" derken elde kanıt olsun diye).
- **Kurulum moduna eklenenler:** `env` dosyası (varlık + 3 satır dolu mu + izin 600), kurulu
  `opencode.json` izni, kısayolun doğru hedefi gösterip göstermediği.
- **Düzeltilen yanlış pozitif:** kurulu `opencode.json` karşılaştırması model **sözlük anahtarını**
  (`kurum-model`) `MODEL_ID` ile kıyaslıyordu; kurulum doğruyken bile "model kimligi env ile ayni
  DEGIL" uyarısı basıyordu. Artık `models.<anahtar>.id` alanı karşılaştırılıyor.
- **Eski adlar:** `git mv` ile taşındı (geçmiş korundu). `kur.sh` / `oc-teshis.sh` / `oc-dogrula.sh`
  yerine 2-3 satırlık **yönlendirici** bırakıldı (uyarı basıp yeni betiği çalıştırır) — `al.sh`'ın
  rsync'i sahada eski kopyaları bırakabildiği için; istenirse silinebilirler.
- **Dokümanlar:** `ALP-README.md`, `NASIL-CALISTIRILIR.md` ("Sahada kullanıcıya görünen TAM 2 KOMUT"
  kutusu + "Saha kurulumu" + "Teşhis"), `MIMARI.md`, `docs/`, `knowledge/` → tek akış:
  **`al.sh` → `./alp-kur.sh` → `./alp-kontrol.sh`**.

**Doğrulama (gerçek koşum, izole `HOME`):**
- `alp-kur.sh --derleme-yok` → kurdu, sonda `alp-kontrol.sh --kurulum` çalıştı, "kurulum saglam", çıkış 0.
- `alp-kontrol.sh` sahte uca karşı 5 senaryoda koşuldu — **sağlıklı** (çıkış 0), **MODEL_ID uçta yok**,
  **chat HTTP 500**, **stream bozuk (SSE yok)**, **tool_call reddi** — hepsinde doğru `SORUN:` satırı.
- Erişilemez uç (DNS çözülmeyen host) ve kapalı TCP portu: çökmedi, doğru teşhis, çıkış 1.
- Her koşumda rapor **16-18 satır**, **en uzun satır 100 sütun**, anahtar sızıntısı **0**.
- `bash -n` temiz; `shellcheck -S warning alp-kur.sh alp-derle.sh alp-kontrol.sh kur.sh oc-teshis.sh
  oc-dogrula.sh` → **0 bulgu**.

**Kapanış koşumu (2026-09-22) — commit öncesi son doğrulama:**
- `bash -n` (6 betik + `script/safe-concurrency.sh`) temiz; `shellcheck -S warning *.sh script/*.sh`
  → **0 bulgu**. Ağır `turbo typecheck` bilerek **koşulmadı**.
- İzole `HOME` + izole `KISAYOL_DIZIN` ile **parametresiz `./alp-kur.sh`** uçtan uca: hazır
  `bin/opencode` kullanıldı (derleme yok) → ikili/ayar/10 beceri/plugin/rg/kısayol kuruldu → sonda
  `alp-kontrol.sh --kurulum` "kurulum saglam", **çıkış 0**.
- **Parametresiz `./alp-kontrol.sh`** (erişilemez uca karşı): **15 satırlık tek ekran**, doğru
  `SORUN: uc erisilemiyor (TCP ...)`, çıkış 1. `--ayrintili` kırpmasız rapor veriyor, anahtar
  `sk-****89 (uzunluk: 29)` diye **maskeli**. Üç yönlendirici (`kur.sh`, `oc-teshis.sh`,
  `oc-dogrula.sh`) uyarı basıp doğru hedefi çalıştırıyor.
- **Gözden kaçan eski ad referansları düzeltildi:** `env.example` (2 yer), `.gitignore` (2 yer) ve
  `engine/plugins/logrotate.d/ops-agent-audit` hâlâ `kur.sh` diyordu → `alp-kur.sh`. Kalan `kur.sh` /
  `alp.sh` / `oc-*.sh` geçişlerinin tamamı artık yalnız **tarihçe/"taşındı"** bağlamında.
- Bayraklar (`--derle`, `--derleme-yok`, `--baglanti-zorla`, …) bu koşumda **bilerek korundu** —
  parametresiz sadeleştirme ayrı bir iş.

## 2026-09-21 (ikinci tur) — `kur.sh` tek giriş noktası oldu; kısayol çakışması bitti

**Sorun (Alp):** *"Niye iki tane kurulum dosyası var?"* — `alp.sh` derleyip `/usr/local/bin/opencode`'u
**repo dist ikilisine**, `kur.sh` ise aynı kısayolu **`~/.opencode/bin/opencode`**'a bağlıyordu. İkisi de
aynı adı sahiplendiği için **son çalışan kazanıyor**, hangi ikilinin çalıştığı belirsiz kalıyordu
(sahadaki `NOT: onceki kisayol degistirildi` satırının sebebi).

**Ne değişti:**
- **`kur.sh` = tek giriş noktası.** `bin/opencode` yoksa ve kaynak ağacı varsa (`bun.lock` +
  `packages/opencode` + `alp.sh`) **kendisi derler** (`alp.sh --bin-kopyala`), sonra her zamanki
  kurulumu yapar (ayar + beceri + plugin + ripgrep + kısayol) ve `oc-dogrula.sh` ile doğrular.
  Güncel davranışta hazır ikili arşivi/indirmesi yoktur; ikili yoksa **kaynaktan derleme** yolu kullanılır.
- **Yeni bayraklar:** `--derle` / `--kaynak` (ikili olsa bile yeniden derle), `--derleme-yok`
  (derlemeyi hiç deneme), `-- <bayraklar>` (`--` sonrası her şey `alp.sh`'a aktarılır, ör.
  `./kur.sh --derle -- --ignore-scripts`). Çelişkili kombinasyon (`--derle --derleme-yok`) hata verir.
- **Tek sahip kuralı:** kısayolu (`opencode`, `oc`) yalnız `kur.sh` kurar → `~/.opencode/bin/opencode`.
  `alp.sh` varsayılan olarak **kısayol kurmaz** (gerekirse `./alp.sh --kisayol`, o da artık uyarı basıyor).
- **Sonda net özet:** `derlendi / kuruldu / doğrulandı` satırları + kısayol sahibi + çalıştırılacak komut.
- **Küçük düzeltme:** `--ikili-indir` ile `--baglanti-yok` artık çelişkili sayılmıyor — `--baglanti-yok`
  "kısayol kurma" demek, "ağ yok" demek değil; eskiden bu ikisi birlikte verilince indirme sessizce
  atlanıyordu.
- **Dokümanlar:** `ALP-README.md`, `NASIL-CALISTIRILIR.md` ("Saha kurulumu" artık `al.sh` → **`kur.sh`**),
  bu dosya. `alp.sh` her yerde "iç detay / derleyici" olarak geçiyor.

**Doğrulama (gerçek koşum, izole `HOME` ile — tahmin yok):**
- `bin/opencode` **yokken** `./kur.sh` → alp.sh ile derledi (135 MB), kurdu, `oc-dogrula.sh` "paket sağlam", çıkış 0.
- `bin/opencode` **varken** `./kur.sh --tum-beceriler` → derlemedi, 38 beceri kurdu, çıkış 0.
- `--derle -- --kurulum-yok` → zorla derledi, `bun install` atlandı (aktarım çalışıyor).
- `--derleme-yok` + ikili yok → net hata, çıkış 1. `--ikili-indir` (yerel `file://` asset ile) → indirdi, derlemedi.
- `--baglanti-yok` → kısayol kurulmadı; `./alp.sh --kisayol` → yalnız istendiğinde kısayol kurdu.
- Sistemin gerçek `/usr/local/bin/opencode` kısayolu testler boyunca **değişmedi**.
- `bash -n` temiz; `shellcheck -S warning kur.sh alp.sh oc-dogrula.sh` → **0 bulgu** (kalan bulgular
  info düzeyinde ve önceden de vardı: SC1091 `env` source, SC2012 `ls | wc -l`).

## 2026-09-21 — Offline (saha) derleme çalışır hâle getirildi: `alp.sh` + models.dev snapshot

**Sorun (Alp, <saha-makinesi>):** kaynaktan derleme iki yerde duruyordu — (1) `bun install`, npm **dışı** iki
bağımlılığı çekemiyordu (`pkg.pr.new/@solidjs/start`, `github:anomalyco/ghostty-web`), (2) `bun run build`
`https://models.dev/api.json`'a bağlanmaya çalışıp ECONNRESET ile ölüyordu.

**Ne değişti:**
- **`alp.sh` yeniden yazıldı** — artık **yalnız derler** (içindeki `git pull` kaldırıldı; senkron `al.sh`'ın
  işi, saha makinesinde git kaynağı yok). bun'ı PATH dışında da bulur, `bun install --filter="./packages/opencode"`
  ile **yalnız CLI workspace'ini** kurar (2708 → 1000 paket; web/console paketlerinin npm dışı bağımlılıkları
  hiç çözülmez), `build.ts --single --skip-embed-web-ui --skip-install` ile derler, `/usr/local/bin/opencode`
  (yazılamazsa `~/.local/bin`) symlink'ini kurar. Bayraklar: `--bin-kopyala`, `--kurulum-yok`, gerisi
  `bun install`'a aktarılır. Kurum registry'si/hostname'i **betiğe girmedi** — o, `~/.bunfig.toml`'da kalır.
- **`packages/opencode/script/generate.ts`**: sıra artık `MODELS_DEV_API_JSON` → canlı `fetch`
  (30 sn zaman aşımı + JSON doğrulaması) → **repodaki snapshot**. Online davranış aynı, ağsız makinede
  build artık durmuyor.
- **`packages/opencode/script/models-dev-api.json`** (4.7 MB, 222 sağlayıcı, 2026-09-21) repoya eklendi;
  tazelemek: `curl -sSf https://models.dev/api.json -o packages/opencode/script/models-dev-api.json`.
- **Dokümanlar:** `NASIL-CALISTIRILIR.md` → yeni "🛠️ Saha kurulumu (<saha-makinesi>, offline)" bölümü
  (adım adım `al.sh` → `alp.sh`, `~/.bunfig.toml` örneği, iki sorunun kök nedeni + çözümü, doğrulama
  çıktısı); `ALP-README.md` dosya tablosuna `alp.sh` eklendi.

**Doğrulama (tahmin yok):** boş bun önbelleği + `pkg.pr.new`/`api.github.com`/`github.com`/`models.dev`
karartılmış mount namespace'inde tam koşum — `1000 packages installed [20.65s]`, derleme+smoke test
geçti, 135 MB ikili; `bun.lock` değişmedi, `ghostty-web`/`@solidjs/start` hiç kurulmadı; ikili ağı
tamamen kapalı ortamda (`unshare -n`) model listesini bastı.

## 2026-09-16 — Paket sadeleştirmesi: bin/ git'ten çıkarıldı + beceri parkı (Alp kararları)

**Ne değişti (`faz0-yuzeye-getir` branch, `notlar/FAZ0-KARARLAR-RAPORU.md`):**
- **Hazır opencode ikilisi git izlemesinden çıkarıldı** (`git rm --cached`,
  `.gitignore`'da zaten `bin/` vardı) — dosya **diskte kaldı**, yalnız git geçmişine yeni commit
  girmiyor. `bin/ripgrep.tar.xz` ise saha `rg` kurulumu için izlenen paket olarak kaldı.
- **Beceriler sadeleştirildi:** `knowledge/skills/approved/` 38 → **10 çekirdek** (kur.sh `CORE_SKILLS`
  ile birebir); kalan 28 beceri **silinmeden** `knowledge/skills/parked/`'a taşındı (`git mv`, bkz.
  `parked/README.md`). `kur.sh --tum-beceriler` approved/+parked/ birlikte kurar (toplam hâlâ 38).
- **Gerçek kurum hostname'i genelleştirildi:** `engine/AGENTS.md`'deki gerçek iç bulut hostname'i →
  çalışan ağaçta `dahili-bulut.ornek.local` (geçmişte kalan blob'lar rewrite edilmedi — bilinçli
  karar, repo private tutulmalı; **bu changelog satırının kendisi eskiden gerçek adı tekrar yazıyordu
  — 2026-09-17 denetiminde (Patron) fark edildi, burada da genelleştirildi**).
- `bash` audit maskelemesi: boşlukla ayrılmış CLI bayrakları (`--apiKey sk-...`) artık maskeleniyor
  (`engine/plugins/audit-log.ts` `INLINE_SECRET_RE`).

## 2026-09-15 — Çekirdek becerilere Excel/PDF eklendi (9 → 10)

**Ne değişti:**
- **`kur.sh`**: `CORE_SKILLS` dizisine `rapor-excel-pdf` eklendi (varsayılan kurulum 9 → **10 çekirdek
  beceri**); `--tum-beceriler` yorumundaki eski "6-10" ifadesi gerçek sayıyla ("10") hizalandı.
- **`oc-dogrula.sh`**: kurulu beceri sayısı satırındaki "6-10" metni "10" olarak güncellendi (asıl sayım
  zaten dinamik, `find | wc -l` ile yapılıyor — bu yalnız etiket metniydi).
- **Dokümanlar**: `NASIL-CALISTIRILIR.md`, `README.md`, `docs/PROJE-YAPISI.md` içindeki varsayılan
  beceri sayısı referansları 9 → 10'a güncellendi.
- Gerekçe: Alp envanter/rapor işlerinde Excel (xlsx) ve PDF çıktısı istiyor; beceri kurulu olmayınca
  agent bunu bilmiyor ve devreye giremiyor. `rapor-excel-pdf` paket içinde zaten vardı, yalnız
  `CORE_SKILLS` listesinde eksikti.
- Rapor: `notlar/EXCEL-PDF-RAPOR.md`.

## 2026-09-15 — Aşama 2: "kur ve çalıştır" + kalıcı sertleştirme (A-J paketleri)

**Ne değişti:**
- **`kur.sh`**: `${KURUM_URL}/models`'ten bağlam penceresini otomatik tespit edip `limit.context` +
  `compaction` (prune/reserved/preserve_recent_tokens) yazıyor (env `KURUM_MAX_CONTEXT` yedek yol);
  varsayılan kurulum 38 → **9 çekirdek beceri** (`--tum-beceriler` ile hepsi); `bin/ripgrep.tar.xz`'den
  `~/.cache/opencode/bin/rg` kuruyor (opencode'un grep/glob araçlarının beklediği tam yol — kurum ağında
  ağdan indirilemediği için `ripgrep execution failed` hatasının kaynağıydı); kurulum sonunda çalışma
  dizini rehberliği içeren tek ekranlık özet basıyor.
- **`engine/opencode.json`**: `default_agent: build`; `agent.plan.permission` (`edit`/`bash`: `deny`,
  Plan artık gerçekten yalnızca planlıyor); `permission.bash`'e 37 salt-okunur allow kalıbı eklendi
  (`ls*`, `cat*`, `git status*`, `find*`, ... — resmi opencode dokümanındaki "last matching rule wins"
  kuralına göre `"*": "ask"` başta, spesifik kalıplar sonra). `agent.build.steps` **denendi ve
  kaldırıldı** — livelock hatasını durdurmadığı ölçüldü (bkz. aşağı).
- **`engine/AGENTS.md`**: mutlak "ssh/kubectl YOK" yasağı kaldırıldı, yerine hiyerarşi ("kullanıcı açıkça
  isterse serbest, aksi halde salt-okunur") + gerçek envanter yolları (`~/ansible/hosts-*.ini`,
  `KUBECONFIG`, dahili-bulut kısıtı) + "izinler burada tanımlanmaz, opencode.json'da" netleştirmesi +
  "tüm dosya sistemini tarama, @explore kullan" kuralı eklendi.
- **`oc-dogrula.sh`**: rg kontrolü, kurulu/toplam beceri sayısı ayrımı, `limit.context`/`compaction`/
  `default_agent`/`steps` özeti, tek ekranlık ÖZET bloğu eklendi (7 adım).
- Rapor: `notlar/ASAMA-2-RAPOR.md`.

**Ölçülen sonuçlar (gerçek istek gövdesi + `tiktoken cl100k_base` proxy tokenizer, 16384 pencere varsayımıyla):**
- Taban bağlam: 38 beceri **%89,3** → 9 çekirdek beceri **%63,6** (hedef olan "≤%40" bu pencerede
  **matematiksel olarak ulaşılamaz** — 0 beceriyle bile %53,7; asıl kaldıraç gerçek pencerenin
  16384'ten büyük olması, bu yüzden otomatik tespit kritik).
- `agent.build.steps` (1/5/steps yok, 3 ayrı test): **livelock'u durdurmuyor** — hepsinde 10 saniyede
  86-138 istek. Config'e eklenmedi.
- `opencode 1.18.31` (npm'den indirilip test edildi): **aynı hata var** (135 istek/10sn) — sürüm
  yükseltmesi çözmüyor.
- `OPENCODE_DISABLE_AUTOCOMPACT=1` + taban pencereyi aşıyor: backend isteği sessizce kabul ederse
  (200 OK) **hata vermeden livelock'a düşüyor** (Alp'in "hiç açılmadı" gözlemini açıklıyor); backend
  gerçekten reddederse (HTTP 400) opencode temiz `ContextOverflowError` ile 2 istekte çıkıyor.
- `compaction.prune`: izole ölçülemedi — test senaryosu compaction eşiğine ulaşmadan önce livelock
  hatasına düştü (0 compaction olayı). Zararsız varsayılan olarak bırakıldı, kanıtlanmış çözüm olarak
  sunulmuyor.

## 2026-09-15 — Compaction thrash düzeltmesi (Vaka 1 + Vaka 2)

**Ne değişti:**
- `engine/opencode.json`: `permission.webfetch/task/todowrite = "deny"` — baseline araç şeması
  21.1K → 13.1K karakter (ölçülen, ~%16 bağlam kazancı); `task` alt-agent'ların iç içe thrash riskini
  kapatır, `webfetch` zaten "dış ağa veri gönderme yok" kuralıyla çelişiyordu.
- `engine/AGENTS.md`: "Tek adım disiplini" (araç sonrası dur, plan metni üretme) ve "Çalışma dizini
  boşsa" (sessizce döngüye girme, açıkça söyle) kuralları eklendi.
- `NASIL-CALISTIRILIR.md`: kanıtlı kök neden (baseline ~%87 doluluk + araç-çağrısız yanıtta harness'in
  adım döngüsünü durdurmaması), canlıda denenebilecek teşhis adımları, context ölçüm adımı, dağıtım
  kontrolü (boş çalışma dizini ≠ kural yüklenmedi — global kurulum) eklendi.
- Rapor: `notlar/QWEN-COMPACTION-RAPOR.md`.

**Kök neden özet:** İki katmanlı. (1) 38 beceri listesi + yerleşik sistem promptu + araç şemaları,
boş bir dizinde bile ilk istekte 16k pencerenin ~%87'sini dolduruyor (gerçek istek gövdesi ölçülerek
doğrulandı). (2) Model araç çağırmayan bir yanıt döndürdüğünde opencode 1.18.30'un adım döngüsü
**durmuyor** — yerel bir mock LLM ile modelden bağımsız olarak yeniden üretildi (12 saniyede 178 adım,
üst sınır/bekleme yok). İkinci madde ikiliye gömülü bir harness hatası; repo düzeyinde düzeltilemez,
yalnız alanı büyütüp tetiklenme ihtimalini azaltabildik.

## 2026-09-14 — Faz -1 paketi

**Ne değişti:**
- **Motor/bilgi ayrımı:** kökteki `skills/` kaldırıldı. Yeni düzen:
  - `engine/` → **motor tarafı**: `AGENTS.md`, `opencode.json`, `plugins/` (opencode'un okuduğu çalışma ayarları)
  - `knowledge/` → **kurumsal hafıza**: `skills/approved/` (38 beceri), `runbooks/`, `incidents/`, `lessons-learned/`, `operations-notes/`, `architecture/`, `policy/`, `roadmap/`
  - Kural: **AI kendi kendine öğrenmez, öğrenme önerir** → yeni beceri `knowledge/skills/experimental/` (open **okumaz**) → insan onayı → `approved/` (open **okur**)
- **Yeni politika katmanı `knowledge/policy/`** (Faz -1 çıktısı):
  - `THREAT-MODEL.md` — varlıklar, aktörler, saldırı yüzeyleri, "v1 mutlak sınır: salt-okunur"
  - `PERMISSION-MATRIX.md` — 9 araç için allow/ask/deny önerisi + "kural atlanabilir / hook atlanamaz" tablosu
  - `AUDIT-FORMAT.md` — 17 alanlı JSONL (OTel GenAI adları), `prev_hash` zinciri, repo dışı konum
- **`knowledge/roadmap/PHASE0-ACCEPTANCE.md`** — Faz 0 kabul kriterleri (5 madde) + ölçüm + rapor şablonu
- **`knowledge/architecture/`** — ADR-0001 (`decisions/0001-v1-scope-and-guardrails.md`) + `consultations/` (2 tur çoklu-model danışma kaydı)
- `oc-dogrula.sh`: knowledge iskeleti artık **10 dizin** kontrol ediyor (`policy/` eklendi)

**Kurulum:** `tar xJf opencode-paket.tar.xz -C /root` → `env` doldur → `./kur.sh` → `opencode` (kısa ad `oc`)

**Sırada (Faz 0):** izin bloğunu `engine/opencode.json`'a uygula · audit hook plugin (`engine/plugins/`) · 3 gerçek salt-okunur görevle test → `PHASE0-ACCEPTANCE.md` şablonuyla rapor.
