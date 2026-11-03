#!/usr/bin/env python3
# kesinti-ozet.py — elektrik/veri merkezi kesintisinden sonra filo taraması: `ansible … -t <dizin>` (kesinti-sonrasi SKILL §1) çıktısını
# sunucu başına sınıflandırır. Yalnız okur (yerel dosyalar). Kural koddadır, model yorumlamaz (saha G22: kafadan tablo yok).
# Alp (2026-11-03): "veri merkezinde elektrik kesintisine bağlı olarak sunucular kapandı … kesintiden kaynaklı … bir hata mesajı var mı
# … bir özet çıkartacağım".
#
#   kesinti-ozet.py <tree-dizini> [--kesinti "YYYY-MM-DD HH:MM"] [--grup <g> [-i <envanter>]]
#
# Sınıflar (her biri kanıt alanıyla):
#   ULAŞILAMADI    : ansible bağlanamadı / zaman aşımı / çıktı yok — kapalı ya da açılışta takılı olabilir (konsol: filo-kontrol §3c)
#   KESİNTİDE KAPANDI : açılış (uptime -s) kesinti saatinden SONRA. önceki_kapanis=ANI → `last -x`'te kapanış kaydı yok (güç gitti);
#                    temiz → kapatılarak inmiş (UPS/elle)
#   KAPANMADI      : açılış kesintiden ÖNCE — bulunan sorun kesintiyle ilişkilendirilemez (ayrı yazılır)
# Sorun sayılan alanlar: basarisiz (systemctl --failed) · bagli_degil (fstab'da olup bağlı olmayan) · fs_hata (çekirdekte G/Ç, XFS,
# EXT4 hatası) · saat (chrony Leap status ≠ Normal) · docker/podman çalışan<toplam · rke2-server/agent ≠ active.
# `hata` sayısı (bu açılıştaki err+ satırları) sorun SAYILMAZ — sağlıklı sunucuda da yüzlerce olur (ölçüldü: sshd kex satırları); bilgi.
import datetime
import importlib.util
import os
import re
import sys

FT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "filo-kontrol", "filo-tablo.py")


