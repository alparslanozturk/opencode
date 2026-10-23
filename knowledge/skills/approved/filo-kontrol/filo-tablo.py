#!/usr/bin/env python3
# filo-tablo.py — `ansible <grup> ... --tree <dizin>` çıktısını sunucu başına özetler. Yalnız okur (yerel dosyalar);
# --grup verilirse beklenen listeyi yerel `ansible --list-hosts` ile alır (bağlantı yok).
# Neden (saha G6, G22, G77): model çok sunuculu ham çıktıyı kafadan tabloya döküyordu — değerler sunucular arasında
# kopyalandı, erişilemeyen node'lara sayı yazıldı, zaman aşımında kaybolan node'lar hiç anılmadı. Bu betik her hücreyi
# o sunucunun kendi JSON'undan alır; model tabloyu AYNEN aktarır.
#
# kullanım:
#   filo-tablo.py <tree-dizini> [--grup <g> [-i <envanter>]] [--kv] [--satir N]
#   --kv     : komut "anahtar=değer" satırları basıyorsa sütunlu tablo; çoğunluktan farklı hücre "*" ile işaretlenir
#   --satir N: grup başına gösterilecek çıktı satırı (varsayılan 6)
#   --csv <dosya>: tabloyu CSV'ye yaz (utf-8-sig, ';' — Türkçe Excel); erişilemeyen/çıktısız sunucular da satır olarak, sapan
#                  alanlar ayrı sütunda. HTML/XLSX için: rapor becerisi `tablo-cevir.py` (değerler elle yazılmaz)
import csv
import json
import os
import re
import subprocess
import sys

DISK_DOLU = re.compile(r"No space left on device|Errno 28")


def oku(dizin):
    sonuc = {}
    for ad in sorted(os.listdir(dizin)):
        yol = os.path.join(dizin, ad)
        if not os.path.isfile(yol):
            continue
        try:
            sonuc[ad] = json.load(open(yol, encoding="utf-8", errors="replace"))
        except ValueError as e:
            sonuc[ad] = {"_bozuk": str(e)}
    return sonuc


def durum(d):
    if "_bozuk" in d:
        return "BOZUK JSON", d["_bozuk"]
    msg = (d.get("msg") or "").strip()
    # disk dolu: ansible modül dosyasını uzağa kopyalayamaz (ölçüldü: "[Errno 28] No space left on device"; ssh'ta geçici
    # dizin açılamazsa UNREACHABLE da işaretlenir) — "erişilemez" değil, sunucu ayakta; `-m raw` çalışır (saha G102)
    if DISK_DOLU.search(" ".join(str(d.get(k) or "") for k in ("msg", "stderr", "module_stderr"))):
        return "DİSK DOLU", "ansible modülü yazamadı — `-m raw` ilk yardım (filo-kontrol §3c)"
    if d.get("unreachable"):
        return "ERİŞİLEMEZ", msg
    if "expected time frame" in msg or "timed out" in msg.lower() and "rc" not in d:
        return "ZAMAN AŞIMI", msg
    if "rc" not in d:
        return "HATA", msg or "rc yok"
    if d.get("rc") != 0 or d.get("failed"):
        hata = (d.get("stderr") or msg or "").strip().splitlines()
        return "rc=%s" % d.get("rc"), (hata[-1] if hata else "")
    return "ok", ""


