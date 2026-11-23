#!/usr/bin/env python3
# sar-ozet.py — sysstat geçmişinden (sadf -d, sütun ADLARIYLA) sunucu başına kapasite özeti: CPU, bellek, yük; ortalama,
# p95, en yüksek ve zamanı; gün başına tablo. Yalnız okur (yerel dosya / stdin).
# Neden (saha G21, G22): model sarDD metnini awk/python ile ayrıştırıp çöp sayı üretti, sonra 7 günlük tabloyu çoğaltıp
# sunucular arasında kopyaladı ("uydurma kapasite raporu"). Sütun sırası sysstat sürümüne göre değişir — burada ada göre
# okunur; tarih saklama gününden (saDD) değil ölçümün kendi damgasından gelir; hostname verinin içinden doğrulanır.
#
# Uzak komut (SABİT — elle yazma; `sar-ozet.py komut [--gun N]` basar; SKILL.md §6). 2026-11-23 (Alp: "CPU, RAM, disk, network …
# SAR'la zamana dönük — bir haftalık, bir günlük ya da 5 saatlik"): disk (-d -p), ağ (-n DEV, -n EDEV), swap (-W), sayfa hatası (-B)
# eklendi; eski komutun çıktısı da okunur (yeni alanlar "alan yok" görünür).
#
# kullanım:
#   sar-ozet.py komut [--gun N]                            → uzak komut (N: en yeni N+1 sa dosyası; yoksa hepsi)
#   sar-ozet.py <ansible-tree-dizini> [--gun] [--csv]      (çok sunucu: ansible ... -t <dizin>)
#   ssh root@<h> '<uzak komut>' | sar-ozet.py - [--ad <h>] [--gun] [--csv]     (ya da çıktı dosyası: sar-ozet.py <dosya> --ad <h>)
#   --son 5h | 24h | 1g | 7g : pencere (uç = son ölçüm) · --bas "YYYY-MM-DD HH:MM" [--bit …] : mutlak pencere (sunucu saati)
#   --gun : gün başına tablo · --csv : gün başına CSV'yi ekrana · --csv-dosya <yol> : aynı CSV'yi dosyaya (utf-8-sig, ';')
#   HTML/XLSX için: rapor becerisi `tablo-cevir.py <csv>` (değerler elle yazılmaz)
import datetime
import json
import os
import re
import sys


def uzak_komut(gun=None):
    dosyalar = ("$(ls -t /var/log/sa/sa[0-9][0-9] 2>/dev/null | head -%d)" % (int(gun) + 1)) if gun else "/var/log/sa/sa[0-9][0-9]"
    return ('echo "#NPROC $(nproc)"; echo "#TZ $(date +%%z)"; echo "#HISTORY $(grep -h ^HISTORY /etc/sysconfig/sysstat)"; '
            'for f in %s; do for o in -u -r -q -W -B "-d -p" "-n DEV" "-n EDEV"; do LC_ALL=C sadf -d $f -- $o; done; done' % dosyalar)


def yuzdelik(liste, p):
    if not liste:
        return None
    s = sorted(liste)
    return s[min(len(s) - 1, int(round(p / 100.0 * (len(s) - 1))))]


def ayristir(metin):
    meta = {}
    olcum = {}  # zaman -> {alan: değer}
    host_veri = set()
    basliklar = None
    for satir in metin.splitlines():
        if satir.startswith("#NPROC") or satir.startswith("#TZ") or satir.startswith("#HISTORY"):
            k, _, v = satir.partition(" ")
            meta[k[1:]] = v.strip()
            continue
        if satir.startswith("# hostname;"):
            basliklar = satir[2:].split(";")
            continue
        if not basliklar or ";" not in satir or satir.startswith("#"):
            continue
        p = satir.split(";")
        if len(p) != len(basliklar):
            continue
        d = dict(zip(basliklar, p))
        if d.get("CPU") not in (None, "-1", "all"):
            continue
        host_veri.add(d.get("hostname", "?"))
        z = d.get("timestamp", "")
        kayit = olcum.setdefault(z, {})

        def f(alan):
            try:
                return float(d[alan].replace(",", "."))
            except (KeyError, ValueError):
                return None
        if "DEV" in d:  # disk (-d -p): zaman damgası başına en yüksek %util ve await, cihazıyla
            u, a = f("%util"), f("await")
            if u is not None and u >= kayit.get("disk_util", -1):
                kayit["disk_util"], kayit["disk_util_dev"] = u, d["DEV"]
            if a is not None and a >= kayit.get("disk_await", -1):
                kayit["disk_await"], kayit["disk_await_dev"] = a, d["DEV"]
            continue
        if "IFACE" in d:  # ağ: lo hariç arayüz toplamı
            if d["IFACE"] == "lo":
                continue
            if "rxkB/s" in d:
                kayit["net_rx"] = kayit.get("net_rx", 0.0) + (f("rxkB/s") or 0.0) / 1024.0
                kayit["net_tx"] = kayit.get("net_tx", 0.0) + (f("txkB/s") or 0.0) / 1024.0
            if "rxerr/s" in d:
                kayit["net_hata"] = kayit.get("net_hata", 0.0) + sum(f(k) or 0.0 for k in ("rxerr/s", "txerr/s", "rxdrop/s", "txdrop/s"))
            continue
        for alan in ("%idle", "%memused", "%commit", "ldavg-1", "ldavg-5", "ldavg-15", "%iowait", "pswpout/s", "majflt/s",
                     "runq-sz", "blocked"):
            if alan in d:
                v = f(alan)
                if v is not None:
                    kayit[alan] = v
    return meta, olcum, host_veri


