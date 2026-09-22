#!/usr/bin/env bash
# =============================================================================
#  alp-kur.sh — opencode paketinin TEK KURULUM GİRİŞİ (kurum içi, offline; ağ/npm gerekmez).
#
#  Gerekirse kaynaktan DERLER (alp-derle.sh'ı çağırarak), sonra KURAR (ikili + ayar +
#  beceri + plugin + ripgrep + kısayollar) ve sonunda DOĞRULAR (alp-kontrol.sh --kurulum).
#  Sahada tek komut yeter:  ./alp-kur.sh      (kontrol/teşhis için: ./alp-kontrol.sh)
#
#  Kullanım:  cd /root/ai/opencode && ./alp-kur.sh   (dizin adı önemli değil, script kendi yolunu bulur)
#    --derle | --kaynak bin/opencode olsa bile kaynaktan yeniden derle
#    --derleme-yok      kaynaktan derlemeyi hiç deneme (yalnız hazır ikili kullan)
#    --baglanti-yok     kısayolları kurma (yalnız ikili + ayar + beceri)
#    --baglanti-zorla   mevcut başka bir 'opencode'/'oc' varsa yedekle ve üzerine yaz
#    --tum-beceriler    tüm becerileri kur (varsayılan: 10 çekirdek beceri, bkz. CORE_SKILLS)
#    --ikili-indir      bin/opencode yoksa GitHub Release asset'inden (token'sız HTTPS) indir
#    -- <bayraklar>     '--' sonrası her şey derleyiciye (alp-derle.sh) aktarılır, ör:
#                       ./alp-kur.sh --derle -- --ignore-scripts
#
#  İkili nereden gelir (bin/opencode yoksa, sırayla):
#    1) bin/opencode.tar.xz varsa açılır
#    2) --ikili-indir verildiyse Release asset'inden indirilir
#    3) kaynak ağacı varsa (bun.lock + packages/opencode) alp-derle.sh ile DERLENİR ← saha akışı
#
#  Kısayol sahibi TEK betiktir: alp-kur.sh. alp-derle.sh varsayılan olarak kısayol kurmaz
#  (isteyen `./alp-derle.sh --kisayol` der) — böylece /usr/local/bin/opencode'un hangi
#  ikiliyi gösterdiği belirsiz kalmaz.
#
#  Ortam değişkeni: KISAYOL_DIZIN (varsayılan /usr/local/bin, yazılamıyorsa ~/.local/bin)
#                   IKILI_RELEASE_URL (--ikili-indir için varsayılan asset URL'ini ezer)
# =============================================================================
set -euo pipefail
KOK="$(cd "$(dirname "$0")" && pwd)"

# --ikili-indir varsayılanı: repo Release asset'i (token'sız HTTPS, 185 MB ikili git'e girmez).
IKILI_RELEASE_URL="${IKILI_RELEASE_URL:-https://github.com/alparslanozturk/opencode/releases/download/bin-v1.18.30/opencode}"

BAGLANTI_YOK=0
BAGLANTI_ZORLA=0
TUM_BECERILER=0
IKILI_INDIR=0
DERLE=0
DERLEME_YOK=0
ALP_EK=()   # '--' sonrası: derleyiciye (alp-derle.sh) aktarılacak bayraklar
while [ $# -gt 0 ]; do
  case "$1" in
    --baglanti-yok)   BAGLANTI_YOK=1 ;;
    --baglanti-zorla) BAGLANTI_ZORLA=1 ;;
    --tum-beceriler)  TUM_BECERILER=1 ;;
    --ikili-indir)    IKILI_INDIR=1 ;;
    --derle|--kaynak) DERLE=1 ;;
    --derleme-yok)    DERLEME_YOK=1 ;;
    --) shift; ALP_EK=("$@"); break ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Bilinmeyen argüman: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$DERLE" = 1 ] && [ "$DERLEME_YOK" = 1 ]; then
  echo "!! --derle ve --derleme-yok birlikte verilemez." >&2
  exit 2
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
#  0) İkili nereden gelecek? (bkz. başlıktaki sıra)
#     Saha akışı: al.sh ile senkron -> bin/ boş -> burada alp-derle.sh ile derlenir.
# ---------------------------------------------------------------------------
DERLENDI=0
IKILI_KAYNAGI=""

kaynak_agaci_var() {
  [ -x "$KOK/alp-derle.sh" ] && [ -f "$KOK/bun.lock" ] && [ -d "$KOK/packages/opencode" ]
}

