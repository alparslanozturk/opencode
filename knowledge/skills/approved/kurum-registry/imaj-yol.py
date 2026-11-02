#!/usr/bin/env python3
# imaj-yol.py — bir imaj kümede NEREDEN çekilecek? Manifest/helm çıktısındaki imajları, düğümün RKE2 registries.yaml'ındaki aynalara
# (mirrors + rewrite) göre çözer; kurulumdan sonra çekilemeyen imajları (ErrImagePull/ImagePullBackOff) listeler.
# Saha (Alp, 2026-11-02, G115): Harbor kullanan eski platformda nfs-subdir imaj yolu kurulumdan sonra elle Harbor yoluna çevrildi;
# amiral gemisinde (Nexus) kısa adla çekiliyor. Ajan "çekilir" / "kuruldu" demeden önce bu betikle ölçer — kararı model değil betik verir.
#
#   imaj-yol.py imajlar <dosya|->                         → manifest / `helm template` / `kubectl get … -o json` içindeki imajlar
#   imaj-yol.py yol --registries <registries.yaml> (<imaj> … | --dosya <manifest>)
#       → imaj başına: kayıt adresi · eşleşen ayna (tam ad / "*" / yok) · uç(lar) · rewrite sonrası depo yolu · KARAR
#         Çıkış 0 hepsi aynada ya da doğrudan kurum adresinde, 1 aynasız imaj var, 2 hata.
#   imaj-yol.py cekme <kubectl get pods -A -o json dosyası|->
#       → imajı çekilemeyen pod'lar (sebep + imaj + mesaj). Çıkış 0 yok, 1 var.
import json
import re
import sys

try:
    import yaml
except ImportError:  # ansible kurulu makinede var; yoksa imajlar için satır taraması, registries.yaml için hata
    yaml = None

CEKME_HATASI = ("ErrImagePull", "ImagePullBackOff", "InvalidImageName", "ErrImageNeverPull", "RegistryUnavailable")


def oku(yol):
    return sys.stdin.read() if yol == "-" else open(yol, encoding="utf-8", errors="replace").read()


def imaj_topla(nesne, out):
    if isinstance(nesne, dict):
        for k, v in nesne.items():
            if k == "image" and isinstance(v, str) and v.strip():
                out.append(v.strip())
            else:
                imaj_topla(v, out)
    elif isinstance(nesne, list):
        for x in nesne:
            imaj_topla(x, out)


def imajlar_metinden(metin):
    out = []
    try:
        imaj_topla(json.loads(metin), out)
    except ValueError:
        if yaml:
            try:
                for d in yaml.safe_load_all(metin):
                    imaj_topla(d, out)
            except yaml.YAMLError:
                out = []
        if not out:
            out = [m.group(1) for m in re.finditer(r"^\s*-?\s*image:\s*[\"']?([^\"'\s#]+)", metin, re.M)]
    gorulen, sirali = set(), []
    for i in out:
        if i not in gorulen:
            gorulen.add(i)
            sirali.append(i)
    return sirali


def coz(imaj):
    # Docker referans kuralı: ilk parça '.' ya da ':' içeriyorsa veya 'localhost' ise kayıt adresidir; değilse docker.io (+ library/).
    ad, ozet = (imaj.split("@", 1) + [""])[:2]
    parcalar = ad.split("/")
    if len(parcalar) > 1 and ("." in parcalar[0] or ":" in parcalar[0] or parcalar[0] == "localhost"):
        kayit, depo = parcalar[0], "/".join(parcalar[1:])
    else:
        kayit, depo = "docker.io", ad
        if "/" not in depo:
            depo = "library/" + depo
    etiket = ""
    son = depo.rsplit("/", 1)[-1]
    if ":" in son:
        depo, etiket = depo.rsplit(":", 1)
    return {"kayit": kayit, "depo": depo, "etiket": etiket or ("" if ozet else "latest"), "ozet": ozet}


def rewrite_uygula(kurallar, depo):
    # RKE2 rewrite: depo yolu üzerinde düzenli ifade; değiştirmede $1 → \1 (Go → Python). İlk eşleşen kural uygulanır.
    for desen, yeni in (kurallar or {}).items():
        try:
            if re.search(desen, depo):
                return re.sub(desen, re.sub(r"\$(\d+)", r"\\\1", yeni), depo, count=1), desen
        except re.error:
            return depo, "GEÇERSİZ: " + desen
    return depo, ""


