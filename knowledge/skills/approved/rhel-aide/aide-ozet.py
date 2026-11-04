#!/usr/bin/env python3
# aide-ozet.py — AIDE (dosya bütünlüğü) durumunu sunucu başına özetler. Yalnız okur: `komut` alt komutunun bastığı salt-okunur
# komutun `ansible -m raw -t <dizin>` tree çıktısı + (--grup ile) yerel `ansible --list-hosts`.
# Neden (Alp, 2026-11-04): AIDE kurumda henüz aktif değil, RHEL ile birlikte geliyor; devreye alırken istisnalar (NFS, data dizinleri)
# önemli. Hangi sunucuda kurulu / veritabanı var / zamanlı kontrol var, ve hangi ağ bağlaması AIDE kapsamına giriyor — betik sayar,
# model tabloyu AYNEN aktarır.
#
# kullanım:
#   aide-ozet.py komut                                   # sunucuda çalışacak salt-okunur komutu basar
#   aide-ozet.py <tree-dizini> [--grup <g> -i <envanter>]
# Çıkış: 0 hepsi çalışıyor · 1 eksik/uyarı var · 2 okunamadı
import importlib.util
import os
import re
import sys

KOMUT = ('c=/etc/aide.conf; echo aide_paket=$(rpm -q aide 2>/dev/null | grep -v "not installed"); '
         'd=$(awk "/^@@define DBDIR/{print \\$3}" $c 2>/dev/null); '
         'echo aide_db=$(stat -c %y ${d:-/var/lib/aide}/aide.db.gz 2>/dev/null | cut -d. -f1); '
         'echo aide_zamanlama=$(grep -ls aide /etc/crontab /etc/cron.d/* /etc/cron.daily/* /etc/cron.weekly/* /var/spool/cron/* '
         '2>/dev/null | tr "\\n" " ")$(systemctl list-timers --all --no-legend 2>/dev/null | grep -o "aide[^ ]*" | tr "\\n" " "); '
         'echo ag_baglama=$(findmnt -rn -t nfs,nfs4,cifs,smb3 -o TARGET,FSTYPE 2>/dev/null | tr " \\n" ": "); '
         'echo aide_secim=$(cat $c /etc/aide.conf.d/* 2>/dev/null | grep -E "^[[:space:]]*[-=!]?/" | awk -v OFS=@ "{print \\$1,\\$2}" | tr "\\n" " "); true')


def filo_tablo():
    yol = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "filo-kontrol", "filo-tablo.py")
    spec = importlib.util.spec_from_file_location("filo_tablo", yol)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def kv(metin):
    return dict(l.split("=", 1) for l in (metin or "").splitlines() if "=" in l)


def eslesir(desen, yol):
    try:
        return re.match(desen, yol) is not None
    except re.error:
        return desen.rstrip("/") and yol.startswith(desen)


# Linux statfs sihirli sayıları (linux/magic.h; sunucuda `stat -f -c %t <bağlama>` aynısını basar)
FS_SIHIR = {"nfs": {"nfs", "nfs4", "0x6969"}, "nfs4": {"nfs", "nfs4", "0x6969"},
            "cifs": {"cifs", "smb3", "0xff534d42", "0xfe534d42"}, "smb3": {"cifs", "smb3", "0xff534d42", "0xfe534d42"}}


def kapsamda(baglama, secim):
    # AIDE seçim satırı (aide.conf(5), 0.19): "/" ve "=" olumlu, "!" ve "-" (0.19) olumsuz; dizgi düzenli ifade, başına örtük ^.
    # İkinci alan "=<fs>" ya da "<tür>=<fs>" ise kısıtlı kural: yalnız o dosya sistemi türünde geçerli (0.19, Linux). Bağlamanın
    # içindeki bir dosya (<bağlama>/x) olumlu bir satıra uyup hiçbir olumsuz satıra uymuyorsa AIDE onu tarar. Dosya türü kısıtı yok sayılır.
    yol, _, fs = baglama.partition(":")
    dosya = yol.rstrip("/") + "/x"
    olumlu, olumsuz = [], []
    for s in secim:
        desen, _, kisit = s.partition("@")
        if "=" in kisit and not kisit.split("=", 1)[1].lower() in FS_SIHIR.get(fs, {fs}):
            continue
        (olumsuz if desen[0] in "!-" else olumlu).append(desen.lstrip("!-="))
    return any(eslesir(d, dosya) for d in olumlu) and not any(eslesir(d, dosya) for d in olumsuz)


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("\nimport")[0])
        return 0
    if argv[0] == "komut":
        print(KOMUT)
        return 0
    dizin, grup, envanter = argv[0], None, None
    if "--grup" in argv and argv.index("--grup") + 1 < len(argv):
        grup = argv[argv.index("--grup") + 1]
    if "-i" in argv and argv.index("-i") + 1 < len(argv):
        envanter = argv[argv.index("-i") + 1]
    if not os.path.isdir(dizin):
        print("tree dizini yok: %s" % dizin)
        return 2
    ft = filo_tablo()
    veri = ft.oku(dizin)
    hostlar = (ft.beklenen(grup, envanter) if grup else None) or sorted(veri)

    sayac, uyari = {}, []
    print("%-28s %-34s %-30s %-19s %-9s %s" % ("sunucu", "durum", "paket", "veritabanı", "zamanlama", "ağ bağlaması (AIDE kapsamında)"))
    for h in hostlar:
        d = veri.get(h)
        if d is None:
            s, p, db, z, ag = "çıktı yok", "", "", "", ""
        else:
            k, m = ft.durum(d)
            if k != "ok":
                s, p, db, z, ag = "erişilemedi: %s" % k, "", "", "", (m or "")[:60]
            else:
                b = kv(d.get("stdout"))
                p, db, z = b.get("aide_paket", "").strip(), b.get("aide_db", "").strip(), b.get("aide_zamanlama", "").strip()
                baglamalar = b.get("ag_baglama", "").split()
                riskli = [g.partition(":")[0] for g in baglamalar if kapsamda(g, b.get("aide_secim", "").split())]
                ag = "%d (%s)" % (len(baglamalar), " ".join(riskli) or "-") if baglamalar else "-"
                if not p:
                    s = "AIDE kurulu değil"
                elif not db:
                    s = "kurulu, veritabanı yok (--init?)"
                elif not z:
                    s = "veritabanı var, zamanlı kontrol yok"
                else:
                    s = "çalışıyor"
                if riskli:
                    uyari.append((h, riskli))
        sayac[s.split(":")[0]] = sayac.get(s.split(":")[0], 0) + 1
        print("%-28s %-34s %-30s %-19s %-9s %s" % (h, s, p or "-", db or "-", "var" if z else "-", ag))

    print("\nSayım: " + " · ".join("%s %d" % (k, v) for k, v in sorted(sayac.items(), key=lambda x: (-x[1], x[0]))))
    if uyari:
        print("\n== AĞ BAĞLAMASI AIDE KAPSAMINDA — NFS/CIFS içeriği her kontrolde ağdan okunur, değişiklikler sahibi sunucunun işi;")
        print("   istisna adayı ('!' satırı, aide.conf(5)). Tahmin: regex eşleşmesiyle hesaplandı — sunucuda `aide --path-check` varsa doğrula.")
        for h, r in uyari:
            print("  %-28s %s" % (h, " ".join(r)))
    return 0 if sayac.get("çalışıyor", 0) == len(hostlar) and not uyari else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
