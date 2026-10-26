#!/usr/bin/env python3
# belge-oku.py — kurum belgelerini (Excel, Word, PowerPoint, OneNote dışa aktarımı, PDF, HTML) DÜZ METNE çevirir; her satırın
# başında yeri yazılı (sayfa!hücre / paragraf / slayt / PDF sayfası) → model cevabında "belge · yer" ile kaynak gösterebilir.
# Yalnız Python standart kütüphanesi (zipfile + xml): saha internetsiz, ek paket yok. PDF için pdftotext (poppler-utils) ya da
# pypdf varsa onu kullanır, yoksa ne yapılacağını söyler. Yalnız okur; belgeyi değiştirmez, hiçbir yere göndermez.
# Alp (2026-10-26): "bilgileri tuttuğumuz OneNote'umuz var … Excel'dir, OneNote'dur, PDF'dir — bunları inceleyebilirse iyi olur."
import datetime
import email
import html
import os
import re
import shutil
import subprocess
import sys
import zipfile
from html.parser import HTMLParser
from xml.etree import ElementTree as ET

KULLANIM = """kullanım: belge-oku.py <dosya> [--ara <regex>] [--sayfa <ad|no>] [--en-cok <satır, varsayılan 400>] [--bilgi]
  Desteklenen: .xlsx .xlsm · .docx · .pptx · .pdf · .mht/.mhtml (OneNote "Tek dosya web sayfası") · .html/.htm · .txt/.csv/.md
  OneNote (.one) doğrudan okunamaz (kapalı biçim) → OneNote'ta Dosya > Dışarı Aktar: Sayfa/Bölüm → PDF ya da Word (.docx).
  --ara   : yalnız eşleşen satırlar (büyük/küçük harf duyarsız) — büyük belgede önce bununla daralt
  --sayfa : Excel'de çalışma sayfası adı ya da sırası, PDF/PowerPoint'te sayfa/slayt no
  --bilgi : yalnız özet (sayfa adları ve boyutları, paragraf/slayt/sayfa sayısı)
  Çıkış: 0 tamam · 2 okunamadı / desteklenmiyor."""

NS = {
    "s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
TARIH_FMT_ID = set(range(14, 23)) | set(range(45, 48))


class Okunamadi(Exception):
    pass


def excel_tarih(deger):
    try:
        g = float(deger)
    except ValueError:
        return deger
    if g < 1 or g > 2958465:
        return deger
    t = datetime.datetime(1899, 12, 30) + datetime.timedelta(seconds=round(g * 86400))  # kayan nokta: 14:30 → 14:29 olmasın
    return t.strftime("%Y-%m-%d %H:%M") if g % 1 else t.strftime("%Y-%m-%d")


def xlsx(yol, secenek):
    z = zipfile.ZipFile(yol)
    ad_listesi = set(z.namelist())
    paylasilan = []
    if "xl/sharedStrings.xml" in ad_listesi:
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("s:si", NS):
            paylasilan.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["s"])))
    tarih_stilleri = set()
    if "xl/styles.xml" in ad_listesi:
        st = ET.fromstring(z.read("xl/styles.xml"))
        ozel = {}
        for nf in st.findall("s:numFmts/s:numFmt", NS):
            kod = re.sub(r'"[^"]*"|\[[^\]]*\]', "", nf.get("formatCode", "")).lower()
            ozel[int(nf.get("numFmtId"))] = bool(re.search(r"[dy]", kod) or re.search(r"m{1,4}[^a-z]*(d|y)", kod))
        for i, xf in enumerate(st.findall("s:cellXfs/s:xf", NS)):
            fid = int(xf.get("numFmtId", "0"))
            if fid in TARIH_FMT_ID or ozel.get(fid):
                tarih_stilleri.add(i)
    kitap = ET.fromstring(z.read("xl/workbook.xml"))
    iliskiler = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")).findall("rel:Relationship", NS)}
    sayfalar = []
    for i, sh in enumerate(kitap.findall("s:sheets/s:sheet", NS), 1):
        hedef = iliskiler.get(sh.get("{%s}id" % NS["r"]), "")
        hedef = hedef.lstrip("/") if hedef.startswith("/") else "xl/" + hedef
        sayfalar.append((i, sh.get("name"), hedef, {None: "görünür", "visible": "görünür", "hidden": "gizli",
                                                         "veryHidden": "çok gizli"}.get(sh.get("state"), sh.get("state"))))
    for no, ad, hedef, durum in sayfalar:
        if secenek["sayfa"] and secenek["sayfa"] not in (str(no), ad):
            continue
        if hedef not in ad_listesi:
            yield "[%s] (sayfa verisi yok: %s)" % (ad, hedef)
            continue
        kok = ET.fromstring(z.read(hedef))
        boyut = kok.find("s:dimension", NS)
        satirlar = kok.findall("s:sheetData/s:row", NS)
        yield "== sayfa %d: %s%s · %s · %d dolu satır" % (no, ad, "" if durum == "görünür" else " (%s)" % durum,
                                                            boyut.get("ref") if boyut is not None else "?", len(satirlar))
        if secenek["bilgi"]:
            continue
        birlesik = [m.get("ref") for m in kok.findall("s:mergeCells/s:mergeCell", NS)]
        for r in satirlar:
            hucreler = []
            for c in r.findall("s:c", NS):
                tur, v = c.get("t"), c.find("s:v", NS)
                if tur == "inlineStr":
                    deger = "".join(t.text or "" for t in c.iter("{%s}t" % NS["s"]))
                elif v is None:
                    continue
                elif tur == "s":
                    deger = paylasilan[int(v.text)]
                elif tur == "b":
                    deger = "DOĞRU" if v.text == "1" else "YANLIŞ"
                elif tur in ("str", "e"):
                    deger = v.text or ""
                else:
                    deger = v.text or ""
                    if int(c.get("s", "0")) in tarih_stilleri:
                        deger = excel_tarih(deger)
                deger = deger.replace("\r", "").replace("\n", " ⏎ ").strip()
                if deger:
                    hucreler.append((c.get("r"), deger))
            if hucreler:
                yield "%s!%s  %s" % (ad, r.get("r"), " | ".join("%s=%s" % (ref, d) for ref, d in hucreler))
        if birlesik:
            yield "%s birleşik hücreler (değer yalnız sol üstte): %s" % (ad, " ".join(birlesik[:40]))


