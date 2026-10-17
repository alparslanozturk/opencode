---
name: rapor
description: Toplanan veriyi rapora/dosyaya dökerken kullan — biçim seçimi, CSV ve HTML (bağımlılıksız), Excel (xlsx) ve PDF (bağımlılık kontrolü, çevrimdışı kurulum, Türkçe font), sayı/birim tutarlılığı. "rapor", "envanter raporu", "csv çıkar", "tabloya dök", "dosyaya yaz", "html rapor", "excel", "xlsx", "pdf üret", "pdf dosyası", "openpyxl", "rapor pdf olsun" isteklerinde tetiklenir.
---

Bu beceri iki bölüm: **A. Biçim, CSV, HTML** ve **B. Excel ve PDF**.

## A. Biçim, CSV, HTML

Doğrulandı: AlmaLinux 10.2 (python 3.12) ve macOS — 2026-08-29

### Biçimi seçerken

| Biçim | Bağımlılık | Ne zaman |
|---|---|---|
| **CSV** | yok (stdlib `csv`) | Varsayılan. Excel açar, script işler, her yerde çalışır. |
| **HTML** | yok | Zengin görünüm gerekiyorsa. Tarayıcıdan yazdır → PDF. |
| **XLSX** | `openpyxl` | Çok sayfa, biçimlendirme, süzme gerekiyorsa |
| **PDF** | kurulum gerektirir | Gerçekten PDF *dosyası* isteniyorsa |

**Kullanıcı biçim belirtmediyse CSV üret.**

**"PDF olsun" denince önce HTML öner.** Ölçüldü: minimal bir RHEL 10 sunucuda
`pandoc`, `wkhtmltopdf`, `weasyprint`, `libreoffice`, `ps2pdf` **hiçbiri
kurulu değil** ve hiçbir Python PDF kütüphanesi yok. HTML üretip tarayıcıdan
yazdırmak çoğu ihtiyacı bağımlılıksız karşılar. Kullanıcı gerçekten dosya
istiyorsa **B. Excel ve PDF** bölümüne geç.

Bağımlılık gerektiren bir biçim istendiğinde **önce kurulu mu bak**:

```bash
python3 -c "import openpyxl; print(openpyxl.__version__)"
```

Kurulu değilse ve ortam çevrimdışıysa kendiliğinden `pip install` deneme —
başarısız olur. Kullanıcıya söyle, CSV ya da HTML öner.

### CSV

Türkçe karakter ve Excel uyumu için `utf-8-sig` kullan — düz `utf-8` ile
Excel Türkçe harfleri bozuk gösterir.

```python
import csv

satirlar = [
    {"sunucu": "web01", "durum": "senkron", "sapma_ms": 12},
    {"sunucu": "db02", "durum": "SORUN", "sapma_ms": 4200},
]

with open("ntp_durum.csv", "w", newline="", encoding="utf-8-sig") as f:
    yazici = csv.DictWriter(f, fieldnames=list(satirlar[0]))
    yazici.writeheader()
    yazici.writerows(satirlar)
```

Ayraç: Türkçe Excel kurulumları genelde `;` bekler. Kullanıcı Excel'de
açacaksa `delimiter=";"` ver ya da sor.

### HTML — bağımlılıksız ve yazdırılabilir

```python
html = f"""<!doctype html><html><head><meta charset="utf-8">
<title>NTP Durum Raporu</title>
<style>
 body {{ font-family: sans-serif; margin: 2rem; }}
 table {{ border-collapse: collapse; }}
 th, td {{ border: 1px solid #ccc; padding: 6px 10px; }}
 th {{ background: #eee; text-align: left; }}
 .sorun {{ background: #fdd; }}
 @media print {{ .sorun {{ background: #fdd !important;
                           -webkit-print-color-adjust: exact; }} }}
</style></head><body>
<h1>NTP Durum Raporu</h1>
<p>2026-08-29, <code>chronyc sources</code> çıktısından üretildi.</p>
<table><tr><th>Sunucu</th><th>Durum</th><th>Sapma</th></tr>
{"".join(
  f'<tr class="{"sorun" if s["durum"]=="SORUN" else ""}">'
  f'<td>{s["sunucu"]}</td><td>{s["durum"]}</td><td>{s["sapma_ms"]} ms</td></tr>'
  for s in satirlar)}
</table></body></html>"""
open("ntp_durum.html", "w", encoding="utf-8").write(html)
```

