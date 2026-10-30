---
name: rhel-guncelleme
description: RHEL ailesinde paket güncellemesi, güvenlik yaması ve yeniden başlatma kararı için kullan — güncelleme durumu tablosu `filo-tablo.py --kv` ile (sürüm, çalışan/son kurulu çekirdek, reboot, dnf sürüyor mu). "güncelle", "güncel mi", "update", "upgrade", "yama", "dnf update", "güvenlik yaması", "reboot gerekiyor mu", "güncellendi mi", "hangi çekirdekte", "dnf bitti mi", "upgrade akışı", "content view güncel mi", "satellite sync", "fstab kontrol", "mount -av" isteklerinde tetiklenir. Devralma ve teslim akışı için `rhel-teslim`.
---

Doğrulandı: AlmaLinux 10.2, dnf 4.20.0 — 2026-08-29

**Paket yöneticisi `dnf`.** `apt` Debian/Ubuntu'ya aittir, RHEL ailesinde
yoktur — `command not found` alırsın. `yum` çalışır ama `dnf-3`'e sembolik
bağdır (ölçüldü), yeni yazılan komutlarda `dnf` kullan.

Salt-okunur:

```bash
dnf check-update                      # ne güncellenecek
dnf updateinfo summary                # kaç güvenlik bildirimi var
dnf updateinfo list --security        # hangileri
dnf update --security --assumeno      # kuru çalıştırma, hiçbir şey yapmaz
```

Yan etkili (**onay al**):

```bash
dnf -y upgrade
needs-restarting -r                   # yeniden başlatma gerekiyor mu
```

`needs-restarting -r` **çıkış kodu 1 dönerse** yeniden başlatma gerekir
(ölçüldü; çıktıyı borulama, çıkış kodunu oku). Yeniden başlatma yan
etkilidir ve izin sisteminde onaya takılır — özel olarak istenmedikçe yapma.

### En sık yanlış okuma

`updateinfo list --security` güvenlik yaması listeliyor ama
`dnf update --security` "No security updates needed" diyorsa, **yama zaten
kuruludur ve makine hâlâ eski çekirdekle çalışıyordur.** Ölçülen örnek:

```
Security: kernel-core-...-211.49.1 is an installed security update
Security: kernel-core-...-211.47.1 is the currently running version
```

Bu durumda gereken şey güncelleme değil **yeniden başlatmadır**. Paket
kurmaya çalışmak hiçbir şey değiştirmez. `needs-restarting -r` ile teyit et.

Devralma ve teslim akışının tamamı için `rhel-teslim` becerisine geç.


## Satellite ile yönetilen sunucuda

Tüm sunucular Satellite'a kayıtlı; depolar oradan gelir. Kurumda Satellite ile yapılan **tek iş sunucuyu
kaydetmek** (kurumun abonelik betiği/komutu — bkz. `rhel-yonetim` "Satellite kaydı"). `dnf repolist` boşsa
ya da beklenmedikse önce kayıt durumuna bak (`subscription-manager status`); Satellite sunucusunun kendisi
(content view, senkron) bizim işimiz değil — kullanıcıya söyle.

```bash
dnf repolist                          # hangi depolar etkin
subscription-manager status           # YALNIZCA RHEL, AlmaLinux/Rocky'de yok
```

## Kurum güncelleme akışı (Alp, 2026-10-31)

Alp: "mount -av ile fstab kontrol, 1. restart, sonra subscription kontrol, dnf update, 2. restart. Bundan önce Red Hat Satellite CV güncel
olduğunu kontrol etmek lazım — bazen sync geriden gelebiliyor." Sıra bu; adımlar arasında sonucu **ölç** (AGENTS "yaptım = ölçüldü").

0. **İçerik güncel mi (okuma — önce bu).** İstemciden, Satellite'ın sunduğu metadata'nın tarihi:
   `ansible <grup> -i <env> -m shell -a 'dnf -q repoinfo --enabled 2>/dev/null | grep -E "^Repo-(id|updated)"' -t cikti/filo/repo` →
   `Repo-updated` = CV'nin bu ortama son yayınlandığı/terfi ettirildiği an. Haftalarca eskiyse ya da sunucular arasında farklıysa (farklı
   lifecycle environment/CV) güncellemeye başlamadan kullanıcıya söyle. Satellite'ta (genel — alan adlarını `hammer … --help` ile doğrula):
   `hammer content-view version list --organization "<org>" --content-view "<cv>"` (son sürüm hangi ortamda) ·
   `hammer repository info --organization "<org>" --product "<ürün>" --name "<repo>"` (son senkron) — senkron Red Hat'in gerisindeyse
   CV yayınlamak/terfi kullanıcının (Satellite) işi; ajan önermekle kalır.
