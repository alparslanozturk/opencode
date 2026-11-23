#!/usr/bin/env python3
# is-kaydi.py — saha işleri için iş kaydı: plan, okuma kanıtı ve sonuç tek dizinde birikir; zamanla kurumun iş bilgi tabanı olur.
# Alp (2026-11-03, ADR-0007 §6-7): "geçici işler için bir planning proposal olsun … database gibi … normal projelerden farklı bir dizinde".
# Alp (2026-11-12, ADR-0007 §9): "her bir değişiklik numarası için dn dizininin içinde numarayla bir dizin açıyoruz, playbook'ları
# oraya atıyoruz" → değişiklik numaralı işin HER ŞEYİ tek dizinde:
#   <çalışma dizini>/dn/<numara>/   hosts.ini (iş envanteri — is-envanter.py) · 01-<ad>.yaml, 02-… (playbook'lar) · README.md (iş bilgisi)
#                                   logs/plan.md · logs/sonuc.md · logs/okuma/ (kanıt)
# CN'siz iş (kriz, kurulum, bulgu …; Alp 2026-11-23 "host dosyası her zaman kendi dizininde"): <çalışma kökü>/is/<YYYYMMDD>-<etiket>/ —
#   CN'li işle aynı düzen (README.md, hosts.ini, playbook'lar, logs/); etiket türle başlar (kriz-elektrik); is-envanter.py aynı etiketle aynı
#   dizini kullanır; aynı gün aynı etiket = aynı iş. IS_KAYIT_KOK ile değişir. Eski kayıtlar (~/ai/work/is-kayitlari, IS_ESKI_KOK) yalnız okunur.
# Betik YALNIZ bu iki kökün altına yazar, var olan dosyanın üstüne yazmaz. Kurum verisi içerir — sahada kalır, opencode deposuna kopyalanmaz.
#
#   is-kaydi.py ac <etiket> [--cn <no>] [--sunucular a,b] [--istek "<metin>"]   → kayıt dizini, yolunu basar
#       --cn 29000 | dn29000 → dn/29000/ (dizin adında tarih/saat YOK; aynı numara yeniden açılmaz — iş sürüyorsa aynı dizin, eksik
#       dosya tamamlanır). CN yoksa <YYYYMMDD>-<etiket> (gün, saat yok; aynı ad varsa -2, -3 …). Tarihi/CN'yi etikete yazma.
#   <komut> | is-kaydi.py ekle <kayıt> <ad>      → stdin'i okuma/<tarih-saat>-<ad>.txt olarak saklar
#   is-kaydi.py sonuc <kayıt> "<satır>"          → sonuc.md'ye zaman damgalı satır ekler
#   is-kaydi.py liste [<sözcük>…] [--tur cn|kriz|kurulum|bulgu|is] [--tarih YYYY-MM[-DD]]
#                                                → kayıtları listeler/arar: dizin adı + plan.md + README.md (notlar) + sonuc.md; eşleşen
#                                                  satırı dosya:satır ile basar; birden çok sözcük = hepsi geçmeli. CN'siz işte tür
#                                                  etiketin başından okunur (kriz-…, kurulum-…, bulgu-…; yoksa "is").
#   is-kaydi.py not <kayıt> "<bilgi>" [--kaynak <kaynak>] → işin README.md'sine "## Notlar" altına zaman damgalı satır EKLER (başka satıra
#       dokunmaz). Uydurma yok (Alp, 2026-11-23): her not kaynaklı — --kaynak yoksa "Alp" (kullanıcının sözü, aynen); ölçüm için
#       --kaynak "komut: <kısa komut>"; çıkarım için --kaynak tahmin (satır "tahmin:" ile başlar). Başka kaynak reddedilir (çıkış 2).
#       Parola: iş sırasında görülen otomatik parolalar (Redis, veritabanı, token) README'ye yazılır — Alp (2026-11-23): "otomatik gelen
#       parolaların hepsini readme'ye kaydet"; kurumsal bilgiye girmez. İş kaydı sahada kalır, depoya girmez.
#   <kayıt> = değişiklik numarası (29000) | dizin yolu/adı | son   ("son" = en son AÇILAN kayıt; emin değilsen numarayı yaz)
import datetime
import os
import re
import sys



SABIT_KOK = "~/ai/work/opencode"  # Alp (2026-11-23): "genelde orada çalışıyorum … sabit olabilir" — ansible/, dn/, kurumsal-bilgi.ini burada


def calisma_koku():
    # Kök sırası (ansible/is-envanter.py ile aynı): 1) OPS_CALISMA_KOK · 2) iş dizininin içinden (…/dn/<no>[/logs]) çalıştırıldıysa onun üstü ·
    # 3) sabit kök (~/ai/work/opencode) varsa — opencode hangi dizinde açılırsa açılsın dn/ ve envanter aynı yerde · 4) çalışma dizini.
    ortam = os.environ.get("OPS_CALISMA_KOK")
    if ortam:
        return os.path.abspath(os.path.expanduser(ortam))
    c = a = os.getcwd()
    for _ in range(3):
        if os.path.basename(a) == "dn" and any(os.path.isdir(os.path.join(os.path.dirname(a), k)) for k in ("ansible", "inventories", "inventory")):
            return os.path.dirname(a)
        a = os.path.dirname(a)
    sabit = os.path.abspath(os.path.expanduser(os.environ.get("OPS_SABIT_KOK") or SABIT_KOK))  # test: OPS_SABIT_KOK=/yok
    if os.path.isdir(sabit):
        return sabit
    return c


