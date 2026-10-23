#!/usr/bin/env python3
# disk-durum.py — sunucunun disklerini OS DİSKİ / KULLANIMDA / BOŞ ADAY diye sınıflar, her kararın gerekçesiyle.
# Yalnız okur (yerel dosya / stdin). Uzak tarafta yalnız okuma komutları çalışır (aşağıda, SABİT).
# Neden (saha G38, G39): model `lsblk` çıktısını okumadan beceri metnindeki "sda = OS, sdb = boş" başlığıyla tablo doldurdu;
# OS diski sdb'deydi ve "boş" yazıldı — o tabloyla mkfs atılsaydı sunucu giderdi. Reboot sonrası sda/sdb yer değiştirdi.
# "Boş" için becerideki koşulların (bölüm yok, FSTYPE yok, PV değil, bağlı/swap değil, fstab'da yok, diskte imza yok)
# HEPSİ burada tek tek denetlenir; biri bile tutmazsa disk BOŞ değildir.
#
# Uzak komut (SABİT — değiştirme; SKILL.md B §1):
#   echo '#LSBLK'; lsblk -P -b -o NAME,KNAME,PKNAME,TYPE,SIZE,FSTYPE,MOUNTPOINT,UUID 2>/dev/null || lsblk -P -b -o NAME,KNAME,TYPE,SIZE,FSTYPE,MOUNTPOINT,UUID;
#   echo '#PVS'; pvs --noheadings --separator '|' -o pv_name,vg_name 2>/dev/null; echo '#MOUNT'; findmnt -rn -o SOURCE,TARGET;
#   echo '#SWAP'; cat /proc/swaps; echo '#FSTAB'; grep -v '^[[:space:]]*#' /etc/fstab;
#   echo '#IMZA'; for d in $(lsblk -dn -o NAME -e 7,11); do echo "== /dev/$d"; blkid -p -o export /dev/$d 2>&1; done
# İmza için `blkid -p` (diskten doğrudan okur). `wipefs -n` de okumadır (kilit 2026-10-22'den beri okuma kipini tanır; -a/-o K5).
#
# kullanım:
#   ssh root@<h> '<uzak komut>' | disk-durum.py - [--ad <h>]
#   ansible <grup> -m shell -a '<uzak komut>' -t <dizin>  →  disk-durum.py <dizin>
import json
import os
import re
import shlex
import sys


def bolumler(metin):
    out, ad = {}, None
    for s in metin.splitlines():
        if re.match(r"^#(LSBLK|PVS|MOUNT|SWAP|FSTAB|WIPEFS|IMZA)\s*$", s.strip()):
            ad = s.strip()[1:]
            out[ad] = []
        elif ad:
            out[ad].append(s)
    return out


def boyut(b):
    try:
        b = float(b)
    except ValueError:
        return "?"
    for birim in ("B", "K", "M", "G", "T", "P"):
        if b < 1024 or birim == "P":
            return "%.1f%s" % (b, birim)
        b /= 1024.0


def mapper_coz(ad):
    # /dev/mapper/kt_rhel_vg-kt_rhel_lv → ("kt_rhel_vg", "kt_rhel_lv"); "--" adın içindeki "-" demektir
    ad = ad.rsplit("/", 1)[-1]
    parca = re.split(r"(?<!-)-(?!-)", ad, maxsplit=1)
    if len(parca) != 2:
        return None
    return parca[0].replace("--", "-"), parca[1].replace("--", "-")


