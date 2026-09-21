#!/usr/bin/env bash
# =============================================================================
#  oc-teshis.sh — KURUM AI UCUNU test eder (ağ/endpoint teşhisi).
#
#  oc-dogrula.sh ile karıştırma:
#    oc-dogrula.sh -> bu paketin KURULUMU sağlam mı (ikili, ayar, beceriler) — ağ gerekmez
#    oc-teshis.sh  -> kurum AI UCU sağlıklı mı (DNS/TCP/models/chat/stream/tool) — ağ gerekir
#
#  Ne zaman: TUI "Failed to send prompt" / "Unexpected server error" dediğinde,
#            model listesi boş geldiğinde, cevaplar yarıda kesildiğinde.
#
#  Kullanım:
#    ./oc-teshis.sh                         # env dosyasındaki değerlerle
#    ./oc-teshis.sh --url https://x/v1 --model MODEL --key ANAHTAR
#    ./oc-teshis.sh --zaman-asimi 120       # yavaş uçlar için (varsayılan 60 sn)
#    ./oc-teshis.sh --yardim
#
#  Salt okunur: sistemde/ayarlarda hiçbir şeyi DEĞİŞTİRMEZ, uca yalnız okuma ve
#  kısa (16 token) sohbet istekleri gönderir. Anahtar ASLA ekrana basılmaz ve
#  "ps" çıktısında görünmemesi için curl'e geçici config dosyasıyla verilir.
#
#  Çıkış kodu: 0 = uç sağlıklı (uyarı olabilir)
#              1 = uç sorunlu (ayrıntı raporda)
#              2 = kullanım/env hatası
#              3 = gerekli araç yok (curl)
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

if [ -t 1 ]; then
  yesil() { printf '\033[32m%s\033[0m\n' "$*"; }
  kirmizi() { printf '\033[31m%s\033[0m\n' "$*"; }
  sari() { printf '\033[33m%s\033[0m\n' "$*"; }
else
  yesil() { printf '%s\n' "$*"; }
  kirmizi() { printf '%s\n' "$*"; }
  sari() { printf '%s\n' "$*"; }
fi

HATA=0
UYARI=0
ok() { yesil "  ✓ $*"; }
hata() {
  kirmizi "  ✗ $*"
  HATA=$((HATA + 1))
}
uyar() {
  sari "  ! $*"
  UYARI=$((UYARI + 1))
}
bilgi() { printf '    %s\n' "$*"; }

yardim() {
  sed -n '2,27p' "$_kaynak" | sed 's/^# \{0,1\}//'
}

# ---------------------------------------------------------------------------
#  0) argümanlar + env
# ---------------------------------------------------------------------------
ARG_URL=""
ARG_KEY=""
ARG_MODEL=""
ZAMAN_ASIMI=60

while [ $# -gt 0 ]; do
  case "$1" in
    --url)
      ARG_URL="${2:-}"
      shift 2 || true
      ;;
    --key | --anahtar)
      ARG_KEY="${2:-}"
      shift 2 || true
      ;;
    --model)
      ARG_MODEL="${2:-}"
      shift 2 || true
      ;;
    --zaman-asimi)
      ZAMAN_ASIMI="${2:-}"
      shift 2 || true
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
done

case "$ZAMAN_ASIMI" in
  '' | *[!0-9]*)
    echo "!! --zaman-asimi sayı olmalı (saniye)." >&2
    exit 2
    ;;
