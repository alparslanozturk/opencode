#!/usr/bin/env python3
# İş durumu — "çalışma ne durumda?" (Alp, 2026-11-12). Yalnız okur: dn/<numara>/hosts.ini + dn/<numara>/logs/*.log
# (ANSIBLE_LOG_PATH ile yazılan ansible logları). Sunucuya bağlanmaz.
#
#   python3 is-durum.py dn/29000          # her playbook için: ✅ bitti · ❌ düştü · 🔌 erişilemedi · ⏳ henüz çalışmadı · ▶ şu an çalışıyor
#   python3 is-durum.py dn/29000 --ayrinti   # sunucu başına son sonuç + düşenin hata satırı
#   python3 is-durum.py dn/29000 --sec 3 --pb 01-reboot      # "ilk 3'ünü yap": o playbook'ta henüz BİTMEMİŞ ilk 3 sunucu → -l '<adlar>'
#   python3 is-durum.py dn/29000 --sec 10% --pb 01-reboot --grup stl   # "%10'unu yap" (yukarı yuvarlanır, en az 1); grup içinden
#
# Sunucunun sonucu, onu içeren EN SON çalıştırmanın PLAY RECAP satırıdır (önce düştü, sonra tekrar koşulup bitti → ✅).
# Çıkış: 0 hepsi bitti · 1 bekleyen/düşen var · 2 dizin/envanter yok.
import os
import re
import sys

SATIR = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d),\d+ p=(\d+) u=\S+ n=\S+ \| (.*)$")
RECAP = re.compile(r"^(\S+)\s+: ok=(\d+)\s+changed=(\d+)\s+unreachable=(\d+)\s+failed=(\d+)")
FATAL = re.compile(r"^fatal: \[([^\]]+)\]: (FAILED|UNREACHABLE)! => (.*)$")
SONUC = re.compile(r"^(ok|changed|skipping|fatal|failed): \[([^\]]+)\]")
GOREV = re.compile(r"^TASK \[(.*)\] \**$")
MSG = re.compile(r'"msg": "((?:[^"\\]|\\.)*)"')


def envanter(yol):
    # → (gruplar {ad: [host]}, sıralı tüm host'lar). [is_ek], :vars, :children grup sayılmaz.
    gruplar, sira, g = {}, [], None
    with open(yol, encoding="utf-8", errors="replace") as f:
        for ham in f:
            s = ham.split("#")[0].strip()
            if not s:
                continue
            m = re.match(r"^\[([^\]]+)\]$", s)
            if m:
                g = m.group(1)
                if ":" in g:
                    g = None
                continue
            if g is None:
                continue
            h = s.split()[0]
            if "=" in h:
                continue
            if h not in sira:
                sira.append(h)
            if g != "is_ek":
                gruplar.setdefault(g, [])
                if h not in gruplar[g]:
                    gruplar[g].append(h)
    return gruplar, sira


def calismalar(yol):
    # Log dosyası → [çalıştırma]; her ansible-playbook süreci (p=) ayrı çalıştırma.
    out, aktif = [], {}
    with open(yol, encoding="utf-8", errors="replace") as f:
        for ham in f:
            m = SATIR.match(ham.rstrip("\n"))
            if not m:
                continue
            zaman, pid, metin = m.groups()
            c = aktif.get(pid)
            if c is None or c.get("bitti"):
                c = {"pid": pid, "bas": zaman, "son": zaman, "recap": {}, "hata": {}, "gorev": "", "gorulen": [], "bitti": False, "tur": {}}
                aktif[pid] = c
                out.append(c)
            c["son"] = zaman
            if metin.startswith("PLAY RECAP"):
                c["recap_bas"] = True
                continue
            r = RECAP.match(metin)
            if r and c.get("recap_bas"):
                h, ok, ch, un, fa = r.group(1), int(r.group(2)), int(r.group(3)), int(r.group(4)), int(r.group(5))
                c["recap"][h] = "🔌" if un else ("❌" if fa else "✅")
                continue
            if c.get("recap_bas") and c["recap"]:
                c["bitti"] = True
            g = GOREV.match(metin)
            if g:
                c["gorev"] = g.group(1)
                continue
            fa = FATAL.match(metin)
            if fa:
                ms = MSG.search(fa.group(3))
                c["tur"][fa.group(1)] = "🔌" if fa.group(2) == "UNREACHABLE" else "❌"
                c["hata"][fa.group(1)] = "%s — %s" % (c["gorev"], (ms.group(1) if ms else fa.group(3))[:160])
            s = SONUC.match(metin)
            if s and s.group(2) not in c["gorulen"]:
                c["gorulen"].append(s.group(2))
    for c in out:
        if c["recap"]:
            c["bitti"] = True
    return out