def docx(yol, secenek):
    z = zipfile.ZipFile(yol)
    govde = ET.fromstring(z.read("word/document.xml")).find("w:body", NS)
    p_no, t_no = 0, 0
    w = "{%s}" % NS["w"]

    def metin(e):
        parca = []
        for x in e.iter():
            if x.tag == w + "t":
                parca.append(x.text or "")
            elif x.tag == w + "tab":
                parca.append("\t")
            elif x.tag in (w + "br", w + "cr"):
                parca.append(" ⏎ ")
        return "".join(parca).strip()

    for e in govde:
        if e.tag == w + "p":
            p_no += 1
            s = metin(e)
            stil = e.find("w:pPr/w:pStyle", NS)
            if s and not secenek["bilgi"]:
                baslik = stil is not None and re.match(r"(Heading|Başlık|Baslik)\s*\d", stil.get(w + "val", ""), re.I)
                yield "¶%d%s  %s" % (p_no, " [başlık]" if baslik else "", s)
        elif e.tag == w + "tbl":
            t_no += 1
            for r_no, tr in enumerate(e.findall("w:tr", NS), 1):
                hucre = [metin(tc) for tc in tr.findall("w:tc", NS)]
                if any(hucre) and not secenek["bilgi"]:
                    yield "tablo%d.satır%d  %s" % (t_no, r_no, " | ".join(hucre))
    if secenek["bilgi"]:
        yield "%d paragraf, %d tablo" % (p_no, t_no)


def pptx(yol, secenek):
    z = zipfile.ZipFile(yol)
    slaytlar = sorted((int(re.search(r"(\d+)", n).group(1)), n) for n in z.namelist()
                      if re.match(r"ppt/slides/slide\d+\.xml$", n))
    if secenek["bilgi"]:
        yield "%d slayt" % len(slaytlar)
        return
    for no, n in slaytlar:
        if secenek["sayfa"] and secenek["sayfa"] != str(no):
            continue
        for p_no, p in enumerate(ET.fromstring(z.read(n)).iter("{%s}p" % NS["a"]), 1):
            s = "".join(t.text or "" for t in p.iter("{%s}t" % NS["a"])).strip()
            if s:
                yield "slayt%d.%d  %s" % (no, p_no, s)


class Metinci(HTMLParser):
    BLOK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table", "title"}

    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.parca, self.atla = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.atla += 1
        elif tag in ("td", "th"):
            self.parca.append(" | ")
        elif tag in self.BLOK:
            self.parca.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.atla = max(0, self.atla - 1)
        elif tag in self.BLOK:
            self.parca.append("\n")

    def handle_data(self, data):
        if not self.atla:
            self.parca.append(data)


def html_satirlari(metin, etiket):
    m = Metinci()
    m.feed(metin)
    no = 0
    for s in "".join(m.parca).split("\n"):
        s = re.sub(r"[ \t\xa0]+", " ", s).strip(" |")
        if s:
            no += 1
            yield "%s%d  %s" % (etiket, no, s)


def mht(yol, secenek):
    msj = email.message_from_bytes(open(yol, "rb").read())
    parca_no = 0
    for p in msj.walk():
        if p.get_content_type() != "text/html":
            continue
        parca_no += 1
        yuk = p.get_payload(decode=True) or b""
        kod = p.get_content_charset() or "utf-8"
        for s in html_satirlari(yuk.decode(kod, errors="replace"), "parça%d.satır" % parca_no if parca_no > 1 else "satır"):
            yield s


