#!/usr/bin/env bash
# TASINDI: kurulum dogrulamasi artik ./alp-kontrol.sh --kurulum
# Bu dosya yalnizca eski kopyalar yanlislikla calistirilmasin diye duruyor; silinebilir.
echo "!! oc-dogrula.sh TASINDI -> ./alp-kontrol.sh --kurulum  (calistiriliyor...)" >&2
exec "$(cd "$(dirname "$0")" && pwd)/alp-kontrol.sh" --kurulum "$@"
