---
name: rapor
description: Toplanan veriyi rapora/dosyaya dökerken kullan — betik CSV'sinden değerlere dokunmadan HTML/XLSX: deterministik `tablo-cevir.py`; biçim seçimi, CSV ve HTML (bağımlılıksız), Excel (xlsx) ve PDF (bağımlılık kontrolü, çevrimdışı kurulum, Türkçe font), sayı/birim tutarlılığı. "rapor", "envanter raporu", "csv çıkar", "tabloya dök", "dosyaya yaz", "html rapor", "excel", "xlsx", "pdf üret", "pdf dosyası", "openpyxl", "rapor pdf olsun", "olay raporu", "ne yaptın pdf hazırla", "ekibe rapor" isteklerinde tetiklenir.
---

Bu beceri iki bölüm: **A. Biçim, CSV, HTML** ve **B. Excel ve PDF**.

## 0. Değerleri elle yazma — betik CSV'si → `tablo-cevir.py` (saha G22, M-1)

Rapordaki sayılar komut çıktısından geliyorsa onları Python koduna/HTML'e **elle yazma** (G22: değerler sunucular arasında kopyalandı,
yönetime gidecek kapasite raporu uydurma çıktı). Yol: CSV'yi deterministik betik üretir, çevirici değerlere dokunmadan biçimler:

```bash
python3 /root/ai/opencode/knowledge/skills/approved/filo-kontrol/filo-tablo.py cikti/filo/<etiket> --kv --csv rapor/<ad>_<tarih>.csv
python3 /root/ai/opencode/knowledge/skills/approved/rhel-performans/sar-ozet.py cikti/sar/<etiket> --csv-dosya rapor/kapasite_<tarih>.csv
python3 /root/ai/opencode/knowledge/skills/approved/rapor/tablo-cevir.py rapor/<ad>_<tarih>.csv --html rapor/<ad>_<tarih>.html --baslik "<başlık>" --kaynak "<komut/betik>"
python3 /root/ai/opencode/knowledge/skills/approved/rapor/tablo-cevir.py rapor/<ad>_<tarih>.csv --xlsx rapor/<ad>_<tarih>.xlsx --baslik "<başlık>" --kaynak "<komut/betik>"
```

`tablo-cevir.py`: CSV'yi (`;` ya da `,`) okur; HTML yazdırılabilir (sorunlu satırlar kırmızı, `@media print` dahil), XLSX'te sayılar
sayı, başlık sabit, süzme açık, ayrı "Kaynak" sayfası (openpyxl yoksa söyler, HTML öner). Vurgu: `durum` ≠ ok ya da `sapan_alanlar`
dolu satırlar; ya da `--vurgu <sütun>=<regex>`. Başlığa üretim zamanı + `--kaynak` + satır sayısı yazılır. Var olan dosyanın üzerine
yazmaz. Ölçüldü (2026-10-21): filo CSV → HTML 3 vurgulu satır; kapasite CSV → XLSX, `cpu_ort` hücresi float, openpyxl 3.1.5.
Aşağıdaki elle Python örnekleri yalnız betiği olmayan küçük, kullanıcının verdiği tablolar içindir.

## İş kaydı — `is-kaydi.py` (Alp, 2026-11-03)

Geçici saha işinin planı, kanıtı ve sonucu tek dizinde: `~/ai/work/is-kayitlari/<YYYYMMDD-HHMM>-<etiket>/` (`plan.md`, `okuma/`, `sonuc.md`).
Zamanla kurumun iş bilgi tabanı olur; kurum verisi içerir, sahada kalır.

```bash
K=/root/ai/opencode/knowledge/skills/approved/rapor/is-kaydi.py
python3 $K ac data-to-root --sunucular sxl1,sxl2 --istek "/data alanını köke ver"   # yolu basar
ssh root@<sunucu> 'df -h /; lsblk' | python3 $K ekle son <sunucu>-once            # okuma kanıtı
python3 $K sonuc son "<sunucu>: root 53G → 365G (df -h /)"                          # yalnız ölçülen
python3 $K liste data                                                               # eski benzer işler
```