def zaman_coz(z, tz):
    # "2026-09-30 21:10:03 UTC" → sunucunun yerel saati (#TZ +0300)
    m = re.match(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})", z)
    if not m:
        return None
    t = datetime.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")
    if z.strip().endswith("UTC") and tz and re.match(r"^[+-]\d{4}$", tz):
        isaret = 1 if tz[0] == "+" else -1
        t += isaret * datetime.timedelta(hours=int(tz[1:3]), minutes=int(tz[3:5]))
    return t


def pencere_coz(son, bas, bit, seri):
    """seri'yi pencereye süz; (süzülmüş seri, açıklama). Uç = son ölçüm (sunucu saati) — bu makinenin saati değil."""
    if not seri or not (son or bas):
        return seri, ""
    if son:
        m = re.fullmatch(r"(\d+)\s*(s|h|saat|g|d|gün|gun)", son.strip().lower())
        if not m:
            raise SystemExit("--son biçimi: 5h, 24h, 1g, 7g (saat: h/s, gün: g/d)")
        delta = datetime.timedelta(hours=int(m.group(1))) if m.group(2) in ("s", "h", "saat") else datetime.timedelta(days=int(m.group(1)))
        bitis = seri[-1][0]
        baslangic = bitis - delta
        aciklama = "son %s (pencere ucu = son ölçüm %s)" % (son, bitis.strftime("%Y-%m-%d %H:%M"))
    else:
        cevir = lambda x: datetime.datetime.strptime(x.strip(), "%Y-%m-%d %H:%M")
        baslangic = cevir(bas)
        bitis = cevir(bit) if bit else seri[-1][0]
        aciklama = "%s → %s (sunucu saati)" % (baslangic.strftime("%Y-%m-%d %H:%M"), bitis.strftime("%Y-%m-%d %H:%M"))
    return [x for x in seri if baslangic <= x[0] <= bitis], aciklama