esac

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
  ENV_KAYNAK="(env dosyası yok — kabuk değişkenleri/argümanlar kullanılıyor)"
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
  echo "!! Kurum ucu bilgisi eksik — KURUM_URL ve MODEL_ID gerekli." >&2
  echo >&2
  if [ -f "$ENV_DOSYASI" ]; then
    echo "   $ENV_DOSYASI dosyası var ama eksik/boş. Şu satırları doldur:" >&2
  else
    echo "   $ENV_DOSYASI dosyası YOK. Oluştur:" >&2
    if [ -f "$KOK/env.example" ]; then
      echo "     cp $KOK/env.example $KOK/env && vi $KOK/env" >&2
    fi
  fi
  echo "     KURUM_URL=http(s)://<uc>:<port>/v1" >&2
  echo "     KURUM_KEY=dummy" >&2
  echo "     MODEL_ID=<uctaki model kimligi>" >&2
  echo >&2
  echo "   Ya da tek seferlik: ./oc-teshis.sh --url ... --model ... [--key ...]" >&2
  exit 2
fi
[ -n "$KEY" ] || KEY="dummy"

if ! command -v curl >/dev/null 2>&1; then
  echo "!! curl bulunamadı — bu teşhis curl olmadan çalışamaz." >&2
  exit 3
fi
PY=""
command -v python3 >/dev/null 2>&1 && PY="python3"

maskele() {
  local deger="$1" uzunluk
  uzunluk="${#deger}"
  if [ "$uzunluk" -eq 0 ]; then
    printf '(boş)'
  elif [ "$deger" = "dummy" ]; then
    printf 'dummy (yer tutucu)'
  elif [ "$uzunluk" -lt 10 ]; then
    printf '**** (uzunluk: %s)' "$uzunluk"
  else
    printf '%s****%s (uzunluk: %s)' "${deger:0:3}" "${deger: -2}" "$uzunluk"
  fi
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/oc-teshis.XXXXXX")" || {
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
chmod 600 "$CURL_CFG" 2>/dev/null || true

KOK_URL="${URL%/}"

# ---------------------------------------------------------------------------
#  yardımcılar
# ---------------------------------------------------------------------------
# json_al <mod> <dosya> — python3 varsa JSON'dan alan çeker, yoksa boş döner.
json_al() {
  [ -n "$PY" ] || return 0
  "$PY" - "$1" "$2" <<'PY' 2>/dev/null || true
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
            icerik = "(yalnız reasoning_content döndü)"
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

# uc_ver <yol> — tam URL üretir
uc_ver() { printf '%s/%s' "$KOK_URL" "${1#/}"; }

echo "==============================================================="
echo " opencode — kurum AI ucu teşhisi"
echo " tarih      : $(date '+%Y-%m-%d %H:%M:%S %z')"
echo " makine     : $(hostname 2>/dev/null || echo '?')"
echo " ayar kaynağı: $ENV_KAYNAK"
echo " KURUM_URL  : $URL"
echo " MODEL_ID   : $MODEL"
echo " KURUM_KEY  : $(maskele "$KEY")"
echo " zaman aşımı: ${ZAMAN_ASIMI} sn"
echo "==============================================================="
[ -n "$PY" ] || sari "  ! python3 yok — JSON ayrıntıları (model listesi, pencere) sınırlı olacak."

# ---------------------------------------------------------------------------
#  1) URL biçimi
# ---------------------------------------------------------------------------
echo
echo "== 1/8  URL biçimi =="
case "$URL" in
  http://* | https://*) ok "şema geçerli (${URL%%://*})" ;;
  *)
    hata "şema yok/yanlış — http:// veya https:// ile başlamalı: $URL"
    ;;
esac
case "$URL" in
  *KURUM_ENDPOINT* | *ornek.local* | *'<'*)
    hata "URL hâlâ şablon değeri içeriyor — env doldurulmamış"
    ;;
esac
case "$URL" in
  *[[:space:]]*) hata "URL boşluk içeriyor (env satırında tırnak/boşluk hatası)" ;;
esac
case "$URL" in
  */v1) ok "sonu /v1 (beklenen)" ;;
  */v1/)
    uyar "sonda fazladan '/' var — kur.sh kırpıyor ama env'i düzeltmek daha iyi"
    ;;
  */v1/*)
    uyar "URL /v1'den sonra da yol içeriyor: ${URL##*/v1}  — genelde kök /v1 ile bitmeli"
    ;;
  *)
    uyar "URL /v1 ile bitmiyor — OpenAI uyumlu uçlarda kök genelde .../v1'dir"
    bilgi "istekler şuraya gidecek: $(uc_ver models) ve $(uc_ver chat/completions)"
    ;;
