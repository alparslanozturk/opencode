#!/usr/bin/env python3
# is-envanter.py — iş (değişiklik) envanteri: değişiklik numarası (ya da kriz/kurulum/is etiketi) + sunucu listesi verilince ana
# envanterlerden (ansible/inventories/hosts*.ini …) yalnız o sunucuları içeren ayrı bir INI üretir.
#   değişiklik numarası → dn/<numara>/hosts.ini        (işin dizini: playbook'lar, README.md, logs/ da orada — rapor/is-kaydi.py)
#                          dn/<numara>/hosts-<ad>.ini   (--ad ile aşama envanteri: aynı işin başka sunucu grubu, ör. --ad stl)
#   CN'siz (kriz|kurulum|is) → ansible/inventories/hosts-<YYYYMMDD>-<etiket>.ini   (gün, saat YOK)
# Düzen Alp'in sahadaki yapısıdır (2026-11-12, ADR-0007 §9): "her bir değişiklik numarası için dn dizininin içinde numarayla bir
# dizin açıyoruz, playbook'ları oraya atıyoruz … daha sade, daha anlaşılır oldu"; dosya adında saat yok ("saati niye ekliyorsun").
# Aynı adla dosya varsa: sunucular aynıysa yeniden yazılmaz (o dosya kullanılır), farklıysa -2, -3 … eklenir (üzerine yazmaz).
# Host satırları, grupları, üst grupları (:children) ve grup değişkenleri ([g:vars]) kaynaktan AYNEN alınır — ad/IP
# uydurulmaz; envanterde olmayan öğe [is_ek] grubuna olduğu gibi yazılır ve raporlanır.
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

IS_DIZIN = os.path.join("ansible", "inventories")  # CN'siz iş envanterleri (ana envanterin yanında)
DN_DIZIN = "dn"  # değişiklik numaralı işler: dn/<numara>/
CNSIZ = ("kriz", "kurulum", "is")
# Ana envanter dizinindeki iş envanteri adı (tarihli kopya: hosts-20261022-dn29000.ini, hosts-20261112-kriz.ini) — kaynak sayılmaz.
# Aynı desen kume-bul.py ve engine/plugins/lib/envanter.ts'te. dn/ zaten kaynak aranan dizinlerden değil.
IS_DESEN = re.compile(r"^hosts-(?:.+-\d{8}(?:-\d{4})?|\d{8}(?:-\d{4})?-.+)\.ini$", re.I)
KULLANIM = """kullanım:
  is-envanter.py <ETIKET> <sunucu|kısa ad|IP|aralık|grup> ... [--grup <iş grubu>] [--ad <aşama>] [--dosya <ana.ini>]... [--not "<metin>"]
  is-envanter.py <ETIKET> -            # sunucular stdin'den (yapıştırılan liste, serbest biçim)
  is-envanter.py --liste               # iş envanterleri (dn/<numara>/ ve ansible/inventories/)
ETIKET: değişiklik numarası (29000, dn29000, CHG0012345) ya da kriz | kurulum | is (CN'siz iş).
--grup: tüm seçilen host'ları ayrıca bu gruba koyar (playbook "hosts: <grup>" için, ör. google_captcha_cert; tire → _).
--ad:   aynı değişikliğin ayrı aşaması/sunucu grubu için ayrı dosya (dn/<numara>/hosts-<ad>.ini; ör. --ad stl).
Aralık: wor07-14, 10.0.9.127-134, yalın 07-14 (envanterde tek önekle karşılanırsa).
Çıktı: değişiklik numarası → dn/<numara>/hosts.ini · CN'siz → ansible/inventories/hosts-<YYYYMMDD>-<etiket>.ini (saat yok).
Ana envanter değişmez, var olan dosyanın üzerine yazılmaz. Çalışma dizininden çalıştır (dn/<numara> içinden de olur)."""