`plan.md`'yi doldur: önce sor cevapları, okuma kanıtı (dosya adıyla), adımlar (her biri ayrı komut), risk/geri dönüş. Verilmeyen alan
"verilmedi" kalır. Betik yalnız bu köke yazar, var olan dosyanın üstüne yazmaz; kilitte onaysız.

**Biten oturumu kayda al, sonra listeden sil** (opencode 2.x'te arşiv yok; liste dizin başına, üst şeritteki sekme `ctrl+x w` ile
kapanır ve oturum listede kalır — geri `ctrl+shift+t`):

```bash
opencode session list                                         # oturum kimlikleri
opencode session export <id> | python3 $K ekle son oturum     # tam döküm kaydın okuma/ dizinine (sahada kalır)
opencode session delete <id>                                  # ya da listede ctrl+d (iki kez)
```

**`/kaydet`** (parametresiz, oturum sırasında ya da sonunda) — kurumsal bilgi dosyasını (`~/ai/work/opencode/kurumsal-bilgi.ini`, bölümler:
`knowledge/templates/kurumsal-bilgi.md`) bu oturumdan günceller: yedek alır, değişikliği edit onayında gösterir, sonda eklenen/güncellenen/
taşınan/çelişki tablosu; dosyayı her seferinde düzenler (bilgi silmez: tek seferlik iş "10. İş geçmişi"ne, çelişki ayrı bölüme). Bilgiyi `oturum-ozet.py` süzer (betik uygular, model değil):
- **Bilgi = kullanıcının sözü + komut çıktısı.** Ajanın yanıtı ve akıl yürütmesi özete hiç girmez (yanlış olabilir — G119/G120).
- **Düzeltme:** kullanıcı "hayır / yanlış / iptal …" dediyse önceki ajan sözü "bilgi DEĞİL, tekrarlama" diye ayrı bölümde.
- **Başarısız / reddedilen** komut (hata, çıkış ≠ 0, kilit reddi) ayrı bölümde — bilgi değil. Kullanıcının "sanırım/galiba" dediği
  satır "kullanıcı tahmini — doğrula" etiketli. Parola/token maskelenmez (Alp, 2026-11-03: yerel ortam).

Kayıttaki oturum dökümü ve `sonuc.md` "Dersler" bölümü kurumun hafızasıdır; model ağırlığı değişmez, model kendi kendine öğrenmez.
Yeni işte `is-kaydi.py liste <sözcük>` ile eski benzer iş bulunur, `plan.md`/`sonuc.md` okunur. Ders beceriye ancak Alp'in onayıyla
(bu depo üzerinden) girer.

## Olay raporu — işi başka ekibe anlatmak (Alp, 2026-11-05)

Saha: k8s sorunu çözüldükten sonra "ne yaptın, güzel bir PDF hazırlar mısın Büşra Hn. için" (uygulamanın sahibi DevOps ekibi).
Rapor kurum dışına çıkmaz ama **başka ekip buna göre karar verir** — sohbetteki ajan özeti (ör. "sebebi X, düzeltildi") kaynak değildir.

**Önce sor (tek mesaj, numaralı; oturumda cevabı varsa sorma):** 1) alıcı ve ekibi (hitap kullanıcının yazdığı gibi) · 2) kapsam:
küme, namespace, uygulama, zaman aralığı · 3) teknik ayrıntı düzeyi (yönetici özeti mi, komutlu teknik rapor mu) · 4) biçim: HTML →
tarayıcıdan PDF (kurulum yok, önerilen) ya da PDF dosyası (§B — kurulum ister).

