#!/usr/bin/env python3
# pdf-rapor.py — Markdown alt kümesinden düzgün PDF (fpdf2). Model yalnız İÇERİĞİ yazar (.md); yerleşim, Türkçe font, tablo ve tek
# sayfaya sığdırma betikte. Neden (saha 2026-11-05): model fpdf2 koordinatlarını elle yazdı — tablolar boş, metinler üst üste,
# Türkçe harfler silinmiş ("COZULDU", "calisiyor"); Alp: "tek sayfa ve düzgün dedim ama karışık olmuş".
#
# kullanım:
#   pdf-rapor.py <girdi.md> <çıktı.pdf> [--tek-sayfa] [--font <ttf>] [--yatay]
# Girdi (her satır tek öğe; boş satır paragraf ayırır):
#   # Başlık                    | ilk satır; hemen altındaki düz satır alt başlık (tarih · küme · ns)
#   ## Bölüm
#   > [sorun] metin             | kırmızı kutu · > [tamam] yeşil · > [not] gri
#   - madde
#   | a | b |  + |---|---|      | tablo; ilk satır başlık
#   düz metin, **kalın**, `kod`
# Çıkış: 0 tamam · 1 tek sayfaya sığmadı (PDF yine yazılır) · 2 hata (fpdf2 yok, font yok, girdi yok)
import os
import re
import sys

TURKCE = "çğıİöşüÇĞÖŞÜ"
KUTU = {"sorun": ((253, 236, 234), (192, 57, 43)), "tamam": ((233, 247, 239), (39, 174, 96)), "not": ((242, 243, 245), (127, 140, 141))}


def font_bul(zorla=None):
    # Türkçe harflerin hepsi fontta olmalı (fontTools cmap — fpdf2'nin bağımlılığı). Tercih: Sans, Mono değil, normal kalınlık.
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        TTFont = None
    adaylar = [zorla] if zorla else []
    if not zorla:
        for kok in ("/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.fonts")):
            for d, _, dosyalar in os.walk(kok):
                adaylar += [os.path.join(d, f) for f in dosyalar if f.lower().endswith(".ttf")]

    def puan(y):
        a = os.path.basename(y).lower()
        return (("mono" in a) * 4 + ("serif" in a and "sans" not in a) * 2 + ("italic" in a or "oblique" in a) * 8
                + ("bold" in a) * 8 + ("light" in a or "thin" in a or "condensed" in a) * 3 + ("sans" not in a), a)

    for y in sorted(adaylar, key=puan):
        if TTFont is None:
            return y
        try:
            cmap = TTFont(y, fontNumber=0, lazy=True).getBestCmap() or {}
        except Exception:
            continue
        if all(ord(h) in cmap for h in TURKCE):
            return y
    return None


def kalin_bul(normal):
    d, a = os.path.split(normal)
    for aday in (a.replace("Regular", "Bold"), a.replace(".ttf", "-Bold.ttf"), a.replace("-Regular", "-Bold")):
        if aday != a and os.path.isfile(os.path.join(d, aday)):
            return os.path.join(d, aday)
    return None


