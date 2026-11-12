#!/usr/bin/env python3
# is-kaydi.py — saha işleri için iş kaydı: plan, okuma kanıtı ve sonuç tek dizinde birikir; zamanla kurumun iş bilgi tabanı olur.
# Alp (2026-11-03, ADR-0007 §6-7): "geçici işler için bir planning proposal olsun … database gibi … normal projelerden farklı bir dizinde".
# Alp (2026-11-12, ADR-0007 §9): "her bir değişiklik numarası için dn dizininin içinde numarayla bir dizin açıyoruz, playbook'ları
# oraya atıyoruz" → değişiklik numaralı işin HER ŞEYİ tek dizinde:
#   <çalışma dizini>/dn/<numara>/   hosts.ini (iş envanteri — is-envanter.py) · 01-<ad>.yaml, 02-… (playbook'lar) · README.md (iş bilgisi)
#                                   logs/plan.md · logs/sonuc.md · logs/okuma/ (kanıt)
# CN'siz iş (kriz, kurulum, inceleme): ~/ai/work/is-kayitlari/<YYYYMMDD>-<etiket>/ (IS_KAYIT_KOK ile değişir) — plan.md, sonuc.md, okuma/
# Betik YALNIZ bu iki kökün altına yazar, var olan dosyanın üstüne yazmaz. Kurum verisi içerir — sahada kalır, opencode deposuna kopyalanmaz.
#
#   is-kaydi.py ac <etiket> [--cn <no>] [--sunucular a,b] [--istek "<metin>"]   → kayıt dizini, yolunu basar
#       --cn 29000 | dn29000 → dn/29000/ (dizin adında tarih/saat YOK; aynı numara yeniden açılmaz — iş sürüyorsa aynı dizin, eksik
#       dosya tamamlanır). CN yoksa <YYYYMMDD>-<etiket> (gün, saat yok; aynı ad varsa -2, -3 …). Tarihi/CN'yi etikete yazma.
#   <komut> | is-kaydi.py ekle <kayıt> <ad>      → stdin'i okuma/<tarih-saat>-<ad>.txt olarak saklar
#   is-kaydi.py sonuc <kayıt> "<satır>"          → sonuc.md'ye zaman damgalı satır ekler
#   is-kaydi.py liste [<sözcük>]                 → kayıtları listeler (okuma)
#   <kayıt> = değişiklik numarası (29000) | dizin yolu/adı | son   ("son" = en son AÇILAN kayıt; emin değilsen numarayı yaz)
import datetime
import os
import re
import sys

KOK = os.path.abspath(os.path.expanduser(os.environ.get("IS_KAYIT_KOK", "~/ai/work/is-kayitlari")))


def calisma_koku():
    # komut iş dizininin içinden (…/dn/<no>[/logs]) çalıştırılsa da kök aynı kalır (is-envanter.py ile aynı kural)
    c = a = os.getcwd()
    for _ in range(3):
        if os.path.basename(a) == "dn" and any(os.path.isdir(os.path.join(os.path.dirname(a), k)) for k in ("ansible", "inventories", "inventory")):
            return os.path.dirname(a)
        a = os.path.dirname(a)
    return c


DN_KOK = os.path.abspath(os.path.expanduser(os.environ.get("IS_DN_KOK") or os.path.join(calisma_koku(), "dn")))

BASLIK = """- Açıldı: {zaman}
- CN: {cn}
- Sunucular: {sunucular}
- İstek (kullanıcının sözü): {istek}
"""

PLAN = """# {ad}

""" + BASLIK + """
## Önce sor — cevaplar
- Amaç/belirti:
- Kapsam:
- Kısıt (zaman, kesinti, sahip onayı):

## Okuma kanıtı
`okuma/` altındaki dosyalar (komut çıktısı, betik sonucu). Her olgu bir dosyaya dayanır.

## Plan (iş envanteri → playbook → onay → önce tek sunucu → kalanlar; her adım ayrı onay)
- İş envanteri (ini):
- Playbook:
- İlk denenecek sunucu:
1.

## Risk ve geri dönüş
-
"""

