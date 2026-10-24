#!/usr/bin/env python3
# sertifika-kontrol.py — sertifika/anahtar dosyalarını tek seferde denetler: dosya türü (PEM/DER/anahtar/PFX), yapıştırma
# hataları (CRLF, BEGIN≠END, yapışık blok), her sertifikanın subject/issuer/SAN/tarihleri ve KALAN GÜN (hesaplanmış),
# anahtar ↔ sertifika eşleşmesi, zincir sırası + `openssl verify`, aynı sertifikanın hangi dosyalarda geçtiği (eski yaprak).
# Yalnız okur; özel anahtarı ASLA basmaz (yalnız açık anahtar özeti karşılaştırılır). Yerel `openssl` ile çalışır.
# Neden (saha G65, G83-G88, G94): model kalan günü kafadan yanlış hesapladı (84 → "120"), eski chain.pem'deki ESKİ yaprağı
# secret'a vermeyi önerdi, DER/PEM karıştırdı, anahtar eşleşmesini atladı, base64'ü elle kopyalayıp bozdu.
#
# kullanım:
#   sertifika-kontrol.py <dosya|dizin> [...] [--ad <hostname>] [--esik <gün>]        (yerel dosyalar; dizinde 1 alt düzey)
#   ssh root@<h> 'cd <dizin> && for f in * */*; do [ -f "$f" ] && { echo "#DOSYA $f"; base64 -w0 "$f"; echo; }; done' | sertifika-kontrol.py - [--ad …]
#   kubectl -n <ns> get secret <ad> -o json | sertifika-kontrol.py - --ad <hostname>   (secret'taki tls.crt/ca.crt/cacerts.pem; anahtar okunmaz)
#   sertifika-kontrol.py --uc <host>:<port> [--uc …] [kök-ca.pem]   (CANLI uç: https 443, ldaps 636 — sunucunun GÖNDERDİĞİ zincir,
#                       `openssl s_client -showcerts`; kök CA dosyası verilirse verify de yapılır; tek --uc'de --ad = host)
#   openssl s_client -connect <h>:<p> -showcerts </dev/null | sertifika-kontrol.py -   (düz PEM de okunur)
#   --ad   : SAN'da aranacak ad (Rancher hostname) · --esik : ❌ eşiği (varsayılan 30 gün; 120 gün altı ⚠)
#   --ozet : sertifika başına tek satır, kalan güne göre sıralı (RKE2 server/tls dizini — rke2-denetim/-guvenlik)
import base64
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

PEM_RE = re.compile(rb"-----BEGIN ([A-Z0-9 ]+)-----(.*?)-----END \1-----", re.S)
ENV = dict(os.environ, LC_ALL="C")


def ossl(args, girdi):
    try:
        p = subprocess.run(["openssl"] + args, input=girdi, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ENV, timeout=20)
    except (OSError, subprocess.SubprocessError) as e:
        return 1, b"", str(e).encode()
    return p.returncode, p.stdout, p.stderr


def simdi_utc():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def tarih(s):
    s = re.sub(r"\s+", " ", s.strip())
    for f in ("%b %d %H:%M:%S %Y %Z", "%b %d %H:%M:%S %Y"):
        try:
            return datetime.datetime.strptime(s, f)
        except ValueError:
            pass
    return None


def sertifika(pem):
    rc, out, err = ossl(["x509", "-noout", "-subject", "-issuer", "-dates", "-fingerprint", "-sha256", "-nameopt", "RFC2253"], pem)
    if rc != 0:
        return {"hata": err.decode(errors="replace").strip().splitlines()[-1:] or ["?"]}
    c = {}
    for s in out.decode(errors="replace").splitlines():
        k, _, v = s.partition("=")
        k = k.strip().lower()
        if k == "subject":
            c["subject"] = v.strip()
        elif k == "issuer":
            c["issuer"] = v.strip()
        elif k == "notbefore":
            c["notBefore"] = v.strip()
        elif k == "notafter":
            c["notAfter"] = v.strip()
        elif "fingerprint" in k:
            c["parmak"] = v.strip().replace(":", "")[:16]
    _, text, _ = ossl(["x509", "-noout", "-text"], pem)
    t = text.decode(errors="replace")
    m = re.search(r"Subject Alternative Name:.*?\n\s*(.+)", t)
    c["san"] = m.group(1).strip() if m else ""
    c["ca"] = bool(re.search(r"CA:TRUE", t))
    _, pub, _ = ossl(["x509", "-noout", "-pubkey"], pem)
    c["pub"] = hashlib.sha256(b"".join(pub.split())).hexdigest()[:16] if pub else ""
    c["kok"] = c.get("subject") == c.get("issuer")
    na = tarih(c.get("notAfter", ""))
    nb = tarih(c.get("notBefore", ""))
    simdi = simdi_utc()
    c["kalan"] = (na - simdi).days if na else None
    c["henuz"] = bool(nb and nb > simdi)
    c["pem"] = pem
    return c


