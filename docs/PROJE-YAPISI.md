# Proje Yapısı — Ne Nereye Konur

Alp'in kuralı (2026-09-15): *"Hazırladığım şeyler, yetenekler ve hafıza gibi özellikler projenin içinde gömülü olsun;
hepsine umumi olan şeyleri ayrı (global) yerde yaparım. Tüm çalışmalar çalışma alanında olabilir."*

opencode bu kuralı **birebir** destekliyor. Kaynak: opencode docs (rules / skills / commands / agents / config).

## Temel ilke

- **Global** (`~/.config/opencode/…`) = **her dizinde** geçerli. `kur.sh` bunu kurar.
- **Proje** (`<proje>/…`) = o dizinde **ve alt dizinlerinde** geçerli.
- İkisi **birleşir (additive)** — proje dosyası global'i **silmez**, üstüne eklenir.
- Proje tarafı, açılış dizininden **git worktree köküne** kadar yukarı taranır → proje köküne koymak yeterlidir.
- Kalıcılık için **yazılı** olmalı: sohbette söylenen şey oturumla gider, dosyaya yazılan kalır.

## Yerleşim tablosu

| Ne | Global (her proje) | Proje (o dizin) |
|---|---|---|
| Kural / hafıza | `~/.config/opencode/AGENTS.md` | `<proje>/AGENTS.md` |
| Ayar / izin | `~/.config/opencode/opencode.json` | `<proje>/opencode.json` |
| Beceri (skill) | `~/.config/opencode/skills/<ad>/SKILL.md` | `<proje>/.opencode/skills/<ad>/SKILL.md` |
| Komut | `~/.config/opencode/commands/<ad>.md` | `<proje>/.opencode/commands/<ad>.md` |
| Agent | `~/.config/opencode/agent/<ad>.md` | `<proje>/.opencode/agent/<ad>.md` |
| Veri / üretim | — | proje içi normal klasörler (`inventories/`, `baseline/`, `reports/`) |
| Claude Code uyumluluğu | `~/.claude/CLAUDE.md`, `~/.claude/skills/` | `CLAUDE.md`, `.claude/skills/` |
| Ek uyumluluk | `~/.agents/skills/` | `.agents/skills/` |

Notlar:
- Skill adı klasör adıyla **aynı** olmalı (`^[a-z0-9]+(-[a-z0-9]+)*$`); frontmatter'da `name` + `description` zorunlu.
- Skill'ler **talep üzerine** yüklenir: agent önce sadece ad+açıklama görür, gerekince `skill({name})` ile tam içeriği okur → bağlam şişmez.
- `opencode.json`'daki `instructions: [...]` listesi **eklemelidir** (AGENTS.md'ye ilave dosyalar/glob'lar).

## Hafıza (memory) karşılığı

opencode'da Claude Code'daki `#` ile hafızaya ekleme kısayolu **yok**. Kalıcı hafıza = **dosya**:

1. **En basit:** `<proje>/AGENTS.md` içinde bir `## Proje notları` bölümü.
   Agent'a *"bunu AGENTS.md'deki proje notlarına ekle"* dediğinde oraya yazar, sonraki açılışta okunur.
2. **Ayrı dosya:** `<proje>/PROJE-NOTLAR.md` + `<proje>/opencode.json`:
   ```json
   { "$schema": "https://opencode.ai/config.json", "instructions": ["PROJE-NOTLAR.md"] }
   ```
3. Aynı mantık **global** hafıza için: `~/.config/opencode/AGENTS.md` (kur.sh'ın kurduğu dosya; elle düzenlemek
   yerine `engine/AGENTS.md` kaynağı güncellenir).

## Örnek proje iskeleti

```
~/ansible/dns-ntp-splunk/
├─ AGENTS.md                  # projeye özel kurallar + notlar  (global'e EKLENİR)
├─ opencode.json              # (opsiyonel) instructions / izin ince ayarı
├─ .opencode/
│  ├─ skills/<ad>/SKILL.md    # sadece bu projede geçerli yetenek
│  └─ commands/<ad>.md        # sadece bu projede geçerli komut
├─ inventories/               # envanterler burada (proje içi → izin kapısı çıkmaz)
├─ playbooks/
├─ roles/
├─ group_vars/
└─ baseline/                  # ölçüm/rapor çıktıları
```

