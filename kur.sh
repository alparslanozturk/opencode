#!/usr/bin/env bash
# TASINDI: bu betigin adi artik ./alp-kur.sh  (saha yuzeyi: alp-kur.sh + alp-kontrol.sh)
# Bu dosya yalnizca eski kopyalar yanlislikla calistirilmasin diye duruyor; silinebilir.
echo "!! kur.sh TASINDI -> ./alp-kur.sh  (calistiriliyor...)" >&2
exec "$(cd "$(dirname "$0")" && pwd)/alp-kur.sh" "$@"