SONUC = ("# Sonuç — {ad}\n\n(ölçülen son durum; \"yaptım\" yalnız hedefteki ölçümle)\n\n"
          "## Dersler (öneri — beceriye ancak Alp onayıyla girer; yalnız ölçülmüş olgu)\n\n")

BENIOKU = """# Değişiklik {cn} — {etiket}

""" + BASLIK + """
## Bu dizinde
- `hosts.ini` — iş envanteri: yalnız bu işin sunucuları (is-envanter.py üretir; aşama için `hosts-<aşama>.ini`)
- `01-<ad>.yaml`, `02-<ad>.yaml` … — bu işin playbook'ları, çalışma sırasıyla
- `logs/plan.md` plan ve soruların cevapları · `logs/sonuc.md` ölçülen sonuç · `logs/okuma/` okuma kanıtı

## Adımlar (her adım kullanıcı onayıyla; önce tek sunucu, sonra kalanlar)
1.

## Durum
-
"""


def zaman(bicim="%Y%m%d-%H%M"):
    return datetime.datetime.now().strftime(bicim)


def guvenli_ad(x):
    x = re.sub(r"[^a-z0-9._-]+", "-", x.strip().lower()).strip("-.")
    return x[:60] or "is"


def icinde(kok, yol):
    yol = os.path.abspath(yol)
    return yol == kok or yol.startswith(kok + os.sep)


def cn_dizin_adi(cn):
    # 29000 / dn29000 / DN-29000 → 29000; başka biçim (CHG0012345) güvenli adıyla
    ad = guvenli_ad(cn)
    m = re.fullmatch(r"dn[-_]?(\d+)", ad)
    return m.group(1) if m else ad


def kayitlar():
    # plan.md taşıyan tüm kayıt dizinleri: CN'li (dn/<no>/logs) + CN'siz (is-kayitlari/<ad>)
    out = []
    if os.path.isdir(DN_KOK):
        out += [os.path.join(DN_KOK, d, "logs") for d in os.listdir(DN_KOK)]
    if os.path.isdir(KOK):
        out += [os.path.join(KOK, d) for d in os.listdir(KOK)]
    return [d for d in out if os.path.isfile(os.path.join(d, "plan.md"))]


def acilis(dizin):
    # sıralama anahtarı: plan.md "Açıldı" satırı (dizin adında saat yok); aynı saniyede açılanlarda plan.md'nin dosya zamanı
    plan, ns = os.path.join(dizin, "plan.md"), 0
    try:
        with open(plan, encoding="utf-8", errors="replace") as f:
            m = re.search(r"^- Açıldı: (\S+ \S+)", f.read(2000), re.M)
        ns = os.stat(plan).st_mtime_ns
    except OSError:
        m = None
    return (m.group(1) if m else "", ns, dizin)


def gorunen_ad(dizin):
    return "dn/" + os.path.basename(os.path.dirname(dizin)) if icinde(DN_KOK, dizin) else os.path.basename(dizin)


def kayit_dizini(arg):
    if arg == "son":
        hepsi = sorted(kayitlar(), key=acilis)
        if not hepsi:
            raise SystemExit("kayıt yok (%s, %s)" % (DN_KOK, KOK))
        return hepsi[-1]
    adaylar = [os.path.join(DN_KOK, cn_dizin_adi(arg)), os.path.join(KOK, arg)] if not os.path.isabs(arg) and os.sep not in arg else []
    adaylar.append(os.path.abspath(os.path.expanduser(arg)))
    for yol in adaylar:
        if not (icinde(DN_KOK, yol) or icinde(KOK, yol)) or yol in (DN_KOK, KOK):
            continue
        for d in (os.path.join(yol, "logs"), yol):  # iş dizini (dn/<no>) verildiyse kayıt logs/ altındadır
            if os.path.isfile(os.path.join(d, "plan.md")):
                return d
    raise SystemExit("kayıt bulunamadı: %s — numara (29000), dizin ya da \"son\" yaz; önce: is-kaydi.py ac <etiket> [--cn <no>]  (kökler: %s, %s)"
                     % (arg, DN_KOK, KOK))


