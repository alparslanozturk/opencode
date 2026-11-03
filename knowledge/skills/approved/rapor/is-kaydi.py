#!/usr/bin/env python3
# is-kaydi.py — geçici saha işleri için iş kaydı: plan, okuma kanıtı ve sonuç tek dizinde birikir; zamanla kurumun iş bilgi tabanı olur.
# Alp (2026-11-03, ADR-0007 §6-7): "geçici işler için bir planning proposal olsun … database gibi … normal projelerden farklı bir dizinde".
# Kök: ~/ai/work/is-kayitlari (IS_KAYIT_KOK ile değişir). Betik YALNIZ bu kökün altına yazar, var olan dosyanın üstüne yazmaz.
# Kurum verisi içerir — sahada kalır, opencode deposuna kopyalanmaz.
#
#   is-kaydi.py ac <etiket> [--cn <no>] [--sunucular a,b] [--istek "<metin>"]   → yeni kayıt dizini, yolunu basar
#   <komut> | is-kaydi.py ekle <dizin|son> <ad>                                 → stdin'i okuma/<tarih>-<ad>.txt olarak saklar
#   is-kaydi.py sonuc <dizin|son> "<satır>"                                     → sonuc.md'ye zaman damgalı satır ekler
#   is-kaydi.py liste [<sözcük>]                                                → kayıtları listeler (okuma)
import datetime
import os
import re
import sys

KOK = os.path.abspath(os.path.expanduser(os.environ.get("IS_KAYIT_KOK", "~/ai/work/is-kayitlari")))

PLAN = """# {ad}

- Açıldı: {zaman}
- CN: {cn}
- Sunucular: {sunucular}
- İstek (kullanıcının sözü): {istek}

## Önce sor — cevaplar
- Amaç/belirti:
- Kapsam:
- Kısıt (zaman, kesinti, sahip onayı):

## Okuma kanıtı
`okuma/` altındaki dosyalar (komut çıktısı, betik sonucu). Her olgu bir dosyaya dayanır.

## Plan (değişiklik adımları — her adım ayrı komut, ayrı onay)
1.

## Risk ve geri dönüş
-
"""

SONUC = "# Sonuç — {ad}\n\n(ölçülen son durum; \"yaptım\" yalnız hedefteki ölçümle)\n\n"


def zaman(bicim="%Y%m%d-%H%M"):
    return datetime.datetime.now().strftime(bicim)


def guvenli_ad(x):
    x = re.sub(r"[^a-z0-9._-]+", "-", x.strip().lower()).strip("-.")
    return x[:60] or "is"


def kok_icinde(yol):
    yol = os.path.abspath(yol)
    return yol == KOK or yol.startswith(KOK + os.sep)


def kayit_dizini(arg):
    if arg == "son":
        kayitlar = sorted(d for d in os.listdir(KOK) if os.path.isdir(os.path.join(KOK, d))) if os.path.isdir(KOK) else []
        if not kayitlar:
            raise SystemExit("kayıt yok (%s)" % KOK)
        return os.path.join(KOK, kayitlar[-1])
    yol = arg if os.path.isabs(arg) else os.path.join(KOK, arg)
    if not kok_icinde(yol) or not os.path.isdir(yol):
        raise SystemExit("kayıt dizini değil: %s (kök %s)" % (arg, KOK))
    return os.path.abspath(yol)


def yeni_dosya(yol):
    taban, uzanti = os.path.splitext(yol)
    i = 2
    while os.path.exists(yol):
        yol = "%s-%d%s" % (taban, i, uzanti)
        i += 1
    return yol


def secenek(argv, ad, varsayilan):
    return argv[argv.index(ad) + 1] if ad in argv and argv.index(ad) + 1 < len(argv) else varsayilan


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import datetime")[0].replace("# ", "").replace("#!/usr/bin/env python3\n", ""))
        return 0
    if argv[0] == "ac" and len(argv) > 1:
        ad = "%s-%s" % (zaman(), guvenli_ad(argv[1]))
        dizin = yeni_dosya(os.path.join(KOK, ad))
        os.makedirs(os.path.join(dizin, "okuma"))
        with open(os.path.join(dizin, "plan.md"), "w", encoding="utf-8") as f:
            f.write(PLAN.format(ad=os.path.basename(dizin), zaman=zaman("%Y-%m-%d %H:%M"), cn=secenek(argv, "--cn", "verilmedi"),
                                sunucular=secenek(argv, "--sunucular", "verilmedi"), istek=secenek(argv, "--istek", "verilmedi")))
        with open(os.path.join(dizin, "sonuc.md"), "w", encoding="utf-8") as f:
            f.write(SONUC.format(ad=os.path.basename(dizin)))
        print(dizin)
        return 0
    if argv[0] == "ekle" and len(argv) > 2:
        dizin = kayit_dizini(argv[1])
        hedef = yeni_dosya(os.path.join(dizin, "okuma", "%s-%s.txt" % (zaman(), guvenli_ad(argv[2]))))
        veri = sys.stdin.read()
        with open(hedef, "w", encoding="utf-8") as f:
            f.write(veri)
        print("%s (%d satır)" % (hedef, veri.count("\n")))
        return 0
    if argv[0] == "sonuc" and len(argv) > 2:
        dizin = kayit_dizini(argv[1])
        with open(os.path.join(dizin, "sonuc.md"), "a", encoding="utf-8") as f:
            f.write("- %s %s\n" % (zaman("%Y-%m-%d %H:%M"), " ".join(argv[2:])))
        print(os.path.join(dizin, "sonuc.md"))
        return 0
    if argv[0] == "liste":
        if not os.path.isdir(KOK):
            print("kayıt yok (%s)" % KOK)
            return 0
        sozcuk = argv[1].lower() if len(argv) > 1 else ""
        for d in sorted(os.listdir(KOK)):
            p = os.path.join(KOK, d, "plan.md")
            if not os.path.isfile(p):
                continue
            metin = open(p, encoding="utf-8", errors="replace").read()
            if sozcuk and sozcuk not in (d + metin).lower():
                continue
            sun = re.search(r"^- Sunucular: (.*)$", metin, re.M)
            print("%-45s %s" % (d, sun.group(1) if sun else ""))
        return 0
    print("alt komut: ac | ekle | sonuc | liste")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
