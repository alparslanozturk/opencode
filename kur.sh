#!/usr/bin/env bash
# =============================================================================
#  kur.sh — opencode saha paketinin TEK betiği (kurum içi, offline; ağ/npm gerekmez).
#
#  Kullanım:  cd /root/ai/opencode && ./kur.sh [alt-komut] [seçenek...]
#
#    ./kur.sh            VARSAYILAN = kur: gerekirse DERLER → KURAR → kısayolu
#                        düzeltir → EN SONDA kontrol ekranını basar
#    ./kur.sh kur        aynı iş (açık yazım)
#    ./kur.sh derle      yalnız kaynaktan derleme (kurulum/kısayol yok;
#                        --bin-kopyala: çıkan ikiliyi bin/opencode'a da kopyala)
#    ./kur.sh kontrol    yalnız kontrol/teşhis raporu (salt okunur)
#    ./kur.sh yardim     kısa kullanım ekranı  (-h | --help de olur)
#
#  Seçenekler (kur/varsayılan akışta kontrol aşamasına aktarılır):
#    --zaman-asimi <sn>   uç isteklerinde bekleme (varsayılan 60)
#    --ayrintili | -a     kontrol raporunu kırpmadan bas
#    --url · --key · --model   kontrolde env yerine tek seferlik değer
#    --kurulum | --uc     kontrol raporunun yalnız bir bölümü (iç kullanım)
#
#  env kapısı: kökteki `env` yoksa önce `env.local`, o da yoksa `env.example`
#  kopyalanır (izin 600) — elle kopyalama adımı YOK. `env` içeriği ekrana BASILMAZ.
#
#  İkili nereden gelir: HER ZAMAN kaynaktan derlenir (hazır ikili/indirme yolu yok);
#  `bin/opencode` yalnız derleme çıktısının önbelleğidir.
#
#  İç detay (ortam değişkenleri — yalnız ayıklama için):
#    ALP_DERLE=1 ikili güncel olsa da derle · ALP_DERLEME_YOK=1 hiç derleme ·
#    ALP_TUM_BECERILER=1 tüm beceriler · ALP_DERLE_EK="--ignore-scripts" bun'a ek bayrak ·
#    KURUM_MAX_CONTEXT/KURUM_MAX_OUTPUT (env) uç bildirmezse bağlam/çıktı sınırı ·
#    KISAYOL_DIZIN (varsayılan /usr/local/bin, yazılamıyorsa ~/.local/bin) ·
#    BUN bun ikilisinin yolu · MODELS_DEV_API_JSON models.dev anlık görüntüsü ·
#    OPENCODE_VERSION/OPENCODE_CHANNEL ürün sürümü/kanalı (varsayılan 1.0.0/main)
#
#  Çıkış kodu: 0 = başarılı/sorun yok · 1 = hata/sorun var · 2 = kullanım/env hatası ·
#              3 = gerekli araç yok (curl vb.). Kontrol bulguları KURULUMUN çıkış
#              kodunu bozmaz: kurulum olduysa kod 0'dır, rapor yalnız sağlığı anlatır.
# =============================================================================
set -euo pipefail

# --- kendi gerçek konumunu bul (symlink zincirini çözer) ---------------------
_kaynak="${BASH_SOURCE[0]}"
while [ -L "$_kaynak" ]; do
  _hedef="$(readlink "$_kaynak")"
  case "$_hedef" in
    /*) _kaynak="$_hedef" ;;
    *) _kaynak="$(cd "$(dirname "$_kaynak")" && pwd)/$_hedef" ;;
  esac
done
KOK="$(cd "$(dirname "$_kaynak")" && pwd)"

# ---------------------------------------------------------------------------
#  Sabitler
# ---------------------------------------------------------------------------
NODE_SURUM="v24.19.0"

# Ürün sürümü/kanalı — TEK YER burasıdır: derleme adımı ikiliye bu değerleri yazar
# (build.ts), kurulum kararı da `bin/opencode --version`'ı bununla karşılaştırır.
# Değiştirmek için: OPENCODE_VERSION=1.0.1 ./kur.sh derle  ya da  env.local'a
# "OPENCODE_VERSION=1.0.1" satırı ekleyip ./kur.sh (env okununca burayı ezer).
# Kanal BİLEREK "main" kalır: database.ts kanala göre DB dosyası adı seçiyor
# (opencode-<kanal>.db); kanal "latest" olursa sahadaki mevcut oturum verisi
# opencode.db'ye kayar (istenmiyor). "main" kalınca davranış aynıdır, yalnız sürüm
# 1.0.0 olur. package.json'lar upstream 1.18.30'da kalır — onlar VENDOR sürümüdür;
# ürün sürümünü bu iki satır belirler.
# 1.0.1: derlenmiş ikilide `SystemPrompt.environment` çökmesini düzelten build.ts
# `splitting: false` düzeltmesiyle birlikte bump edildi (bkz. SURUM-NOTLARI.md).
SURUM="${OPENCODE_VERSION:-1.0.1}"
KANAL="${OPENCODE_CHANNEL:-main}"

# Çekirdek beceri listesi (Aşama 2, danışma-2 kararı: 38 → 10; 2026-09-16 Alp kararıyla
# kalan 28 beceri knowledge/skills/parked/'a taşındı, bkz. parked/README.md).
# ALP_TUM_BECERILER=1 approved/ + parked/ birlikte kurar (hepsi).
# NOT: kontrol raporu çekirdek sayısını AŞAĞIDAKİ satırdan okur — satır başına yazılmalı.
CORE_SKILLS=(ansible k8s-rancher rhel-yonetim filo-durum-kontrolu rapor-uret rapor-excel-pdf hata-ayikla performans sistem-guncelleme depolama)

# ---------------------------------------------------------------------------
#  Ortak yardımcılar (renk / yazdırma / hata)
# ---------------------------------------------------------------------------
yesil()   { printf '\033[32m%s\033[0m\n' "$*"; }
kirmizi() { printf '\033[31m%s\033[0m\n' "$*"; }
sari()    { printf '\033[33m%s\033[0m\n' "$*"; }
yaz()     { printf '%s\n' "$*"; }
hata()    { printf '!! %s\n' "$*" >&2; }
bilgi()   { printf '   %s\n' "$*" >&2; }

PY=""
if command -v python3 > /dev/null 2>&1; then PY="python3"; fi

# --- argümanlarla gelen durum (ana() doldurur) ---
ALT_KOMUT=""
ARG_URL=""
ARG_KEY=""
ARG_MODEL=""
ZAMAN_ASIMI=60
AYRINTILI=0
# tam = kurulum + uç (varsayılan). --kurulum/--uc iç kullanım içindir.
MOD="tam"
# derle alt komutuna aktarılacak iç bayraklar (--bin-kopyala / --kurulum-yok)
DERLE_EK=()

# --- rapor yardımcıları (kontrol bölümü kullanır) ---
GENISLIK=100
CIZGI="$(printf '%*s' 78 '' | tr ' ' '-')"
RENKLI=0
if [ -t 1 ]; then RENKLI=1; fi
HATA=0
UYARI=0
SORUN=""
LOG_DIZIN="${XDG_DATA_HOME:-$HOME/.local/share}/opencode/log"

renk() { # <ansi-kod> <metin>
  if [ "$RENKLI" -eq 1 ]; then printf '\033[%sm%s\033[0m' "$1" "$2"; else printf '%s' "$2"; fi
}

# kis <metin> [genislik] — tek satıra indirger ve SONDAN kırpar (sarma olmasın)
kis() {
  local metin="$1" gen="${2:-$GENISLIK}"
  metin="$(printf '%s' "$metin" | tr -d '\r' | tr '\n' ' ')"
  if [ "${#metin}" -gt "$gen" ]; then printf '%s…' "${metin:0:$((gen - 1))}"; else printf '%s' "$metin"; fi
}

# kis_son <metin> [genislik] — BAŞTAN kırpar; yollarda ayırt edici kısım sonda olur
kis_son() {
  local metin="$1" gen="${2:-$GENISLIK}"
  metin="$(printf '%s' "$metin" | tr -d '\r' | tr '\n' ' ')"
  if [ "${#metin}" -gt "$gen" ]; then printf '…%s' "${metin: -$((gen - 1))}"; else printf '%s' "$metin"; fi
}

sorun_kaydet() { [ -n "$SORUN" ] || SORUN="$1"; }

# satir <etiket> <ok|hata|uyar|bilgi> <metin>
satir() {
  local etiket="$1" durum="$2" metin simge
  metin="$(kis "$3" $((GENISLIK - 13)))"
  case "$durum" in
    ok) simge="$(renk 32 '✓')" ;;
    hata)
      simge="$(renk 31 '✗')"
      HATA=$((HATA + 1))
      ;;
    uyar)
      simge="$(renk 33 '!')"
      UYARI=$((UYARI + 1))
      ;;
    *) simge="·" ;;
  esac
  printf ' %-9s %s %s\n' "$etiket" "$simge" "$metin"
}

# sn <saniye> — curl'ün 6 haneli süresini okunur hale getirir (0.000620 -> 0.00)
sn() { LC_ALL=C printf '%.2f' "$1" 2>/dev/null || printf '%s' "$1"; }

# duz <metin> — etiketsiz satır; tamamı ekran genişliğine kırpılır
duz() { printf ' %s\n' "$(kis "$1" $((GENISLIK - 1)))"; }

# ayr <metin> — yalnız --ayrintili modunda basılır
ayr() { [ "$AYRINTILI" -eq 1 ] && printf '             %s\n' "$1"; return 0; }

# bolum <baslik> — ayraç + bölüm başlığını TEK satırda basar.
# (Eskiden ayrı `CIZGI` + `duz "<baslik>"` iki satır harcıyordu; rapor satır
#  bütçesi ≤29 olduğu için ikisi birleştirildi — bilgi kaybı yok.)
bolum() {
  local baslik dolgu
  baslik="$(kis "$1" 70)"
  dolgu=$((74 - ${#baslik}))
  [ "$dolgu" -lt 3 ] && dolgu=3
  printf -- '-- %s %s\n' "$baslik" "$(printf '%*s' "$dolgu" '' | tr ' ' '-')"
}

# bitir <cikis-kodu> <sorun-metni>
bitir() {
  local kod="$1" metin
  metin="SORUN: $(kis "$2" 92)"
  printf '%s\n' "$CIZGI"
  if [ "$kod" -eq 0 ]; then printf ' %s\n' "$(renk 32 "$metin")"; else printf ' %s\n' "$(renk 31 "$metin")"; fi
  if [ "$AYRINTILI" -eq 0 ]; then
    duz "ayrinti icin: ./kur.sh kontrol --ayrintili   ·   yeniden kurmak icin: ./kur.sh"
  fi
  exit "$kod"
}

# ---------------------------------------------------------------------------
#  env kapısı — elle kopyalama adımı yok.
#    env yoksa:  env.local → env   ·   yoksa  env.example → env   ·   yoksa hata.
#  env'in İÇERİĞİ hiçbir zaman ekrana basılmaz (anahtar taşır).
# ---------------------------------------------------------------------------
env_hazirla() {
  local hedef="$KOK/env"
  [ -f "$hedef" ] && return 0
  if [ -f "$KOK/env.local" ]; then
    cp "$KOK/env.local" "$hedef" || return 1
    chmod 600 "$hedef" 2>/dev/null || true
    yaz ">> env yoktu — env.local'dan alindi: $hedef"
    return 0
  fi
  if [ -f "$KOK/env.example" ]; then
    cp "$KOK/env.example" "$hedef" || return 1
    chmod 600 "$hedef" 2>/dev/null || true
    yaz ">> env yoktu — env.example SABLONUNDAN olusturuldu: $hedef (yer tutuculari doldur)"
    return 0
  fi
  hata "$hedef yok ve sablon da yok (env.local / env.example bulunamadi)."
  bilgi "Depo eksik senkronlanmis olabilir; once kaynak agacini eksiksiz getir."
  bilgi "Ya da su 3 satirla elle olustur (degerleri kurumdan al):"
  bilgi "  KURUM_URL=https://SUNUCU:8000/v1"
  bilgi "  KURUM_KEY=dummy"
  bilgi "  MODEL_ID=\"<model-kimligi>\"   # /v1/models ciktisindan birebir"
  bilgi "(env bilerek git'te degil: URL + anahtar repoda durmasin.)"
  return 1
}

# ===========================================================================
#  DERLE — opencode CLI'yi kaynaktan derler (hedef: kurum saha makinesi)
#
#  Kaynak senkronu (git pull + rsync) bu betiğin işi DEĞİLDİR: önce kodu bu
#  makineye çek, sonra ./kur.sh çalıştır.
#
#  Kısayol (symlink) KURULMAZ — kısayolun tek sahibi kurulum aşamasıdır.
#
#  Offline/kurum-ağı varsayımı:
#    - npm paketleri kurum içi npm proxy'sinden gelir  -> ~/.bunfig.toml (repoya girmez)
#    - models.dev'e erişim YOKTUR                      -> repodaki snapshot kullanılır
#    - web/console paketleri (ghostty-web, @solidjs/start) npm DIŞI kaynaktan geldiği için
#      kurulum `--filter` ile yalnız CLI workspace'ine daraltılır.
# ===========================================================================

# Node header'ları: offline node-gyp için hazırla.
# Resmi arsiv (node-vX.Y.Z-headers.tar.gz) icinde `node-vX.Y.Z/` dizini vardir
# (`include/node/...`) — adinda "-headers" GECMEZ. Sahada Alp ayni agaci elle
# `node-vX.Y.Z-headers/` adiyla koymus olabilir (node-gyp'in nodedir'i oraya bakar).
# Bu yuzden: once acilan GERCEK dizine bakilir, gerekirse arsiv acilir, sonra
# "-headers" adi o dizine baglanir. Elle konulmus gercek dizine DOKUNULMAZ.
node_headerlari_hazirla() {
  local arsiv="$KOK/node-$NODE_SURUM-headers.tar.gz"
  local gercek="$KOK/node-$NODE_SURUM"          # arsivin actigi dizin
  local takma="$KOK/node-$NODE_SURUM-headers"   # sahada beklenen ad

  # Sahada elle konulmus gercek bir dizin varsa hazir kabul et, dokunma.
  if [ -d "$takma" ] && [ ! -L "$takma" ]; then return 0; fi
  # Daha once bu betigin kurdugu bag hala saglamsa is yok (idempotent).
  if [ -L "$takma" ] && [ -d "$takma/include/node" ]; then return 0; fi

  if [ ! -d "$gercek/include/node" ]; then
    if [ ! -f "$arsiv" ]; then return 0; fi     # arsiv de yok -> sessizce gec
    tar xzf "$arsiv" -C "$KOK" >/dev/null 2>&1 || return 1   # gurultu yok: tek satir uyari yeter
    if [ ! -d "$gercek/include/node" ]; then return 1; fi
  fi

  if [ -L "$takma" ]; then rm -f "$takma"; fi   # kirik bag -> yenile
  if [ ! -e "$takma" ]; then
    ln -s "node-$NODE_SURUM" "$takma" || return 1
  fi
  if [ ! -d "$takma/include/node" ]; then return 1; fi
  echo "==> node header'lari hazir: $takma -> node-$NODE_SURUM"
}

# ---------------------------------------------------------------------------
#  T4 — sürüm/derleme künyesi (denetim bulgusu 3: "ikili ↔ sürüm ↔ commit"
#  izlenebilir değil). Derleme anında ikilinin yanına `opencode.derleme` adlı
#  düz metin künye yazılır; kurulum onu ikiliyle birlikte ~/.opencode/bin'e
#  taşır, kontrol raporu da oradan okur. Künye YOKSA rapor bunu uyarı olarak
#  basar (sessizce "her şey yolunda" demez).
#  Dosya biçimi bilerek `anahtar=deger` — jq/python gerektirmez.
# ---------------------------------------------------------------------------
kunye_yaz() { # <ikili-yolu> <kunye-yolu>
  local ikili="$1" hedef="$2" commit="" kirli=0 boyut=""
  [ -f "$ikili" ] || return 0
  if command -v git > /dev/null 2>&1 && [ -d "$KOK/.git" ]; then
    commit="$(git -C "$KOK" rev-parse --short HEAD 2> /dev/null || true)"
    [ -n "$(git -C "$KOK" status --porcelain 2> /dev/null)" ] && kirli=1
  fi
  boyut="$(stat -c '%s' "$ikili" 2> /dev/null || echo '')"
  {
    printf 'surum=%s\n' "$SURUM"
    printf 'kanal=%s\n' "$KANAL"
    printf 'commit=%s\n' "$commit"
    printf 'kirli=%s\n' "$kirli"
    printf 'boyut=%s\n' "$boyut"
    printf 'tarih=%s\n' "$(date '+%Y-%m-%d %H:%M')"
  } > "$hedef" 2> /dev/null || return 0
  chmod 644 "$hedef" 2> /dev/null || true
}

# kunye_oku <anahtar> — KUNYE_DOSYA'dan tek alan okur (yoksa boş döner)
kunye_oku() {
  [ -n "${KUNYE_DOSYA:-}" ] && [ -f "$KUNYE_DOSYA" ] || return 0
  sed -n "s/^$1=//p" "$KUNYE_DOSYA" 2> /dev/null | head -1
}

# derle [--bin-kopyala] [--kurulum-yok] [bun install'a ek bayraklar...]
#   --bin-kopyala  derlenen ikiliyi ayrica bin/opencode'a kopyalar (kurulum akisi bunu kullanir)
#   --kurulum-yok  bun install adimini atla (bagimliliklar zaten kuruluysa)
derle() {
  local BIN_KOPYALA=0 KURULUM_YOK=0 arg
  local -a INSTALL_EK=()
  for arg in "$@"; do
    case "$arg" in
      --bin-kopyala) BIN_KOPYALA=1 ;;
      --kurulum-yok) KURULUM_YOK=1 ;;
      *) INSTALL_EK+=("$arg") ;;  # gerisi bun install'a aktarilir (or. --ignore-scripts)
    esac
  done

  cd "$KOK"

  # --- 0) bun bulunuyor mu? (saha makinesinde PATH'te olmayabilir) ------------
  local BUN_YOL="${BUN:-}"
  if [ -z "$BUN_YOL" ]; then
    if command -v bun >/dev/null 2>&1; then
      BUN_YOL="$(command -v bun)"
    elif [ -x "$HOME/.bun/bin/bun" ]; then
      BUN_YOL="$HOME/.bun/bin/bun"
    elif [ -x "/root/.bun/bin/bun" ]; then
      BUN_YOL="/root/.bun/bin/bun"
    else
      hata "bun bulunamadi. PATH'e ekle veya BUN=/yol/bun ./kur.sh derle olarak calistir."
      return 1
    fi
  fi
  PATH="$(dirname "$BUN_YOL"):$PATH"
  export PATH
  echo "==> bun: $BUN_YOL ($("$BUN_YOL" --version))"

  if [ ! -f "$KOK/bun.lock" ]; then
    hata "$KOK/bun.lock yok — depo eksik senkronlanmis olabilir."
    return 1
  fi

  # --- 1) Node header'lari ---------------------------------------------------
  node_headerlari_hazirla || \
    echo "!! node-$NODE_SURUM header'lari hazirlanamadi — derlemeye devam ediliyor (node-gyp gerekirse kirilabilir)." >&2

  # --- 2) models.dev anlik goruntusu (ag yok -> fetch denenmesin) -------------
  local SNAPSHOT="$KOK/packages/opencode/script/models-dev-api.json"
  if [ -z "${MODELS_DEV_API_JSON:-}" ] && [ -f "$SNAPSHOT" ]; then
    export MODELS_DEV_API_JSON="$SNAPSHOT"
  fi
  if [ -n "${MODELS_DEV_API_JSON:-}" ]; then
    echo "==> models.dev snapshot: $MODELS_DEV_API_JSON"
  else
    echo "!! models.dev snapshot yok; derleme https://models.dev/api.json'a baglanmayi deneyecek." >&2
  fi

  # --- 3) Bagimliliklar: YALNIZ CLI workspace'i ------------------------------
  # (--filter olmadan bun, web/console paketlerinin npm DISI bagimliliklarini da cozmeye
  #  calisir: pkg.pr.new/@solidjs/start ve github:anomalyco/ghostty-web -> offline'da patlar.)
  if [ "$KURULUM_YOK" -eq 0 ]; then
    echo "==> bun install --filter=./packages/opencode ${INSTALL_EK[*]:-}"
    "$BUN_YOL" install --filter="./packages/opencode" ${INSTALL_EK[@]+"${INSTALL_EK[@]}"} || return 1
  else
    echo "==> bun install atlandi (--kurulum-yok)"
  fi

  # --- 4) Derleme: tek platform, web UI gomulmeden ---------------------------
  echo "==> surum: $SURUM (kanal: $KANAL)"
  echo "==> build.ts --single --skip-embed-web-ui --skip-install"
  OPENCODE_VERSION="$SURUM" OPENCODE_CHANNEL="$KANAL" \
    "$BUN_YOL" run ./packages/opencode/script/build.ts --single --skip-embed-web-ui --skip-install || return 1

  # --- 5) Uretilen ikiliyi bul -----------------------------------------------
  local -a IKILILER=()
  shopt -s nullglob
  IKILILER=(packages/opencode/dist/opencode-*/bin/opencode)
  shopt -u nullglob
  if [ "${#IKILILER[@]}" -ne 1 ]; then
    hata "Beklenen tek ikili bulunamadi (bulunan: ${#IKILILER[@]})."
    printf '   %s\n' ${IKILILER[@]+"${IKILILER[@]}"} >&2
    return 1
  fi
  local IKILI="$KOK/${IKILILER[0]}"
  echo "==> ikili: $IKILI ($(du -h "$IKILI" | cut -f1))"

  # --- 6) Kisayol (symlink) KURULMAZ — sahibi kurulum asamasi ----------------
  echo "==> kisayol kurulmadi (sahibi kurulum asamasi) — kurulum icin: ./kur.sh"

  # --- 7) Istege bagli: kurulum akisi icin bin/opencode ----------------------
  if [ "$BIN_KOPYALA" -eq 1 ]; then
    mkdir -p "$KOK/bin" || return 1
    cp -f "$IKILI" "$KOK/bin/opencode" || return 1
    chmod +x "$KOK/bin/opencode" || return 1
    echo "==> bin/opencode guncellendi (kurulum asamasi bunu kullanir)"
    kunye_yaz "$KOK/bin/opencode" "$KOK/bin/opencode.derleme"
  fi
  kunye_yaz "$IKILI" "$(dirname "$IKILI")/opencode.derleme"

  echo "==> BITTI: $("$IKILI" --version)"
}

