---
name: rhel-aide
description: RHEL sunucularda AIDE (dosya bütünlüğü / file integrity) durumunu yalnız okuyarak ölçerken ve devreye almayı tasarlarken kullan — kurulu mu, veritabanı var mı, zamanlı kontrol var mı, NFS/CIFS bağlaması AIDE kapsamına giriyor mu (deterministik `aide-ozet.py`); istisna yazımı (`!`, `-`, dosya sistemi türü kısıtı `=0x6969`), `--path-check` ile doğrulama, CIS 6.1.x karşılığı. "aide", "dosya bütünlüğü", "file integrity", "fim", "bütünlük kontrolü", "aide.conf", "aide istisna", "aide nfs" isteklerinde tetiklenir. SEP/XDR/Defender istisnaları `rke2-edr`; CIS taraması `rhel-cis`.
---

# AIDE — dosya bütünlüğü: ölç, istisnayı tasarla, devreye al

Kaynak etiketi: **(Alp)** kurum bilgisi · **(RH)** RHEL 10 *Security hardening* Bölüm 7 "Checking integrity with AIDE" ·
**(man)** `aide.conf(5)` / `aide(1)`, aide-0.19.2-4.el10_2.1 paketinden okundu (AlmaLinux 10.2 deposu, 2026-11-04 — RHEL'de
`rpm -q aide` ile sürümü doğrula) · **(CIS)** `rhel-cis/veri/cis-kural.tsv` · **(genel)** sahada doğrulanmadı.

## 0. Kurum durumu (Alp, 2026-11-04)

- AIDE **henüz aktif değil**. Paket RHEL ile gelir (AppStream). RHEL 10 şablonunda kurulu gelmesi düşünülüyor (plan — `[SAHA]`).
- CIS Level 1 bunu ister (CIS): 6.1.1 *AIDE is installed* (`package_aide_installed`, `aide_build_database`) · 6.1.2 *filesystem
  integrity is regularly checked* (`aide_periodic_cron_checking`) · 6.1.3 *audit araçlarının bütünlüğü* (`aide_check_audit_tools`).
  AIDE yokken bu maddelerin fail olması **beklenen** durumdur — bulgu değil, `rhel-cis` raporunda "kurum planı" bilgisi.
- AV/EDR ile ilişki: SEP her sunucuda; Cortex XDR k8s worker/control-plane node'larından kaldırıldı, orada Prisma Cloud (Twistlock)
  Defender var (Alp). Aynı yollar (NFS, data, container) ajanlarda da istisna konusu — `rke2-edr`.

## 1. Önce sor (tek mesaj, numaralı — oturumda cevabı varsa sorma)

1. Hangi sunucular / grup? (envanter dosyası + grup)
2. Amaç: yalnız **durum ölçümü** mü, **devreye alma tasarımı** mı? (ikincisi değişikliktir — §3, adım onayı)
3. Sunucu rolü: NFS istemcisi mi, veritabanı mı, k8s node'u mu, GPU/AI veri sunucusu mu? İstisna listesi role göre değişir.

## 2. Ölç — salt-okunur, filo

```bash
B=/root/ai/opencode/knowledge/skills/approved
python3 $B/rhel-aide/aide-ozet.py komut        # sunucuda çalışacak komutu basar (yalnız okur: rpm, stat, grep, findmnt, cat aide.conf)
ansible <grup> -i <envanter> -m raw -f 30 -T 5 --task-timeout 60 -t cikti/filo/aide -a '<basılan komut>'
python3 $B/rhel-aide/aide-ozet.py cikti/filo/aide --grup <grup> -i <envanter>
```

Tek sunucu: `ssh root@<sunucu> '<basılan komut>'` çıktısı okunur. Betik **aynen aktarılır**:

| Durum | Anlamı | CIS |
|---|---|---|
| AIDE kurulu değil | paket yok | 6.1.1 fail |
| kurulu, veritabanı yok | `aide --init` yapılmamış ya da `.new` adı değiştirilmemiş | 6.1.1 fail |
| veritabanı var, zamanlı kontrol yok | cron/timer'da `aide` yok | 6.1.2 fail |
| çalışıyor | paket + veritabanı + zamanlama | — |

Son sütun: sunucudaki NFS/CIFS bağlamaları ve parantezde **AIDE kapsamına girenler**. Hesap betikte: `aide.conf` seçim satırları
(`/` `=` olumlu, `!` `-` olumsuz, `=<fs>` kısıtı) bağlamanın içindeki bir yola uygulanır. Bu bir **tahmin**dir (regex eşleşmesi);
kesin cevap sunucuda: `aide --path-check f=nfs:/<bağlama>/x` (man: 0 = veritabanına girer, 1 = girmez; 0.17+, fs türü 0.19+).

Varsayılan RHEL 10 `aide.conf`'u (man paketi) `/opt`, `/usr`, `/etc`, `/root`, `/boot`, `/var/log` gibi yolları seçer; `/data` gibi
kurum dizinlerini seçmez. Yani `/data` altındaki NFS varsayılan ayarda taranmaz, `/opt/...` altındaki taranır.