def beklenen(grup, envanter):
    kom = ["ansible", grup, "--list-hosts"] + (["-i", envanter] if envanter else [])
    try:
        p = subprocess.run(kom, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
    except (OSError, subprocess.SubprocessError) as e:
        print("beklenen liste alınamadı (%s): %s" % (" ".join(kom), e))
        return None
    hostlar = []
    for s in p.stdout.decode(errors="replace").splitlines():
        s = s.strip()
        if s and not s.startswith("hosts ("):
            hostlar.append(s)
    if p.returncode != 0 or not hostlar:
        print("beklenen liste boş/hatalı (%s): %s" % (" ".join(kom), p.stderr.decode(errors="replace").strip()[-200:]))
        return None
    return hostlar


def csv_yaz(yol, baslik, satirlar):
    if os.path.exists(yol):
        print("\n--csv: %s zaten var — üzerine yazılmadı (kullanıcıya sor, ada tarih ekle)" % yol)
        return
    d = os.path.dirname(yol)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    with open(yol, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(baslik)
        w.writerows(satirlar)
    print("\n--csv: yazıldı %s (%d satır + başlık)" % (os.path.abspath(yol), len(satirlar)))


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import json")[0])
        return 0 if argv else 2
    dizin, grup, envanter, kv, satir, csv_yol = argv[0], None, None, False, 6, None
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--grup":
            grup, i = argv[i + 1], i + 2
        elif a == "-i":
            envanter, i = argv[i + 1], i + 2
        elif a == "--kv":
            kv, i = True, i + 1
        elif a == "--satir":
            satir, i = int(argv[i + 1]), i + 2
        elif a == "--csv":
            csv_yol, i = argv[i + 1], i + 2
        else:
            print("bilinmeyen seçenek: %s" % a)
            return 2
    if not os.path.isdir(dizin):
        print("dizin yok: %s (ansible ... --tree %s ile üret)" % (dizin, dizin))
        return 2
    veri = oku(dizin)
    bek = beklenen(grup, envanter) if grup else None
    eksik = [h for h in (bek or []) if h not in veri]

    durumlar = {h: durum(d) for h, d in veri.items()}
    say = {}
    for h, (k, _) in durumlar.items():
        etiket = "rc≠0" if k.startswith("rc=") else k
        say[etiket] = say.get(etiket, 0) + 1
    print("Filo sonucu: %s · %d sunucu dosyası%s" % (dizin, len(veri),
          " · beklenen %d (%s), çıktısı gelmeyen %d" % (len(bek), grup, len(eksik)) if bek else ""))
    print("Durum: " + " · ".join("%s %d" % (k, v) for k, v in sorted(say.items(), key=lambda x: (x[0] != "ok", x[0]))))

    sapma = [(h, k, m) for h, (k, m) in sorted(durumlar.items()) if k != "ok"]
    if sapma or eksik:
        print("\n== Sapmalar (bu sunucular için değer YAZMA — durumlarını yaz)")
        for h, k, m in sapma:
            print("  %-28s %-12s %s" % (h, k, m[:160]))
        for h in eksik:
            print("  %-28s %-12s %s" % (h, "ÇIKTI YOK", "tree'de dosya yok — komut bitmeden kesildi ya da hedef dışı kaldı"))

    tamam = {h: (veri[h].get("stdout") or "") for h, (k, _) in durumlar.items() if k == "ok" or k.startswith("rc=")}
    if kv and tamam:
        tablo, anahtarlar = {}, []
        for h, out in tamam.items():
            tablo[h] = {}
            for s in out.splitlines():
                m = re.match(r"^\s*([A-Za-z0-9_.\-/]+)\s*=\s*(.*?)\s*$", s)
                if m:
                    if m.group(1) not in anahtarlar:
                        anahtarlar.append(m.group(1))
                    tablo[h][m.group(1)] = m.group(2)
        if anahtarlar:
            cogunluk = {}
            for a in anahtarlar:
                degerler = [tablo[h].get(a) for h in tablo]
                sayac = {}
                for v in degerler:
                    sayac[v] = sayac.get(v, 0) + 1
                cogunluk[a] = max(sayac.items(), key=lambda x: x[1])[0] if len(tablo) > 2 else None
            print("\n== Tablo (anahtar=değer; '*' = çoğunluktan farklı, '-' = sunucu bu anahtarı basmadı)")
            gen = {a: max(len(a), max(len(str(tablo[h].get(a, "-"))) + 1 for h in tablo)) for a in anahtarlar}
            print("  %-28s %s" % ("sunucu", " ".join(a.ljust(gen[a]) for a in anahtarlar)))
            if csv_yol:
                satirlar_csv = []
                for h in sorted(set(list(veri) + eksik)):
                    k, m = durumlar.get(h, ("ÇIKTI YOK", "tree'de dosya yok"))
                    sapan = [a for a in anahtarlar if h in tablo and cogunluk[a] is not None and tablo[h].get(a) != cogunluk[a]]
                    satirlar_csv.append([h, k, m[:200]] + [tablo.get(h, {}).get(a, "") for a in anahtarlar] + [" ".join(sapan)])
                csv_yaz(csv_yol, ["sunucu", "durum", "mesaj"] + anahtarlar + ["sapan_alanlar"], satirlar_csv)
            for h in sorted(tablo):
                hucre = []
                for a in anahtarlar:
                    v = tablo[h].get(a, "-")
                    isaret = "*" if cogunluk[a] is not None and tablo[h].get(a) != cogunluk[a] else ""
                    hucre.append((str(v) + isaret).ljust(gen[a]))
                print("  %-28s %s" % (h, " ".join(hucre)))
            return 0 if not (sapma or eksik) else 1

    if csv_yol and not kv:
        satirlar_csv = []
        for h in sorted(set(list(veri) + eksik)):
            k, m = durumlar.get(h, ("ÇIKTI YOK", "tree'de dosya yok"))
            ilk = (tamam.get(h) or "").strip().splitlines()
            satirlar_csv.append([h, k, m[:200], ilk[0][:200] if ilk else ""])
        csv_yaz(csv_yol, ["sunucu", "durum", "mesaj", "cikti_ilk_satir"], satirlar_csv)
    if tamam:
        gruplar = {}
        for h, out in tamam.items():
            gruplar.setdefault(out.strip(), []).append(h)
        print("\n== Çıktı grupları (birebir aynı çıktı = tek grup; %d farklı çıktı)" % len(gruplar))
        for out, hostlar in sorted(gruplar.items(), key=lambda x: (len(x[1]), x[1][0])):
            print("  [%d sunucu] %s" % (len(hostlar), " ".join(sorted(hostlar))))
            satirlar = out.splitlines() or ["(boş çıktı)"]
            for s in satirlar[:satir]:
                print("     " + s[:200])
            if len(satirlar) > satir:
                print("     … (+%d satır; tamamı: %s/<sunucu> dosyasında 'stdout')" % (len(satirlar) - satir, dizin))
    return 0 if not (sapma or eksik) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
