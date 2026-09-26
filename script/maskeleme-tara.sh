#!/usr/bin/env bash
# Repo maskeleme taramasi (THREAT-MODEL.md §6, T12/C18) — tek komut; CI (alp-ci) ve insanlar ayni seyi kosar.
# Cikti bos + cikis 0 = temiz; bulgu varsa satirlari basar, cikis 1.
# Desen/kapsam gerekcesi THREAT-MODEL.md §6'da. Desene gercek host/yol YAZILMAZ.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
KAPSAM=(':(glob)*.md' ':(glob)*.sh' 'env.example' 'engine' 'knowledge' 'docs' 'script'
        ':!knowledge/policy/THREAT-MODEL.md' ':!script/maskeleme-tara.sh')
# Bu betik ve THREAT-MODEL.md desenin KENDISINI tasir → taransalar hep kendilerini bulurlar (C18).
# Genel desen repoda; kuruma OZGU kelimeler (uygulama/dizin/sunucu adlari) repoya YAZILMAZ — varsa git-disi
# `.maskeleme-desen` dosyasindan (satir basina bir ERE) eklenir. Desenin kendisi de sizinti olur (2026-09-26).
DESEN='/data/|models--|[A-Za-z0-9-]+\.(com|net|org)\.tr'
if [ -f .maskeleme-desen ]; then
  while IFS= read -r ek; do
    [ -n "$ek" ] && [ "${ek#\#}" = "$ek" ] && DESEN="$DESEN|$ek"
  done < .maskeleme-desen
fi
bulgu="$(git ls-files -z -- "${KAPSAM[@]}" | xargs -0 grep -nIE "$DESEN" | grep -viE 'sahte|<[a-z]' || true)"
if [ -n "$bulgu" ]; then
  printf '%s\n' "$bulgu"
  exit 1
fi
