#!/usr/bin/env python3
# rhsa-kontrol.py — "işin RHSA'ları sunuculara kurulu mu?" sorusunu sunucu × advisory olarak cevaplar. Yalnız okur (yerel dosyalar).
# Neden (Alp, 2026-11-12): RHEL 8.10'a güncelleme sonrası RHSA'lar kurulu olduğu hâlde model bunu doğru kontrol edemedi. Kök neden
# (ölçüldü dnf 4.20): `dnf updateinfo list --installed <ID>` yanlış/bilinmeyen ID'de ve depoda (Satellite CV'de) olmayan advisory'de de
# BOŞ döner, rc=0 — "kurulu değil" ile "depoda yok" ayırt edilemez. Karar betikte: advisory'nin paketleri sunucunun depolarından
# (`dnf repoquery --advisory`), kurulu sürümler `rpm -qa`'dan, karşılaştırma rpm sürüm kuralıyla (rpmvercmp) yapılır.
#
# kullanım:
#   rhsa-kontrol.py --komut <RHSA-…> [<RHSA-…> …] [-i <envanter>] [--hedef <grup|ad1,ad2,>]   → çalıştırılacak ansible komutunu basar
#   rhsa-kontrol.py <tree-dizini> <RHSA-…> [<RHSA-…> …] [--ayrinti]                              → RHSA başına tek satır (x/N);
#                                                                     farklı sunucular adıyla; --ayrinti: her sunucu ayrı satır
# Sonuçlar: ✅ kurulu · 🔄 kurulu, çalışan çekirdek eski (reboot bekliyor) · ❌ eksik (kurulu sürüm düşük) · ⚠️ depoda yok (advisory bu
# sunucunun depolarında yok: Satellite CV/terfi gerisinde ya da ID yanlış) · ➖ ilgisiz (advisory'nin hiçbir paketi kurulu değil) ·
# ❓ okunamadı (erişilemez / dnf hatası).
# Çıkış: 0 hepsi ✅/➖ · 1 ❌/🔄/⚠️ var · 2 okunamayan var ya da kullanım hatası
import importlib.util
import os
import re
import sys

KIMLIK = re.compile(r"^([A-Z]{2,5})-(\d{4})[:-](\d{3,7})$")
QF = "%{name} %{arch} %{epoch}:%{version}-%{release}"
CEKIRDEK = ("kernel", "kernel-core", "kernel-rt", "kernel-rt-core")


def kimlik_duzelt(t):
    m = KIMLIK.match(t.strip().strip(",;").upper())
    return "%s-%s:%s" % m.groups() if m else None


def uzak_komut(kimlikler):
    # yalnız okuma: echo, uname, dnf repoquery, rpm -qa. dnf hatası çıktıda görünsün diye 2>&1 (yoksa "depoda yok" sanılır).
    parca = ["echo @@calisan", "uname -r"]
    for k in kimlikler:
        parca += ["echo @@adv %s" % k, "dnf -q repoquery --advisory=%s --qf '%s' 2>&1" % (k, QF)]
    parca += ["echo @@rpm", "rpm -qa --qf '%s\\n'" % QF]
    return "; ".join(parca)


def _bol(a):
    return re.sub(r"^[^A-Za-z0-9~^]+", "", a)


def rpmvercmp(a, b):
    # rpm'in rpmvercmp kuralı (rpmio/rpmvercmp.c): sayı > harf, ~ her şeyden önce, ^ sondan sonra ama ek segmentten önce
    if a == b:
        return 0
    while a or b:
        a, b = _bol(a), _bol(b)
        if a.startswith("~") or b.startswith("~"):
            if not a.startswith("~"):
                return 1
            if not b.startswith("~"):
                return -1
            a, b = a[1:], b[1:]
            continue
        if a.startswith("^") or b.startswith("^"):
            if not a:
                return -1
            if not b:
                return 1
            if not a.startswith("^"):
                return 1
            if not b.startswith("^"):
                return -1
            a, b = a[1:], b[1:]
            continue
        if not a or not b:
            break
        if a[0].isdigit():
            sa = re.match(r"\d+", a).group()
            mb = re.match(r"\d+", b)
            if not mb:
                return 1
            sb = mb.group()
            if int(sa) != int(sb):
                return 1 if int(sa) > int(sb) else -1
        else:
            sa = re.match(r"[A-Za-z]+", a).group()
            mb = re.match(r"[A-Za-z]+", b)
            if not mb:
                return -1
            sb = mb.group()
            if sa != sb:
                return 1 if sa > sb else -1
        a, b = a[len(sa):], b[len(sb):]
    if not a and not b:
        return 0
    return 1 if a else -1


def evr_ayir(evr):
    e, _, vr = evr.rpartition(":") if ":" in evr else ("0", "", evr)
    e = "0" if e in ("", "(none)") else e
    v, _, r = vr.rpartition("-")
    return e, v, r


