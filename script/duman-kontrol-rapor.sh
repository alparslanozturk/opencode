#!/usr/bin/env bash
# =============================================================================
#  duman-kontrol-rapor.sh — kur.sh kontrol raporunun SAHA SÖZLEŞMESİNİ doğrular.
#
#  Neyi kanıtlar (GOREV oc-T234):
#    T2  rapor her modda ≤29 satır (tek uçlu ve iki uçlu), veri kaybı olmadan
#    T3  çıktı (output) sınırı uçtan öğrenilir; alınamazsa 4096'ya düşer ve
#        raporda "uctan alinamadi" diye görünür (sessizce sabit kalmaz)
#    T4  ikili ↔ sürüm ↔ commit tutarsızlığı uyarı satırı basar, tutarlıysa basmaz
#
#  Kurum ağı YOKTUR: uç, script/sahte-uc.py ile taklit edilir (loopback).
#  Gerçek ~/.opencode ve ~/.config/opencode'a DOKUNULMAZ: her durum kendi
#  geçici HOME'unda koşar. Sahada çalıştırılmaz, gelistirici testidir.
#
#  Kullanim:  ./script/duman-kontrol-rapor.sh
#  Cikis:     0 = hepsi gecti · 1 = en az bir durum kaldi
# =============================================================================
set -uo pipefail

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SATIR_BUTCESI=29
GECEN=0
KALAN=0

CALISMA="$(mktemp -d "${TMPDIR:-/tmp}/oc-duman-rapor.XXXXXX")"
SUNUCULAR=""
temizle() {
  local p
  for p in $SUNUCULAR; do kill "$p" 2> /dev/null; done
  rm -rf "$CALISMA"
}
trap temizle EXIT

gecti() { printf '  GECTI  %s\n' "$*"; GECEN=$((GECEN + 1)); }
kaldi() { printf '  KALDI  %s\n' "$*"; KALAN=$((KALAN + 1)); }
baslik() { printf '\n== %s\n' "$*"; }

# uc_baslat <ad> [SAHTE_* atamalari...] — sahte ucu baslatir, portu basar
uc_baslat() {
  local ad="$1"; shift
  env "$@" python3 "$KOK/script/sahte-uc.py" > "$CALISMA/$ad.port" 2> "$CALISMA/$ad.err" &
  SUNUCULAR="$SUNUCULAR $!"
  local port=""
  local _i
  for _i in $(seq 1 60); do
    port="$(cat "$CALISMA/$ad.port" 2> /dev/null)"
    [ -n "$port" ] && break
    sleep 0.1
  done
  printf '%s' "$port"
}

# kum_hazirla <ad> — kur.sh'i izole bir kok + HOME ile kosturacak kum havuzu
# kurar. bin/ gercek ikiliye BAG ile baglanir (212 MB kopyalanmaz), engine ve
# knowledge de baglanir; kur.sh ise KOPYALANIR (betik kendi konumundan KOK'u
# cozdugu icin bag olsaydi gercek depoya isaret ederdi).
kum_hazirla() {
  local kum="$CALISMA/$1"
  mkdir -p "$kum/bin" "$kum/home" "$kum/kisayol"
  cp "$KOK/kur.sh" "$kum/kur.sh"
  ln -sf "$KOK/bin/opencode" "$kum/bin/opencode"
  [ -f "$KOK/bin/ripgrep.tar.xz" ] && ln -sf "$KOK/bin/ripgrep.tar.xz" "$kum/bin/ripgrep.tar.xz"
  ln -sf "$KOK/engine" "$kum/engine"
  ln -sf "$KOK/knowledge" "$kum/knowledge"
  [ -d "$KOK/.git" ] && ln -sf "$KOK/.git" "$kum/.git"
  printf '%s' "$kum"
}

# kum_env <kum> <url> [ek satirlar...]
kum_env() {
  local kum="$1" url="$2"; shift 2
  {
    printf 'KURUM_URL=%s\n' "$url"
    printf 'KURUM_KEY=dummy\n'
    printf 'MODEL_ID=%s\n' "$MODEL"
    local s
    for s in "$@"; do printf '%s\n' "$s"; done
  } > "$kum/env"
  chmod 600 "$kum/env"
}