esac

# host/port ayıkla
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
  VARSAYILAN_PORT=" (varsayılan)"
else
  VARSAYILAN_PORT=""
fi
bilgi "host: $HOST · port: ${PORT}${VARSAYILAN_PORT}"

# ---------------------------------------------------------------------------
#  2) DNS
# ---------------------------------------------------------------------------
echo
echo "== 2/8  DNS çözümleme =="
IPLER=""
if printf '%s' "$HOST" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  IPLER="$HOST"
  ok "host zaten IP adresi: $HOST (DNS gerekmiyor)"
elif command -v getent >/dev/null 2>&1; then
  IPLER="$(getent ahosts "$HOST" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  if [ -n "${IPLER// /}" ]; then
    ok "$HOST -> ${IPLER% }"
  else
    hata "$HOST çözümlenemedi (DNS/hosts) — opencode da aynı hatayı alır"
    bilgi "kontrol: cat /etc/resolv.conf · grep $HOST /etc/hosts"
  fi
elif [ -n "$PY" ]; then
  IPLER="$("$PY" -c 'import socket,sys
try:
    print(" ".join(sorted({x[4][0] for x in socket.getaddrinfo(sys.argv[1], None)})))
except Exception:
    pass' "$HOST" 2>/dev/null)"
  if [ -n "$IPLER" ]; then ok "$HOST -> $IPLER"; else hata "$HOST çözümlenemedi (DNS)"; fi
else
  uyar "getent/python3 yok — DNS kontrolü atlandı"
fi

# ---------------------------------------------------------------------------
#  3) TCP erişimi
# ---------------------------------------------------------------------------
echo
echo "== 3/8  TCP erişimi ($HOST:$PORT) =="
TCP_OK=0
if timeout 10 bash -c "exec 3<>/dev/tcp/$HOST/$PORT" 2>/dev/null; then
  ok "TCP bağlantısı kuruldu"
  TCP_OK=1
else
  hata "TCP bağlantısı kurulamadı — $HOST:$PORT kapalı, güvenlik duvarı veya yanlış port"
  bilgi "kontrol: ping $HOST · ss -tlnp (uç makinede) · proxy/no_proxy ayarları"
fi
for degisken in http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY; do
  deger="$(printf '%s' "${!degisken:-}")"
  [ -n "$deger" ] && uyar "ortamda $degisken=$deger tanımlı — curl ve opencode bundan etkilenir"
done

# ---------------------------------------------------------------------------
#  4) GET /models
# ---------------------------------------------------------------------------
echo
echo "== 4/8  GET $(uc_ver models) =="
MODELS_GOVDE="$TMP/models.json"
MODELS_DURUM=""
MODELS_SURE=""
MODEL_LISTESI=""
MODEL_SAYISI=0
MODEL_BULUNDU=0
cikti="$(curl -K "$CURL_CFG" --max-time "$ZAMAN_ASIMI" -o "$MODELS_GOVDE" \
  -w '%{http_code} %{time_total}' "$(uc_ver models)" 2>"$TMP/models.err")"
curl_kod=$?
MODELS_DURUM="${cikti%% *}"
MODELS_SURE="${cikti##* }"
if [ $curl_kod -ne 0 ]; then
  hata "istek başarısız (curl çıkış kodu $curl_kod): $(tr -d '\n' < "$TMP/models.err" | cut -c1-200)"
elif [ "$MODELS_DURUM" = "200" ]; then
  ok "HTTP 200 · ${MODELS_SURE} sn"
  MODEL_LISTESI="$(json_al model-listesi "$MODELS_GOVDE" | sed '/^$/d')"
  if [ -z "$MODEL_LISTESI" ] && [ -z "$PY" ]; then
    MODEL_LISTESI="$(grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' "$MODELS_GOVDE" | sed 's/.*"\([^"]*\)"$/\1/')"
  fi
  if [ -n "$MODEL_LISTESI" ]; then
    MODEL_SAYISI="$(printf '%s\n' "$MODEL_LISTESI" | wc -l | tr -d ' ')"
    echo "    uçtaki modeller ($MODEL_SAYISI):"
    printf '%s\n' "$MODEL_LISTESI" | sed 's/^/      - /'
    if printf '%s\n' "$MODEL_LISTESI" | grep -Fxq "$MODEL"; then
      MODEL_BULUNDU=1
      ok "MODEL_ID listede: $MODEL"
    else
      hata "MODEL_ID uçtaki listede YOK: $MODEL"
      yakin="$(printf '%s\n' "$MODEL_LISTESI" | grep -Fi "$(basename "$MODEL")" | head -3)"
      [ -z "$yakin" ] && yakin="$(printf '%s\n' "$MODEL_LISTESI" | head -3)"
      bilgi "yukarıdaki listeden birebir kopyala. Yakın olanlar:"
      printf '%s\n' "$yakin" | sed 's/^/        /'
      bilgi "düzelt: $ENV_DOSYASI içinde MODEL_ID=... sonra ./kur.sh"
    fi
  else
    uyar "200 döndü ama model listesi ayrıştırılamadı (beklenmeyen JSON)"
    bilgi "ham gövde (ilk 200 karakter): $(tr -d '\n' < "$MODELS_GOVDE" | cut -c1-200)"
  fi
else
  hata "HTTP $MODELS_DURUM · ${MODELS_SURE} sn"
  mesaj="$(json_al hata-mesaji "$MODELS_GOVDE")"
  [ -z "$mesaj" ] && mesaj="$(tr -d '\n' < "$MODELS_GOVDE" | cut -c1-200)"
  [ -n "$mesaj" ] && bilgi "uç mesajı: $mesaj"
  case "$MODELS_DURUM" in
    401 | 403) bilgi "kimlik doğrulama — KURUM_KEY yanlış/eksik" ;;
    404) bilgi "yol yanlış olabilir — KURUM_URL gerçekten /v1 kökü mü?" ;;
    000) bilgi "yanıt alınamadı — TLS/proxy/zaman aşımı" ;;
  esac
