#!/usr/bin/env python3
# kume-bul.py — bir sunucu adı / kısa ad / IP verildiğinde çalışma dizinindeki ansible INI envanterlerinde
# nerede geçtiğini (dosya:satır), hangi grupta ve üst grupta (:children) olduğunu, aynı IP'nin başka adla
# geçtiği yerleri ve grubun diğer üyelerini basar. Yalnız okur; ağ/ssh/DNS yok.
# Ayrıştırma kuralları engine/plugins/lib/envanter.ts ile aynı (aralık x[01:05], ansible_host, :children).
# Saha G94 (2026-10-21): "bir master ya da worker söylediğimde kümeyi hemen bulması lazım" (Alp).
import ipaddress
import os
import re
import sys

KOKLER = ("ansible", "inventories", "inventory")
ATLA = {"node_modules", "roles", "group_vars", "host_vars"}
GIZLI = re.compile(r"pass|token|secret|key|vault", re.I)
BUYUK = 2 * 1024 * 1024


def ip_mi(s):
    try:
        ipaddress.ip_address(s)
        return True
    except ValueError:
        return False


def aralik(desen):
    m = re.search(r"\[([0-9a-z]+):([0-9a-z]+)(?::(\d+))?\]", desen, re.I)
    if not m:
        return [desen]
    bas, son, adim = m.group(1), m.group(2), int(m.group(3) or 1) or 1
    once, sonra = desen[: m.start()], desen[m.end():]
    ogeler = []
    if bas.isdigit() and son.isdigit():
        gen = len(bas) if len(bas) > 1 and bas.startswith("0") else 0
        for i in range(int(bas), int(son) + 1, adim):
            ogeler.append(str(i).zfill(gen))
            if len(ogeler) >= 512:
                break
    elif len(bas) == 1 and len(son) == 1 and bas.isalpha() and son.isalpha():
        ogeler = [chr(c) for c in range(ord(bas), ord(son) + 1, adim)]
    else:
        return [desen]
    out = []
    for o in ogeler:
        out.extend(aralik(once + o + sonra))
    return out[:512]


def dosyalar(kok):
    ortam = os.environ.get("OPS_AGENT_ENVANTER")
    if ortam:
        return [d for d in ortam.split(":") if d]
    out = []

    def gez(dizin, derinlik):
        try:
            girdiler = sorted(os.listdir(dizin))
        except OSError:
            return
        for g in girdiler:
            if g.startswith(".") or g in ATLA:
                continue
            yol = os.path.join(dizin, g)
            if os.path.isdir(yol):
                if derinlik < 3:
                    gez(yol, derinlik + 1)
            elif (g.lower().endswith(".ini") or g.lower().startswith("hosts")) and not re.search(
                r"\.(ya?ml|json|j2|bak|orig)$", g, re.I
            ):
                try:
                    if os.path.getsize(yol) <= BUYUK:
                        out.append(yol)
                except OSError:
                    pass

    for k in KOKLER:
        gez(os.path.join(kok, k), 1)
    return out[:50]


def ayristir(yol, kayitlar, gruplar, cocuklar, grup_vars):
    grup, tur = "ungrouped", "host"
    try:
        metin = open(yol, encoding="utf-8", errors="replace").read()
    except OSError as e:
        print("okunamadı: %s (%s)" % (yol, e))
        return
    for no, ham in enumerate(metin.split("\n"), 1):
        satir = re.sub(r"\s[#;].*$", "", ham).strip()
        if not satir or satir[0] in "#;":
            continue
        b = re.match(r"^\[([^\]:]+)(?::(children|vars))?\]$", satir)
        if b:
            grup, tur = b.group(1).strip().lower(), b.group(2) or "host"
            continue
        anahtar = (yol, grup)
        if tur == "vars":
            grup_vars.setdefault(anahtar, []).append((no, satir))
            continue
        parca = satir.split()
        if tur == "children":
            cocuklar.setdefault(anahtar, set()).add(parca[0].lower())
            continue
        ad = parca[0].lower()
        degisken = {}
        for d in parca[1:]:
            if "=" in d:
                k, v = d.split("=", 1)
                degisken[k] = v.strip("'\"")
        ip = degisken.get("ansible_host") or degisken.get("ansible_ssh_host")
        for h in aralik(ad):
            ipler = set()
            if ip and "[" not in ad:
                ipler.add(ip.lower())
            if ip_mi(h):
                ipler.add(h)
            kayitlar.append({"dosya": yol, "satir": no, "grup": grup, "ad": h, "kisa": h.split(".")[0],
                             "ipler": ipler, "vars": degisken})
            gruplar.setdefault(anahtar, []).append(h)


def ustler(yol, grup, cocuklar):
    # grup'u :children olarak içeren grupları (aynı dosyada) yukarı doğru topla
    out, bak = [], [grup]
    while bak:
        g = bak.pop()
        for (d, ust), alt in cocuklar.items():
            if d == yol and g in alt and ust not in out:
                out.append(ust)
                bak.append(ust)
    return out


def goster_vars(v):
    return " ".join("%s=%s" % (k, "***" if GIZLI.search(k) else x) for k, x in v.items())


