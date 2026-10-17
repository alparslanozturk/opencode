---
name: rhel-guvenlik
description: RHEL sunucuların (küme node'ları dahil) güvenlik sağlığını yalnız okuyarak denetlerken kullan — bekleyen güvenlik yaması (errata), çalışan↔kurulu çekirdek ve reboot gereksinimi, ara sürüm kilidi ve destek durumu, ssh ayarı, auditd, chrony; CIS Level 1 / OpenSCAP (Satellite) kurum profili. "sunucu güvenliği", "rhel güvenlik", "yama durumu", "güvenlik yaması", "errata", "reboot gerekiyor mu", "çekirdek güncel mi", "cis", "scap", "openscap", "benchmark", "sıkılaştırma", "ssh ayarı" isteklerinde tetiklenir. Yamayı uygulamak için `rhel-guncelleme`; küme tarafı `rke2-guvenlik`. Yalnız okur; düzeltmeyi önerir, uygulamaz.
---

# RHEL güvenlik sağlığı

**İlkeler:** yalnız okuma. Her satır bu turdaki bir çıktıdan; çıktı yoksa "ölçülmedi". Çok sunucu → `ansible <grup> -m shell
-a '…' -o` (tek izin; `filo-kontrol`). Sır değerini ekrana basma.

## 1. Kurum kararları ve CIS (bulgu değil — Alp)

- SELinux kapalı · firewalld kapalı · `net.ipv4.ip_forward=1` (RKE2 node'ları) · `/tmp` noexec (2026-09-29).
- **CIS (2026-10-17):** RHEL 10 şablonunda Satellite'tan SCAP ile **CIS Level 1** uygulanıyor (SELinux ve firewall kapsam dışı,
  politikaların çoğu uygulanmış). Kurumun hangi CIS maddelerini uyguladığı (profil) belli olana kadar "uygulanmamış" maddeyi
  bulgu yazma → "CIS: kurum profili [SAHA]" bilgi satırı. RHEL şablonları / SCAP profilleri paylaşılınca buraya eklenecek.
- Sürüm destek durumu (ara sürüm en son mu, Rancher RHEL listesinde mi): `surum-uyum` (`uyum.py kontrol --rhel …`).

## 2. Node taraması (ansible ad-hoc, tüm grup — tek izin)

```bash
ansible <grup> -m shell -a 'uname -r; rpm -q --last kernel | head -1; uptime -p; subscription-manager release --show; dnf -q updateinfo list --security 2>/dev/null | wc -l' -o
ansible <grup> -m shell -a 'needs-restarting -r 2>/dev/null | tail -1; systemctl is-active auditd chronyd; chronyc tracking | grep -E "Leap|System time"' -o
ansible <grup> -m shell -a 'grep -hEi "^\s*(PermitRootLogin|PasswordAuthentication|MaxAuthTries|X11Forwarding)" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null' -o
```
Değerlendirme:
- Çalışan çekirdek ≠ en son kurulu çekirdek → yama alınmış ama **etkin değil**, reboot gerek ⚠️ (saha: mas01 229 gün açık).
- Bekleyen güvenlik errata sayısı > 0 ⚠️ (kritik/önemli ayrımı: `dnf updateinfo list --security` satırlarındaki önem).
  Satellite içerik görünümü (CV) eski tarihteyse "en son" = CV tarihi — `rhel-guncelleme` becerisi.
- `release --show` bir ara sürüme kilitliyse (ör. 9.4) ve uzatılmış abonelik yoksa o sürüm yama almıyor olabilir ⚠️ (`uyum.py` RHEL satırı).
- Etkin değer için `sshd -T | grep -Ei "^(permitrootlogin|passwordauthentication|maxauthtries|x11forwarding)"` (test kipi, serbest —
  saha G67); dosya okuması `sshd_config.d` sırasını göstermez.
- auditd/chronyd aktif değil ⚠️; saat senkron değil ⚠️ (sertifika/etcd için kritik).

## 3. Puan kartı satırları (ekrana, kısa)

```
RHEL güvenlik · <grup/sunucu> · <tarih> · yalnız okuma
❌ Kritik: … (kanıt) — ör. bakım dışı ana sürüm, kritik errata + reboot bekleyen çekirdek
⚠️ Önemli: … — çalışan ≠ kurulu çekirdek, ara sürüm kilidi, PermitRootLogin yes, auditd/chronyd kapalı
ℹ️ Kurum kararı: SELinux/firewalld kapalı · CIS L1 (SCAP) — profil [SAHA]
✅ İyi: …
Ölçülmedi: … (neden)
```

## Yapmayacakların

- `dnf update`, reboot, sshd/auditd/chrony ayarı değiştirme, SCAP remediation — hepsi değişiklik; öner, uygulama
  (yama akışı `rhel-guncelleme`).
