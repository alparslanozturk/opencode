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
1. **fstab sağlam mı (reboot'tan önce — atlanmaz).** Alp: "reboot ettiğimizde açılmayabiliyor makineler." Bozuk fstab = sunucu emergency
   mode'da açılır. Filo için tek komut (okuma, onay sormaz):
   ```bash
   ansible <grup> -i <envanter> -m shell -f 20 -T 10 -t cikti/filo/fstab -a 'o=$(findmnt --verify 2>&1); echo fstab_rc=$?; z=$(printf "%s\n" "$o" | grep -E "^(Success|[0-9]+ (parse error|error|warning))" | head -1); echo "fstab_ozet=${z:-OKUNAMADI: $(printf "%s" "$o" | head -1 | cut -c1-80)}"; echo fstab_hata=$(printf "%s\n" "$o" | awk "/parse error at/ {sub(/^.*: parse error/,\"parse error\"); printf \"%s; \", \$0} /^[^ ]/ && !/^(Success|[0-9]+ |findmnt:)/ {t=\$0} /\[E\]/ {sub(/^ *\[E\] */,\"\"); printf \"%s: %s; \", t, \$0}" | cut -c1-300); echo bagli_degil=$(findmnt --fstab -n -o TARGET,OPTIONS | awk "\$1 != \"none\" && \$1 != \"swap\" && \$2 !~ /noauto/ {print \$1}" | while read t; do findmnt -n "$t" >/dev/null || printf "%s " "$t"; done)'
   python3 /root/ai/opencode/knowledge/skills/approved/filo-kontrol/filo-tablo.py cikti/filo/fstab --kv
   ```
   `fstab_rc` 0 + "Success" = temiz · `fstab_hata` = hedef: hata (`[E]` satırları; yok kaynak/UUID, yok bağlama dizini, parse hatası) →
   **o sunucuyu reboot etme**, kullanıcıya göster · `bagli_degil` = fstab'da olup şu an bağlı olmayan (noauto/swap hariç) — açılışta
   bağlanamayabilir, sor. `fstab_ozet=OKUNAMADI` → `findmnt --verify` yok (tahmin: RHEL 7, util-linux 2.23) → `mount -fav` ile bak.
   (ölçüldü: util-linux 2.40 — sağlam fstab "Success", örnek bozuk dosyada parse hatası + yok UUID/dizin yakalandı.)
   Alp'in pratiği `mount -av` (eksik bağlamaları da bağlar — değişiklik sayılır, onay ekranı).
1b. **Konteyner fotoğrafı (okuma, reboot'tan önce — bilgi amaçlı).** Kurum politikası (Alp, 2026-11-02): OS güncellemesinde sunucunun
   içini (uygulamayı) analiz etme zorunluluğu **yok**; upgrade + restart edilir, açılması uygulama/sunucu sahibinin işi — "sadece bilsem
   yeterli". Ajan inceleme/düzeltme yapmaz; yalnız bu tek komutla ne çalıştığını ve önce/sonra farkını raporlar (saha: astreds* redis +
   sentinel docker compose ile). Hücre: `ad:durum:restart-politikası`. Politika `no` (compose'da `restart:` yok = `no`, genel) → reboot sonrası kendiliğinden
   **açılmaz**; servis `disabled` → motor da açılmaz. Bunu reboot'tan ÖNCE kullanıcıya listele ("şu konteynerler açılmayacak, sahibine
   haber"), sonra aynı komutu `-t cikti/filo/konteyner-sonra` ile koş ve iki tabloyu karşılaştır (`diff <(filo-tablo.py …once --kv) <(… sonra --kv)`).
   ```bash
   ansible <grup> -i <envanter> -m shell -f 20 -T 10 -t cikti/filo/konteyner-once -a '{% raw %}for r in docker podman; do command -v $r >/dev/null 2>&1 || continue; s=$(systemctl is-enabled $r 2>/dev/null); echo "${r}_servis=${s:-yok}"; echo "${r}_konteyner=$($r ps -a --format "{{.Names}}:{{.State}}" 2>/dev/null | while read k; do printf "%s:%s " "$k" "$($r inspect -f "{{.HostConfig.RestartPolicy.Name}}" "${k%%:*}" 2>/dev/null)"; done)"; echo "${r}_compose=$($r ps -aq 2>/dev/null | xargs -r $r inspect -f "{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}|{{index .Config.Labels \"com.docker.compose.project.config_files\"}}" 2>/dev/null | grep -v "^|$" | sort | uniq -c | awk "{printf \"%s(%s) \", \$2, \$1}")"; done{% endraw %}'
   python3 /root/ai/opencode/knowledge/skills/approved/filo-kontrol/filo-tablo.py cikti/filo/konteyner-once --kv
   ```
   (ölçüldü: podman 5 + podman-compose 1.5, ansible-core 2.16, yalnız okuma, kilit onay sormaz; `{% raw %}` Go şablonlarını ansible'ın
   Jinja'sından korur. docker'da ilk koşuda teyit.) `<motor>_compose=<dizin>|<dosya>(konteyner sayısı)` — compose dosyasının yeri
   konteynerin **kendi etiketinden** (`com.docker.compose.project.working_dir` / `config_files`) okunur.
   **"Compose'a bak" = bu komut.** Saha G116 (Alp: "büyük bir hata"): kullanıcı "hepsinde docker-compose var, onlara bak" dedi; ajan
   önceki konuşmadaki Redis'e takılıp 13 sunucuda `/usr/local/assistbox` altında "Redis/Sentinel var mı" aradı. Yapma: kullanıcının
   istediğini önceki bağlamla **daraltma/değiştirme** (istenen compose yapısıydı, Redis değil); compose yolunu bir sunucudan öbürüne
   **tahmin etme** (saha: `/usr/local/assistbox`, `/apps/…`, `coturn/` — her sunucuda farklı; yolu etiket verir); içerik/uygulama araması
   yapma (kurum politikası). Tabloda her sunucu için: compose dizini/dosyası · konteyner:durum:politika · motor servisi. Bir dosyanın
   içi istenirse yalnız o sunucuda, etiketteki yolu `cat` et.
   **Reboot sonrası açılır mı = yalnız iki alan:** motor servisi `enabled` + konteynerin restart politikası (genel, Docker belgesi: `always` →
   açılır; `unless-stopped` → reboot anında çalışıyorsa açılır, elle durdurulmuşsa açılmaz; `no` → açılmaz). Aynı compose'da bağımlılıklar
   farklıysa ayrıca yaz (saha: splastgraylg'de graylog `always`, ES/mongo `no` → graylog açılır ama bağımlılıkları açılmaz). **Yapma**
   (saha G116, Alp: "pek işime yaramayacak"): "nasıl/kim başlatmış" araştırması — `bash_history`, docker kullanıcısı, grup üyeliği, cron
   taraması (root docker grubuna üye olmadan da docker'ı kullanır; history ne silinmeyi ne başka kullanıcıyı kanıtlar); history'deki
   komutu tekrar çalıştırmak/önermek (`docker compose down -v` adlı volume'ları **siler** — veri kaybı); host başına `ssh -o
   StrictHostKeyChecking=accept-new` döngüsü (known_hosts'a yazar) — tek ansible komutu yeter.
2. **1. reboot** (onay ekranı) — temiz başlangıç: sunucu yamadan önce sorunsuz açılıyor mu. Ansible: `ansible.builtin.reboot` (reboot_timeout).
   Sonra `uptime`, `systemctl --failed`.
3. **Kayıt / repo** (okuma): `subscription-manager status; subscription-manager release --show; dnf -q repolist` — Satellite repoları açık mı,
   release kilidi beklenen mi.
4. **Güncelleme**: önce `dnf -q check-update | wc -l` (kaç paket), sonra kurum playbook'u `06-dnf` (`rhel-teslim`) — elle ssh döngüsü değil (G26).
   Uzun sürer → arka planda ve log'a (`ansible` §5b, `ANSIBLE_LOG_PATH=cikti/<iş>.log`). **"Şu an hangi sunucuda?"** sorusu = log'u okumak
   (`grep -E "^TASK|changed:|ok:|fatal:" cikti/<iş>.log | tail`) — okuma, onay gerekmez, playbook'u durdurmaz.
5. **2. reboot** (onay ekranı) — yeni çekirdek.
6. **Ölç**: aşağıdaki durum tablosu (+ 1b'nin "sonra" fotoğrafı) — `cekirdek_calisan = cekirdek_son_kurulu`, `reboot_gerekli=hayir`, `systemctl --failed` boş. Sapan sunucuyu
   ayrı listele; tablo dışı "hepsi tamam" yazma.

## Güncelleme durumu tablosu — tek sunucu ya da filo (saha G34/G36/G37)

**Sayı ve hedef sürüm uydurulmaz** (saha 2026-11-02: 13 sunucu "8.7 → 8.10 ×7, 9.7 → 9.8 ×4" diye yanlış toplandı, 9.8'deki 3 sunucu hiç
anılmadı). Dağılım: `filo-tablo.py … --kv --say surum` (değer başına sayı + sunucu adları). Hedef sürüm = Satellite'ın sunduğu (`dnf -q
check-update`, `release`) — "9.8'e çıkacak" yazmadan önce o sunucunun repolarından ölç; "en güncel" demek için `check-update` boş olmalı.

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