def canli(pid):
    return os.path.isdir("/proc/%s" % pid)


def ozet_satiri(durum, hostlar):
    say = {}
    for h in hostlar:
        say[durum[h]] = say.get(durum[h], 0) + 1
    n = len(hostlar)
    return " · ".join("%s %d/%d" % (k, say[k], n) for k in ("✅", "▶", "❌", "🔌", "⏳") if k in say)


def deger(argv, ad):
    if ad in argv:
        i = argv.index(ad)
        if i + 1 < len(argv):
            v = argv[i + 1]
            del argv[i:i + 2]
            return v
        del argv[i]
        return ""
    return None


def durumlar(d, ad, hostlar):
    durum = {h: "⏳" for h in hostlar}
    hata, son_cal = {}, None
    lg = os.path.join(d, "logs", ad + ".log")
    if os.path.isfile(lg):
        for c in calismalar(lg):
            son_cal = c
            for h, s in c["recap"].items():
                if h in durum:
                    durum[h] = s
                    if s == "✅":
                        hata.pop(h, None)
            for h, m in c["hata"].items():
                if c["recap"].get(h, "❌") != "✅":
                    hata[h] = m
            if not c["bitti"]:  # yarıda kalan/süren koşu: recap yok, düşen sunucu fatal satırından
                for h, t in c["tur"].items():
                    if h in durum:
                        durum[h] = t
            if not c["bitti"] and canli(c["pid"]):
                for h in c["gorulen"]:
                    if h in durum:
                        durum[h] = "▶"
    return durum, hata, son_cal


