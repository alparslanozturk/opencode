#!/usr/bin/env bash
# Gelistirici duman testi: derlenmis tek-dosya ikilinin 2026-09-22 a.name cokmesini
# (bkz. knowledge/incidents/2026-09-22-derlenmis-ikili-a-name-cokmesi.md) tekrar
# etmedigini dogrular. bin/ icine girmez, kur.sh'a baglanmaz, sahada kosmaz.
set -euo pipefail

IKILI="${1:-$PWD/bin/opencode}"
if [ ! -x "$IKILI" ]; then
  IKILI="$PWD/packages/opencode/dist/opencode-linux-x64/bin/opencode"
fi
if [ ! -x "$IKILI" ]; then
  echo "HATA: ikili bulunamadi (denenen: bin/opencode, packages/opencode/dist/opencode-linux-x64/bin/opencode)" >&2
  exit 2
fi
IKILI="$(readlink -f "$IKILI")"

GECICI="$(mktemp -d /tmp/oc-smoke.XXXXXX)"
temizle() { rm -rf "$GECICI"; }
trap temizle EXIT

mkdir -p "$GECICI/home/.config/opencode" "$GECICI/work"
cat > "$GECICI/home/.config/opencode/opencode.json" <<'EOF'
{ "$schema": "https://opencode.ai/config.json", "autoupdate": false, "model": "sahte/sahte-model",
  "provider": { "sahte": { "npm": "@ai-sdk/openai-compatible", "name": "Sahte",
    "options": { "baseURL": "http://127.0.0.1:9/v1", "apiKey": "***" },
    "models": { "sahte-model": { "id": "sahte", "name": "Sahte", "tool_call": true } } } } }
EOF

CIKTI="$(cd "$GECICI/work" && HOME="$GECICI/home" XDG_CONFIG_HOME="$GECICI/home/.config" \
  XDG_DATA_HOME="$GECICI/home/.local/share" OPENCODE_PRINT_LOGS=1 \
  "$IKILI" run "sadece OK yaz" 2>&1 || true)"

if printf '%s' "$CIKTI" | grep -q "evaluating 'a.name'"; then
  echo "BASARISIZ: a.name cokmesi tekrarlandi ($IKILI)"
  printf '%s\n' "$CIKTI" | tail -10
  exit 1
fi

if ! printf '%s' "$CIKTI" | grep -qE "Cannot connect to API|AI_APICallError|ECONNREFUSED"; then
  echo "BASARISIZ: a.name yok ama istek saglayiciya ulasmadi, cikti beklenmedik ($IKILI)"
  printf '%s\n' "$CIKTI" | tail -10
  exit 1
fi

echo "GECTI: a.name cokmesi yok, istek saglayiciya ulasti ($IKILI)"
printf '%s\n' "$CIKTI" | tail -5
exit 0