# kos <kum> <alt-komut> [bayraklar...] — kum havuzunda kur.sh calistirir
kos() {
  local kum="$1"; shift
  ( cd "$kum" && env -i \
      HOME="$kum/home" \
      PATH="$kum/kisayol:/usr/local/bin:/usr/bin:/bin" \
      LANG=C.UTF-8 TERM=dumb \
      KISAYOL_DIZIN="$kum/kisayol" \
      ALP_DERLEME_YOK=1 \
      OPENCODE_VERSION="${SAHTE_SURUM:-$IKILI_SURUM}" \
      ./kur.sh "$@" ) 2>&1
}

MODEL="/data/sahte-model"
IKILI_SURUM="$("$KOK/bin/opencode" --version 2> /dev/null || echo '?')"
IKILI_BOYUT="$(stat -c '%s' "$KOK/bin/opencode" 2> /dev/null || echo 0)"
HEAD_KISA="$(git -C "$KOK" rev-parse --short HEAD 2> /dev/null || echo '')"

if [ ! -x "$KOK/bin/opencode" ]; then
  echo "HATA: $KOK/bin/opencode yok — once ./kur.sh derle --bin-kopyala" >&2
  exit 2
fi
if ! command -v python3 > /dev/null 2>&1; then
  echo "HATA: python3 yok — sahte uc calistirilamaz" >&2
  exit 2
fi

echo "kur.sh duman testi · ikili surum $IKILI_SURUM · HEAD ${HEAD_KISA:-yok}"

# ---------------------------------------------------------------------------
#  T3 — cikti sinirinin ogrenildigi 4 yol
# ---------------------------------------------------------------------------
cikti_durumu() { # <ad> <beklenen-cikti> <beklenen-kaynak-parcasi> [SAHTE_* ...]
  local ad="$1" bek_cikti="$2" bek_kaynak="$3"; shift 3
  local kum port cikti kaynak
  kum="$(kum_hazirla "$ad")"
  port="$(uc_baslat "$ad" SAHTE_MODEL="$MODEL" SAHTE_CTX=32768 "$@")"
  if [ -z "$port" ]; then kaldi "$ad: sahte uc baslamadi"; return; fi
  kum_env "$kum" "http://127.0.0.1:$port/v1" ${EK_ENV:+"$EK_ENV"}
  kos "$kum" kur --zaman-asimi 8 > "$CALISMA/$ad.log" 2>&1
  cikti="$(python3 -c '
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
p = d["provider"]["kurum"]
m = list(p["models"])[0]
print((p["models"][m].get("limit") or {}).get("output", ""))' \
    "$kum/home/.config/opencode/opencode.json" 2> /dev/null)"
  kaynak="$(sed -n 's/^cikti_kaynak=//p' "$kum/home/.config/opencode/kur-durum" 2> /dev/null | head -1)"
  if [ "$cikti" = "$bek_cikti" ]; then
    gecti "$ad: opencode.json limit.output = $cikti"
  else
    kaldi "$ad: limit.output beklenen $bek_cikti, bulunan '${cikti:-yok}' (log: $CALISMA/$ad.log)"
  fi
  case "$kaynak" in
    *"$bek_kaynak"*) gecti "$ad: kaynak kunyesi = '$kaynak'" ;;
    *) kaldi "$ad: kaynak '$kaynak' icinde '$bek_kaynak' yok" ;;
  esac
}

baslik "T3 — cikti siniri uctan ogreniliyor mu?"
EK_ENV=""
cikti_durumu t3-alan 8192 "uc alani max_output_tokens" \
  SAHTE_CIKTI_ALAN=max_output_tokens SAHTE_CIKTI=8192
cikti_durumu t3-probe 8192 "uc probe" \
  SAHTE_PROBE_HATA=1 SAHTE_PROBE_SINIR=8192
