#!/usr/bin/env python3
# ca-dogrula.py — CA sertifikası sunuculara GERÇEKTEN yüklendi mi? Dosyanın varlığı yetmez: güven paketine (update-ca-trust extract
# sonrası) girmiş mi ve hedef URL'lere sertifika hatası olmadan gidilebiliyor mu — sunucu başına ölçüp TAMAM / EKSİK kararı verir.
# Saha (Alp, 2026-10-27): dn29000 işinde ajan "18/18 BAŞARILI" tablosu yazdı, sertifika hiçbir sunucuya yüklenmemişti. "İnsan bir kontrol
# eder: anchors'a konur, update-ca-trust extract, trust list kontrol edilir, URL'ler çekilir, gidebiliyor mu?" Kararı model değil bu betik verir.
#
#   ca-dogrula.py komut --kaynak <sertifika.pem> [--hedef /etc/pki/ca-trust/source/anchors/x.crt] [--url https://… …] --grup <ansible grubu>
#       → çalıştırılacak SALT-OKUNUR ansible komutunu basar (kaynaktan beklenen sha256 + paket parçası hesaplanır; elle yazma)
#   ca-dogrula.py tablo <tree-dizini> --kaynak <sertifika.pem> [--url …]
#       → sunucu başına: dosya · sha · güven paketi · trust list · URL'ler · KARAR. Çıkış 0 hepsi TAMAM, 1 eksik var, 2 hata.
import base64
import json
import os
import re
import shlex
import subprocess
import sys

PAKET = "/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem"
VARSAYILAN_DIZIN = "/etc/pki/ca-trust/source/anchors/"


def arg(argv, ad, vars_=None):
    return argv[argv.index(ad) + 1] if ad in argv and argv.index(ad) + 1 < len(argv) else vars_


def coklu(argv, ad):
    return [argv[i + 1] for i, x in enumerate(argv) if x == ad and i + 1 < len(argv)]


