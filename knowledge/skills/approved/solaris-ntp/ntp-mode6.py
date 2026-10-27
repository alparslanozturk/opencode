#!/usr/bin/env python3
# ntp-mode6.py — NTP "mode 6" (kontrol sorgusu, ntpq'nun kullandığı) dışarıya açık mı? Tarama bulgusunun ("NTP Mode 6 Scanner")
# aynısını bu makineden sınar: hedefe tek bir READVAR (mode 6, opcode 2) UDP paketi gönderir, cevap gelirse AÇIK der.
# ntpq/nmap gerektirmez (RHEL 9/10'da ntpq yok — chrony). Hedefte hiçbir şeyi değiştirmez; zararsız okuma sorgusudur.
# Düzeltme sonrası aynı komut KAPALI demeli (restrict … noquery). Saha: Solaris 11.4 SPARC bulgusu (Alp, 2026-10-27).
import socket
import struct
import sys

KULLANIM = """kullanım: ntp-mode6.py <sunucu|IP> [...] [--zaman-asimi 3]
Çıkış: 0 hepsi KAPALI · 1 en az biri AÇIK (bulgu sürüyor) · 2 ad çözülemedi/hata."""


def sorgula(hedef, zaman_asimi):
    # LI=0 VN=2 Mode=6 → 0x16; R=0 E=0 M=0 opcode=2 (READVAR); sıra=1; durum=0; assoc=0; offset=0; count=0
    paket = struct.pack("!BBHHHHH", 0x16, 0x02, 1, 0, 0, 0, 0)
    try:
        bilgi = socket.getaddrinfo(hedef, 123, 0, socket.SOCK_DGRAM)[0]
    except socket.gaierror as e:
        return "HATA", "ad çözülemedi (%s)" % e
    s = socket.socket(bilgi[0], socket.SOCK_DGRAM)
    s.settimeout(zaman_asimi)
    try:
        s.sendto(paket, bilgi[4])
        veri, _ = s.recvfrom(4096)
    except socket.timeout:
        return "KAPALI", "%.0f sn içinde mode 6 cevabı yok (noquery ya da 123/udp kapalı)" % zaman_asimi
    except OSError as e:
        return "KAPALI", "cevap yok (%s)" % e
    finally:
        s.close()
    if len(veri) < 12 or (veri[0] & 0x07) != 6 or not (veri[1] & 0x80):
        return "BELIRSIZ", "123/udp cevap verdi ama mode 6 cevabı değil (%d bayt)" % len(veri)
    sayi = struct.unpack("!H", veri[10:12])[0]
    hata = bool(veri[1] & 0x40)
    metin = veri[12:12 + sayi].decode("ascii", "replace")
    surum = ""
    for parca in metin.split(","):
        if parca.strip().startswith("version="):
            surum = parca.strip()[8:].strip('"')
    if hata:
        return "AÇIK", "mode 6 cevabı geldi (hata bitli — sorgu işleniyor)"
    return "AÇIK", "mode 6 cevabı geldi, %d bayt değişken%s" % (sayi, (" · " + surum) if surum else "")


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(KULLANIM)
        return 0
    zaman_asimi, hedefler, i = 3.0, [], 0
    while i < len(argv):
        if argv[i] == "--zaman-asimi" and i + 1 < len(argv):
            zaman_asimi = float(argv[i + 1])
            i += 2
            continue
        hedefler.append(argv[i])
        i += 1
    acik = hata = 0
    for h in hedefler:
        durum, aciklama = sorgula(h, zaman_asimi)
        print("%-8s %-30s %s" % (durum, h, aciklama))
        acik += durum == "AÇIK"
        hata += durum == "HATA"
    if len(hedefler) > 1:
        print("Özet: %d hedef · AÇIK %d · hata %d" % (len(hedefler), acik, hata))
    return 1 if acik else (2 if hata else 0)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