# ===========================================================================
#  KUR — ikili + ayar + kurallar (AGENTS.md) + beceriler + plugin + ripgrep +
#        kısayollar; en sonda kontrol ekranı.
# ===========================================================================
kaynak_agaci_var() {
  [ -f "$KOK/bun.lock" ] && [ -d "$KOK/packages/opencode" ]
}

# Kaynak ağacında bin/opencode'dan YENİ bir dosya var mı? (tek dosya bulunca durur — ucuz)
kaynak_daha_yeni() {
  local yeni hedefler=()
  local p
  for p in "$KOK/packages/opencode/src" "$KOK/packages/opencode/script" \
           "$KOK/packages/opencode/package.json" "$KOK/bun.lock"; do
    [ -e "$p" ] && hedefler+=("$p")
  done
  [ "${#hedefler[@]}" -gt 0 ] || return 1
  yeni="$(find "${hedefler[@]}" -newer "$KOK/bin/opencode" -print -quit 2>/dev/null || true)"
  [ -n "$yeni" ]
}

kisayol_kur() { # <ad>
  local ad="$1" baglanti="$HEDEF_DIZIN/$1" mevcut yedek
  mevcut="$(readlink -f "$baglanti" 2>/dev/null || true)"
  if [ ! -e "$baglanti" ] && [ ! -L "$baglanti" ]; then
    ln -sfn "$BENIM" "$baglanti"
    yesil "  kısayol kuruldu: $baglanti → $BENIM"
  elif [ "$mevcut" = "$BENIM" ]; then
    yesil "  kısayol zaten doğru: $baglanti"
  else
    yedek="$baglanti.bak-$(date +%Y%m%d-%H%M%S)"
    mv "$baglanti" "$yedek"
    sari "  '$ad' başka hedefi gösteriyordu (${mevcut:-<çözülemedi>}) → yedeklendi: $yedek"
    ln -sfn "$BENIM" "$baglanti"
    yesil "  kısayol düzeltildi: $baglanti → $BENIM"
  fi
}

# ---------------------------------------------------------------------------
#  T3 — çıktı (output) sınırını uçtan öğren.
#
#  `uc_alanlari <model-id>` : stdin'deki /v1/models gövdesinden bağlam penceresi
#  ve (varsa) çıktı sınırı alanlarını sekmeli olarak basar. MODEL_ID ile eşleşen
#  kayıt önceliklidir; yoksa ilk kayda düşülür.
#
#  `cikti_probe <url> <key> <model> [baglam]` : uç alanı bildirmiyorsa TEK bir
#  küçük istekle sorar — `max_tokens` bilerek aşırı büyük gönderilir, uç bunu
#  reddedip sınırı hata mesajında söylerse sayı oradan okunur. İstek `stream:true`
#  ve kısa zaman aşımıyla atılır: uç isteği KABUL ederse akış ilk parçada kesilir
#  (uçta uzun üretim başlatmaz). Sınır okunamazsa boş döner — çağıran 4096'ya düşer.
#  Bağlam penceresi mesajları (vLLM "maximum context length is N") BİLEREK
#  eşleşmez: o sayı çıktı sınırı değildir.
# ---------------------------------------------------------------------------
uc_alanlari() { # <model-id> <models-govdesi>
  [ -n "$PY" ] || return 0
  "$PY" - "$1" "$2" << 'PY' 2> /dev/null || true
import json, sys

mid = sys.argv[1]
BAGLAM = ("max_model_len", "context_length", "max_context_length", "context_window", "max_seq_len")
CIKTI = ("max_output_tokens", "max_completion_tokens", "max_output_len",
         "max_generated_tokens", "max_tokens", "output_limit")
try:
    d = json.loads(sys.argv[2])
except Exception:
    sys.exit(0)

kayitlar = []
if isinstance(d, dict):
    for alt in ("data", "models"):
        if isinstance(d.get(alt), list):
            kayitlar.extend(x for x in d[alt] if isinstance(x, dict))
    kayitlar.append(d)
elif isinstance(d, list):
    kayitlar.extend(x for x in d if isinstance(x, dict))

# MODEL_ID ile eşleşen kayıt önce denenir (uçta birden çok model olabilir).
kayitlar.sort(key=lambda k: 0 if (k.get("id") or k.get("name")) == mid else 1)

def havuz(k):
    h = dict(k)
    for alt in ("meta", "metadata", "config", "limit", "limits"):
        if isinstance(k.get(alt), dict):
            h.update(k[alt])
    if isinstance(k.get("limit"), dict) and isinstance(k["limit"].get("output"), int):
        h["max_output_tokens"] = k["limit"]["output"]
    return h

def bul(anahtarlar):
    for k in kayitlar:
        h = havuz(k)
        for a in anahtarlar:
            v = h.get(a)
            if isinstance(v, bool):
                continue
            if isinstance(v, (int, float)) and 0 < v < 10_000_000:
                return a, int(v)
    return None, None

a, v = bul(BAGLAM)
if v:
    print("baglam\t%d" % v)
a, v = bul(CIKTI)
if v:
    print("cikti\t%d" % v)
    print("cikti-alan\t%s" % a)
PY
}

cikti_probe() { # <url> <key> <model> [baglam]
  local kok="${1%/}" anahtar="$2" model="$3" baglam="${4:-}" istek govde
  [ -n "$PY" ] || return 0
  command -v curl > /dev/null 2>&1 || return 0
  istek="$("$PY" - "$model" << 'PY' 2> /dev/null || true
import json, sys
print(json.dumps({"model": sys.argv[1],
                  "messages": [{"role": "user", "content": "ok"}],
                  "max_tokens": 100000000, "temperature": 0, "stream": True}))
PY
)"
  [ -n "$istek" ] || return 0
  govde="$(curl -sS -N --max-time 12 \
    -H "Authorization: Bearer $anahtar" -H 'Content-Type: application/json' \
    -d "$istek" "$kok/chat/completions" 2> /dev/null | head -c 2000 || true)"
  [ -n "$govde" ] || return 0
  "$PY" - "${baglam:-0}" "$govde" << 'PY' 2> /dev/null || true
import json, re, sys

baglam = int(sys.argv[1] or 0)
ham = sys.argv[2]
if ham.lstrip().startswith("data:"):
    sys.exit(0)          # uç isteği kabul etti -> mesajdan sınır öğrenilemez
try:
    mesaj = json.loads(ham)
    hata = mesaj.get("error")
    if isinstance(hata, dict):
        mesaj = str(hata.get("message") or "")
    elif isinstance(hata, str):
        mesaj = hata
    else:
        mesaj = str(mesaj.get("message") or "")
except Exception:
    mesaj = ham
if not mesaj:
    sys.exit(0)

KALIPLAR = (
    r"max_tokens\D{0,40}?(\d{2,9})",
    r"max_completion_tokens\D{0,40}?(\d{2,9})",
    r"(?:completion|output|generat\w*)\D{0,40}?(?:at most|maximum|limit)\D{0,20}?(\d{2,9})",
    r"(?:at most|maximum of|limit of)\D{0,20}?(\d{2,9})\s*(?:completion|output|generated)\s*tokens",
)
for kalip in KALIPLAR:
    esles = re.search(kalip, mesaj, re.I)
    if not esles:
        continue
    n = int(esles.group(1))
    if n < 16 or n > 10_000_000:
        continue
    if baglam and n > baglam:
        continue
    print(n)
    break
PY
}

