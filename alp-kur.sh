#!/usr/bin/env bash
# =============================================================================
#  alp-kur.sh — opencode kurulumunun TEK KOMUTU (kurum içi, offline; ağ/npm gerekmez).
#
#  Kullanım:  cd /root/ai/opencode && ./alp-kur.sh     ← hepsi bu, BAYRAK YOK
#             (dizin adı önemli değil, betik kendi yolunu bulur)
#
#  Bayraksız çağrı TAM İŞİ yapar:
#    1) gerekirse DERLER  — ikili yoksa ya da kaynak ağacı ikiliden yeniyse (kararı kendi verir)
#    2) KURAR             — ikili + ayar + kurallar (AGENTS.md) + beceriler + plugin + ripgrep
#    3) KISAYOLU DÜZELTİR — 'opencode' ve 'oc'; başka yeri gösteriyorsa yedekler ve çevirir
#    4) DOĞRULAR          — sonda tek ekran özet ("kuruldu / hazır")
#
#  İkili nereden gelir (sırayla): bin/opencode → bin/opencode.tar.xz → kaynaktan derleme.
#  Sonrasında kontrol/teşhis için tek komut:  ./alp-kontrol.sh
#
#  İç detay (kullanıcının bilmesine gerek yok; yalnız ayıklama için ortam değişkenleri):
#    ALP_DERLE=1 ikili güncel olsa da derle · ALP_DERLEME_YOK=1 hiç derleme ·
#    ALP_TUM_BECERILER=1 tüm beceriler · ALP_IKILI_INDIR=1 Release asset'inden indir ·
#    ALP_DERLE_EK="--ignore-scripts" derleyiciye ek bun bayrağı ·
#    KISAYOL_DIZIN (varsayılan /usr/local/bin, yazılamıyorsa ~/.local/bin) · IKILI_RELEASE_URL
#  Derlemeyi alp-derle.sh yapar; onu bu betik çağırır, elle çalıştırmaya gerek yoktur.
# =============================================================================
set -euo pipefail
KOK="$(cd "$(dirname "$0")" && pwd)"

# İndirme (ALP_IKILI_INDIR) varsayılanı: repo Release asset'i (token'sız HTTPS, 185 MB ikili git'e girmez).
IKILI_RELEASE_URL="${IKILI_RELEASE_URL:-https://github.com/alparslanozturk/opencode/releases/download/bin-v1.18.30/opencode}"

# Kullanıcıya dönük bayrak YOK (Alp, 2026-09-22: "scriptlerin parametre almasına gerek yok;
# zaten amaç kurmak"). Yardım dışında argüman kabul edilmez.
if [ $# -gt 0 ]; then
  case "$1" in
    -h|--help|--yardim) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)
      echo "!! alp-kur.sh bayrak almaz — tek komut yeter:  ./alp-kur.sh" >&2
      echo "   (kurulum zaten gerekirse derler, kurar, kısayolu düzeltir ve doğrular)" >&2
      echo "   Kontrol/teşhis için:  ./alp-kontrol.sh" >&2
      exit 2 ;;
  esac
fi

TUM_BECERILER="${ALP_TUM_BECERILER:-0}"
IKILI_INDIR="${ALP_IKILI_INDIR:-0}"
DERLE="${ALP_DERLE:-0}"
DERLEME_YOK="${ALP_DERLEME_YOK:-0}"
ALP_EK=()   # derleyiciye (alp-derle.sh) aktarılacak ek bayraklar — ALP_DERLE_EK ile
if [ -n "${ALP_DERLE_EK:-}" ]; then
  read -r -a ALP_EK <<< "${ALP_DERLE_EK}"
fi

