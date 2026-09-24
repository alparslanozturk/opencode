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

# En kotu durum olculdu (2026-09-24, upstream 1.18.32): packages/opencode'un tsgo'su tepe
# ~4700 MB RSS (tek basina calisirken bile). Eskiden 700 varsayiliyordu; 8 GB'lik bu VM'de iki buyuk paket ayni anda
# acilinca bellek %10'un altina dustu ve earlyoom tsgo'ya SIGTERM gonderdi (push kancasi
# her seferinde BASKA bir pakette "failed" dedi — kod hatasi degil). Paketlerin cogu kucuk
# ama siralama garanti degil, bu yuzden en buyuge gore hesaplanir.
mem_per_proc_mb=4800

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
