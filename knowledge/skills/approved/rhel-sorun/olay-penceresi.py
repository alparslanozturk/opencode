#!/usr/bin/env python3
# olay-penceresi.py — bir olay saatinden (yerel ya da UTC damgası) olay penceresinin yerel/UTC aralığını ve o pencereyi okuyan
# HAZIR komutları üretir: journalctl (uyarı, çekirdek, rke2), sar (doğru saDD; gece yarısını aşarsa iki gün), UTC yazan loglar
# için dakika deseni (OVS/antrea `…T02:15…`). Hiçbir yere bağlanmaz, yalnız hesaplar ve basar.
# Neden (saha G62-G65, G71): model yerel saat ↔ UTC'yi kafadan çevirdi, "84g önce" ile "4 gün önce"yi karıştırdı, saDD'yi tarih
# sandı, aynı gecedeki olayları farklı saat diliminde yan yana koyamadı. Saat dilimi farkı ve gün numarası burada hesaplanır.
#
# kullanım:
#   olay-penceresi.py "2026-10-19 05:30"            # yerel saat (varsayılan dilim: bu makinenin; --tz ile ver)
#   olay-penceresi.py 2026-10-19T02:30:00Z          # UTC damgası (k8s event / OVS logu / k8s-ozet çıktısı)
#   olay-penceresi.py "05:30" --dk 10 --tz +0300    # bugün 05:30, ±10 dk, sunucu UTC+3
#   --dk N : pencere yarıçapı (varsayılan 15 dk) · --tz ±HHMM : sunucunun saat dilimi (journal/sar yerel saat yazar)
import datetime
import re
import sys
import time


def tz_coz(s):
    m = re.match(r"^([+-])(\d{2}):?(\d{2})$", s or "")
    if not m:
        return None
    d = datetime.timedelta(hours=int(m.group(2)), minutes=int(m.group(3)))
    return d if m.group(1) == "+" else -d


def yerel_tz():
    ofs = -(time.altzone if time.localtime().tm_isdst > 0 else time.timezone)
    return datetime.timedelta(seconds=ofs)


def tz_yaz(d):
    dk = int(d.total_seconds() // 60)
    return "%s%02d%02d" % ("+" if dk >= 0 else "-", abs(dk) // 60, abs(dk) % 60)


def dakika_deseni(bas, son):
    # UTC loglar için grep -E deseni: 2026-10-19T02:(15|16|…) — saat/gün sınırını da kapsar
    parca = {}
    t = bas.replace(second=0)
    while t <= son:
        parca.setdefault(t.strftime("%Y-%m-%dT%H"), []).append(t.strftime("%M"))
        t += datetime.timedelta(minutes=1)
    return "|".join("%s:(%s)" % (k, "|".join(v)) for k, v in parca.items())


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import datetime")[0])
        return 0 if argv else 2
    ham = argv[0].strip()
    dk = int(argv[argv.index("--dk") + 1]) if "--dk" in argv else 15
    tz = tz_coz(argv[argv.index("--tz") + 1]) if "--tz" in argv else yerel_tz()
    if tz is None:
        print("--tz biçimi ±HHMM olmalı (ör. +0300)")
        return 2
    bugun = datetime.datetime.now().strftime("%Y-%m-%d")
    utc_mi = ham.endswith("Z") or ham.endswith("+00:00") or "UTC" in ham
    s = re.sub(r"(Z|\+00:00|\s*UTC)$", "", ham).replace("T", " ")
    s = re.sub(r"\.\d+$", "", s)
    if re.match(r"^\d{1,2}:\d{2}(:\d{2})?$", s):
        s = bugun + " " + s
    t = None
    for f in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            t = datetime.datetime.strptime(s, f)
            break
        except ValueError:
            pass
    if t is None:
        print("saat okunamadı: %r — 'YYYY-AA-GG SS:DD' ya da '…T…Z'" % ham)
        return 2
    yerel = t + tz if utc_mi else t
    utc = t if utc_mi else t - tz
    yb, ys = yerel - datetime.timedelta(minutes=dk), yerel + datetime.timedelta(minutes=dk)
    ub, us = utc - datetime.timedelta(minutes=dk), utc + datetime.timedelta(minutes=dk)
    F = "%Y-%m-%d %H:%M:%S"
    print("Olay: %s (%s girildi) · sunucu saat dilimi %s · pencere ±%d dk" % (ham, "UTC" if utc_mi else "yerel", tz_yaz(tz), dk))
    print("  yerel : %s → %s   (journalctl, sar, /var/log/messages bu saati yazar)" % (yb.strftime(F), ys.strftime(F)))
    print("  UTC   : %s → %s   (k8s event/lastTimestamp, OVS/antrea logları …Z yazar)" % (ub.strftime(F), us.strftime(F)))
    simdi = datetime.datetime.now()
    fark = simdi - yerel if not utc_mi else datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - utc
    print("  olaydan bu yana: %d gün %d saat %d dk (bu makinenin saatiyle)" % (
        fark.days, fark.seconds // 3600, (fark.seconds % 3600) // 60))
    print("\nOkuma komutları (node'da, ssh ile — hepsi salt-okunur):")
    print('journalctl --since "%s" --until "%s" -p warning --no-pager | tail -40' % (yb.strftime(F), ys.strftime(F)))
    print('journalctl -k --since "%s" --until "%s" --no-pager | tail -30' % (yb.strftime(F), ys.strftime(F)))
    print('journalctl -u rke2-agent -u rke2-server -u containerd --since "%s" --until "%s" --no-pager | tail -40' % (yb.strftime(F), ys.strftime(F)))
    gunler = []
    g = yb.date()
    while g <= ys.date():
        gunler.append(g)
        g += datetime.timedelta(days=1)
    for i, g in enumerate(gunler):
        s_ = yb.strftime("%H:%M:%S") if g == yb.date() else "00:00:00"
        e_ = ys.strftime("%H:%M:%S") if g == ys.date() else "23:59:59"
        print("LC_ALL=C sar -u -q -r -d -s %s -e %s -f /var/log/sa/sa%s | tail -40   # %s, %d gün önce (saDD = ayın günü)" % (
            s_, e_, g.strftime("%d"), g.isoformat(), (simdi.date() - g).days))
    desen = dakika_deseni(ub, us)
    print('grep -hE "%s" /var/log/antrea/openvswitch/ovs-vswitchd.log* | tail -40   # UTC yazan log' % desen)
    print('grep -hE "%s" /var/log/antrea/*.log* 2>/dev/null | tail -40' % desen)
    if (simdi.date() - yb.date()).days > 27:
        print("\n⚠ olay 28 günden eski — sar arşivi (HISTORY=28) ve journal (kalıcı mı: ls /var/log/journal) silinmiş olabilir; 'veri yok' de, tahmin yürütme.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
