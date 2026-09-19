# Runbook: SSH forced-command allowlist kurulumu (aiops hesabı, hedef sunucu)

> **Önceliklendirme notu (2026-09-19):** Gerçek saha topolojisinde (bkz.
> `../architecture/2026-09-saha-topolojisi.md`) tek bir hedef değil, **kurum-yerel ağdaki onlarca
> sunucu** söz konusu — bu runbook'u filoya toptan uygulamak "minimum efor" ilkesiyle çelişir.
> Öneri: BT işine mevcut `permission.bash: ask/deny` + git'te review edilebilir ansible playbook'larla
> başla; bu kapıyı **önce en hassas/az sayıda hedefte** (ör. üretim kümesi giriş noktası) dene, sonra
> ölçülü yay.

- **Amaç:** Ajanın hedef sunucuya SSH ile bağlanıp **yalnızca izin verilen komutları**
  çalıştırabilmesini sağlamak — kontrol istemci (opencode) tarafında değil, **hedef sunucuda**
  (`authorized_keys` → `command="..."`), bkz. `../policy/PERMISSION-MATRIX.md` §3: "asıl güvenlik
  burada, ProxyCommand'da değil" (Danışma 2, Opus).
- **Ne zaman çalıştırılır:** Ajana bir hedef sunucuya SSH erişimi verilecekse, **her yeni hedef
  sunucu için bir kere**. `engine/opencode.json`'daki `permission.bash: ask` tek başına yetmez —
  model kuralı atlayabilir; forced-command istemci tarafını umursamaz, sunucu her komutu kendi
  allowlist'inden geçirir.
- **Süre / risk:** ~15 dk / düşük (yeni, izole bir hesap; mevcut erişimleri değiştirmez). Yanlış
  yapılandırılmış wrapper **tüm SSH erişimini** o hesap için kilitleyebilir — önce test hesabında dene.
- **Ön koşullar:**
  - Hedef sunucu adı/IP'si netleşmiş olmalı (bu repoda **maskeli** tutulur: gerçek host/IP/domain
    git'e girmez, bkz. `engine/AGENTS.md` "Güvenlik ve sınırlar").
  - Hedef sunucuda `aiops` (veya eşdeğeri) ayrı bir Unix hesabı — henüz **oluşturulmadı** (bu
    makinede `getent passwd aiops` → yok, 2026-09-19 kontrolü).
  - Ajan makinesinde (bu repo) `~/.ssh/id_ed25519` benzeri, **yalnız bu amaca özel** bir anahtar
    çifti — mevcut kişisel anahtarları (`github.com` girişi) bu iş için **kullanma**.
- **Geri dönüş (rollback):** Hedef sunucuda `authorized_keys` satırını sil/yorum satırına al;
  `aiops` hesabını `userdel -r aiops` ile kaldır (veya `usermod -L` ile kilitle, silmeden önce).

## Adımlar

1. **Hedef sunucuda ayrı hesap aç** (root işlemleri hesabından bağımsız):
   ```bash
   useradd -r -m -s /bin/bash -c "opencode ops-agent (read-only)" aiops
   ```
2. **Ajan makinesinde bu iş için ayrı bir SSH anahtarı üret** (parolasız, yalnız bu bağlantı için):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/aiops_<hedef-adi> -C "aiops@<hedef-adi> (opencode ops-agent)" -N ""
   ```
3. **Allowlist wrapper'ı hedef sunucuya koy** (`/usr/local/sbin/aiops-command-filter.sh` — yalnız
   aşağıdaki gibi kesin desenlerle eşleşen, **salt-okunur** komutlara izin verir; her şeyin geri
   kalanını reddeder ve **logger** ile syslog'a düşürür):
   ```bash
   #!/usr/bin/env bash
   # /usr/local/sbin/aiops-command-filter.sh — forced-command allowlist (salt-okunur v1)
   set -euo pipefail
   cmd="${SSH_ORIGINAL_COMMAND:-}"
   logger -t aiops-ssh "İSTEK: ${cmd}"
   case "$cmd" in
     "journalctl "*|"systemctl status "*|"rpm -qa"*|"df -h"*|"free -h"*|"uptime"|"uname -a"|"ip a"|"ss -tulpn"*)
       logger -t aiops-ssh "İZİN: ${cmd}"
       exec /bin/bash -c "$cmd"
       ;;
     *)
       logger -t aiops-ssh "RED: ${cmd}"
       echo "aiops-command-filter: izin verilmeyen komut: ${cmd}" >&2
       exit 126
       ;;
   esac
   ```
   ```bash
   chmod 750 /usr/local/sbin/aiops-command-filter.sh
   chown root:root /usr/local/sbin/aiops-command-filter.sh   # aiops YAZAMASIN — kendi kapısını değiştiremesin
   ```
4. **`aiops` hesabının `authorized_keys`'ine forced-command ile ekle** (hedef sunucuda,
   `/home/aiops/.ssh/authorized_keys`, `aiops` sahipliğinde, `600`):
   ```
   command="/usr/local/sbin/aiops-command-filter.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA...<ajan makinesinin public key'i>... aiops@<hedef-adi>
   ```
   - `command=`: gelen ne olursa olsun **her zaman** bu script çalışır, `SSH_ORIGINAL_COMMAND`'a bakar.
   - `no-pty`: interaktif shell açılamaz.
   - `no-port-forwarding`/`no-X11-forwarding`/`no-agent-forwarding`: tünel/relay yolu kapalı.
5. Ajan makinesinde `~/.ssh/config`'e hedef için bir `Host` girişi ekle (IdentityFile = adım 2'deki
   anahtar) — repoya **girmez**, yalnız yerel `~/.ssh/config`.

## Doğrulama

- `ssh aiops@<hedef> "journalctl -n5"` → çalışmalı, `journalctl -t aiops-ssh` hedefte "İZİN" satırı düşmeli.
- `ssh aiops@<hedef> "rm -rf /tmp/test"` → **reddedilmeli** (exit 126), hedefte "RED" satırı düşmeli.
- `ssh aiops@<hedef>` (komutsuz) → shell **açılmamalı** (`no-pty` + wrapper boş komutu reddeder).

## Bilinen tuzaklar

- Wrapper dosyasını `aiops` kullanıcısı yazabilirse tüm kapı işe yaramaz — `chown root:root` + `750` şart.
- `case` desenleri gevşek yazılırsa (`"journalctl"*` gibi `*` fazla erken) istenmeyen komutlar sızabilir;
  her yeni izin **tam desen** olarak eklenmeli, genel joker karakterden kaçınılmalı.
- Bu, `permission.bash` (istemci tarafı `ask`/`deny`) ile **aynı işi tekrar etmiyor** — ikisi farklı
  katman: istemci tarafı model'e "sorma" kuralı, sunucu tarafı **modelin kararından bağımsız** son kapı.

## Kaynak / tarih

- Tasarım kaynağı: `../policy/PERMISSION-MATRIX.md` §3, `../policy/THREAT-MODEL.md` §3 "Kimlik ve secrets".
- Bu runbook: 2026-09-19, Alp'in "audit ve ssh konusunda ne gerekiyorsa yapalım" talebi üzerine yazıldı —
  **henüz hiçbir hedef sunucuya uygulanmadı**, hedef sunucu adı/IP'si ve `aiops` hesabı açma onayı
  Alp'ten bekleniyor.
