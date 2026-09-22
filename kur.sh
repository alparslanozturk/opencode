#!/usr/bin/env bash
# TASINDI: bu betigin adi artik ./02-kur.sh  (saha yuzeyi: 02-kur.sh + 03-kontrol.sh)
# Bu dosya yalnizca eski kopyalar yanlislikla calistirilmasin diye duruyor; silinebilir.
echo "!! kur.sh TASINDI -> ./02-kur.sh  (calistiriliyor...)" >&2
exec "$(cd "$(dirname "$0")" && pwd)/02-kur.sh" "$@"
