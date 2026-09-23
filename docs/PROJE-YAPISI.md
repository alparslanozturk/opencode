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
3. Aynı mantık **global** hafıza için: `~/.config/opencode/AGENTS.md` (`kur.sh`'ın kurduğu dosya; elle düzenlemek
   yerine `engine/AGENTS.md` kaynağı güncellenir).

## Örnek proje iskeleti

> **Gerçek kök (Alp, 2026-09-19):** <saha-makinesi>'te çalışma kökü `/root/ai/work/opencode/` — her
> proje bunun **doğrudan altında** (`projeler/` gibi bir ara katman yok). İlk proje: `envanter/`
> (`/root/ai/work/opencode/envanter/`, Faz 0'ın ilk görevi). Aşağıdaki iskelet genel kalıptır,
> `<proje-adi>` yerine gerçek adı (`envanter`, vb.) koy.

```
/root/ai/work/opencode/<proje-adi>/
├─ AGENTS.md                  # projeye özel kurallar + notlar  (global'e EKLENİR)
├─ opencode.json              # (opsiyonel) instructions / izin ince ayarı
├─ .opencode/
│  ├─ skills/<ad>/SKILL.md    # sadece bu projede geçerli yetenek
│  └─ commands/<ad>.md        # sadece bu projede geçerli komut
├─ inventories/               # envanterler burada (proje içi → izin kapısı çıkmaz)
├─ ansible/                   # ansible görevi olan projelerde: playbooks/, roles/, group_vars/, baseline/
└─ baseline/                  # ölçüm/rapor çıktıları (ansible yoksa proje kökünde)
```

Kullanım: `cd /root/ai/work/opencode/<proje-adi> && oc` (örn. `cd /root/ai/work/opencode/envanter && oc`)

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
park edilmiş bir beceri gerekiyorsa `knowledge/skills/parked/<ad>`'ı `approved/`'a taşıyıp
`./kur.sh`'ı tekrar çalıştır. Pencere 256K olduğu için bağlam kaygısı yok.

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
**geçicidir** — `kur.sh` beceri dizinini baştan yazdığı için sonraki çalıştırmada silinir; bir becerinin
kalıcı kurulumu `knowledge/skills/approved/` + `CORE_SKILLS` dizisi üzerinden yapılır.

## Sürüm / derleme notu (2026-09-22 → 1.0.1)

- **Ürün sürümü 1.0.1.** Derleme bayrağı: `packages/opencode/script/build.ts` → `Bun.build(...)`
  çağrısı **`splitting: false`** kullanır. Gerekçe: tek-dosya `bun build --compile` çıktısında kod
  bölme (`splitting: true`) dairesel import'ların değerlendirme sırasını bozuyor →
  `SystemPrompt.environment`'da `TypeError: undefined is not an object (evaluating 'a.name')`
  çökmesi. Düzeltme `cca807db28`, ek savunma guard'ı (bozuk `reference` girdisi) `9ad34675c6`;
  olay kaydı: `knowledge/incidents/2026-09-22-derlenmis-ikili-a-name-cokmesi.md`.
  (Ürün sürümü 1.0.1 ↔ vendor `opencode` 1.18.30 ayrımı `MIMARI.md`'de.)
- **Tek giriş noktası:** kökte `./kur.sh <derle|kur|kontrol|yardim>`; eski `01/02/03` betikleri
  **kaldırıldı**.
- **Kökte yalnız `kur.sh`** (tek `.sh` dosyası). `bin/` içinde git'e giren **tek dosya**
  `ripgrep.tar.xz`; `bin/opencode` `.gitignore`'da — repoya girmez, **yalnız derleme önbelleğidir**
  (ürün çıktısı değil), her `kur.sh derle` çalıştırmasında tazelenir.
- **Node header izleme notu:** `node-v24.19.0-headers.tar.gz` depoda izlenir (offline `node-gyp`
  için); `kur.sh` gerekirse `node-v24.19.0-headers` sembolik bağını kurar, elle konulmuş gerçek
  dizine dokunmaz.

## Hızlı doğrulama

- Agent'a sor: *"Şu an hangi kural dosyaları yüklendi?"* (payload'da `Instructions from: <yol>` satırları olarak görünür).
- Proje kuralı uygulanmıyorsa kontrol: dosya adı `AGENTS.md` mi? doğru dizinde mi (proje kökü)? git worktree içinde mi?
