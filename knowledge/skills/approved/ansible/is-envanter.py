#!/usr/bin/env python3
# is-envanter.py — iş (değişiklik) envanteri: değişiklik numarası (ya da kriz/kurulum/is etiketi) + sunucu listesi verilince ana
# envanterlerden (ansible/inventories/hosts*.ini …) ve DNS'ten yalnız o sunucuları içeren TEK bir INI üretir.
#   değişiklik numarası → dn/<numara>/hosts.ini   (işin dizini: playbook'lar, README.md, logs/ da orada — rapor/is-kaydi.py)
#   CN'siz (kriz|kurulum|is) → ansible/inventories/hosts-<YYYYMMDD>-<etiket>.ini   (gün, saat YOK)
# Gruplar (Alp, 2026-11-12: "işle birlikte verdiğim bütün dosyaları aynı host dosyasına koyabilirsin … gruplandırabilirsin"): listedeki
# başlık satırı ("DTL:", "STL sunucuları (9):", "dtl: a b") ya da --ad <ad> → aynı hosts.ini içinde [dtl], [stl] … Sonraki çağrı yeni grubu
# ekler, var olanları korur; aynı grup farklı sunucularla gelirse --yenile olmadan yazmaz.
# DNS (Alp, 2026-11-12: "sunucuların isimlerini DNS'ten sorgulayıp host dosyasına düzgün giremiyor … en azından bir ping de kontrol
# edebiliriz"): envanterde olmayan ad DNS'ten doğrulanır (IP yorumda), çözülmeyen işaretlenir; her host'a ssh portu TCP ile denenir.
# Host satırları, grupları, üst grupları (:children) ve grup değişkenleri ([g:vars]) ana envanterden AYNEN alınır — ad/IP uydurulmaz.
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
  is-envanter.py <ETIKET> <sunucu|kısa ad|IP|aralık|grup> ... [--ad <grup>] [--grup <iş grubu>] [--dosya <ana.ini>]... [--not "<metin>"]
  is-envanter.py <ETIKET> -            # sunucular stdin'den (yapıştırılan liste, serbest biçim; "DTL:" gibi başlıklar grup olur)
  is-envanter.py --liste               # iş envanterleri (dn/<numara>/ ve ansible/inventories/)
