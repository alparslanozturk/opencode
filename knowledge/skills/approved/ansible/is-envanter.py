#!/usr/bin/env python3
# is-envanter.py — iş (değişiklik) envanteri: CN numarası (ya da kriz/kurulum/is etiketi) + sunucu listesi verilince ana
# envanterlerden (ansible/inventories/hosts*.ini …) yalnız o sunucuları içeren ayrı bir INI üretir:
#   ansible/is/hosts-<ETIKET>-<YYYYMMDD-HHMM>.ini
# Host satırları, grupları, üst grupları (:children) ve grup değişkenleri ([g:vars]) kaynaktan AYNEN alınır — ad/IP
# uydurulmaz; envanterde olmayan öğe [is_ek] grubuna olduğu gibi yazılır ve raporlanır. Var olan dosyanın üzerine yazmaz.
# Ana envantere dokunmaz. Ayrıştırma kume-bul.py ile aynı (engine/plugins/lib/envanter.ts kuralları).
# Saha G100 (Alp, 2026-10-22): "değişiklik numarası verdiğim için hosts yerine hosts-<numara> ini dosyası oluştursa iyi olur".
import datetime
import importlib.util
import os
import re
import sys

BURASI = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "kume_bul", os.path.join(BURASI, "..", "kume-bul", "kume-bul.py"))
kb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(kb)

IS_DIZIN = os.path.join("ansible", "is")
KULLANIM = """kullanım:
  is-envanter.py <ETIKET> <sunucu|kısa ad|IP|aralık|grup> ... [--dosya <ana.ini>]... [--not "<metin>"]
  is-envanter.py <ETIKET> -            # sunucular stdin'den (yapıştırılan liste, serbest biçim)
  is-envanter.py --liste               # ansible/is/ altındaki iş envanterleri
ETIKET: CN numarası (CHG0012345) ya da kriz | kurulum | is (CN'siz iş).
Aralık: wor07-14, 10.0.9.127-134, yalın 07-14 (envanterde tek önekle karşılanırsa).
Çıktı: ansible/is/hosts-<ETIKET>-<YYYYMMDD-HHMM>.ini — ana envanter değişmez, üzerine yazılmaz."""


def aralik_ac(t):
    # kilit.ts aralikAc ile aynı: "wor07-14" → wor07…wor14, "10.0.0.127-134" → son oktet; en çok 64 ad
    m = re.match(r"^(\d{1,3}\.\d{1,3}\.\d{1,3}\.)(\d{1,3})-(\d{1,3})$", t) or re.match(
        r"^([a-z][a-z0-9]*?[a-z-])(\d+)-(?:\1)?(\d+)$", t, re.I)
    if not m:
        return [t]
    bas, son = int(m.group(2)), int(m.group(3))
    ip = t[0].isdigit()
    if not (son > bas) or son - bas > 63 or (ip and son > 255):
        return [t]
    gen = 0 if ip else len(m.group(2))
    return [m.group(1) + str(i).zfill(gen) for i in range(bas, son + 1)]


def ogeler(argv_sunucular):
    metin = " ".join(argv_sunucular)
    if argv_sunucular == ["-"]:
        metin = sys.stdin.read()
    metin = re.sub(r"\bansible_(?:ssh_)?host=", " ", metin, flags=re.I)
    out = []
    for t in re.split(r"[\s,;]+", metin):
        t = t.strip("\"'`*•()[]<>.:!?").lower()
        t = re.sub(r"['’].*$", "", t)  # wor07'de → wor07
        if not t or "=" in t or t in ("ve", "ile", "and", "-", "+", "&"):
            continue
        if re.fullmatch(r"\d{1,3}[.)]?", t):  # madde numarası
            continue
        out.extend(aralik_ac(t))
    return list(dict.fromkeys(out))


def grup_uyeleri(yol, grup, gruplar, cocuklar, gorulen=None):
    gorulen = gorulen or set()
    if grup in gorulen:
        return []
    gorulen.add(grup)
    out = list(gruplar.get((yol, grup), []))
    for alt in cocuklar.get((yol, grup), set()):
        out += grup_uyeleri(yol, alt, gruplar, cocuklar, gorulen)
    return out