`@media print` bloğu olmadan tarayıcı arka plan renklerini basmaz; sorunlu
satırlar çıktıda kaybolur.

Veri kullanıcıdan ya da komut çıktısından geliyorsa HTML'e gömmeden önce
kaçır (`html.escape`), yoksa tablo bozulur.

### Sayı ve birim tutarlılığı (M-1)

Gerçek bir özette şu ikisi aynı tabloda yan yana yaşandı, ikisi de fark
edilmeden rapora girdi:
- Bir sütunda bellek MB, başka bir satırda GB — sayılar ~2000× farklı
  görünüyordu ama birim yazılmadığı için kimse fark etmedi.
- Özet satırı "toplam 52 (34+18)" derken, altındaki envanter tablosu 75
  kayıt gösteriyordu — toplam, parçaların toplamıyla hiç karşılaştırılmamış.

Bunun tekrarını önlemek için her rapor/özet tablosunda:

1. **Her sayısal sütunda birim açık yazılsın** (MB/GB, node/master, sn/dk).
   Birim başlıkta bir kez yazılıyorsa tüm sütun aynı birimde olmalı —
   satır satır MB/GB karıştırma.
2. **Aynı büyüklüğü iki farklı birimle yan yana yazma.** Kaynaklar farklı
   birimde geliyorsa (biri `kubectl top` MiB, biri `free -h` GB gibi)
   yazmadan önce TEK birime çevir.
3. **Toplam satırı varsa çapraz kontrol et:** üstteki genel toplam, alttaki
   kalemlerin toplamına eşit olmalı. Elle topla, eşleşmiyorsa raporu
   göndermeden ÇÖZ.
4. **Rapor tek kaynaktan beslenmiyorsa (birden çok komut/host'tan veri
   birleştiriliyorsa) hangi sayının nereden geldiğini belirt** — aksi
   halde bir komutun eski/kısmi çıkışı fark edilmeden karışır.
5. Çelişki bulup çözemediysen sessizce görmezden gelme; satırın başına
   `⚠ tutarsız:` yazıp neyin neyle uyuşmadığını tek satırda açıkla.

### Her zaman

- Dosyayı **nereye** yazdığını mutlak yolla söyle
- Satır sayısını ve sorunlu kayıt sayısını raporla
- Yazdıktan sonra dosyanın oluştuğunu doğrula: `ls -la <dosya>`
- Var olan raporun üzerine yazmadan önce sor; ada tarih ekle:
  `ntp_durum_2026-08-29.csv`
- Rapora **ne zaman ve hangi komutla** toplandığını yaz; altı ay sonra
  bakan kişi bilsin

## B. Excel (xlsx) ve PDF

Doğrulandı: AlmaLinux 10.2 (python 3.12) — 2026-08-29

### Önce ne kurulu, onu ölç

Bağımlılık ortamdan ortama değişiyor. Ölçülen bir örnek: aynı anda test-sunucu
sunucusunda `openpyxl` **var** ama `pandas` yok; geliştirme makinesindeki
sanal ortamda tam tersi. Varsayma, bak:

```bash
python3 - <<'EOF'
import importlib.util as u
for m in ["openpyxl", "fpdf", "reportlab", "pandas"]:
    print(m.ljust(10), "VAR" if u.find_spec(m) else "YOK")
EOF
```

Yoksa ve ortam çevrimdışıysa **kendiliğinden kurma** — kullanıcıya söyle ve
aşağıdaki yordamı öner.

### Var olan bir .xlsx'i okumak — Read yeter

Bir `.xlsx`'in içindeki değerleri görmek için kod yazma: `Read` aracı `.xlsx`/
`.xlsm`'i doğrudan açıp hücre değerlerini `## SayfaAdı` başlıklı tablo olarak
verir (openpyxl varsa onunla, yoksa stdlib zipfile+xml). Dosyayı `zipfile` ile
açıp iç XML'i listeleme — bir tur boşa gider.

**Birim tutarsızlığına dikkat (G-01).** Kurumun küme raporunda `Toplam Memory`
sütunu sayfadan sayfaya farklı birimde olabiliyor (KUME-B = MB, KUME-A = GB).
Memory ile hesap/karşılaştırma yapacaksan önce birimi tek tabana çevir.