def evr_cmp(x, y):
    for a, b in zip(evr_ayir(x), evr_ayir(y)):
        c = rpmvercmp(a, b)
        if c:
            return c
    return 0


def evr_kisa(evr):
    e, v, r = evr_ayir(evr)
    return ("%s:" % e if e != "0" else "") + "%s-%s" % (v, r)


def ayristir(stdout):
    # → (çalışan çekirdek, {advisory: {(ad, arch): en yüksek evr}}, {advisory: [hata satırı]}, {(ad, arch): [evr]})
    calisan, adv, hata, kurulu, bolum, kim = "", {}, {}, {}, "", ""
    for s in stdout.splitlines():
        s = s.strip()
        if s == "@@calisan":
            bolum = "calisan"
            continue
        if s.startswith("@@adv "):
            bolum, kim = "adv", s.split(None, 1)[1]
            adv.setdefault(kim, {})
            continue
        if s == "@@rpm":
            bolum = "rpm"
            continue
        if not s:
            continue
        if bolum == "calisan":
            calisan = s
            continue
        p = s.split()
        paket = len(p) == 3 and ":" in p[2] and "-" in p[2]
        if bolum == "adv":
            if not paket:
                hata.setdefault(kim, []).append(s)
                continue
            anahtar = (p[0], p[1])
            if anahtar not in adv[kim] or evr_cmp(p[2], adv[kim][anahtar]) > 0:
                adv[kim][anahtar] = p[2]
        elif bolum == "rpm" and paket:
            kurulu.setdefault((p[0], p[1]), []).append(p[2])
    return calisan, adv, hata, kurulu


def calisan_evr(uname):
    # 4.18.0-553.184.1.el8_10.x86_64 → 0:4.18.0-553.184.1.el8_10
    u = re.sub(r"\.(x86_64|aarch64|ppc64le|s390x)(\+\w+)?$", "", uname)
    v, _, r = u.partition("-")
    return "0:%s-%s" % (v, r) if r else ""


def degerlendir(kim, calisan, adv, hata, kurulu):
    if kim in hata and not adv.get(kim):
        return "❓", "dnf hatası: %s" % hata[kim][-1][:160]
    if not adv.get(kim):
        return "⚠️", "depoda yok — bu sunucunun depolarında (Satellite CV) advisory yok ya da ID yanlış"
    eksik, ilgili, cekirdek_eski = [], [], ""
    for (ad, arch), gereken in sorted(adv[kim].items()):
        evrler = kurulu.get((ad, arch))
        if not evrler:
            continue
        ilgili.append(ad)
        en = evrler[0]
        for e in evrler[1:]:
            if evr_cmp(e, en) > 0:
                en = e
        if evr_cmp(en, gereken) < 0:
            eksik.append("%s.%s kurulu %s < %s" % (ad, arch, evr_kisa(en), evr_kisa(gereken)))
        elif ad in CEKIRDEK and calisan and calisan_evr(calisan) and evr_cmp(calisan_evr(calisan), gereken) < 0:
            cekirdek_eski = "çalışan çekirdek %s < %s" % (calisan, evr_kisa(gereken))
    if not ilgili:
        return "➖", "ilgisiz — advisory'nin %d paketinden hiçbiri kurulu değil" % len(adv[kim])
    if eksik:
        return "❌", "eksik: " + "; ".join(eksik[:3]) + (" … (+%d)" % (len(eksik) - 3) if len(eksik) > 3 else "")
    if cekirdek_eski:
        return "🔄", "kurulu, reboot bekliyor — " + cekirdek_eski
    ornek = sorted(set(ilgili))
    return "✅", "kurulu (%d paket: %s%s)" % (len(ilgili), ", ".join(ornek[:3]), " …" if len(ornek) > 3 else "")