def ayristir(metin):
    ogeler, tablo, paragraf = [], None, []

    def bitir():
        nonlocal tablo, paragraf
        if tablo:
            ogeler.append(("tablo", tablo))
        if paragraf:
            ogeler.append(("metin", " ".join(paragraf)))
        tablo, paragraf = None, []

    for satir in metin.splitlines():
        s = satir.strip()
        if s.startswith("|"):
            if paragraf:
                ogeler.append(("metin", " ".join(paragraf)))
                paragraf = []
            hucre = [h.strip() for h in s.strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", h) for h in hucre if h):
                continue
            tablo = (tablo or []) + [hucre]
            continue
        if tablo:
            ogeler.append(("tablo", tablo))
            tablo = None
        if not s:
            bitir()
        elif s.startswith("## "):
            bitir(); ogeler.append(("bolum", s[3:]))
        elif s.startswith("# "):
            bitir(); ogeler.append(("baslik", s[2:]))
        elif s.startswith(">"):
            bitir()
            m = re.match(r">\s*\[(sorun|tamam|not)\]\s*(.*)", s, re.I)
            ogeler.append(("kutu", (m.group(1).lower(), m.group(2)) if m else ("not", s.lstrip("> "))))
        elif re.match(r"[-*] ", s):
            bitir(); ogeler.append(("madde", s[2:]))
        else:
            paragraf.append(s)
    bitir()
    if len(ogeler) > 1 and ogeler[0][0] == "baslik" and ogeler[1][0] == "metin":
        ogeler[1] = ("alt", ogeler[1][1])
    return ogeler


def sade(t, kalin=True):
    t = t.replace("`", "")
    return t if kalin else t.replace("**", "")


def ciz(ogeler, font, kalin, boyut, yatay):
    from fpdf import FPDF
    from fpdf.fonts import FontFace

    pdf = FPDF(orientation="L" if yatay else "P", format="A4")
    pdf.set_margins(14, 12, 14)
    pdf.set_auto_page_break(True, 12)
    degisken = "[wght" in os.path.basename(font)  # değişken font: kalınlık eksenden (fpdf2 variations)
    pdf.add_font("g", "", font, **({"variations": {"wght": 400}} if degisken else {}))
    if kalin or degisken:
        pdf.add_font("g", "B", kalin or font, **({"variations": {"wght": 700}} if degisken and not kalin else {}))
    else:
        pdf.add_font("g", "B", font)
    kalin = kalin or degisken
    pdf.add_page()
    W = pdf.epw
    lh = boyut * 0.5
    for tur, v in ogeler:
        if tur == "baslik":
            pdf.set_font("g", "B", boyut + 6)
            pdf.multi_cell(W, (boyut + 6) * 0.5, sade(v), align="C", new_x="LMARGIN", new_y="NEXT")
        elif tur == "alt":
            pdf.set_font("g", "", boyut - 1)
            pdf.set_text_color(110, 110, 110)
            pdf.multi_cell(W, lh, sade(v), align="C", new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
            pdf.ln(lh * 0.6)
        elif tur == "bolum":
            pdf.ln(lh * 0.5)
            pdf.set_font("g", "B", boyut + 2)
            pdf.multi_cell(W, (boyut + 2) * 0.5, sade(v), new_x="LMARGIN", new_y="NEXT")
            y = pdf.get_y()
            pdf.set_draw_color(180, 180, 180)
            pdf.line(pdf.l_margin, y, pdf.l_margin + W, y)
            pdf.ln(lh * 0.4)
        elif tur == "kutu":
            ton, metin = v
            dolgu, kenar = KUTU[ton]
            pdf.set_fill_color(*dolgu)
            pdf.set_draw_color(*kenar)
            pdf.set_font("g", "", boyut)
            pdf.multi_cell(W, lh + 1, sade(metin, kalin), border=1, fill=True, markdown=bool(kalin), padding=1.5, align="L",
                           new_x="LMARGIN", new_y="NEXT")
            pdf.ln(lh * 0.4)
        elif tur == "madde":
            pdf.set_font("g", "", boyut)
            pdf.cell(5, lh, "•")
            pdf.multi_cell(W - 5, lh, sade(v, kalin), markdown=bool(kalin), align="L", new_x="LMARGIN", new_y="NEXT")
        elif tur == "metin":
            pdf.set_font("g", "", boyut)
            pdf.multi_cell(W, lh, sade(v, kalin), markdown=bool(kalin), align="L", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(lh * 0.3)
        elif tur == "tablo":
            sutun = max(len(r) for r in v)
            satirlar = [[sade(h).replace("**", "") for h in r] + [""] * (sutun - len(r)) for r in v]
            uz = [max(len(r[i]) for r in satirlar) or 1 for i in range(sutun)]
            genislik = [max(0.12, min(0.6, u / sum(uz))) for u in uz]
            pdf.set_font("g", "", boyut - 0.5)
            pdf.set_draw_color(190, 190, 190)
            pdf.set_fill_color(248, 249, 250)
            with pdf.table(col_widths=genislik, width=W, line_height=lh + 0.6, text_align="LEFT", padding=1,
                           headings_style=FontFace(emphasis="BOLD", fill_color=(230, 234, 240)),
                           cell_fill_color=(248, 249, 250), cell_fill_mode="ROWS") as t:
                for r in satirlar:
                    t.row(r)
            pdf.ln(lh * 0.5)
    return pdf


def main(argv):
    if len(argv) < 2 or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("\nimport")[0])
        return 0 if argv else 2
    girdi, cikti = argv[0], argv[1]
    try:
        import fpdf  # noqa: F401
    except ImportError:
        print("fpdf2 kurulu değil — kurulum değişikliktir (onay; tercihen venv: python3 -m venv ~/ai/work/venv-rapor && "
              "~/ai/work/venv-rapor/bin/pip install fpdf2). Kurulmadan: HTML üret, tarayıcıdan yazdır (rapor §A).")
        return 2
    if not os.path.isfile(girdi):
        print("girdi yok: %s" % girdi)
        return 2
    if os.path.exists(cikti):
        print("%s zaten var — üzerine yazılmadı (ada sürüm ekle ya da kullanıcıya sor)" % cikti)
        return 2
    font = font_bul(argv[argv.index("--font") + 1] if "--font" in argv else None)
    if not font:
        print("Türkçe harfleri (%s) içeren TTF bulunamadı — `find / -name '*.ttf'` ile ara, --font ile ver" % TURKCE)
        return 2
    kalin = kalin_bul(font)
    ogeler = ayristir(open(girdi, encoding="utf-8").read())
    boyut, pdf = 10.0, None
    while True:
        pdf = ciz(ogeler, font, kalin, boyut, "--yatay" in argv)
        if "--tek-sayfa" not in argv or pdf.pages_count == 1 or boyut <= 7:
            break
        boyut -= 0.5
    pdf.output(cikti)
    print("yazıldı: %s · %d sayfa · yazı %.1f pt · font %s%s" % (cikti, pdf.pages_count, boyut, os.path.basename(font),
                                                              "" if kalin or "[wght" in font else " (kalın yok — başlıklar normal)"))
    if "--tek-sayfa" in argv and pdf.pages_count > 1:
        print("UYARI: 7 pt'de bile %d sayfa — içeriği kısalt (tabloyu böl, ayrıntıyı ek dosyaya)" % pdf.pages_count)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
