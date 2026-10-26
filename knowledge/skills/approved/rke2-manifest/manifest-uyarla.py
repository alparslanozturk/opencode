#!/usr/bin/env python3
# manifest-uyarla.py — bir kümenin manifest klasörünü başka kümeye uyarlar (kopyala + değiştir), her değişikliği satırıyla raporlar.
# Alp (2026-10-26): "önce bir kümenin bütün gerekli manifestlerini kuracağım, sonra 'bu kümenin manifestlerini şu kümeye özelleştir'
# diyeceğim — değişkenler, isimler, cluster name değişecek." Yöntem A (Alp seçti): klasör kopyalanır, düz YAML kalır.
# Hangi değerin değişeceğine ajan/kullanıcı karar verir (--degis); betik kararı birebir uygular, atlanan/kalan değeri gösterir.
# Yalnız okur; --yaz verilmedikçe hiçbir dosya yazılmaz. Var olan hedef dosyanın üzerine yazmaz.
import difflib
import os
import re
import shutil
import sys

try:
    import yaml
except ImportError:
    yaml = None

KULLANIM = """kullanım:
  manifest-uyarla.py parametre <küme-klasörü> <küme-klasörü> [...]
      aynı adlı dosyaları kümeler arasında karşılaştırır → kümeye özel değerler (alan yolu · her kümedeki değer)
  manifest-uyarla.py kopyala <kaynak-klasör> <hedef-klasör> --degis <eski>=<yeni> [--degis …] [--yaz] [--sirlar-dahil]
      kaynak → hedef; --degis değerleri bütün kelime olarak değiştirilir. --yaz yoksa KURU: yalnız plan basılır.
      Sır dosyaları (kind: Secret, *.key/*.pfx/*.p12/*.pem anahtar, pass*/parola*) varsayılan KOPYALANMAZ — kümeye özeldir.
  manifest-uyarla.py kalan <hedef-klasör> <eski-değer> [...]
      hedefte kaynak kümeden kalmış değer var mı (dosya:satır)
Çıkış: 0 tamam/bulgu yok · 1 bulgu var (kalan değer, değişmeyen --degis, YAML bozuk) · 2 kullanım/okuma hatası."""

SIR_AD = re.compile(r"(\.(key|pfx|p12|jks|keystore)$|^(pass|parola|sifre|şifre|secret)[^/]*$)", re.I)
SIR_ICERIK = re.compile(r"^\s*kind:\s*Secret\s*$|-----BEGIN [A-Z ]*PRIVATE KEY-----", re.M)
METIN_UZANTI = (".yaml", ".yml", ".json", ".md", ".txt", ".conf", ".ini", ".sh", ".j2", ".tpl", ".env", ".properties", "")


def dosyalar(kok):
    out = []
    for d, alt, ds in os.walk(kok):
        alt[:] = [a for a in alt if a != ".git"]
        for f in ds:
            out.append(os.path.relpath(os.path.join(d, f), kok))
    return sorted(out)


def metin_mi(yol):
    if not yol.lower().endswith(METIN_UZANTI):
        return False
    try:
        with open(yol, "rb") as f:
            return b"\0" not in f.read(8192)
    except OSError:
        return False


def sir_mi(yol):
    if SIR_AD.search(os.path.basename(yol)):
        return True
    if metin_mi(yol):
        try:
            return bool(SIR_ICERIK.search(open(yol, encoding="utf-8", errors="replace").read()))
        except OSError:
            return False
    return False


def kelime(deger):
    return re.compile(r"(?<![A-Za-z0-9_-])%s(?![A-Za-z0-9_-])" % re.escape(deger))


# ------------------------------------------------------------------ parametre
def duzle(belge, yol=""):
    if isinstance(belge, dict):
        for k, v in belge.items():
            for x in duzle(v, "%s.%s" % (yol, k) if yol else str(k)):
                yield x
    elif isinstance(belge, list):
        for i, v in enumerate(belge):
            ad = v.get("name") if isinstance(v, dict) and isinstance(v.get("name"), str) else None
            for x in duzle(v, "%s[%s]" % (yol, ad if ad else i)):
                yield x
    else:
        yield yol, belge


