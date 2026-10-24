#!/usr/bin/env python3
# cis-ozet.py — OpenSCAP CIS taramasının ekran çıktısını (oscap xccdf eval, rapor dosyası YAZMADAN) CIS madde no + seviye ile
# özetler; kurum kararı olan maddeleri "bulgu" saymaz, ayrı satırda gerekçesiyle gösterir. Yalnız okur (yerel dosya/stdin).
# Neden: oscap çıktısı yüzlerce "Title/Rule/Result" bloğu — model elle sayınca uyduruyor (G21/G22 sınıfı); SELinux/firewalld
# kapalı olduğu için düşen maddeler "kritik bulgu" diye yazılıyordu (kurum kararı, AGENTS "Kurum sunucu gerçekleri").
#
# Girdi (biri):
#   - (tek sunucu, borunun başında ssh — betik bağlanmaz):
#     ssh root@<sunucu> 'grep ^VERSION_ID= /etc/os-release; oscap xccdf eval --profile xccdf_org.ssgproject.content_profile_cis_server_l1 /usr/share/xml/scap/ssg/content/ssg-rhel10-ds.xml' | cis-ozet.py -
#   - (çok sunucu) `ansible … -m shell -t cikti/cis -a '<aynı okuma>'` → cis-ozet.py cikti/cis
# Seçenekler:
#   --urun rhel9|rhel10 : çıktıda VERSION_ID satırı yoksa ürün (CIS madde numaraları ürüne göre değişir)
#   --rke2              : sunucular RKE2 node'u — net.ipv4.ip_forward=1 kurum kararı (AGENTS), bulgu sayılmaz
#   --hepsi             : bulgu listesini kısaltmadan bas (varsayılan sunucu başına 40 satır)
#   --csv <dosya>       : sunucu;cis_id;seviye;kural;sonuç;sınıf satırları (utf-8-sig, ';' — Türkçe Excel). Üzerine yazmaz.
# Veri: veri/cis-kural.tsv (ComplianceAsCode SSG v0.1.82 kontrol dosyalarından üretildi — başlıktaki kaynak satırları).
import csv
import json
import os
import re
import sys

KOK = os.path.dirname(os.path.abspath(__file__))
VERI = os.path.join(KOK, "veri", "cis-kural.tsv")

# Kurum kararları (Alp) — bulgu DEĞİL; kural adı → gerekçe. Desen: tam ad ya da önek (sonda *).
KURUM = [
    ("grub2_enable_selinux", "SELinux kurum kararıyla kapalı (grub'dan) — AGENTS 'Kurum sunucu gerçekleri'"),
    ("selinux_not_disabled", "SELinux kurum kararıyla kapalı"),
    ("selinux_state", "SELinux kurum kararıyla kapalı"),
    ("selinux_policytype", "SELinux kurum kararıyla kapalı"),
    ("selinux_confinement_of_daemons", "SELinux kurum kararıyla kapalı"),
    ("service_firewalld_enabled", "firewalld kurum kararıyla kapalı"),
    ("package_firewalld_installed", "firewalld kurum kararıyla kapalı"),
    ("firewalld*", "firewalld kurum kararıyla kapalı"),
    ("set_firewalld_default_zone", "firewalld kurum kararıyla kapalı"),
    ("configure_firewalld_ports", "firewalld kurum kararıyla kapalı"),
    ("service_nftables_disabled", "firewalld kapalı — tek güvenlik duvarı aracı maddesi (4.1.2) bu kararla birlikte düşer"),
    ("package_nftables_installed", "firewalld kapalı — güvenlik duvarı maddesi"),
    ("nftables*", "firewalld kapalı — güvenlik duvarı maddesi"),
    ("sshd_disable_root_login", "root ssh kapatılmaz (kurum politikası, Alp 2026-10-24) — telafi: IdM + AD trust, HBAC (sshd) ve sudo kuralları (idm-erisim)"),
]
RKE2_KURUM = [("sysctl_net_ipv4_ip_forward", "RKE2 node'u: net.ipv4.ip_forward=1 kurum kararı (CNI ister)")]

