#!/usr/bin/env python3
# envanter-fark.py — aynı sunucu bilgisinin tutulduğu yerleri karşılaştırır: ansible INI envanter(ler)i ↔ doküman (ENVANTER.md vb.)
# ↔ başka INI. Alp (2026-10-26): "mükerrer kayıtlar olabilir — envanter orada var, ansible'da envanter var, bir de envanter çalışması
# var; veriler birbiriyle senkronize olmalı." Betik hangisinin DOĞRU olduğuna karar vermez; farkı satır numarasıyla gösterir.
# MD biçimi varsayılmaz: INI'deki adlar ve IP'ler MD metninde aranır (tablo, liste, düz metin fark etmez). Yalnız okur.
import importlib.util
import os
import re
import sys

KULLANIM = """kullanım: envanter-fark.py <kaynak.ini> [<kaynak2.ini> …] --karsi <ENVANTER.md|diger.ini> [--karsi …]
  Kaynak INI(ler) = ansible envanteri (aralık x[01:14], ansible_host, :children okunur — kume-bul ile aynı ayrıştırıcı).
  Karşı dosya .ini ise envanter olarak, değilse metin (MD) olarak okunur.
  Çıkış: 0 fark yok · 1 fark var · 2 okunamadı."""

IP = re.compile(r"(?<![\d.])((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})(?![\d.])")


def kume_bul():
    yol = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "kume-bul", "kume-bul.py")
    spec = importlib.util.spec_from_file_location("kume_bul", yol)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def ini_oku(kb, dosyalar):
    kayitlar = []
    for d in dosyalar:
        kayitlar_d = []
        kb.ayristir(d, kayitlar_d, {}, {}, {})
        kayitlar += kayitlar_d
    hostlar = {}  # ad -> {ipler, yerler}
    for k in kayitlar:
        h = hostlar.setdefault(k["ad"], {"ipler": set(), "yerler": []})
        h["ipler"] |= {i for i in k["ipler"] if IP.fullmatch(i)}
        h["yerler"].append("%s:%d" % (os.path.basename(k["dosya"]), k["satir"]))
    return hostlar


def ad_deseni(ad):
    # tam ad ya da kısa ad (FQDN'in ilk parçası); harf/rakam/-/. ile bitişik değil
    kisa = ad.split(".")[0]
    return re.compile(r"(?<![A-Za-z0-9_.-])(%s|%s)(?![A-Za-z0-9_-])" % (re.escape(ad), re.escape(kisa)), re.I)


def md_karsilastir(kaynak, yol, metin):
    satirlar = metin.split("\n")
    farklar = []
    ip_sahibi = {}
    for ad, h in kaynak.items():
        for i in h["ipler"]:
            ip_sahibi.setdefault(i, set()).add(ad)
    gecen_ipler = set()
    for ad, h in sorted(kaynak.items()):
        desen = ad_deseni(ad)
        bulunan = [(n, s) for n, s in enumerate(satirlar, 1) if desen.search(s)]
        if not bulunan:
            farklar.append(("yalnız-kaynakta", "%s (%s) %s'de yok" % (ad, h["yerler"][0], os.path.basename(yol))))
            continue
        for n, s in bulunan:
            ipler = set(IP.findall(s))
            gecen_ipler |= ipler
            if h["ipler"] and ipler and not (ipler & h["ipler"]):
                farklar.append(("ip-farkli", "%s: kaynakta %s (%s) · %s:%d'de %s" % (
                    ad, ",".join(sorted(h["ipler"])), h["yerler"][0], os.path.basename(yol), n, ",".join(sorted(ipler)))))
    for n, s in enumerate(satirlar, 1):
        for i in IP.findall(s):
            if i in ip_sahibi:
                continue
            if any(ad_deseni(a).search(s) for a in kaynak):
                continue  # ip-farkli olarak zaten söylendi
            farklar.append(("yalnız-karşıda", "%s:%d  %s — kaynak envanterde yok: %s" % (
                os.path.basename(yol), n, i, s.strip()[:100])))
    return farklar


def ini_karsilastir(kaynak, karsi, yol):
    # kısa ad ↔ FQDN aynı host sayılır (ornekdb01 = ornekdb01.kurum.local), yalnız kısa ad tek host'a uyuyorsa
    def esle(a, b):
        kisa = {}
        for x in b:
            kisa.setdefault(x.split(".")[0], []).append(x)
        out = {}
        for x in a:
            if x in b:
                out[x] = x
            elif len(kisa.get(x.split(".")[0], [])) == 1:
                out[x] = kisa[x.split(".")[0]][0]
        return out
    ileri, geri = esle(kaynak, karsi), esle(karsi, kaynak)
    karsi = dict(karsi, **{a: karsi[b] for a, b in ileri.items()})
    kaynak_t = dict(kaynak, **{a: kaynak[b] for a, b in geri.items()})
    farklar = []
    for ad, h in sorted(kaynak.items()):
        if ad not in karsi:
            farklar.append(("yalnız-kaynakta", "%s (%s) %s'de yok" % (ad, h["yerler"][0], os.path.basename(yol))))
        elif h["ipler"] and karsi[ad]["ipler"] and h["ipler"] != karsi[ad]["ipler"]:
            farklar.append(("ip-farkli", "%s: kaynakta %s (%s) · karşıda %s (%s)" % (
                ad, ",".join(sorted(h["ipler"])), h["yerler"][0], ",".join(sorted(karsi[ad]["ipler"])), karsi[ad]["yerler"][0])))
    for ad, h in sorted(karsi.items()):
        if ad not in kaynak_t and ad not in ileri.values():
            farklar.append(("yalnız-karşıda", "%s (%s) kaynak envanterde yok" % (ad, h["yerler"][0])))
    return farklar


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(KULLANIM)
        return 0
    kaynaklar, karsilar, i = [], [], 0
    while i < len(argv):
        if argv[i] == "--karsi" and i + 1 < len(argv):
            karsilar.append(argv[i + 1])
            i += 2
            continue
        kaynaklar.append(argv[i])
        i += 1
    if not kaynaklar or not karsilar:
        print(KULLANIM)
        return 2
    for d in kaynaklar + karsilar:
        if not os.path.isfile(d):
            print("okunamadı: %s" % d)
            return 2
    kb = kume_bul()
    kaynak = ini_oku(kb, kaynaklar)
    print("Kaynak: %s — %d host" % (", ".join(kaynaklar), len(kaynak)))
    toplam = 0
    for k in karsilar:
        if k.lower().endswith(".ini") or os.path.basename(k).lower().startswith("hosts"):
            farklar = ini_karsilastir(kaynak, ini_oku(kb, [k]), k)
        else:
            farklar = md_karsilastir(kaynak, k, open(k, encoding="utf-8", errors="replace").read())
        print("\n== %s ↔ %s: %s" % ("+".join(os.path.basename(x) for x in kaynaklar), k,
                                     "fark yok" if not farklar else "%d fark" % len(farklar)))
        for tur in ("ip-farkli", "yalnız-kaynakta", "yalnız-karşıda"):
            secili = [m for t, m in farklar if t == tur]
            if secili:
                print("  %s (%d):" % (tur, len(secili)))
                for m in secili[:200]:
                    print("    " + m)
                if len(secili) > 200:
                    print("    … %d satır daha" % (len(secili) - 200))
        toplam += len(farklar)
    print("\nBetik hangisinin doğru olduğuna karar vermez — farkı kullanıcı çözer; düzeltme ayrı iş (git §6).")
    return 1 if toplam else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