fi

# ---------------------------------------------------------------------------
#  5) POST /chat/completions (akışsız)
# ---------------------------------------------------------------------------
echo
echo "== 5/8  POST $(uc_ver chat/completions) (akışsız) =="
SOHBET_OK=0
ISTEK="$TMP/chat.json"
cat > "$ISTEK" <<JSON
{"model": $(printf '%s' "$MODEL" | sed 's/\\/\\\\/g; s/"/\\"/g; s/^/"/; s/$/"/'),
 "messages": [{"role": "user", "content": "Yalnizca OK yaz."}],
 "max_tokens": 16, "temperature": 0, "stream": false}
JSON
SOHBET_GOVDE="$TMP/chat-cevap.json"
cikti="$(curl -K "$CURL_CFG" --max-time "$ZAMAN_ASIMI" -o "$SOHBET_GOVDE" \
  -w '%{http_code} %{time_total}' -d @"$ISTEK" "$(uc_ver chat/completions)" 2>"$TMP/chat.err")"
curl_kod=$?
SOHBET_DURUM="${cikti%% *}"
SOHBET_SURE="${cikti##* }"
if [ $curl_kod -ne 0 ]; then
  hata "istek başarısız (curl çıkış kodu $curl_kod): $(tr -d '\n' < "$TMP/chat.err" | cut -c1-200)"