def anahtar(blok_turu, pem):
    if "ENCRYPTED" in blok_turu:
        return {"tur": "şifreli (PKCS#8 ENCRYPTED) — parola gerekir, eşleşme denetlenemez", "pub": ""}
    rc, out, err = ossl(["pkey", "-pubout", "-passin", "pass:"], pem)
    if rc != 0:
        return {"tur": "%s — okunamadı (%s)" % (blok_turu, err.decode(errors="replace").strip().splitlines()[-1:]), "pub": ""}
    tur = {"PRIVATE KEY": "PKCS#8 şifresiz", "RSA PRIVATE KEY": "PKCS#1 RSA şifresiz", "EC PRIVATE KEY": "EC şifresiz"}.get(blok_turu, blok_turu)
    return {"tur": tur, "pub": hashlib.sha256(b"".join(out.split())).hexdigest()[:16]}


def dosya_coz(ad, ham):
    d = {"ad": ad, "sertifikalar": [], "anahtarlar": [], "notlar": [], "tur": ""}
    if b"-----BEGIN" in ham:
        bloklar = PEM_RE.findall(ham)
        b_say, e_say = ham.count(b"-----BEGIN "), ham.count(b"-----END ")
        d["tur"] = "PEM"
        if b_say != e_say:
            d["notlar"].append("❌ BEGIN %d ≠ END %d (eksik/kesik yapıştırma)" % (b_say, e_say))
        if re.search(rb"-----END [A-Z ]+----------BEGIN", ham):
            d["notlar"].append("❌ yapışık blok (END ve BEGIN aynı satırda — satır sonu eksik)")
        if b"\r" in ham:
            d["notlar"].append("⚠ CRLF var (Windows satır sonu) — sed -i 's/\\r$//' <dosya>")
        for tur, govde in bloklar:
            tur = tur.decode()
            pem = b"-----BEGIN %s-----%s-----END %s-----\n" % (tur.encode(), govde.replace(b"\r", b""), tur.encode())
            if tur in ("CERTIFICATE", "TRUSTED CERTIFICATE"):
                d["sertifikalar"].append(sertifika(pem))
            elif "PRIVATE KEY" in tur:
                d["anahtarlar"].append(anahtar(tur, pem))
            elif tur == "PKCS7":
                rc, out, _ = ossl(["pkcs7", "-print_certs"], pem)
                for _, g in PEM_RE.findall(out):
                    d["sertifikalar"].append(sertifika(b"-----BEGIN CERTIFICATE-----" + g + b"-----END CERTIFICATE-----\n"))
                d["notlar"].append("PKCS7 içinden %d sertifika" % len(d["sertifikalar"]))
            else:
                d["notlar"].append("blok: %s (denetlenmedi)" % tur)
        if not bloklar:
            d["notlar"].append("❌ BEGIN var ama geçerli PEM bloğu yok (bozuk)")
        return d
    rc, out, _ = ossl(["x509", "-inform", "der", "-outform", "pem"], ham)
    if rc == 0:
        d["tur"] = "DER sertifika (ikili) — PEM'e çevir: openssl x509 -inform der -in %s -out <ad>.pem" % ad
        d["sertifikalar"].append(sertifika(out))
        return d
    if ad.lower().endswith((".pfx", ".p12")) or ham[:1] == b"\x30":
        d["tur"] = "PFX/PKCS#12 ya da başka ikili — parola gerekir, açılmadı (SKILL §2 openssl pkcs12)"
        return d
    d["tur"] = "tanınmadı (sertifika/anahtar değil)"
    return d