def sertifika_bilgi(yol):
    metin = open(yol, encoding="ascii", errors="replace").read()
    m = re.search(r"-----BEGIN CERTIFICATE-----(.+?)-----END CERTIFICATE-----", metin, re.S)
    if not m:
        raise SystemExit("PEM sertifika bulunamadı: %s (DER ise: openssl x509 -inform der -in x -out x.pem)" % yol)
    b64 = re.sub(r"\s+", "", m.group(1))
    der = base64.b64decode(b64)
    import hashlib
    # güven paketinde aranacak parça: base64 akışının ortasından 48 karakter (satır kırılımı/başlıktan bağımsız)
    orta = len(b64) // 2
    parca = b64[orta - 24:orta + 24]
    cn = "?"
    try:
        konu = subprocess.run(["openssl", "x509", "-noout", "-subject", "-nameopt", "RFC2253", "-in", yol],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode("utf-8", "replace")
        c = re.search(r"CN=([^,\n]+)", konu)
        cn = c.group(1).strip() if c else konu.strip()[8:] or "?"
    except OSError:
        pass
    dosya_sha = hashlib.sha256(open(yol, "rb").read()).hexdigest()
    return {"parca": parca, "cn": cn, "dosya_sha": dosya_sha, "der_sha": hashlib.sha256(der).hexdigest()}


def uzak_betik(hedef, parca, cn, urller):
    # Hepsi okuma: test, sha256sum, tr|grep, trust list, curl -o /dev/null. Her satır anahtar=değer (filo-tablo --kv ile de okunur).
    s = ['f=%s' % shlex.quote(hedef),
         'if [ -f "$f" ]; then echo "dosya=var"; echo "sha=$(sha256sum "$f" | cut -c1-16)"; else echo "dosya=yok"; fi',
         'echo "paket=$(tr -d "\\n\\r" < %s 2>/dev/null | grep -c -F %s)"' % (PAKET, shlex.quote(parca)),
         'echo "trust=$(trust list --filter=ca-anchors 2>/dev/null | grep -c -F -i %s)"' % shlex.quote(cn)]
    for i, u in enumerate(urller, 1):
        s.append('r=$(curl -sS -o /dev/null -w "%%{http_code}" --max-time 15 %s 2>&1); echo "url%d_rc=$?"; echo "url%d=$(printf %%s "$r" | tr "\\n" " " | cut -c1-90)"'
                 % (shlex.quote(u), i, i))
    return "; ".join(s)


def komut(argv):
    kaynak, grup = arg(argv, "--kaynak"), arg(argv, "--grup")
    if not kaynak or not grup:
        print("komut için --kaynak <pem> ve --grup <ansible grubu> gerekli")
        return 2
    hedef = arg(argv, "--hedef", VARSAYILAN_DIZIN + os.path.basename(kaynak))
    urller = coklu(argv, "--url")
    b = sertifika_bilgi(kaynak)
    betik = uzak_betik(hedef, b["parca"], b["cn"], urller)
    etiket = arg(argv, "--etiket", "ca-dogrula")
    print("# beklenen: CN=%s · dosya sha256=%s · hedef %s · URL %d" % (b["cn"], b["dosya_sha"][:16], hedef, len(urller)))
    print("ansible %s -i <envanter> -m shell -a %s -t cikti/%s -T 10 -f 20" % (grup, shlex.quote(betik), etiket))
    print("python3 %s tablo cikti/%s --kaynak %s%s" % (os.path.abspath(__file__), etiket, kaynak,
                                                     "".join(" --url %s" % shlex.quote(u) for u in urller)))
    return 0


def tablo(argv):
    dizin, kaynak = (argv[0] if argv and not argv[0].startswith("--") else None), arg(argv, "--kaynak")
    if not dizin or not os.path.isdir(dizin) or not kaynak:
        print("tablo <tree-dizini> --kaynak <pem> gerekli")
        return 2
    urller = coklu(argv, "--url")
    b = sertifika_bilgi(kaynak)
    print("Beklenen: CN=%s · sha256=%s · güven paketi parçası (%d krk) · URL: %s" % (
        b["cn"], b["dosya_sha"][:16], len(b["parca"]), ", ".join(urller) or "yok"))
    satirlar, eksik = [], 0
    for ad in sorted(os.listdir(dizin)):
        yol = os.path.join(dizin, ad)
        try:
            j = json.load(open(yol, encoding="utf-8", errors="replace"))
        except (OSError, ValueError):
            satirlar.append((ad, "?", "?", "?", "?", "", "EKSİK: çıktı okunamadı"))
            eksik += 1
            continue
        if j.get("unreachable"):
            satirlar.append((ad, "-", "-", "-", "-", "", "EKSİK: erişilemedi (%s)" % (j.get("msg") or "")[:50]))
            eksik += 1
            continue
        kv = dict(re.findall(r"^([a-z0-9_]+)=(.*)$", j.get("stdout") or "", re.M))
        nedenler = []
        dosya = kv.get("dosya", "?")
        if dosya != "var":
            nedenler.append("dosya yok")
        sha = kv.get("sha", "")
        sha_ok = sha and b["dosya_sha"].startswith(sha)
        if dosya == "var" and not sha_ok:
            nedenler.append("dosya farklı (sha)")
        paket = kv.get("paket", "?")
        if paket in ("0", "?", ""):
            nedenler.append("güven paketinde yok (update-ca-trust extract?)")
        trust = kv.get("trust", "?")
        url_hucre = []
        for i in range(1, len(urller) + 1):
            rc, kod = kv.get("url%d_rc" % i, "?"), kv.get("url%d" % i, "?")
            if rc == "0" and re.match(r"^[23]\d\d$", kod.strip()):
                url_hucre.append("%d:%s" % (i, kod.strip()))
            else:
                neden = ("sertifika doğrulanamadı" if rc == "60" else
                         "ağ/DNS/zaman aşımı — sertifika değil" if rc in ("6", "7", "28") else "HTTP %s" % kod.strip()[:3])
                url_hucre.append("%d:HATA(rc %s)" % (i, rc))
                nedenler.append("URL%d %s" % (i, neden))
        if j.get("rc", 0) not in (0, None) and not kv:
            nedenler.append("komut düştü (rc %s): %s" % (j.get("rc"), (j.get("stderr") or j.get("msg") or "")[:60]))
        karar = "TAMAM" if not nedenler else "EKSİK: " + "; ".join(nedenler)
        eksik += bool(nedenler)
        sha_hucre = "-" if dosya != "var" else ("eşleşiyor" if sha_ok else "FARKLI " + sha)
        satirlar.append((ad, dosya, sha_hucre, paket, trust, " ".join(url_hucre), karar))
    bas = ("sunucu", "dosya", "sha", "paket", "trust", "url", "karar")
    gen = [max(len(str(r[i])) for r in satirlar + [bas]) for i in range(6)]
    print("  ".join(bas[i].ljust(gen[i]) for i in range(6)) + "  " + bas[6])
    for r in satirlar:
        print("  ".join(str(r[i]).ljust(gen[i]) for i in range(6)) + "  " + r[6])
    print("Özet: %d sunucu · TAMAM %d · EKSİK %d — karar bu tablodan; PLAY RECAP 'ok' tek başına kanıt değildir." % (
        len(satirlar), len(satirlar) - eksik, eksik))
    return 1 if eksik else 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import base64")[0].replace("# ", "").replace("#!/usr/bin/env python3\n", ""))
        return 0
    if argv[0] == "komut":
        return komut(argv[1:])
    if argv[0] == "tablo":
        return tablo(argv[1:])
    print("alt komut: komut | tablo")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