elif [ "$SOHBET_DURUM" = "200" ]; then
  SOHBET_OK=1
  ok "HTTP 200 · ${SOHBET_SURE} sn"
  ayrinti="$(json_al sohbet-cevabi "$SOHBET_GOVDE")"
  if [ -n "$ayrinti" ]; then
    printf '%s\n' "$ayrinti" | while IFS=$'\t' read -r etiket deger; do
      bilgi "$etiket: $deger"
    done
  else
    bilgi "gövde (ilk 200 karakter): $(tr -d '\n' < "$SOHBET_GOVDE" | cut -c1-200)"
  fi
else
  hata "HTTP $SOHBET_DURUM · ${SOHBET_SURE} sn"
  mesaj="$(json_al hata-mesaji "$SOHBET_GOVDE")"
  [ -z "$mesaj" ] && mesaj="$(tr -d '\n' < "$SOHBET_GOVDE" | cut -c1-200)"
  [ -n "$mesaj" ] && bilgi "uç mesajı: $mesaj"
fi

# ---------------------------------------------------------------------------
#  6) akış (stream) testi — opencode HER ZAMAN akış kullanır
# ---------------------------------------------------------------------------
echo
echo "== 6/8  akış testi (\"stream\": true) =="
AKIS_OK=0
ISTEK_AKIS="$TMP/chat-stream.json"
sed 's/"stream": false/"stream": true/' "$ISTEK" > "$ISTEK_AKIS"
AKIS_GOVDE="$TMP/stream.txt"
cikti="$(curl -K "$CURL_CFG" -N --max-time "$ZAMAN_ASIMI" -o "$AKIS_GOVDE" \
  -w '%{http_code} %{time_starttransfer} %{time_total}' -d @"$ISTEK_AKIS" \
  "$(uc_ver chat/completions)" 2>"$TMP/stream.err")"
curl_kod=$?
AKIS_DURUM="$(printf '%s' "$cikti" | awk '{print $1}')"
AKIS_ILK="$(printf '%s' "$cikti" | awk '{print $2}')"
AKIS_TOPLAM="$(printf '%s' "$cikti" | awk '{print $3}')"
if [ $curl_kod -ne 0 ]; then
  hata "akış isteği başarısız (curl çıkış kodu $curl_kod): $(tr -d '\n' < "$TMP/stream.err" | cut -c1-200)"
  [ "$curl_kod" = "28" ] && bilgi "zaman aşımı — uç akışı hiç başlatmıyor veya araya giren proxy tamponluyor"
elif [ "$AKIS_DURUM" = "200" ]; then
  # grep -c eşleşme yoksa 0 basıp 1 döner; sayıyı güvenli şekilde ayıkla
  parca="$(grep -c '^data:' "$AKIS_GOVDE" 2>/dev/null || true)"
  parca="$(printf '%s' "$parca" | tr -dc '0-9')"
  [ -n "$parca" ] || parca=0
  if [ "$parca" -gt 0 ]; then
    AKIS_OK=1
    ok "HTTP 200 · $parca SSE parçası · ilk bayt ${AKIS_ILK} sn · toplam ${AKIS_TOPLAM} sn"
    if grep -q '^data: \[DONE\]' "$AKIS_GOVDE"; then
      ok "akış [DONE] ile düzgün kapandı"
    else
      uyar "akışta [DONE] yok — bağlantı yarıda kopmuş olabilir (opencode'da 'cevap yarıda kesildi')"
    fi
  else
    hata "HTTP 200 ama SSE parçası yok — uç akış (text/event-stream) döndürmüyor"
    bilgi "opencode HER istekte akış kullanır; akış çalışmazsa TUI prompt gönderemez"
    bilgi "gövde (ilk 200 karakter): $(tr -d '\n' < "$AKIS_GOVDE" | cut -c1-200)"
  fi
