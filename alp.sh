#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

git pull --no-tags
bun install
./packages/opencode/script/build.ts --single --skip-embed-web-ui --skip-install

ln -sf "$(pwd)/packages/opencode/dist/opencode-linux-x64/bin/opencode" /usr/local/bin/opencode
