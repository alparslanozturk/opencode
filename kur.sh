#!/usr/bin/env bash
# =============================================================================
#  kur.sh — SAHADA ÇALIŞTIRILAN TEK KOMUT.
#
#    ./kur.sh   -> gerekirse derler, kurar, kısayolu düzeltir ve EN SONDA
#                  sağlık kontrolü ekranını (./03-kontrol.sh) basar. Bayrak yok.
#
#  Yalnız kontrol istiyorsan:  ./03-kontrol.sh
#  İşi yapan betik 02-kur.sh'tır (01-derle.sh derleyici olarak onun içinden çağrılır).
# =============================================================================
exec "$(cd "$(dirname "$0")" && pwd)/02-kur.sh" "$@"
