---
name: rhel-yukseltme
description: RHEL ana sürüm yükseltmesini (yerinde, Leapp) planlarken ve uygularken kullan — RHEL 8 → 9 ve 9 → 10 desteklenen yollar, ön koşullar (x86-64-v3, SHA-1 imzalı paket, LUKS, FIPS, network-scripts), Satellite hazırlığı (kaynak + hedef BaseOS/AppStream repolarının hedef minor sürümüyle senkronu, Content View, activation key, hammer doğrulaması, Satellite Leapp işleri), `leapp preupgrade` raporu (`leapp-rapor.py` — ENGEL önce), `leapp answer`, `leapp upgrade`, sonrası doğrulama ve temizlik, Leapp'in YAPILMADIĞI sunucular (IdM, Satellite/Capsule, AAP, JBoss EAP). "leapp", "rhel 8'den 9'a", "rhel 9'dan 10'a", "major yükseltme", "ana sürüm yükseltme", "in-place upgrade", "yerinde yükseltme", "preupgrade", "inhibitor", "engel", "leapp raporu", "content view leapp", "rhel 10'a geçiş" isteklerinde tetiklenir. Minor güncelleme / yama `rhel-guncelleme`. Yükseltme değişikliktir (kurulum yetkisi + sunucular).
---

# RHEL ana sürüm yükseltmesi — Leapp (8 → 9, 9 → 10)

Kaynak: Red Hat *Upgrading from RHEL 8 to RHEL 9* (RHEL 9 belgesi) ve *Upgrading from RHEL 9 to RHEL 10* (RHEL 10 belgesi) — yol tablosu
§1, planlama §2, hazırlık §3 (Satellite §3.2), değerlendirme §4, yükseltme §5, doğrulama §6, sonrası §7, sorun giderme §9;
*Satellite 6.19 Managing hosts* §11 (Leapp işleri); leapp rapor şeması oamg/leapp kaynağı — indirme 2026-10-25. **(Alp)** kurum
(2026-10-25) · **(genel)** doğrulanmadı. Belge sürümle değişir: yol tablosu ve leapp paket sürümleri için uygulamadan önce belgeyi tazele.

## 0. Kurum (Alp, 2026-10-25)

- Ana sürüm geçişlerinde **Leapp** kullanılıyor ama **az denendi** → önce test/dev ortamında (`engine/AGENTS.md` ad kalıbı: ortam harfi
  `t`/`d`) VM snapshot'lı pilot, sonra production.
- Sunucular Satellite'a kayıtlı → Satellite tarafında **Content View hazırlığı** gerekir (§3).
- Şimdilik **RHEL 9'da kalınıyor** (EOL değil); 9 → 10 ileride.

## 1. Desteklenen yollar (RH tablosu, 2026-10-25 — garanti yalnız RHSM/Satellite kayıtlı sistemlerde)

- **8 → 9:** RHEL 8.10 → 9.6 (EUS) · 8.10 → 9.8
- **9 → 10:** RHEL 9.6 (EUS) → 10.0 (EUS) · 9.8 → 10.2
- Tek seferde **bir** ana sürüm: 8 → 10 doğrudan yok, iki ayrı yükseltme (RH). 9 → 10 için, sistem daha önce 8 → 9 yükseltildiyse
  o yükseltmenin sonrası adımları (§7) tamamlanmış olmalı (RH).
- SAP NetWeaver / HANA yolları farklı (E4S) — ayrı RH belgesi.

## 2. Leapp YAPILMAZ / önce bak (RH)