ETIKET: değişiklik numarası (29000, dn29000, CHG0012345) ya da kriz | kurulum | is (CN'siz iş).
--ad:    sunucuları aynı hosts.ini içinde bu gruba koyar (ör. --ad stl → [stl]); önceki gruplar korunur.
--yenile: var olan grubu farklı sunucularla değiştirir (kullanıcı istediyse).
--grup:  tüm seçilen host'ları ayrıca bu gruba koyar (playbook "hosts: <grup>" için; tire → _).
--erisim-yok: ssh portu (TCP) denemesini atla.
Aralık: wor07-14, 10.0.9.127-134, yalın 07-14 (envanterde tek önekle karşılanırsa).
Envanterde olmayan ad DNS'ten doğrulanır ([is_ek]); çözülmeyen ⚠️ ile işaretlenir.
Çıktı: değişiklik numarası → dn/<numara>/hosts.ini · CN'siz → ansible/inventories/hosts-<YYYYMMDD>-<etiket>.ini (saat yok).
Ana envanter değişmez. Çalışma dizininden çalıştır (dn/<numara> içinden de olur)."""


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


# Başlık satırı → grup (Alp, 2026-11-12: "işle birlikte verdiğim bütün dosyaları aynı host dosyasına koyabilirsin … gruplandırabilirsin").
# "DTL:", "STL sunucuları (9):", "dtl: a b c" → grup dtl. Grup adı yalnız harf/_/- (rakam yok — rakamlı söz sunucu adıdır).
BASLIK = re.compile(r"^\s*[-*•#>]*\s*([^\W\d][\w/+&-]*)((?:\s+[^\s:=]+){0,3})\s*:(?!\S)(.*)$")
SATIR_ICI = re.compile(r"(?:^|\s)([^\W\d][\w-]*):(?=\s|$)")
GENEL = {"sunucu", "sunucular", "sunucuları", "sunucu_listesi", "liste", "hostlar", "host", "hosts", "server", "servers",
         "makineler", "hedef", "hedefler"}  # başlık ama grup değil
YOKSAY = {"cn", "dn", "chg", "değişiklik", "degisiklik", "not", "açıklama", "aciklama", "tarih", "saat"}  # satırın kalanı sunucu değil


TR_ASCII = {ord(a): b for a, b in zip("çğıöşüÇĞIİÖŞÜ", "cgiosucgiiosu")}


def grup_adi(t):
    # İnsanın yazdığı başlık → okunur grup adı: "STL/SXL" → stl_sxl, "DTL ERİŞİM" → dtl_erisim (Türkçe harf ASCII'ye; "İ".lower()
    # birleşik nokta bırakır). Tire/boşluk/eğik çizgi tek "_" olur (tireli grup adı ansible'da uyarı basar).
    g = re.sub(r"[^a-z0-9]+", "_", t.strip().translate(TR_ASCII).lower()).strip("_")
    return "g_" + g if g[:1].isdigit() else g


def gruplu_ogeler(metin, varsayilan=""):
    # → {grup: [öğe]} (sıra korunur); "" = grupsuz. Başlık satırı ya da satır içi "dtl:" sonrakileri o gruba alır.
    out, grup = {}, varsayilan
    for satir in metin.split("\n"):
        m = BASLIK.match(satir)
        if m and not re.search(r"\d", m.group(1)) and "=" not in m.group(2) and not satir.strip().startswith("http"):
            kelime = m.group(1).lower()
            if kelime in YOKSAY:
                continue
            grup = varsayilan if kelime in GENEL else grup_adi(kelime)
            satir = m.group(3)
        parcalar = SATIR_ICI.split(satir)
        for i, p in enumerate(parcalar):
            if i % 2 == 1:
                grup = varsayilan if p.lower() in GENEL else grup_adi(p)
                continue
            for o in ogeler([x for x in p.split() if x != "-"]):
                if o not in out.setdefault(grup, []):
                    out[grup].append(o)
        out = {g: v for g, v in out.items() if v or g == grup}
    return {g: v for g, v in out.items() if v}


def ad_gibi(o):
    # DNS'e sorulacak öğe: harf içeren ad ya da IPv4. Saf sayı (29000) sorulmaz — getaddrinfo onu IP sayar (0.0.113.72).
    return bool(re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", o)) or bool(re.fullmatch(r"(?=.*[a-z])[a-z0-9][a-z0-9.-]*", o))


def dns_coz(ogeler_, sure=4.0):
    # → {öğe: (ad/fqdn, [IP], hata)} — sistemin çözücüsü (resolv.conf search alanları dahil); paralel, öğe başına süre sınırı.
    import socket
    import threading
    sonuc = {}

    def bir(o):
        try:
            if re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", o):
                ad = socket.gethostbyaddr(o)[0]
                sonuc[o] = (ad.lower(), [o], "")
            else:
                ad, _, ipler = socket.gethostbyname_ex(o)
                sonuc[o] = (ad.lower(), list(dict.fromkeys(ipler)), "")
        except (OSError, UnicodeError) as e:
            sonuc[o] = ("", [o] if re.fullmatch(r"[\d.]+", o) else [], "DNS'te yok" if isinstance(e, socket.gaierror) or
                        isinstance(e, socket.herror) else str(e)[:60])

    isler = [threading.Thread(target=bir, args=(o,), daemon=True) for o in ogeler_ if ad_gibi(o)]
    for t in isler:
        t.start()
    for t in isler:
        t.join(sure)
    for o in ogeler_:
        sonuc.setdefault(o, ("", [], "DNS zaman aşımı" if ad_gibi(o) else "ad değil (DNS'e sorulmadı)"))
    return sonuc


def erisim(hedefler, sure=3.0):
    # {host: (adres, port)} → {host: "ssh ✅" | "ssh ❌ <neden>"} — yalnız TCP bağlantısı açıp kapatır (veri göndermez, iz bırakmaz)
    import socket
    import threading
    sonuc = {}

    def bir(h, adres, port):
        try:
            socket.create_connection((adres, port), timeout=sure).close()
            sonuc[h] = "ssh ✅"
        except socket.timeout:
            sonuc[h] = "ssh ❌ zaman aşımı (FW/kapalı)"
        except ConnectionRefusedError:
            sonuc[h] = "ssh ❌ reddedildi (ağ açık, sshd yok/başka port)"
        except OSError as e:
            sonuc[h] = "ssh ❌ %s" % (e.strerror or e)[:40]

    isler = [threading.Thread(target=bir, args=(h, a, p), daemon=True) for h, (a, p) in hedefler.items() if a]
    for t in isler:
        t.start()
    for t in isler:
        t.join(sure + 1)
    for h, (a, _) in hedefler.items():
        sonuc.setdefault(h, "ssh ❓ adres yok" if not a else "ssh ❌ zaman aşımı (FW/kapalı)")
    return sonuc


def eski_gruplar(yol):
    # var olan iş envanterinin istek satırları: "# Grup <ad>: …" (yeni) ya da "# İstenen: …" (eski → grupsuz)
    g = {}
    if not os.path.isfile(yol):
        return g
    for s in open(yol, encoding="utf-8", errors="replace"):
        m = re.match(r"^# Grup (\S+): (.*)$", s.rstrip("\n"))
        if m:
            g["" if m.group(1) == "-" else m.group(1)] = m.group(2).split()
        elif s.startswith("# İstenen: ") and not g:
            g[""] = ogeler(s[len("# İstenen: "):].split())
    return g


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
    dosya_arg, notu, is_grup, asama, yenile, erisim_yok, kalan = [], "", "", "", False, False, []
    i = 0
    while i < len(argv):
        if argv[i] == "--dosya" and i + 1 < len(argv):
            dosya_arg.append(os.path.join(cwd, os.path.expanduser(argv[i + 1])))
            i += 2
        elif argv[i] == "--ad" and i + 1 < len(argv):
            asama = grup_adi(argv[i + 1])[:30]  # aşama = hosts.ini içinde grup (ör. --ad stl → [stl])
            i += 2
        elif argv[i] == "--grup" and i + 1 < len(argv):
            # ansible grup adında yalnız harf/rakam/_ geçerli; tire uyarı bastırır ("Invalid characters were found in group names",
            # saha G116 os-upgrade-29107, ölçüldü 2.16) → _ yap, rakamla başlıyorsa g_ öneki
            is_grup = grup_adi(argv[i + 1])
            i += 2
        elif argv[i] == "--not" and i + 1 < len(argv):
            notu = argv[i + 1]
            i += 2
        elif argv[i] == "--yenile":
            yenile, i = True, i + 1
        elif argv[i] == "--erisim-yok":
            erisim_yok, i = True, i + 1
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
    metin = sys.stdin.read() if kalan[1:] == ["-"] else "\n".join(kalan[1:])
    istek = gruplu_ogeler(metin, asama)
    if not istek:
        print("sunucu listesi boş")
        return 1

    # Tek dosya: dn/<numara>/hosts.ini · CN'siz: ansible/inventories/hosts-<gün>-<etiket>.ini. Var olan dosyadaki gruplar korunur,
    # yeni grup eklenir; aynı grup farklı sunucularla gelirse --yenile olmadan yazılmaz (kullanılmış envanter sessizce değişmez).
    yol = os.path.join(is_dizin, "hosts.ini") if is_dizin else os.path.join(
        IS_DIZIN, "hosts-%s-%s.ini" % (datetime.datetime.now().strftime("%Y%m%d"), etiket))
    eski = eski_gruplar(yol)
    istek = {g: (eski[g] if g in eski and set(eski[g]) == set(v) else v) for g, v in istek.items()}  # sıra farkı değişiklik değil
    cakisan = [g for g in istek if g in eski and eski[g] != istek[g]]
    if cakisan and not yenile:
        for g in cakisan:
            print("❌ %s içinde %s grubu başka sunucularla var:\n   var:   %s\n   istek: %s" % (
                yol, "[%s]" % g if g else "grupsuz", " ".join(eski[g]), " ".join(istek[g])))
        print("dosya yazılmadı — ayrı grup için --ad <ad> (ör. --ad stl), grubu değiştirmek için --yenile (kullanıcıya sor)")
        return 2
    tum = dict(eski)
    tum.update(istek)

    # iş envanterleri kaynak değildir (kume-bul.dosyalar zaten atlar; --dosya ile verilse de)
    kaynaklar = [os.path.relpath(d) for d in (dosya_arg or kb.dosyalar(os.getcwd()))]
    kaynaklar = [d for d in kaynaklar if not IS_DESEN.match(os.path.basename(d))]
    kayitlar, gruplar, cocuklar, grup_vars = [], {}, {}, {}
    for d in kaynaklar:
        kb.ayristir(d, kayitlar, gruplar, cocuklar, grup_vars)
    if not kayitlar:
        print("ℹ️ ana envanter yok/boş (cwd=%s) — sunucular DNS'ten çözülür" % os.getcwd())

    secilen, bulunamayan, notlar, grup_hostlari = [], [], [], {}
    for g, liste_ in tum.items():
        s_, b_, belirsiz, n_ = coz(liste_, kayitlar, gruplar, cocuklar)
        if belirsiz:
            print("❓ birden çok host'a uyuyor — tam adı sor, dosya yazılmadı:")
            for b in belirsiz:
                print("  " + b)
            return 2
        grup_hostlari[g] = (s_, b_)
        secilen += [x for x in s_ if x not in secilen]
        bulunamayan += [x for x in b_ if x not in bulunamayan]
        notlar += [x for x in n_ if x not in notlar]

    # envanterde olmayanlar DNS'ten doğrulanır. Dosyaya kullanıcının verdiği öğe AYNEN yazılır (ad → ad, IP → IP); çözülen IP/PTR yalnız
    # yorumdadır. ansible_host=<DNS IP> YAZILMAZ: ansible adı kendisi çözer, ve kilit (envanter.ts) ansible_host'u ayrı hedef sayar —
    # kullanıcının vermediği IP her değişiklikte "listede yok" onayı açardı (yetki ad ile verildi). Çözülmeyen yazılır ama işaretlenir.
    # Sunucu adı olamayan sözcük ("sunucuları", "stl/sxl", "(8)") dosyaya HİÇ yazılmaz — host satırı olarak girerse playbook o adı
    # sunucu sanıp bağlanmaya çalışır (Alp, 2026-11-12: "host kısmına abuk subuk isimler yazılıyor"). Yalnız ekranda listelenir.
    adsiz = [b for b in bulunamayan if not ad_gibi(b)]
    if adsiz:
        bulunamayan = [b for b in bulunamayan if b not in adsiz]
        grup_hostlari = {g: (s_, [x for x in b_ if x not in adsiz]) for g, (s_, b_) in grup_hostlari.items()}
        tum = {g: [x for x in v if x not in adsiz] for g, v in tum.items()}
        tum = {g: v for g, v in tum.items() if v}
        grup_hostlari = {g: v for g, v in grup_hostlari.items() if g in tum}
        print("⚠️ sunucu adı değil, alınmadı: %s — sunucuysa kullanıcıya sor" % ", ".join(adsiz))
        if not tum:
            print("sunucu listesi boş")
            return 1
    kayit_ip = {k["ad"]: sorted(k["ipler"]) for k in kayitlar}
    sor = list(bulunamayan) + [a for a in secilen if not any(re.fullmatch(r"[\d.]+", x) for x in kayit_ip.get(a, []))]
    dns = dns_coz(sor) if sor else {}
    ek_ad, ek_satir = {}, []
    for b in bulunamayan:
        fqdn, ipler, hata = dns.get(b, ("", [], "ad değil"))
        ip_ogesi = bool(re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", b))
        ek_ad[b] = b
        if hata:
            ek_satir.append("%s  # %s" % (b, "DNS PTR yok (IP ile bağlanılır)" if ip_ogesi else hata + " — ad/IP'yi kullanıcıyla doğrula"))
        elif ip_ogesi:
            ek_satir.append("%s  # DNS PTR: %s" % (b, fqdn))
        else:
            ek_satir.append("%s  # DNS: %s %s" % (b, fqdn, " ".join(ipler)))

    simdi = datetime.datetime.now()
    os.makedirs(is_dizin or IS_DIZIN, exist_ok=True)
    sec = set(secilen)
    satirlar = [
        "# İş envanteri — %s — %s" % (etiket, simdi.strftime("%Y-%m-%d %H:%M")),
        "# Üreten: is-envanter.py — ana envanterden + DNS'ten türetildi; elle düzenleme, gerekirse yeniden üret.",
    ]
    for g, liste_ in tum.items():
        satirlar.append("# Grup %s: %s" % (g or "-", " ".join(liste_)[:600]))
    if notu:
        satirlar.append("# Not: %s" % notu.replace("\n", " ")[:400])
    kullanilan = [d for d in kaynaklar if any(k["dosya"] == d and k["ad"] in sec for k in kayitlar)]
    satirlar.append("# Kaynak: %s" % (", ".join(kullanilan + (["DNS"] if bulunamayan else [])) or "-"))
    satirlar.append("# Host sayısı: %d" % (len(secilen) + len(bulunamayan)))
    if bulunamayan:
        satirlar.append("# Envanterde yok (DNS'ten, [is_ek] grubunda): %s" % ", ".join(bulunamayan))
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
    if ek_satir:
        satirlar += ["", "# envanterde yok — DNS'ten doğrulandı (IP yorumda; ansible adı kendisi çözer)", "[is_ek]"] + ek_satir
    adlandirilmis = [g for g in tum if g]
    if adlandirilmis:
        satirlar += ["", "# işin grupları — playbook'ta hosts: <grup> ya da -l <grup>"]
        for g in adlandirilmis:
            s_, b_ = grup_hostlari[g]
            satirlar += ["[%s]" % g] + s_ + [ek_ad[b] for b in b_]
    if is_grup:
        satirlar += ["", "# iş grubu — playbook'ta hosts: %s" % is_grup, "[%s]" % is_grup] + secilen + [ek_ad[b] for b in bulunamayan]

    def govde(ss):
        # "# Grup …" satırları içeriktir (istek); diğer yorumlar (tarih, satır no, DNS notu) karşılaştırmaya girmez
        return [x.split("  #")[0].rstrip() for x in ss if x.strip() and (not x.lstrip().startswith("#") or x.startswith("# Grup "))]

    ayni = False
    if os.path.isfile(yol):
        with open(yol, encoding="utf-8", errors="replace") as f:
            ayni = govde(f.read().split("\n")) == govde(satirlar)
    n = len(secilen) + len(bulunamayan)
    if ayni:
        print("zaten var (aynı sunucular): %s — yeniden yazılmadı (%d host)" % (yol, n))
    else:
        with open(yol, "w", encoding="utf-8") as f:
            f.write("\n".join(satirlar) + "\n")
        print("%s: %s (%d host%s)" % ("güncellendi" if eski else "yazıldı", yol, n,
                                       "; gruplar: " + ", ".join(adlandirilmis) if adlandirilmis else ""))
    for x in notlar:
        print("  aralık: " + x)

    # erişim: ssh portuna TCP (ansible_host/ansible_port; yoksa DNS IP'si ya da ad) — "önceden bir ping"
    hedef = {}
    for a in secilen:
        k = next((k for k in kayitlar if k["ad"] == a), {"vars": {}})
        adres = k["vars"].get("ansible_host") or (dns.get(a, ("", [], ""))[1] or [a])[0]
        hedef[a] = (adres, int(k["vars"].get("ansible_port", 22)) if str(k["vars"].get("ansible_port", 22)).isdigit() else 22)
    for b in bulunamayan:
        ipler = dns.get(b, ("", [], ""))[1]
        hedef[ek_ad[b]] = (ipler[0] if ipler else "", 22)
    ssh = {} if erisim_yok else erisim(hedef)
    for g, liste_ in tum.items():
        s_, b_ = grup_hostlari[g]
        if adlandirilmis:
            print("[%s] %d host" % (g or "grupsuz", len(s_) + len(b_)))
        for a in s_:
            ip = " ".join(sorted(x for x in kayit_ip.get(a, []) if re.fullmatch(r"[\d.]+", x))) or " ".join(dns.get(a, ("", [], ""))[1])
            ks = [k for k in kayitlar if k["ad"] == a]
            yer = ", ".join("%s:%d" % (os.path.basename(k["dosya"]), k["satir"]) for k in ks[:2])
            print("  %-26s %-15s %-24s envanter %s" % (a, ip or "-", ssh.get(a, ""), yer))
        for b in b_:
            fqdn, ipler, hata = dns.get(b, ("", [], ""))
            print("  %-26s %-15s %-24s %s" % (ek_ad[b], " ".join(ipler[:1]) or "-", ssh.get(ek_ad[b], ""),
                                              ("DNS: " + fqdn) if fqdn and not hata else "PTR yok (IP ile bağlanılır)"
                                              if re.fullmatch(r"[\d.]+", b) else "⚠️ " + (hata or "DNS'te yok") + " — doğrula"))
    if ssh:
        kapali = [h for h, v in ssh.items() if "✅" not in v]
        print("erişim: ssh portu açık %d/%d%s" % (len(ssh) - len(kapali), len(ssh), " — açılmayan: " + ", ".join(kapali) if kapali else ""))
        print("  (TCP ölçümü; giriş/sudo değil. Tam kontrol: ansible all -i %s -m ping -o)" % yol)
    for u in uyarilar:
        print("⚠️ " + u)
    pb = os.path.join(is_dizin, "01-<ad>.yaml") if is_dizin else "ansible/playbooks/<NN>-<ad>.yaml"
    if calisma != cwd:
        print("çalışma dizini: %s (yollar buna göre)" % calisma)
    print("okuma (çok sunucu, tek komut — for … ssh döngüsü yazma): ansible all -i %s -m shell -a '<okuma>' -t cikti/filo/<etiket>" % yol)
    print("değişiklik = playbook, ŞABLONDAN (ansible becerisi §1c): reboot → cp %s %s · diğer → sablon/iskelet.yaml; hosts: all, "
          "başka .ini yazma" % (os.path.join(BURASI, "sablon", "reboot.yaml"), pb.replace("<ad>", "reboot")) if is_dizin else
          "değişiklik = playbook (ansible becerisi §0): %s — dizinde hazırı varsa onu kullan, yoksa sıradaki numarayla yaz" % pb)
    print("  → playbook-denetim.py + --syntax-check + aynı komut --list-hosts → planı kullanıcıya göster, onayını bekle →")
    if is_dizin:
        lg = os.path.join(is_dizin, "logs")
        print("  çalıştır (tek biçim, önce -l <tek sunucu>): ANSIBLE_LOG_PATH=%s/01-reboot.log ANSIBLE_TASK_TIMEOUT=1800 "
              "ANSIBLE_RETRY_FILES_ENABLED=1 ANSIBLE_RETRY_FILES_SAVE_PATH=%s ansible-playbook -i %s %s -l '<hedef>' -T 10"
              % (lg, lg, yol, pb.replace("<ad>", "reboot")))
        print("  durum: python3 %s %s   ·   \"ilk 3'ü\": … --sec 3 --pb 01-reboot" % (os.path.join(BURASI, "is-durum.py"), is_dizin))
    else:
        print("  önce TEK sunucu: ansible-playbook -i %s %s -l <sunucu> → hedefte ölç → kalan sunucular kullanıcının \"devam\"ıyla" % (yol, pb))
    if is_dizin and not os.path.isfile(os.path.join(is_dizin, "logs", "plan.md")):
        print("iş kaydı (README.md + logs/): python3 %s ac <işin kısa adı> --cn %s --istek \"<kullanıcının cümlesi>\"" % (
            os.path.normpath(os.path.join(BURASI, "..", "rapor", "is-kaydi.py")), etiket))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