else
  hata "HTTP $AKIS_DURUM (akışsız istek $SOHBET_DURUM dönmüştü)"
  mesaj="$(json_al hata-mesaji "$AKIS_GOVDE")"
  [ -z "$mesaj" ] && mesaj="$(tr -d '\n' < "$AKIS_GOVDE" | cut -c1-200)"
  [ -n "$mesaj" ] && bilgi "uç mesajı: $mesaj"
fi

# ---------------------------------------------------------------------------
#  7) tool_call testi — ajan modu bunsuz çalışmaz
# ---------------------------------------------------------------------------
echo
echo "== 7/8  araç çağrısı (tool_call) testi =="
ARAC_OK=0
ARAC_DESTEK_YOK=0
ISTEK_ARAC="$TMP/chat-tool.json"
MODEL_JSON="$(printf '%s' "$MODEL" | sed 's/\\/\\\\/g; s/"/\\"/g; s/^/"/; s/$/"/')"
cat > "$ISTEK_ARAC" <<JSON
{"model": $MODEL_JSON,
 "messages": [{"role": "user", "content": "Ankara'nin hava durumunu ogren. Bunun icin aracı kullan."}],
 "tools": [{"type": "function", "function": {"name": "hava_durumu",
   "description": "Bir sehrin hava durumunu dondurur",
   "parameters": {"type": "object", "properties": {"sehir": {"type": "string", "description": "sehir adi"}},
     "required": ["sehir"]}}}],
 "tool_choice": "auto", "max_tokens": 128, "temperature": 0, "stream": false}
JSON
ARAC_GOVDE="$TMP/tool.json"
cikti="$(curl -K "$CURL_CFG" --max-time "$ZAMAN_ASIMI" -o "$ARAC_GOVDE" \
  -w '%{http_code} %{time_total}' -d @"$ISTEK_ARAC" "$(uc_ver chat/completions)" 2>"$TMP/tool.err")"
curl_kod=$?
ARAC_DURUM="${cikti%% *}"
ARAC_SURE="${cikti##* }"
if [ $curl_kod -ne 0 ]; then
  uyar "araç isteği başarısız (curl çıkış kodu $curl_kod)"
elif [ "$ARAC_DURUM" = "200" ]; then
  sonuc="$(json_al arac-cagrisi "$ARAC_GOVDE")"
  if printf '%s' "$sonuc" | grep -q '^ad	'; then
    ARAC_OK=1
    ok "HTTP 200 · ${ARAC_SURE} sn · model aracı çağırdı"
    printf '%s\n' "$sonuc" | while IFS=$'\t' read -r etiket deger; do bilgi "$etiket: $deger"; done
  elif grep -q '"tool_calls"' "$ARAC_GOVDE"; then
    ARAC_OK=1
    ok "HTTP 200 · yanıtta tool_calls var"
  else
    uyar "HTTP 200 ama model aracı çağırmadı (düz metin döndü)"
    bilgi "$(printf '%s' "$sonuc" | cut -c1-160)"
    bilgi "uç 'tools' alanını kabul etti ama model kullanmadı — ajan modu güvenilmez olabilir"
  fi
else
  ARAC_DESTEK_YOK=1
  uyar "HTTP $ARAC_DURUM — uç araç çağrısını (tools) kabul etmedi"
  mesaj="$(json_al hata-mesaji "$ARAC_GOVDE")"
  [ -z "$mesaj" ] && mesaj="$(tr -d '\n' < "$ARAC_GOVDE" | cut -c1-200)"
  [ -n "$mesaj" ] && bilgi "uç mesajı: $mesaj"
  bilgi "opencode.json'da tool_call: true ise ajan modu çalışmaz — uç ekibine sor"
fi