kur() {
  local TUM_BECERILER="${ALP_TUM_BECERILER:-0}"
  local DERLE="${ALP_DERLE:-0}"
  local DERLEME_YOK="${ALP_DERLEME_YOK:-0}"
  local -a ALP_EK=()   # derleyiciye aktarılacak ek bun bayrakları — ALP_DERLE_EK ile
  if [ -n "${ALP_DERLE_EK:-}" ]; then
    read -r -a ALP_EK <<< "${ALP_DERLE_EK}"
  fi

  env_hazirla || exit 1
  # shellcheck disable=SC1090
  . "$KOK/env"
  # Denetim bulgusu #8: env dosyası kurum endpoint'i + anahtarı taşıyor ama
  # varsayılan umask ile 644 (dünya-okunur) oluşabiliyor — mümkünse sıkılaştır
  # (yazma izni yoksa/başka kullanıcıya aitse sessizce geç, kurulumu bozma).
  chmod 600 "$KOK/env" 2>/dev/null || true

  # env dosyası var ama 3 zorunlu satırdan biri eksikse `set -u` altında ham
  # "unbound variable" hatası yerine dostane mesaj ver.
  local eksik_degisken="" degisken
  for degisken in KURUM_URL KURUM_KEY MODEL_ID; do
    [ -n "${!degisken:-}" ] || eksik_degisken="$eksik_degisken $degisken"
  done
  if [ -n "$eksik_degisken" ]; then
    hata "$KOK/env eksik/bozuk — şu değişken(ler) tanımlı değil:$eksik_degisken"
    bilgi "$KOK/env.example ile karşılaştır, 3 satırı da doldur."
    exit 1
  fi

  if [ -z "$PY" ]; then
    hata "python3 bulunamadı — config yazımı (bağlam penceresi tespiti, opencode.json üretimi) için gerekli."
    exit 1
  fi

  # -------------------------------------------------------------------------
  #  0) İkili nereden gelecek? Kararı BU BETİK verir (kullanıcı bayrak öğrenmez):
  #       bin/opencode yok            -> kaynaktan derle
  #       kaynak ağacı ikiliden yeni  -> kaynaktan yeniden derle
  #       ikilinin sürümü uyuşmuyor   -> kaynaktan yeniden derle (ürün sürümü: SURUM)
  #       aksi halde                  -> derleme yok, doğrudan kur
  #     Hazır ikili indirme yolu YOKTUR: ikili her zaman kaynaktan üretilir.
  # -------------------------------------------------------------------------
  DERLENDI=0
  IKILI_KAYNAGI=""
  DERLE_NEDEN=""
  local bin_surum
  # env dosyası ürün sürümünü/kanalını ezebilir (env.local'a OPENCODE_VERSION satırı
  # yazılmış olabilir) — kabukta export edilmiş değer daha yukarıda zaten kazanmıştı.
  SURUM="${OPENCODE_VERSION:-$SURUM}"
  KANAL="${OPENCODE_CHANNEL:-$KANAL}"
  if [ "$DERLEME_YOK" != 1 ] && kaynak_agaci_var; then
    if [ "$DERLE" = 1 ]; then
      DERLE_NEDEN="elle istendi (ALP_DERLE=1)"
    elif [ ! -f "$KOK/bin/opencode" ]; then
      DERLE_NEDEN="bin/opencode yok"
    elif kaynak_daha_yeni; then
      DERLE_NEDEN="kaynak ağacı ikiliden yeni"
    elif ! bin_surum="$(timeout 30 "$KOK/bin/opencode" --version 2>/dev/null)"; then
      DERLE_NEDEN="ikilinin sürümü okunamadı (bozuk olabilir)"
    elif [ "$bin_surum" != "$SURUM" ]; then
      DERLE_NEDEN="sürüm uyuşmuyor (kurulu: $bin_surum, istenen: $SURUM)"
    fi
  fi
  if [ -n "$DERLE_NEDEN" ]; then
    echo "== 0/4  kaynaktan derleme ($DERLE_NEDEN) =="
    # derle: kısayol KURMAZ (tek sahip kurulum); --bin-kopyala ikiliyi bin/opencode'a bırakır.
    if derle --bin-kopyala ${ALP_EK[@]+"${ALP_EK[@]}"}; then
      DERLENDI=1
      IKILI_KAYNAGI="kaynaktan derlendi — $DERLE_NEDEN"
    else
      hata "derleme başarısız — yukarıdaki çıktıya bak."
      if [ -f "$KOK/bin/opencode" ]; then
        hata "mevcut bin/opencode ile devam ediliyor (eski sürüm olabilir)."
        IKILI_KAYNAGI="derleme başarısız, mevcut bin/opencode kullanıldı"
      fi
    fi
  fi

  if [ ! -f "$KOK/bin/opencode" ]; then
    hata "$KOK/bin/opencode yok ve uretilemedi."
    if kaynak_agaci_var; then
      bilgi "Cozum 0: kaynaktan derleme denendi ve basarisiz oldu — yukaridaki derleme ciktisina bak (bun gerekir)."
    else
      bilgi "Cozum 0: kaynak agaci eksik — git/rsync senkronu ile depoyu eksiksiz getir."
    fi
    bilgi "Sonra tekrar calistir: ./kur.sh"
    exit 1
  fi
  [ -n "$IKILI_KAYNAGI" ] || IKILI_KAYNAGI="hazır bin/opencode güncel (derleme gerekmedi)"

  case "$KURUM_URL" in
    *KURUM_ENDPOINT*) hata "Önce $KOK/env içindeki KURUM_URL'i doldur."; exit 1 ;;
  esac
  # T12: MODEL_ID de şablonda yer tutucudur (`<model-kimligi>`); gerçek ad uçtan
  # (`/v1/models`) birebir kopyalanır. Yer tutucuyla kurulursa opencode.json'a
  # geçersiz bir model kimliği yazılır, hata ancak ilk istekte görünür.
  case "$MODEL_ID" in
    *'<'* | *MODEL_ID_YER_TUTUCU*) hata "Önce $KOK/env içindeki MODEL_ID'yi doldur (/v1/models çıktısından birebir)."; exit 1 ;;
  esac

  echo "== 1/4  ikili =="
  mkdir -p "$HOME/.opencode/bin"
  install -m 0755 "$KOK/bin/opencode" "$HOME/.opencode/bin/opencode"
  # T4: derleme künyesi ikiliyle birlikte taşınır — kontrol raporu "ikili ↔ surum
  # ↔ commit" tutarlılığını oradan okur. Künye yoksa (eski bin/opencode) eskisi
  # silinir ki rapor "künye yok" desin, bayat künyeye bakıp yanlış onay vermesin.
  rm -f "$HOME/.opencode/bin/opencode.derleme"
  if [ -f "$KOK/bin/opencode.derleme" ]; then
    install -m 0644 "$KOK/bin/opencode.derleme" "$HOME/.opencode/bin/opencode.derleme"
  fi
  yesil "  kuruldu: $HOME/.opencode/bin/opencode"

  echo "== 2/4  ayar + kurallar + beceriler =="
  mkdir -p "$HOME/.config/opencode"
  if [ -f "$KOK/engine/AGENTS.md" ]; then
    cp -f "$KOK/engine/AGENTS.md" "$HOME/.config/opencode/AGENTS.md"
  fi
  rm -rf "$HOME/.config/opencode/skills"; mkdir -p "$HOME/.config/opencode/skills"
  if [ "$TUM_BECERILER" = 1 ]; then
    cp -r "$KOK/knowledge/skills/approved/." "$HOME/.config/opencode/skills/"
    # 2026-09-16 beceri sadeleştirmesi (Alp kararı): kalan beceriler approved/'dan
    # parked/'a taşındı (bkz. knowledge/skills/parked/README.md) — ALP_TUM_BECERILER
    # eskisi gibi hepsini kursun diye parked/'ı da ekliyoruz. parked/README.md bir
    # beceri değil (klasör değil) — cp ile beceri dizinlerine karışmasın diye tek
    # tek beceri alt dizinleri kopyalanıyor.
    if [ -d "$KOK/knowledge/skills/parked" ]; then
      for d in "$KOK/knowledge/skills/parked"/*/; do
        [ -d "$d" ] && cp -r "$d" "$HOME/.config/opencode/skills/$(basename "$d")"
      done
    fi
    sari "  tüm beceriler kuruldu (taban bağlam büyür)"
  else
    local ad
    for ad in "${CORE_SKILLS[@]}"; do
      if [ -d "$KOK/knowledge/skills/approved/$ad" ]; then
        cp -r "$KOK/knowledge/skills/approved/$ad" "$HOME/.config/opencode/skills/$ad"
      else
        sari "  ! çekirdek beceri bulunamadı: $ad"
      fi
    done
  fi
  local toplam_mevcut
  toplam_mevcut=$(( $(find "$KOK/knowledge/skills/approved" -mindepth 1 -maxdepth 1 -type d | wc -l) + $(find "$KOK/knowledge/skills/parked" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l) ))
  yesil "  beceri: $(ls "$HOME/.config/opencode/skills" | wc -l) adet kuruldu (repoda mevcut: $toplam_mevcut)"

  # -------------------------------------------------------------------------
  #  Bağlam penceresi + ÇIKTI SINIRI tespiti — uydurma değer yok, kurum uçtan
  #  öğrenilir (best-effort). Sıra (T3):
  #    1) /v1/models alanları  2) küçük bir probe isteği  3) env  4) 4096
  #  Hangi basamağın kazandığı `kur-durum` künyesine yazılır; kontrol raporu
  #  "uctan alinamadi → 4096" ayrımını oradan basar (sessizce sabit kalmaz).
  # -------------------------------------------------------------------------
  local TESPIT_EDILEN_PENCERE="" TESPIT_KAYNAK="" MODELS_JSON=""
  local CIKTI_SINIRI="" CIKTI_KAYNAK="" UC_ALANLARI=""
  case "$KURUM_URL" in
    ""|*KURUM_ENDPOINT*) ;;
    *)
      MODELS_JSON="$(curl -sS --max-time 10 -H "Authorization: Bearer $KURUM_KEY" "${KURUM_URL%/}/models" 2>/dev/null || true)"
      if [ -n "$MODELS_JSON" ]; then
        UC_ALANLARI="$(uc_alanlari "$MODEL_ID" "$MODELS_JSON")"
        TESPIT_EDILEN_PENCERE="$(printf '%s\n' "$UC_ALANLARI" | sed -n 's/^baglam\t//p' | head -1)"
        CIKTI_SINIRI="$(printf '%s\n' "$UC_ALANLARI" | sed -n 's/^cikti\t//p' | head -1)"
        [ -n "$TESPIT_EDILEN_PENCERE" ] && TESPIT_KAYNAK="${KURUM_URL%/}/models"
        if [ -n "$CIKTI_SINIRI" ]; then
          CIKTI_KAYNAK="uc alani $(printf '%s\n' "$UC_ALANLARI" | sed -n 's/^cikti-alan\t//p' | head -1)"
        fi
      fi
      ;;
  esac

  if [ -n "$TESPIT_EDILEN_PENCERE" ]; then
    yesil "  bağlam penceresi: $TESPIT_EDILEN_PENCERE token (kaynak: $TESPIT_KAYNAK)"
  elif [ -n "${KURUM_MAX_CONTEXT:-}" ]; then
    TESPIT_EDILEN_PENCERE="$KURUM_MAX_CONTEXT"
    yesil "  bağlam penceresi: $TESPIT_EDILEN_PENCERE token (kaynak: env KURUM_MAX_CONTEXT)"
  else
    sari "  ! bağlam penceresi tespit edilemedi (uç yanıt vermedi/alan yok) — mevcut opencode.json değeri korunuyor"
    sari "    İstersen $KOK/env içine KURUM_MAX_CONTEXT=<token> ekleyip yeniden çalıştır."
  fi

  # --- çıktı sınırı: alan yoksa probe, o da yoksa env, o da yoksa 4096 ------
  if [ -z "$CIKTI_SINIRI" ]; then
    case "$KURUM_URL" in
      ""|*KURUM_ENDPOINT*) ;;
      *)
        CIKTI_SINIRI="$(cikti_probe "$KURUM_URL" "$KURUM_KEY" "$MODEL_ID" "$TESPIT_EDILEN_PENCERE")"
        [ -n "$CIKTI_SINIRI" ] && CIKTI_KAYNAK="uc probe"
        ;;
    esac
  fi
  if [ -z "$CIKTI_SINIRI" ] && [ -n "${KURUM_MAX_OUTPUT:-}" ]; then
    CIKTI_SINIRI="${KURUM_MAX_OUTPUT}"
    CIKTI_KAYNAK="env KURUM_MAX_OUTPUT"
  fi
  case "$CIKTI_SINIRI" in
    ''|*[!0-9]*) CIKTI_SINIRI=""; CIKTI_KAYNAK="" ;;
  esac
  # çıktı sınırı bağlam penceresini aşamaz (uç saçmalarsa kırp), tabanı 512
  if [ -n "$CIKTI_SINIRI" ]; then
    if [ -n "$TESPIT_EDILEN_PENCERE" ] && [ "$CIKTI_SINIRI" -gt "$TESPIT_EDILEN_PENCERE" ]; then
      CIKTI_SINIRI="$TESPIT_EDILEN_PENCERE"
      CIKTI_KAYNAK="$CIKTI_KAYNAK, baglama kirpildi"
    fi
    [ "$CIKTI_SINIRI" -lt 512 ] && { CIKTI_SINIRI=""; CIKTI_KAYNAK=""; }
  fi
  if [ -n "$CIKTI_SINIRI" ]; then
    yesil "  çıktı sınırı    : $CIKTI_SINIRI token (kaynak: $CIKTI_KAYNAK)"
  else
    CIKTI_SINIRI=4096
    CIKTI_KAYNAK="uctan alinamadi → 4096"
    sari "  ! çıktı sınırı uçtan alınamadı → güvenli varsayılan 4096 token kullanıldı"
    sari "    Uç değeri bildirmiyorsa $KOK/env içine KURUM_MAX_OUTPUT=<token> ekleyip yeniden çalıştır."
  fi

  "$PY" - "$KOK/engine/opencode.json" "$HOME/.config/opencode/opencode.json" "$KURUM_URL" "$KURUM_KEY" "$MODEL_ID" "$TESPIT_EDILEN_PENCERE" "$CIKTI_SINIRI" <<'PY'
import json, os, sys
src, dst, url, key, mid, ctx, out = sys.argv[1:8]
d = json.load(open(src, encoding="utf-8"))
p = d["provider"]["kurum"]
p["options"]["baseURL"] = url
p["options"]["apiKey"] = key
m = list(p["models"])[0]
p["models"][m]["id"] = mid

if out:
    p["models"][m].setdefault("limit", {})["output"] = int(out)

if ctx:
    ctx_n = int(ctx)
    p["models"][m]["limit"]["context"] = ctx_n
    # thrash'i bitirmek icin makul degerler (asama 2, GOREV-ASAMA-2.md paket A):
    # reserved = tampon (taşmayı önler), preserve_recent_tokens = compaction sonrası korunan bütçe.
    d.setdefault("compaction", {})
    d["compaction"]["auto"] = True
    d["compaction"]["prune"] = True
    d["compaction"]["reserved"] = max(1024, min(4096, ctx_n // 8))
    d["compaction"]["preserve_recent_tokens"] = max(2048, min(8192, ctx_n // 4))
    d["compaction"]["tail_turns"] = 2

json.dump(d, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
# Denetim bulgusu #8: dosya varsayılan umask ile (genelde 644, dünya-okunur)
# oluşuyordu; içinde gerçek apiKey/baseURL var — 600'e çekildi.
os.chmod(dst, 0o600)
PY
  yesil "  config: $HOME/.config/opencode/opencode.json (izin: 600)"

  # T3 künyesi: değerin NEREDEN geldiği (uç alanı / probe / env / varsayılan).
  # opencode.json'a şema dışı alan eklemiyoruz; kaynak bilgisi ayrı dosyada durur
  # ve yalnız kontrol raporunun "cikti: N (kaynak)" parantezini beslemek için var.
  {
    printf 'baglam=%s\n' "${TESPIT_EDILEN_PENCERE:-}"
    printf 'baglam_kaynak=%s\n' "${TESPIT_KAYNAK:-tespit edilemedi}"
    printf 'cikti=%s\n' "$CIKTI_SINIRI"
    printf 'cikti_kaynak=%s\n' "$CIKTI_KAYNAK"
    printf 'tarih=%s\n' "$(date '+%Y-%m-%d %H:%M')"
  } > "$HOME/.config/opencode/kur-durum" 2>/dev/null || true
  chmod 600 "$HOME/.config/opencode/kur-durum" 2>/dev/null || true

  mkdir -p "$HOME/.config/opencode/plugins"
  if compgen -G "$KOK/engine/plugins/*.ts" > /dev/null || compgen -G "$KOK/engine/plugins/*.js" > /dev/null; then
    cp -f "$KOK"/engine/plugins/*.ts "$HOME/.config/opencode/plugins/" 2>/dev/null || true
    cp -f "$KOK"/engine/plugins/*.js "$HOME/.config/opencode/plugins/" 2>/dev/null || true
    yesil "  plugin: $(ls "$HOME/.config/opencode/plugins" | wc -l) adet → ~/.config/opencode/plugins (açılışta okunur, tekrar açman gerekebilir)"
  else
    sari "  engine/plugins/ altında .ts/.js yok — plugin kurulumu atlandı"
  fi

  # -------------------------------------------------------------------------
  #  3) ripgrep — opencode'un grep/glob araçları bunu ~/.cache/opencode/bin/rg'de
  #     bekliyor; yoksa ilk kullanımda ağdan indirmeye çalışıyor (kurum ağı
  #     kapalıysa "ripgrep execution failed" ile kırılıyor, bkz. EK-4). Bu pakette
  #     opencode'un kendi indirdiği statik ikili bin/ripgrep.tar.xz olarak taşınıyor.
  # -------------------------------------------------------------------------
  echo "== 3/4  ripgrep =="
  local RG_CACHE_DIZIN="${XDG_CACHE_HOME:-$HOME/.cache}/opencode/bin"
  if command -v rg >/dev/null 2>&1; then
    yesil "  rg zaten PATH'te: $(command -v rg) ($(rg --version | head -1))"
  elif [ -x "$RG_CACHE_DIZIN/rg" ]; then
    yesil "  rg zaten kurulu: $RG_CACHE_DIZIN/rg"
  elif [ -f "$KOK/bin/ripgrep.tar.xz" ]; then
    mkdir -p "$RG_CACHE_DIZIN"
    tar xJf "$KOK/bin/ripgrep.tar.xz" -C "$RG_CACHE_DIZIN"
    chmod +x "$RG_CACHE_DIZIN/rg"
    if "$RG_CACHE_DIZIN/rg" --version >/dev/null 2>&1; then
      yesil "  rg kuruldu: $RG_CACHE_DIZIN/rg ($("$RG_CACHE_DIZIN/rg" --version | head -1))"
    else
      kirmizi "  ! rg kopyalandı ama çalışmadı (mimari uyuşmazlığı olabilir) — elle kontrol et: $RG_CACHE_DIZIN/rg --version"
    fi
  else
    sari "  ! bin/ripgrep.tar.xz yok ve rg PATH'te değil — dosya arama (grep/glob) kırık kalabilir"
    sari "    (bin/ripgrep.tar.xz depoda izlenir — depo eksik senkronlanmış olabilir)"
    sari "    Elle kur: statik bir 'rg' ikilisini $RG_CACHE_DIZIN/rg olarak koy (chmod +x)."
  fi

  # -------------------------------------------------------------------------
  #  4) 'opencode' + 'oc' kısayolları
  #     Çakışma otomatik çözülür: kısayol başka bir hedefi gösteriyorsa soru sorulmadan
  #     yedeklenir (.bak-<tarih>) ve doğru ikiliye çevrilir. Kısayolun tek sahibi burasıdır.
  # -------------------------------------------------------------------------
  echo "== 4/4  'opencode' + 'oc' kısayolları =="
  HEDEF_DIZIN="${KISAYOL_DIZIN:-/usr/local/bin}"
  if [ ! -d "$HEDEF_DIZIN" ] || { [ ! -w "$HEDEF_DIZIN" ] && [ "$(id -u)" != 0 ]; }; then
    HEDEF_DIZIN="$HOME/.local/bin"; mkdir -p "$HEDEF_DIZIN"
    sari "  ${KISAYOL_DIZIN:-/usr/local/bin} yazılamıyor → $HEDEF_DIZIN kullanılıyor"
  fi
  BENIM="$HOME/.opencode/bin/opencode"

  kisayol_kur opencode
  kisayol_kur oc

  case ":$PATH:" in
    *":$HEDEF_DIZIN:"*) ;;
    *) sari "  NOT: $HEDEF_DIZIN PATH'te değil (export PATH=\"$HEDEF_DIZIN:\$PATH\")" ;;
  esac

  # PATH'te ÖNCE gelen başka bir 'opencode' varsa kısayolu düzeltmek yetmez — söyle.
  local PATH_OPENCODE
  PATH_OPENCODE="$(command -v opencode 2>/dev/null || true)"
  if [ -n "$PATH_OPENCODE" ] && [ "$(readlink -f "$PATH_OPENCODE" 2>/dev/null || echo "$PATH_OPENCODE")" != "$(readlink -f "$BENIM" 2>/dev/null || echo "$BENIM")" ]; then
    sari "  NOT: PATH'te önce '$PATH_OPENCODE' geliyor (kurulan: $HEDEF_DIZIN/opencode)."
    sari "       Doğru olanı çalıştırmak için: $HEDEF_DIZIN/opencode  (ya da PATH sırasını düzelt)"
  fi

  echo
  echo "== ÖZET =="
  if [ "$DERLENDI" = 1 ]; then
    yesil "  derlendi : evet — $IKILI_KAYNAGI"
  else
    echo  "  derlendi : hayır — $IKILI_KAYNAGI"
  fi
  yesil "  kuruldu  : $HOME/.opencode/bin/opencode · ayar $HOME/.config/opencode/ · kısayol $HEDEF_DIZIN/opencode (oc)"
  echo  "  çalıştır : cd <veri/proje dizini> && opencode     (kısa ad: oc)"
  echo  "  İlk açılışta /models → kurum / Qwen3.6-35B-A3B-FP8 seç."
  sari "  NOT: opencode'u VERİNİN OLDUĞU dizinde aç (ör: cd ~/ansible && opencode) — dışarı çıkmak izin kapısı açar."

  # -------------------------------------------------------------------------
  #  Kurulum başarıyla bitti (başarısız yollar yukarıda erken çıkar). Alp'in
  #  isteği (2026-09-22): "derleme+kurulum bittikten sonra en sonda kontrol
  #  ekranını da bassın" — kontrol = kurulum + uç raporu, tek ekran.
  #  Kontrolün "sorun var" çıkışı KURULUMU başarısız göstermez: kurulum oldu,
  #  rapor yalnız sağlık durumunu anlatır. Bu yüzden çıkış kodu 0.
  #  (Alt kabuk: kontrol kendi `bitir` çıkışıyla biter, kurulum kodunu bozmaz.)
  # -------------------------------------------------------------------------
  echo
  ( kontrol ) || true
  echo
  yesil "kurulum tamam — yukarıdaki rapor sağlık kontrolüdür."
  exit 0
}

# ===========================================================================
#  KONTROL — sahadaki TEK kontrol/teşhis akışı (salt okunur)
#
#    1) KURULUM sağlam mı — ikili/env/ayar/beceri/rg/izin/kısayol (ağ gerekmez)
#    2) kurum AI UCU sağlıklı mı — DNS/TCP/models/sohbet/akış/araç çağrısı
#
#  EKRAN SÖZLEŞMESİ: çıktı HER MODDA ≤29 satır ve ≤100 sütundur; sonda tek
#  satırlık "SORUN:" teşhisi verilir. Bütçe `script/duman-kontrol-rapor.sh` ile
#  `wc -l` üzerinden sınanır — yeni satır eklerken ya bir satır birleştir ya da
#  satırı "yalnız sorun varsa bas" (sessiz kural) yap. Anahtar ekrana ASLA açık
#  basılmaz (maskelenir) ve "ps" çıktısında görünmemesi için curl'e geçici config
#  dosyasıyla verilir.
#
#  İKİ UÇ: env'de KURUM_URL_2 doluysa (opsiyonel KURUM_KEY_2/MODEL_ID_2) rapora
#  İKİ SÜTUNLU tek bir satır + karar satırı eklenir (toplam 2 satır): erişim ·
#  model listede mi · bağlam penceresi · 3 ölçümün medyan gecikmesi, sonda
#  "daha hizli: ..." kararı + iki ucun bağlam penceresi. Uç başına tam döküm
#  (3 satır) --ayrintili/-a ile açılır. Boşsa rapor tek uçlu haliyle basılır.
# ===========================================================================
son_log_hatasi() {
  [ -d "$LOG_DIZIN" ] || return 0
  local dosya
  dosya="$(find "$LOG_DIZIN" -maxdepth 1 -type f -name '*.log' -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-)"
  [ -n "$dosya" ] || return 0
  grep -hE 'err_[0-9A-Za-z]{6,}|ERROR|FATAL' "$dosya" 2>/dev/null | tail -1
}

# json_al <mod> <dosya> — python3 varsa JSON'dan alan çeker, yoksa boş döner.
json_al() {
  [ -n "$PY" ] || return 0
  "$PY" - "$1" "$2" << 'PY' 2> /dev/null || true
import json, sys

mod, dosya = sys.argv[1], sys.argv[2]
try:
    with open(dosya, "r", encoding="utf-8", errors="replace") as handle:
        data = json.load(handle)
except Exception:
    sys.exit(0)

def models(data):
    if isinstance(data, dict):
        return data.get("data") or data.get("models") or []
    return data if isinstance(data, list) else []

PENCERE_ALANLARI = ("max_model_len", "context_length", "max_context_length", "context_window", "max_seq_len")

if mod == "model-listesi":
    for item in models(data):
        if isinstance(item, dict):
            print(item.get("id") or item.get("name") or "")
        elif isinstance(item, str):
            print(item)
elif mod == "pencere":
    for item in models(data):
        if not isinstance(item, dict):
            continue
        havuz = dict(item)
        for alt in ("meta", "metadata", "config"):
            if isinstance(item.get(alt), dict):
                havuz.update(item[alt])
        for alan in PENCERE_ALANLARI:
            deger = havuz.get(alan)
            if isinstance(deger, int) and deger > 0:
                print("%s\t%s\t%s" % (item.get("id") or item.get("name") or "?", alan, deger))
                break
elif mod == "hata-mesaji":
    hata = data.get("error") if isinstance(data, dict) else None
    if isinstance(hata, dict):
        print(str(hata.get("message") or hata.get("type") or "")[:300])
    elif isinstance(hata, str):
        print(hata[:300])
    elif isinstance(data, dict) and isinstance(data.get("message"), str):
        print(data["message"][:300])
elif mod == "sohbet-cevabi":
    try:
        mesaj = data["choices"][0]["message"]
        icerik = mesaj.get("content") or ""
        if not icerik and mesaj.get("reasoning_content"):
            icerik = "(yalniz reasoning_content dondu)"
        print("icerik\t%s" % " ".join(str(icerik).split())[:120])
    except Exception:
        pass
    kullanim = data.get("usage") if isinstance(data, dict) else None
    if isinstance(kullanim, dict):
        print("kullanim\tprompt=%s completion=%s toplam=%s" % (
            kullanim.get("prompt_tokens", "?"),
            kullanim.get("completion_tokens", "?"),
            kullanim.get("total_tokens", "?"),
        ))
    try:
        bitis = data["choices"][0].get("finish_reason")
        if bitis:
            print("bitis\t%s" % bitis)
    except Exception:
        pass
elif mod == "arac-cagrisi":
    try:
        mesaj = data["choices"][0]["message"]
    except Exception:
        sys.exit(0)
    cagrilar = mesaj.get("tool_calls") or []
    if cagrilar:
        ilk = cagrilar[0]
        fonksiyon = ilk.get("function") or {}
        print("ad\t%s" % fonksiyon.get("name", "?"))
        print("argüman\t%s" % str(fonksiyon.get("arguments", ""))[:120])
    else:
        print("yok\t%s" % " ".join(str(mesaj.get("content") or "").split())[:120])
PY
}

# --- kontrolün kurulum bölümü (ağ gerekmez) --------------------------------
kontrol_kurulum() {
  local repo_bin="$KOK/bin/opencode" kurulu_bin="$HOME/.opencode/bin/opencode"
  local ayar_dizin="$HOME/.config/opencode"
  local kurulu_cfg="$ayar_dizin/opencode.json"
  local rg_dizin="${XDG_CACHE_HOME:-$HOME/.cache}/opencode/bin"

  if [ "$MOD" = "tam" ]; then
    printf '== opencode KONTROL · %s · %s · kok: %s\n' \
      "$(date '+%Y-%m-%d %H:%M')" "$(hostname 2> /dev/null || echo '?')" "$KOK"
    bolum "KURULUM (ag gerekmez)"
  else
    printf '== opencode KURULUM KONTROL · %s · %s · kok: %s\n' \
      "$(date '+%Y-%m-%d %H:%M')" "$(hostname 2> /dev/null || echo '?')" "$KOK"
    bolum "ayar: $ayar_dizin"
  fi

  # --- T4: derleme künyesi + repo HEAD (ikili ↔ surum ↔ commit) -------------
  # Künye kurulu ikilinin yanındadır; yoksa repo kopyasına düşülür. Boyut alanı
  # künyenin gerçekten BU ikiliye ait olduğunu doğrular (elle kopyalanmış ikili
  # bayat künyeyle "tutarlı" görünmesin).
  KUNYE_DOSYA=""
  if [ -f "$kurulu_bin.derleme" ]; then
    KUNYE_DOSYA="$kurulu_bin.derleme"
  elif [ -f "$repo_bin.derleme" ]; then
    KUNYE_DOSYA="$repo_bin.derleme"
  fi
  local k_commit k_tarih k_kirli k_boyut k_surum repo_head="" gercek_boyut="" kunye_uyar=""
  k_commit="$(kunye_oku commit)"
  k_tarih="$(kunye_oku tarih)"
  k_kirli="$(kunye_oku kirli)"
  k_boyut="$(kunye_oku boyut)"
  k_surum="$(kunye_oku surum)"
  if command -v git > /dev/null 2>&1 && [ -d "$KOK/.git" ]; then
    repo_head="$(git -C "$KOK" rev-parse --short HEAD 2> /dev/null || true)"
  fi
  [ -f "$kurulu_bin" ] && gercek_boyut="$(stat -c '%s' "$kurulu_bin" 2> /dev/null || echo '')"
  if [ -n "$KUNYE_DOSYA" ] && [ -n "$k_boyut" ] && [ -n "$gercek_boyut" ] && [ "$k_boyut" != "$gercek_boyut" ]; then
    kunye_uyar="derleme kunyesi ikiliyle eslesmiyor (boyut $gercek_boyut ≠ kunye $k_boyut)"
    k_commit=""; k_tarih=""
  fi

  # 1) ikili (kurulu olan asıl önemli; repo içindeki kaynak ikili ek bilgi)
  if [ -x "$kurulu_bin" ]; then
    local surum
    if surum="$(timeout 30 "$kurulu_bin" --version 2>&1)"; then
      local esit=""
      [ -n "$k_commit" ] && [ -n "$repo_head" ] && [ "$k_commit" = "$repo_head" ] && esit=" (=HEAD)"
      satir "ikili" ok "surum $surum · commit ${k_commit:-?}${esit} · derleme ${k_tarih:-?} · HEAD ${repo_head:-?}"
    else
      satir "ikili" hata "kurulu ikili calismiyor: $(kis "$surum" 60)"
      sorun_kaydet "kurulu ikili calismiyor — ./kur.sh ile yeniden kur"
    fi
    # Tutarsızlık varsa TEK uyarı satırı (denetim bulgusu 3). Sağlam kurulumda
    # bu satır hiç basılmaz — rapor satır bütçesi (≤29) korunur.
    local tutarsiz=""
    if [ -n "${surum:-}" ] && [ "$surum" != "$SURUM" ]; then
      tutarsiz="ikili surum $surum, kur.sh bekleneni $SURUM"
    fi
    if [ -n "$k_surum" ] && [ -n "${surum:-}" ] && [ "$k_surum" != "$surum" ]; then
      tutarsiz="${tutarsiz:+$tutarsiz · }kunye surumu $k_surum, ikili $surum"
    fi
    if [ -n "$kunye_uyar" ]; then
      tutarsiz="${tutarsiz:+$tutarsiz · }$kunye_uyar"
    elif [ -z "$KUNYE_DOSYA" ]; then
      tutarsiz="${tutarsiz:+$tutarsiz · }derleme kunyesi yok (ikili hangi commit'ten geldigi izlenemiyor)"
    elif [ -n "$k_commit" ] && [ -n "$repo_head" ] && [ "$k_commit" != "$repo_head" ]; then
      tutarsiz="${tutarsiz:+$tutarsiz · }ikili commit $k_commit, repo HEAD $repo_head"
    fi
    [ "$k_kirli" = "1" ] && tutarsiz="${tutarsiz:+$tutarsiz · }derleme aninda calisma agaci kirliydi"
    if [ -n "$tutarsiz" ]; then
      satir "surum" uyar "$tutarsiz — ./kur.sh (gerekirse ALP_DERLE=1 ./kur.sh)"
      ayr "kunye dosyasi: ${KUNYE_DOSYA:-yok}"
      ayr "kur.sh SURUM=$SURUM · KANAL=$KANAL · repo HEAD=${repo_head:-?}"
    fi
  elif [ -f "$repo_bin" ]; then
    satir "ikili" hata "bin/opencode var ama kurulmamis (~/.opencode/bin/opencode yok) — ./kur.sh"
    sorun_kaydet "kurulum yapilmamis — once ./kur.sh calistir"
  else
    satir "ikili" hata "ne bin/opencode ne ~/.opencode/bin/opencode var — ./kur.sh"
    sorun_kaydet "ikili yok — ./kur.sh (gerekirse kaynaktan derler)"
  fi

  # 2) ikili biçimi (ELF + glibc) — hangi ikili varsa onu incele
  local incele=""
  [ -f "$kurulu_bin" ] && incele="$kurulu_bin"
  [ -z "$incele" ] && [ -f "$repo_bin" ] && incele="$repo_bin"
  if [ -n "$incele" ]; then
    local bicim glibc
    bicim="$(file -b "$incele" 2> /dev/null || echo '?')"
    case "$bicim" in
      *"ELF 64-bit"*"x86-64"*)
        glibc=""
        if command -v objdump > /dev/null 2>&1; then
          glibc="$(objdump -T "$incele" 2> /dev/null | grep -o 'GLIBC_[0-9.]*' | sort -V | tail -1)"
        fi
        satir "bicim" ok "ELF 64-bit x86-64${glibc:+ · en yuksek $glibc (RHEL9=2.34 RHEL10=2.39)}"
        ;;
      *)
        satir "bicim" hata "beklenmeyen ikili bicimi: $(kis "$bicim" 55)"
        sorun_kaydet "ikili bicimi yanlis (x86-64 degil) — dogru paketi al"
        ;;
    esac
    ayr "incelenen ikili: $incele"
  else
    satir "bicim" uyar "ikili yok — bicim kontrolu atlandi"
  fi

  # 3) env dosyası
  if [ -f "$KOK/env" ]; then
    local izin eksik=""
    izin="$(stat -c '%a' "$KOK/env" 2> /dev/null || echo '?')"
    # shellcheck disable=SC1090
    (. "$KOK/env" 2> /dev/null; for d in KURUM_URL KURUM_KEY MODEL_ID; do [ -n "${!d:-}" ] || exit 1; done) \
      || eksik="eksik satir var"
    # Doldurulmamış şablon: KURUM_URL'de `KURUM_ENDPOINT`, MODEL_ID'de `<...>`
    # (T12 — gerçek model yolu repoda durmaz, uçtan `/v1/models` ile alınır).
    local sablon=""
    if grep -q 'KURUM_ENDPOINT' "$KOK/env" 2> /dev/null; then sablon="KURUM_ENDPOINT"; fi
    if grep -qE '^[[:space:]]*MODEL_ID=["'"'"']?<' "$KOK/env" 2> /dev/null; then
      sablon="${sablon:+$sablon + }MODEL_ID=<...>"
    fi
    if [ -n "$sablon" ]; then eksik="sablon degeri duruyor ($sablon)"; fi
    if [ -n "$eksik" ]; then
      satir "env" hata "$KOK/env — $eksik"
      sorun_kaydet "env doldurulmamis — $KOK/env icindeki 3 satiri doldur"
    else
      satir "env" ok "env dolu (KURUM_URL/KURUM_KEY/MODEL_ID) · izin $izin"
      [ "$izin" = "600" ] || satir "env" uyar "env izni $izin — 600 olmali (anahtar iceriyor): chmod 600 $KOK/env"
    fi
  else
    satir "env" hata "$KOK/env YOK — ./kur.sh calistir (env.example'dan otomatik olusturulur)"
    sorun_kaydet "env dosyasi yok — ./kur.sh (env.example'dan olusturur)"
  fi

  # 4) kurulu ayar (opencode.json)
  if [ -f "$kurulu_cfg" ]; then
    local izin gecerli=1
    izin="$(stat -c '%a' "$kurulu_cfg" 2> /dev/null || echo '?')"
    if [ -n "$PY" ] && ! "$PY" -c 'import json,sys; json.load(open(sys.argv[1]))' "$kurulu_cfg" 2> /dev/null; then
      gecerli=0
    fi
    if [ "$gecerli" -eq 0 ]; then
      satir "ayar" hata "$kurulu_cfg GECERSIZ JSON — ./kur.sh"
      sorun_kaydet "kurulu opencode.json bozuk — ./kur.sh yeniden yazar"
    elif grep -qE 'KURUM_ENDPOINT|MODEL_ID_YER_TUTUCU' "$kurulu_cfg"; then
      satir "ayar" hata "kurulu opencode.json'da sablon degeri duruyor — ./kur.sh"
      sorun_kaydet "kurulu ayar sablon halinde — ./kur.sh calistir"
    else
      satir "ayar" ok "opencode.json gecerli · sablon dolu · izin $izin"
      [ "$izin" = "600" ] || satir "ayar" uyar "opencode.json izni $izin — apiKey iceriyor, 600 olmali"
    fi
  else
    satir "ayar" hata "$kurulu_cfg YOK — ./kur.sh calistirilmamis"
    sorun_kaydet "kurulum yapilmamis — ./kur.sh calistir"
  fi

  # 5) beceriler + AGENTS.md
  local cekirdek onayli park kurulu_beceri
  cekirdek="$(grep -oP '^CORE_SKILLS=\(\K[^)]*' "$KOK/kur.sh" 2> /dev/null | wc -w)"
  [ "$cekirdek" -gt 0 ] 2> /dev/null || cekirdek="?"
  onayli="$(find "$KOK/knowledge/skills/approved" -mindepth 1 -maxdepth 1 -type d 2> /dev/null | wc -l)"
  park="$(find "$KOK/knowledge/skills/parked" -mindepth 1 -maxdepth 1 -type d 2> /dev/null | wc -l)"
  if [ -d "$ayar_dizin/skills" ]; then
    kurulu_beceri="$(find "$ayar_dizin/skills" -mindepth 1 -maxdepth 1 -type d | wc -l)"
    if [ "$kurulu_beceri" -gt 0 ]; then
      satir "beceri" ok "kurulu $kurulu_beceri (cekirdek $cekirdek) · repo: approved $onayli + parked $park"
    else
      satir "beceri" uyar "kurulu beceri dizini bos — ./kur.sh"
    fi
  else
    satir "beceri" hata "$ayar_dizin/skills YOK — ./kur.sh calistirilmamis"
    sorun_kaydet "beceriler kurulmamis — ./kur.sh calistir"
  fi
  if [ -f "$ayar_dizin/AGENTS.md" ]; then
    satir "AGENTS" ok "kurulu: ~/.config/opencode/AGENTS.md"
  else
    satir "AGENTS" hata "AGENTS.md kurulu degil (kurum kurallari yuklenmez) — ./kur.sh"
    sorun_kaydet "AGENTS.md kurulu degil — ./kur.sh calistir"
  fi

  # 6) knowledge iskeleti
  local iskelet=(skills/approved skills/parked skills/experimental skills/generated runbooks
    incidents lessons-learned operations-notes architecture roadmap policy)
  local eksik_dizin="" d
  for d in "${iskelet[@]}"; do
    [ -d "$KOK/knowledge/$d" ] || eksik_dizin="$eksik_dizin $d"
  done
  if [ -z "$eksik_dizin" ]; then
    satir "knowledge" ok "iskelet tam (${#iskelet[@]} dizin)"
  else
    satir "knowledge" hata "eksik dizin:$(kis "$eksik_dizin" 55)"
    sorun_kaydet "knowledge iskeleti eksik — depo eksik senkronlanmis (git/rsync)"
  fi

  # 7) ripgrep
  if command -v rg > /dev/null 2>&1; then
    satir "rg" ok "PATH'te: $(command -v rg) ($(rg --version 2> /dev/null | head -1))"
  elif [ -x "$rg_dizin/rg" ]; then
    satir "rg" ok "kurulu: ~/.cache/opencode/bin/rg ($("$rg_dizin/rg" --version 2> /dev/null | head -1))"
  else
    satir "rg" hata "rg YOK — grep/glob araclari kurum aginda kirilir (./kur.sh)"
    sorun_kaydet "ripgrep yok — ./kur.sh (bin/ripgrep.tar.xz gerekir)"
  fi

  # 8) izin özeti + bağlam penceresi
  if [ -f "$kurulu_cfg" ] && [ -n "$PY" ]; then
    local ozet
    ozet="$("$PY" - "$kurulu_cfg" << 'PY' 2> /dev/null
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    sys.exit(0)
p = d.get("permission", {})
b = p.get("bash", {})
bash_yildiz = b.get("*") if isinstance(b, dict) else b
ctx = "?"
for _, sag in (d.get("provider") or {}).items():
    for _, m in (sag.get("models") or {}).items():
        ctx = (m.get("limit") or {}).get("context") or "?"
print("ozet\tedit=%s ext_dir=%s bash.*=%s agent=%s ctx=%s" % (
    p.get("edit"), p.get("external_directory"), bash_yildiz, d.get("default_agent"), ctx))
if p.get("edit") == "allow":
    print("ihlal\tedit=allow — THREAT-MODEL.md §4 mutlak sinirini ihlal ediyor")
if p.get("external_directory") != "ask":
    print("uyari\texternal_directory beklenen 'ask' degil: %s" % p.get("external_directory"))
PY
)"
    local metin
    metin="$(printf '%s\n' "$ozet" | grep '^ozet' | cut -f2-)"
    if printf '%s\n' "$ozet" | grep -q '^ihlal'; then
      satir "izin" hata "$(printf '%s\n' "$ozet" | grep '^ihlal' | cut -f2-)"
      sorun_kaydet "izin ihlali: edit=allow — engine/opencode.json duzelt, ./kur.sh"
    elif printf '%s\n' "$ozet" | grep -q '^uyari'; then
      satir "izin" uyar "$(printf '%s\n' "$ozet" | grep '^uyari' | cut -f2-)"
      ayr "$metin"
    elif [ -n "$metin" ]; then
      satir "izin" ok "$metin"
    else
      satir "izin" uyar "izin ozeti okunamadi (opencode.json ayristirilamadi)"
    fi
  else
    satir "izin" uyar "izin ozeti atlandi (kurulu opencode.json yok veya python3 yok)"
  fi

  # 9) kısayol
  local kisayol
  kisayol="$(command -v opencode 2> /dev/null || true)"
  if [ -n "$kisayol" ]; then
    local hedef
    hedef="$(readlink -f "$kisayol" 2> /dev/null || echo "$kisayol")"
    if [ "$hedef" = "$(readlink -f "$kurulu_bin" 2> /dev/null || echo "$kurulu_bin")" ]; then
      satir "kisayol" ok "$kisayol -> ~/.opencode/bin/opencode"
    else
      satir "kisayol" uyar "PATH'teki '$kisayol' baska hedefi gosteriyor: $(kis_son "$hedef" 35)"
      ayr "beklenen: $kurulu_bin"
      ayr "bulunan : $hedef"
      ayr "duzeltmek icin: ./kur.sh (eskisini yedekler, kisayolu cevirir)"
    fi
  else
    satir "kisayol" uyar "'opencode' PATH'te yok — ./kur.sh veya tam yolla calistir"
  fi

  # 10) terminal karakter kümesi (A21) — TUI spinner'ı braille glifleri kullanır
  #     (packages/tui/src/component/spinner.tsx). Locale UTF-8 degilse ekranda kutu/"?" cikar.
  #     SESSIZ KURAL: yalnız sorun varsa satır basar → saglam kurulumda rapor uzamaz (A2, ≤29 satır).
  local yerel="${LC_ALL:-${LC_CTYPE:-${LANG:-}}}"
  case "$yerel" in
    *UTF-8* | *utf-8* | *UTF8* | *utf8*) ;;
    *)
      satir "locale" uyar "karakter kumesi UTF-8 degil (${yerel:-bos}) — TUI glifleri kutu/? cikar: export LANG=C.UTF-8"
      ayr "kalici cozum: ~/.bashrc icine 'export LANG=C.UTF-8' (ya da tr_TR.UTF-8 kuruluysa o)"
      ayr "MobaXterm tarafi: Settings > Terminal > Font = UTF-8 destekli + Charset = UTF-8"
      ayr "gecici cozum: TUI icinde Ctrl+P > 'Disable animations' (animasyon glifleri kapanir)"
      ;;
  esac

  # tam modda burada bitmez — uç teşhisi de aynı rapora eklenir, tek SORUN satırı sonda.
  if [ "$MOD" != "kurulum" ]; then return 0; fi
  if [ -n "$SORUN" ]; then bitir 1 "$SORUN"; fi
  if [ "$HATA" -gt 0 ]; then bitir 1 "kurulumda $HATA hata — yukaridaki ✗ satirlarina bak"; fi
  bitir 0 "yok — kurulum saglam ($UYARI uyari). Uc testi icin: ./kur.sh kontrol"
}

# <url> -> host:port (varsa kullanıcı bilgisi atılır; anahtar hiçbir yerde basılmaz)
host_port() {
  local kalan="${1#*://}"
  kalan="${kalan%%/*}"
  printf '%s' "${kalan##*@}"
}

kontrol() {
  # Kontrol salt okunurdur ve her adımın çıkış kodunu KENDİ yorumlar: `set -e`
  # burada kapalıdır (ilk 404'te betiğin ölmesi raporu yarıda keserdi).
  set +e

  GENISLIK=100
  [ "$AYRINTILI" -eq 1 ] && GENISLIK=100000

  if [ "$MOD" = "kurulum" ] || [ "$MOD" = "tam" ]; then kontrol_kurulum; fi

  # =========================================================================
  #  uç teşhisi
  # =========================================================================
  # Kabukta zaten export edilmiş değerler env dosyasını EZER (kaçış kapısı),
  # argümanlar da hepsini ezer.
  local ONCEKI_URL="${KURUM_URL:-}"
  local ONCEKI_KEY="${KURUM_KEY:-}"
  local ONCEKI_MODEL="${MODEL_ID:-}"
  local ONCEKI_PENCERE="${KURUM_MAX_CONTEXT:-}"
  # opsiyonel ikinci uç (karşılaştırma) — yalnız KURUM_URL_2 doluysa devreye girer
  local ONCEKI_URL2="${KURUM_URL_2:-}"
  local ONCEKI_KEY2="${KURUM_KEY_2:-}"
  local ONCEKI_MODEL2="${MODEL_ID_2:-}"

  ENV_DOSYASI="$KOK/env"
  if [ -f "$ENV_DOSYASI" ]; then
    # shellcheck disable=SC1090
    . "$ENV_DOSYASI"
    ENV_KAYNAK="$ENV_DOSYASI"
  else
    ENV_KAYNAK="(env yok — kabuk degiskenleri/argumanlar)"
  fi

  [ -n "$ONCEKI_URL" ] && KURUM_URL="$ONCEKI_URL"
  [ -n "$ONCEKI_KEY" ] && KURUM_KEY="$ONCEKI_KEY"
  [ -n "$ONCEKI_MODEL" ] && MODEL_ID="$ONCEKI_MODEL"
  [ -n "$ONCEKI_PENCERE" ] && KURUM_MAX_CONTEXT="$ONCEKI_PENCERE"
  [ -n "$ARG_URL" ] && KURUM_URL="$ARG_URL"
  [ -n "$ARG_KEY" ] && KURUM_KEY="$ARG_KEY"
  [ -n "$ARG_MODEL" ] && MODEL_ID="$ARG_MODEL"
  [ -n "$ONCEKI_URL2" ] && KURUM_URL_2="$ONCEKI_URL2"
  [ -n "$ONCEKI_KEY2" ] && KURUM_KEY_2="$ONCEKI_KEY2"
  [ -n "$ONCEKI_MODEL2" ] && MODEL_ID_2="$ONCEKI_MODEL2"

  URL="${KURUM_URL:-}"
  KEY="${KURUM_KEY:-}"
  MODEL="${MODEL_ID:-}"
  PENCERE_ENV="${KURUM_MAX_CONTEXT:-}"
  # ikinci uç: yalnız URL2 doluysa karşılaştırma yapılır; anahtar/model boşsa 1. ucunki kullanılır
  URL2="${KURUM_URL_2:-}"
  KEY2="${KURUM_KEY_2:-}"
  MODEL2="${MODEL_ID_2:-}"

  # T12: MODEL_ID şablonda `<model-kimligi>` yer tutucusudur — boş değil ama dolu da
  # değil; doldurulmuş bir değerden `<` ile ayrılır (URL için aynı desen: satır ~1410).
  MODEL_SABLON=0
  case "$MODEL" in *'<'*) MODEL_SABLON=1 ;; esac

  if [ -z "$URL" ] || [ -z "$MODEL" ] || [ "$MODEL_SABLON" = 1 ]; then
    if [ "$MOD" = "tam" ]; then printf '%s\n' "$CIZGI"; else printf '== opencode UC KONTROL\n'; fi
    satir "env" hata "$ENV_DOSYASI — KURUM_URL ve/veya MODEL_ID bos/sablon"
    if [ ! -f "$ENV_DOSYASI" ]; then
      duz "olustur: ./kur.sh (env.local, yoksa env.example sablonundan env uretir — sonra doldur)"
    fi
    duz "gerekli satirlar: KURUM_URL=http(s)://<uc>:<port>/v1 · KURUM_KEY=dummy · MODEL_ID=<uctaki id>"
    bitir 2 "${SORUN:-env eksik — KURUM_URL/MODEL_ID doldurulmamis ($ENV_DOSYASI)}"
  fi
  [ -n "$KEY" ] || KEY="dummy"
  [ -n "$KEY2" ] || KEY2="$KEY"
  [ -n "$MODEL2" ] || MODEL2="$MODEL"

  if ! command -v curl > /dev/null 2>&1; then
    if [ "$MOD" = "tam" ]; then printf '%s\n' "$CIZGI"; else printf '== opencode UC KONTROL\n'; fi
    bitir 3 "${SORUN:-curl yok — uc teshisi curl olmadan calisamaz (dnf install curl)}"
  fi

  TMP="$(mktemp -d "${TMPDIR:-/tmp}/kur-kontrol.XXXXXX")" || {
    hata "geçici dizin oluşturulamadı"
    exit 3
  }
  trap 'rm -rf "$TMP"' EXIT
  umask 077

  # Anahtar "ps" çıktısında görünmesin diye curl'e config dosyasıyla verilir.
  CURL_CFG="$TMP/curl.cfg"
  {
    printf 'silent\n'
    printf 'show-error\n'
    printf 'header = "Authorization: Bearer %s"\n' "$KEY"
    printf 'header = "Content-Type: application/json"\n'
  } > "$CURL_CFG"
  chmod 600 "$CURL_CFG" 2> /dev/null || true

  KOK_URL="${URL%/}"

  # --- başlık (bölüm ayracı + başlık TEK satır: rapor bütçesi ≤29) ---------
  if [ "$MOD" != "tam" ]; then
    printf '== opencode UC KONTROL · %s · %s\n' "$(date '+%Y-%m-%d %H:%M')" "$(hostname 2> /dev/null || echo '?')"
  fi
  bolum "KURUM AI UCU · $KOK_URL"
  duz "model: $MODEL · anahtar: $(maskele "$KEY") · zaman asimi ${ZAMAN_ASIMI} sn"
  ayr "ayar kaynagi: $ENV_KAYNAK"
  [ -n "$PY" ] || satir "python3" uyar "python3 yok — JSON ayrintilari (model listesi, pencere) sinirli"

  # --- 1) URL biçimi -------------------------------------------------------
  URL_SORUN=""
  case "$URL" in
    http://* | https://*) ;;
    *) URL_SORUN="sema yok/yanlis (http:// veya https:// ile baslamali)" ;;
  esac
  case "$URL" in
    *KURUM_ENDPOINT* | *ornek.local* | *'<'*) URL_SORUN="sablon degeri iceriyor — env doldurulmamis" ;;
  esac
  case "$URL" in
    *[[:space:]]*) URL_SORUN="URL bosluk iceriyor (env satirinda tirnak/bosluk hatasi)" ;;
  esac

  KALAN="${URL#*://}"
  KALAN="${KALAN%%/*}"
  KULLANICI_KISMI="${KALAN##*@}"
  HOST="${KULLANICI_KISMI%%:*}"
  PORT=""
  case "$KULLANICI_KISMI" in
    *:*) PORT="${KULLANICI_KISMI##*:}" ;;
  esac
  if [ -z "$PORT" ]; then
    case "$URL" in
      https://*) PORT=443 ;;
      *) PORT=80 ;;
    esac
    PORT_NOT=" (varsayilan)"
  else
    PORT_NOT=""
  fi

  if [ -n "$URL_SORUN" ]; then
    satir "URL" hata "$URL_SORUN"
    sorun_kaydet "KURUM_URL bicimi hatali — $URL_SORUN ($ENV_DOSYASI)"
  else
    SON_EK=""
    case "$URL" in
      */v1) SON_EK="sonu /v1 (beklenen)" ;;
      */v1/) SON_EK="sonda fazladan '/' — kirpiliyor, env'i duzeltmek daha iyi" ;;
      */v1/*) SON_EK="/v1 sonrasi yol var: ${URL##*/v1}" ;;
      *) SON_EK="/v1 ile bitmiyor (OpenAI uyumlu uclarda kok genelde .../v1)" ;;
    esac
    case "$URL" in
      */v1) satir "URL" ok "host $HOST · port ${PORT}${PORT_NOT} · $SON_EK" ;;
      *) satir "URL" uyar "host $HOST · port ${PORT}${PORT_NOT} · $SON_EK" ;;
    esac
    ayr "istekler: $(uc_ver models) · $(uc_ver chat/completions)"
  fi

  # --- 2+3) ag: DNS + TCP (tek satirda) -----------------------------------
  # İki ayrı satırdı; rapor bütçesi (≤29) için birleştirildi. Bilgi aynı:
  # çözümlenen IP('ler) · portun açık olup olmadığı · tanımlı proxy değişkenleri.
  DNS_DURUM="ok"; DNS_METIN=""
  if printf '%s' "$HOST" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    DNS_METIN="IP $HOST (DNS gerekmiyor)"
  elif command -v getent > /dev/null 2>&1; then
    IPLER="$(getent ahosts "$HOST" 2> /dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
    if [ -n "${IPLER// /}" ]; then
      DNS_METIN="DNS $HOST -> ${IPLER% }"
    else
      DNS_DURUM="hata"; DNS_METIN="DNS $HOST cozumlenemedi (opencode da ayni hatayi alir)"
      sorun_kaydet "DNS cozulemiyor — $HOST (kontrol: cat /etc/resolv.conf · grep $HOST /etc/hosts)"
    fi
  elif [ -n "$PY" ]; then
    IPLER="$("$PY" -c 'import socket,sys
