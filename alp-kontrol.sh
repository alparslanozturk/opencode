#!/usr/bin/env bash
# =============================================================================
#  alp-kontrol.sh — sahadaki TEK kontrol/teşhis betiği.
#
#  İki mod:
#    (varsayılan)  kurum AI UCU sağlıklı mı — DNS/TCP/models/chat/stream/tool_call
#    --kurulum     bu paketin KURULUMU sağlam mı — ikili/ayar/beceri/rg (ağ gerekmez)
#
#  Çıktı TEK EKRANA sığar (≈20 satır, ≤100 sütun) ve sonda tek satırlık "SORUN:"
#  teşhisi verir — ekran görüntüsü alıp olduğu gibi gönderebilirsin.
#
#  Kullanım:
#    ./alp-kontrol.sh                       # uç teşhisi (env dosyasındaki değerlerle)
#    ./alp-kontrol.sh --kurulum             # kurulum doğrulaması (ağ gerekmez)
#    ./alp-kontrol.sh --ayrintili           # uzun rapor (kırpma yok, tüm ayrıntı)
#    ./alp-kontrol.sh --url https://x/v1 --model MODEL --key ANAHTAR
#    ./alp-kontrol.sh --zaman-asimi 120     # yavaş uçlar için (varsayılan 60 sn)
#    ./alp-kontrol.sh --yardim
#
#  Salt okunur: sistemde/ayarlarda hiçbir şeyi DEĞİŞTİRMEZ; uca yalnız okuma ve
#  kısa (16 token) sohbet istekleri gider. Anahtar ASLA ekrana basılmaz ve "ps"
#  çıktısında görünmemesi için curl'e geçici config dosyasıyla verilir.
#
#  Çıkış kodu: 0 = sorun yok · 1 = sorun var · 2 = kullanım/env hatası · 3 = araç yok
# =============================================================================
set -uo pipefail