# Bulgu değil ama birlikte okunması gereken notlar (kaynaklı)
NOT = {
    "accounts_umask_root": "IdM sunucusunda ipa-server/replica kurulumu root umask 0022 ister (Red Hat 'Installing IdM' §1.9); kurulum "
                           "sırasında geçici 0022, sonra CIS değeri — idm-kurulum",
    "enable_authselect": "SSG düzeltmesi yalnız authselect profili SEÇİLİ DEĞİLSE profil seçer (RHEL 10 CIS profilinde 'local'); IdM "
                         "join (sssd) önce yapılırsa etkisi yok — `authselect current` ile oku",
    "partition_for_tmp": "/tmp ayrı bölüm/tmpfs maddesi; kurum /tmp noexec uyguluyor (Alp) — bölüm düzeni şablondan gelir",
}

SONUC_SIRA = ["fail", "error", "unknown", "pass", "notapplicable", "notchecked", "informational", "fixed", "notselected"]
SATIR = re.compile(r"^(Title|Rule|Ident|Result)\r?\t(.*)$")
VERSIYON = re.compile(r'VERSION_ID="?(\d+)')
ONEK = "xccdf_org.ssgproject.content_rule_"


def veri_oku():
    d = {}
    try:
        f = open(VERI, encoding="utf-8")
    except OSError as e:
        sys.exit("veri okunamadı: %s: %s" % (VERI, e))
    with f:
        for s in f:
            if s.startswith("#") or not s.strip():
                continue
            p = s.rstrip("\n").split("\t")
            if len(p) < 6:
                continue
            urun, cid, sv, durum, kural, baslik = p[:6]
            d.setdefault(urun, {}).setdefault(kural, []).append((cid, sv, durum, baslik))
    return d


def kurum_mu(kural, rke2):
    for desen, neden in KURUM + (RKE2_KURUM if rke2 else []):
        if desen.endswith("*") and kural.startswith(desen[:-1]) or kural == desen:
            return neden
    return None


def ayristir(metin):
    """oscap stdout → (urun ya da None, [(kural, başlık, sonuç)])"""
    urun, kayit, baslik, kural = None, [], "", None
    # "Title\r\t…" — \r bazı aktarımlarda \n'e döner ("Title\n\t…"); ikisini de tek satıra indir
    metin = re.sub(r"(?m)^(Title|Rule|Ident|Result)[\r\n]+\t", "\\1\t", metin)
    for ham in metin.split("\n"):  # splitlines() oscap'in "Title\r\t…" satırını \r'de böler
        m = VERSIYON.search(ham)
        if m and urun is None and not ham.startswith(("Title", "Rule")):
            urun = "rhel" + m.group(1)
            continue
        m = SATIR.match(ham.rstrip("\n"))
        if not m:
            continue
        alan, deger = m.group(1), re.sub(r"\x1b\[[0-9;]*m", "", m.group(2)).strip()
        if alan == "Title":
            baslik, kural = deger, None
        elif alan == "Rule":
            kural = deger[len(ONEK):] if deger.startswith(ONEK) else deger
        elif alan == "Result" and kural:
            kayit.append((kural, baslik, deger.lower()))
            kural = None
    return urun, kayit


def girdiler(yol):
    """'-' → stdin; dizin → ansible tree JSON'ları (sunucu başına stdout); dosya → tek sunucu."""
    if yol == "-":
        return {"(stdin)": (sys.stdin.read(), None)}
    if os.path.isdir(yol):
        sonuc = {}
        for ad in sorted(os.listdir(yol)):
            p = os.path.join(yol, ad)
            if not os.path.isfile(p):
                continue
            try:
                j = json.load(open(p, encoding="utf-8", errors="replace"))
            except ValueError as e:
                sonuc[ad] = ("", "BOZUK JSON: %s" % e)
                continue
            if j.get("unreachable"):
                sonuc[ad] = ("", "ERİŞİLEMEZ — değer YAZMA: %s" % (j.get("msg") or "").strip()[:120])
            else:
                hata = None if j.get("stdout") else "ÇIKTI YOK — %s" % ((j.get("stderr") or j.get("msg") or "").strip()[:160])
                sonuc[ad] = (j.get("stdout") or "", hata)
        return sonuc
    return {os.path.basename(yol): (open(yol, encoding="utf-8", errors="replace").read(), None)}