# ---------------------------------------------------------------------------
#  8) bağlam penceresi + kurulu ayar karşılaştırması
# ---------------------------------------------------------------------------
echo
echo "== 8/8  bağlam penceresi ve kurulu ayar =="
PENCERE_UC=""
if [ -s "$MODELS_GOVDE" ]; then
  satir="$(json_al pencere "$MODELS_GOVDE" | grep -F "$MODEL" | head -1)"
  kendi_modeli=1
  if [ -z "$satir" ]; then
    satir="$(json_al pencere "$MODELS_GOVDE" | head -1)"
    kendi_modeli=0
  fi
  if [ -n "$satir" ] && [ "$kendi_modeli" -eq 1 ]; then
    alan="$(printf '%s' "$satir" | cut -f2)"
    PENCERE_UC="$(printf '%s' "$satir" | cut -f3)"
    ok "uç bildiriyor: $alan = $PENCERE_UC token"
  elif [ -n "$satir" ]; then
    uyar "seçili model için pencere bilgisi yok; uçtaki başka bir model bildiriyor:"
    bilgi "$(printf '%s' "$satir" | tr '\t' ' ')"
  else
    uyar "uç /models çıktısında bağlam penceresi alanı yok (max_model_len vb.)"
    [ -n "$PENCERE_ENV" ] && bilgi "env'deki KURUM_MAX_CONTEXT=$PENCERE_ENV kullanılacak"
    [ -z "$PENCERE_ENV" ] && bilgi "env'e KURUM_MAX_CONTEXT=<token> ekleyip ./kur.sh çalıştır"
  fi
fi
[ -n "$PENCERE_ENV" ] && bilgi "env KURUM_MAX_CONTEXT = $PENCERE_ENV"
if [ -n "$PENCERE_UC" ] && [ -n "$PENCERE_ENV" ] && [ "$PENCERE_UC" != "$PENCERE_ENV" ]; then
  uyar "env ($PENCERE_ENV) ile uç ($PENCERE_UC) farklı — kur.sh uçtakini yazar"
fi

AYAR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode.json"
if [ -f "$AYAR" ] && [ -n "$PY" ]; then
  kurulu="$("$PY" - "$AYAR" <<'PY' 2>/dev/null || true
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        cfg = json.load(handle)
except Exception:
    sys.exit(0)
for ad, saglayici in (cfg.get("provider") or {}).items():
    taban = ((saglayici.get("options") or {}).get("baseURL")) or ""
    for model_id, model in (saglayici.get("models") or {}).items():
        sinir = (model.get("limit") or {}).get("context") or "?"
        print("%s\t%s\t%s\t%s" % (ad, model_id, taban, sinir))
PY
)"
  if [ -n "$kurulu" ]; then
    printf '%s\n' "$kurulu" | while IFS=$'\t' read -r saglayici model_id taban sinir; do
      bilgi "kurulu ayar: $saglayici/$model_id · baseURL=$taban · context=$sinir"
    done
    if ! printf '%s\n' "$kurulu" | cut -f3 | grep -Fxq "$KOK_URL"; then
      uyar "kurulu opencode.json'daki baseURL env'deki KURUM_URL ile aynı değil — ./kur.sh çalıştır"
    fi
    if ! printf '%s\n' "$kurulu" | cut -f2 | grep -Fxq "$MODEL"; then
      uyar "kurulu opencode.json'daki model kimliği env'deki MODEL_ID ile aynı değil — ./kur.sh çalıştır"
    fi
  fi
else
  bilgi "kurulu ayar okunamadı ($AYAR yok veya python3 yok) — atlandı"
fi