try:
    print(" ".join(sorted({x[4][0] for x in socket.getaddrinfo(sys.argv[1], None)})))
except Exception:
    pass' "$HOST" 2> /dev/null)"
    if [ -n "$IPLER" ]; then
      DNS_METIN="DNS $HOST -> $IPLER"
    else
      DNS_DURUM="hata"; DNS_METIN="DNS $HOST cozumlenemedi"
      sorun_kaydet "DNS cozulemiyor — $HOST"
    fi
  else
    DNS_DURUM="uyar"; DNS_METIN="DNS kontrolu atlandi (getent/python3 yok)"
  fi

  PROXY_NOT=""
  for degisken in http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY; do
    [ -n "${!degisken:-}" ] && PROXY_NOT="$PROXY_NOT $degisken"
  done
  [ -n "$PROXY_NOT" ] && PROXY_NOT=" · proxy:$PROXY_NOT"
  TCP_DURUM="ok"
  if timeout 10 bash -c "exec 3<>/dev/tcp/$HOST/$PORT" 2> /dev/null; then
    TCP_METIN="TCP $PORT acik"
  else
    TCP_DURUM="hata"; TCP_METIN="TCP $PORT KAPALI (guvenlik duvari/yanlis port/proxy)"
    sorun_kaydet "uc erisilemiyor (TCP $HOST:$PORT kapali) — ping $HOST · ss -tlnp (uc makinede)"
  fi

  AG_DURUM="ok"
  case "$DNS_DURUM$TCP_DURUM" in
    *hata*) AG_DURUM="hata" ;;
    *uyar*) AG_DURUM="uyar" ;;
  esac
  satir "ag" "$AG_DURUM" "$DNS_METIN · ${TCP_METIN}${PROXY_NOT}"

  # --- 4) GET /models ------------------------------------------------------
  MODELS_GOVDE="$TMP/models.json"
  MODEL_LISTESI=""
  MODEL_SAYISI=0
  MODEL_BULUNDU=0
  cikti="$(curl -K "$CURL_CFG" --max-time "$ZAMAN_ASIMI" -o "$MODELS_GOVDE" \
    -w '%{http_code} %{time_total}' "$(uc_ver models)" 2> "$TMP/models.err")"
  curl_kod=$?
  MODELS_DURUM="${cikti%% *}"
  MODELS_SURE="${cikti##* }"
  if [ $curl_kod -ne 0 ]; then
    curl_hata="$(tr -d '\n' < "$TMP/models.err" | cut -c1-120)"
    satir "/models" hata "istek basarisiz (curl $curl_kod): $curl_hata"
    sorun_kaydet "uc erisilemiyor (curl $curl_kod) — $curl_hata"
  elif [ "$MODELS_DURUM" = "200" ]; then
    MODEL_LISTESI="$(json_al model-listesi "$MODELS_GOVDE" | sed '/^$/d')"
    if [ -z "$MODEL_LISTESI" ] && [ -z "$PY" ]; then
      MODEL_LISTESI="$(grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' "$MODELS_GOVDE" | sed 's/.*"\([^"]*\)"$/\1/')"
    fi
    if [ -n "$MODEL_LISTESI" ]; then
      MODEL_SAYISI="$(printf '%s\n' "$MODEL_LISTESI" | wc -l | tr -d ' ')"
      if printf '%s\n' "$MODEL_LISTESI" | grep -Fxq "$MODEL"; then
        MODEL_BULUNDU=1
        satir "/models" ok "HTTP 200 · $(sn "$MODELS_SURE") sn · $MODEL_SAYISI model · MODEL_ID listede"
      else
        satir "/models" hata "HTTP 200 · $MODEL_SAYISI model · MODEL_ID listede YOK"
        sorun_kaydet "MODEL_ID ucta yok — $MODEL (listeden birebir kopyala, sonra ./kur.sh)"
        # hata durumunda aday modelleri göster (kısa modda en fazla 3)
        if [ "$AYRINTILI" -eq 1 ]; then
          printf '%s\n' "$MODEL_LISTESI" | sed 's/^/             - /'
        else
          printf '%s\n' "$MODEL_LISTESI" | head -3 | while IFS= read -r m; do
            printf '             - %s\n' "$(kis "$m" 80)"
          done
        fi
      fi
      [ "$AYRINTILI" -eq 1 ] && [ "$MODEL_BULUNDU" -eq 1 ] && printf '%s\n' "$MODEL_LISTESI" | sed 's/^/             - /'
    else
      satir "/models" uyar "HTTP 200 ama model listesi ayristirilamadi (beklenmeyen JSON)"
      ayr "ham govde: $(tr -d '\n' < "$MODELS_GOVDE" | cut -c1-200)"
    fi
  else
    mesaj="$(json_al hata-mesaji "$MODELS_GOVDE")"
    [ -z "$mesaj" ] && mesaj="$(tr -d '\n' < "$MODELS_GOVDE" | cut -c1-120)"
    satir "/models" hata "HTTP $MODELS_DURUM · $(kis "$mesaj" 50)"
    case "$MODELS_DURUM" in
      401 | 403) sorun_kaydet "kimlik dogrulama — /models HTTP $MODELS_DURUM, KURUM_KEY yanlis/eksik ($ENV_DOSYASI)" ;;
      404) sorun_kaydet "/models HTTP 404 — KURUM_URL gercekten /v1 koku mu? ($KOK_URL)" ;;
      000) sorun_kaydet "uc yanit vermedi (HTTP 000) — TLS/proxy/zaman asimi" ;;
      *) sorun_kaydet "/models HTTP $MODELS_DURUM — $(kis "$mesaj" 60)" ;;
    esac
  fi

  # --- 5) POST /chat/completions (akışsız) ---------------------------------
  SOHBET_OK=0
  MODEL_JSON="$(printf '%s' "$MODEL" | sed 's/\\/\\\\/g; s/"/\\"/g; s/^/"/; s/$/"/')"
  ISTEK="$TMP/chat.json"
  cat > "$ISTEK" << JSON
{"model": $MODEL_JSON,
 "messages": [{"role": "user", "content": "Yalnizca OK yaz."}],
 "max_tokens": 16, "temperature": 0, "stream": false}