# Çekirdek beceri listesi (Aşama 2, danışma-2 kararı: 38 → 10; 2026-09-16 Alp kararıyla
# kalan 28 beceri knowledge/skills/parked/'a taşındı, bkz. parked/README.md). --tum-beceriler
# approved/ + parked/ birlikte kurar (hepsi).
CORE_SKILLS=(ansible k8s-rancher rhel-yonetim filo-durum-kontrolu rapor-uret rapor-excel-pdf hata-ayikla performans sistem-guncelleme depolama)
if [ ! -f "$KOK/env" ]; then
  echo "!! $KOK/env bulunamadi." >&2
  echo "   Olustur ve 3 satiri doldur:" >&2
  if [ -f "$KOK/env.example" ]; then
    echo "     cp $KOK/env.example $KOK/env && vi $KOK/env" >&2
  else
    echo "     Su 3 satirla olustur (degerleri kurumdan al):" >&2
    echo "       KURUM_URL=http(s)://<endpoint>:<port>/v1" >&2
    echo "       KURUM_KEY=dummy" >&2
    echo "       MODEL_ID=MODEL_ID_YER_TUTUCU" >&2
  fi
  echo "   (env bilerek git'te degil: URL + anahtar repoda durmasin.)" >&2
  exit 1
fi
# shellcheck disable=SC1090
. "$KOK/env"
# Denetim bulgusu #8: env dosyası kurum endpoint'i + anahtarı taşıyor ama
# varsayılan umask ile 644 (dünya-okunur) oluşabiliyor — mümkünse sıkılaştır
# (yazma izni yoksa/başka kullanıcıya aitse sessizce geç, kurulumu bozma).
chmod 600 "$KOK/env" 2>/dev/null || true

# env dosyası var ama 3 zorunlu satırdan biri eksikse `set -u` altında ham
# "unbound variable" hatası yerine dostane mesaj ver.
eksik_degisken=""
for degisken in KURUM_URL KURUM_KEY MODEL_ID; do
  [ -n "${!degisken:-}" ] || eksik_degisken="$eksik_degisken $degisken"
done
if [ -n "$eksik_degisken" ]; then
  echo "!! $KOK/env eksik/bozuk — şu değişken(ler) tanımlı değil:$eksik_degisken" >&2
  echo "   $KOK/env.example ile karşılaştır, 3 satırı da doldur." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "!! python3 bulunamadı — alp-kur.sh config yazımı (bağlam penceresi tespiti, opencode.json üretimi) için gerekli." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
#  0) İkili nereden gelecek? Kararı BU BETİK verir (kullanıcı bayrak öğrenmez):
#       bin/opencode yok            -> paketten aç / (istenirse indir) / kaynaktan derle
#       kaynak ağacı ikiliden yeni  -> kaynaktan yeniden derle
#       aksi halde                  -> derleme yok, doğrudan kur
# ---------------------------------------------------------------------------
DERLENDI=0
IKILI_KAYNAGI=""
IKILI_PAKETTEN=0

