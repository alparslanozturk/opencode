#!/usr/bin/env bash
# TASINDI: uc teshisi artik ./alp-kontrol.sh  (kurulum kontrolu: ./alp-kontrol.sh --kurulum)
# Bu dosya yalnizca eski kopyalar yanlislikla calistirilmasin diye duruyor; silinebilir.
echo "!! oc-teshis.sh TASINDI -> ./alp-kontrol.sh  (calistiriliyor...)" >&2
exec "$(cd "$(dirname "$0")" && pwd)/alp-kontrol.sh" "$@"
