#!/usr/bin/env bash
# =============================================================================
#  alp-derle.sh — opencode CLI'yi KAYNAKTAN derler (saha makinesi: saha-makinesi).
#
#  ⚙️  İÇ/DETAY BETİK: normalde bunu elle çalıştırmana gerek yok —
#      `./alp-kur.sh` gerektiğinde bunu kendisi çağırır (tek giriş noktası odur).
#      Doğrudan çalıştırmak yalnız derlemeyi ayrı denemek/ayıklamak içindir.
#
#  Bu betik YALNIZ derler. Kaynak senkronu (git pull + rsync) ayrı bir iştir:
#  önce `al.sh` ile kodu bu makineye çek, sonra `./alp-kur.sh` çalıştır.
#
#  Kısayol (symlink) KURMAZ — `/usr/local/bin/opencode` kısayolunun tek sahibi
#  `alp-kur.sh`'tır (o, kısayolu `~/.opencode/bin/opencode`'a bağlar). İki betik aynı
#  kısayolu farklı hedefe kurduğunda hangi ikilinin çalıştığı belirsiz kalıyordu;
#  tek sahip kuralı bunu bitirir. Eski davranış gerekirse: `--kisayol`.
#
#  Offline/kurum-ağı varsayımı:
#    - npm paketleri kurum içi npm proxy'sinden gelir  -> ~/.bunfig.toml (repoya girmez)
#    - models.dev'e erişim YOKTUR                      -> repodaki snapshot kullanılır
#    - web/console paketleri (ghostty-web, @solidjs/start) npm DIŞI kaynaktan geldiği için
#      kurulum `--filter` ile yalnız CLI workspace'ine daraltılır.
#
#  Kullanım:  cd <repo-kökü> && ./alp-derle.sh [ek bun install bayrakları]
#    --bin-kopyala   derlenen ikiliyi ayrıca bin/opencode'a kopyalar (alp-kur.sh bunu kullanır)
#    --kurulum-yok   bun install adımını atla (bağımlılıklar zaten kurulu ise)
#    --kisayol       (istisna) kısayolu doğrudan dist ikilisine kur — normalde alp-kur.sh'ın işi
#    -h | --help     bu yardım
#  Örnek (native derleme sorunlu makinede): ./alp-derle.sh --ignore-scripts
#
#  Ortam değişkenleri:
#    KISAYOL_DIZIN        --kisayol verildiğinde symlink dizini (varsayılan /usr/local/bin,
#                         yazılamazsa ~/.local/bin)
#    MODELS_DEV_API_JSON  models.dev anlık görüntüsü (varsayılan: repodaki snapshot)
#    BUN                  bun ikilisinin yolu (PATH'te değilse)
# =============================================================================
set -euo pipefail
KOK="$(cd "$(dirname "$0")" && pwd)"
cd "$KOK"

BIN_KOPYALA=0
KURULUM_YOK=0
KISAYOL=0
INSTALL_EK=()
for arg in "$@"; do
  case "$arg" in
    --bin-kopyala) BIN_KOPYALA=1 ;;
    --kurulum-yok) KURULUM_YOK=1 ;;
    --kisayol)     KISAYOL=1 ;;
    -h|--help) sed -n '2,35p' "$0"; exit 0 ;;
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
    echo "!! bun bulunamadi. PATH'e ekle veya BUN=/yol/bun ./alp-derle.sh olarak calistir." >&2
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

# --- 1) models.dev anlik goruntusu (ag yok -> fetch denenmesin) -----------------
SNAPSHOT="$KOK/packages/opencode/script/models-dev-api.json"
if [ -z "${MODELS_DEV_API_JSON:-}" ] && [ -f "$SNAPSHOT" ]; then
  export MODELS_DEV_API_JSON="$SNAPSHOT"
fi
if [ -n "${MODELS_DEV_API_JSON:-}" ]; then
  echo "==> models.dev snapshot: $MODELS_DEV_API_JSON"
else
  echo "!! models.dev snapshot yok; derleme https://models.dev/api.json'a baglanmayi deneyecek." >&2
fi

# --- 2) Bagimliliklar: YALNIZ CLI workspace'i ----------------------------------
# (--filter olmadan bun, web/console paketlerinin npm DISI bagimliliklarini da cozmeye
#  calisir: pkg.pr.new/@solidjs/start ve github:anomalyco/ghostty-web -> offline'da patlar.)
if [ "$KURULUM_YOK" -eq 0 ]; then
  echo "==> bun install --filter=./packages/opencode ${INSTALL_EK[*]:-}"
  "$BUN" install --filter="./packages/opencode" ${INSTALL_EK[@]+"${INSTALL_EK[@]}"}
else
  echo "==> bun install atlandi (--kurulum-yok)"
fi

# --- 3) Derleme: tek platform, web UI gomulmeden -------------------------------
echo "==> build.ts --single --skip-embed-web-ui --skip-install"
"$BUN" run ./packages/opencode/script/build.ts --single --skip-embed-web-ui --skip-install

# --- 4) Uretilen ikiliyi bul ---------------------------------------------------
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

# --- 5) Kisayol (symlink) — VARSAYILAN: KURULMAZ, sahibi alp-kur.sh -----------------
if [ "$KISAYOL" -eq 1 ]; then
  KISAYOL_DIZIN="${KISAYOL_DIZIN:-/usr/local/bin}"
  mkdir -p "$KISAYOL_DIZIN" 2>/dev/null || true
  if [ ! -w "$KISAYOL_DIZIN" ]; then
    echo "   NOT: $KISAYOL_DIZIN yazilamiyor -> $HOME/.local/bin kullanilacak"
    KISAYOL_DIZIN="$HOME/.local/bin"
    mkdir -p "$KISAYOL_DIZIN"
  fi
  ESKI_HEDEF=""
  if [ -e "$KISAYOL_DIZIN/opencode" ] || [ -L "$KISAYOL_DIZIN/opencode" ]; then
    ESKI_HEDEF="$(readlink -f "$KISAYOL_DIZIN/opencode" 2>/dev/null || echo "$KISAYOL_DIZIN/opencode")"
  fi
  ln -sfn "$IKILI" "$KISAYOL_DIZIN/opencode"
  echo "==> kisayol: $KISAYOL_DIZIN/opencode -> $IKILI"
  echo "   UYARI: bu kisayol dist ikilisini gosteriyor; sonradan ./alp-kur.sh calistirirsan"
  echo "          ayni kisayolu ~/.opencode/bin/opencode'a cevirir (tek sahip kurali)."
  if [ -n "$ESKI_HEDEF" ] && [ "$ESKI_HEDEF" != "$IKILI" ]; then
    echo "   NOT: onceki kisayol degistirildi (eski hedef: $ESKI_HEDEF)"
  fi
  case ":$PATH:" in
    *":$KISAYOL_DIZIN:"*) ;;
    *) echo "   NOT: $KISAYOL_DIZIN PATH'te degil -> export PATH=\"$KISAYOL_DIZIN:\$PATH\"" ;;
  esac
else
  echo "==> kisayol kurulmadi (sahibi alp-kur.sh) — kurulum icin: ./alp-kur.sh"
fi

# --- 6) Istege bagli: alp-kur.sh akisi icin bin/opencode ---------------------------
if [ "$BIN_KOPYALA" -eq 1 ]; then
  mkdir -p "$KOK/bin"
  cp -f "$IKILI" "$KOK/bin/opencode"
  chmod +x "$KOK/bin/opencode"
  echo "==> bin/opencode guncellendi (alp-kur.sh bunu kullanir)"
fi

echo "==> BITTI: $("$IKILI" --version)"
