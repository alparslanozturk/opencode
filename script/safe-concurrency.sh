#!/usr/bin/env bash
# turbo (typecheck vb.) icin guvenli paralellik degeri hesaplar.
#
# Neden: "bun turbo typecheck" varsayilan olarak workspace'teki her paket
# (bu repoda 30) icin ayri bir tsgo sureci acmaya calisir. CPU sayisina
# gore sinirlamak tek basina yetmez — az RAM'li/konteynerli sunucularda
# CPU bol ama bellek dar olabilir. Bu yuzden hem cekirdek sayisina hem
# kullanilabilir RAM'e gore hesaplanir, ikisinin en kucugu kullanilir.
# Boylece hem bu VM'de (2 vCPU, swapsiz) hem kurumdaki farkli
# konfigurasyonlu sunucularda ayni script tasinabilir sekilde calisir.
set -euo pipefail

mem_per_proc_mb=700

cpu=$(nproc 2>/dev/null || echo 2)

mem_kb=$(awk '/MemAvailable/{print $2; exit}' /proc/meminfo 2>/dev/null || echo 0)
mem_mb=$(( mem_kb / 1024 ))
mem_based=$(( mem_mb / mem_per_proc_mb ))

safe=$cpu
if [ "$mem_based" -gt 0 ] && [ "$mem_based" -lt "$safe" ]; then
  safe=$mem_based
fi
if [ "$safe" -lt 1 ]; then
  safe=1
fi

echo "$safe"