EK_ENV="KURUM_MAX_OUTPUT=6000"
cikti_durumu t3-env 6000 "env KURUM_MAX_OUTPUT"
EK_ENV=""
cikti_durumu t3-varsayilan 4096 "uctan alinamadi"

# fallback durumunda rapor bunu SOYLEMELI (sessizce 4096 kalmasin)
if grep -q 'uctan alinamadi' "$CALISMA/t3-varsayilan.log"; then
  gecti "t3-varsayilan: rapor 'uctan alinamadi' diyor"
else
  kaldi "t3-varsayilan: rapor fallback'i belirtmiyor (log: $CALISMA/t3-varsayilan.log)"
fi
# uc alan veriyorsa 4096 SABIT KALMAMALI
if grep -q 'cikti 8192' "$CALISMA/t3-alan.log"; then
  gecti "t3-alan: kontrol raporu cikti 8192 gosteriyor"
else
  kaldi "t3-alan: kontrol raporunda 'cikti 8192' yok (log: $CALISMA/t3-alan.log)"
fi

# ---------------------------------------------------------------------------
#  T2 — satir butcesi (tek uc / iki uc / --ayrintili)
# ---------------------------------------------------------------------------
baslik "T2 — kontrol raporu satir butcesi (<=$SATIR_BUTCESI)"
KUM="$(kum_hazirla t2)"
P1="$(uc_baslat t2a SAHTE_MODEL="$MODEL" SAHTE_CTX=32768 SAHTE_CIKTI_ALAN=max_output_tokens SAHTE_CIKTI=8192)"
P2="$(uc_baslat t2b SAHTE_MODEL="$MODEL" SAHTE_CTX=32768 SAHTE_CIKTI_ALAN=max_output_tokens SAHTE_CIKTI=8192)"
kum_env "$KUM" "http://127.0.0.1:$P1/v1"
kos "$KUM" kur --zaman-asimi 8 > "$CALISMA/t2-kur.log" 2>&1

# kunyeyi tutarli yaz ki T4 uyarisi butceyi sismesin (T4 ayri test ediyor)
{
  printf 'surum=%s\n' "$IKILI_SURUM"
  printf 'kanal=main\n'
  printf 'commit=%s\n' "$HEAD_KISA"
  printf 'kirli=0\n'
  printf 'boyut=%s\n' "$IKILI_BOYUT"
  printf 'tarih=2026-09-23 12:00\n'
} > "$KUM/home/.opencode/bin/opencode.derleme"

olc() { # <ad> <beklenen-en-fazla> [ek bayrak...] — sonucu SATIR degiskenine koyar
  local ad="$1" ust="$2"; shift 2
  kos "$KUM" kontrol --zaman-asimi 8 "$@" > "$CALISMA/$ad.txt" 2>&1
  SATIR="$(wc -l < "$CALISMA/$ad.txt")"
  if [ "$SATIR" -le "$ust" ]; then
    gecti "$ad: $SATIR satir (butce $ust) — wc -l ile olculdu"
  else
    kaldi "$ad: $SATIR satir — butce $ust asildi ($CALISMA/$ad.txt)"
  fi
}

olc t2-tek-uc "$SATIR_BUTCESI"
kum_env "$KUM" "http://127.0.0.1:$P1/v1" "KURUM_URL_2=http://127.0.0.1:$P2/v1"
olc t2-iki-uc "$SATIR_BUTCESI"

# iki uclu raporda uc basina veri KORUNMUS mu? (erisim · model · baglam · medyan)
KAYIP=""
grep -q 'uc1' "$CALISMA/t2-iki-uc.txt" || KAYIP="$KAYIP uc1"
grep -q 'uc2' "$CALISMA/t2-iki-uc.txt" || KAYIP="$KAYIP uc2"
grep -qE 'mdl (✓|✗|\?)' "$CALISMA/t2-iki-uc.txt" || KAYIP="$KAYIP model-durumu"
grep -q 'ctx32768' "$CALISMA/t2-iki-uc.txt" || KAYIP="$KAYIP baglam"
grep -qE '[0-9]+ms' "$CALISMA/t2-iki-uc.txt" || KAYIP="$KAYIP medyan"
grep -qE '>> (daha hizli|hiz esit|karar yok|yalniz uc)' "$CALISMA/t2-iki-uc.txt" || KAYIP="$KAYIP karar"
if [ -z "$KAYIP" ]; then
  gecti "t2-iki-uc: uc basina veri korunmus (erisim · model · baglam · medyan · karar)"
