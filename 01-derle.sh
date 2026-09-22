#!/usr/bin/env bash
# =============================================================================
#  01-derle.sh — opencode CLI'yi KAYNAKTAN derler (saha makinesi: saha-makinesi).
#
#  ⚙️  İÇ DETAY — KULLANICI BUNU ÇAĞIRMAZ: `./02-kur.sh` gerektiğinde (ikili yok ya da
#      kaynak ikiliden yeni) bunu kendisi çağırır. Saha komutu ./kur.sh'tır
#      (içeride bu betiğe 02-kur.sh üzerinden gelir).
#      Buraya yalnız derlemeyi ayrıca ayıklamak için bakılır.
#
#  Bu betik YALNIZ derler. Kaynak senkronu (git pull + rsync) ayrı bir iştir:
#  önce `al.sh` ile kodu bu makineye çek, sonra `./kur.sh` çalıştır.
#
#  Kısayol (symlink) KURMAZ — `/usr/local/bin/opencode` kısayolunun tek sahibi
#  `02-kur.sh`'tır (o, kısayolu `~/.opencode/bin/opencode`'a bağlar ve çakışmayı
#  kendisi yedekleyip düzeltir). İki betik aynı kısayolu farklı hedefe kurduğunda
#  hangi ikilinin çalıştığı belirsiz kalıyordu; tek sahip kuralı bunu bitirir.
#
#  Offline/kurum-ağı varsayımı:
#    - npm paketleri kurum içi npm proxy'sinden gelir  -> ~/.bunfig.toml (repoya girmez)
#    - models.dev'e erişim YOKTUR                      -> repodaki snapshot kullanılır
#    - web/console paketleri (ghostty-web, @solidjs/start) npm DIŞI kaynaktan geldiği için
#      kurulum `--filter` ile yalnız CLI workspace'ine daraltılır.
#
#  İç bayraklar (02-kur.sh kullanır):
#    --bin-kopyala   derlenen ikiliyi ayrıca bin/opencode'a kopyalar (02-kur.sh bunu kullanır)
#    --kurulum-yok   bun install adımını atla (bağımlılıklar zaten kurulu ise)
#    -h | --help     bu yardım
#  Gerisi `bun install`'a aktarılır (ör. --ignore-scripts).
#
#  Ortam değişkenleri:
#    MODELS_DEV_API_JSON  models.dev anlık görüntüsü (varsayılan: repodaki snapshot)
#    BUN                  bun ikilisinin yolu (PATH'te değilse)
# =============================================================================
set -euo pipefail
KOK="$(cd "$(dirname "$0")" && pwd)"
cd "$KOK"

BIN_KOPYALA=0
KURULUM_YOK=0
INSTALL_EK=()
for arg in "$@"; do
  case "$arg" in
    --bin-kopyala) BIN_KOPYALA=1 ;;
    --kurulum-yok) KURULUM_YOK=1 ;;
    -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) INSTALL_EK+=("$arg") ;;  # gerisi bun install'a aktarılır (ör. --ignore-scripts)
  esac
done

# --- 0) bun bulunuyor mu? (saha makinesinde PATH'te olmayabilir) ----------------
BUN="${BUN:-}"
if [ -z "$BUN" ]; then
  if command -v bun >/dev/null 2>&1; then
    BUN="$(command -v bun)"
  elif [ -x "$HOME/.bun/bin/bun" ]; then
    BUN="$HOME/.bun/bin/bun"
  elif [ -x "/root/.bun/bin/bun" ]; then
    BUN="/root/.bun/bin/bun"
  else
    echo "!! bun bulunamadi. PATH'e ekle veya BUN=/yol/bun ./01-derle.sh olarak calistir." >&2
    exit 1
  fi
fi
BUN_DIZIN="$(dirname "$BUN")"
export PATH="$BUN_DIZIN:$PATH"
echo "==> bun: $BUN ($("$BUN" --version))"

