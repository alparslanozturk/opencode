#!/usr/bin/env bash
# git-giris.sh — kurum git sunucusuna (Azure DevOps Server, on-prem) giriş: herkes KENDİ terminalinde, kendi PAT'iyle bir kez çalıştırır.
#   ./git-giris.sh https://<sunucu>/tfs/<koleksiyon>/<proje>/_git/<depo>     ilk sefer (sunucu adresi depodan alınır)
#   ./git-giris.sh                                                          sonraki seferler (daha önce kaydedilen sunucu)
#   ./git-giris.sh --kalici <adres>                                         PAT dosyada (0600) — bir kez; sonra ajan her şeyi kendisi yapar
#   ./git-giris.sh --tasi <adres>                                           PAT zaten global .gitconfig'teyse oradan güvenli yere taşı (ajan da çalıştırır)
# Ne yapar: (1) bu sunucu için git'in bellek önbelleğini açar, (2) PAT'in gönderilmesi için Basic'i zorlar — sunucu yalnız
# Negotiate/NTLM önerince git NTLM seçiyor ve PAT'i hiç göndermiyordu (saha G109, yerelde yeniden üretildi), (3) PAT'i sorar
# (ekrana basılmaz), YALNIZ BELLEĞE koyar (diske yazılmaz; süre dolunca ya da makine yeniden başlayınca gider), (4) bağlantıyı dener.
# Ajan bunu çalıştıramaz (PAT sorar); süre dolunca ajan kullanıcıya "./git-giris.sh çalıştırın" der.
set -uo pipefail

SURE="${GIT_GIRIS_SURE:-36000}"   # saniye; varsayılan 10 saat (iş günü)
KALICI=0
TASI=0
if [ "${1:-}" = "--kalici" ]; then KALICI=1; shift; fi
# --tasi (Alp, 2026-10-27: "bir çalışma neden bu kadar uzar"): PAT zaten global .gitconfig'te satır içi helper'daysa onu oradan alır,
# yalnız bu sunucuya bağlı ~/.git-credentials'a (0600) taşır, güvensiz global ayarları siler. Terminal/PAT girişi gerekmez — ajan çalıştırabilir.
if [ "${1:-}" = "--tasi" ]; then TASI=1; KALICI=1; shift; fi   # Alp (2026-10-27): bir kez gir, ajan gerisini yapsın — PAT ~/.git-credentials (0600)
url="${1:-}"

if [ -n "$url" ]; then
  if ! [[ "$url" =~ ^(https?)://([^/@]+)(/.*)?$ ]]; then
    echo "Adres https://<sunucu>/… biçiminde olmalı (içinde kullanıcı/parola OLMADAN): $url" >&2
    exit 2
  fi
  proto="${BASH_REMATCH[1]}"; host="${BASH_REMATCH[2]}"
else
  # daha önce kaydedilen sunucu: http.<proto>://<host>/.proactiveauth
  kayit="$(git config --global --get-regexp '^http\..*\.proactiveauth$' 2>/dev/null | head -1 | awk '{print $1}')"
  if [ -z "$kayit" ]; then
    echo "İlk sefer: depo adresini verin → ./git-giris.sh https://<sunucu>/…/_git/<depo>" >&2
    exit 2
  fi
  kayit="${kayit#http.}"; kayit="${kayit%.proactiveauth}"
  proto="${kayit%%://*}"; host="${kayit#*://}"; host="${host%/}"
fi
taban="$proto://$host/"

if [ "$TASI" = 1 ]; then
  eski="$(git config --global --get-all credential.helper 2>/dev/null | grep 'password=' | head -1)"
  pat="$(printf '%s' "$eski" | sed -n 's/.*password=\([^"\\;]*\).*/\1/p')"
  kul="$(printf '%s' "$eski" | sed -n 's/.*username=\([^"\\;]*\).*/\1/p')"
  if [ -z "$pat" ]; then
    echo "Taşınacak PAT yok (global credential.helper'da password= bulunamadı) — ./git-giris.sh --kalici <adres> ile girin." >&2
    exit 2
  fi
fi
if [ "$TASI" = 0 ] && ! [ -t 0 ]; then
  echo "Bu betik kullanıcının kendi terminalinde çalışır (PAT sorar) — ajan/otomasyon çalıştıramaz." >&2
  exit 2
fi
# Güvensiz global ayar (saha G109, 2026-10-27, ölçüldü): sunucuya bağlı OLMAYAN `http.proactiveAuth` + parolayı satır içi basan global
# helper → PAT her sunucuya (GitHub dahil) gönderiliyordu. Bunları temizle; yerine aşağıda yalnız bu sunucuya bağlı ayar yazılır.
if git config --global --get http.proactiveauth > /dev/null 2>&1; then
  git config --global --unset-all http.proactiveauth && echo "temizlendi: global http.proactiveAuth (bütün sunuculara Basic gönderiyordu)"
fi
if git config --global --get-all credential.helper 2>/dev/null | grep -q "password="; then
  git config --global --unset-all credential.helper && echo "temizlendi: global credential.helper (parola satır içiydi, her sunucuya veriyordu)"
fi
if [ "$KALICI" = 0 ] && git config --global --get-all credential.helper 2>/dev/null | grep -q store; then
  echo "UYARI: global credential.helper 'store' tanımlı — PAT diske düz metin yazılır. Kaldırın ya da bilerek kalıcı isteyin: --kalici" >&2
  echo "  git config --global --unset-all credential.helper" >&2
  exit 2
fi

if [ "$KALICI" = 1 ]; then
  git config --global --replace-all "credential.$taban.helper" store
  touch ~/.git-credentials && chmod 600 ~/.git-credentials
  nerede="kalıcı: ~/.git-credentials (0600 — yalnız $(id -un)); PAT süresi dolana kadar sorulmaz"
else
  git config --global --replace-all "credential.$taban.helper" "cache --timeout=$SURE"
  nerede="PAT yalnız bellekte, $((SURE / 3600)) saat"
fi
git config --global "http.$taban.proactiveAuth" basic

echo "Sunucu: $taban  ($nerede)"
if [ "$TASI" = 0 ]; then
  read -rp "Kullanıcı adı (PAT ile boş bırakılabilir, Enter): " kul
  read -rsp "PAT (domain parolası DEĞİL — Azure DevOps > Personal access tokens): " pat; echo
else
  echo "PAT eski global ayardan alındı (ekrana basılmaz)."
fi
if [ -z "$pat" ]; then echo "PAT boş — iptal." >&2; exit 2; fi
# setsid: önbellek süreci bu terminalden ayrı oturumda başlar — terminal/sekme kapanınca ölmez (ölçüldü: setsid'siz SIGHUP ile gidiyordu)
printf 'protocol=%s\nhost=%s\nusername=%s\npassword=%s\n\n' "$proto" "$host" "$kul" "$pat" | setsid -w git credential approve
unset pat

if [[ "$url" == *"/_git/"* ]]; then
  if GIT_TERMINAL_PROMPT=0 git ls-remote "$url" HEAD > /dev/null 2>&1; then
    echo "✓ Bağlantı tamam: $url"
  else
    printf 'protocol=%s\nhost=%s\n\n' "$proto" "$host" | git credential reject
    echo "✗ Giriş başarısız (PAT yanlış/süresi dolmuş ya da depoya yetki yok). Kayıttan silindi; tekrar deneyin." >&2
    exit 1
  fi
else
  echo "✓ PAT belleğe alındı. Deneme: git ls-remote <depo adresi>"
fi