def pdf(yol, secenek):
    if shutil.which("pdftotext"):
        arg = ["pdftotext", "-layout", "-enc", "UTF-8"]
        if secenek["sayfa"]:
            arg += ["-f", secenek["sayfa"], "-l", secenek["sayfa"]]
        cikti = subprocess.run(arg + [yol, "-"], stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode("utf-8", "replace")
        sayfalar = cikti.split("\f")
        bas = int(secenek["sayfa"]) if secenek["sayfa"] else 1
        if secenek["bilgi"]:
            yield "%d sayfa (pdftotext)" % len([x for x in sayfalar if x.strip()])
            return
        for i, sf in enumerate(sayfalar, bas):
            for j, s in enumerate(sf.split("\n"), 1):
                if s.strip():
                    yield "s%d.%d  %s" % (i, j, s.rstrip())
        return
    try:
        import pypdf  # noqa: F401 — kuruluysa
    except ImportError:
        raise Okunamadi("PDF okunamadı: pdftotext (poppler-utils paketi) ve pypdf yok. Seçenekler: (1) `rpm -q poppler-utils` — kurulumu "
                         "kullanıcının kararı (Satellite deposundan dnf); (2) belgeyi Word (.docx) ya da metin olarak dışa aktarıp ver.")
    okuyucu = pypdf.PdfReader(yol)
    if secenek["bilgi"]:
        yield "%d sayfa (pypdf)" % len(okuyucu.pages)
        return
    for i, sf in enumerate(okuyucu.pages, 1):
        if secenek["sayfa"] and secenek["sayfa"] != str(i):
            continue
        for j, s in enumerate((sf.extract_text() or "").split("\n"), 1):
            if s.strip():
                yield "s%d.%d  %s" % (i, j, s.rstrip())


def duz(yol, secenek):
    for i, s in enumerate(open(yol, encoding="utf-8", errors="replace").read().split("\n"), 1):
        if s.strip():
            yield "%d  %s" % (i, s.rstrip())


OKUYUCU = {".xlsx": xlsx, ".xlsm": xlsx, ".docx": docx, ".pptx": pptx, ".pdf": pdf, ".mht": mht, ".mhtml": mht,
           ".txt": duz, ".csv": duz, ".md": duz}


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(KULLANIM)
        return 0
    yol, secenek, i = None, {"ara": None, "sayfa": None, "en_cok": 400, "bilgi": False}, 0
    while i < len(argv):
        a = argv[i]
        if a in ("--ara", "--sayfa", "--en-cok") and i + 1 < len(argv):
            secenek[a[2:].replace("-", "_")] = argv[i + 1]
            i += 2
            continue
        if a == "--bilgi":
            secenek["bilgi"] = True
        else:
            yol = a
        i += 1
    if not yol or not os.path.isfile(yol):
        print("okunamadı: %s" % yol)
        return 2
    uzanti = os.path.splitext(yol)[1].lower()
    if uzanti == ".one" or uzanti == ".onepkg":
        print("OneNote dosyası (%s) doğrudan okunamaz — kapalı biçim. OneNote'ta: Dosya > Dışarı Aktar > Sayfa ya da Bölüm > "
              "PDF ya da Word Belgesi (.docx) → o dosyayı ver." % uzanti)
        return 2
    if uzanti in (".xls", ".doc", ".ppt"):
        print("Eski ikili Office biçimi (%s) okunamaz — Office'te 'Farklı Kaydet' ile %sx olarak kaydedip ver." % (uzanti, uzanti))
        return 2
    okuyucu = OKUYUCU.get(uzanti) or (lambda y, s: html_satirlari(open(y, encoding="utf-8", errors="replace").read(), "satır")
                                      if uzanti in (".html", ".htm") else None)
    if uzanti not in OKUYUCU and uzanti not in (".html", ".htm"):
        print("desteklenmeyen biçim: %s\n%s" % (uzanti, KULLANIM))
        return 2
    desen = re.compile(secenek["ara"], re.I) if secenek["ara"] else None
    en_cok = int(secenek["en_cok"])
    print("# %s · %s · %d bayt" % (os.path.basename(yol), uzanti[1:], os.path.getsize(yol)))
    basilan, atlanan = 0, 0
    try:
        for s in okuyucu(yol, secenek):
            if desen and not desen.search(s) and not s.startswith("== "):
                continue
            if basilan >= en_cok:
                atlanan += 1
                continue
            print(s)
            basilan += 1
    except (zipfile.BadZipFile, ET.ParseError, KeyError) as e:
        print("okunamadı (bozuk ya da parolalı belge?): %s" % e)
        return 2
    except Okunamadi as e:
        print(e)
        return 2
    if atlanan:
        print("… %d satır daha basılmadı (--en-cok %d). Daralt: --ara '<desen>' ya da --sayfa <ad|no>." % (atlanan, en_cok))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
