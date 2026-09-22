#!/usr/bin/env bash
# TASINDI: kurulum dogrulamasi artik ./03-kontrol.sh --kurulum
# Bu dosya yalnizca eski kopyalar yanlislikla calistirilmasin diye duruyor; silinebilir.
echo "!! oc-dogrula.sh TASINDI -> ./03-kontrol.sh --kurulum  (calistiriliyor...)" >&2
exec "$(cd "$(dirname "$0")" && pwd)/03-kontrol.sh" --kurulum "$@"