def main(argv):
    ek = []
    sorgular = []
    i = 0
    while i < len(argv):
        if argv[i] in ("-h", "--help"):
            print(__doc__ or "", "kullanım: kume-bul.py <ad|kısa ad|IP> [...] [--dosya <envanter.ini>]...")
            print("Çalışma dizinindeki ansible/, inventories/, inventory/ altındaki *.ini ve hosts* dosyalarını okur.")
            return 0
        if argv[i] == "--dosya" and i + 1 < len(argv):
            ek.append(argv[i + 1])
            i += 2
            continue
        sorgular.extend(x.strip().lower() for x in re.split(r"[,\s]+", argv[i]) if x.strip())
        i += 1
    if not sorgular:
        print("kullanım: kume-bul.py <ad|kısa ad|IP> [...] [--dosya <envanter.ini>]...")
        return 2

    liste = ek or dosyalar(os.getcwd())
    if not liste:
        print("Envanter dosyası bulunamadı (cwd=%s; ansible/, inventories/, inventory/ altında *.ini / hosts*)." % os.getcwd())
        return 1
    kayitlar, gruplar, cocuklar, grup_vars = [], {}, {}, {}
    for d in liste:
        ayristir(d, kayitlar, gruplar, cocuklar, grup_vars)
    print("Okunan envanter: %s" % ", ".join(os.path.relpath(d) for d in liste))

    kapsama = {}  # (dosya, grup) -> bulunan sorgular
    bulunamayan = []
    for q in sorgular:
        qk = q.split(".")[0]
        if ip_mi(q):
            esles = [k for k in kayitlar if q in k["ipler"]]
            tur = "IP"
        else:
            esles = [k for k in kayitlar if k["ad"] == q or k["kisa"] == qk]
            tur = "ad"
            if not esles and re.search(r"\d", q) and len(q) >= 3:
                esles = [k for k in kayitlar if k["kisa"].endswith(qk)]
                tur = "kısmi ad (sonek)"
        # aynı IP başka adla geçiyor mu
        ipler = set()
        for k in esles:
            ipler |= k["ipler"]
        ayni_ip = [k for k in kayitlar if k["ipler"] & ipler and k not in esles]

        print("\n== %s" % q)
        if not esles:
            bulunamayan.append(q)
            print("  envanterde YOK (ad, kısa ad, ansible_host). Sonraki adım: getent hosts %s → IP ile yeniden çalıştır;" % q)
            print("  yine yoksa canlı yol (SKILL.md §2).")
            continue
        kisaltilar = sorted({k["ad"] for k in esles})
        if tur == "kısmi ad (sonek)" and len(kisaltilar) > 1:
            print("  BELİRSİZ: kısa yazım birden çok host'a uyuyor: %s — tam adı sor." % ", ".join(kisaltilar[:8]))
        for k in esles + ayni_ip:
            not_ = "" if k in esles else "  ← aynı IP, farklı ad"
            ust = ustler(k["dosya"], k["grup"], cocuklar)
            print("  %s:%d  ad=%s  grup=[%s]%s%s%s" % (
                os.path.relpath(k["dosya"]), k["satir"], k["ad"], k["grup"],
                ("  üst=[%s]" % "] [".join(ust)) if ust else "",
                ("  " + goster_vars(k["vars"])) if k["vars"] else "", not_))
            kapsama.setdefault((k["dosya"], k["grup"]), set()).add(q)
        print("  eşleşme türü: %s · IP: %s" % (tur, ", ".join(sorted(ipler)) or "envanterde yok"))
        # grubun diğer üyeleri ve grup değişkenleri (tek sorguda; toplu sorguda özet yeter)
        if len(sorgular) == 1:
            goruldu = set()
            for k in esles + ayni_ip:
                anahtar = (k["dosya"], k["grup"])
                if anahtar in goruldu or k["grup"] == "ungrouped":
                    continue
                goruldu.add(anahtar)
                uyeler = gruplar.get(anahtar, [])
                print("  [%s] üyeleri (%d, %s): %s%s" % (
                    k["grup"], len(uyeler), os.path.relpath(k["dosya"]), " ".join(uyeler[:30]),
                    " …" if len(uyeler) > 30 else ""))
                for g in [k["grup"]] + ustler(k["dosya"], k["grup"], cocuklar):
                    for no, s in grup_vars.get((k["dosya"], g), [])[:15]:
                        if GIZLI.search(s.split("=")[0]):
                            s = s.split("=")[0] + "=***"
                        print("  [%s:vars] %s:%d  %s" % (g, os.path.relpath(k["dosya"]), no, s))

    if len(sorgular) > 1:
        print("\n== Toplu özet: hangi grup kaç sorguyu kapsıyor (%d sorgu)" % len(sorgular))
        for (d, g), qs in sorted(kapsama.items(), key=lambda x: (-len(x[1]), x[0])):
            print("  %d/%d  [%s]  %s" % (len(qs), len(sorgular), g, os.path.relpath(d)))
        if bulunamayan:
            print("  envanterde yok: %s" % " ".join(bulunamayan))
    return 0 if len(bulunamayan) < len(sorgular) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