# --- kendi gerçek konumunu bul (symlink zincirini çözer) ---
_kaynak="${BASH_SOURCE[0]}"
while [ -L "$_kaynak" ]; do
  _hedef="$(readlink "$_kaynak")"
  case "$_hedef" in
    /*) _kaynak="$_hedef" ;;
    *) _kaynak="$(cd "$(dirname "$_kaynak")" && pwd)/$_hedef" ;;
  esac
done
KOK="$(cd "$(dirname "$_kaynak")" && pwd)"

yardim() { sed -n '2,24p' "$_kaynak" | sed 's/^# \{0,1\}//'; }

# ---------------------------------------------------------------------------
#  0) argümanlar
# ---------------------------------------------------------------------------
ARG_URL=""
ARG_KEY=""
ARG_MODEL=""
ZAMAN_ASIMI=60
AYRINTILI=0
MOD="uc"

while [ $# -gt 0 ]; do
  case "$1" in
    --kurulum) MOD="kurulum" ;;
    --ayrintili | --uzun) AYRINTILI=1 ;;
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
    --zaman-asimi)
      ZAMAN_ASIMI="${2:-}"
      shift
      ;;
    --yardim | -h | --help)
      yardim
      exit 0
      ;;
    *)
      echo "!! bilinmeyen argüman: $1 (yardım: --yardim)" >&2
      exit 2
      ;;
  esac
  shift
done

case "$ZAMAN_ASIMI" in
  '' | *[!0-9]*)
    echo "!! --zaman-asimi sayı olmalı (saniye)." >&2
    exit 2
    ;;
esac

# ---------------------------------------------------------------------------
#  ekran sözleşmesi: tek ekran, ≤100 sütun (--ayrintili sınırı kaldırır)
# ---------------------------------------------------------------------------
GENISLIK=100
[ "$AYRINTILI" -eq 1 ] && GENISLIK=100000
CIZGI="$(printf '%*s' 78 '' | tr ' ' '-')"

RENKLI=0
[ -t 1 ] && RENKLI=1
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

HATA=0
UYARI=0
SORUN=""
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

# bitir <cikis-kodu> <sorun-metni>
bitir() {
  local kod="$1" metin
  metin="SORUN: $(kis "$2" 92)"
  printf '%s\n' "$CIZGI"
  if [ "$kod" -eq 0 ]; then printf ' %s\n' "$(renk 32 "$metin")"; else printf ' %s\n' "$(renk 31 "$metin")"; fi
  if [ "$AYRINTILI" -eq 0 ]; then
    duz "ayrinti: ./alp-kontrol.sh --ayrintili · kurulum: ./alp-kontrol.sh --kurulum"
  fi
  exit "$kod"
}

PY=""
command -v python3 > /dev/null 2>&1 && PY="python3"

LOG_DIZIN="${XDG_DATA_HOME:-$HOME/.local/share}/opencode/log"
son_log_hatasi() {
  [ -d "$LOG_DIZIN" ] || return 0
  local dosya
  dosya="$(find "$LOG_DIZIN" -maxdepth 1 -type f -name '*.log' -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-)"
  [ -n "$dosya" ] || return 0
  grep -hE 'err_[0-9A-Za-z]{6,}|ERROR|FATAL' "$dosya" 2>/dev/null | tail -1
}

# ===========================================================================
#  MOD: --kurulum  (ağ gerekmez — paketin kurulumu sağlam mı)
# ===========================================================================
mod_kurulum() {
  local repo_bin="$KOK/bin/opencode" kurulu_bin="$HOME/.opencode/bin/opencode"
  local ayar_dizin="$HOME/.config/opencode"
  local kurulu_cfg="$ayar_dizin/opencode.json"
  local rg_dizin="${XDG_CACHE_HOME:-$HOME/.cache}/opencode/bin"

  printf '== opencode KURULUM KONTROL · %s · %s\n' "$(date '+%Y-%m-%d %H:%M')" "$(hostname 2> /dev/null || echo '?')"
  duz "kok      : $KOK"
  duz "ayar     : $ayar_dizin"
  printf '%s\n' "$CIZGI"

  # 1) ikili (kurulu olan asıl önemli; repo içindeki kaynak ikili ek bilgi)
  if [ -x "$kurulu_bin" ]; then
    local surum
    if surum="$(timeout 30 "$kurulu_bin" --version 2>&1)"; then
      satir "ikili" ok "kurulu: ~/.opencode/bin/opencode · surum $surum"
    else
      satir "ikili" hata "kurulu ikili calismiyor: $(kis "$surum" 60)"
      sorun_kaydet "kurulu ikili calismiyor — ./alp-kur.sh ile yeniden kur"
    fi
  elif [ -f "$repo_bin" ]; then
    satir "ikili" hata "bin/opencode var ama kurulmamis (~/.opencode/bin/opencode yok) — ./alp-kur.sh"
    sorun_kaydet "kurulum yapilmamis — once ./alp-kur.sh calistir"
  else
    satir "ikili" hata "ne bin/opencode ne ~/.opencode/bin/opencode var — ./alp-kur.sh"
    sorun_kaydet "ikili yok — ./alp-kur.sh (gerekirse kaynaktan derler)"
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
    if grep -q 'KURUM_ENDPOINT' "$KOK/env" 2> /dev/null; then eksik="sablon degeri duruyor (KURUM_ENDPOINT)"; fi
    if [ -n "$eksik" ]; then
      satir "env" hata "$KOK/env — $eksik"
      sorun_kaydet "env doldurulmamis — $KOK/env icindeki 3 satiri doldur"
    else
      satir "env" ok "env dolu (KURUM_URL/KURUM_KEY/MODEL_ID) · izin $izin"
      [ "$izin" = "600" ] || satir "env" uyar "env izni $izin — 600 olmali (anahtar iceriyor): chmod 600 $KOK/env"
    fi
  else
    satir "env" hata "$KOK/env YOK — cp env.example env && vi env"
    sorun_kaydet "env dosyasi yok — cp $KOK/env.example $KOK/env"
  fi

  # 4) kurulu ayar (opencode.json)
  if [ -f "$kurulu_cfg" ]; then
    local izin gecerli=1
    izin="$(stat -c '%a' "$kurulu_cfg" 2> /dev/null || echo '?')"
    if [ -n "$PY" ] && ! "$PY" -c 'import json,sys; json.load(open(sys.argv[1]))' "$kurulu_cfg" 2> /dev/null; then
      gecerli=0
    fi
    if [ "$gecerli" -eq 0 ]; then
      satir "ayar" hata "$kurulu_cfg GECERSIZ JSON — ./alp-kur.sh"
      sorun_kaydet "kurulu opencode.json bozuk — ./alp-kur.sh yeniden yazar"
    elif grep -q 'KURUM_ENDPOINT' "$kurulu_cfg"; then
      satir "ayar" hata "kurulu opencode.json'da sablon degeri duruyor — ./alp-kur.sh"
      sorun_kaydet "kurulu ayar sablon halinde — ./alp-kur.sh calistir"
    else
      satir "ayar" ok "opencode.json gecerli · sablon dolu · izin $izin"
      [ "$izin" = "600" ] || satir "ayar" uyar "opencode.json izni $izin — apiKey iceriyor, 600 olmali"
    fi
  else
    satir "ayar" hata "$kurulu_cfg YOK — ./alp-kur.sh calistirilmamis"
    sorun_kaydet "kurulum yapilmamis — ./alp-kur.sh calistir"
  fi

  # 5) beceriler + AGENTS.md
  local cekirdek onayli park kurulu_beceri
  cekirdek="$(grep -oP '^CORE_SKILLS=\(\K[^)]*' "$KOK/alp-kur.sh" 2> /dev/null | wc -w)"
  [ "$cekirdek" -gt 0 ] 2> /dev/null || cekirdek="?"
  onayli="$(find "$KOK/knowledge/skills/approved" -mindepth 1 -maxdepth 1 -type d 2> /dev/null | wc -l)"
  park="$(find "$KOK/knowledge/skills/parked" -mindepth 1 -maxdepth 1 -type d 2> /dev/null | wc -l)"
  if [ -d "$ayar_dizin/skills" ]; then
    kurulu_beceri="$(find "$ayar_dizin/skills" -mindepth 1 -maxdepth 1 -type d | wc -l)"
    if [ "$kurulu_beceri" -gt 0 ]; then
      satir "beceri" ok "kurulu $kurulu_beceri (cekirdek $cekirdek) · repo: approved $onayli + parked $park"
    else
      satir "beceri" uyar "kurulu beceri dizini bos — ./alp-kur.sh"
    fi
  else
    satir "beceri" hata "$ayar_dizin/skills YOK — ./alp-kur.sh calistirilmamis"
    sorun_kaydet "beceriler kurulmamis — ./alp-kur.sh calistir"
  fi
  if [ -f "$ayar_dizin/AGENTS.md" ]; then
    satir "AGENTS" ok "kurulu: ~/.config/opencode/AGENTS.md"
  else
    satir "AGENTS" hata "AGENTS.md kurulu degil (kurum kurallari yuklenmez) — ./alp-kur.sh"
    sorun_kaydet "AGENTS.md kurulu degil — ./alp-kur.sh calistir"
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
    sorun_kaydet "knowledge iskeleti eksik — depo eksik senkronlanmis (al.sh)"
  fi

  # 7) ripgrep
  if command -v rg > /dev/null 2>&1; then
    satir "rg" ok "PATH'te: $(command -v rg) ($(rg --version 2> /dev/null | head -1))"
  elif [ -x "$rg_dizin/rg" ]; then
    satir "rg" ok "kurulu: ~/.cache/opencode/bin/rg ($("$rg_dizin/rg" --version 2> /dev/null | head -1))"
  else
    satir "rg" hata "rg YOK — grep/glob araclari kurum aginda kirilir (./alp-kur.sh)"
    sorun_kaydet "ripgrep yok — ./alp-kur.sh (bin/ripgrep.tar.xz gerekir)"
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
      sorun_kaydet "izin ihlali: edit=allow — engine/opencode.json duzelt, ./alp-kur.sh"
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
      ayr "duzeltmek icin: ./alp-kur.sh --baglanti-zorla (yedek alinir)"
    fi
  else
    satir "kisayol" uyar "'opencode' PATH'te yok — ./alp-kur.sh veya tam yolla calistir"
  fi

  if [ -n "$SORUN" ]; then bitir 1 "$SORUN"; fi
  if [ "$HATA" -gt 0 ]; then bitir 1 "kurulumda $HATA hata — yukaridaki ✗ satirlarina bak"; fi
  bitir 0 "yok — kurulum saglam ($UYARI uyari). Uc testi icin: ./alp-kontrol.sh"
}

if [ "$MOD" = "kurulum" ]; then mod_kurulum; fi

# ===========================================================================
#  MOD: uç teşhisi (varsayılan)
# ===========================================================================
# Kabukta zaten export edilmiş değerler env dosyasını EZER (kaçış kapısı),
# argümanlar da hepsini ezer.
ONCEKI_URL="${KURUM_URL:-}"
ONCEKI_KEY="${KURUM_KEY:-}"
ONCEKI_MODEL="${MODEL_ID:-}"
ONCEKI_PENCERE="${KURUM_MAX_CONTEXT:-}"

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

URL="${KURUM_URL:-}"
KEY="${KURUM_KEY:-}"
MODEL="${MODEL_ID:-}"
PENCERE_ENV="${KURUM_MAX_CONTEXT:-}"

if [ -z "$URL" ] || [ -z "$MODEL" ]; then
  printf '== opencode UC KONTROL\n'
  satir "env" hata "$ENV_DOSYASI — KURUM_URL ve/veya MODEL_ID bos"
  if [ ! -f "$ENV_DOSYASI" ]; then
    duz "olustur: cp $KOK/env.example $KOK/env && vi $KOK/env"
  fi
  duz "gerekli satirlar: KURUM_URL=http(s)://<uc>:<port>/v1 · KURUM_KEY=dummy · MODEL_ID=<uctaki id>"
  bitir 2 "env eksik — KURUM_URL/MODEL_ID doldurulmamis ($ENV_DOSYASI)"
fi
[ -n "$KEY" ] || KEY="dummy"

if ! command -v curl > /dev/null 2>&1; then
  printf '== opencode UC KONTROL\n'
  bitir 3 "curl yok — uc teshisi curl olmadan calisamaz (dnf install curl)"
fi

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

TMP="$(mktemp -d "${TMPDIR:-/tmp}/alp-kontrol.XXXXXX")" || {
  echo "!! geçici dizin oluşturulamadı" >&2
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
uc_ver() { printf '%s/%s' "$KOK_URL" "${1#/}"; }

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

# --- başlık (3 satır) ---
printf '== opencode UC KONTROL · %s · %s\n' "$(date '+%Y-%m-%d %H:%M')" "$(hostname 2> /dev/null || echo '?')"
duz "uc/model : $KOK_URL  ·  $MODEL"
duz "anahtar  : $(maskele "$KEY") · zaman asimi ${ZAMAN_ASIMI} sn · ayar: $ENV_KAYNAK"
printf '%s\n' "$CIZGI"
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

# --- 2) DNS --------------------------------------------------------------
if printf '%s' "$HOST" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  satir "DNS" ok "host zaten IP: $HOST (DNS gerekmiyor)"
elif command -v getent > /dev/null 2>&1; then
  IPLER="$(getent ahosts "$HOST" 2> /dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  if [ -n "${IPLER// /}" ]; then
    satir "DNS" ok "$HOST -> ${IPLER% }"
  else
    satir "DNS" hata "$HOST cozumlenemedi — opencode da ayni hatayi alir"
    sorun_kaydet "DNS cozulemiyor — $HOST (kontrol: cat /etc/resolv.conf · grep $HOST /etc/hosts)"
  fi
elif [ -n "$PY" ]; then
  IPLER="$("$PY" -c 'import socket,sys
try:
    print(" ".join(sorted({x[4][0] for x in socket.getaddrinfo(sys.argv[1], None)})))
except Exception:
    pass' "$HOST" 2> /dev/null)"
  if [ -n "$IPLER" ]; then
    satir "DNS" ok "$HOST -> $IPLER"
  else
    satir "DNS" hata "$HOST cozumlenemedi (DNS)"
    sorun_kaydet "DNS cozulemiyor — $HOST"
  fi
else
  satir "DNS" uyar "getent/python3 yok — DNS kontrolu atlandi"
fi

# --- 3) TCP --------------------------------------------------------------
PROXY_NOT=""
for degisken in http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY; do
  [ -n "${!degisken:-}" ] && PROXY_NOT="$PROXY_NOT $degisken"
done
[ -n "$PROXY_NOT" ] && PROXY_NOT=" · proxy degiskeni tanimli:$PROXY_NOT"
if timeout 10 bash -c "exec 3<>/dev/tcp/$HOST/$PORT" 2> /dev/null; then
  satir "TCP" ok "$HOST:$PORT acik${PROXY_NOT}"
else
  satir "TCP" hata "$HOST:$PORT kapali — guvenlik duvari, yanlis port veya proxy${PROXY_NOT}"
  sorun_kaydet "uc erisilemiyor (TCP $HOST:$PORT kapali) — ping $HOST · ss -tlnp (uc makinede)"
fi

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
      sorun_kaydet "MODEL_ID ucta yok — $MODEL (listeden birebir kopyala, sonra ./alp-kur.sh)"
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
        print("%s\t%s\t%s\t%s" % (ad, model.get("id") or anahtar, taban, sinir))
PY
)"
  if [ -n "$kurulu" ]; then
    KURULU_CTX="$(printf '%s\n' "$kurulu" | head -1 | cut -f4)"
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
PENCERE_METIN="uc: ${PENCERE_UC:-bildirmiyor} · kurulu ayar: ${KURULU_CTX:-yok} · env: ${PENCERE_ENV:-yok}"
if [ -n "$AYAR_NOT" ]; then
  satir "ayar" uyar "$PENCERE_METIN · $AYAR_NOT — ./alp-kur.sh"
elif [ -n "$PENCERE_UC" ] && [ -n "${KURULU_CTX:-}" ] && [ "$PENCERE_UC" != "${KURULU_CTX:-}" ]; then
  satir "ayar" uyar "$PENCERE_METIN · uc ile kurulu deger farkli — ./alp-kur.sh"
elif [ "$MODELS_DURUM" != "200" ]; then
  # uç yanıt vermediyse "✓" basmak yanıltıcı olur — yalnız bilgi satırı
  satir "ayar" bilgi "baglam $PENCERE_METIN (uc yanit vermedi, karsilastirma yapilamadi)"
else
  satir "ayar" ok "baglam $PENCERE_METIN"
fi

# --- 9) log --------------------------------------------------------------
SON_LOG="$(son_log_hatasi)"
if [ -n "$SON_LOG" ]; then
  satir "log" uyar "son hata: $(kis "$SON_LOG" 70)"
else
  satir "log" ok "son log dosyasinda err_/ERROR satiri yok ($LOG_DIZIN)"
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
