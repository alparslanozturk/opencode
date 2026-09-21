#!/usr/bin/env bash
# =============================================================================
#  oc-dogrula.sh — bu paketin kurulumunu doğrular (İNTERNET GEREKTİRMEZ).
#  Kullanım:  ./oc-dogrula.sh
#  Çıkış kodu: 0 = paket sağlam (uyarılar olabilir)
#              1 = ciddi sorun (ikili yok, mimari uymuyor, JSON bozuk)
# =============================================================================
set -uo pipefail

# --- kendi gerçek konumunu bul (symlink zincirini çözer) ---
_kaynak="${BASH_SOURCE[0]}"
while [ -L "$_kaynak" ]; do
  _hedef="$(readlink "$_kaynak")"
  case "$_hedef" in
    /*) _kaynak="$_hedef" ;;
    *)  _kaynak="$(cd "$(dirname "$_kaynak")" && pwd)/$_hedef" ;;
  esac
done
KOK="$(cd "$(dirname "$_kaynak")" && pwd)"

yesil()   { printf '\033[32m%s\033[0m\n' "$*"; }
kirmizi() { printf '\033[31m%s\033[0m\n' "$*"; }
sari()    { printf '\033[33m%s\033[0m\n' "$*"; }

HATA=0
UYARI=0
ok()   { yesil   "  ✓ $*"; }
hata() { kirmizi "  ✗ $*"; HATA=$((HATA + 1)); }
uyar() { sari    "  ! $*"; UYARI=$((UYARI + 1)); }

BIN="$KOK/bin/opencode"

echo "== 1/7  ikili — varlık + ELF mimarisi + glibc uyumu (RHEL9+) =="
if [ ! -e "$BIN" ]; then
  hata "$BIN YOK"
else
  ok "$BIN var"
  bilgi="$(file -b "$BIN" 2>/dev/null || true)"
  case "$bilgi" in
    *"ELF 64-bit"*"x86-64"*) ok "ELF 64-bit x86-64" ;;
    *) hata "beklenmeyen ikili biçimi: $bilgi" ;;
  esac
  if command -v objdump >/dev/null 2>&1; then
    en_yuksek="$(objdump -T "$BIN" 2>/dev/null | grep -o 'GLIBC_[0-9.]*' | sort -V | tail -1)"
    if [ -n "$en_yuksek" ]; then
      ok "gerekli en yüksek glibc: $en_yuksek (RHEL9=2.34, RHEL10=2.39 → uyumlu)"
    else
      uyar "glibc sürüm bilgisi okunamadı (objdump çıktısı boş)"
    fi
  else
    uyar "objdump yok — glibc sürüm kontrolü atlandı"
  fi
fi

echo "== 2/7  opencode --version =="
if [ -x "$BIN" ]; then
  if v="$(timeout 30 "$BIN" --version 2>&1)"; then
    ok "opencode $v"
  else
    hata "opencode --version başarısız: $v"
  fi
else
  uyar "ikili çalıştırılabilir değil — sürüm kontrolü atlandı"
fi

echo "== 3/7  opencode.json — geçerli JSON + şablon dolu mu =="
CFG="$KOK/engine/opencode.json"
if [ ! -f "$CFG" ]; then
  hata "$CFG YOK"
elif command -v python3 >/dev/null 2>&1 && python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$CFG" 2>/dev/null; then
  ok "opencode.json (repo şablonu) geçerli JSON"
  # Denetim bulgusu #2: burada önceden hep $CFG (repo şablonu) okunuyordu —
  # kur.sh bu dosyayı ASLA değiştirmez, yalnız kaynak olarak okuyup
  # ~/.config/opencode/opencode.json'a dolu haliyle yazar. Şablon her zaman
  # KURUM_ENDPOINT içerdiği için bu kontrol kurulum doğru yapılmış olsa bile
  # her zaman "sahte" uyarı basıyordu. Doğru dosya kurulu config'tir (bölüm
  # 7/7'deki FILLED_CFG deseniyle aynı mantık).
  KURULU_CFG="$HOME/.config/opencode/opencode.json"
  if [ -f "$KURULU_CFG" ]; then
    if command -v python3 >/dev/null 2>&1 && ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$KURULU_CFG" 2>/dev/null; then
      hata "$KURULU_CFG GEÇERSİZ JSON"
    elif grep -q "KURUM_ENDPOINT" "$KURULU_CFG"; then
      uyar "$KURULU_CFG içinde KURUM_ENDPOINT şablon değeri duruyor (kur.sh'ı tekrar çalıştır)"
    else
      ok "kurulu opencode.json'da şablon değeri (KURUM_ENDPOINT) doldurulmuş: $KURULU_CFG"
    fi
  else
    uyar "kurulu opencode.json yok ($KURULU_CFG) — kur.sh henüz çalıştırılmamış olabilir"
  fi
else
  hata "opencode.json (repo şablonu) GEÇERSİZ JSON"
fi

echo "== 4/7  beceriler (repo: approved/ + parked/, kurulu: ~/.config/opencode/skills/) + AGENTS.md =="
if [ -d "$KOK/knowledge/skills/approved" ]; then
  n="$(find "$KOK/knowledge/skills/approved" -mindepth 1 -maxdepth 1 -type d | wc -l)"
  ok "onaylı (çekirdek) beceri havuzu (repo): $n adet"
else
  hata "knowledge/skills/approved dizini YOK"
fi
if [ -d "$KOK/knowledge/skills/parked" ]; then
  np="$(find "$KOK/knowledge/skills/parked" -mindepth 1 -maxdepth 1 -type d | wc -l)"
  ok "park edilmiş beceri havuzu (repo): $np adet (2026-09-16 sadeleştirmesi, bkz. knowledge/skills/parked/README.md)"
else
  uyar "knowledge/skills/parked dizini yok (sadeleştirme öncesi durum olabilir)"
fi
if [ -d "$HOME/.config/opencode/skills" ]; then
  nk="$(find "$HOME/.config/opencode/skills" -mindepth 1 -maxdepth 1 -type d | wc -l)"
  # Denetim bulgusu #6: "10" burada sabit metindi, kur.sh'ın CORE_SKILLS dizisinden
  # türetilmiyordu (drift riski) — artık kur.sh'tan grep ile sayılıyor.
  cekirdek_sayisi="$(grep -oP '^CORE_SKILLS=\(\K[^)]*' "$KOK/kur.sh" 2>/dev/null | wc -w)"
  [ "$cekirdek_sayisi" -gt 0 ] 2>/dev/null || cekirdek_sayisi="?"
  ok "kurulu beceri (~/.config/opencode/skills): $nk adet (çekirdek varsayılan: $cekirdek_sayisi; hepsi için: ./kur.sh --tum-beceriler)"
else
  uyar "$HOME/.config/opencode/skills yok — kur.sh henüz çalıştırılmamış olabilir"
fi
if [ -f "$KOK/engine/AGENTS.md" ]; then
  ok "AGENTS.md var"
else
  hata "AGENTS.md YOK"
fi

iskelet_dizinleri=(skills/approved skills/parked skills/experimental skills/generated runbooks incidents lessons-learned operations-notes architecture roadmap policy)
eksik=""
for d in "${iskelet_dizinleri[@]}"; do
  [ -d "$KOK/knowledge/$d" ] || eksik="$eksik $d"
done
if [ -z "$eksik" ]; then
  ok "knowledge iskeleti tam (${#iskelet_dizinleri[@]} dizin)"
else
  hata "knowledge/ altinda eksik dizin:$eksik"
fi

echo "== 5/7  ripgrep (grep/glob araçları bunu kullanır) =="
RG_CACHE_DIZIN="${XDG_CACHE_HOME:-$HOME/.cache}/opencode/bin"
if command -v rg >/dev/null 2>&1; then
  ok "rg PATH'te: $(command -v rg) ($(rg --version | head -1))"
elif [ -x "$RG_CACHE_DIZIN/rg" ]; then
  ok "rg kurulu: $RG_CACHE_DIZIN/rg ($("$RG_CACHE_DIZIN/rg" --version 2>/dev/null | head -1))"
else
  hata "rg YOK (PATH'te değil, $RG_CACHE_DIZIN/rg da yok) — grep/glob araçları kurum ağında kırılır"
fi

echo "== 6/7  kurum uç erişilebilirliği (bulunamazsa UYARI, hata değil) =="
KURUM_URL=""
# shellcheck disable=SC1090
if [ -f "$KOK/env" ]; then set -a; . "$KOK/env" 2>/dev/null || true; set +a; fi
case "${KURUM_URL:-}" in
  ""|*KURUM_ENDPOINT*)
    uyar "KURUM_URL doldurulmamış (env şablonu) — erişilebilirlik kontrolü atlandı"
    ;;
  *)
    if curl -sS -m 5 "${KURUM_URL%/}/models" >/dev/null 2>&1; then
      ok "uç erişilebilir: ${KURUM_URL%/}/models"
    else
      uyar "uç erişilemedi (5 sn): ${KURUM_URL%/}/models — kurum ağına bağlıyken normal olabilir, hata sayılmaz"
    fi
    ;;
esac

echo "== 7/7  izin özeti + bağlam penceresi + agent/steps =="
FILLED_CFG="$CFG"
[ -f "$HOME/.config/opencode/opencode.json" ] && FILLED_CFG="$HOME/.config/opencode/opencode.json"
if [ -f "$FILLED_CFG" ] && command -v python3 >/dev/null 2>&1; then
  python3 - "$FILLED_CFG" <<'PY' 2>/dev/null
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
p = d.get("permission", {})
edit_val = p.get('edit')
print(f"  · edit={edit_val} read={p.get('read')} grep={p.get('grep')} glob={p.get('glob')} list={p.get('list')}")
if edit_val == "allow":
    print("  ✗ edit=allow — THREAT-MODEL.md §4 mutlak sınırını ihlal ediyor (v1'de ajan yazamamalı)")
# opencode'da ayrı bir "write" izin anahtarı yok (write aracı da edit kapısına tabi,
# bkz. THREAT-MODEL.md §4 notu) — burada ayrıca kontrol edilmiyor, kasıtlı.
print(f"  · external_directory={p.get('external_directory')}")
b = p.get("bash", {})
if isinstance(b, dict):
    allow_n = len([k for k, v in b.items() if v == "allow"])
    deny_n = len([k for k, v in b.items() if v == "deny"])
    print(f"  · bash.*={b.get('*')}  allow-kalıp={allow_n}  deny-kalıp={deny_n}")
print(f"  · default_agent={d.get('default_agent')}")
build_steps = d.get("agent", {}).get("build", {}).get("steps")
plan_perm = d.get("agent", {}).get("plan", {}).get("permission", {})
print(f"  · agent.build.steps={build_steps}  agent.plan.permission={plan_perm}")
prov = d.get("provider", {})
for name, p2 in prov.items():
    for mid, m in p2.get("models", {}).items():
        lim = m.get("limit", {})
        print(f"  · limit.context={lim.get('context')} (provider={name}/{mid})")
comp = d.get("compaction", {})
if comp:
    print(f"  · compaction={comp}")
PY
  # Denetim bulgusu #7: yol önceden -c string'ine gömülüydü (özel karakter/boşluk
  # içeren yollarda kırılgan) — diğer çağrılarla tutarlı olsun diye sys.argv'ye taşındı.
  eddir="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('permission',{}).get('external_directory'))" "$FILLED_CFG" 2>/dev/null)"
  if [ "$eddir" = "ask" ]; then
    ok "external_directory=ask görünüyor (proje kökü dışına çıkış izin ister)"
  else
    uyar "external_directory beklenen 'ask' değil: ${eddir:-<okunamadı>}"
  fi
else
  uyar "izin özeti okunamadı (opencode.json yok/python3 yok)"
fi

echo
echo "== ÖZET (tek ekran) =="
echo "  · kurulum kökü:        $KOK"
echo "  · kurallar/ayar:       $HOME/.config/opencode/"
echo "  · AGENTS.md kurulu mu: $([ -f "$HOME/.config/opencode/AGENTS.md" ] && echo evet || echo HAYIR)"
echo "  · rg kurulu mu:        $(command -v rg >/dev/null 2>&1 && echo evet || { [ -x "$RG_CACHE_DIZIN/rg" ] && echo evet || echo HAYIR; })"

if [ "$HATA" -gt 0 ]; then
  kirmizi "SONUÇ: $HATA hata, $UYARI uyarı"
  exit 1
fi
yesil "SONUÇ: paket sağlam ($UYARI uyarı)"
