#!/usr/bin/env python3
# envanter-harita.py — sunucu adı + IP listesinden kurum ağ haritası: adın İLK 3 HARFİ (lokasyon · ortam · alan) → sunucu sayısı,
# domain, IP blokları. Adın geri kalanı yorumlanmaz (Alp, 2026-11-03: "3 harf şeyi belirliyor, diğer kısmı beni ilgilendirmiyor").
# Kararı model değil betik verir; tabloya uymayan kod ve beklenmeyen domain "SOR" diye ayrılır — anlam uydurulmaz.
#
#   for h in $(ansible all -i <envanter> --list-hosts | tail -n +2); do getent hosts $h || echo "- $h"; done | envanter-harita.py -
#   envanter-harita.py <dosya>      satır biçimi: "<IP> <ad|fqdn> [diğer adlar]" (getent hosts) · çözülemeyen: "- <ad>"
import re
import sys

LOKASYON = {"s": "İstanbul", "d": "Ankara/DRC"}  # engine/AGENTS.md "Sunucu adı → ortam" (Alp teyidi 2026-09-25)
ORTAM = {"p": "production", "d": "development", "t": "test", "x": "prep", "b": "bugfix"}
ALAN = {"l": "local", "d": "DMZ"}


def blok(ip, n):
    return ".".join(ip.split(".")[:n]) + ".x"


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import re")[0].replace("# ", "").replace("#!/usr/bin/env python3\n", ""))
        return 0
    metin = sys.stdin.read() if argv[0] == "-" else open(argv[0], encoding="utf-8", errors="replace").read()
    kodlar, cozulemeyen = {}, []
    for satir in metin.splitlines():
        p = satir.split()
        if len(p) < 2:
            continue
        if p[0] == "-":
            cozulemeyen.append(p[1])
            continue
        if not re.match(r"^\d+\.\d+\.\d+\.\d+$", p[0]):
            continue
        fqdn = next((x for x in p[1:] if "." in x), p[1]).lower()
        ad = fqdn.split(".")[0]
        domain = fqdn.split(".", 1)[1] if "." in fqdn else "(kısa ad)"
        k = kodlar.setdefault(ad[:3], {"adlar": set(), "domain": {}, "b16": {}, "b24": {}})
        k["adlar"].add(ad)
        for alan, deger in (("domain", domain), ("b16", blok(p[0], 2)), ("b24", blok(p[0], 3))):
            k[alan][deger] = k[alan].get(deger, 0) + 1
    print("%-5s %-11s %-12s %-6s %4s  %-30s %s" % ("kod", "lokasyon", "ortam", "alan", "adet", "domain (adet)", "IP /16 blokları (adet)"))
    sorular = []
    for kod in sorted(kodlar):
        k = kodlar[kod]
        l, o, a = (LOKASYON.get(kod[0:1]), ORTAM.get(kod[1:2]), ALAN.get(kod[2:3]))
        say = lambda d: ", ".join("%s(%d)" % (x, n) for x, n in sorted(d.items(), key=lambda z: -z[1]))
        print("%-5s %-11s %-12s %-6s %4d  %-30s %s" % (kod, l or "?", o or "?", a or "?", len(k["adlar"]), say(k["domain"]), say(k["b16"])))
        if not (l and o and a):
            sorular.append("%s: 3 harf tabloya uymuyor (%d sunucu, ör. %s) — eski/özel ad mı? anlamını kullanıcı söyler" % (
                kod, len(k["adlar"]), ", ".join(sorted(k["adlar"])[:3])))
        elif a == "DMZ" and not any("dmz" in d for d in k["domain"]):
            sorular.append("%s: alan DMZ ama domain %s — DMZ domain'i bu mu?" % (kod, ", ".join(k["domain"])))
        elif a == "local" and any("dmz" in d for d in k["domain"]):
            sorular.append("%s: alan local ama domain %s — ad mı yanlış, DNS kaydı mı?" % (kod, ", ".join(k["domain"])))
        if len(k["b16"]) > 1:
            sorular.append("%s: birden çok /16 blok (%s) — hepsi aynı ortam mı, yoksa bölünmüş mü?" % (kod, say(k["b16"])))
    if cozulemeyen:
        sorular.append("DNS'te çözülemeyen %d ad: %s — DMZ ise DMZ DNS'ine sorulmalı (nslookup <ad> <dmz-dns>)" % (
            len(cozulemeyen), " ".join(sorted(cozulemeyen)[:10])))
    print("\nSOR (kullanıcıya, tek mesajda):" if sorular else "\nSOR: yok")
    for i, s in enumerate(sorular, 1):
        print("  %d. %s" % (i, s))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