### Excel (xlsx) — `openpyxl`

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active
ws.title = "NTP Durum"

basliklar = ["Sunucu", "Durum", "Sapma (ms)"]
ws.append(basliklar)
for h in ws[1]:
    h.font = Font(bold=True)

for s in satirlar:
    ws.append([s["sunucu"], s["durum"], s["sapma_ms"]])

ws.freeze_panes = "A2"                      # başlık sabit kalsın
ws.auto_filter.ref = ws.dimensions          # süzme açık
for i, _ in enumerate(basliklar, 1):
    ws.column_dimensions[get_column_letter(i)].width = 18

kirmizi = PatternFill("solid", start_color="FFC7CE")
for satir in ws.iter_rows(min_row=2):
    if satir[1].value == "SORUN":
        for h in satir:
            h.fill = kirmizi

wb.save("ntp_durum.xlsx")
```

Sayıları metin olarak yazma — `4200` yaz, `"4200 ms"` değil. Birim başlığa
girer; yoksa Excel'de sıralama ve toplama çalışmaz.

### PDF — önce şunu bil

**Minimal RHEL 10'da PDF üretecek hiçbir şey yok.** Ölçüldü: `pandoc`,
`wkhtmltopdf`, `weasyprint`, `libreoffice`, `ps2pdf` kurulu değil; Python
tarafında da `fpdf`, `reportlab` yok.

Yani PDF her zaman **bilinçli bir kurulum** demektir. Kullanıcıya bunu söyle
ve iki seçenek sun:

1. HTML üret, tarayıcıdan yazdır → PDF. Kurulum yok. (bkz. A bölümü, HTML)
2. Gerçekten dosya gerekiyorsa `fpdf2` kur — saf Python, derleme gerektirmez.

`weasyprint` seçme: wheel'i saf Python ama çalışma anında `pango`, `cairo`,
`gdk-pixbuf` sistem kütüphanelerini arar; minimal RHEL'de zahmetlidir.

### PDF'te Türkçe font — kesin tuzak

`fpdf2`'nin yerleşik fontları latin-1'dir; `ş`, `ğ`, `İ` karakterlerinde
hata verir. Unicode bir TTF şart ve **yolunu sabit yazma**.

Ölçüldü: test-sunucu'ta `/usr/share/fonts/dejavu/` **yok**, `fc-list` de kurulu
değil. Bulunan tek şey `/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf`.
Bu yüzden fontu ara, varsay değil:

```bash
find /usr/share/fonts -name "*.ttf" | head          # RHEL
ls /System/Library/Fonts/Supplemental/*.ttf | head  # macOS
```

```python
from fpdf import FPDF

pdf = FPDF()
pdf.add_page()
pdf.add_font("govde", "", "<bulunan-ttf-yolu>")
pdf.set_font("govde", size=14)
pdf.cell(0, 10, "NTP Durum Raporu", new_x="LMARGIN", new_y="NEXT")

pdf.set_font("govde", size=9)
for s in satirlar:
    pdf.cell(0, 6, f"{s['sunucu']:12} {s['durum']:10} {s['sapma_ms']} ms",
             new_x="LMARGIN", new_y="NEXT")

pdf.output("ntp_durum.pdf")
```

DejaVu isteniyorsa `dejavu-sans-fonts` paketi **baseos** deposunda —
EPEL gerektirmez, Satellite'ta hazır bulunur.

### Çevrimdışı kurulum

İki yol var; kurumda hangisinin serbest olduğunu kullanıcıya sor.

**RPM (Satellite üzerinden, tercih edilen):**

```bash
dnf list --available python3-openpyxl python3-reportlab
```

Ölçüldü: ikisi de **EPEL** deposunda. Kurumun Satellite'ında EPEL senkron
değilse bu yol kapalıdır — önce depo listesine bak.

**Wheel (internete çıkabilen bir makinede indir, taşı):**

```bash
pip download -d wheels openpyxl fpdf2
# hedef makinede:
pip install --no-index --find-links wheels openpyxl fpdf2
```

İkisi de saf Python wheel; platform ve Python sürümü belirtmeye,
derlemeye gerek yok.

**Paket kurmak yan etkilidir — onay al.** Banka ortamında sunucuya paket
kurmak değişiklik kaydı gerektirebilir.