Kullanım: `cd ~/ansible/dns-ntp-splunk && oc`

## "Umumi" olunca ne olur

Projede olgunlaşan beceri/kural **global'e terfi eder**:
`<proje>/.opencode/skills/<ad>/` → paketin `knowledge/skills/approved/<ad>/` altına alınır → `kur.sh` ile
kurulur → **tüm projelerde** hazır olur. (Bu taşıma bir **Doktor** kalemidir; proje tarafı Alp'in çalışma alanında kalır.)

## İş tipi → klasör + beceri (Alp'in çalışma düzeni)

Tüm çalışmalar tek çalışma alanında (`~/ai/work/`) durabilir; ayrım **klasör** düzeyinde yapılır.

| İş tipi | Klasör | Hazır beceri | Not |
|---|---|---|---|
| Envanter üretimi | `~/ai/work/envanter/` | `ansible` + `rapor-uret` / `rapor-excel-pdf` | kaynak Excel/CSV → `inventories/*.ini` + `rapor/*.md` |
| Ansible playbook'ları | `~/ai/work/ansible/<iş>/` | `ansible` | her playbook seti kendi alt klasöründe |
| Disk genişletme / LVM | `~/ai/work/ansible/disk-genisletme/` (veya tek seferlik oturum) | `depolama`, `disk-ekleme` | `disk-ekleme` varsayılan kurulumda **yok** |
| Rancher / K8s teşhis | `~/ai/work/rancher-k8s/` | `k8s-rancher` | `KUBECONFIG=/etc/rancher/rke2/rke2.yaml` |
| Filo kontrolü (SSH) | `~/ai/work/filo/` | `filo-durum-kontrolu` | aşağıya bak → izin kapısı çıkar |
| Splunk forwarder | `~/ai/work/ansible/splunk-forwarder/` | `splunk-forwarder` | varsayılan kurulumda **yok** |
| Baseline / ölçüm | `~/ai/work/baseline/` | (yapılacak) | yöntem skill olarak pakete girecek |

**Beceri kurulumu:** varsayılan olarak 10 çekirdek beceri kurulur
(`ansible k8s-rancher rhel-yonetim filo-durum-kontrolu rapor-uret rapor-excel-pdf hata-ayikla performans sistem-guncelleme depolama`);
tümünü (38) kurmak için `./kur.sh --tum-beceriler`. Pencere 256K olduğu için bağlam kaygısı yok.

**SSH / uzak sistem notu (önemli):** İzin listesinde salt-okunur yerel komutlar var
(`ls cat head tail wc file stat pwd whoami hostname uname uptime date df du free ps pvs vgs lvs lsblk blkid
git status/log/diff/show/branch grep rg find journalctl "systemctl status" ss "ip a" "ip addr" "ip route" mount`).
`ssh*`, `ansible*`, `kubectl*`, `hammer*` **bilerek yok** → uzak/canlı sistemde her seferinde izin kapısı çıkar.
Pratik: iş klasörünün içinde `oc --auto` (deny kuralları yine uygulanır) ya da kapıda **Allow always**.
Bu, paketin çalışma disipliniyle uyumludur: canlı üretimde otomatik uzak komut çalıştırılmaz.

## Alp'in onayladığı çalışma yapısı (2026-09-15)

```
~/ai/work/            # ana dizin — tüm projelere buradan ulaşılır
├─ envanter/          # sadece envanter işleri (not/yetenek opsiyonel)
├─ ansible/           # tüm playbook'lar
└─ baseline/          # ayrı çalışma (mevcut, devam ediyor)
```

Kurallar (karışıklığı önleyen 4 madde):

1. **Her iş tipi = bir klasör.** Daha fazlasına gerek yok; 2 seviyeden derine inme.
2. **Oturumu işin klasöründe aç** (`cd ~/ai/work/envanter && oc`) → kapsam daralır; dizin dışına çıkarsa izin ister.
   Ana dizinde açarsan agent tüm projelere uzanabilir.
3. **Proje içine `AGENTS.md` / yerel beceri koymak opsiyonel** — global kurallar ve beceriler zaten her yerde geçerli.
   Yalnızca o projeye özel bir kural/akış varsa ekle.
4. **Programda değişiklik/ayar gerekmez.** Bu düzen tamamen kullanıcı tarafıdır; opencode hangi dizinde açılırsa orayı kapsam alır.

## Önerilen iskelet (2026-09-15 — Alp onayı)

```
~/ai/work/
├─ envanter/{kaynak,inventories,rapor}     # sunucu listesi → envanter + rapor
├─ ansible/{playbooks,roles,inventories}   # tüm playbook'lar
└─ baseline/                               # DOKUNULMAZ (mevcut çalışma)
```

Kurulum komutları — **yalnızca eksik klasörü yaratır**, hiçbir şeyi silmez, üzerine yazmaz:

```bash
cd ~/ai/work
mkdir -p envanter/kaynak envanter/inventories envanter/rapor
mkdir -p ansible/playbooks ansible/roles ansible/inventories
ls -la ~/ai/work
```

Opsiyonel proje notu/hafıza dosyası (dosya zaten varsa **dokunmaz**):

```bash
[ -f envanter/AGENTS.md ] || printf '%s\n' '# Envanter projesi' '' '## Proje notları' > envanter/AGENTS.md
```

**Kayıp riski yok:** `mkdir -p` mevcut klasör/dosyaya dokunmaz; `mv`, `rm`, üzerine yazma **yoktur**.
`baseline/` klasörü hiç ellenmez; mevcut çalışma olduğu gibi kalır. (Doğrulama: komuttan önce ve sonra `ls -la ~/ai/work` → fark yok.)

## Çıktı biçimleri — Excel / PDF (2026-09-15)

Beceri: `rapor-excel-pdf` (pakette **var**, varsayılan **10 çekirdek** beceri içinde de **var**, 2026-09-15).

| İstek | Durum | Not |
|---|---|---|
| **.xlsx okuma** | ✅ hiçbir şey gerekmez | Agent `.xlsx`/`.xlsm`'i doğrudan Read ile açar → Excel girdi olarak verilebilir, CSV'ye çevirmek şart değil |
| **.xlsx üretme** | ✅ `openpyxl` ile | İlk adım: kurulu mu diye **ölçmek** (`importlib.util.find_spec`); yoksa kendiliğinden kurmaz, kullanıcıya söyler |
| **.pdf üretme** | ⚠️ kurulum gerektirir | Minimal RHEL 10'da pandoc/wkhtmltopdf/weasyprint/libreoffice/ps2pdf + python fpdf/reportlab = **yok** |

**PDF için iki yol:**
1. **HTML üret → tarayıcıda “Yazdır → PDF”** — kurulum yok, önerilen (`rapor-uret` becerisi).
2. `fpdf2` kur (saf Python wheel, derleme yok). **Kurumda paket kurmak onay/değişiklik kaydı ister.**

**PDF Türkçe font tuzağı:** hazır fontlar latin-1 → `ş ğ İ` hata verir. Unicode TTF gerekir; **yolunu sabit yazma**, ara:
`find /usr/share/fonts -name "*.ttf" | head`. (`dejavu-sans-fonts` baseos'ta, EPEL gerekmez.)

**Beceriyi kurma:** varsayılan `./kur.sh` artık yeterli — `rapor-excel-pdf` 10 çekirdek beceri içinde
(2026-09-15'ten beri). Elle `cp -r knowledge/skills/approved/<ad> ~/.config/opencode/skills/`
**geçicidir** — `kur.sh` beceri dizinini baştan yazdığı için sonraki çalıştırmada silinir; tek bir
becerinin kalıcı kurulumu için henüz `--beceri <ad>` gibi bir bayrak yok, ya varsayılan/`--tum-beceriler`
kullanılır ya da `CORE_SKILLS` dizisi elle düzenlenir.

## Hızlı doğrulama

- Agent'a sor: *"Şu an hangi kural dosyaları yüklendi?"* (payload'da `Instructions from: <yol>` satırları olarak görünür).
- Proje kuralı uygulanmıyorsa kontrol: dosya adı `AGENTS.md` mi? doğru dizinde mi (proje kökü)? git worktree içinde mi?