def calisma_koku():
    # komut iş dizininin içinden (…/dn/<no>[/logs]) çalıştırılsa da kök aynı kalır (rapor/is-kaydi.py ile aynı kural)
    c = a = os.getcwd()
    for _ in range(3):
        if os.path.basename(a) == "dn" and any(os.path.isdir(os.path.join(os.path.dirname(a), k)) for k in ("ansible", "inventories", "inventory")):
            return os.path.dirname(a)
        a = os.path.dirname(a)
    return c


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
    yollar = []
    if os.path.isdir(DN_DIZIN):
        for d in sorted(os.listdir(DN_DIZIN)):
            alt = os.path.join(DN_DIZIN, d)
            if os.path.isdir(alt):
                yollar += [os.path.join(alt, g) for g in sorted(os.listdir(alt)) if re.match(r"^hosts.*\.ini$", g, re.I)]
    if os.path.isdir(IS_DIZIN):
        yollar += [os.path.join(IS_DIZIN, g) for g in sorted(os.listdir(IS_DIZIN)) if IS_DESEN.match(g)]
    if not yollar:
        print("iş envanteri yok (%s/<numara>/hosts*.ini, %s/hosts-<gün>-<etiket>.ini)." % (DN_DIZIN, IS_DIZIN))
        return 0
    for yol in yollar:
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
    cwd, calisma = os.getcwd(), calisma_koku()
    if calisma != cwd:
        os.chdir(calisma)  # yollar çalışma dizinine göre basılır (dn/<no>/…)
    if argv[0] == "--liste":
        return liste()
    dosya_arg, notu, is_grup, asama, kalan = [], "", "", "", []
    i = 0
    while i < len(argv):
        if argv[i] == "--dosya" and i + 1 < len(argv):
            dosya_arg.append(os.path.join(cwd, os.path.expanduser(argv[i + 1])))
            i += 2
        elif argv[i] == "--ad" and i + 1 < len(argv):
            asama = re.sub(r"[^a-z0-9_-]+", "-", argv[i + 1].strip().lower()).strip("-")[:30]
            i += 2
        elif argv[i] == "--grup" and i + 1 < len(argv):
            # ansible grup adında yalnız harf/rakam/_ geçerli; tire uyarı bastırır ("Invalid characters were found in group names",
            # saha G116 os-upgrade-29107, ölçüldü 2.16) → _ yap, rakamla başlıyorsa g_ öneki
            is_grup = re.sub(r"\W", "_", argv[i + 1].strip().lower())
            is_grup = "g_" + is_grup if is_grup[:1].isdigit() else is_grup
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
    etiket = re.sub(r"^\d{8}(?:-\d{4})?-(?=.)", "", etiket)  # etikete yazılmış tarih yinelenmez (adı betik üretir)
    if not re.fullmatch(r"[A-Za-z0-9_-]{2,40}", etiket):
        print("etiket geçersiz: %r — değişiklik numarası (29000, CHG0012345) ya da kriz/kurulum/is" % etiket)
        return 1
    cnsiz = etiket.lower() in CNSIZ
    m = re.fullmatch(r"(?:dn[-_]?)?(\d+)", etiket, re.I)
    is_dizin = None if cnsiz else os.path.join(DN_DIZIN, m.group(1) if m else etiket)  # dn29000 / 29000 → dn/29000
    if m:
        etiket = "dn" + m.group(1)  # başlık satırında sahadaki yazımıyla
    istenen = ogeler(kalan[1:])
    if not istenen:
        print("sunucu listesi boş")
        return 1

    # iş envanterleri kaynak değildir (kume-bul.dosyalar zaten atlar; --dosya ile verilse de)
    kaynaklar = [os.path.relpath(d) for d in (dosya_arg or kb.dosyalar(os.getcwd()))]
    kaynaklar = [d for d in kaynaklar if not IS_DESEN.match(os.path.basename(d))]
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
    os.makedirs(is_dizin or IS_DIZIN, exist_ok=True)

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
    if is_grup:
        satirlar += ["", "# iş grubu — playbook'ta hosts: %s" % is_grup, "[%s]" % is_grup] + secilen + bulunamayan

    # Ad: dn/<numara>/hosts.ini (aşama: hosts-<ad>.ini) · CN'siz: ansible/inventories/hosts-<gün>-<etiket>.ini. Aynı ad varsa
    # üzerine yazılmaz: içerik (yorum dışı satırlar) aynıysa o dosya kullanılır, farklıysa -2, -3 … ile yeni dosya (eskisi kalır).
    def govde(ss):
        return [x.rstrip() for x in ss if x.strip() and not x.lstrip().startswith("#")]

    if is_dizin:
        taban = os.path.join(is_dizin, "hosts-" + asama if asama else "hosts")
    else:
        taban = os.path.join(IS_DIZIN, "hosts-%s-%s" % (simdi.strftime("%Y%m%d"), "-".join(x for x in (etiket, asama) if x)))
    yol, no, ayni = taban + ".ini", 1, False
    while os.path.exists(yol):
        with open(yol, encoding="utf-8", errors="replace") as f:
            if govde(f.read().split("\n")) == govde(satirlar):
                ayni = True
                break
        no += 1
        yol = "%s-%d.ini" % (taban, no)
    if ayni:
        print("zaten var (aynı sunucular): %s — yeniden yazılmadı, bu dosyayı kullan (%d host)" % (yol, len(secilen) + len(bulunamayan)))
    else:
        with open(yol, "w", encoding="utf-8") as f:
            f.write("\n".join(satirlar) + "\n")
        print("yazıldı: %s (%d host)" % (yol, len(secilen) + len(bulunamayan)))
        if no > 1:
            print("⚠️ aynı adla %d dosya daha var, sunucuları farklı — eskilere dokunulmadı; bu çağrının sunucuları yalnız bu dosyada, "
                  "kullanıcıya söyle%s" % (no - 1, " (aynı işin ayrı aşamasıysa adını ver: --ad <aşama>, ör. --ad stl)" if is_dizin and not asama else ""))
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
    pb = os.path.join(is_dizin, "01-<ad>.yaml") if is_dizin else "ansible/playbooks/<NN>-<ad>.yaml"
    if calisma != cwd:
        print("çalışma dizini: %s (yollar buna göre)" % calisma)
    print("okuma (çok sunucu, tek komut — for … ssh döngüsü yazma): ansible all -i %s -m shell -a '<okuma>' -t cikti/filo/<etiket>" % yol)
    print("değişiklik = playbook (ansible becerisi §0): %s — %s" % (pb, "işin playbook'ları bu dizinde, sıra numarasıyla (01-, 02- …); "
          "ansible/playbooks/ içinde hazırı varsa buraya kopyala" if is_dizin else "dizinde hazırı varsa onu kullan, yoksa sıradaki numarayla yaz"))
    print("  → playbook-denetim.py + --syntax-check → planı kullanıcıya göster, onayını bekle →")
    print("  önce TEK sunucu: ansible-playbook -i %s %s -l <sunucu> → hedefte ölç → kalan sunucular kullanıcının \"devam\"ıyla" % (yol, pb))
    if is_dizin and not os.path.isfile(os.path.join(is_dizin, "logs", "plan.md")):
        print("iş kaydı (README.md + logs/): python3 %s ac <işin kısa adı> --cn %s --istek \"<kullanıcının cümlesi>\"" % (
            os.path.normpath(os.path.join(BURASI, "..", "rapor", "is-kaydi.py")), etiket))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