def coz(ogeler_, kayitlar, gruplar, cocuklar):
    adlar = sorted({k["ad"] for k in kayitlar})
    kisalar = [(a, a.split(".")[0]) for a in adlar]
    secilen, bulunamayan, belirsiz, notlar = [], [], [], []

    def ekle(a):
        if a not in secilen:
            secilen.append(a)

    for o in ogeler_:
        ar = re.fullmatch(r"(\d{2,3})-(\d{2,3})", o)
        if ar:
            a, z, gen = int(ar.group(1)), int(ar.group(2)), len(ar.group(1))
            nolar = [str(i).zfill(gen) for i in range(a, z + 1)] if 0 < z - a <= 63 else []
            onekler = {k[: -len(nolar[0])] for _, k in kisalar if nolar and k.endswith(nolar[0])}
            tutan = [p for p in onekler if re.search(r"[a-z]$", p) and all(any(k == p + n for _, k in kisalar) for n in nolar)]
            if len(tutan) == 1:
                for ad, k in kisalar:
                    if any(k == tutan[0] + n for n in nolar):
                        ekle(ad)
                notlar.append("%s → %s%s…%s%s" % (o, tutan[0], nolar[0], tutan[0], nolar[-1]))
            elif len(tutan) > 1:
                belirsiz.append("%s (%s)" % (o, ", ".join(p + nolar[0] + "…" for p in sorted(tutan)[:4])))
            else:
                bulunamayan.append(o)
            continue
        grup_dosyalari = {y for (y, g) in list(gruplar) + list(cocuklar) if g == o}
        if grup_dosyalari:
            for y in sorted(grup_dosyalari):
                for a in grup_uyeleri(y, o, gruplar, cocuklar):
                    ekle(a)
            continue
        tam = sorted({k["ad"] for k in kayitlar if o in (k["ad"], k["kisa"]) or o in k["ipler"]})
        if tam:
            for a in tam:
                ekle(a)
            continue
        sonek = sorted({a for a, k in kisalar if re.search(r"\d", o) and len(o) >= 3 and not re.fullmatch(r"[\d.:]+", o)
                        and k.endswith(o)})
        if len(sonek) == 1:
            ekle(sonek[0])
        elif sonek:
            belirsiz.append("%s (%s%s)" % (o, ", ".join(sonek[:4]), " …" if len(sonek) > 4 else ""))
        else:
            bulunamayan.append(o)
    return secilen, bulunamayan, belirsiz, notlar


def host_satiri(k):
    deg = " ".join("%s=%s" % (a, v if re.fullmatch(r"[^\s'\"]+", v) else "'%s'" % v) for a, v in k["vars"].items())
    return ("%s %s" % (k["ad"], deg)).strip()