DN_KOK = os.path.abspath(os.path.expanduser(os.environ.get("IS_DN_KOK") or os.path.join(calisma_koku(), "dn")))
KOK = os.path.abspath(os.path.expanduser(os.environ.get("IS_KAYIT_KOK") or os.path.join(calisma_koku(), "is")))
ESKI_KOK = os.path.abspath(os.path.expanduser(os.environ.get("IS_ESKI_KOK") or "~/ai/work/is-kayitlari"))  # 2026-11-23 öncesi; yalnız okunur

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

BENIOKU_IS = """# {etiket} — {ad}

""" + BASLIK + """
## Bu dizinde
- `hosts.ini` — iş envanteri: yalnız bu işin sunucuları (`is-envanter.py {etiket} <liste>` aynı dizine yazar)
- playbook'lar (`01-<ad>.yaml` …) · `logs/plan.md` plan · `logs/sonuc.md` ölçülen sonuç · `logs/okuma/` okuma kanıtı

## Durum
-
"""

BENIOKU = """# Değişiklik {cn} — {etiket}

""" + BASLIK + """
## Bu dizinde
- `hosts.ini` — iş envanteri: yalnız bu işin sunucuları (is-envanter.py üretir; DTL/STL gibi aşamalar dosyada grup: `-l <grup>`)
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


def kayitlar(eski=True):
    # plan.md taşıyan kayıt dizinleri: CN'li (dn/<no>/logs) + CN'siz (is/<ad>/logs) + eski CN'siz (is-kayitlari/<ad>, yalnız okuma)
    out = []
    for kok in (DN_KOK, KOK):
        if os.path.isdir(kok):
            out += [os.path.join(kok, d, "logs") for d in os.listdir(kok)]
    if eski and os.path.isdir(ESKI_KOK) and ESKI_KOK not in (KOK, DN_KOK):
        out += [os.path.join(ESKI_KOK, d) for d in os.listdir(ESKI_KOK)]
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
    is_dizini = os.path.dirname(dizin) if os.path.basename(dizin) == "logs" else dizin
    if icinde(DN_KOK, is_dizini):
        return "dn/" + os.path.basename(is_dizini)
    if icinde(KOK, is_dizini):
        return "is/" + os.path.basename(is_dizini)
    return os.path.basename(is_dizini)


def kayit_dizini(arg):
    if arg == "son":
        hepsi = sorted(kayitlar(eski=False), key=acilis)  # "son" yalnız yeni köklerden — eski kayda yazılmaz
        if not hepsi:
            raise SystemExit("kayıt yok (%s, %s)" % (DN_KOK, KOK))
        return hepsi[-1]
    kisa = re.sub(r"^(dn|is)/", "", arg)
    adaylar = ([os.path.join(DN_KOK, cn_dizin_adi(kisa)), os.path.join(KOK, kisa), os.path.join(ESKI_KOK, kisa)]
               if not os.path.isabs(arg) and os.sep not in kisa else [])
    adaylar.append(os.path.abspath(os.path.expanduser(arg)))
    for yol in adaylar:
        if not any(icinde(k, yol) for k in (DN_KOK, KOK, ESKI_KOK)) or yol in (DN_KOK, KOK, ESKI_KOK):
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
    dizin = os.path.join(KOK, ad)  # aynı gün + aynı etiket = aynı iş (is-envanter.py de buraya yazar)
    kayit = os.path.join(dizin, "logs")
    vardi = os.path.isfile(os.path.join(kayit, "plan.md"))
    os.makedirs(os.path.join(kayit, "okuma"), exist_ok=True)
    yoksa_yaz(os.path.join(dizin, "README.md"), BENIOKU_IS.format(etiket=etiket or "is", ad=ad, **alanlar))
    yoksa_yaz(os.path.join(kayit, "plan.md"), PLAN.format(ad=ad, **alanlar))
    yoksa_yaz(os.path.join(kayit, "sonuc.md"), SONUC.format(ad=ad))
    print(dizin)
    if vardi:
        print("zaten açık (aynı gün, aynı etiket) — bu dizinle devam et; yeni dizin açılmadı, var olan dosyalara dokunulmadı")
    else:
        print("içinde: README.md · logs/plan.md · logs/sonuc.md · logs/okuma/ — iş envanteri: is-envanter.py %s <liste> (aynı dizine)" % (etiket or "is"))
    return 0




def not_ekle(arg, metin, kaynak="Alp"):
    metin = " ".join(metin.split())
    kaynak = " ".join(kaynak.split())
    if not metin:
        raise SystemExit("not boş")
    if kaynak == "tahmin":
        metin = metin if metin.lower().startswith("tahmin:") else "tahmin: " + metin
    elif not (kaynak == "Alp" or kaynak.startswith("Alp ") or re.match(r"komut:\s*\S", kaynak)):
        print("REDDEDİLDİ: kaynak %r — yalnız Alp (kullanıcının sözü), \"komut: <komut>\" (ölçüm) ya da tahmin" % kaynak)
        return 2
    dizin = kayit_dizini(arg)
    is_dizini = os.path.dirname(dizin) if os.path.basename(dizin) == "logs" else dizin  # dn/<no>/logs → dn/<no>
    readme = os.path.join(is_dizini, "README.md")
    if not os.path.exists(readme):
        with open(readme, "w", encoding="utf-8") as f:
            f.write("# %s\n" % gorunen_ad(dizin))
    eski = open(readme, encoding="utf-8").read()
    ek = "" if eski.endswith("\n") else "\n"
    if not re.search(r"^## Notlar\b", eski, re.M):
        ek += "\n## Notlar (kaynaklı: [Alp] kullanıcının sözü · [komut: …] ölçüm · \"tahmin:\" çıkarım)\n"
    ek += "- %s %s [%s]\n" % (zaman("%Y-%m-%d %H:%M"), metin, kaynak)
    with open(readme, "a", encoding="utf-8") as f:
        f.write(ek)
    print("%s ← %s" % (readme, metin))
    return 0


TURLER = ("kriz", "kurulum", "bulgu")


def kayit_bilgi(d):
    """Kayıt dizini → (tür, açılış tarihi, görünen ad, sunucular, [(dosya, metin)])."""
    is_dizini = os.path.dirname(d) if os.path.basename(d) == "logs" else d
    dosyalar = [os.path.join(d, "plan.md"), os.path.join(is_dizini, "README.md"), os.path.join(d, "sonuc.md")]
    metinler = []
    for f in dosyalar:
        try:
            metinler.append((f, open(f, encoding="utf-8", errors="replace").read()))
        except OSError:
            pass
    plan = metinler[0][1] if metinler and metinler[0][0].endswith("plan.md") else ""
    acil = re.search(r"^- Açıldı: (\S+)", plan, re.M)
    sun = re.search(r"^- Sunucular: (.*)$", plan, re.M)
    if icinde(DN_KOK, d):
        tur = "cn"
    else:
        etiket = re.sub(r"^\d{8}-", "", os.path.basename(is_dizini)).lower()
        tur = next((t for t in TURLER if etiket == t or etiket.startswith(t + "-")), "is")
    return tur, acil.group(1) if acil else "", gorunen_ad(d), sun.group(1) if sun else "", metinler


def liste(argv):
    """liste [<sözcük>…] [--tur cn|kriz|kurulum|bulgu|is] [--tarih YYYY-MM[-DD]] — ad, plan.md, README.md, sonuc.md içinde arar."""
    tur_s = secenek(argv, "--tur", "").lower()
    tarih_s = secenek(argv, "--tarih", "")
    sozcukler = [x.lower() for i, x in enumerate(argv) if not x.startswith("--") and (i == 0 or argv[i - 1] not in ("--tur", "--tarih"))]
    desenler = [re.compile(r"(?<!\w)" + re.escape(k), re.I) for k in sozcukler]  # sözcük başı: "os" → "hosts" eşleşmez
    hepsi = sorted(kayitlar(), key=acilis)
    if not hepsi:
        print("kayıt yok (%s, %s)" % (DN_KOK, KOK))
        return 0
    bulunan = 0
    for d in hepsi:
        tur, tarih, ad, sun, metinler = kayit_bilgi(d)
        if tur_s and tur != tur_s:
            continue
        if tarih_s and not tarih.startswith(tarih_s):
            continue
        eslesme = []
        ust = os.path.dirname(os.path.dirname(d) if os.path.basename(d) == "logs" else d)  # dn/ ya da is-kayitlari/
        if sozcukler:
            tum = ad + "\n" + "\n".join(m for _, m in metinler)
            if not all(r.search(tum) for r in desenler):
                continue
            for f, m in metinler:
                for no, sat in enumerate(m.splitlines(), 1):
                    if any(r.search(sat) for r in desenler):
                        eslesme.append("    %s:%d  %s" % (os.path.relpath(f, ust), no, sat.strip()[:150]))
        bulunan += 1
        print("%-8s %-10s %-38s %s" % (tur, tarih or "?", ad, sun))
        for e in eslesme[:5]:
            print(e)
        if len(eslesme) > 5:
            print("    … %d eşleşme daha" % (len(eslesme) - 5))
    if not bulunan:
        print("eşleşen kayıt yok" + (" (sözcük: %s)" % " ".join(sozcukler) if sozcukler else ""))
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
    if argv[0] == "not" and len(argv) > 2:
        kaynak = secenek(argv, "--kaynak", "Alp")
        kalan = argv[2:]
        if "--kaynak" in kalan:
            i = kalan.index("--kaynak")
            kalan = kalan[:i] + kalan[i + 2:]
        return not_ekle(argv[1], " ".join(kalan), kaynak)
    if argv[0] == "liste":
        return liste(argv[1:])
    print("alt komut: ac | ekle | sonuc | not | liste")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