- **IdM sunucusu** — yerinde yükseltme desteklenmez; yeni replika + rol taşıma (`idm-kurulum` "Yapmayacakların"). IdM **istemcisi** olur.
- **Satellite Server / Capsule** — kendi yordamı ("Upgrading Satellite or Capsule … by using Leapp", Satellite 6.16+).
- Ansible Automation Platform kurulu sistem · JBoss EAP (9 → 10'da sonra elle kurulur) · Stratis dosya sistemi.
- Ethernet/InfiniBand üzerinden ağ tabanlı multipath ve ağ depolaması (FCoE, FC'den SAN boot) — FC SAN desteklenir.
- BIOS → UEFI geçişi yerinde yapılamaz (temiz kurulum).
- RKE2/Kubernetes düğümü: RH belgesinde ayrıca geçmiyor → **bilinmiyor**; Alp'e sor (kurum genelde yeniden kurulum mu yapıyor `[SAHA]`).

## 3. Ön koşullar — okuma (sunucuda)

```bash
ssh root@<h> 'cat /etc/redhat-release; uname -r; subscription-manager release --show; subscription-manager repos --list-enabled | grep "^Repo ID"; rpm -q leapp leapp-upgrade-el8toel9 leapp-upgrade-el9toel10 2>/dev/null; df -h /var; dnf versionlock list 2>/dev/null; findmnt -t nfs,nfs4,cifs; ls /etc/sysconfig/network-scripts/ 2>/dev/null; fips-mode-setup --check 2>/dev/null; lsblk -o NAME,TYPE,FSTYPE | grep -i crypt'
```

Çok sunucuda: `filo-tablo.py` (`filo-kontrol`). Bakılacaklar:
- **Mimari:** belgede her iki yolda x86-64 için **x86-64-v3** yazıyor. Denetim (genel): CPU bayraklarında `avx2`, `bmi2`, `fma`, `movbe`
  → `grep -o -w -E 'avx2|bmi2|fma|movbe' /proc/cpuinfo | sort -u` (4'ü de yoksa v3 değil). Sanal makinede hipervizör CPU uyumluluk
  modu bayrakları gizleyebilir (tahmin — VMware EVC; `[SAHA]`).
- **SHA-1 imzalı paket** varsa yükseltme ENGELLENİR (RH) → kaldır ya da üreticiden SHA-256 imzalısını iste.
- **Şifreli disk:** yalnız LUKS2 + Clevis TPM 2.0 token. **FIPS:** 8 → 9 için 8.8+, 9 → 10 için 9.6+ (RH).
- **8 → 9:** `network-scripts` RHEL 9'da yok — özel ağ betiklerini NetworkManager dispatcher betiğine taşı (RH).
- **Yer:** değerlendirme `/var/lib/leapp`'te genelde **~4 GB** kullanır (RH).
- **Yedek:** tam yedek ya da VM snapshot; LVM snapshot tam yedek değildir, bazı hatalardan dönülemeyebilir — ReaR daha güvenli (RH).
- Yükseltme sırasında SELinux permissive yapılır (RH; kurumda SELinux zaten kapalı — `engine/AGENTS.md`).

## 4. Satellite hazırlığı (Satellite Server'da — değişiklik; Satellite yöneticisiyle)

RH §3.2 sırası:
1. Satellite tam/bakım desteğinde bir sürümde olmalı.
2. Manifest hedef RHEL repolarını içermeli.
3. **Kaynak + hedef** BaseOS ve AppStream repolarını etkinleştir ve en güncel hâliyle **senkronize et**. Hedef repoyu **hedef minor
   sürümüyle** seç (ör. 9.8) — yalnız "9" sürümünü etkinleştirirsen yükseltme ENGELLENİR (RH). x86_64, EUS'suz en az:
   - 8 → 9: `rhel-8-for-x86_64-baseos-rpms` + `rhel-8-for-x86_64-appstream-rpms` (8.10) · `rhel-9-for-x86_64-baseos-rpms` +
     `rhel-9-for-x86_64-appstream-rpms` (hedef, ör. 9.8)
   - 9 → 10: `rhel-9-for-x86_64-{baseos,appstream}-rpms` (kaynak) · `rhel-10-for-x86_64-{baseos,appstream}-rpms` (hedef)
4. Repolar **Content View**'de olmalı (publish + lifecycle ortamına promote) ve host o CV'ye bağlı olmalı; **activation key**'de repo
   setleri *Enabled* (RH). CV/LE adları `[SAHA]` (kurum düzeni — Alp'e sor).
5. Doğrula (okuma):
   ```bash
   hammer repository list --search 'content_label ~ rhel-9' --content-view <cv> --organization <org> --lifecycle-environment <le>
   hammer repository list --search 'content_label ~ rhel-10' --content-view <cv> --organization <org> --lifecycle-environment <le>
   ```
   Web arayüzü: *Content > Lifecycle > Content Views* (repolar) · *Content > Lifecycle > Activation Keys > Repository Sets* (Enabled).
   Hostta: `subscription-manager repos --list-enabled | grep "^Repo ID"` (kaynak repolar görünmeli).
6. Satellite'tan toplu iş (Satellite §11): host seç → *Schedule a Job* → **Leapp - Preupgrade** → *Monitor > Jobs* → raporda
   "Has Remediation" olanlar *Fix Selected* → **Leapp - Upgrade**. Ön koşul: Satellite SSH anahtarı hostlarda (uzaktan çalıştırma).

## 5. Sunucuda hazırlık (değişiklik — her sunucuda; RH §3.1)

1. İsteğe bağlı: sistemle ilgisiz veri dosya sistemlerini ayır ve `/etc/fstab`'da yoruma al (süreyi ve 3. taraf sorunlarını azaltır).
2. Kaynak repoları aç: `subscription-manager repos --enable rhel-<N>-for-x86_64-baseos-rpms --enable rhel-<N>-for-x86_64-appstream-rpms`
3. Sürümü kaynak minor'a sabitle: `subscription-manager release --set <kaynak>` (8.10 / 9.6 / 9.8).
4. Versionlock varsa: `dnf versionlock clear`.
5. Leapp paketleri güncel olmalı — belgedeki asgari: RHEL 8.10 → leapp 0.21.0 + leapp-repository 0.24.0; RHEL 9.6 → 0.19.0 + 0.22.0;
   RHEL 9.8 → 0.21.0 + 0.24.0. `dnf install leapp-upgrade` (`leapp-upgrade-el8toel9` / `-el9toel10` gelir).
6. `dnf update` → `reboot`.
7. Yapılandırma yönetimi karışmasın: Puppet/Salt/Chef ajanını `leapp preupgrade`'den önce kapat, yükseltme bitene kadar açma; Ansible
   playbook'unu yükseltme sırasında çalıştırma (RH) — kurumda Semaphore işleri `[SAHA]`.

## 6. Ön değerlendirme (preupgrade)

`leapp preupgrade --target <hedef>` (8 → 9 belgesi `--target-version` yazıyor — sürümde `leapp preupgrade --help` ile doğrula).
RH: sistem yapılandırmasını **değiştirmez** ama `/var/lib/leapp`'i doldurur; kilitte değişiklik sayılır (üretimde planlı iş).

Raporu betikle oku (okuma) — ENGEL önce, çıkış 1 = ENGEL var:
```bash
ssh root@<h> cat /var/log/leapp/leapp-report.json | python3 /root/ai/opencode/knowledge/skills/approved/rhel-yukseltme/leapp-rapor.py - --ad <h>
for h in <h1> <h2>; do echo "#SUNUCU $h"; ssh root@$h cat /var/log/leapp/leapp-report.json; done | python3 …/leapp-rapor.py - --kisa
```
Çıktıyı **aynen** aktar. Düz metin rapor: `/var/log/leapp/leapp-report.txt`.
- **ENGEL (inhibitor)** çözülmeden `leapp upgrade` çalışmaz. Engel yoksa da raporun tamamını oku; rapor her sorunu yakalamaz (RH).
- Soru bekleyen bulgu: `leapp answer --section <bölüm>.<alan>=<cevap>` (RH örneği: `leapp answer --section check_vdo.confirm=True`).
- Düzelt → `leapp preupgrade`'i yeniden çalıştır → ENGEL 0 olana dek.

## 7. Yükseltme (değişiklik — snapshot/yedek alındıktan sonra)

`leapp upgrade --target <hedef>` → `reboot` (ya da `--reboot`). Yeniden başlatmada "upgrade" aşaması initramfs'te çalışır; bu aşamanın
sorunları `/var/log/leapp/leapp-upgrade.log` (RH §9). Süre dakikalar–saatler (RH).

## 8. Sonrası (RH §6–§7)

Doğrulama (okuma): `cat /etc/redhat-release` · `uname -r` · `subscription-manager list --installed` · `subscription-manager release` ·
kalan eski paketler `rpm -qa | grep -E '\.el[78]'` (9 → 10'da `\.el[789]`).

Temizlik (değişiklik, RH):
- `dnf remove $(rpm -qa | grep \.el[78] | grep -vE 'gpg-pubkey|libmodulemd|katello-ca-consumer')` (9 → 10: `\.el[789]`)
- `dnf remove leapp-deps-el9 leapp-repository-deps-el9` (9 → 10: `-el10`)
- `dnf config-manager --save --setopt exclude=''`
- Kurtarma çekirdeği: `dnf -y install dracut-config-rescue` → eski `*rescue*` dosyalarını sil → `/usr/lib/kernel/install.d/51-dracut-rescue.install add "$(uname -r)" /boot "/boot/vmlinuz-$(uname -r)"`
- `.rpmnew` / `.rpmsave` / `.leappsave` dosyalarını gözden geçir.
- Güvenlik politikasını yeniden uygula (RH) → kurumda CIS taraması (`rhel-cis`); kripto politika `update-crypto-policies --show`.
- Satellite'ta host'u hedef sürümün CV/activation key'ine taşı `[SAHA]` (kurum düzeni).

## Yapmayacakların

- ENGEL'i "uyarı" diye geçme; `leapp-rapor.py` çıkış 1 iken `leapp upgrade` önerme.
- Snapshot/yedek doğrulanmadan production'da `leapp upgrade`; pilotsuz toplu yükseltme (kurum: az denendi).
- IdM sunucusunda, Satellite/Capsule'de (kendi yordamı dışında), AAP kurulu sistemde Leapp.
- Hedef repoyu minor sürümsüz ("9") etkinleştirmek; CV'yi publish/promote etmeden hostu yükseltmeye çalışmak.
- Yol tablosunu ve paket sürümlerini ezberden yazmak — §1/§5 belgeden (tarihli); belge yenilendiyse tazele.