JSON
  SOHBET_GOVDE="$TMP/chat-cevap.json"
  cikti="$(curl -K "$CURL_CFG" --max-time "$ZAMAN_ASIMI" -o "$SOHBET_GOVDE" \
    -w '%{http_code} %{time_total}' -d @"$ISTEK" "$(uc_ver chat/completions)" 2> "$TMP/chat.err")"
  curl_kod=$?
  SOHBET_DURUM="${cikti%% *}"
  SOHBET_SURE="${cikti##* }"
  if [ $curl_kod -ne 0 ]; then
    curl_hata="$(tr -d '\n' < "$TMP/chat.err" | cut -c1-120)"
    satir "chat" hata "istek basarisiz (curl $curl_kod): $curl_hata"
    sorun_kaydet "/chat/completions istegi basarisiz (curl $curl_kod) — $curl_hata"
  elif [ "$SOHBET_DURUM" = "200" ]; then
    SOHBET_OK=1
    ayrinti="$(json_al sohbet-cevabi "$SOHBET_GOVDE")"
    bitis="$(printf '%s\n' "$ayrinti" | grep '^bitis' | cut -f2-)"
    kullanim="$(printf '%s\n' "$ayrinti" | grep '^kullanim' | cut -f2-)"
    satir "chat" ok "HTTP 200 · $(sn "$SOHBET_SURE") sn${bitis:+ · finish=$bitis}${kullanim:+ · $kullanim}"
    if [ "$AYRINTILI" -eq 1 ]; then
      printf '%s\n' "$ayrinti" | while IFS=$'\t' read -r etiket deger; do
        [ -n "$etiket" ] && printf '             %s: %s\n' "$etiket" "$deger"
      done
    fi
  else
    mesaj="$(json_al hata-mesaji "$SOHBET_GOVDE")"
    [ -z "$mesaj" ] && mesaj="$(tr -d '\n' < "$SOHBET_GOVDE" | cut -c1-120)"
    satir "chat" hata "HTTP $SOHBET_DURUM · $(kis "$mesaj" 50)"
    sorun_kaydet "/chat/completions HTTP $SOHBET_DURUM — $(kis "$mesaj" 60)"
  fi

  # --- 6) akış (stream) — opencode HER ZAMAN akış kullanır -----------------
  AKIS_OK=0
  ISTEK_AKIS="$TMP/chat-stream.json"
  sed 's/"stream": false/"stream": true/' "$ISTEK" > "$ISTEK_AKIS"
  AKIS_GOVDE="$TMP/stream.txt"
  cikti="$(curl -K "$CURL_CFG" -N --max-time "$ZAMAN_ASIMI" -o "$AKIS_GOVDE" \
    -w '%{http_code} %{time_starttransfer} %{time_total}' -d @"$ISTEK_AKIS" \
    "$(uc_ver chat/completions)" 2> "$TMP/stream.err")"
  curl_kod=$?
  AKIS_DURUM="$(printf '%s' "$cikti" | awk '{print $1}')"
  AKIS_ILK="$(printf '%s' "$cikti" | awk '{print $2}')"
  AKIS_TOPLAM="$(printf '%s' "$cikti" | awk '{print $3}')"
  if [ $curl_kod -ne 0 ]; then
    curl_hata="$(tr -d '\n' < "$TMP/stream.err" | cut -c1-100)"
    satir "stream" hata "istek basarisiz (curl $curl_kod): $curl_hata"
    if [ "$curl_kod" = "28" ]; then
      sorun_kaydet "stream zaman asimi (curl 28) — uc akisi hic baslatmiyor / proxy tamponluyor"
    else
      sorun_kaydet "stream basarisiz (curl $curl_kod) — $curl_hata"
    fi
  elif [ "$AKIS_DURUM" = "200" ]; then
    parca="$(grep -c '^data:' "$AKIS_GOVDE" 2> /dev/null || true)"
    parca="$(printf '%s' "$parca" | tr -dc '0-9')"
    [ -n "$parca" ] || parca=0
    if [ "$parca" -gt 0 ]; then
      AKIS_OK=1
      if grep -q '^data: \[DONE\]' "$AKIS_GOVDE"; then
        satir "stream" ok "HTTP 200 · $parca SSE parcasi · ilk bayt $(sn "$AKIS_ILK") sn · [DONE] ile kapandi"
      else
        satir "stream" uyar "HTTP 200 · $parca parca · [DONE] YOK — baglanti yarida kopmus olabilir"
      fi
      ayr "ilk bayt ${AKIS_ILK} sn · toplam ${AKIS_TOPLAM} sn (ham)"
    else
      satir "stream" hata "HTTP 200 ama SSE parcasi yok — uc text/event-stream dondurmuyor"
      sorun_kaydet "stream calismiyor (HTTP 200, SSE parcasi 0) — proxy tamponluyor (nginx: proxy_buffering off)"
    fi
  else
    mesaj="$(json_al hata-mesaji "$AKIS_GOVDE")"
    [ -z "$mesaj" ] && mesaj="$(tr -d '\n' < "$AKIS_GOVDE" | cut -c1-120)"
    satir "stream" hata "HTTP $AKIS_DURUM (akissiz istek $SOHBET_DURUM dondu) · $(kis "$mesaj" 35)"
    sorun_kaydet "stream HTTP $AKIS_DURUM — $(kis "$mesaj" 60)"
  fi

  # --- 7) tool_call --------------------------------------------------------
  ARAC_OK=0
  ARAC_DESTEK_YOK=0
  ISTEK_ARAC="$TMP/chat-tool.json"
  cat > "$ISTEK_ARAC" << JSON
{"model": $MODEL_JSON,
 "messages": [{"role": "user", "content": "Ankara'nin hava durumunu ogren. Bunun icin araci kullan."}],
 "tools": [{"type": "function", "function": {"name": "hava_durumu",
   "description": "Bir sehrin hava durumunu dondurur",
   "parameters": {"type": "object", "properties": {"sehir": {"type": "string", "description": "sehir adi"}},
     "required": ["sehir"]}}}],
 "tool_choice": "auto", "max_tokens": 128, "temperature": 0, "stream": false}