def analiz(ad, metin):
    b = bolumler(metin)
    if "LSBLK" not in b:
        print("\n== %s · girdi tanınmadı (#LSBLK bölümü yok) — uzak komut SKILL.md'deki SABİT komut mu? Disk kararı YAZMA." % ad)
        return
    cihaz = {}
    for s in b["LSBLK"]:
        if "NAME=" not in s:
            continue
        try:
            d = dict(p.split("=", 1) for p in shlex.split(s))
        except ValueError:
            continue
        cihaz[d.get("KNAME") or d["NAME"]] = d
    # PKNAME yoksa (eski util-linux) bölüm adından ebeveyn türet: sda1→sda, nvme0n1p2→nvme0n1
    for k, d in cihaz.items():
        if not d.get("PKNAME") and d.get("TYPE") == "part":
            m = re.match(r"^(.*?\d+n\d+)p\d+$", k) or re.match(r"^(\D+)\d+$", k)
            if m and m.group(1) in cihaz:
                d["PKNAME"] = m.group(1)
    cocuk = {}
    for k, d in cihaz.items():
        if d.get("PKNAME"):
            cocuk.setdefault(d["PKNAME"], []).append(k)
    ad2kname = {d["NAME"]: k for k, d in cihaz.items()}

    pv_vg = {}
    for s in b.get("PVS", []):
        p = [x.strip() for x in s.split("|")]
        if len(p) >= 2 and p[0]:
            pv_vg[p[0].rsplit("/", 1)[-1]] = p[1]
    baglama = {}  # kaynak kname -> [hedef]
    vg_baglama = {}  # vg -> [hedef]
    for s in b.get("MOUNT", []):
        p = s.split()
        if len(p) < 2 or not p[0].startswith("/dev/"):
            continue
        kaynak = re.sub(r"\[.*\]$", "", p[0])
        hedef = p[1].replace("\\x20", " ")
        if kaynak.startswith("/dev/mapper/"):
            vl = mapper_coz(kaynak)
            if vl:
                vg_baglama.setdefault(vl[0], []).append(hedef)
            isim = kaynak.rsplit("/", 1)[-1]
            if isim in ad2kname:
                baglama.setdefault(ad2kname[isim], []).append(hedef)
            continue
        m = re.match(r"^/dev/([^/]+)/([^/]+)$", kaynak)
        if m and m.group(1) in {v for v in pv_vg.values()}:
            vg_baglama.setdefault(m.group(1), []).append(hedef)
            continue
        baglama.setdefault(kaynak.rsplit("/", 1)[-1], []).append(hedef)
    swap = set()
    for s in b.get("SWAP", [])[1:]:
        p = s.split()
        if p and p[0].startswith("/dev/"):
            kaynak = p[0].rsplit("/", 1)[-1]
            swap.add(ad2kname.get(kaynak, kaynak))
            if p[0].startswith("/dev/mapper/") or p[0].startswith("/dev/dm-"):
                vl = mapper_coz(p[0])
                if vl:
                    vg_baglama.setdefault(vl[0], []).append("[swap]")
    fstab = [s.split()[0] for s in b.get("FSTAB", []) if s.split()]
    imza = {}
    disk_ad = None
    for s in b.get("WIPEFS", []):  # eski girdi biçimi
        if s.startswith("== /dev/"):
            disk_ad = s[3:].strip()
            imza[disk_ad] = []
        elif disk_ad and s.strip() and not s.startswith("DEVICE") and not s.startswith("offset"):
            imza[disk_ad].append((s.split()[2:3] or s.split()[:1])[0])
    for s in b.get("IMZA", []):  # blkid -p -o export
        if s.startswith("== /dev/"):
            disk_ad = s[3:].strip()
            imza[disk_ad] = []
        elif disk_ad and re.match(r"^(PTTYPE|TYPE|SEC_TYPE)=", s.strip()):
            imza[disk_ad].append(s.strip())

    def soy(k):
        out = [k]
        for c in cocuk.get(k, []):
            out.extend(soy(c))
        return out

    def fstab_atif(k):
        d = cihaz.get(k, {})
        anahtarlar = {"/dev/" + k, "/dev/" + d.get("NAME", k), "/dev/mapper/" + d.get("NAME", k)}
        if d.get("UUID"):
            anahtarlar.add("UUID=" + d["UUID"])
        return [f for f in fstab if f in anahtarlar or f.strip('"') in anahtarlar]

    diskler = [k for k, d in cihaz.items() if d.get("TYPE") == "disk"]
    print("\n== %s · %d disk" % (ad, len(diskler)))
    adaylar = []
    for k in sorted(diskler):
        d = cihaz[k]
        neden_os, neden_kul = [], []
        for x in soy(k):
            dx = cihaz.get(x, {})
            hedefler = [h for h in baglama.get(x, []) + [dx.get("MOUNTPOINT", "")] if h and h != "[SWAP]"]
            for h in sorted(set(hedefler)):
                (neden_os if h in ("/", "/boot", "/boot/efi", "/usr", "/var") else neden_kul).append("%s bağlı → %s" % (x, h))
            if x in swap or dx.get("FSTYPE") == "swap":
                neden_kul.append("%s swap" % x)
            if x in pv_vg:
                vg = pv_vg[x]
                vh = sorted(set(vg_baglama.get(vg, [])))
                if any(h in ("/", "/boot", "/usr", "/var") for h in vh):
                    neden_os.append("%s PV → VG %s (%s)" % (x, vg, ", ".join(vh)))
                else:
                    neden_kul.append("%s PV → VG %s%s" % (x, vg, (" (" + ", ".join(vh) + ")") if vh else ""))
            if dx.get("FSTYPE") and dx.get("FSTYPE") != "swap" and x not in pv_vg and dx.get("TYPE") in ("disk", "part"):
                neden_kul.append("%s FSTYPE=%s" % (x, dx["FSTYPE"]))
            for f in fstab_atif(x):
                neden_kul.append("%s fstab'da (%s)" % (x, f))
        if cocuk.get(k):
            neden_kul.append("alt aygıt var: %s" % ", ".join(cocuk[k]))
        imz = imza.get("/dev/" + k)
        if imz:
            neden_kul.append("diskte imza: %s" % "; ".join(imz[:4]))
        if imz is None:
            neden_kul.append("imza kontrolü çıktısı yok (kanıt eksik)")
        if neden_os:
            sinif = "OS DİSKİ"
        elif neden_kul:
            sinif = "KULLANIMDA"
        else:
            sinif = "BOŞ ADAY"
            adaylar.append((k, d.get("SIZE")))
        gerekce = neden_os + neden_kul if sinif != "BOŞ ADAY" else [
            "bölüm yok · FSTYPE yok · PV değil · bağlı/swap değil · fstab'da yok · diskte imza yok (blkid -p)"]
        gerekce = list(dict.fromkeys(gerekce))
        print("  /dev/%-10s %9s  %-10s %s%s" % (k, boyut(d.get("SIZE", "?")), sinif, " | ".join(gerekce[:6]),
              " | … (+%d)" % (len(gerekce) - 6) if len(gerekce) > 6 else ""))
    if not adaylar:
        print("  Sonuç: BOŞ disk yok — yıkıcı adım (pvcreate/mkfs/parted) YAPMA; çıktıyı kullanıcıya göster.")
    else:
        print("  Sonuç: boş aday %s." % ", ".join("/dev/%s (%s)" % (k, boyut(s)) for k, s in adaylar))
        boyutlar = [s for _, s in adaylar]
        if len(boyutlar) != len(set(boyutlar)):
            print("  ⚠ Aynı boyutta birden çok boş aday — boyuttan SEÇME, hangisi olduğunu kullanıcıya sor.")
        print("  Yıkıcı adımdan HEMEN önce bu kontrolü aynı sunucuda yeniden çalıştır: harfler reboot'ta değişebilir (G38).")


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import json")[0])
        return 0 if argv else 2
    kaynak = argv[0]
    ad = argv[argv.index("--ad") + 1] if "--ad" in argv else "-"
    print("Disk durumu — kaynak: %s (sınıf kararları betikten; tabloyu AYNEN aktar)" % ("stdin" if kaynak == "-" else kaynak))
    if kaynak == "-":
        analiz(ad, sys.stdin.read())
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
                print("\n== %s · %s — %s. Disk kararı YAZMA." % (
                    h, "DİSK DOLU (ansible modülü yazamadı — `-m raw` ilk yardım)" if dolu
                    else "ERİŞİLEMEZ" if d.get("unreachable") else "ÇIKTI YOK", (d.get("msg") or "").strip()[:150]))
                continue
            analiz(h, d.get("stdout") or "")
    else:
        print("kaynak yok: %s" % kaynak)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
