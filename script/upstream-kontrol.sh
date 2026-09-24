#!/usr/bin/env bash
# Upstream takip betigi — opencode'un yeni surumu var mi, bizim yamalarimizla cakisiyor mu?
# Karar: knowledge/architecture/decisions/0003-upstream-takibi.md · Runbook: knowledge/runbooks/upstream-guncelleme.md
#
#   script/upstream-kontrol.sh            rapor (hicbir seyi degistirmez; yalniz refs/upstream/* indirir)
#   script/upstream-kontrol.sh uygula     yeni surumu upstream-<surum> dalina uygular (commit ATMAZ)
#
# Takip ayni ana surum hattinda (1.x); yeni ana surum yalniz BILGI satiri olarak raporlanir.
# Cikis kodu: 0 = guncel · 10 = yeni surum var, temiz uygulanir · 20 = yeni surum var, cakisma var
#             1 = hata (ag, repo durumu)
# Not: bu sunucuda api.github.com/codeload /etc/hosts ile kapali; betik yalniz `git` protokolunu kullanir.
set -euo pipefail

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/anomalyco/opencode.git}"
KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$KOK"

hata() { echo "HATA: $*" >&2; exit 1; }

# Vendor surumu = packages/opencode/package.json (urun surumu 1.0.x ayridir, kur.sh SURUM)
simdiki="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' packages/opencode/package.json | head -1)"
[ -n "$simdiki" ] || hata "packages/opencode/package.json surumu okunamadi"

etiketler="$(timeout 60 git ls-remote --tags --refs "$UPSTREAM_URL" 'refs/tags/v*' 2>/dev/null \
  | sed -n 's|.*refs/tags/v\([0-9]*\.[0-9]*\.[0-9]*\)$|\1|p' | sort -V)" || true
[ -n "$etiketler" ] || hata "upstream etiketleri okunamadi ($UPSTREAM_URL) — ag/proxy?"

# Takip ayni ana surum hattinda yapilir (1.x -> 1.x). Yeni ana surum (2.0 gibi) paket yapisini
# degistirir; otomatik uygulanmaz, yalniz haber verilir (ADR-0003).
ana="${simdiki%%.*}"
son="$(echo "$etiketler" | awk -F. -v a="$ana" '$1==a' | tail -1)"
yeni_ana="$(echo "$etiketler" | awk -F. -v a="$ana" '$1>a' | tail -1)"

echo "upstream kontrol · bizde: $simdiki · ayni hatta son: $son"
[ -z "$yeni_ana" ] || echo "BILGI: yeni ana surum var: $yeni_ana — otomatik uygulanmaz, ayri degerlendirme (ADR-0003)"
if [ "$(printf '%s\n%s\n' "$simdiki" "$son" | sort -V | tail -1)" = "$simdiki" ]; then
  echo "durum: GUNCEL"
  exit 0
fi

ara="$(echo "$etiketler" | awk -v a="$simdiki" -v b="$son" '$0==a{f=1;next} f{print} $0==b{exit}' | tr '\n' ' ')"
echo "geride: ${ara:-?}"

# Iki ucu da ayri ref alanina indir (sig, yalniz o iki surum; ana dal/etiketler kirlenmez)
timeout 300 git fetch -q --no-tags --depth=1 "$UPSTREAM_URL" \
  "refs/tags/v$simdiki:refs/upstream/v$simdiki" "refs/tags/v$son:refs/upstream/v$son" \
  || hata "upstream v$simdiki / v$son indirilemedi"
U0="refs/upstream/v$simdiki"
U1="refs/upstream/v$son"

echo "upstream farki: $(git diff --no-renames --shortstat "$U0" "$U1" | sed 's/^ *//')"
echo "motor tarafi (packages/opencode|core|tui|sdk):"
git diff --no-renames --stat=100 "$U0" "$U1" -- packages/opencode/src packages/core/src packages/tui/src packages/sdk \
  | sed '$d' | awk 'NR<=40{print "  " $0}'

# Bizim yamalarimiz = upstream'in su anki surumu ile HEAD arasindaki packages/ farki
ortak="$(comm -12 <(git diff --name-only "$U0" HEAD -- packages | sort) \
  <(git diff --name-only "$U0" "$U1" -- packages | sort))"
if [ -n "$ortak" ]; then
  echo "DIKKAT — bizim yamaladigimiz ve upstream'in de degistirdigi dosyalar:"
  echo "$ortak" | sed 's/^/  /'
else
  echo "yamali dosyalarimiza upstream dokunmamis"
fi

# Kuru birlestirme: yamalarimiz yeni surumun uzerine oturuyor mu? (calisma agacina dokunmaz)
if git merge-tree --write-tree --merge-base="$U0" HEAD "$U1" >/dev/null 2>&1; then
  echo "kuru birlestirme: TEMIZ"
  kod=10
else
  echo "kuru birlestirme: CAKISMA —"
  git merge-tree --write-tree --name-only --merge-base="$U0" HEAD "$U1" 2>/dev/null \
    | sed -n 's/^CONFLICT.*in \(.*\)$/  \1/p' || true
  kod=20
fi

if [ "${1:-}" != "uygula" ]; then
  echo "sonraki adim: script/upstream-kontrol.sh uygula  (runbook: knowledge/runbooks/upstream-guncelleme.md)"
  exit "$kod"
fi

[ -z "$(git status --porcelain)" ] || hata "calisma agaci temiz degil — once commit/stash"
dal="upstream-$son"
git switch -c "$dal" >/dev/null || hata "$dal dali acilamadi (zaten var mi?)"
yama="$(mktemp)"
trap 'rm -f "$yama"' EXIT
git diff --binary "$U0" "$U1" >"$yama"
if git apply --3way --index "$yama"; then
  echo "uygulandi: $dal (commit atilmadi) — runbook'taki test adimlarina gec"
else
  echo "uygulandi, cakisma var: $dal — 'git status' ile UU dosyalari coz, sonra runbook'a gec"
  exit 20
fi