def yeni_dosya(yol):
    taban, uzanti = os.path.splitext(yol)
    i = 2
    while os.path.exists(yol):
        yol = "%s-%d%s" % (taban, i, uzanti)
        i += 1
    return yol


def yoksa_yaz(yol, metin):
    if os.path.exists(yol):
        return False
    with open(yol, "w", encoding="utf-8") as f:
        f.write(metin)
    return True


def secenek(argv, ad, varsayilan):
    return argv[argv.index(ad) + 1] if ad in argv and argv.index(ad) + 1 < len(argv) else varsayilan


def ac(argv):
    cn = secenek(argv, "--cn", "").strip()
    etiket = "" if argv[1].startswith("--") else guvenli_ad(argv[1])
    etiket = re.sub(r"^\d{8}(-\d{4})?-?", "", etiket)  # etikete yazılmış tarih(-saat) yinelenmez
    alanlar = dict(zaman=zaman("%Y-%m-%d %H:%M:%S"), cn=cn or "verilmedi",
                   sunucular=secenek(argv, "--sunucular", "verilmedi"), istek=secenek(argv, "--istek", "verilmedi"))
    if cn:
        no = cn_dizin_adi(cn)
        for c in ("dn" + no, no):  # etikete yazılmış CN yinelenmez: "dn29000-guncelleme" → "guncelleme"
            if etiket == c or etiket.startswith(c + "-"):
                etiket = etiket[len(c):].strip("-")
                break
        dizin = os.path.join(DN_KOK, no)
        kayit = os.path.join(dizin, "logs")
        vardi = os.path.isfile(os.path.join(kayit, "plan.md"))
        os.makedirs(os.path.join(kayit, "okuma"), exist_ok=True)
        yoksa_yaz(os.path.join(dizin, "README.md"), BENIOKU.format(etiket=etiket or "iş", **alanlar))
        yoksa_yaz(os.path.join(kayit, "plan.md"), PLAN.format(ad="%s %s" % (cn, etiket), **alanlar))
        yoksa_yaz(os.path.join(kayit, "sonuc.md"), SONUC.format(ad="%s %s" % (cn, etiket)))
        print(dizin)
        if vardi:
            print("zaten açık (aynı değişiklik numarası) — bu dizinle devam et; yeni dizin açılmadı, var olan dosyalara dokunulmadı")
        else:
            print("içinde: README.md (iş bilgisi) · logs/plan.md · logs/sonuc.md · logs/okuma/ — iş envanteri (hosts.ini) ve playbook'lar "
                  "(01-<ad>.yaml …) da bu dizine")
        return 0
    ad = "-".join(x for x in (zaman("%Y%m%d"), etiket or "is") if x)
    dizin = yeni_dosya(os.path.join(KOK, ad))
    os.makedirs(os.path.join(dizin, "okuma"))
    yoksa_yaz(os.path.join(dizin, "plan.md"), PLAN.format(ad=os.path.basename(dizin), **alanlar))
    yoksa_yaz(os.path.join(dizin, "sonuc.md"), SONUC.format(ad=os.path.basename(dizin)))
    print(dizin)
    return 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import datetime")[0].replace("# ", "").replace("#!/usr/bin/env python3\n", ""))
        return 0
    if argv[0] == "ac" and len(argv) > 1:
        return ac(argv)
    if argv[0] == "ekle" and len(argv) > 2:
        dizin = kayit_dizini(argv[1])
        os.makedirs(os.path.join(dizin, "okuma"), exist_ok=True)
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
        hepsi = sorted(kayitlar(), key=acilis)
        if not hepsi:
            print("kayıt yok (%s, %s)" % (DN_KOK, KOK))
            return 0
        sozcuk = argv[1].lower() if len(argv) > 1 else ""
        for d in hepsi:
            metin = open(os.path.join(d, "plan.md"), encoding="utf-8", errors="replace").read()
            if sozcuk and sozcuk not in (gorunen_ad(d) + metin).lower():
                continue
            sun = re.search(r"^- Sunucular: (.*)$", metin, re.M)
            print("%-45s %s" % (gorunen_ad(d), sun.group(1) if sun else ""))
        return 0
    print("alt komut: ac | ekle | sonuc | liste")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
