#!/usr/bin/env python3
# erisim-blok.py — "envanterdeki sunuculara bu makineden erişiliyor mu?" sorusunu IP bloğu (/24) başına özetler. Yalnız okur:
# `ansible … -m raw -a true -t <dizin>` tree çıktısı + yerel `ansible-inventory --list` (bağlantı yok).
# Neden (Alp, 2026-11-04): "o ip bloğunda hiç bir sunucuya erişmiyorsak FW erişim talebi almak gerekir; ama bir sunucuya erişilemiyor
# fakat farklı sunucuya erişiyorsa ona göre yol alırız." Model bunu playbook'ta sabit bir mesajla "analiz" etti — örüntü sayılmadı.
# Karar betikte: ağ yolu açık mı (ssh cevap verdi mi — yetki/refused dahil) blok başına sayılır.
#
# kullanım:
#   erisim-blok.py <tree-dizini> -i <envanter> [--grup all] [--kaynak <bu makinenin IP'si>] [--port 22]
# Çıkış: 0 hepsine erişildi · 1 erişilemeyen var · 2 okunamadı
import importlib.util
import ipaddress
import json
import os
import re
import subprocess
import sys

# ssh/ansible mesajı → (sınıf, açıklama). "ağ açık" = paket sunucuya gidip cevap döndü; FW talebinin konusu değil.
SINIFLAR = [
    (r"Could not resolve hostname|Name or service not known|nodename nor servname", "dns", "DNS çözülemedi"),
    (r"Connection timed out|Operation timed out|timed out during banner", "zaman", "zaman aşımı (cevap yok)"),
    (r"No route to host|Network is unreachable", "yol", "yol yok"),
    (r"Connection refused", "acik", "reddedildi — ağ açık, sshd kapalı/başka port"),
    (r"Permission denied|Authentication failed|Too many authentication failures", "acik", "yetki — ağ açık, anahtar/kullanıcı"),
    (r"Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED", "acik", "host anahtarı — ağ açık"),
    (r"Connection reset|Connection closed|kex_exchange", "acik", "bağlantı kapandı — ağ açık, ssh bozuk"),
]
IP_MSG = re.compile(r"connect to host (\d+\.\d+\.\d+\.\d+) port (\d+)")