def filo_tablo():
    yol = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "filo-kontrol", "filo-tablo.py")
    spec = importlib.util.spec_from_file_location("filo_tablo", yol)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__ or open(__file__, encoding="utf-8").read().split("\nimport ")[0])
        return 0 if argv else 2
    komut = argv[0] == "--komut"
    kalan = argv[1:] if komut else argv
    envanter, hedef, ham, ayrinti = "", "all", [], False
    i = 0
    while i < len(kalan):
        if kalan[i] == "--ayrinti":
            ayrinti, i = True, i + 1
            continue
        if kalan[i] == "-i" and i + 1 < len(kalan):
            envanter, i = kalan[i + 1], i + 2
        elif kalan[i] == "--hedef" and i + 1 < len(kalan):
            hedef, i = kalan[i + 1], i + 2
        else:
            ham.append(kalan[i])
            i += 1
    dizin = None if komut else (ham.pop(0) if ham else None)
    kimlikler, gecersiz = [], []
    for t in " ".join(ham).replace(",", " ").split():
        k = kimlik_duzelt(t)
        if k and k not in kimlikler:
            kimlikler.append(k)
        elif not k:
            gecersiz.append(t)
    if gecersiz or not kimlikler:
        print("advisory kimliği geçersiz/yok: %s — biçim RHSA-2025:1234 (CVE değil; CVE'nin RHSA'sını kullanıcıdan iste)"
              % (" ".join(gecersiz) or "-"))
        return 2
    if komut:
        print("ansible %s%s -m shell -f 20 -T 10 --task-timeout 300 -t cikti/filo/rhsa -a \"%s\"" % (
            hedef, " -i %s" % envanter if envanter else "", uzak_komut(kimlikler).replace('"', '\\"')))
        print("sonra: python3 %s cikti/filo/rhsa %s" % (os.path.abspath(__file__), " ".join(kimlikler)))
        print("(dizinde önceki çalıştırmadan kalan sunucu dosyaları da listelenir — farklı sunucu grubu için başka dizin: -t cikti/filo/rhsa-<grup>)")
        return 0
    if not dizin or not os.path.isdir(dizin):
        print("tree dizini yok: %s — önce: rhsa-kontrol.py --komut %s -i <envanter>" % (dizin, " ".join(kimlikler)))
        return 2
    ft = filo_tablo()
    veri = ft.oku(dizin)
    if not veri:
        print("tree dizini boş: %s" % dizin)
        return 2
    say = {}
    sonuc = {k: [] for k in kimlikler}
    for host, d in sorted(veri.items()):
        st, aciklama = ft.durum(d)
        if st != "ok":
            for k in kimlikler:
                sonuc[k].append((host, "❓", "%s %s" % (st, aciklama)))
            continue
        calisan, adv, hata, kurulu = ayristir(d.get("stdout") or "")
        if not kurulu:
            for k in kimlikler:
                sonuc[k].append((host, "❓", "rpm listesi okunamadı (çıktı bu betiğin komutundan değil mi? --komut ile üret)"))
            continue
        for k in kimlikler:
            if k not in adv and k not in hata:
                sonuc[k].append((host, "❓", "bu advisory sorgulanmamış — komutu bu kimliklerle yeniden üret (--komut)"))
                continue
            isaret, aciklama = degerlendir(k, calisan, adv, hata, kurulu)
            sonuc[k].append((host, isaret, aciklama))
    # Kısa biçim (saha 2026-11-12: 27 RHSA × 8 sunucu = 216 satır → model tabloyu kendisi kurdu, tek sunucunun sonucunu "tüm STL
    # sunucularında aynı" diye genelledi). RHSA başına bir satır: sonuç dağılımı (x/N); çoğunluktan farklı sunucular adıyla altında.
    hostlar = sorted(veri)
    print("Sunucu: %d (%s)" % (len(hostlar), ", ".join(hostlar)))
    # sunucunun tamamı okunamadıysa (erişilemez/rpm yok) bir kez yazılır, RHSA satırlarında yalnız ❓ sayısı olarak görünür
    okunamayan = {h for h in hostlar if all(any(x[0] == h and x[1] == "❓" for x in sonuc[k]) for k in kimlikler)}
    for h in sorted(okunamayan):
        print("  ❓ %s — %s" % (h, next(x[2] for x in sonuc[kimlikler[0]] if x[0] == h)))
    for k in kimlikler:
        dagilim, ilk = {}, {}
        for host, isaret, aciklama in sonuc[k]:
            dagilim[isaret] = dagilim.get(isaret, 0) + 1
            ilk.setdefault(isaret, aciklama)
            say[isaret] = say.get(isaret, 0) + 1
        cogu = max(dagilim, key=lambda x: dagilim[x])
        m = re.search(r"\(\d+ paket: ([^)]*)\)", ilk.get("✅", ""))
        ek = (" (%s)" % m.group(1)) if m and cogu == "✅" else ("" if cogu == "✅" else " — " + ilk[cogu].split(" — ")[0])
        print("%-17s %s%s" % (k, " · ".join("%s %d/%d" % (x, dagilim[x], len(hostlar)) for x in ("✅", "🔄", "❌", "⚠️", "➖", "❓")
                                           if x in dagilim), ek))
        for host, isaret, aciklama in sonuc[k]:
            if ayrinti or (isaret != cogu and host not in okunamayan):
                print("    %s %s — %s" % (isaret, host, aciklama))
    if "⚠️" in say:
        print("⚠️ depoda yok: içerik sunucuya gelmemiş (Satellite CV yayın/terfi gerisinde) ya da kimlik yanlış — kullanıcıya söyle, düzeltme önerme")
    if "🔄" in say:
        print("🔄 paket kurulu ama çalışan çekirdek eski: düzeltme reboot'tan sonra etkin — reboot kararı kullanıcının")
    print("Tabloyu AYNEN aktar; sunucu atlama, sayı uydurma, kendi tablonu kurma. ➖ = paket o sunucuda kurulu değil, RHSA uygulanmaz (eksik değil).")
    if "❓" in say:
        return 2
    return 1 if any(x in say for x in ("❌", "🔄", "⚠️")) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
