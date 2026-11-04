#!/usr/bin/env python3
# uzak-ozet.py — uzak-topla.sh'ın getirilen çıktısını (açılmış uzak-<ortam>-<tarih>/ dizini) burada özetler. Yalnız okur: dizindeki
# dosyalar + yerel `ansible --list-hosts` / `ansible-inventory --list` (bağlantı yok). Hesap betiklerde: erişim/IP bloğu
# filo-kontrol/erisim-blok.py, host tablosu filo-kontrol/filo-tablo.py --kv. Model tabloyu AYNEN aktarır (AGENTS — kafadan tablo yok).
#
# kullanım: uzak-ozet.py <uzak-dizin> [--csv <dosya>]
# Çıkış: erisim-blok'un kodu (0 hepsine erişildi · 1 erişilemeyen var · 2 okunamadı)
import importlib.util
import os
import sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def yukle(ad, dosya):
    spec = importlib.util.spec_from_file_location(ad, os.path.join(KOK, "filo-kontrol", dosya))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print("kullanım: uzak-ozet.py <uzak-dizin> [--csv <dosya>]   (önce: tar xzf uzak-<ortam>-<tarih>.tgz)")
        return 0 if argv else 2
    dizin = argv[0].rstrip("/")
    if dizin.endswith(".tgz"):
        print("arşiv açılmamış: önce `tar xzf %s` (çalışma dizininde), sonra dizini ver" % dizin)
        return 2
    csv_yol = argv[argv.index("--csv") + 1] if "--csv" in argv and argv.index("--csv") + 1 < len(argv) else None
    meta_yol, env, tree = (os.path.join(dizin, x) for x in ("meta.txt", "envanter.ini", "bilgi"))
    for y in (meta_yol, env, tree):
        if not os.path.exists(y):
            print("eksik: %s — uzak-topla.sh çıktısı değil ya da yarım" % y)
            return 2
    meta = dict(l.rstrip("\n").split("=", 1) for l in open(meta_yol, encoding="utf-8", errors="replace") if "=" in l)
    grup = meta.get("grup") or "all"
    kaynak = (meta.get("kaynak_ip") or "").split()
    print("== UZAK ORTAM: %s · toplandı %s · makine %s (%s) · %s" % (meta.get("ortam", "?"), meta.get("tarih", "?"),
          meta.get("makine", "?"), " ".join(kaynak) or "IP ?", meta.get("ansible", "ansible ?")))
    print("   envanterde %s sunucu (grup %s), tree'de %s" % (meta.get("host_sayisi", "?"), grup, meta.get("tree", "?")))
    print("\n################ 1. ERİŞİM — IP bloğu başına (filo-kontrol/erisim-blok.py)\n")
    kod = yukle("erisim_blok", "erisim-blok.py").main([tree, "-i", env, "--grup", grup] + (["--kaynak", kaynak[0]] if kaynak else []))
    print("\n################ 2. HOST BİLGİSİ — erişilenler (filo-kontrol/filo-tablo.py --kv)\n")
    ek = ["--csv", csv_yol] if csv_yol else []
    yukle("filo_tablo", "filo-tablo.py").main([tree, "--kv", "--grup", grup, "-i", env, "--say", "os", "--say", "satellite", "--say", "sanal"] + ek)
    return kod


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