def ozet(ad, metin, gun_tablo, csv, son=None, bas=None, bit=None):
    meta, olcum, host_veri = ayristir(metin)
    tz = meta.get("TZ", "")
    nproc = meta.get("NPROC", "")
    seri = []
    for z, k in olcum.items():
        t = zaman_coz(z, tz)
        if t is None:
            continue
        seri.append((t, k))
    seri.sort(key=lambda x: x[0])
    tum = len(seri)
    seri, pen = pencere_coz(son, bas, bit, seri)
    if tum and not seri:
        print("\n== %s · PENCEREDE ÖLÇÜM YOK (%s; arşivde %d ölçüm var) — pencereyi ya da arşivin kapsadığı günleri kontrol et." % (
            ad, pen, tum))
        return None
    if not seri:
        print("\n== %s · VERİ YOK — sa dosyası yok/okunamadı ya da sysstat toplamıyor (systemctl is-enabled "
              "sysstat-collect.timer). Bu sunucu için sayı YAZMA." % ad)
        return None
    hostlar = ", ".join(sorted(host_veri))
    uyari = ""
    if host_veri and all(h.split(".")[0].lower() != ad.split(".")[0].lower() for h in host_veri) and ad != "-":
        uyari = "  ⚠ verideki hostname (%s) ≠ hedef adı (%s) — IP ile hedeflendiyse normal; yerel makineyi okumadığını doğrula" % (
            hostlar, ad)
    gunler = sorted({t.date() for t, _ in seri})
    print("\n== %s (veri hostname: %s) · %s CPU · %s → %s (%d gün verisi, %d ölçüm; %s; saat sunucunun yerel saati %s)" % (
        ad, hostlar, nproc or "?", gunler[0], gunler[-1], len(gunler), len(seri), meta.get("HISTORY", "HISTORY=?"), tz or "UTC"))
    if pen:
        print("  pencere: %s · %d ölçüm (sysstat aralığı ~%s dk — kısa tepeler görünmeyebilir)" % (
            pen, len(seri), aralik_dk(seri)))
    if uyari:
        print(uyari)

    def satir(baslik, alan, donustur=lambda v: v):
        vals = [(donustur(k[alan]), t) for t, k in seri if alan in k]
        if not vals:
            print("  %-26s: alan yok (bu sysstat sürümü basmıyor)" % baslik)
            return None
        sayilar = [v for v, _ in vals]
        enb = max(vals, key=lambda x: x[0])
        print("  %-26s: ort %.1f · p95 %.1f · en yüksek %.1f (%s)" % (
            baslik, sum(sayilar) / len(sayilar), yuzdelik(sayilar, 95), enb[0], enb[1].strftime("%Y-%m-%d %H:%M")))
        return enb[0]

    cpu_max = satir("CPU % (100 - %idle)", "%idle", lambda v: 100.0 - v)
    satir("iowait %", "%iowait")
    satir("Bellek %memused (sar -r)", "%memused")
    satir("Bellek %commit", "%commit")
    satir("Swap çıkışı pswpout/s (-W)", "pswpout/s")
    satir("Büyük sayfa hatası majflt/s", "majflt/s")
    yuk_max = satir("Yük ldavg-5", "ldavg-5")
    satir("Çalışma kuyruğu runq-sz", "runq-sz")
    satir("G/Ç'de bloklu blocked", "blocked")
    satir("Disk %util (en yüksek cihaz)", "disk_util")
    satir("Disk await ms (en yüksek)", "disk_await")
    satir("Ağ rx MB/s (lo hariç toplam)", "net_rx")
    satir("Ağ tx MB/s (lo hariç toplam)", "net_tx")
    satir("Ağ hata+düşen /s", "net_hata")
    try:
        n = int(nproc)
        if yuk_max is not None and n > 0:
            print("  %-26s: %.2f (ldavg-5 en yüksek / %d CPU)" % ("Yük / CPU (en yüksek)", yuk_max / n, n))
    except ValueError:
        pass
    if cpu_max is not None and (cpu_max > 100.5 or cpu_max < 0):
        print("  ⚠ CPU yüzdesi 0-100 dışında — veri bozuk, bu sunucu için rapor YAZMA, ham `sadf` çıktısını göster")
    # tepe anları: penceredeki en yüksek CPU'lu 3 an, bütün eksenleriyle (ölçüm ne diyorsa o — yorum yok)
    tepe = sorted([(100.0 - k["%idle"], t, k) for t, k in seri if "%idle" in k], key=lambda x: -x[0])[:3]
    if tepe:
        print("  tepe anları (en yüksek CPU):")
        g = lambda k, a, b="%.1f": (b % k[a]) if a in k else "-"
        for c, t, k in tepe:
            print("    %s · cpu %.1f · iowait %s · mem %s · yük5 %s · disk %%util %s (%s) await %s · ağ rx/tx %s/%s MB/s · ağ hata %s · "
                  "swapout %s" % (t.strftime("%Y-%m-%d %H:%M"), c, g(k, "%iowait"), g(k, "%memused"), g(k, "ldavg-5", "%.2f"),
                                  g(k, "disk_util"), k.get("disk_util_dev", "-"), g(k, "disk_await"), g(k, "net_rx"), g(k, "net_tx"),
                                  g(k, "net_hata"), g(k, "pswpout/s")))

    gunluk = []
    for g in gunler:
        k = [kk for t, kk in seri if t.date() == g]
        def ort(alan, f=lambda v: v):
            v = [f(x[alan]) for x in k if alan in x]
            return (sum(v) / len(v), max(v)) if v else (None, None)
        c, cm = ort("%idle", lambda v: 100.0 - v)
        m, mm = ort("%memused")
        l, lm = ort("ldavg-5")
        gunluk.append((g, len(k), c, cm, m, mm, l, lm))
    if gun_tablo:
        print("  %-10s %5s %8s %8s %8s %8s %8s %8s" % ("gün", "ölçüm", "cpu_ort", "cpu_max", "mem_ort", "mem_max", "yük_ort", "yük_max"))
        for g, n_, c, cm, m, mm, l, lm in gunluk:
            f = lambda v: "-" if v is None else "%.1f" % v
            print("  %-10s %5d %8s %8s %8s %8s %8s %8s" % (g, n_, f(c), f(cm), f(m), f(mm), f(l), f(lm)))
    if csv is not None:
        for g, n_, c, cm, m, mm, l, lm in gunluk:
            f = lambda v: "" if v is None else "%.1f" % v
            csv.append(";".join([ad, str(g), str(n_), f(c), f(cm), f(m), f(mm), f(l), f(lm)]))
    return gunluk