kaynak_agaci_var() {
  [ -x "$KOK/alp-derle.sh" ] && [ -f "$KOK/bun.lock" ] && [ -d "$KOK/packages/opencode" ]
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

derle_kaynaktan() {
  echo "== 0/4  kaynaktan derleme ($DERLE_NEDEN) =="
  # alp-derle.sh kısayol KURMAZ (tek sahip alp-kur.sh); --bin-kopyala ile ikiliyi bin/opencode'a bırakır.
  if "$KOK/alp-derle.sh" --bin-kopyala ${ALP_EK[@]+"${ALP_EK[@]}"}; then
    DERLENDI=1
    IKILI_KAYNAGI="kaynaktan derlendi — $DERLE_NEDEN"
    return 0
  fi
  echo "!! derleme başarısız (alp-derle.sh) — yukarıdaki çıktıya bak." >&2
  return 1
}

if [ ! -x "$KOK/bin/opencode" ] && [ -f "$KOK/bin/opencode.tar.xz" ]; then
  echo ">> bin/opencode yok — bin/opencode.tar.xz aciliyor (bir kez)..."
  tar xJf "$KOK/bin/opencode.tar.xz" -C "$KOK/bin" && chmod +x "$KOK/bin/opencode"
  if [ -x "$KOK/bin/opencode" ]; then
    IKILI_KAYNAGI="bin/opencode.tar.xz açıldı"
    IKILI_PAKETTEN=1   # paketten gelen ikiliyi tazelik kontrolüyle yeniden derlemeye kalkma
  fi
fi

if [ ! -f "$KOK/bin/opencode" ] && [ "$IKILI_INDIR" = "1" ]; then
  if command -v curl >/dev/null 2>&1; then
    echo ">> bin/opencode yok — Release asset'inden indiriliyor (token'sız HTTPS): $IKILI_RELEASE_URL"
    if curl -fSL -o "$KOK/bin/opencode" "$IKILI_RELEASE_URL" && chmod +x "$KOK/bin/opencode"; then
      echo "   indirildi: $KOK/bin/opencode"
      IKILI_KAYNAGI="Release asset'inden indirildi"
      IKILI_PAKETTEN=1
    else
      echo "!! indirme başarısız — $IKILI_RELEASE_URL adresini/erişimi kontrol et." >&2
      rm -f "$KOK/bin/opencode"
    fi
  else
    echo "!! curl yok — ikili indirme için curl gerekli." >&2
  fi
fi

# --- derleme kararı (otomatik) ---
DERLE_NEDEN=""
if [ "$DERLEME_YOK" != 1 ] && kaynak_agaci_var; then
  if [ "$DERLE" = 1 ]; then
    DERLE_NEDEN="elle istendi (ALP_DERLE=1)"
  elif [ ! -f "$KOK/bin/opencode" ]; then
    DERLE_NEDEN="bin/opencode yok"
  elif [ "$IKILI_PAKETTEN" = 0 ] && kaynak_daha_yeni; then
    DERLE_NEDEN="kaynak ağacı ikiliden yeni"
  fi
fi
if [ -n "$DERLE_NEDEN" ]; then
  if ! derle_kaynaktan; then
    if [ -f "$KOK/bin/opencode" ]; then
      echo "!! derleme başarısız — mevcut bin/opencode ile devam ediliyor (eski sürüm olabilir)." >&2
      IKILI_KAYNAGI="derleme başarısız, mevcut bin/opencode kullanıldı"
    fi
  fi
fi

if [ ! -f "$KOK/bin/opencode" ]; then
  echo "!! $KOK/bin/opencode yok ve uretilemedi." >&2
  echo "   $KOK/bin/*.tar.xz git'e commitli DEĞİL (2026-09-16'dan itibaren; .gitignore'da bin/)." >&2
  if kaynak_agaci_var; then
    echo "   Cozum 0: kaynaktan derleme denendi ve basarisiz oldu — yukaridaki derleme ciktisina bak (bun gerekir)." >&2
  fi
  echo "   Cozum 1: ikiliyi ayrı paketten al (opencode-paket.tar.xz veya kurumun dağıtım yerinden)," >&2
  echo "      $KOK/bin/opencode.tar.xz olarak koy, sonra tekrar calistir  ->  ./alp-kur.sh" >&2
  echo "      ya da kurumda kurulu opencode ikilisini dogrudan $KOK/bin/opencode olarak koy." >&2
  exit 1
fi
[ -n "$IKILI_KAYNAGI" ] || IKILI_KAYNAGI="hazır bin/opencode güncel (derleme gerekmedi)"

yesil()   { printf '\033[32m%s\033[0m\n' "$*"; }
kirmizi() { printf '\033[31m%s\033[0m\n' "$*"; }
sari()    { printf '\033[33m%s\033[0m\n' "$*"; }

case "$KURUM_URL" in
  *KURUM_ENDPOINT*) echo "!! Önce $KOK/env içindeki KURUM_URL'i doldur."; exit 1;;
esac

echo "== 1/4  ikili =="
mkdir -p "$HOME/.opencode/bin"
install -m 0755 "$KOK/bin/opencode" "$HOME/.opencode/bin/opencode"
yesil "  kuruldu: $HOME/.opencode/bin/opencode"