## 3. Devreye alma tasarımı (değişiklik — her adım ayrı onay)

Sıra önemli: **istisnalar `--init`'ten önce** yazılır, yoksa ilk veritabanı ağ paylaşımını ve veri dizinlerini de okur.

**İstisna sözdizimi (man):**
- `!<regex>`: eşleşen dışlanır, alt dizinlere yine inilir (çocuk da eşleşmeliyse dışlanır). `-<regex>` (0.19): dışlanır, **alt
  dizinlere inilmez** — büyük veri dizini için doğru seçim.
- Regex başında örtük `^` var, her desen `/` ile başlar. Nokta kaçırılır: `!/var/log/messages\.[0-9]$` (`.*` boş ekle de eşleşir — AIDE kılavuzu).
- **Dosya sistemi türüne göre (0.19, Linux):** `!/ =0x6969` → hangi yolda olursa olsun NFS'deki her şey dışlanır. Sihirli sayıyı
  sunucudan oku: `stat -f -c '%t %T' <bağlama>` (ör. `6969 nfs`). Ad da yazılabilir; desteklenen adlar `aide --version` çıktısında.
- Ek dosya: `@@include <dizin> <regex>` (0.17+) ile `/etc/aide.conf.d/` gibi ayrı bir dosyada tutmak ana dosyayı paket
  güncellemesinde çakışmadan korur (genel — RHEL varsayılanında bu dizin yok, eklemek değişikliktir).

**İstisna adayları — rol başına (her satır kullanıcıya sorulur, gerekçesiyle kurum istisna kaydına girer):**

| Yol | Neden | Telafi edici kontrol (öneri) |
|---|---|---|
| NFS/CIFS bağlamaları | içerik ağdan okunur, her kontrolde ağ + sunucu yükü; değişiklik dosyanın sahibi sunucuda izlenir | NFS sunucusunda bütünlük/denetim (genel) |
| Veritabanı veri dizinleri (`[SAHA]` yol) | sürekli değişir — her gün yüzlerce değişiklik alarmı (genel) | DB'nin kendi denetim izi, `auditd` yapılandırma dosyası izleme |
| `/var/lib/containerd`, `/var/lib/kubelet`, `/var/lib/rancher` (k8s node) | imaj katmanları/pod hacimleri sürekli değişir (genel) | imaj imzası/registry, Defender runtime |
| AI veri/model dizinleri (GPU sunucusu) | çok büyük dosyalar — hash süresi ve I/O (genel) | dizin sahibi/izin denetimi (`auditd -w`) |

İstisna listesi uydurulmaz: yol sunucuda var mı (`findmnt`, `ls -d`) ölçülür, hangi uygulamanın olduğu kullanıcıya sorulur.

**Adımlar (RH; komutlar değişiklik — onay al):**
1. `dnf install aide` (AppStream).
2. İstisnaları yaz → `aide --config-check` (yazım denetimi) → seçili yolda `aide --path-check` ile tek tek doğrula.
3. `aide --init` → `mv /var/lib/aide/aide.db.new.gz /var/lib/aide/aide.db.gz`. İlk init seçilen her dosyayı okur — önce **bir
   sunucuda** süreyi ölç, büyük sunucuda mesai dışı (genel).
4. Zamanlama: RH örneği `/etc/crontab` → `05 4 * * * root /usr/sbin/aide --check` (en az haftalık, tercihen günlük — RH).
5. **Yama sonrası** `aide --update` + aynı `mv` — yoksa her güncelleme yanlış alarm üretir (RH). `rhel-guncelleme` akışına bağla.
6. Filo için RH yolu: `rhel-system-roles.aide` rolü (`aide_init`, `aide_cron_check`, `aide_cron_interval`, `aide_db_fetch_dir` —
   veritabanını kontrol düğümüne çeker; değişkenler `/usr/share/ansible/roles/rhel-system-roles.aide/README.md`). Veritabanının
   sunucu dışında kopyası olması, sunucuya giren birinin veritabanını da değiştirmesine karşı korur (genel).

## 4. Cevap biçimi

```
AIDE durumu (<grup>, N sunucu): çalışıyor A · veritabanı yok B · zamanlama yok C · kurulu değil D · erişilemedi E
Ağ bağlaması kapsamda: <sunucu> <yol> … (tahmin — path-check ile doğrula)
CIS: 6.1.1/6.1.2 karşılığı … (kurum planı: AIDE henüz aktif değil — Alp)
```

## Yapmayacakların

- `aide --init` / `--update` / `--check`'i sormadan çalıştırma: init ve check tüm seçili dosyaları okur (I/O), init/update dosya yazar.
- `aide.conf` düzenleme, cron ekleme — değişiklik, adım onayı (`ansible` becerisi akışı).
- İstisna yolunu ya da gerekçesini uydurma; "bu dizin DB'dir" demek için sunucudan kanıt (süreç, paket) ya da kullanıcının sözü gerekir.
- Kısıtlı kuralı (`=<fs>`) 0.19'dan eski AIDE'ye yazma — RHEL 9'daki sürümü önce `rpm -q aide` ile oku.