derle_kaynaktan() {
  echo "== 0/4  kaynaktan derleme (alp-derle.sh) =="
  # alp-derle.sh kısayol KURMAZ (tek sahip alp-kur.sh); --bin-kopyala ile ikiliyi bin/opencode'a bırakır.
  if "$KOK/alp-derle.sh" --bin-kopyala ${ALP_EK[@]+"${ALP_EK[@]}"}; then
    DERLENDI=1
    IKILI_KAYNAGI="kaynaktan derlendi (alp-derle.sh)"
    return 0
  fi
  echo "!! derleme başarısız (alp-derle.sh) — yukarıdaki çıktıya bak." >&2
  return 1
}

if [ "$DERLE" = 1 ]; then
  if ! kaynak_agaci_var; then
    echo "!! --derle istendi ama kaynak ağacı yok (alp-derle.sh / bun.lock / packages/opencode eksik)." >&2
    echo "   Bu dizin yalnız ikili paket olabilir; --derle olmadan çalıştır." >&2
    exit 1
  fi
  derle_kaynaktan || exit 1
fi

if [ ! -x "$KOK/bin/opencode" ] && [ -f "$KOK/bin/opencode.tar.xz" ]; then
  echo ">> bin/opencode yok — bin/opencode.tar.xz aciliyor (bir kez)..."
  tar xJf "$KOK/bin/opencode.tar.xz" -C "$KOK/bin" && chmod +x "$KOK/bin/opencode"
  [ -x "$KOK/bin/opencode" ] && IKILI_KAYNAGI="bin/opencode.tar.xz açıldı"
fi

if [ ! -f "$KOK/bin/opencode" ] && [ "$IKILI_INDIR" = "1" ]; then
  # NOT: --baglanti-yok = "kısayol (symlink) kurma" demektir, "ağ yok" demek DEĞİL —
  # eskiden burada ikisi çelişkili sayılıp indirme atlanıyordu (adın yanlış okunması).
  if command -v curl >/dev/null 2>&1; then
    echo ">> bin/opencode yok — Release asset'inden indiriliyor (token'sız HTTPS): $IKILI_RELEASE_URL"
    if curl -fSL -o "$KOK/bin/opencode" "$IKILI_RELEASE_URL" && chmod +x "$KOK/bin/opencode"; then
      echo "   indirildi: $KOK/bin/opencode"
      IKILI_KAYNAGI="Release asset'inden indirildi"
    else
      echo "!! indirme başarısız — $IKILI_RELEASE_URL adresini/erişimi kontrol et." >&2
      rm -f "$KOK/bin/opencode"
    fi
  else
    echo "!! curl yok — --ikili-indir için curl gerekli." >&2
  fi
fi

# Hazır ikili yok ama kaynak ağacı var -> sahada beklenen davranış: derle (tek komut).
if [ ! -f "$KOK/bin/opencode" ] && [ "$DERLEME_YOK" = 0 ] && kaynak_agaci_var; then
  echo ">> bin/opencode yok, kaynak ağacı var — kaynaktan derleniyor (atlamak için: --derleme-yok)"
  derle_kaynaktan || true
fi

if [ ! -f "$KOK/bin/opencode" ]; then
  echo "!! $KOK/bin/opencode yok." >&2
  echo "   $KOK/bin/*.tar.xz git'e commitli DEĞİL (2026-09-16'dan itibaren; .gitignore'da bin/)." >&2
  if kaynak_agaci_var; then
    echo "   Cozum 0: kaynaktan derleme denendi/atlandi  ->  ./alp-kur.sh --derle   (bun gerekir, bkz. alp-derle.sh)" >&2
  fi
  echo "   Cozum 1: --ikili-indir ile calistir  ->  Release asset'inden token'sız HTTPS indirir." >&2
  echo "   Cozum 2: ikiliyi ayrı paketten al (opencode-paket.tar.xz veya kurumun dağıtım yerinden)," >&2
  echo "      $KOK/bin/opencode.tar.xz olarak koy, sonra tekrar calistir  ->  tar xJf $KOK/bin/opencode.tar.xz -C $KOK/bin" >&2
  echo "      ya da kurumda kurulu opencode ikilisini dogrudan $KOK/bin/opencode olarak koy." >&2
  exit 1
fi
[ -n "$IKILI_KAYNAGI" ] || IKILI_KAYNAGI="hazır bin/opencode kullanıldı (derleme yapılmadı)"

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
  sari "  --tum-beceriler: tüm beceriler kuruldu (taban bağlam büyür)"
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
yesil "  beceri: $(ls "$HOME/.config/opencode/skills" | wc -l) adet kuruldu (toplam mevcut: $toplam_mevcut, tümü için: --tum-beceriler)"

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
# ---------------------------------------------------------------------------
echo "== 4/4  'opencode' + 'oc' kısayolları =="
if [ "$BAGLANTI_YOK" = 1 ]; then
  sari "  atlandı (--baglanti-yok)"
