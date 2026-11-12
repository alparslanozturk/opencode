---
name: rhel-guncelleme
description: RHEL ailesinde paket güncellemesi, güvenlik yaması ve yeniden başlatma kararı için kullan — güncelleme durumu tablosu `filo-tablo.py --kv` ile (sürüm, çalışan/son kurulu çekirdek, reboot, dnf sürüyor mu). "güncelle", "güncel mi", "update", "upgrade", "yama", "dnf update", "güvenlik yaması", "reboot gerekiyor mu", "güncellendi mi", "hangi çekirdekte", "dnf bitti mi", "upgrade akışı", "content view güncel mi", "satellite sync", "fstab kontrol", "mount -av", "yum/dnf SSL hatası", "Curl error", "repomd.xml indirilemiyor", "depo sertifika hatası" isteklerinde tetiklenir. Devralma ve teslim akışı için `rhel-teslim`.
---

Doğrulandı: AlmaLinux 10.2, dnf 4.20.0 — 2026-08-29

**Paket yöneticisi `dnf`.** `apt` Debian/Ubuntu'ya aittir, RHEL ailesinde
yoktur — `command not found` alırsın. `yum` çalışır ama `dnf-3`'e sembolik
bağdır (ölçüldü), yeni yazılan komutlarda `dnf` kullan.

## Önce sor (tek mesaj, numaralı — oturumda/kurumsal bilgide cevabı varsa sorma)

1. **Amaç:** yalnız durum (ne güncellenecek, hangi sürümde) mu, güncelleme + reboot mu, yoksa güncelleme/depo hatası mı (hata metni).
2. **Kapsam:** hangi sunucu(lar) / envanter grubu; sıra ya da aynı anda kapanmaması gerekenler var mı (küme üyeleri).
3. **Kısıt:** değişiklik kaydı (CN) ve pencere; reboot serbest mi; sunucu/uygulama sahibine haber verildi mi.
4. **Hedef:** tam güncelleme mi, yalnız güvenlik mi, belirli paket/sürüm mü (ana sürüm yükseltmesi → `rhel-yukseltme`). Kullanıcı
   "dnf update" dediyse cevap verilmiştir (tam) — yapıştırılan nottaki paket adına göre daraltma.
5. **Satellite içeriği — insanın işi, her güncelleme işinde sor:** "Satellite'ta sync ve Content View güncel mi (yayınlandı / bu ortama
   terfi etti mi) — baktın mı?" Ajan Satellite'ı **göremez**; kontrolü kullanıcı yapar (Alp, 2026-11-12: "Adam onu bir sorar: yaptın mı
   sen diye. Çünkü o kendisi göremiyor. Ben yapacağım o işi."). Cevap "evet" olmadan `dnf update` adımına geçme.

Ölçülebileni sorma: bekleyen paket, çekirdek, reboot gerekir mi, istemcideki depo tarihi, fstab, konteynerler — aşağıdaki akış toplar.

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