else
  kaldi "t2-iki-uc: raporda eksik:$KAYIP"
fi

# satirlar 100 sutunu asmamali (MobaXterm'de sarmasin)
UZUN="$(awk '{ gsub(/\033\[[0-9;]*m/, ""); if (length($0) > 100) print FILENAME": "length($0) }' \
  "$CALISMA/t2-tek-uc.txt" "$CALISMA/t2-iki-uc.txt" | head -3)"
if [ -z "$UZUN" ]; then
  gecti "t2: hicbir satir 100 sutunu asmiyor"
else
  kaldi "t2: 100 sutunu asan satir var — $UZUN"
fi

# --ayrintili: butce yok ama calismali ve uc basina 3 satir acilmali
kos "$KUM" kontrol --zaman-asimi 8 -a > "$CALISMA/t2-ayrintili.txt" 2>&1
if [ "$(grep -c 'uc1 \(uc\|model\|olcum\)' "$CALISMA/t2-ayrintili.txt")" -eq 3 ] \
  && [ "$(grep -c 'uc2 \(uc\|model\|olcum\)' "$CALISMA/t2-ayrintili.txt")" -eq 3 ]; then
  gecti "t2-ayrintili: -a bayragi uc basina 3 satir aciyor"
else
  kaldi "t2-ayrintili: uc basina 3 ayrinti satiri yok ($CALISMA/t2-ayrintili.txt)"
fi

# ---------------------------------------------------------------------------
#  T4 — ikili <-> surum <-> commit tutarliligi
# ---------------------------------------------------------------------------
baslik "T4 — surum/derleme tutarliligi"
KUNYE="$KUM/home/.opencode/bin/opencode.derleme"

# a) tutarli kunye -> uyari YOK, ama surum/commit bilgisi raporda GORUNUR
kos "$KUM" kontrol --zaman-asimi 8 --kurulum > "$CALISMA/t4-tutarli.txt" 2>&1
if grep -q "surum $IKILI_SURUM · commit ${HEAD_KISA} (=HEAD)" "$CALISMA/t4-tutarli.txt"; then
  gecti "t4: ikili satiri surum + commit + HEAD gosteriyor"
else
  kaldi "t4: ikili satirinda surum/commit/HEAD yok ($CALISMA/t4-tutarli.txt)"
fi
if grep -q '^ surum ' "$CALISMA/t4-tutarli.txt"; then
  kaldi "t4: tutarliyken bile uyari satiri basildi ($CALISMA/t4-tutarli.txt)"
else
  gecti "t4: tutarliyken uyari satiri basilmiyor (butce korunur)"
fi

# b) kunye baska commit'ten -> uyari VAR
sed -i 's/^commit=.*/commit=deadbee/' "$KUNYE"
kos "$KUM" kontrol --zaman-asimi 8 --kurulum > "$CALISMA/t4-commit.txt" 2>&1
if grep -q 'ikili commit deadbee, repo HEAD' "$CALISMA/t4-commit.txt"; then
  gecti "t4: commit uyusmazliginda uyari satiri basildi"
else
  kaldi "t4: commit uyusmazligi uyarisi yok ($CALISMA/t4-commit.txt)"
fi

# c) kunye hic yok -> "izlenemiyor" uyarisi
rm -f "$KUNYE"
kos "$KUM" kontrol --zaman-asimi 8 --kurulum > "$CALISMA/t4-kunyesiz.txt" 2>&1
if grep -q 'derleme kunyesi yok' "$CALISMA/t4-kunyesiz.txt"; then
  gecti "t4: kunye yokken 'izlenemiyor' uyarisi basildi"