def yaml_alanlari(yol):
    alanlar = {}
    for i, b in enumerate(yaml.safe_load_all(open(yol, encoding="utf-8", errors="replace"))):
        if not isinstance(b, dict):
            continue
        anahtar = "%s/%s" % (b.get("kind", "?"), (b.get("metadata") or {}).get("name", "#%d" % i))
        for alan, deger in duzle(b):
            if alan.startswith("metadata.managedFields") or alan.startswith("status"):
                continue
            alanlar["%s %s" % (anahtar, alan)] = deger
    return alanlar


def parametre(klasorler):
    adlar = [os.path.basename(os.path.normpath(k)) for k in klasorler]
    ortak = None
    for k in klasorler:
        s = set(dosyalar(k))
        ortak = s if ortak is None else ortak & s
    ortak = sorted(f for f in ortak or [] if metin_mi(os.path.join(klasorler[0], f)))
    if not ortak:
        print("Ortak dosya yok (aynı göreli adla) — karşılaştırılacak bir şey yok.")
        return 1
    print("Kümeler: %s · ortak dosya: %d" % (", ".join(adlar), len(ortak)))
    deger_say = {}
    for f in ortak:
        yollar = [os.path.join(k, f) for k in klasorler]
        print("\n== %s" % f)
        if yaml and f.lower().endswith((".yaml", ".yml")):
            try:
                alanlar = [yaml_alanlari(y) for y in yollar]
            except yaml.YAMLError as e:
                print("  YAML okunamadı (%s) — satır farkına geçildi" % str(e).split("\n")[0])
                alanlar = None
            if alanlar is not None:
                tum = sorted(set().union(*alanlar))
                fark = [a for a in tum if len({repr(x.get(a, "<yok>")) for x in alanlar}) > 1]
                if not fark:
                    print("  aynı (bütün kümelerde)")
                for a in fark:
                    degerler = [x.get(a, "<yok>") for x in alanlar]
                    print("  %s\n      %s" % (a, " · ".join("%s=%s" % (n, str(d)[:80]) for n, d in zip(adlar, degerler))))
                    for n, d in zip(adlar, degerler):
                        if isinstance(d, str) and d != "<yok>" and len(d) < 120:
                            deger_say.setdefault(n, {}).setdefault(d, 0)
                            deger_say[n][d] += 1
                continue
        satirlar = [open(y, encoding="utf-8", errors="replace").read().splitlines() for y in yollar]
        farkli = False
        for diger, ad in zip(satirlar[1:], adlar[1:]):
            for s in difflib.unified_diff(satirlar[0], diger, adlar[0], ad, n=0, lineterm=""):
                if not s.startswith(("---", "+++", "@@")):
                    print("  " + s[:160])
                    farkli = True
        if not farkli:
            print("  aynı (bütün kümelerde)")
    if deger_say:
        print("\n== Değiştirme adayı (kümeye özel değerler; --degis için — karar kullanıcının):")
        for n in adlar:
            if n in deger_say:
                print("  %s: %s" % (n, ", ".join("%s (%d)" % (d, c) for d, c in sorted(deger_say[n].items(), key=lambda x: -x[1])[:15])))
    return 0