def girdileri_oku(argv):
    dosyalar = []
    for a in argv:
        if a == "-":
            metin = sys.stdin.buffer.read()
            if metin.lstrip()[:1] == b"{":
                try:
                    obj = json.loads(metin.decode("utf-8", "replace"))
                except ValueError:
                    obj = {}
                for o in obj.get("items", [obj]):
                    md = o.get("metadata", {})
                    for alan in ("tls.crt", "ca.crt", "cacerts.pem"):  # tls.key okunmaz
                        if alan in (o.get("data") or {}):
                            dosyalar.append(("canlı:%s/%s/%s" % (md.get("namespace", "?"), md.get("name", "?"), alan),
                                             base64.b64decode(o["data"][alan])))
            elif b"#DOSYA " not in metin and b"-----BEGIN" in metin:
                dosyalar.append(("stdin", metin))  # düz PEM (ör. s_client -showcerts çıktısı)
            else:
                ad = None
                for s in metin.splitlines():
                    if s.startswith(b"#DOSYA "):
                        ad = s[7:].decode(errors="replace").strip()
                    elif ad and s.strip():
                        try:
                            dosyalar.append((ad, base64.b64decode(s.strip())))
                        except ValueError:
                            dosyalar.append((ad, b""))
                        ad = None
        elif os.path.isdir(a):
            for kok, dizinler, adlar in os.walk(a):
                if kok.count(os.sep) - a.rstrip(os.sep).count(os.sep) > 1:
                    continue
                for n in sorted(adlar):
                    yol = os.path.join(kok, n)
                    if os.path.getsize(yol) < 1024 * 1024:
                        dosyalar.append((os.path.relpath(yol, a), open(yol, "rb").read()))
        elif os.path.isfile(a):
            dosyalar.append((a, open(a, "rb").read()))
        else:
            print("yok: %s" % a)
    return dosyalar


def uc_oku(uc):
    # Canlı uç (https/ldaps): sunucunun TLS el sıkışmasında gönderdiği zincir. Yalnız okur (bağlanır, veri göndermez).
    host = uc.rsplit(":", 1)[0].strip("[]")
    args = ["s_client", "-connect", uc, "-showcerts"]
    if not re.match(r"^[0-9.]+$|:", host):
        args += ["-servername", host]  # SNI (IP'ye verilmez)
    rc, out, err = ossl(args, b"")
    if b"-----BEGIN CERTIFICATE" not in out:
        son = (err or out).decode(errors="replace").strip().splitlines()[-1:] or ["?"]
        return None, son[0]
    return b"".join(b"-----BEGIN CERTIFICATE-----%s-----END CERTIFICATE-----\n" % g for t, g in PEM_RE.findall(out)
                    if t == b"CERTIFICATE"), ""


def dogrula(yaprak, havuz):
    kokler = [c for c in havuz if c.get("kok") and c.get("ca")]
    aralar = [c for c in havuz if c.get("ca") and not c.get("kok")]
    if not kokler:
        return "doğrulanamadı — elde kök CA sertifikası yok"
    with tempfile.NamedTemporaryFile(suffix=".pem") as k, tempfile.NamedTemporaryFile(suffix=".pem") as u, \
            tempfile.NamedTemporaryFile(suffix=".pem") as y:
        k.write(b"".join(c["pem"] for c in kokler)); k.flush()
        u.write(b"".join(c["pem"] for c in aralar)); u.flush()
        y.write(yaprak["pem"]); y.flush()
        args = ["verify", "-CAfile", k.name] + (["-untrusted", u.name] if aralar else []) + [y.name]
        rc, out, err = ossl(args, b"")
        metin = (out + err).decode(errors="replace").strip().replace(y.name, "yaprak")
        return ("OK" if rc == 0 and metin.endswith("OK") else "❌ " + " ".join(metin.splitlines()[-2:]))