if [ ! -f "$KOK/bun.lock" ]; then
  echo "!! $KOK/bun.lock yok — depo eksik senkronlanmis olabilir (once al.sh)." >&2
  exit 1
fi

# --- 1) Node header'lari: offline node-gyp icin hazirla ----------------------
# Resmi arsiv (node-vX.Y.Z-headers.tar.gz) icinde `node-vX.Y.Z/` dizini vardir
# (`include/node/...`) — adinda "-headers" GECMEZ. Sahada Alp ayni agaci elle
# `node-vX.Y.Z-headers/` adiyla koymus olabilir (node-gyp'in nodedir'i oraya bakar).
# Bu yuzden: once acilan GERCEK dizine bakilir, gerekirse arsiv acilir, sonra
# "-headers" adi o dizine baglanir. Elle konulmus gercek dizine DOKUNULMAZ.
NODE_SURUM="v24.19.0"
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
node_headerlari_hazirla || \
  echo "!! node-$NODE_SURUM header'lari hazirlanamadi — derlemeye devam ediliyor (node-gyp gerekirse kirilabilir)." >&2

# --- 2) models.dev anlik goruntusu (ag yok -> fetch denenmesin) -----------------
SNAPSHOT="$KOK/packages/opencode/script/models-dev-api.json"
if [ -z "${MODELS_DEV_API_JSON:-}" ] && [ -f "$SNAPSHOT" ]; then
  export MODELS_DEV_API_JSON="$SNAPSHOT"
fi
if [ -n "${MODELS_DEV_API_JSON:-}" ]; then
  echo "==> models.dev snapshot: $MODELS_DEV_API_JSON"
else
  echo "!! models.dev snapshot yok; derleme https://models.dev/api.json'a baglanmayi deneyecek." >&2
fi

# --- 3) Bagimliliklar: YALNIZ CLI workspace'i ----------------------------------
# (--filter olmadan bun, web/console paketlerinin npm DISI bagimliliklarini da cozmeye
#  calisir: pkg.pr.new/@solidjs/start ve github:anomalyco/ghostty-web -> offline'da patlar.)
if [ "$KURULUM_YOK" -eq 0 ]; then
  echo "==> bun install --filter=./packages/opencode ${INSTALL_EK[*]:-}"
  "$BUN" install --filter="./packages/opencode" ${INSTALL_EK[@]+"${INSTALL_EK[@]}"}
else
  echo "==> bun install atlandi (--kurulum-yok)"
fi

# --- 4) Derleme: tek platform, web UI gomulmeden -------------------------------
echo "==> build.ts --single --skip-embed-web-ui --skip-install"
"$BUN" run ./packages/opencode/script/build.ts --single --skip-embed-web-ui --skip-install

# --- 5) Uretilen ikiliyi bul ---------------------------------------------------
shopt -s nullglob
IKILILER=(packages/opencode/dist/opencode-*/bin/opencode)
shopt -u nullglob
if [ "${#IKILILER[@]}" -ne 1 ]; then
  echo "!! Beklenen tek ikili bulunamadi (bulunan: ${#IKILILER[@]})." >&2
  printf '   %s\n' "${IKILILER[@]}" >&2
  exit 1
fi
IKILI="$KOK/${IKILILER[0]}"
echo "==> ikili: $IKILI ($(du -h "$IKILI" | cut -f1))"

# --- 6) Kisayol (symlink) KURULMAZ — sahibi 02-kur.sh -------------------------
echo "==> kisayol kurulmadi (sahibi 02-kur.sh) — kurulum icin: ./kur.sh"

# --- 7) Istege bagli: 02-kur.sh akisi icin bin/opencode ---------------------------
if [ "$BIN_KOPYALA" -eq 1 ]; then
  mkdir -p "$KOK/bin"
  cp -f "$IKILI" "$KOK/bin/opencode"
  chmod +x "$KOK/bin/opencode"
  echo "==> bin/opencode guncellendi (02-kur.sh bunu kullanir)"
fi

echo "==> BITTI: $("$IKILI" --version)"