def yol(argv):
    if "--registries" not in argv:
        print("yol için --registries <registries.yaml> gerekli (düğümde /etc/rancher/rke2/registries.yaml)")
        return 2
    if yaml is None:
        print("PyYAML yok — registries.yaml okunamıyor (python3-pyyaml)")
        return 2
    i = argv.index("--registries")
    reg_yol = argv[i + 1] if i + 1 < len(argv) else None
    kalan = argv[:i] + argv[i + 2:]
    reg = yaml.safe_load(oku(reg_yol)) or {}
    aynalar = reg.get("mirrors") or {}
    if "--dosya" in kalan:
        j = kalan.index("--dosya")
        imajlar = imajlar_metinden(oku(kalan[j + 1]))
    else:
        imajlar = [x for x in kalan if not x.startswith("--")]
    if not imajlar:
        print("imaj yok")
        return 2
    print("Aynalar (registries.yaml): %s" % (", ".join("%s → %s" % (k, ", ".join((v or {}).get("endpoint") or ["(uç yok)"]))
                                                       for k, v in aynalar.items()) or "YOK"))
    satirlar, aynasiz = [], 0
    for im in imajlar:
        r = coz(im)
        if r["kayit"] in aynalar:
            anahtar = r["kayit"]
        elif "*" in aynalar:
            anahtar = "*"
        else:
            anahtar = ""
        if not anahtar:
            dogrudan = any(r["kayit"] == u.split("://")[-1].split("/")[0] for v in aynalar.values() for u in (v or {}).get("endpoint") or [])
            karar = "DOĞRUDAN (kurum adresi)" if dogrudan else "AYNA YOK → doğrudan %s adresine gider (kurum ağından çıkış yoksa çekilemez)" % r["kayit"]
            aynasiz += not dogrudan
            satirlar.append((im, r["kayit"], "-", "-", r["depo"], karar))
            continue
        a = aynalar[anahtar] or {}
        uclar = a.get("endpoint") or []
        depo, desen = rewrite_uygula(a.get("rewrite"), r["depo"])
        karar = "AYNADA (%s)" % ("tam ad" if anahtar != "*" else "\"*\" — tüm kayıtlar")
        if not uclar:
            karar = "AYNA TANIMLI AMA UÇ YOK"
            aynasiz += 1
        if desen.startswith("GEÇERSİZ"):
            karar += " · rewrite " + desen
        satirlar.append((im, r["kayit"], anahtar, " ".join(uclar) or "-", depo + (" (rewrite)" if desen and depo != r["depo"] else ""), karar))
    bas = ("imaj", "kayıt", "ayna", "uç", "depo yolu", "karar")
    gen = [min(60, max(len(str(s[k])) for s in satirlar + [bas])) for k in range(5)]
    print("  ".join(bas[k].ljust(gen[k]) for k in range(5)) + "  " + bas[5])
    for s in satirlar:
        print("  ".join(str(s[k]).ljust(gen[k]) for k in range(5)) + "  " + s[5])
    print("Özet: %d imaj · aynasız %d — bu bir YAPILANDIRMA çözümlemesi; imajın aynada gerçekten bulunduğunu göstermez. Kanıt: kurulum "
          "sonrası `cekme` (pod'lar Running, çekme hatası yok)." % (len(satirlar), aynasiz))
    return 1 if aynasiz else 0


def cekme(argv):
    if not argv:
        print("cekme <kubectl get pods -A -o json dosyası|->")
        return 2
    veri = json.loads(oku(argv[0]))
    podlar = veri.get("items", [veri] if veri.get("kind") == "Pod" else [])
    bulunan = []
    for p in podlar:
        md = p.get("metadata") or {}
        st = p.get("status") or {}
        for c in (st.get("initContainerStatuses") or []) + (st.get("containerStatuses") or []):
            w = (c.get("state") or {}).get("waiting") or {}
            if w.get("reason") in CEKME_HATASI:
                bulunan.append(("%s/%s" % (md.get("namespace", "?"), md.get("name", "?")), c.get("image", "?"), w["reason"],
                                re.sub(r"\s+", " ", w.get("message") or "")[:160]))
    if not bulunan:
        print("Çekme hatası yok (%d pod tarandı)." % len(podlar))
        return 0
    for b in bulunan:
        print("%s  %s  %s\n    %s" % b)
    print("Özet: %d pod tarandı · çekme hatası %d" % (len(podlar), len(bulunan)))
    return 1


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import json")[0].replace("# ", "").replace("#!/usr/bin/env python3\n", ""))
        return 0
    if argv[0] == "imajlar" and len(argv) > 1:
        for i in imajlar_metinden(oku(argv[1])):
            print(i)
        return 0
    if argv[0] == "yol":
        return yol(argv[1:])
    if argv[0] == "cekme":
        return cekme(argv[1:])
    print("alt komut: imajlar | yol | cekme")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