JSON
  ARAC_GOVDE="$TMP/tool.json"
  cikti="$(curl -K "$CURL_CFG" --max-time "$ZAMAN_ASIMI" -o "$ARAC_GOVDE" \
    -w '%{http_code} %{time_total}' -d @"$ISTEK_ARAC" "$(uc_ver chat/completions)" 2> "$TMP/tool.err")"
  curl_kod=$?
  ARAC_DURUM="${cikti%% *}"
  ARAC_SURE="${cikti##* }"
  if [ $curl_kod -ne 0 ]; then
    satir "tool_call" uyar "istek basarisiz (curl $curl_kod)"
  elif [ "$ARAC_DURUM" = "200" ]; then
    sonuc="$(json_al arac-cagrisi "$ARAC_GOVDE")"
    if printf '%s' "$sonuc" | grep -q '^ad	'; then
      ARAC_OK=1
      satir "tool_call" ok "HTTP 200 · $(sn "$ARAC_SURE") sn · model araci cagirdi: $(printf '%s\n' "$sonuc" | grep '^ad' | cut -f2-)"
      ayr "argüman: $(printf '%s\n' "$sonuc" | grep '^argüman' | cut -f2-)"
    elif grep -q '"tool_calls"' "$ARAC_GOVDE"; then
      ARAC_OK=1
      satir "tool_call" ok "HTTP 200 · yanitta tool_calls var"
    else
      satir "tool_call" uyar "HTTP 200 ama model araci cagirmadi (duz metin dondu) — ajan modu guvenilmez"
      ayr "$(printf '%s' "$sonuc" | cut -c1-160)"
    fi
  else
    ARAC_DESTEK_YOK=1
    mesaj="$(json_al hata-mesaji "$ARAC_GOVDE")"
    [ -z "$mesaj" ] && mesaj="$(tr -d '\n' < "$ARAC_GOVDE" | cut -c1-120)"
    satir "tool_call" hata "HTTP $ARAC_DURUM — uc 'tools' alanini kabul etmedi · $(kis "$mesaj" 30)"
    sorun_kaydet "uc tool_call kabul etmiyor (HTTP $ARAC_DURUM) — opencode her istege arac semasi ekler"
  fi

  # --- 8) bağlam penceresi + kurulu ayar karşılaştırması -------------------
  PENCERE_UC=""
  if [ -s "$MODELS_GOVDE" ]; then
    satir_pencere="$(json_al pencere "$MODELS_GOVDE" | grep -F "$MODEL" | head -1)"
    [ -n "$satir_pencere" ] && PENCERE_UC="$(printf '%s' "$satir_pencere" | cut -f3)"
  fi
  AYAR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode.json"
  AYAR_NOT=""
  if [ -f "$AYAR" ] && [ -n "$PY" ]; then
    kurulu="$("$PY" - "$AYAR" << 'PY' 2> /dev/null || true
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        cfg = json.load(handle)
except Exception:
    sys.exit(0)