def aralik_dk(seri):
    if len(seri) < 2:
        return "?"
    farklar = sorted((b[0] - a[0]).total_seconds() / 60.0 for a, b in zip(seri, seri[1:]))
    return "%.0f" % farklar[len(farklar) // 2]


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import datetime")[0])
        return 0 if argv else 2
    if argv[0] == "komut":
        gun = argv[argv.index("--gun") + 1] if "--gun" in argv and argv.index("--gun") + 1 < len(argv) else None
        if gun is not None and not gun.isdigit():
            print("--gun sayı olmalı")
            return 2
        print(uzak_komut(gun))
        return 0
    deger = lambda ad: argv[argv.index(ad) + 1] if ad in argv and argv.index(ad) + 1 < len(argv) else None
    son, bas, bit = deger("--son"), deger("--bas"), deger("--bit")
    kaynak, ad, gun, csv_iste = argv[0], "-", "--gun" in argv, ("--csv" in argv or "--csv-dosya" in argv)
    csv_dosya = argv[argv.index("--csv-dosya") + 1] if "--csv-dosya" in argv else None
    if "--ad" in argv:
        ad = argv[argv.index("--ad") + 1]
    print("Kapasite özeti — sysstat `sadf -d` (sütunlar ADA göre), kaynak: %s" % ("stdin" if kaynak == "-" else kaynak))
    girdiler = []
    if kaynak == "-":
        girdiler.append((ad, sys.stdin.read()))
    elif os.path.isdir(kaynak):
        for h in sorted(os.listdir(kaynak)):
            try:
                d = json.load(open(os.path.join(kaynak, h), encoding="utf-8", errors="replace"))
            except (ValueError, OSError) as e:
                print("\n== %s · okunamadı: %s" % (h, e))
                continue
            if d.get("unreachable") or "rc" not in d:
                # disk dolu → ansible modülü yazamaz, UNREACHABLE da işaretleyebilir; sunucu ayakta (saha G102, filo-kontrol §3c)
                dolu = re.search(r"No space left on device|Errno 28", " ".join(str(d.get(k) or "") for k in ("msg", "stderr")))
                print("\n== %s · %s — %s. Bu sunucu için sayı YAZMA." % (
                    h, "DİSK DOLU (ansible modülü yazamadı — `-m raw` ilk yardım)" if dolu
                    else "ERİŞİLEMEZ" if d.get("unreachable") else "ÇIKTI YOK", (d.get("msg") or "").strip()[:150]))
                continue
            girdiler.append((h, d.get("stdout") or ""))
    elif os.path.isfile(kaynak):
        girdiler.append((ad if ad != "-" else os.path.basename(kaynak), open(kaynak, encoding="utf-8", errors="replace").read()))
    else:
        print("kaynak yok: %s" % kaynak)
        return 2
    csv = [] if csv_iste else None
    sonuc = {}
    for h, metin in girdiler:
        sonuc[h] = ozet(h, metin, gun, csv, son, bas, bit)
    dolu = {h: g for h, g in sonuc.items() if g}
    imzalar = {}
    for h, g in dolu.items():
        imzalar.setdefault(tuple((x[2], x[4], x[6]) for x in g), []).append(h)
    for hs in imzalar.values():
        if len(hs) > 1:
            print("\n⚠ %s günlük değerleri birebir aynı — aynı kaynağı okuyor olabilirsin (G22); hedefleri doğrula." % ", ".join(hs))
    baslik = "sunucu;gun;olcum;cpu_ort;cpu_max;mem_ort;mem_max;yuk5_ort;yuk5_max"
    if csv is not None and not csv_dosya:
        print("\n" + baslik)
        print("\n".join(csv))
    if csv_dosya:
        if os.path.exists(csv_dosya):
            print("\n--csv-dosya: %s zaten var — üzerine yazılmadı (kullanıcıya sor, ada tarih ekle)" % csv_dosya)
        else:
            if os.path.dirname(csv_dosya) and not os.path.isdir(os.path.dirname(csv_dosya)):
                os.makedirs(os.path.dirname(csv_dosya))
            with open(csv_dosya, "w", encoding="utf-8-sig") as f:
                f.write(baslik + "\n" + "\n".join(csv or []) + "\n")
            print("\n--csv-dosya: yazıldı %s (%d gün satırı + başlık)" % (os.path.abspath(csv_dosya), len(csv or [])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