def liste():
    if not os.path.isdir(IS_DIZIN):
        print("%s yok — henüz iş envanteri üretilmemiş." % IS_DIZIN)
        return 0
    for g in sorted(os.listdir(IS_DIZIN)):
        yol = os.path.join(IS_DIZIN, g)
        if not g.endswith(".ini"):
            continue
        bas, n = "", "?"
        for s in open(yol, encoding="utf-8", errors="replace"):
            if s.startswith("# İş envanteri"):
                bas = s[2:].strip()
            elif s.startswith("# Host sayısı:"):
                n = s.split(":", 1)[1].strip()
        print("%s  %s  (%s host)" % (yol, bas, n))
    return 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(KULLANIM)
        return 0
    if argv[0] == "--liste":
        return liste()
    dosya_arg, notu, kalan = [], "", []
    i = 0
    while i < len(argv):
        if argv[i] == "--dosya" and i + 1 < len(argv):
            dosya_arg.append(argv[i + 1])
            i += 2
        elif argv[i] == "--not" and i + 1 < len(argv):
            notu = argv[i + 1]
            i += 2
        else:
            kalan.append(argv[i])
            i += 1
    if len(kalan) < 2:
        print(KULLANIM)
        return 1
    etiket = kalan[0].strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{2,40}", etiket):
        print("etiket geçersiz: %r — CN numarası (CHG0012345) ya da kriz/kurulum/is" % etiket)
        return 1
    etiket = etiket.upper() if re.search(r"\d", etiket) else etiket.lower()
    istenen = ogeler(kalan[1:])
    if not istenen:
        print("sunucu listesi boş")
        return 1

    # iş envanterleri (ansible/is/) kaynak değildir — kume-bul.py ATLA'da da "is" var
    kaynaklar = [os.path.relpath(d) for d in (dosya_arg or kb.dosyalar(os.getcwd()))]
    kaynaklar = [d for d in kaynaklar if not os.path.normpath(d).startswith(IS_DIZIN + os.sep)]
    kayitlar, gruplar, cocuklar, grup_vars = [], {}, {}, {}
    for d in kaynaklar:
        kb.ayristir(d, kayitlar, gruplar, cocuklar, grup_vars)
    if not kayitlar:
        print("Ana envanter bulunamadı/boş (cwd=%s; ansible/, inventories/ altında *.ini / hosts*). --dosya ile ver." % os.getcwd())
        return 1

    secilen, bulunamayan, belirsiz, notlar = coz(istenen, kayitlar, gruplar, cocuklar)
    if belirsiz:
        print("❓ birden çok host'a uyuyor — tam adı sor, dosya yazılmadı:")
        for b in belirsiz:
            print("  " + b)
        return 2
    if not secilen and not bulunamayan:
        print("seçilen host yok")
        return 1

    simdi = datetime.datetime.now()
    os.makedirs(IS_DIZIN, exist_ok=True)
    yol = os.path.join(IS_DIZIN, "hosts-%s-%s.ini" % (etiket, simdi.strftime("%Y%m%d-%H%M")))
    if os.path.exists(yol):
        print("var olan dosya: %s — üzerine yazılmadı (bir dakika sonra yeniden üret ya da eskisini kullan)" % yol)
        return 1

    sec = set(secilen)
    satirlar = [
        "# İş envanteri — %s — %s" % (etiket, simdi.strftime("%Y-%m-%d %H:%M")),
        "# Üreten: is-envanter.py — ana envanterden türetildi; elle düzenleme, gerekirse yeniden üret.",
        "# İstenen: %s" % " ".join(kalan[1:] if kalan[1:] != ["-"] else istenen)[:400],
    ]
    if notu:
        satirlar.append("# Not: %s" % notu.replace("\n", " ")[:400])
    kullanilan = [d for d in kaynaklar if any(k["dosya"] == d and k["ad"] in sec for k in kayitlar)]
    satirlar.append("# Kaynak: %s" % (", ".join(kullanilan) or "-"))
    satirlar.append("# Host sayısı: %d" % (len(secilen) + len(bulunamayan)))
    if bulunamayan:
        satirlar.append("# Envanterde yok (olduğu gibi [is_ek] grubuna yazıldı): %s" % ", ".join(bulunamayan))
    uyarilar = []
    for kok in sorted({os.path.dirname(d) for d in kullanilan}):
        for v in ("group_vars", "host_vars"):
            if os.path.isdir(os.path.join(kok, v)):
                uyarilar.append("%s/%s var — bu iş envanteriyle okunmaz; o değişkenler gerekiyorsa ana envanteri "
                                "-i %s/<dosya> --limit <aşağıdaki liste> ile kullan" % (kok, v, kok))
    for d in kullanilan:
        satirlar += ["", "# --- %s ---" % d]
        sec_gruplar = []
        for k in kayitlar:
            if k["dosya"] == d and k["ad"] in sec and k["grup"] not in sec_gruplar:
                sec_gruplar.append(k["grup"])
        ustler = []
        for g in sec_gruplar:
            for u in kb.ustler(d, g, cocuklar):
                if u not in ustler and u not in sec_gruplar:
                    ustler.append(u)
        for g in sec_gruplar:
            satirlar.append("[%s]" % g)
            for k in kayitlar:
                if k["dosya"] == d and k["grup"] == g and k["ad"] in sec:
                    satirlar.append("%s  # %s:%d" % (host_satiri(k), os.path.basename(d), k["satir"]))
        dahil = set(sec_gruplar) | set(ustler)
        for u in ustler:
            altlar = sorted(c for c in cocuklar.get((d, u), set()) if c in dahil)
            if altlar:
                satirlar.append("[%s:children]" % u)
                satirlar += altlar
        for g in ["all"] + sec_gruplar + ustler:
            v = grup_vars.get((d, g))
            if v:
                satirlar.append("[%s:vars]" % g)
                satirlar += [s for _, s in v]
    if bulunamayan:
        satirlar += ["", "# envanterde yok — ad/IP'yi kullanıcıyla doğrula", "[is_ek]"] + bulunamayan
    with open(yol, "w", encoding="utf-8") as f:
        f.write("\n".join(satirlar) + "\n")

    print("yazıldı: %s (%d host)" % (yol, len(secilen) + len(bulunamayan)))
    for n in notlar:
        print("  aralık: " + n)
    for a in secilen:
        ks = [k for k in kayitlar if k["ad"] == a]
        ip = sorted({i for k in ks for i in k["ipler"]})
        yer = ", ".join("%s:%d [%s]" % (os.path.basename(k["dosya"]), k["satir"], k["grup"]) for k in ks[:3])
        print("  %-28s %-16s %s" % (a, " ".join(ip) or "-", yer))
    for b in bulunamayan:
        print("  %-28s %-16s ⚠️ envanterde yok — doğrula" % (b, "-"))
    for u in uyarilar:
        print("⚠️ " + u)
    print("kullanım: ansible-playbook -i %s --limit %s <playbook.yml>" % (yol, ",".join(secilen + bulunamayan)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