for ad, saglayici in (cfg.get("provider") or {}).items():
    taban = ((saglayici.get("options") or {}).get("baseURL")) or ""
    for anahtar, model in (saglayici.get("models") or {}).items():
        # Karşılaştırılması gereken MODEL_ID, model nesnesinin "id" alanıdır;
        # sözlük anahtarı (ör. "kurum-model") şablondan gelir ve env ile eşleşmez.
        # (Eskiden anahtar karşılaştırılıyordu -> kurulum doğruyken bile "ayni DEGIL" uyarısı.)
        sinir = (model.get("limit") or {}).get("context") or "?"
        cikti = (model.get("limit") or {}).get("output") or "?"
        print("%s\t%s\t%s\t%s\t%s" % (ad, model.get("id") or anahtar, taban, sinir, cikti))
PY
)"
    if [ -n "$kurulu" ]; then
      KURULU_CTX="$(printf '%s\n' "$kurulu" | head -1 | cut -f4)"
      KURULU_OUT="$(printf '%s\n' "$kurulu" | head -1 | cut -f5)"
      if ! printf '%s\n' "$kurulu" | cut -f3 | grep -Fxq "$KOK_URL"; then
        AYAR_NOT="baseURL env ile ayni DEGIL"
      elif ! printf '%s\n' "$kurulu" | cut -f2 | grep -Fxq "$MODEL"; then
        AYAR_NOT="model kimligi env ile ayni DEGIL"
      fi
      if [ "$AYRINTILI" -eq 1 ]; then
        printf '%s\n' "$kurulu" | while IFS=$'\t' read -r s m t c; do
          printf '             kurulu ayar: %s/%s · baseURL=%s · context=%s\n' "$s" "$m" "$t" "$c"
        done
      fi
    fi
  fi
  # T3: çıktı sınırı — kurulu değer opencode.json'dan, "nereden geldiği" kurulum
  # künyesinden (kur-durum) okunur. Künye yoksa/eskimişse sessizce "4096 zaten
  # böyleydi" demeyiz: kaynak "bilinmiyor" diye basılır.
  CIKTI_UC=""
  if [ -s "$MODELS_GOVDE" ] && [ -n "$PY" ]; then
    # gövde argümanla geçiyor: uzun model listelerinde ARG_MAX'a dayanmasın diye kırpılır
    CIKTI_UC="$(uc_alanlari "$MODEL" "$(head -c 200000 "$MODELS_GOVDE")" | sed -n 's/^cikti\t//p' | head -1)"
  fi
  DURUM_DOSYA="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/kur-durum"
  CIKTI_NOT="kaynak bilinmiyor"
  if [ -f "$DURUM_DOSYA" ]; then
    d_cikti="$(sed -n 's/^cikti=//p' "$DURUM_DOSYA" 2> /dev/null | head -1)"
    d_kaynak="$(sed -n 's/^cikti_kaynak=//p' "$DURUM_DOSYA" 2> /dev/null | head -1)"
    if [ -n "$d_cikti" ] && [ "$d_cikti" = "${KURULU_OUT:-}" ] && [ -n "$d_kaynak" ]; then
      CIKTI_NOT="$d_kaynak"
    fi
  fi
  if [ -n "$CIKTI_UC" ] && [ -n "${KURULU_OUT:-}" ] && [ "$KURULU_OUT" != "?" ] \
    && [ "$CIKTI_UC" != "$KURULU_OUT" ]; then
    AYAR_NOT="${AYAR_NOT:+$AYAR_NOT · }uc cikti siniri $CIKTI_UC, kurulu $KURULU_OUT"
  fi

  PENCERE_METIN="baglam uc ${PENCERE_UC:-yok} · kurulu ${KURULU_CTX:-yok} · env ${PENCERE_ENV:-yok}"
  PENCERE_METIN="$PENCERE_METIN · cikti ${KURULU_OUT:-yok} ($CIKTI_NOT)"
  # Uyarı varken sayılar kısaltılır: eylem cümlesi ("... — ./kur.sh") satır
  # kırpmasına kurban gitmesin; tam metin --ayrintili'da basılır.
  PENCERE_KISA="baglam ${PENCERE_UC:-yok}/${KURULU_CTX:-yok} · cikti ${KURULU_OUT:-yok}"
  if [ -n "$AYAR_NOT" ]; then
    satir "ayar" uyar "$AYAR_NOT — ./kur.sh · $PENCERE_KISA"
    ayr "$PENCERE_METIN"
  elif [ -n "$PENCERE_UC" ] && [ -n "${KURULU_CTX:-}" ] && [ "$PENCERE_UC" != "${KURULU_CTX:-}" ]; then
    satir "ayar" uyar "uc ile kurulu baglam farkli — ./kur.sh · $PENCERE_KISA"
    ayr "$PENCERE_METIN"
  elif [ "$MODELS_DURUM" != "200" ]; then
    # uç yanıt vermediyse "✓" basmak yanıltıcı olur — yalnız bilgi satırı
    satir "ayar" bilgi "$PENCERE_METIN (uc yanit vermedi, karsilastirma yapilamadi)"
  else
    satir "ayar" ok "$PENCERE_METIN"
  fi

  # --- 9) log --------------------------------------------------------------
  SON_LOG="$(son_log_hatasi)"
  if [ -n "$SON_LOG" ]; then
    satir "log" uyar "son hata: $(kis "$SON_LOG" 70)"
  else
    satir "log" ok "son log dosyasinda err_/ERROR satiri yok ($LOG_DIZIN)"
  fi

  # --- 10) ikinci uç ile karşılaştırma (yalnız KURUM_URL_2 doluysa) --------
  # env'de KURUM_URL_2 yoksa bu bölüm hiç basılmaz (rapor eskisiyle birebir aynı).
  # Ölçüm en küçük istekle (GET /models) yapılır — ek sohbet isteği açılmaz.
  if [ -n "$URL2" ]; then
    OZET1="$(uc_olc uc1 "$KOK_URL" "$KEY" "$MODEL")"
    OZET2="$(uc_olc uc2 "$URL2" "$KEY2" "$MODEL2")"
    IFS=$'\t' read -r D1 _ _ C1 MS1 <<< "$OZET1"
    IFS=$'\t' read -r D2 _ _ C2 MS2 <<< "$OZET2"

    # Ekran sözleşmesi (T2): iki uç TEK bölümde, İKİ SÜTUN — kısa modda bu blok
    # toplam 2 satır (sütunlar + karar); eskiden 4 satırdı (ayrac + uc1 + uc2 +
    # karar) ve rapor 33 satıra çıkıyordu. Uç başına veri KORUNUR: erişim ·
    # model listede mi · bağlam penceresi · 3 ölçümün medyanı. Tam liste
    # --ayrintili/-a ile (uç başına 3 satır) açılır.
    printf ' %s | %s\n' "$(uc_sutun uc1 "$OZET1")" "$(uc_sutun uc2 "$OZET2")"
    uc_ayrinti uc1 "$KOK_URL" "$MODEL" "$OZET1"
    uc_ayrinti uc2 "${URL2%/}" "$MODEL2" "$OZET2"
    if [ "$D1" != "ok" ] || [ "$D2" != "ok" ]; then UYARI=$((UYARI + 1)); fi

    KARAR="karar yok — iki ucun da gecikmesi olculemedi"
    if [ "$D1" = "ok" ] && [ "$D2" = "ok" ] && [ "${MS1:-?}" != "?" ] && [ "${MS2:-?}" != "?" ]; then
      if [ "$MS1" -lt "$MS2" ]; then
        KARAR="daha hizli: uc1 ($MS1 vs $MS2 ms)"
      elif [ "$MS2" -lt "$MS1" ]; then
        KARAR="daha hizli: uc2 ($MS2 vs $MS1 ms)"
      else
        KARAR="hiz esit ($MS1 ms)"
      fi
    elif [ "$D1" = "ok" ]; then
      KARAR="yalniz uc1 yanit veriyor — uc2 elenir"
    elif [ "$D2" = "ok" ]; then
      KARAR="yalniz uc2 yanit veriyor — env'deki 1. ucu degistirmeyi dusun"
    fi
    # Bağlam penceresi karar satırında HER ZAMAN yazılır: sütunlarda uzun host
    # yüzünden kırpılsa bile uç başına bağlam verisi raporda kalsın.
    KARAR_NOT=""
    if [ "${C1:-?}" != "?" ] && [ "${C2:-?}" != "?" ] && [ -n "$C1" ] && [ -n "$C2" ]; then
      if [ "$C1" -gt "$C2" ] 2> /dev/null; then
        KARAR_NOT=" · baglam uc1 $C1 > uc2 $C2"
      elif [ "$C2" -gt "$C1" ] 2> /dev/null; then
        KARAR_NOT=" · baglam uc2 $C2 > uc1 $C1"
      else
        KARAR_NOT=" · baglam ikisi de $C1"
      fi
    fi
    # model kimligi uzun olabilir — karar satiri tasmasin diye yalniz "farkli" notu dusulur
    if [ "$D2" = "ok" ] && [ "$MODEL2" != "$MODEL" ]; then KARAR_NOT="$KARAR_NOT · uc2 modeli farkli"; fi
    duz ">> ${KARAR}${KARAR_NOT}"
  fi

  # --- SONUÇ ---------------------------------------------------------------
  if [ -n "$SORUN" ]; then bitir 1 "$SORUN"; fi
  if [ "$HATA" -gt 0 ]; then bitir 1 "yukaridaki ✗ satirlarina bak ($HATA hata, $UYARI uyari)"; fi

  EK=""
  if [ "$ARAC_DESTEK_YOK" -eq 1 ]; then
    EK=" ANCAK uc tool_call reddetti — ajan modu calismaz."
  elif [ "$ARAC_OK" -eq 0 ]; then
    EK=" ANCAK arac cagrisi dogrulanamadi — ajan modu guvenilmez olabilir."
  fi
  if [ "$SOHBET_OK" -eq 1 ] && [ "$AKIS_OK" -eq 1 ]; then
    if [ -n "$SON_LOG" ]; then
      bitir 0 "yok — uc saglikli, sorun opencode tarafinda; log: $(kis "$SON_LOG" 45)"
    fi
    bitir 0 "yok — uc saglikli, sorun opencode tarafinda.${EK} (log: temiz; opencode --log-level DEBUG)"
  fi
  bitir 1 "uc beklendigi gibi yanit vermedi — yukaridaki satirlara bak ($HATA hata, $UYARI uyari)"
}