echo "== 2/4  ayar + kurallar + beceriler =="
mkdir -p "$HOME/.config/opencode"
[ -f "$KOK/engine/AGENTS.md" ] && cp -f "$KOK/engine/AGENTS.md" "$HOME/.config/opencode/AGENTS.md"
rm -rf "$HOME/.config/opencode/skills"; mkdir -p "$HOME/.config/opencode/skills"
if [ "$TUM_BECERILER" = 1 ]; then
  cp -r "$KOK/knowledge/skills/approved/." "$HOME/.config/opencode/skills/"
  # 2026-09-16 beceri sadeleştirmesi (Alp kararı): kalan beceriler approved/'dan
  # parked/'a taşındı (bkz. knowledge/skills/parked/README.md) — --tum-beceriler
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
  for ad in "${CORE_SKILLS[@]}"; do
    if [ -d "$KOK/knowledge/skills/approved/$ad" ]; then
      cp -r "$KOK/knowledge/skills/approved/$ad" "$HOME/.config/opencode/skills/$ad"
    else
      sari "  ! çekirdek beceri bulunamadı: $ad"
    fi
  done
fi
toplam_mevcut=$(( $(find "$KOK/knowledge/skills/approved" -mindepth 1 -maxdepth 1 -type d | wc -l) + $(find "$KOK/knowledge/skills/parked" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l) ))
yesil "  beceri: $(ls "$HOME/.config/opencode/skills" | wc -l) adet kuruldu (repoda mevcut: $toplam_mevcut)"

# ---------------------------------------------------------------------------
#  Bağlam penceresi tespiti — uydurma değer yok, kurum uçtan ölç (best-effort)
# ---------------------------------------------------------------------------
TESPIT_EDILEN_PENCERE=""
TESPIT_KAYNAK=""
case "$KURUM_URL" in
  ""|*KURUM_ENDPOINT*) ;;
  *)
    MODELS_JSON="$(curl -sS --max-time 10 -H "Authorization: Bearer $KURUM_KEY" "${KURUM_URL%/}/models" 2>/dev/null || true)"
    if [ -n "$MODELS_JSON" ]; then
      TESPIT_EDILEN_PENCERE="$(python3 - "$MODELS_JSON" <<'PY' 2>/dev/null || true
import json, sys
raw = sys.argv[1]
KEYS = ("max_model_len", "context_length", "max_context_length", "context_window")
try:
    d = json.loads(raw)
except Exception:
    sys.exit(0)
candidates = []
if isinstance(d, dict):
    candidates.append(d)
    if isinstance(d.get("data"), list):
        candidates.extend(x for x in d["data"] if isinstance(x, dict))
for c in candidates:
    for k in KEYS:
        v = c.get(k)
        if isinstance(v, (int, float)) and v > 0:
            print(int(v))
            sys.exit(0)
PY
)"
      [ -n "$TESPIT_EDILEN_PENCERE" ] && TESPIT_KAYNAK="${KURUM_URL%/}/models"
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

python3 - "$KOK/engine/opencode.json" "$HOME/.config/opencode/opencode.json" "$KURUM_URL" "$KURUM_KEY" "$MODEL_ID" "$TESPIT_EDILEN_PENCERE" <<'PY'
import json, os, sys
src, dst, url, key, mid, ctx = sys.argv[1:7]
d = json.load(open(src, encoding="utf-8"))
p = d["provider"]["kurum"]
p["options"]["baseURL"] = url
p["options"]["apiKey"] = key
m = list(p["models"])[0]
p["models"][m]["id"] = mid

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