1. **fstab sağlam mı (reboot'tan önce).** Bozuk fstab = sunucu emergency mode'da açılır. Okuma: `findmnt --verify --verbose`. Alp'in pratiği
   `mount -av` (eksik bağlamaları da bağlar — değişiklik sayılır; hata veren satırı reboot'tan önce gösterir). Hata varsa dur, söyle.
2. **1. reboot** (onay ekranı) — temiz başlangıç: sunucu yamadan önce sorunsuz açılıyor mu. Ansible: `ansible.builtin.reboot` (reboot_timeout).
   Sonra `uptime`, `systemctl --failed`.
3. **Kayıt / repo** (okuma): `subscription-manager status; subscription-manager release --show; dnf -q repolist` — Satellite repoları açık mı,
   release kilidi beklenen mi.
4. **Güncelleme**: önce `dnf -q check-update | wc -l` (kaç paket), sonra kurum playbook'u `06-dnf` (`rhel-teslim`) — elle ssh döngüsü değil (G26).
   Uzun sürer → arka planda ve log'a (`ansible` §5b, `ANSIBLE_LOG_PATH=cikti/<iş>.log`). **"Şu an hangi sunucuda?"** sorusu = log'u okumak
   (`grep -E "^TASK|changed:|ok:|fatal:" cikti/<iş>.log | tail`) — okuma, onay gerekmez, playbook'u durdurmaz.
5. **2. reboot** (onay ekranı) — yeni çekirdek.
6. **Ölç**: aşağıdaki durum tablosu — `cekirdek_calisan = cekirdek_son_kurulu`, `reboot_gerekli=hayir`, `systemctl --failed` boş. Sapan sunucuyu
   ayrı listele; tablo dışı "hepsi tamam" yazma.

## Güncelleme durumu tablosu — tek sunucu ya da filo (saha G34/G36/G37)

"Güncellendi mi, reboot lazım mı, hangi sürümde, dnf bitti mi" sorusunun tamamı tek komut + `filo-tablo.py` (`filo-kontrol` §5).
Tabloyu sen kurma — G36'da "Çekirdek" sütununa RHEL sürümü yazıldı, G34'te dnf'in yarım kalıp kalmadığı belirsiz kaldı:

```bash
ansible <grup|ad1,ad2,> -i <envanter> -m shell -f 20 -T 10 --task-timeout 30 -t cikti/filo/guncel -a 'echo surum=$(cat /etc/redhat-release 2>/dev/null); echo cekirdek_calisan=$(uname -r); echo cekirdek_son_kurulu=$(rpm -q kernel --last 2>/dev/null | head -1 | cut -d" " -f1 | sed "s/^kernel-//"); needs-restarting -r >/dev/null 2>&1; r=$?; [ $r -eq 1 ] && echo reboot_gerekli=EVET; [ $r -eq 0 ] && echo reboot_gerekli=hayir; [ $r -gt 1 ] && echo reboot_gerekli=bilinmiyor-rc$r; echo dnf_suruyor=$(pgrep -x dnf >/dev/null && echo EVET || echo hayir); echo release=$(subscription-manager release --show 2>/dev/null | head -1 | sed "s/^Release: //"); echo son_paket_kurulumu=$(rpm -qa --last 2>/dev/null | head -1 | sed "s/^[^ ]* *//")'
python3 /root/ai/opencode/knowledge/skills/approved/filo-kontrol/filo-tablo.py cikti/filo/guncel --kv
```

Sütunlar: `surum` (/etc/redhat-release) · `cekirdek_calisan` (uname -r) · `cekirdek_son_kurulu` (rpm -q kernel --last) ·
`reboot_gerekli` (needs-restarting -r çıkış kodu: 1 → EVET) · `dnf_suruyor` (EVET ise o sunucuda ikinci işlem başlatma — G37) ·
`release` (boş = sabit minor yok, Satellite CV'nin en sonu) · `son_paket_kurulumu`. Çalışan ≠ son kurulu çekirdek ve reboot EVET →
güncelleme kurulu, **yeniden başlatma** bekliyor (aşağıdaki "En sık yanlış okuma"). Ölçüldü: AlmaLinux 10.2, ansible-core 2.16 (2026-10-21).

## Yapma

- Kullanıcı istemediyse **yeniden başlatma.** Güncelleme sonrası reboot
  gerekse bile kararı kullanıcı verir; sen `needs-restarting -r` sonucunu
  raporlarsın.
- `dnf -y upgrade`'i onaysız çalıştırma. Banka ortamında paket güncellemesi
  değişiklik kaydı gerektirebilir.
- Çekirdek güncellemesinden sonra eski çekirdeği silme (`dnf remove kernel`)
  — geri dönüş yolunu kapatır.