# --- kontrolün yardımcıları (uç adresi, maskeleme, iki uç ölçümü) ----------
uc_ver() { printf '%s/%s' "$KOK_URL" "${1#/}"; }

maskele() {
  local deger="$1" uzunluk
  uzunluk="${#deger}"
  if [ "$uzunluk" -eq 0 ]; then
    printf '(bos)'
  elif [ "$deger" = "dummy" ]; then
    printf 'dummy (yer tutucu)'
  elif [ "$uzunluk" -lt 10 ]; then
    printf '**** (uzunluk: %s)' "$uzunluk"
  else
    printf '%s****%s (uzunluk: %s)' "${deger:0:3}" "${deger: -2}" "$uzunluk"
  fi
}

# medyan_ms <cfg> <adres> <ilk-ornek> — ilk istek 1. örnektir, 2 istek daha atılır;
# 3 örneğin medyanı (ms). Hiçbiri ölçülemezse boş döner. (Uç yavaşsa rapor en fazla
# 3 × --zaman-asimi bekler; erişilemeyen uçta hiç ölçüm yapılmaz.)
medyan_ms() {
  local cfg="$1" adres="$2" _tur sure olcum=""
  [ -n "${3:-}" ] && olcum="$3"$'\n'
  for _tur in 1 2; do
    sure="$(curl -K "$cfg" --max-time "$ZAMAN_ASIMI" -o /dev/null -w '%{time_total}' "$adres" 2> /dev/null)" || continue
    olcum="$olcum$sure"$'\n'
  done
  printf '%s' "$olcum" | sed '/^$/d' | LC_ALL=C sort -n \
    | LC_ALL=C awk '{d[NR] = $1} END {if (NR) printf "%d", d[int((NR + 1) / 2)] * 1000}'
}

# uc_olc <onek> <url> <key> <model> — sekmeyle ayrık: durum, host, bilgi, baglam, ms
uc_olc() {
  local onek="$1" adres="$2" anahtar="$3" model="$4"
  local cfg="$TMP/$onek.cfg" govde="$TMP/$onek-models.json"
  {
    printf 'silent\n'
    printf 'show-error\n'
    printf 'header = "Authorization: Bearer %s"\n' "$anahtar"
    printf 'header = "Content-Type: application/json"\n'
  } > "$cfg"
  chmod 600 "$cfg" 2> /dev/null || true
  local kok="${adres%/}" ilk durum ilk_sure liste ctx="" bilgi ms
  ilk="$(curl -K "$cfg" --max-time "$ZAMAN_ASIMI" -o "$govde" -w '%{http_code} %{time_total}' \
    "$kok/models" 2> /dev/null)" || ilk="000 "
  durum="${ilk%% *}"
  ilk_sure="${ilk##* }"
  if [ "$durum" != "200" ]; then
    # 000 = curl hic yanit alamadi (kapali port / TLS / proxy / zaman asimi)
    [ "$durum" = "000" ] && durum="baglanti yok" || durum="HTTP $durum"
    printf 'hata\t%s\t%s\t\t\n' "$(host_port "$adres")" "$durum"
    return 0
  fi
  liste="$(json_al model-listesi "$govde" | sed '/^$/d')"
  if [ -z "$liste" ] && [ -z "$PY" ]; then
    liste="$(grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' "$govde" | sed 's/.*"\([^"]*\)"$/\1/')"
  fi
  if [ -z "$liste" ]; then
    bilgi="model listesi okunamadi"
  elif printf '%s\n' "$liste" | grep -Fxq "$model"; then
    bilgi="model var"
  else
    bilgi="model YOK"
  fi
  ctx="$(json_al pencere "$govde" | grep -F "$model" | head -1 | cut -f3)"
  [ -n "$ctx" ] || ctx="$(json_al pencere "$govde" | head -1 | cut -f3)"
  ms="$(medyan_ms "$cfg" "$kok/models" "$ilk_sure")"
  printf 'ok\t%s\t%s\t%s\t%s\n' "$(host_port "$adres")" "$bilgi" "${ctx:-?}" "${ms:-?}"
}

# uc_sutun <etiket> <ozet-satiri> — iki uçlu raporun TEK SÜTUNU.
# Genişlik sabit: simge(1) + boşluk(1) + gövde(45) = 47; iki sütun + " | " = 97
# sütun, 100'lük ekrana sığar. Taşma olursa SADECE host kısalır — ölçüm sayıları
# (bağlam, medyan) her zaman görünür kalır; tam adres --ayrintili'da basılır.
# (Renk kodu yalnız baştaki simgede; gövde renksiz ki kırpma hesabı bozulmasın.)
uc_sutun() {
  local etiket="$1" durum host bilgi ctx ms govde simge bas kuyruk hw
  IFS=$'\t' read -r durum host bilgi ctx ms <<< "$2"
  if [ "$durum" = "ok" ]; then
    case "$bilgi" in
      "model var") bilgi="mdl ✓" ;;
      "model YOK") bilgi="mdl ✗" ;;
      *) bilgi="mdl ?" ;;
    esac
    simge="$(renk 32 '✓')"
    kuyruk=" · $bilgi · ctx${ctx:-?} · ${ms:-?}ms"
  else
    simge="$(renk 33 '!')"
    kuyruk=" · erisilemedi ($bilgi)"
  fi
  bas="$etiket "
  hw=$((45 - ${#bas} - ${#kuyruk}))
  [ "$hw" -lt 8 ] && hw=8
  govde="$bas$(kis "$host" "$hw")$kuyruk"
  printf '%s %s' "$simge" "$(printf '%-45s' "$(kis "$govde" 45)")"
}

# uc_ayrinti <etiket> <url> <model> <ozet> — yalnız --ayrintili: uç başına 3 satır
uc_ayrinti() {
  [ "$AYRINTILI" -eq 1 ] || return 0
  local etiket="$1" url="$2" model="$3" durum host bilgi ctx ms
  IFS=$'\t' read -r durum host bilgi ctx ms <<< "$4"
  ayr "$etiket uc    : $url ($host)"
  ayr "$etiket model : $model — $bilgi"
  ayr "$etiket olcum : baglam ${ctx:-?} · medyan ${ms:-?} ms (3 ornek, GET /models)"
}

# ===========================================================================
#  Kullanım ekranı + argüman düzeni
# ===========================================================================
kullanim() {
  cat << 'YARDIM'
kur.sh — opencode saha paketinin TEK betigi

Kullanim:  ./kur.sh [alt-komut] [secenek...]

Alt komutlar:
  (bos)      VARSAYILAN = kur
  kur        gerekirse derler, kurar, kisayolu duzeltir, sonda kontrol ekranini basar
  derle      yalniz kaynaktan derler (kurulum/kisayol yok)  [--bin-kopyala | --kurulum-yok]
  kontrol    yalniz kontrol/teshis raporu (salt okunur: kurulum + kurum AI ucu)
  yardim     bu ekran  (-h | --help)

Secenekler (kur/varsayilan akista kontrol asamasina aktarilir):
  --zaman-asimi <sn>   uc isteklerinde bekleme suresi (varsayilan 60)
  --ayrintili | -a     kontrol raporunu kirpmadan bas (iki uc: uc basina 3 satir)
  --url <adres>        kontrolde env yerine tek seferlik uc adresi
  --key <anahtar>      kontrolde env yerine tek seferlik anahtar
  --model <id>         kontrolde env yerine tek seferlik model kimligi
  --kurulum | --uc     kontrol raporunun yalniz bir bolumu (ic kullanim)

Ornekler:
  ./kur.sh                                     kurulumun tamami + kontrol ekrani
  ./kur.sh kontrol --zaman-asimi 8 --ayrintili
  ./kur.sh derle

env kapisi: kokteki `env` yoksa once env.local, o da yoksa env.example kopyalanir
(izin 600). Elle "cp env.example env" adimi GEREKMEZ.
YARDIM
}

ana() {
  while [ $# -gt 0 ]; do
    case "$1" in
      kur | derle | kontrol)
        if [ -n "$ALT_KOMUT" ]; then
          hata "tek alt komut verilebilir (verilen: $ALT_KOMUT, $1)"
          kullanim >&2
          exit 2
        fi
        ALT_KOMUT="$1"
        ;;
      yardim | -h | --help | --yardim)
        kullanim
        exit 0
        ;;
      --ayrintili | --uzun | -a) AYRINTILI=1 ;;
      --zaman-asimi)
        ZAMAN_ASIMI="${2:-}"
        shift
        ;;
      --url)
        ARG_URL="${2:-}"
        shift
        ;;
      --key | --anahtar)
        ARG_KEY="${2:-}"
        shift
        ;;
      --model)
        ARG_MODEL="${2:-}"
        shift
        ;;
      --kurulum) MOD="kurulum" ;;
      --uc) MOD="uc" ;;
      # derle'ye aktarılan iç bayraklar (kur() aynı bayrakları fonksiyon çağrısıyla verir;
      # elle derlemede kolaylık: ./kur.sh derle --bin-kopyala)
      --bin-kopyala | --kurulum-yok) DERLE_EK+=("$1") ;;
      *)
        hata "bilinmeyen parametre: $1"
        kullanim >&2
        exit 2
        ;;
    esac
    shift
  done

  case "$ZAMAN_ASIMI" in
    '' | *[!0-9]*)
      hata "--zaman-asimi sayi olmali (saniye)."
      exit 2
      ;;
  esac

  [ -n "$ALT_KOMUT" ] || ALT_KOMUT="kur"   # parametresiz cagri = kurmak

  case "$ALT_KOMUT" in
    derle) derle ${DERLE_EK[@]+"${DERLE_EK[@]}"} || exit 1 ;;
    kontrol) kontrol ;;
    kur) kur ;;
  esac
}

# Doğrudan çalıştırıldığında ana akış koşar. `source kur.sh` ile alındığında
# koşmaz — böylece tek tek fonksiyonlar (ör. kunye_yaz) derleme yapmadan
# sınanabilir (bkz. script/duman-kontrol-rapor.sh).
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  ana "$@"
fi