**Adım adım — her adım ayrı onay (Alp, 2026-11-12: "hemen dnf update başlama ya da restart başlama, adım adım gideceğiz"):**
işe başlarken aşağıdaki sırayı kullanıcıya **kısa liste olarak göster** (0 Satellite sorusu → 1 fstab kontrol + `mount -av` çıktısı →
2 1. reboot → 3 kayıt/repo kontrolü → 4 `dnf update` → 5 2. reboot (çekirdek güncellendiyse, sor) → 6 son kontrol). Listeye
"reboot sonrası mount kontrolü" gibi ayrı adım ekleme (Alp, 2026-11-12: "gereksiz" — fstab reboot'tan önce doğrulandı). Her adımın sonunda sunucu başına sonucu tablo ver ve **dur**:
"sıradaki adım <…>, başlayayım mı?" Kullanıcının bir adıma verdiği onay sonraki adımı kapsamaz; fstab okundu diye reboot, reboot bitti
diye güncelleme başlamaz. Kullanıcı "yalnız şunu yap" dediyse (ör. "fstab kontrol ve mount -av çıktısı") yalnız onu yap, çıktıyı göster.

**Kapsam ve grup sırası (saha G124, 2026-11-12 — Alp: "açıkça söyledim, bütün sunucularda tam bir update yapacağız"):**
- Kullanıcı "dnf update / güncelle" dediyse iş **tam güncellemedir**. Yanına yapıştırılan güvenlik notu (RHSA, CVE, paket adı) gerekçedir,
  kapsam değildir — `dnf update <paket>` ile daraltma. Emin değilsen "Önce sor" 4'ü sor; kendin seçme.
- Kullanıcı ortam/grup sırası verdiyse (ör. "önce felaket-test, sonra test, sonra üretim") aşağıdaki 0-6 adımları **yalnız ilk grupta** yürüt,
  6. adımın tablosunu ver ve **dur** — sonraki grup kullanıcının "devam"ıyla başlar. Grup ancak 5. adım (2. reboot) kararı verilip 6. adım
  temiz çıkınca **biter**: güncelleme sonrası tabloda `reboot_gerekli=EVET` / çalışan ≠ son kurulu çekirdek varsa sıradaki soru 2. reboot'tur,
  sonraki grup değil (saha G124 5. tur). Birden çok kurulu çekirdek (eski sürümler) normaldir — `installonly_limit` kadar tutulur (varsayılan 3, ölçüldü AlmaLinux 10), sorun değil. Bir gruptaki okuma (fstab) bitti diye diğer grubun
  güncellemesine geçilmez.
- Listede adı çözülmeyen / bağlanılamayan sunucu varsa o grupta 1. adımdan önce kullanıcıya adlarıyla sor (envanterde IP'si olabilir);
  kalanlarla sessizce devam etme. Hedefler `is-envanter.py` iş envanterinden gelir, elle `for h in …; do ssh` listesinden değil.
  Erişilemeyen sunucuyu kendiliğinden başka gruba taşıma ("sonraki grupla yaparız") — ne olacağına kullanıcı karar verir.
- **Değiştiren adımlar playbook'la, iş dizininde** (Alp, 2026-11-12; `ansible` §0): `dn/<numara>/hosts.ini` + `01-reboot.yaml`,
  `02-update.yaml` … — hazırı `ansible/playbooks/`'tan kopyalanır. Her playbook'un ilk koşusu **tek sunucu** (`-l <sunucu>`), sonuç
  gösterilir, sonra grup. `ansible … -m shell -a "dnf update -y | tail"` kullanma (`| tail` hatayı yutar). Okuma (0, 1, 1b, 3, 6) ad-hoc.

0. **İçerik güncel mi (önce bu).** Önce kullanıcıya sor ("Önce sor" 5) — Satellite'taki sync/CV durumunu yalnız o görür. Senin
   yapabildiğin destek okuması, istemciden Satellite'ın sunduğu metadata'nın tarihi (kullanıcının cevabının yerine geçmez):
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
2. **1. reboot** (playbook, onay ekranı) — temiz başlangıç: sunucu yamadan önce sorunsuz açılıyor mu. `ansible.builtin.reboot` (reboot_timeout).
   Sonra `uptime`, `systemctl --failed` — bu reboot'un sonucudur, ayrı adım değil.
3. **Kayıt / repo — salt kontrol** (okuma): `subscription-manager status; subscription-manager release --show; dnf -q repolist` — Satellite
   repoları açık mı, release kilidi var mı. Alp (2026-11-12): release set edildiyse güncelleme doğal olarak o sürümde kalır — bu hata
   değil, bilgi; sonucu tabloda göster, kendin değiştirme (`release --set/--unset` kullanıcının kararı).
4. **Güncelleme**: önce `dnf -q check-update | wc -l` (kaç paket), sonra kurum playbook'u `06-dnf` (`rhel-teslim`) iş dizinine kopyalanıp önce tek sunucuda — elle ssh döngüsü değil (G26).
   Uzun sürer → arka planda ve log'a (`ansible` §5b, `ANSIBLE_LOG_PATH=cikti/<iş>.log`). **"Şu an hangi sunucuda?"** sorusu = log'u okumak
   (`grep -E "^TASK|changed:|ok:|fatal:" cikti/<iş>.log | tail`) — okuma, onay gerekmez, playbook'u durdurmaz.
5. **2. reboot** (playbook, onay ekranı) — çekirdek (ya da glibc/systemd gibi reboot isteyen paket) güncellendiyse **kullanıcıya sor**
   (Alp, 2026-11-12: "kernel update vb. olduğunda son reboot sorulması lazım"). Ölçüt: `cekirdek_calisan ≠ cekirdek_son_kurulu` ya da
   `reboot_gerekli=EVET` (aşağıdaki tablo). Hiçbirinde yoksa "2. reboot gerekmiyor (ölçüldü)" yaz, atlama kararını yine kullanıcıya bırak.
6. **Son kontrol** (okuma): (a) aşağıdaki durum tablosu (+ 1b'nin "sonra" fotoğrafı) — `cekirdek_calisan = cekirdek_son_kurulu`,
   `reboot_gerekli=hayir`, `systemctl --failed` boş; (b) **işin hedeflediği RHSA/paketler** (kullanıcının yapıştırdığı not — bir ya da
   birkaç RHSA) kurulu mu → **yalnız `rhsa-kontrol.py`** (bu dizinde; okuma, onay gerekmez):
   ```bash
   python3 /root/ai/opencode/knowledge/skills/approved/rhel-guncelleme/rhsa-kontrol.py --komut RHSA-2025:1234 RHSA-2025:5678 -i dn/<numara>/hosts.ini --hedef <grup>
   # basılan ansible komutunu çalıştır (sunucu başına: uname -r, dnf repoquery --advisory, rpm -qa → cikti/filo/rhsa), sonra:
   python3 /root/ai/opencode/knowledge/skills/approved/rhel-guncelleme/rhsa-kontrol.py cikti/filo/rhsa RHSA-2025:1234 RHSA-2025:5678
   ```
   Sonuç sunucu × RHSA: ✅ kurulu · 🔄 kurulu ama çalışan çekirdek eski (reboot bekliyor) · ❌ eksik (kurulu < gereken sürüm) · ⚠️ depoda
   yok · ➖ ilgisiz (paketi kurulu değil) · ❓ okunamadı. Çıktıyı **aynen** aktar. `dnf updateinfo list --installed <RHSA>` ile karar
   **verme** (saha 2026-11-12, RHEL 8.10: RHSA'lar kurulu olduğu hâlde model doğrulayamadı; ölçüldü dnf 4.20: bu komut yanlış/bilinmeyen
   ID'de ve depoda olmayan advisory'de de boş döner, rc=0 — "kurulu değil" ile "depoda yok" ayrılamaz). Betik paket listesini sunucunun
   kendi depolarından alır, sürümü rpm kuralıyla karşılaştırır (rpm'in kendisiyle 200.000 karşılaştırmada aynı). `repoquery --advisory`
   RHEL 8 (dnf 4.7) üzerinde burada ölçülmedi — dnf seçeneği tanımazsa sonuç ❓ "dnf hatası" olur, ✅ uydurulmaz.
   Alp: "birinin test edilmesiyle Satellite tarafından en güncel repolar ve CV'ler güncel mi anlaşılıyor — bir son kontrol".
   Not burada **kontrol** içindir, güncellemeyi daraltmaz (yukarıdaki "Kapsam"). ⚠️ depoda yok → içerik sunucuya gelmemiş: Satellite
   CV/terfi gerisinde (0. adım) ya da kimlik yanlış — kullanıcıya söyle. Sapan sunucuyu ayrı listele; tablo dışı "hepsi tamam" yazma.

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

## Depo erişiminde TLS/SSL hatası — `dnf`/`yum` "Curl error" (ölçüldü 2026-11-11)

Ölçüm: dnf 4.20.0, librepo 1.19.0, libcurl 8.12.1, OpenSSL 3.5.8 (AlmaLinux 10) — yerel deneme sunucusuna karşı her durum ayrı üretildi.
Sayılar libcurl hata kodudur (`man curl` → EXIT CODES). Eski sürümde köşeli parantez içindeki metin farklı olabilir: **kodu ve metni
aynen göster**, tabloda yoksa "tabloda yok" de, sebep uydurma.

**Önce asıl satırı al.** `dnf -q …` yalnız `Cannot download repomd.xml: … All mirrors were tried` basar — sebep bu satırda **yoktur**
(ölçüldü). `-q` olmadan çalıştır ya da logdan oku (ikisi de okuma):
```bash
ssh root@<sunucu> "dnf check-update --refresh 2>&1 | grep -iE 'curl error|status code' | sort -u | head; grep -iE 'curl error' /var/log/dnf.librepo.log | tail -5"
```

| Satırdaki metin | Anlamı | Sonraki okuma | Düzeltme kimde |
|---|---|---|---|
| `(60)` … `unable to get local issuer certificate` | deponun sertifikasını imzalayan CA istemcide yok ya da sunucu ara CA'yı göndermiyor | deponun `sslcacert` satırı (boşsa sistem güven deposu — `man dnf.conf`); `rhel-ca-guven` → `ca-dogrula.py` | CA yükleme: `rhel-ca-guven` (değişiklik) |
| `(60)` … `certificate has expired` | sunucunun (ya da zincirdeki bir CA'nın) sertifikası bitmiş — ya da istemci saati ileride | canlı uç: aşağıdaki `sertifika-kontrol.py --uc`; istemcide `date -u` | depo/Satellite sahibi; saat ise `rhel-yonetim` (chrony) |
| `(60)` … `certificate is not yet valid` | istemci saati geride ya da sertifika yeni kesilmiş | `date -u`; `chronyc tracking` | saat: `rhel-yonetim` |
| `(60)` … `no alternative certificate subject name matches target hostname` | `baseurl`'deki ad sertifikanın SAN'ında yok (takma ad/IP ile yazılmış depo, araya giren yük dengeleyici/proxy) | `baseurl` ↔ `--uc` çıktısındaki SAN | depo tanımı ya da sertifika sahibi — sor |
| `(56)` … `alert certificate required` | sunucu istemci sertifikası istiyor, istemci göndermedi | depo dosyasında `sslclientcert` / `sslclientkey` var mı, dosya yerinde mi | abonelik/kayıt (Satellite) — kullanıcı |
| `(58)` … `could not load PEM client certificate` | `sslclientcert` dosyası yok/okunamıyor | `ls -l <o dosya>`; bitiş: `openssl x509 -noout -enddate -in <dosya>` | abonelik/kayıt yenileme — kullanıcı |
| `(77)` … `error setting certificate file` | `sslcacert` yolundaki dosya yok/okunamıyor | `ls -l <o dosya>` | depo tanımı / CA dosyası |
| `(35)` … `alert protocol version` | TLS sürümü uyuşmuyor (ölçümde sunucu yalnız TLS 1.1 sunuyordu) | `update-crypto-policies --show` | sunucu tarafı; politikayı düşürmek güvenlik kararı — sor |
| `(7)` … `Could not connect to server` | TLS değil, bağlantı | `rhel-teslim` §1 (ping/port) | ağ/FW |

Depo tanımını ve canlı sertifikayı oku (hepsi okuma; `<depo-sunucusu>` = `baseurl`'deki ad):
```bash
ssh root@<sunucu> "grep -HEs '^(\[|baseurl|sslverify|sslcacert|sslclientcert|sslclientkey|proxy)' /etc/yum.repos.d/*.repo /etc/dnf/dnf.conf; date -u"
python3 /root/ai/opencode/knowledge/skills/approved/rancher-sertifika/sertifika-kontrol.py --uc <depo-sunucusu>:443
```
`--uc` bu makineden bağlanır: sunucunun gönderdiği zincir, geçerlilik tarihleri, kalan gün, SAN (ölçüldü: süresi dolmuş uçta `kalan -N gün ❌`
ve "uç yalnız yaprağı gönderiyor" uyarısı). Bu makine depo sunucusuna erişemiyorsa aynı bilgiyi kullanıcı o sunucudan getirir.

- `sslverify=0` / `--setopt=sslverify=false` / `--nogpgcheck` **çözüm değildir**: doğrulamayı kapatır (`man dnf.conf`: "If False … certificates
  are not verified"). Önerme; kullanıcı isterse geçici olduğunu ve neyi kapattığını yaz.
- Hata bir sunucuda mı, hepsinde mi? Hepsindeyse sebep büyük olasılıkla depo/Satellite tarafında (tahmin — yukarıdaki satırla doğrula);
  tek sunucudaysa o sunucunun saati, güven deposu, depo dosyası. Filo için aynı `grep 'curl error'` komutunu `filo-kontrol` ile koş.

## Yapma

- Kullanıcı istemediyse **yeniden başlatma.** Güncelleme sonrası reboot
  gerekse bile kararı kullanıcı verir; sen `needs-restarting -r` sonucunu
  raporlarsın.
- `dnf -y upgrade`'i onaysız çalıştırma. Banka ortamında paket güncellemesi
  değişiklik kaydı gerektirebilir.
- Çekirdek güncellemesinden sonra eski çekirdeği silme (`dnf remove kernel`)
  — geri dönüş yolunu kapatır.