def main():
    arg = sys.argv[1:]
    if not arg or arg[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import csv")[0].replace("# ", "").replace("#", ""))
        return 0
    urun_zorla = arg[arg.index("--urun") + 1] if "--urun" in arg else None
    rke2, hepsi = "--rke2" in arg, "--hepsi" in arg
    csv_yol = arg[arg.index("--csv") + 1] if "--csv" in arg else None
    if csv_yol and os.path.exists(csv_yol):
        sys.exit("--csv: %s zaten var — üzerine yazılmaz, başka ad ver" % csv_yol)
    tut = {urun_zorla, csv_yol}
    yollar = [a for a in arg if not a.startswith("--") and a not in tut]
    veri = veri_oku()
    csv_satir = []
    cikis = 0
    for yol in yollar:
        for sunucu, (metin, hata) in girdiler(yol).items():
            print("== %s" % sunucu)
            if hata:
                print("   %s" % hata)
                cikis = 1
                continue
            urun, kayit = ayristir(metin)
            if urun and urun_zorla and urun != urun_zorla:
                print("   ⚠ çıktıdaki VERSION_ID %s, --urun %s — çıktıdaki kullanıldı" % (urun, urun_zorla))
            urun = urun or urun_zorla
            if not kayit:
                print("   oscap sonuç satırı yok (Title/Rule/Result) — tarama çalışmadı mı? çıktının son satırları:")
                for s in metin.strip().splitlines()[-4:]:
                    print("     " + s[:160])
                cikis = 1
                continue
            harita = veri.get(urun or "", {})
            if not harita:
                print("   ⚠ ürün belirlenemedi (%s) — CIS madde no basılamaz; --urun rhel9|rhel10 ver ya da çıktıya VERSION_ID ekle" % urun)
            say = {}
            for _, _, s in kayit:
                say[s] = say.get(s, 0) + 1
            print("   ürün %s · kural %d · %s" % (urun or "?", len(kayit),
                  " · ".join("%s %d" % (k, say[k]) for k in SONUC_SIRA if k in say)))
            bulgu, kurum, notlar = [], [], []
            for kural, baslik, s in kayit:
                if s not in ("fail", "error", "unknown"):
                    continue
                cis = harita.get(kural, [])
                cid = ",".join(sorted({c[0] for c in cis})) or "-"
                sv = "L1" if any(c[1] == "l1" for c in cis) else ("L2" if cis else "?")
                neden = kurum_mu(kural, rke2) if s == "fail" else None
                sinif = "kurum" if neden else ("bulgu" if s == "fail" else s)
                csv_satir.append([sunucu, cid, sv, kural, s, sinif])
                if neden:
                    kurum.append((cid, sv, kural, neden))
                else:
                    bulgu.append((cid, sv, kural, baslik, s))
                if kural in NOT:
                    notlar.append("%s: %s" % (kural, NOT[kural]))

            def anahtar(x):
                return [int(p) if p.isdigit() else 0 for p in re.split(r"[.,]", x[0])] if x[0] != "-" else [999]
            bulgu.sort(key=anahtar)
            l1 = sum(1 for b in bulgu if b[1] == "L1" and b[4] == "fail")
            l2 = sum(1 for b in bulgu if b[1] == "L2" and b[4] == "fail")
            print("   BULGU (fail, kurum kararı dışı): %d  — L1 %d · L2 %d · CIS eşlemesi yok %d · error/unknown %d"
                  % (sum(1 for b in bulgu if b[4] == "fail"), l1, l2,
                     sum(1 for b in bulgu if b[1] == "?" and b[4] == "fail"), sum(1 for b in bulgu if b[4] != "fail")))
            sinir = len(bulgu) if hepsi else 40
            for cid, sv, kural, baslik, s in bulgu[:sinir]:
                print("     %-10s %-2s %-7s %s — %s" % (cid, sv, s, kural, baslik[:90]))
            if len(bulgu) > sinir:
                print("     … +%d satır (--hepsi ya da --csv)" % (len(bulgu) - sinir))
            if kurum:
                print("   KURUM KARARI (bulgu değil): %d" % len(kurum))
                for cid, sv, kural, neden in sorted(kurum, key=anahtar):
                    print("     %-10s %-2s %s — %s" % (cid, sv, kural, neden))
            if notlar:
                print("   NOT:")
                for n in sorted(set(notlar)):
                    print("     " + n)
            print("   notchecked %d = elle denetlenecek madde (CIS 'Manual'); otomatik sonuç yok — 'uygulanmamış' yazma"
                  % say.get("notchecked", 0))
    if csv_yol:
        with open(csv_yol, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(["sunucu", "cis_id", "seviye", "kural", "sonuc", "sinif"])
            w.writerows(csv_satir)
        print("csv: %s (%d satır)" % (csv_yol, len(csv_satir)))
    return cikis


if __name__ == "__main__":
    sys.exit(main())
