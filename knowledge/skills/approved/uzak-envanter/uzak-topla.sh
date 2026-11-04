#!/bin/bash
# uzak-topla.sh — buradan erişemediğimiz ortamda (ör. başka ortamın Satellite / ansible makinesi) KULLANICI çalıştırır. Envanterdeki
# sunuculardan yalnız okuyarak host bilgisi toplar, tek .tgz verir; .tgz spllnxmgmt01'e getirilip uzak-ozet.py ile incelenir.
# Alp (2026-11-04): "erişemezsek orada çalıştırıp oradaki bilgiyi alıp sana verebilirim."
# Hedefte hiçbir şey değişmez: -m raw ile yalnız okuma komutları (hedefte python gerekmez). Yazdığı tek yer: çalışılan dizinde
# uzak-<ortam>-<tarih>/ ve .tgz'si. Uzak makinede kit gerekmez — yalnız bash + ansible.
#
# kullanım (ansible'ı her zaman çalıştırdığın dizinde — ansible.cfg / anahtar ayarı oradan okunur):
#   bash uzak-topla.sh <envanter> <ortam-adı> [<grup>]
set -u
env="${1:-}"; ortam="${2:-}"; grup="${3:-all}"
[ -n "$env" ] && [ -n "$ortam" ] || { echo "kullanım: bash uzak-topla.sh <envanter> <ortam-adı> [<grup>]"; exit 2; }
command -v ansible >/dev/null || { echo "bu makinede ansible yok — ansible kurulu makinede çalıştır"; exit 2; }
[ -f "$env" ] || { echo "envanter yok: $env"; exit 2; }
d="uzak-$(printf '%s' "$ortam" | tr -c 'A-Za-z0-9_-' '_')-$(date +%Y%m%d-%H%M)"
[ -e "$d" ] && { echo "$d zaten var"; exit 2; }
mkdir "$d" || exit 2
cp "$env" "$d/envanter.ini"
sayi=$(ansible "$grup" -i "$env" --list-hosts 2>/dev/null | tail -n +2 | wc -l)
{
  echo "ortam=$ortam"
  echo "tarih=$(date '+%F %T %z')"
  echo "makine=$(hostname -f 2>/dev/null || hostname)"
  echo "kaynak_ip=$(hostname -I 2>/dev/null)"
  echo "ansible=$(ansible --version 2>/dev/null | head -1)"
  echo "grup=$grup"
  echo "host_sayisi=$sayi"
} > "$d/meta.txt"
BILGI=$(cat << 'K'
echo ad=$(hostname -f 2>/dev/null || hostname)
echo os=$( . /etc/os-release 2>/dev/null && echo "$ID $VERSION_ID" || head -1 /etc/redhat-release 2>/dev/null)
echo cekirdek=$(uname -r)
echo cpu=$(nproc 2>/dev/null)
echo bellek_gb=$(free -g 2>/dev/null | awk '/^Mem:/{print $2}')
echo kok_doluluk=$(df -P / 2>/dev/null | awk 'NR==2{print $5}')
echo acilis=$(uptime -s 2>/dev/null)
echo ip=$(hostname -I 2>/dev/null)
echo sanal=$(systemd-detect-virt 2>/dev/null)
echo satellite=$(awk -F= '/^hostname/{gsub(/ /,"",$2); print $2; exit}' /etc/rhsm/rhsm.conf 2>/dev/null)
true
K
)
echo "$sayi sunucu taranıyor ($grup) — erişilemeyen sunucu başına en çok ~5 sn…"
ansible "$grup" -i "$env" -m raw -a "$BILGI" -f 30 -T 5 --task-timeout 30 -t "$d/bilgi" > "$d/ansible.log" 2>&1
echo "tree=$(ls "$d/bilgi" 2>/dev/null | wc -l) dosya" >> "$d/meta.txt"
tar czf "$d.tgz" "$d" || exit 2
echo "hazır: $(pwd)/$d.tgz ($(du -h "$d.tgz" | cut -f1)) — bu dosyayı spllnxmgmt01'e getir (scp / MobaXterm)"