mkdir -p "$HOME/.config/opencode/plugins"
if compgen -G "$KOK/engine/plugins/*.ts" > /dev/null || compgen -G "$KOK/engine/plugins/*.js" > /dev/null; then
  cp -f "$KOK"/engine/plugins/*.ts "$HOME/.config/opencode/plugins/" 2>/dev/null || true
  cp -f "$KOK"/engine/plugins/*.js "$HOME/.config/opencode/plugins/" 2>/dev/null || true
  yesil "  plugin: $(ls "$HOME/.config/opencode/plugins" | wc -l) adet → ~/.config/opencode/plugins (açılışta okunur, tekrar açman gerekebilir)"
else
  sari "  engine/plugins/ altında .ts/.js yok — plugin kurulumu atlandı"
fi

# ---------------------------------------------------------------------------
#  3) ripgrep — opencode'un grep/glob araçları bunu ~/.cache/opencode/bin/rg'de
#     bekliyor; yoksa ilk kullanımda ağdan indirmeye çalışıyor (kurum ağı
#     kapalıysa "ripgrep execution failed" ile kırılıyor, bkz. EK-4). Bu pakette
#     opencode'un kendi indirdiği statik ikili bin/ripgrep.tar.xz olarak taşınıyor.
# ---------------------------------------------------------------------------
echo "== 3/4  ripgrep =="
RG_CACHE_DIZIN="${XDG_CACHE_HOME:-$HOME/.cache}/opencode/bin"
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
  sari "    (bin/*.tar.xz git'e commitli değil, 2026-09-16'dan itibaren; .gitignore'da bin/)"
  sari "    Elle kur: statik bir 'rg' ikilisini $RG_CACHE_DIZIN/rg olarak koy (chmod +x)."
fi

# ---------------------------------------------------------------------------
#  4) 'opencode' + 'oc' kısayolları
#     Çakışma otomatik çözülür: kısayol başka bir hedefi gösteriyorsa soru sorulmadan
#     yedeklenir (.bak-<tarih>) ve doğru ikiliye çevrilir. Kısayolun tek sahibi bu betik.
# ---------------------------------------------------------------------------
echo "== 4/4  'opencode' + 'oc' kısayolları =="
HEDEF_DIZIN="${KISAYOL_DIZIN:-/usr/local/bin}"
if [ ! -d "$HEDEF_DIZIN" ] || { [ ! -w "$HEDEF_DIZIN" ] && [ "$(id -u)" != 0 ]; }; then
  HEDEF_DIZIN="$HOME/.local/bin"; mkdir -p "$HEDEF_DIZIN"
  sari "  ${KISAYOL_DIZIN:-/usr/local/bin} yazılamıyor → $HEDEF_DIZIN kullanılıyor"
fi
BENIM="$HOME/.opencode/bin/opencode"

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
kisayol_kur opencode
kisayol_kur oc

case ":$PATH:" in
  *":$HEDEF_DIZIN:"*) ;;
  *) sari "  NOT: $HEDEF_DIZIN PATH'te değil (export PATH=\"$HEDEF_DIZIN:\$PATH\")" ;;
esac

# PATH'te ÖNCE gelen başka bir 'opencode' varsa kısayolu düzeltmek yetmez — söyle.
PATH_OPENCODE="$(command -v opencode 2>/dev/null || true)"
if [ -n "$PATH_OPENCODE" ] && [ "$(readlink -f "$PATH_OPENCODE" 2>/dev/null || echo "$PATH_OPENCODE")" != "$(readlink -f "$BENIM" 2>/dev/null || echo "$BENIM")" ]; then
  sari "  NOT: PATH'te önce '$PATH_OPENCODE' geliyor (kurulan: $HEDEF_DIZIN/opencode)."
  sari "       Doğru olanı çalıştırmak için: $HEDEF_DIZIN/opencode  (ya da PATH sırasını düzelt)"
fi

echo
echo "== doğrulama =="
DOGRULAMA_KODU=0
"$KOK/alp-kontrol.sh" --kurulum || DOGRULAMA_KODU=$?

echo
echo "== ÖZET =="
if [ "$DERLENDI" = 1 ]; then
  yesil "  derlendi : evet — $IKILI_KAYNAGI"
else
  echo  "  derlendi : hayır — $IKILI_KAYNAGI"
fi
yesil "  kuruldu  : $HOME/.opencode/bin/opencode · ayar $HOME/.config/opencode/ · kısayol $HEDEF_DIZIN/opencode (oc)"
if [ "$DOGRULAMA_KODU" -ne 0 ]; then
  kirmizi "  HAZIR DEĞİL — yukarıdaki ✗ satırlarını düzelt, sonra yine ./alp-kur.sh"
else
  yesil "  HAZIR — çalıştır:  cd <veri/proje dizini> && opencode     (kısa ad: oc)"
  echo  "  İlk açılışta /models → kurum / Qwen3.6-35B-A3B-FP8 seç."
fi
echo "  Bir şey ters giderse tek kontrol komutu:  ./alp-kontrol.sh"
sari "  NOT: opencode'u VERİNİN OLDUĞU dizinde aç (ör: cd ~/ansible && opencode) — dışarı çıkmak izin kapısı açar."
exit "$DOGRULAMA_KODU"