# ------------------------------------------------------------------ kopyala
def kopyala(kaynak, hedef, degisler, yaz, sirlar):
    if not os.path.isdir(kaynak):
        print("kaynak klasör yok: %s" % kaynak)
        return 2
    print("%s: %s → %s · değişim: %s" % ("YAZILIYOR" if yaz else "KURU (yazılmaz; --yaz ile yaz)", kaynak, hedef,
                                        ", ".join("%s→%s" % d for d in degisler) or "yok"))
    kullanilan = {d: 0 for d in degisler}
    bulgu, plan = 0, []
    for f in dosyalar(kaynak):
        k, h = os.path.join(kaynak, f), os.path.join(hedef, f)
        if sir_mi(k) and not sirlar:
            print("  ATLANDI (sır — kümeye özel; gerekirse yeni kümede üret ya da --sirlar-dahil)  %s" % f)
            continue
        if os.path.exists(h):
            print("  VAR (üzerine yazılmaz)  %s" % f)
            bulgu += 1
            continue
        if not metin_mi(k):
            print("  kopya (ikili/metin değil, değiştirilmez)  %s" % f)
            plan.append((k, h, None))
            continue
        satirlar = open(k, encoding="utf-8", errors="replace").read().split("\n")
        yeni = []
        for no, s in enumerate(satirlar, 1):
            t = s
            for eski, ye in degisler:
                t2, n = kelime(eski).subn(ye.replace("\\", "\\\\"), t)
                if n:
                    kullanilan[(eski, ye)] += n
                    t = t2
            if t != s:
                print("  %s:%d\n      - %s\n      + %s" % (f, no, s.strip()[:150], t.strip()[:150]))
            yeni.append(t)
        metin = "\n".join(yeni)
        if yaml and f.lower().endswith((".yaml", ".yml")):
            try:
                list(yaml.safe_load_all(metin))
            except yaml.YAMLError as e:
                print("  YAML BOZULDU  %s: %s" % (f, str(e).split("\n")[0]))
                bulgu += 1
        plan.append((k, h, metin))
    for d, n in kullanilan.items():
        if n == 0:
            print("  UYARI: '%s' kaynakta hiç geçmedi (yazım? başka biçimde mi yazılı — ör. büyük harf, base64, URL içinde)" % d[0])
            bulgu += 1
    if yaz:
        for k, h, metin in plan:
            os.makedirs(os.path.dirname(h) or ".", exist_ok=True)
            if metin is None:
                shutil.copy2(k, h)
            else:
                with open(h, "w", encoding="utf-8") as f:
                    f.write(metin)
        print("yazıldı: %d dosya → %s" % (len(plan), hedef))
    else:
        print("plan: %d dosya (yazılmadı)" % len(plan))
    eski = [d[0] for d in degisler]
    if yaz and eski:
        bulgu += kalan(hedef, eski)
    return 1 if bulgu else 0


# ------------------------------------------------------------------ kalan
def kalan(hedef, eskiler):
    # harf/rakama bitişik değil ('latest' içindeki 'test' sayılmaz), '-'/'.' ile birleşik ad sayılır ('test-nfs' — elle bak)
    desenler = [(e, re.compile(r"(?<![A-Za-z0-9])%s(?![A-Za-z0-9])" % re.escape(e), re.I)) for e in eskiler]
    say = 0
    for f in dosyalar(hedef):
        y = os.path.join(hedef, f)
        if not metin_mi(y):
            continue
        for no, s in enumerate(open(y, encoding="utf-8", errors="replace").read().split("\n"), 1):
            for e, d in desenler:
                if d.search(s):
                    print("  KALAN '%s'  %s:%d  %s" % (e, f, no, s.strip()[:140]))
                    say += 1
    print("kalan değer: %d" % say if say else "kalan değer yok (%s)" % ", ".join(eskiler))
    return 1 if say else 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(KULLANIM)
        return 0
    komut, arg = argv[0], argv[1:]
    if komut == "parametre" and len(arg) >= 2:
        return parametre(arg)
    if komut == "kalan" and len(arg) >= 2:
        return kalan(arg[0], arg[1:])
    if komut == "kopyala":
        degisler, yaz, sirlar, konum, i = [], False, False, [], 0
        while i < len(arg):
            if arg[i] == "--degis" and i + 1 < len(arg) and "=" in arg[i + 1]:
                e, y = arg[i + 1].split("=", 1)
                if not e:
                    print("--degis eski değeri boş olamaz")
                    return 2
                degisler.append((e, y))
                i += 2
                continue
            if arg[i] == "--yaz":
                yaz = True
            elif arg[i] == "--sirlar-dahil":
                sirlar = True
            else:
                konum.append(arg[i])
            i += 1
        if len(konum) == 2:
            return kopyala(konum[0], konum[1], degisler, yaz, sirlar)
    print(KULLANIM)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