def filo_tablo():
    yol = os.path.join(os.path.dirname(os.path.abspath(__file__)), "filo-tablo.py")
    spec = importlib.util.spec_from_file_location("filo_tablo", yol)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def envanter_ipler(envanter):
    try:
        p = subprocess.run(["ansible-inventory", "-i", envanter, "--list"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
        hv = json.loads(p.stdout.decode(errors="replace") or "{}").get("_meta", {}).get("hostvars", {})
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        print("ansible-inventory okunamadı: %s" % e)
        return {}
    return {h: str(v.get("ansible_host") or "") for h, v in hv.items()}


def ip_mi(s):
    try:
        ipaddress.IPv4Address(s)
        return True
    except ValueError:
        return False


def sinifla(ft, d):
    k, m = ft.durum(d)
    if k in ("ok", "DİSK DOLU", "ZAMAN AŞIMI") or k.startswith("rc="):
        return "erisildi", "erişildi" if k == "ok" or k.startswith("rc=") else k.lower()
    for desen, s, ad in SINIFLAR:
        if re.search(desen, m or "", re.I):
            return s, ad
    return "diger", "diğer: %s" % ((m or k).strip().splitlines() or [k])[-1][:90]


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__ or open(__file__, encoding="utf-8").read().split("\nimport")[0])
        return 0
    dizin, envanter, grup, kaynak, port = argv[0], None, "all", None, None
    i = 1
    while i < len(argv):
        if argv[i] in ("-i", "--grup", "--kaynak", "--port") and i + 1 < len(argv):
            v = argv[i + 1]
            if argv[i] == "-i":
                envanter = v
            elif argv[i] == "--grup":
                grup = v
            elif argv[i] == "--kaynak":
                kaynak = v
            else:
                port = v
            i += 2
            continue
        print("bilinmeyen argüman: %s" % argv[i])
        return 2
    if not os.path.isdir(dizin) or not envanter or not os.path.isfile(envanter):
        print("kullanım: erisim-blok.py <tree-dizini> -i <envanter> [--grup all] [--kaynak <IP>] [--port 22]")
        return 2
    ft = filo_tablo()
    veri = ft.oku(dizin)
    hostlar = ft.beklenen(grup, envanter) or sorted(veri)
    ipler = envanter_ipler(envanter)

    kayit = []  # (host, ip, sinif, aciklama)
    for h in hostlar:
        d = veri.get(h)
        ip = ipler.get(h) or (h if ip_mi(h) else "")
        if d is None:
            kayit.append((h, ip, "yok", "çıktı yok — tarama bitmeden kesildi ya da hedef dışı"))
            continue
        mm = IP_MSG.search(d.get("msg") or "")
        if mm:
            ip = ip or mm.group(1)
            port = port or mm.group(2)
        s, a = sinifla(ft, d)
        kayit.append((h, ip, s, a))
    port = port or "22"

    bloklar = {}
    for h, ip, s, a in kayit:
        b = str(ipaddress.IPv4Network(ip + "/24", strict=False)) if ip_mi(ip) else "IP yok (envanterde ansible_host yok, ad çözülemedi)"
        bloklar.setdefault(b, []).append((h, ip, s, a))

    erisilen = sum(1 for k in kayit if k[2] == "erisildi")
    print("Kaynak dizin: %s · envanter: %s · grup: %s" % (dizin, envanter, grup))
    print("Toplam %d sunucu · erişildi %d · erişilemedi %d · blok %d" % (len(kayit), erisilen, len(kayit) - erisilen, len(bloklar)))

    fw, tek, temiz = [], [], []
    for b in sorted(bloklar, key=lambda x: (not x[0].isdigit(), [int(p) if p.isdigit() else 0 for p in re.split(r"[./]", x)])):
        uy = bloklar[b]
        ag_acik = [u for u in uy if u[2] in ("erisildi", "acik")]
        ag_kapali = [u for u in uy if u[2] in ("zaman", "yol")]
        if not b[0].isdigit() or len(ag_acik) == len(uy) and all(u[2] == "erisildi" for u in uy):
            (temiz if b[0].isdigit() else tek).append((b, uy))
        elif not ag_acik and ag_kapali and len(ag_kapali) == len([u for u in uy if u[2] != "yok"]):
            fw.append((b, uy))
        else:
            tek.append((b, uy))

    print("\n== AĞ YOLU KAPALI — bloğun hiçbir sunucusu cevap vermedi → FW/yönlendirme talebi adayı (%d blok)" % len(fw))
    for b, uy in fw:
        print("  %s  (%d sunucu)  kaynak %s → %s tcp/%s" % (b, len(uy), kaynak or "<bu makine — --kaynak>", b, port))
        for h, ip, s, a in uy:
            print("      %-32s %-15s %s" % (h, ip, a))
    print("\n== BLOK AÇIK, BAZI SUNUCULAR SORUNLU — FW bloğu değil, sunucu başına bak (%d blok)" % len(tek))
    for b, uy in tek:
        sorunlu = [u for u in uy if u[2] != "erisildi"]
        print("  %s  (%d sunucu, %d erişildi)" % (b, len(uy), len(uy) - len(sorunlu)))
        for h, ip, s, a in sorunlu:
            print("      %-32s %-15s %s" % (h, ip, a))
    print("\n== HEPSİNE ERİŞİLDİ (%d blok): %s" % (len(temiz), ", ".join("%s(%d)" % (b, len(uy)) for b, uy in temiz) or "-"))
    print("\nNot: 'zaman aşımı' tek sunucuda = kapalı sunucu ya da sunucunun kendi FW'ı da olabilir; blok kararı yalnız aynı /24'teki")
    print("diğer sunuculara bakar. /24 varsayımdır — kurumun gerçek ağ maskesi farklıysa kullanıcıya sor.")
    return 0 if erisilen == len(kayit) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