def filo_tablo():
    spec = importlib.util.spec_from_file_location("filo_tablo", FT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def kv(out):
    d = {}
    for s in (out or "").splitlines():
        m = re.match(r"^\s*([A-Za-z0-9_.\-]+)=(.*)$", s)
        if m:
            d[m.group(1)] = m.group(2).strip()
    return d


def zaman(x):
    for f in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M"):
        try:
            return datetime.datetime.strptime(x.strip(), f)
        except (ValueError, AttributeError):
            pass
    return None


def sorunlar(d):
    s = []
    if d.get("basarisiz"):
        s.append("başarısız servis: " + d["basarisiz"])
    if d.get("bagli_degil"):
        s.append("fstab'da olup bağlı değil: " + d["bagli_degil"])
    if d.get("fs_hata", "0") not in ("0", ""):
        s.append("çekirdekte disk/dosya sistemi hatası: %s satır (journalctl -b -k | grep -iE 'I/O error|XFS|EXT4')" % d["fs_hata"])
    if d.get("saat") and d["saat"] != "Normal":
        s.append("saat senkron değil (chrony Leap status: %s)" % d["saat"])
    elif "saat" in d and not d["saat"]:
        s.append("chrony okunamadı (chronyd çalışmıyor ya da yok)")
    for r in ("docker", "podman"):
        m = re.match(r"^(\d+)/(\d+)$", d.get(r, ""))
        if m and int(m.group(1)) < int(m.group(2)):
            s.append("%s: %s/%s konteyner çalışıyor (durmuş olanlar restart politikası 'no' olabilir — rhel-guncelleme 1b)" % (r, m.group(1), m.group(2)))
    for k in ("rke2-server", "rke2-agent"):
        if k in d and d[k] != "active":
            s.append("%s: %s" % (k, d[k]))
    return s


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import datetime")[0].replace("# ", "").replace("#!/usr/bin/env python3\n", ""))
        return 0 if argv else 2
    dizin, kesinti, grup, envanter, i = argv[0], None, None, None, 1
    while i < len(argv):
        if argv[i] == "--kesinti" and i + 1 < len(argv):
            kesinti = zaman(argv[i + 1])
            if not kesinti:
                print("--kesinti okunamadı: %r (biçim: \"YYYY-MM-DD HH:MM\", sunucunun yerel saati)" % argv[i + 1])
                return 2
            i += 2
        elif argv[i] == "--grup" and i + 1 < len(argv):
            grup, i = argv[i + 1], i + 2
        elif argv[i] == "-i" and i + 1 < len(argv):
            envanter, i = argv[i + 1], i + 2
        else:
            print("bilinmeyen seçenek: %s" % argv[i])
            return 2
    if not os.path.isdir(dizin):
        print("dizin yok: %s (kesinti-sonrasi §1 komutu -t %s ile üretir)" % (dizin, dizin))
        return 2
    ft = filo_tablo()
    veri = ft.oku(dizin)
    bek = ft.beklenen(grup, envanter) if grup else None

    ulasilamadi, kapandi, kapanmadi, bilinmiyor = [], [], [], []
    for h in sorted(set(veri) | set(bek or [])):
        if h not in veri:
            ulasilamadi.append((h, "ÇIKTI YOK", "tree'de dosya yok — komut bitmeden kesildi ya da hedef dışı"))
            continue
        k, mesaj = ft.durum(veri[h])
        d = kv(veri[h].get("stdout"))
        if k != "ok" and "acilis" not in d:
            ulasilamadi.append((h, k, mesaj))
            continue
        acilis = zaman(d.get("acilis", ""))
        satir = (h, d.get("acilis", "?"), d.get("onceki_kapanis", "?"), sorunlar(d), d.get("hata", "?"), d.get("hata_ilk", ""))
        if not acilis:
            bilinmiyor.append(satir)
        elif kesinti is None:
            (kapandi if d.get("onceki_kapanis") == "ANI" else kapanmadi).append(satir)
        else:
            (kapandi if acilis >= kesinti else kapanmadi).append(satir)

    toplam = len(ulasilamadi) + len(kapandi) + len(kapanmadi) + len(bilinmiyor)
    print("Kesinti taraması: %s · %d sunucu%s · kesinti: %s" % (
        dizin, toplam, " (beklenen: %s)" % grup if bek else "",
        kesinti.strftime("%Y-%m-%d %H:%M") if kesinti else "verilmedi — sınıf yalnız önceki_kapanis=ANI'ye göre"))
    print("Sayım: ulaşılamadı %d · kesintide kapandı %d · kapanmadı %d%s" % (
        len(ulasilamadi), len(kapandi), len(kapanmadi), " · açılış okunamadı %d" % len(bilinmiyor) if bilinmiyor else ""))

    if ulasilamadi:
        print("\n== ULAŞILAMADI (değer yazma — durum yaz; kapalı/açılışta takılı olabilir → vCenter konsolu, filo-kontrol §3c)")
        for h, k, m in ulasilamadi:
            print("  %-28s %-12s %s" % (h, k, (m or "")[:150]))

    def yaz(baslik, xs, aciklama):
        if not xs:
            return
        print("\n== %s (%d) — %s" % (baslik, len(xs), aciklama))
        temiz = []
        for h, ac, onceki, s, hata, ilk in xs:
            if not s:
                temiz.append("%s(%s, %s)" % (h, ac, onceki))
                continue
            print("  %-28s açılış %s · önceki kapanış %s" % (h, ac, onceki))
            for x in s:
                print("      - " + x)
            print("      · bu açılışta err+ satırı: %s; en sık: %s" % (hata, ilk[:200] or "-"))
        if temiz:
            print("  sorun bulunmadı: " + ", ".join(temiz))

    yaz("KESİNTİDE KAPANDI", kapandi, "önceki_kapanis ANI = kapanış kaydı yok (güç gitti) · temiz = kapatılarak inmiş")
    yaz("KAPANMADI", kapanmadi, "açılış kesintiden önce (ya da önceki kapanış temiz) — buradaki sorun kesintiyle ilişkilendirilemez")
    yaz("AÇILIŞ OKUNAMADI", bilinmiyor, "uptime -s çıktısı yok (RHEL 6?) — elle bak")
    print("\nKanıt: açılış = `uptime -s` · önceki kapanış = `last -x reboot shutdown` 2. satır (shutdown=temiz, reboot=ANI; wtmp döndüyse"
          " bilinmiyor) · sorunlar = aynı komutun alanları. Saatler sunucunun yerel saati.")
    return 0 if not (ulasilamadi or any(s for _, _, _, s, _, _ in kapandi + kapanmadi)) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