else
  HEDEF_DIZIN="${KISAYOL_DIZIN:-/usr/local/bin}"
  if [ ! -d "$HEDEF_DIZIN" ] || { [ ! -w "$HEDEF_DIZIN" ] && [ "$(id -u)" != 0 ]; }; then
    HEDEF_DIZIN="$HOME/.local/bin"; mkdir -p "$HEDEF_DIZIN"
    sari "  ${KISAYOL_DIZIN:-/usr/local/bin} yazılamıyor → $HEDEF_DIZIN kullanılıyor"
  fi
  BENIM="$HOME/.opencode/bin/opencode"

  kisayol_kur() { # <ad>
    local ad="$1" baglanti="$HEDEF_DIZIN/$1" mevcut
    mevcut="$(readlink -f "$baglanti" 2>/dev/null || true)"
    if [ ! -e "$baglanti" ] && [ ! -L "$baglanti" ]; then
      ln -sfn "$BENIM" "$baglanti"
      yesil "  kısayol kuruldu: $baglanti → $BENIM"
    elif [ "$mevcut" = "$BENIM" ]; then
      yesil "  kısayol zaten doğru: $baglanti"
    elif [ "$BAGLANTI_ZORLA" = 1 ]; then
      local yedek
      yedek="$baglanti.bak-$(date +%Y%m%d-%H%M%S)"
      mv "$baglanti" "$yedek"
      sari "  mevcut '$ad' yedeklendi: $yedek"
      ln -sfn "$BENIM" "$baglanti"
      yesil "  kısayol kuruldu: $baglanti → $BENIM"
    else
      sari "  $baglanti zaten var ve başka bir kurulumu gösteriyor: ${mevcut:-<çözülemedi>}"
      echo  "    Üzerine yazmak isterseniz: $0 --baglanti-zorla   (yedek alınır)"
    fi
  }
  kisayol_kur opencode
  kisayol_kur oc

  case ":$PATH:" in
    *":$HEDEF_DIZIN:"*) ;;
    *) sari "  NOT: $HEDEF_DIZIN PATH'te değil (export PATH=\"$HEDEF_DIZIN:\$PATH\")" ;;
  esac
fi

echo
echo "== doğrulama =="
DOGRULAMA_KODU=0
"$KOK/alp-kontrol.sh" --kurulum || DOGRULAMA_KODU=$?

echo
echo "== ÖZET =="
if [ "$DERLENDI" = 1 ]; then
  yesil "  derlendi:   evet — $IKILI_KAYNAGI"
else
  echo  "  derlendi:   hayır — $IKILI_KAYNAGI"
fi
yesil "  kuruldu:    $HOME/.opencode/bin/opencode  (+ ayar/beceri/plugin/rg)"
if [ "$DOGRULAMA_KODU" -ne 0 ]; then
  kirmizi "  doğrulandı: HAYIR — alp-kontrol.sh --kurulum çıkış kodu $DOGRULAMA_KODU"
  kirmizi "  Yukarıdaki ✗ satırlarına bak; düzeltmeden 'opencode' çalıştırma."
else
  yesil "  doğrulandı: evet — paket sağlam"
fi
echo "  Kurulum kökü:     $KOK"
echo "  Kurallar/ayar:    $HOME/.config/opencode/  (AGENTS.md, opencode.json, skills/, plugins/)"
if [ "$BAGLANTI_YOK" = 1 ]; then
  echo "  Kısayol:          kurulmadı (--baglanti-yok) → tam yolla çalıştır: $HOME/.opencode/bin/opencode"
else
  echo "  Kısayol sahibi:   alp-kur.sh — ${HEDEF_DIZIN:-/usr/local/bin}/opencode → $HOME/.opencode/bin/opencode"
fi
echo
echo "  ŞİMDİ ÇALIŞTIR:"
echo "    cd <veri/proje dizini> && opencode      # kısa ad: oc"
echo "  İlk açılışta /models → kurum / Qwen3.6-35B-A3B-FP8 seç."
echo "  Bir şey ters giderse TEK kontrol komutu:  ./alp-kontrol.sh   (kurulum için: --kurulum)"
echo
sari "  NOT: opencode'u VERİNİN OLDUĞU dizinde aç (ör. envanter işi için: cd ~/ansible && opencode)."
sari "       Proje kökü dışına çıkmak 'external_directory' izin kapısı çıkarır; boş bir dizinden"
sari "       açıp üst dizinleri aratmak yerine doğrudan ilgili dizinde başlat."
exit "$DOGRULAMA_KODU"