def sec(d, oran, pb, grup, gruplar, hostlar):
    # "ilk N'i / %N'i yap": henüz bitmemiş (⏳ ya da ❌/🔌 değil — yalnız hiç çalışmamış) sunuculardan envanter sırasıyla ilk N.
    m = re.fullmatch(r"(\d+)(%?)", oran or "")
    if not m or int(m.group(1)) == 0:
        print("❌ --sec <sayı> ya da <yüzde>% (ör. --sec 3, --sec 10%)")
        return 2
    if not pb:
        print("❌ --pb <playbook adı> (ör. --pb 01-reboot) — hangi adım için seçiliyor?")
        return 2
    pb = os.path.splitext(os.path.basename(pb))[0]
    havuz = hostlar
    if grup:
        if grup not in gruplar:
            print("❌ [%s] grubu yok — gruplar: %s" % (grup, ", ".join(gruplar) or "-"))
            return 2
        havuz = gruplar[grup]
    durum, _, _ = durumlar(d, pb, havuz)
    bekleyen = [h for h in havuz if durum[h] == "⏳"]
    sorunlu = [h for h in havuz if durum[h] in ("❌", "🔌")]
    n = int(m.group(1))
    if m.group(2):
        n = max(1, -(-len(havuz) * n // 100))
    secilen = bekleyen[:n]
    if not secilen:
        print("✅ %s: %s içinde bekleyen sunucu yok%s" % (pb, "[%s]" % grup if grup else "işin", 
              " — düşen/erişilemeyen: " + ", ".join(sorunlu) if sorunlu else ""))
        return 1
    print("-l '%s'" % ",".join(secilen))
    print("# %s: %d sunucu seçildi (%s%s), sonra kalan bekleyen %d%s" % (
        pb, len(secilen), oran, " / [%s] %d" % (grup, len(havuz)) if grup else " / %d" % len(havuz),
        len(bekleyen) - len(secilen), "; düşen/erişilemeyen ayrı: " + ", ".join(sorunlu) if sorunlu else ""))
    return 0


def main(argv):
    argv = list(argv)
    oran, pb, grup = deger(argv, "--sec"), deger(argv, "--pb"), deger(argv, "--grup")
    ayrinti = "--ayrinti" in argv
    arg = [a for a in argv if not a.startswith("--")]
    if len(arg) != 1:
        print("kullanım: is-durum.py dn/<numara> [--ayrinti]")
        return 2
    d = arg[0].rstrip("/")
    inv = os.path.join(d, "hosts.ini")
    if not os.path.isfile(inv):
        print("❌ %s yok — iş envanterini is-envanter.py ile kur" % inv)
        return 2
    gruplar, hostlar = envanter(inv)
    if not hostlar:
        print("❌ %s içinde sunucu yok" % inv)
        return 2
    if oran is not None:
        return sec(d, oran, pb, grup, gruplar, hostlar)
    print("İş %s — %d sunucu%s" % (os.path.basename(d), len(hostlar),
                                  " (" + ", ".join("%s %d" % (g, len(v)) for g, v in gruplar.items()) + ")" if gruplar else ""))
    fazla = sorted(x for x in os.listdir(d) if x.endswith(".ini") and x != "hosts.ini")
    if fazla:
        print("⚠️ elle yazılmış envanter: %s — kullanılmaz; tek envanter %s" % (", ".join(fazla), inv))
    playbooklar = sorted(x for x in os.listdir(d) if re.match(r"^\d\d-.*\.ya?ml$", x))
    logdir = os.path.join(d, "logs")
    loglar = sorted(x for x in os.listdir(logdir) if x.endswith(".log")) if os.path.isdir(logdir) else []
    adlar = [os.path.splitext(p)[0] for p in playbooklar]
    for lg in loglar:
        if os.path.splitext(lg)[0] not in adlar:
            adlar.append(os.path.splitext(lg)[0])
    if not adlar:
        print("⏳ henüz playbook yok (dn/<numara>/01-<ad>.yaml)")
        return 1
    hepsi_bitti = True
    for ad in adlar:
        lg = os.path.join(logdir, ad + ".log")
        durum, hata, son_cal = durumlar(d, ad, hostlar)
        print("")
        if not os.path.isfile(lg):
            print("%s — log yok (çalışmadı ya da ANSIBLE_LOG_PATH=%s verilmedi)" % (ad, lg))
        else:
            print("%s — %s" % (ad, ozet_satiri(durum, hostlar)))
        if son_cal and not son_cal["bitti"]:
            if canli(son_cal["pid"]):
                print("  ▶ çalışıyor (başladı %s, son satır %s): görev \"%s\"" % (son_cal["bas"][11:], son_cal["son"][11:], son_cal["gorev"]))
            else:
                print("  ⚠️ son çalıştırma yarıda kesildi (%s → %s, görev \"%s\") — sonucu olmayan sunucular ⏳ sayıldı" % (
                    son_cal["bas"][11:], son_cal["son"][11:], son_cal["gorev"]))
        if gruplar and len(gruplar) > 1:
            for g, v in gruplar.items():
                print("  [%s] %s" % (g, ozet_satiri(durum, v)))
        for isaret, ad_ in (("❌", "düştü"), ("🔌", "erişilemedi"), ("⏳", "bekliyor")):
            l = [h for h in hostlar if durum[h] == isaret]
            if l and not (isaret == "⏳" and len(l) == len(hostlar)):
                print("  %s %s: %s" % (isaret, ad_, ", ".join(l)))
        for h in hostlar:
            if durum[h] in ("❌", "🔌") and h in hata:
                print("     %s: %s" % (h, hata[h]))
        if ayrinti:
            for h in hostlar:
                print("   %s %s" % (durum[h], h))
        if any(v != "✅" for v in durum.values()):
            hepsi_bitti = False
    print("")
    print("Bu tabloyu kullanıcıya AYNEN aktar; kendi durum tablonu kurma. Kalanlar için aynı komut -l '<adlar>' ya da "
          "-l @%s/<playbook>.retry ile." % logdir)
    return 0 if hepsi_bitti else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
