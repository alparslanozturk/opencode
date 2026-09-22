#!/usr/bin/env bash
# TASINDI: uc teshisi artik ./03-kontrol.sh  (kurulum kontrolu: ./03-kontrol.sh --kurulum)
# Bu dosya yalnizca eski kopyalar yanlislikla calistirilmasin diye duruyor; silinebilir.
echo "!! oc-teshis.sh TASINDI -> ./03-kontrol.sh  (calistiriliyor...)" >&2
exec "$(cd "$(dirname "$0")" && pwd)/03-kontrol.sh" "$@"