# ---------------------------------------------------------------------------
#  SONUÇ
# ---------------------------------------------------------------------------
LOG_DIZIN="${XDG_DATA_HOME:-$HOME/.local/share}/opencode/log"
echo
echo "==============================================================="
echo " SONUÇ"
echo "==============================================================="
printf ' hata: %s · uyarı: %s\n' "$HATA" "$UYARI"
echo
if [ "$HATA" -eq 0 ] && [ "$SOHBET_OK" -eq 1 ] && [ "$AKIS_OK" -eq 1 ]; then
  yesil "SONUÇ: uç sağlıklı."
  echo " Uç hem akışsız hem akışlı istekleri yanıtlıyor, MODEL_ID doğru."
  if [ "$ARAC_DESTEK_YOK" -eq 1 ]; then
    sari " ANCAK uç araç çağrısını (tools) reddetti — ajan modu (dosya okuma/yazma) çalışmaz."
    sari " Bu tek başına 'Failed to send prompt' sebebi olabilir: opencode her isteğe araç şeması ekler."
  elif [ "$ARAC_OK" -eq 0 ]; then
    sari " ANCAK araç çağrısı doğrulanamadı — ajan modu güvenilmez olabilir."
  fi
  echo
  echo " => Sorun büyük olasılıkla OPENCODE TARAFINDA."
  echo "    Yapılacak:"
  echo "      1) TUI'deki toast'ta yazan err_xxxxxxxx referansını al."
  echo "      2) grep -r 'err_xxxxxxxx' $LOG_DIZIN"
  echo "      3) O satırdaki 'cause' alanını (tam yığın) Doktor'a/Patron'a gönder."
  echo "      4) Detaylı log: opencode --log-level DEBUG"
  CIKIS=0
elif [ "$TCP_OK" -eq 0 ] || [ "$MODELS_DURUM" = "000" ]; then
  kirmizi "SONUÇ: uç sorunlu — AĞ/ERİŞİM."
  echo " $HOST:$PORT adresine bu makineden ulaşılamıyor (DNS, güvenlik duvarı, port veya proxy)."
  echo " => Sorun UÇ/AĞ TARAFINDA. opencode'u kurcalamaya gerek yok."
  echo "    Kontrol: getent hosts $HOST · ping $HOST · curl -v $(uc_ver models)"
  CIKIS=1
elif [ "$MODELS_DURUM" = "401" ] || [ "$MODELS_DURUM" = "403" ] || [ "$SOHBET_DURUM" = "401" ] || [ "$SOHBET_DURUM" = "403" ]; then
  kirmizi "SONUÇ: uç sorunlu — KİMLİK DOĞRULAMA (HTTP $MODELS_DURUM/$SOHBET_DURUM)."
  echo " => KURUM_KEY yanlış veya eksik. $ENV_DOSYASI içindeki anahtarı düzelt, sonra ./kur.sh"
  CIKIS=1
elif [ "$MODEL_BULUNDU" -eq 0 ] && [ "$MODELS_DURUM" = "200" ]; then
  kirmizi "SONUÇ: uç ayakta ama YAPILANDIRMA yanlış."
  echo " Uç yanıt veriyor; MODEL_ID uçtaki listeyle eşleşmiyor (4. adımdaki listeye bak)."
  echo " => Sorun OPENCODE/ENV TARAFINDA: MODEL_ID'yi listeden birebir kopyala, ./kur.sh çalıştır."
  CIKIS=1
elif [ "$SOHBET_OK" -eq 1 ] && [ "$AKIS_OK" -eq 0 ]; then
  kirmizi "SONUÇ: uç sorunlu — AKIŞ (streaming) çalışmıyor."
  echo " Akışsız istek çalışıyor ama \"stream\": true çalışmıyor."
  echo " opencode her istekte akış kullanır; bu yüzden TUI 'Failed to send prompt' verir."
  echo " => Sorun UÇ/PROXY TARAFINDA: araya giren proxy SSE'yi tamponluyor olabilir"
  echo "    (nginx: proxy_buffering off) ya da uç stream desteklemiyor."
  CIKIS=1
else
  kirmizi "SONUÇ: uç sorunlu — yukarıdaki ✗ satırlarına bak."
  echo " => En olası taraf: UÇ. Raporun tamamını kopyalayıp uç ekibine/Patron'a gönder."
  CIKIS=1
fi
echo
echo " Bu raporu olduğu gibi kopyalayıp gönderebilirsin (anahtar maskelendi)."
exit "$CIKIS"