else
  kaldi "t4: kunyesiz durumda uyari yok ($CALISMA/t4-kunyesiz.txt)"
fi

# d) kunye var ama baska ikiliye ait (boyut tutmuyor) -> uyari VAR
{
  printf 'surum=%s\n' "$IKILI_SURUM"
  printf 'commit=%s\n' "$HEAD_KISA"
  printf 'kirli=0\n'
  printf 'boyut=1\n'
  printf 'tarih=2026-09-23 12:00\n'
} > "$KUNYE"
kos "$KUM" kontrol --zaman-asimi 8 --kurulum > "$CALISMA/t4-boyut.txt" 2>&1
if grep -q 'kunyesi ikiliyle eslesmiyor' "$CALISMA/t4-boyut.txt"; then
  gecti "t4: bayat kunye (boyut farkli) yakalandi"
else
  kaldi "t4: bayat kunye yakalanmadi ($CALISMA/t4-boyut.txt)"
fi

# e) ikili surumu kur.sh'in bekledigi surum degilse -> uyari VAR
SAHTE_SURUM="9.9.9"
kos "$KUM" kontrol --zaman-asimi 8 --kurulum > "$CALISMA/t4-surum.txt" 2>&1
unset SAHTE_SURUM
if grep -q "kur.sh bekleneni 9.9.9" "$CALISMA/t4-surum.txt"; then
  gecti "t4: surum uyusmazliginda uyari satiri basildi"
else
  kaldi "t4: surum uyusmazligi uyarisi yok ($CALISMA/t4-surum.txt)"
fi

# f) kunye YAZMA yolu (derle asamasi) — derleme yapmadan, fonksiyonu tek tek kos
KUNYE_TEST="$CALISMA/kunye-yaz.out"
(
  # shellcheck disable=SC1090
  source "$KOK/kur.sh" > /dev/null 2>&1
  SURUM="1.2.3" KANAL="main" kunye_yaz "$KOK/bin/opencode" "$KUNYE_TEST"
) 2> /dev/null
if [ -s "$KUNYE_TEST" ] \
  && grep -q '^surum=1.2.3$' "$KUNYE_TEST" \
  && grep -q "^commit=${HEAD_KISA}\$" "$KUNYE_TEST" \
  && grep -q "^boyut=${IKILI_BOYUT}\$" "$KUNYE_TEST" \
  && grep -qE '^tarih=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$' "$KUNYE_TEST"; then
  gecti "t4: kunye_yaz surum/commit/boyut/tarih alanlarini yaziyor"
else
  kaldi "t4: kunye_yaz beklenen alanlari yazmadi ($KUNYE_TEST)"
fi

echo
echo "== A16 — anahtar komut satirina (ps) cikmiyor"
# Dis komuta (curl/python) anahtar argv ile verilmemeli: yalniz printf→`curl -K -`/config dosyasi
# ya da ortam degiskeni. Bash fonksiyon cagrilari (cikti_probe, uc_olc, curl_baslik) ayni surecte, gorunmez.
ARGV_DESEN='Bearer [$]|"[$](KURUM_KEY|KEY|KEY2|anahtar)"'
SERBEST_DESEN="printf 'header|\[ -n |^[0-9]+: *#|=\"[\$](KURUM_KEY|KEY)\"|(cikti_probe|uc_olc|maskele|curl_baslik) "
SIZINTI="$(grep -nE "$ARGV_DESEN" "$KOK/kur.sh" | grep -vE "$SERBEST_DESEN" || true)"
if [ -z "$SIZINTI" ]; then
  gecti "a16: kur.sh'ta anahtar dis komut argv'sine verilmiyor"
else
  kaldi "a16: anahtar argv'de olabilir: $(printf '%s' "$SIZINTI" | head -3 | tr '\n' ' ')"
fi

printf '\n== SONUC: %s gecti, %s kaldi\n' "$GECEN" "$KALAN"
[ "$KALAN" -eq 0 ] || exit 1
exit 0
