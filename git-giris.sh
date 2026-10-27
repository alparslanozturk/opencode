#!/usr/bin/env bash
# git-giris.sh — kurum git sunucusuna (Azure DevOps Server, on-prem) giriş: herkes KENDİ terminalinde, kendi PAT'iyle bir kez çalıştırır.
#   ./git-giris.sh https://<sunucu>/tfs/<koleksiyon>/<proje>/_git/<depo>     ilk sefer (sunucu adresi depodan alınır)
#   ./git-giris.sh                                                          sonraki seferler (daha önce kaydedilen sunucu)
#   ./git-giris.sh --kalici <adres>                                         PAT dosyada (0600) — bir kez; sonra ajan her şeyi kendisi yapar
# Ne yapar: (1) bu sunucu için git'in bellek önbelleğini açar, (2) PAT'in gönderilmesi için Basic'i zorlar — sunucu yalnız
# Negotiate/NTLM önerince git NTLM seçiyor ve PAT'i hiç göndermiyordu (saha G109, yerelde yeniden üretildi), (3) PAT'i sorar
# (ekrana basılmaz), YALNIZ BELLEĞE koyar (diske yazılmaz; süre dolunca ya da makine yeniden başlayınca gider), (4) bağlantıyı dener.
# Ajan bunu çalıştıramaz (PAT sorar); süre dolunca ajan kullanıcıya "./git-giris.sh çalıştırın" der.
set -uo pipefail

SURE="${GIT_GIRIS_SURE:-36000}"   # saniye; varsayılan 10 saat (iş günü)
KALICI=0
if [ "${1:-}" = "--kalici" ]; then KALICI=1; shift; fi   # Alp (2026-10-27): bir kez gir, ajan gerisini yapsın — PAT ~/.git-credentials (0600)
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

if ! [ -t 0 ]; then
  echo "Bu betik kullanıcının kendi terminalinde çalışır (PAT sorar) — ajan/otomasyon çalıştıramaz." >&2
  exit 2
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
read -rp "Kullanıcı adı (PAT ile boş bırakılabilir, Enter): " kul
read -rsp "PAT (domain parolası DEĞİL — Azure DevOps > Personal access tokens): " pat; echo
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