**Kaynak:** her olgu bu oturumun komut çıktısından. Önce kanıtı süz, raporu ondan yaz:
```bash
opencode session list                                              # bu oturumun kimliği
opencode session export <id> | python3 /root/ai/opencode/knowledge/skills/approved/rapor/oturum-ozet.py - > olay-kanit.md
```
`olay-kanit.md`'de olmayan saat, pod adı, sayı rapora girmez; yalnız bulunan satırlar. Değişiklik komutları (`kubectl apply/delete/
patch`, `systemctl restart` …) ayrı listelenir — "yapılan değişiklikler" bölümü oradan.

**Bölümler (sırayla):**
1. **Özet** — 3 satır: ne bozuktu, ne yapıldı, şu anki durum (ölçülmüş: `kubectl get pod … -o wide` çıktısı).
2. **Etkilenen** — küme, namespace, deployment/pod, node, PVC (çıktıdaki adlarla).
3. **Zaman çizelgesi** — çıktıdaki zaman damgalarıyla (event `LAST SEEN`, `creationTimestamp`, `deletionTimestamp`); yoksa "saat ölçülmedi".
4. **Bulgular** — her biri: gözlem + kanıt komutu + kısa çıktı alıntısı.
5. **Kök neden** — iki etiketten biri: **doğrulandı** (hangi log/çıktı gösteriyor) ya da **tahmin** (neye dayanıyor, ne doğrular).
   Kanıtsız "sebebi X'tir" yazılmaz.
6. **Yapılan değişiklikler** — komut, zaman, kim onayladı; geri dönüş yolu.
7. **Doğrulama** — değişiklikten sonra ölçülen son durum (pod Running/Ready, restart sayısı, PVC Bound, uygulamanın kendi sağlık ucu).
   Ölçülmediyse "doğrulanmadı" ve nasıl doğrulanır.
8. **Ekipten beklenen / öneriler** — uygulama tarafı (ör. `terminationGracePeriodSeconds`, preStop, probe) ekibin kararı; öneri dili.
9. **Açık sorular**.

**k8s olaylarında iki tuzak (bilinen yanlış anlatımlar):**
- **RKE2'de `systemctl status containerd` → inactive normaldir:** RKE2 kendi gömülü containerd'sini `rke2-server/agent` sürecinin
  altında çalıştırır; ayrı `containerd.service` kullanılmaz (RKE2 belgesi: containerd RKE2 ile birlikte gelir). Raporda bulgu diye yazma.
- **`kubectl delete pod --force --grace-period=0`** yalnız API kaydını siler; node'da konteyner hâlâ çalışıyor olabilir (Kubernetes
  belgesi, "Force Delete StatefulSet Pods": zorla silme, eski pod'un gerçekten bittiğini doğrulamaz). RWO PVC kullanan uygulamada
  (`strategy: Recreate` bunun işaretidir) iki pod aynı diske yazabilir. Raporda: node'da eski konteyner kalmadığının kanıtı —
  node'da `/var/lib/rancher/rke2/bin/crictl --runtime-endpoint unix:///run/k3s/containerd/containerd.sock ps -a | grep <pod>` boş —
  ya da "eski konteynerin durduğu doğrulanmadı" satırı. "Force delete ile düzeltildi" tek başına kök neden değil, belirtiyi kaldırır.

Biçim: HTML (§A, "HTML — bağımlılıksız ve yazdırılabilir") — başlık, tarih, hazırlayan, alıcı; tablolar betik/çıktı değerleriyle. Dosya
çalışma dizinine (`olay-<uygulama>-<tarih>.html`); var olanın üstüne yazma.

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

Kullanıcı "pdf olsun" diye ısrar ederse (saha 2026-11-05) HTML'i yine üret ama
**PDF'e giden yolu tek seferde ve tam ver**, "tarayıcıda açın" deyip bırakma:
1) dosyanın tam yolu · 2) MobaXterm sol SFTP panelinden o yola git, dosyayı
Windows'a sürükle · 3) Edge'de aç → `Ctrl+P` → Yazıcı: *PDF olarak kaydet* →
*Diğer ayarlar* → *Arka plan grafikleri* işaretli → Kaydet. Türkçe karakter
sorunu olmaz (`<meta charset="utf-8">`). HTML'e yazdırma CSS'i koy:
`@media print { body { margin: 0 } table, pre { page-break-inside: avoid } }`
ve A4 için `@page { size: A4; margin: 15mm }`. Sunucuya PDF aracı kurmak
(`fpdf2` + bağımlılıkları) değişikliktir — ayrı onay.

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