def ozet_kipi(dosyalar, esik):
    # RKE2 server/tls gibi çok sertifikalı dizin: sertifika başına tek satır, KALAN GÜNE göre sıralı (en yakın bitiş üstte).
    # (Eski becerideki `sort -t= -k2` ay ADINA göre alfabetik sıralıyordu — en yakın bitişi göstermez.)
    satirlar = []
    for d in dosyalar:
        for i, c in enumerate(d["sertifikalar"], 1):
            if "hata" in c:
                satirlar.append((-10 ** 9, "  %-8s %-26s %s#%d okunamadı" % ("?", "", d["ad"], i)))
                continue
            k = c["kalan"]
            isaret = "❌" if k is not None and k < esik else ("⚠" if k is not None and k < 120 else "✓")
            satirlar.append((k if k is not None else -10 ** 9, "  %s %5s gün  %-26s %s#%d  %s" % (
                isaret, k if k is not None else "?", c.get("notAfter", "?"), d["ad"], i, c.get("subject", ""))))
    print("Sertifika özeti — %d sertifika, kalan güne göre (betik hesapladı; ❌ < %d gün, ⚠ < 120 gün)" % (len(satirlar), esik))
    for _, s in sorted(satirlar, key=lambda x: x[0]):
        print(s)
    return 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import base64")[0])
        return 0 if argv else 2
    ad = argv[argv.index("--ad") + 1] if "--ad" in argv else None
    esik = int(argv[argv.index("--esik") + 1]) if "--esik" in argv else 30
    ucler = [argv[i + 1] for i, a in enumerate(argv) if a == "--uc" and i + 1 < len(argv)]
    yollar = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] not in ("--ad", "--esik", "--uc"))]
    dosyalar = [dosya_coz(n, h) for n, h in girdileri_oku(yollar)]
    for uc in ucler:
        pem, hata = uc_oku(uc)
        d = dosya_coz("canlı:uç/%s" % uc, pem or b"")
        if pem is None:
            d["tur"] = "❌ bağlanılamadı / sertifika alınamadı: %s" % hata
            d["notlar"] = []
        else:
            d["tur"] = "canlı uç (sunucunun gönderdiği zincir)"
            ss = [c for c in d["sertifikalar"] if "hata" not in c]
            if len(ss) == 1 and not ss[0].get("kok"):
                d["notlar"].append("⚠ uç yalnız yaprağı gönderiyor (ara CA yok) — ara CA'yı bilmeyen istemcide doğrulama düşer")
        dosyalar.append(d)
    if ad is None and len(ucler) == 1:
        ad = ucler[0].rsplit(":", 1)[0].strip("[]")
    if "--ozet" in argv:
        return ozet_kipi(dosyalar, esik)
    bugun = simdi_utc().strftime("%Y-%m-%d")
    print("Sertifika kontrolü — %d dosya · bugün %s (UTC) · kalan gün betikte hesaplandı · özel anahtar basılmaz" % (len(dosyalar), bugun))
    havuz = []
    for d in dosyalar:
        print("\n== %s · %s%s" % (d["ad"], d["tur"], (" · %d sertifika" % len(d["sertifikalar"])) if d["sertifikalar"] else ""))
        for n in d["notlar"]:
            print("  " + n)
        for i, c in enumerate(d["sertifikalar"], 1):
            if "hata" in c:
                print("  #%d ❌ okunamadı: %s" % (i, c["hata"]))
                continue
            c["yer"] = "%s#%d" % (d["ad"], i)
            havuz.append(c)
            kalan = c["kalan"]
            isaret = "❌" if kalan is not None and kalan < esik else ("⚠" if kalan is not None and kalan < 120 else "✓")
            rol = "kök CA" if c["kok"] and c["ca"] else ("ara CA" if c["ca"] else "yaprak")
            print("  #%d %s · subject: %s" % (i, rol, c.get("subject")))
            print("      issuer: %s" % c.get("issuer"))
            print("      geçerlilik: %s → %s · kalan %s gün %s%s" % (c.get("notBefore"), c.get("notAfter"),
                  kalan if kalan is not None else "?", isaret, " · HENÜZ GEÇERLİ DEĞİL" if c["henuz"] else ""))
            if c["san"]:
                print("      SAN: %s" % c["san"][:300])
            print("      parmak izi(sha256): %s… · açık anahtar özeti: %s…" % (c.get("parmak", "?"), c["pub"]))
        for i, k in enumerate(d["anahtarlar"], 1):
            print("  anahtar #%d: %s%s" % (i, k["tur"], (" · açık anahtar özeti: %s…" % k["pub"]) if k["pub"] else ""))
        # zincir sırası (çok sertifikalı dosya)
        ss = [c for c in d["sertifikalar"] if "hata" not in c]
        if len(ss) > 1:
            sorun = []
            yaprakli = any(not c["ca"] for c in ss)
            if yaprakli and ss[0]["ca"]:
                sorun.append("ilk sertifika yaprak değil (CA)")
            for a, b in zip(ss, ss[1:]):
                if a.get("issuer") != b.get("subject"):
                    sorun.append("#%d'in issuer'ı #%d'in subject'i değil" % (ss.index(a) + 1, ss.index(b) + 1))
            print("  %s: %s" % ("zincir sırası" if yaprakli else "CA paketi sırası",
                                ("✓ " + ("yaprak → ara → kök sırasında" if yaprakli else "ara → kök sırasında")) if not sorun else "❌ " + "; ".join(sorun)))

    # anahtar ↔ sertifika eşleşmesi
    anahtarlar = [(d["ad"], i, k) for d in dosyalar for i, k in enumerate(d["anahtarlar"], 1) if k["pub"]]
    if anahtarlar:
        print("\n== Anahtar ↔ sertifika eşleşmesi")
        for dad, i, k in anahtarlar:
            es = [c["yer"] for c in havuz if c["pub"] == k["pub"]]
            print("  %s anahtar #%d → %s" % (dad, i, ("✓ eşleşen sertifika: " + ", ".join(es)) if es else "❌ bu dosyalarda eşleşen sertifika YOK"))

    # aynı sertifika birden çok dosyada / eski yaprak
    gruplar = {}
    for c in havuz:
        gruplar.setdefault(c.get("parmak"), []).append(c["yer"])
    tekrar = [v for v in gruplar.values() if len(v) > 1]
    if tekrar:
        print("\n== Aynı sertifika birden çok yerde (parmak izi aynı)")
        for v in tekrar:
            print("  " + " = ".join(v))
    yapraklar = [c for c in havuz if not c["ca"]]
    konular = {}
    for c in yapraklar:
        konular.setdefault(c.get("subject"), []).append(c)
    for konu, cs in konular.items():
        farkli = {c.get("parmak") for c in cs}
        if len(farkli) > 1:
            en_yeni = max(cs, key=lambda c: c["kalan"] if c["kalan"] is not None else -10 ** 9)
            print("\n== Aynı ad, FARKLI yapraklar: %s" % konu)
            for c in sorted(cs, key=lambda c: c["kalan"] or 0):
                print("  %-40s notAfter %s %s" % (c["yer"], c.get("notAfter"), "← EN YENİ" if c.get("parmak") == en_yeni.get("parmak") else "← ESKİ"))

    # karar bloğu — her farklı yaprak için bir kez
    if yapraklar:
        print("\n== Karar bloğu (yaprak başına)")
        gorulen = set()
        canli = [c for c in yapraklar if c["yer"].startswith("canlı:")]
        for c in yapraklar:
            if c.get("parmak") in gorulen:
                continue
            gorulen.add(c.get("parmak"))
            satir = []
            if ad:
                adlar = [x.strip()[4:] for x in c["san"].split(",") if x.strip().startswith("DNS:")]
                tut = any(a == ad or (a.startswith("*.") and ad.endswith(a[1:]) and ad.count(".") == a.count(".")) for a in adlar)
                satir.append("SAN %s %s" % (ad, "✓" if tut else "❌ YOK"))
            satir.append("kalan %s gün" % c["kalan"])
            es = [k for _, _, k in anahtarlar if k["pub"] == c["pub"]]
            if c["yer"].startswith("canlı:"):
                satir.append("anahtar — (canlı kaynağın anahtarı okunmaz)")
            else:
                satir.append("anahtar %s" % ("✓" if es else ("❌ eşleşen yok" if anahtarlar else "— (anahtar dosyası verilmedi)")))
            satir.append("verify %s" % dogrula(c, havuz))
            if canli and not c["yer"].startswith("canlı:"):
                satir.append("canlı ile issuer adı %s" % ("AYNI → aynı CA akışı (§0)" if any(x.get("issuer") == c.get("issuer") for x in canli)
                                                       else "FARKLI → dur, §1 farklı CA"))
            print("  %s: %s" % (", ".join(gruplar.get(c.get("parmak"), [c["yer"]])), " · ".join(satir)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
