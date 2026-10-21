#!/usr/bin/env python3
"""uyum.py — Rancher / RKE2 / Antrea / RHEL uyum, ömür (EOL) ve yükseltme yolu denetimi. Çevrimdışı, yalnız stdlib.

Model hesap yapmaz: tarih farkı, matris satırı, yükseltme sırası bu betikten gelir (saha G65: "84 gün" → "120 gün" yazılmıştı).
Veri: aynı dizindeki veri/surumler.txt (her bölümün kaynağı ve indirme tarihi orada).

  python3 uyum.py kontrol --rancher v2.14.3 --rke2 v1.33.13+rke2r1 --antrea v2.3.0 --rhel 9.2,9.4,9.8
  python3 uyum.py yol     --rancher v2.14.3 --rke2 v1.33.13+rke2r1 --antrea v2.3.0 --hedef-rke2 1.35 --hedef-rancher 2.15
  python3 uyum.py veri    # veri tarihleri

Çıkış kodu: 0 sorun yok · 1 en az bir ❌ · 2 kullanım/veri hatası.
"""
import argparse
import datetime as dt
import os
import re
import sys

VERI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "veri", "surumler.txt")
YAKIN_GUN = 90  # ömür sonuna bu kadar gün kala ⚠️
ANTREA_ATLAMA = 4  # Antrea docs/versioning.md: tek seferde en çok 4 minor


def veri_oku(yol=VERI):
    bolum, d, kaynak = None, {}, {}
    hamlar = {}  # '|' ayrılmış bölümler için satırın kendisi ([antrea-kayit])
    try:
        f = open(yol, encoding="utf-8")
    except OSError as e:
        sys.exit(f"veri okunamadı: {yol}: {e}")
    with f:
        for ham in f:
            s = ham.strip()
            if not s:
                continue
            m = re.fullmatch(r"\[([a-z0-9-]+)\]", s)
            if m:
                bolum = m.group(1)
                d[bolum], kaynak[bolum], hamlar[bolum] = [], [], []
                continue
            if s.startswith("#"):
                if bolum:
                    kaynak[bolum].append(s.lstrip("# "))
                continue
            if bolum:
                d[bolum].append(s.split())
                hamlar[bolum].append(s)
    d["_ham"] = hamlar
    return d, kaynak


def tarih(s):
    return None if s in (None, "-") else dt.date.fromisoformat(s)


def hat(s):
    """'v1.33.13+rke2r1' / '1.33' → '1.33'; 'v2.14.3' → '2.14'."""
    m = re.match(r"v?(\d+)\.(\d+)", s or "")
    if not m:
        raise ValueError(f"sürüm anlaşılmadı: {s!r}")
    return f"{m.group(1)}.{m.group(2)}"


def hat_t(h):
    a, b = h.split(".")
    return int(a), int(b)


def sonraki(h):
    a, b = hat_t(h)
    return f"{a}.{b + 1}"


def surum_t(s):
    """Yama karşılaştırması: v1.33.13+rke2r2 → (1,33,13,2); v2.14.3 → (2,14,3,0)."""
    m = re.match(r"v?(\d+)\.(\d+)(?:\.(\d+))?(?:\+rke2r(\d+))?", s)
    if not m:
        raise ValueError(f"sürüm anlaşılmadı: {s!r}")
    return tuple(int(x) if x else 0 for x in m.groups())


class Veri:
    def __init__(self, d):
        self.matris = {r[0]: dict(up=(r[1], r[2]), down=r[3].split(","), rhel=r[4].split(","), kaynak=r[5]) for r in d["rancher-matris"]}
        self.r_yama = {r[0]: r[1] for r in d["rancher-yama"]}
        self.r_omur = {r[0]: dict(ga=tarih(r[1]), eom=tarih(r[2]), eol=tarih(r[3])) for r in d["rancher-omur"]}
        self.k_yama = {r[0]: r[1] for r in d["rke2-yama"]}
        self.k_omur = {r[0]: dict(ga=tarih(r[1]), eom=tarih(r[2]), eol=tarih(r[3])) for r in d["rke2-omur"]}
        self.u_omur = {r[0]: tarih(r[1]) for r in d["k8s-omur"]}
        self.antrea = {r[0]: dict(yama=r[1], cikis=tarih(r[2]), alt=r[3], ust=r[4]) for r in d["antrea"]}
        # G77: üretici kanıtları — VMware VCN destek matrisi, VMware VKr'nin paketlediği ikililer, ikiliye özgü kayıtlar
        self.a_vmware = [dict(vcn=r[0], upstream=r[1], tarih=r[2], k8s=r[3].split(","), rancher=r[4], kod=r[5])
                         for r in d.get("antrea-vmware", [])]
        self.a_vkr = {r[0]: dict(antrea=r[1].split(","), vkr=r[2].split(",")) for r in d.get("antrea-vkr", [])}
        self.a_kayit = [[x.strip() for x in l.split("|")] for l in d.get("_ham", {}).get("antrea-kayit", [])]
        self.rke2_cni = [r[0] for r in d.get("rke2-cni", [])]
        self.gpu_op = {r[0]: dict(alt=r[1], ust=r[2], rhel=r[3].split(","), varsayilan=r[4], suruculer=r[5].split(","))
                       for r in d.get("gpu-operator", [])}
        self.rhel = {r[0]: dict(son=r[1], tam=tarih(r[2]), bakim=tarih(r[3])) for r in d["rhel-omur"]}

    def matris_satiri(self, rancher):
        """Tam yama satırı; yoksa aynı minor'ın en yakın (≤, yoksa ilk) satırı + yaklaşık işareti."""
        r = "v" + rancher.lstrip("v")
        if r in self.matris:
            return r, self.matris[r], False
        mn = hat(r)
        aday = sorted((k for k in self.matris if hat(k) == mn), key=surum_t)
        if not aday:
            return None, None, False
        alt = [k for k in aday if surum_t(k) <= surum_t(r)]
        k = alt[-1] if alt else aday[0]
        return k, self.matris[k], True

    def antrea_garanti(self, mn, k8s):
        a = self.antrea.get(mn)
        return bool(a) and hat_t(a["alt"]) <= hat_t(k8s) <= hat_t(a["ust"])

    def antrea_vkr(self, mn, k8s):
        """VMware VKr bu K8s hattında bu Antrea minor'ını paketliyor mu → paketlenen sürümler."""
        return [x for x in self.a_vkr.get(k8s, {}).get("antrea", []) if hat(x) == mn]

    def antrea_destekler(self, mn, k8s):
        """Yükseltme yolu için: upstream garantisi YA DA üreticinin (VMware VKr) aynı ikiliyi paketlemesi."""
        return self.antrea_garanti(mn, k8s) or bool(self.antrea_vkr(mn, k8s))

    def antrea_dayanak(self, mn, k8s):
        if self.antrea_garanti(mn, k8s):
            return "upstream garanti"
        v = self.antrea_vkr(mn, k8s)
        return f"VMware VKr {k8s} paketliyor ({', '.join(v)})" if v else "kaynak yok"


class Rapor:
    def __init__(self):
        self.satirlar, self.kotu = [], 0

    def ekle(self, isaret, metin, kaynak=""):
        if isaret == "❌":
            self.kotu += 1
        self.satirlar.append(f"{isaret} {metin}" + (f"  [kaynak: {kaynak}]" if kaynak else ""))

    def bas(self):
        print("\n".join(self.satirlar))


def omur_satiri(rp, ad, om, bugun, kaynak):
    if not om:
        rp.ekle("❓", f"{ad}: ömür verisi yok — hesaplanamadı", kaynak)
        return
    eom, eol = om.get("eom"), om.get("eol")
    if eol and bugun > eol:
        rp.ekle("❌", f"{ad}: destek BİTTİ (EOL {eol}, {(bugun - eol).days} gün önce)", kaynak)
    elif eol and (eol - bugun).days <= YAKIN_GUN:
        rp.ekle("⚠️", f"{ad}: destek sonu yakın — EOL {eol} ({(eol - bugun).days} gün kaldı)"
                + (f"; bakım (EOM) {eom} " + ("bitti" if bugun > eom else "") if eom else ""), kaynak)
    elif eom and bugun > eom:
        rp.ekle("⚠️", f"{ad}: bakım bitti (EOM {eom}) — yalnız kritik düzeltme; EOL {eol} ({(eol - bugun).days} gün)", kaynak)
    elif eom and (eom - bugun).days <= YAKIN_GUN:
        rp.ekle("⚠️", f"{ad}: bakım sonu yakın — EOM {eom} ({(eom - bugun).days} gün), EOL {eol}", kaynak)
    else:
        rp.ekle("✅", f"{ad}: destekte — EOM {eom}, EOL {eol} ({(eol - bugun).days} gün)", kaynak)


def kontrol(v, a, bugun):
    rp = Rapor()
    print(f"== uyum kontrolü · tarih {bugun} · rol {a.rol}")
    k8s = hat(a.rke2) if a.rke2 else None
    r_mn = hat(a.rancher) if a.rancher else None

    if a.rancher:
        son = v.r_yama.get(r_mn)
        if son and surum_t(a.rancher) < surum_t(son):
            rp.ekle("⚠️", f"Rancher {a.rancher}: aynı minor'da en son yama {son} — minor yükseltmeden ÖNCE buna çıkılmalı",
                    "veri/surumler.txt [rancher-yama]; Rancher docs upgrades.md 'Upgrade Path'")
        elif son:
            rp.ekle("✅", f"Rancher {a.rancher}: minor'ın en son yaması", "[rancher-yama]")
        omur_satiri(rp, f"Rancher {r_mn}", v.r_omur.get(r_mn), bugun, "[rancher-omur] suse.com/lifecycle")

    if a.rke2:
        son = v.k_yama.get(k8s)
        if son and surum_t(a.rke2) < surum_t(son):
            rp.ekle("⚠️", f"RKE2 {a.rke2}: hattın en son yaması {son}", "[rke2-yama]")
        elif son:
            rp.ekle("✅", f"RKE2 {a.rke2}: hattın en son yaması", "[rke2-yama]")
        omur_satiri(rp, f"RKE2 {k8s} (SUSE)", v.k_omur.get(k8s), bugun, "[rke2-omur] suse.com/lifecycle")
        ue = v.u_omur.get(k8s)
        if ue:
            durum = f"bitti ({ue})" if bugun > ue else f"{ue} ({(ue - bugun).days} gün)"
            rp.ekle("ℹ️", f"Kubernetes {k8s} upstream topluluk desteği: {durum} — bilgi; RKE2 için SUSE tarihi esas", "[k8s-omur]")

    if a.rancher and a.rke2:
        anahtar, satir, yaklasik = v.matris_satiri(a.rancher)
        if not satir:
            rp.ekle("❓", f"Rancher {a.rancher} matris verisi yok — hesaplanamadı (veriyi güncelle)", "[rancher-matris]")
        else:
            not_ = f" (yaklaşık: {anahtar} satırı)" if yaklasik else ""
            if a.rol == "upstream":
                alt, ust = satir["up"]
                ok = hat_t(alt) <= hat_t(k8s) <= hat_t(ust)
                rp.ekle("✅" if ok else "❌", f"Rancher {a.rancher} ↔ local (upstream) RKE2 {k8s}: aralık v{alt}…v{ust}{not_}", satir["kaynak"])
            else:
                ok = k8s in satir["down"]
                rp.ekle("✅" if ok else "❌", f"Rancher {a.rancher} ↔ downstream RKE2 {k8s}: hatlar {', '.join(satir['down'])}"
                        + ("" if ok else " — SUSE destek listesinde yok (destek kapsamı dışı)") + not_, satir["kaynak"])
            for r in a.rhel:
                ok = r in satir["rhel"]
                rp.ekle("✅" if ok else "❌", f"RHEL {r} ↔ Rancher {a.rancher} (RKE2 için desteklenen RHEL): {'listede' if ok else 'SUSE destek listesinde YOK (destek kapsamı dışı — çalışmaz demek değil)'}{not_}", satir["kaynak"])

    if a.antrea and a.rke2:
        antrea_kontrol(v, a, k8s, rp)

    if getattr(a, "gpu_operator", None):
        gpu_kontrol(v, a, k8s, rp)

    for r in a.rhel:
        ana = r.split(".")[0]
        rh = v.rhel.get(ana)
        if not rh:
            rp.ekle("❓", f"RHEL {r}: veri yok", "[rhel-omur]")
            continue
        if bugun > rh["bakim"]:
            rp.ekle("❌", f"RHEL {ana}: bakım bitti ({rh['bakim']})", "[rhel-omur]")
        if r == rh["son"]:
            rp.ekle("✅", f"RHEL {r}: ana sürümün en son ara sürümü (tam destek {rh['tam']}, bakım {rh['bakim']})", "[rhel-omur]")
        else:
            cift = int(r.split(".")[1]) % 2 == 0 if "." in r else False
            rp.ekle("⚠️", f"RHEL {r}: en son ara sürüm değil ({rh['son']}) — yama yalnız uzatılmış abonelikle"
                    + (" (çift ara sürüm: ELCP/EUS mümkün)" if cift else " (tek ara sürüm: uzatılmış destek YOK)")
                    + " · ara sürüm bitiş tarihi veride yok; makinede doğrula: subscription-manager release --show; dnf updateinfo list --security",
                    "[rhel-omur] access.redhat.com/support/policy/updates/errata")
    rp.bas()
    return rp


def kosul_tutar(kosul, deger):
    """'<2.5', '>=1.33', '2.3', '*' gibi minor koşulu."""
    m = re.fullmatch(r"(<=|>=|<|>|=)?\s*v?(\d+\.\d+)", kosul.strip())
    if kosul.strip() in ("*", ""):
        return True
    if not m:
        return False
    op, h = m.group(1) or "=", hat_t(m.group(2))
    d = hat_t(deger)
    return {"<": d < h, "<=": d <= h, ">": d > h, ">=": d >= h, "=": d == h}[op]


def antrea_kontrol(v, a, k8s, rp):
    """G77 (Alp, 2026-10-21): her kaynak ayrı satır; ❌ yalnız kanıtlı kayıtla. Pencere/matris dışı = ⚠️ 'olabilir'."""
    mn = hat(a.antrea)
    an = v.antrea.get(mn)
    if not an:
        rp.ekle("❓", f"Antrea {a.antrea}: upstream verisi yok — hesaplanamadı (uyumlu/uyumsuz olabilir)", "[antrea]")
    elif v.antrea_garanti(mn, k8s):
        rp.ekle("✅", f"Antrea {a.antrea} ↔ K8s {k8s}: upstream garanti aralığında (v{mn} → {an['alt']}–{an['ust']})",
                "Antrea docs/versioning.md 'Supported K8s versions' + GitHub releases + endoflife.date [antrea]")
    else:
        rp.ekle("⚠️", f"Antrea {a.antrea} ↔ K8s {k8s}: upstream GARANTİ DIŞI (v{mn} çıktığında bakımdaki K8s {an['alt']}–{an['ust']}) "
                f"— resmi metin asgari garanti ('at least'); uyumsuz OLABİLİR, uyumsuzluk kanıtı değil",
                "Antrea docs/versioning.md 'Supported K8s versions' [antrea]")
    vcn = [x for x in v.a_vmware if hat(x["upstream"]) == mn]
    for x in vcn:
        icinde = k8s in x["k8s"]
        rp.ekle("✅" if icinde else "⚠️",
                f"VMware VCN Antrea {x['vcn']} (= upstream {x['upstream']}, {x['tarih']}) matrisi: K8s {x['k8s'][0]}–{x['k8s'][-1]}, "
                f"Rancher {x['rancher']} → K8s {k8s} {'listede' if icinde else 'LİSTEDE YOK'}"
                + (f"; Rancher {hat(a.rancher)} listede yok" if a.rancher and hat(a.rancher) != x['rancher'] else "")
                + " — yalnız VMware imajı (antreainterworking, _vmware) kullanılıyorsa destek beyanı",
                f"Broadcom TechDocs vmware-container-networking-with-antrea-{x['kod']}-release-notes [antrea-vmware]")
    if not vcn:
        rp.ekle("ℹ️", f"VMware VCN: upstream v{mn}'e karşılık gelen sürüm verisi yok", "[antrea-vmware]")
    vkr = v.antrea_vkr(mn, k8s)
    if vkr:
        rp.ekle("✅", f"VMware VKr {k8s}.x aynı ikiliyi paketliyor (Antrea {', '.join(vkr)}) — üretici bu ikiliyi kendi ürününde çalıştırıyor",
                "Broadcom TechDocs vmware-vkr-release-notes [antrea-vkr]")
    elif k8s in v.a_vkr:
        rp.ekle("ℹ️", f"VMware VKr {k8s}.x Antrea {', '.join(v.a_vkr[k8s]['antrea'])} paketliyor (v{mn} değil)", "[antrea-vkr]")
    kotu = False
    for satir in v.a_kayit:
        ak, kk, isaret, kapsam, aciklama, kaynak = (satir + [""] * 6)[:6]
        if kosul_tutar(ak, mn) and kosul_tutar(kk, k8s):
            rp.ekle(isaret, f"Bilinen kayıt ({kapsam}): {aciklama}", kaynak)
            kotu = kotu or isaret == "❌"
    if v.rke2_cni and "antrea" not in v.rke2_cni:
        rp.ekle("ℹ️", f"RKE2'nin paketlediği CNI'lar: {', '.join(v.rke2_cni)} — Antrea değil; SUSE desteği Antrea'yı kapsamaz", "[rke2-cni]")
    if not kotu:
        rp.ekle("ℹ️", f"Antrea {a.antrea} + K8s {k8s}: kanıtlı uyumsuzluk kaydı YOK — olay/arıza sebebi olarak yazılamaz", "[antrea-kayit]")


def gpu_kontrol(v, a, k8s, rp):
    """NVIDIA GPU Operator üretici matrisi (Platform Support). Liste dışı = ⚠️ (doğrulanmamış), ❌ değil."""
    s_ad = "v" + a.gpu_operator.lstrip("v")
    g = v.gpu_op.get(s_ad)
    kaynak = f"docs.nvidia.com/datacenter/cloud-native/gpu-operator/{s_ad.lstrip('v')}/platform-support.html [gpu-operator]"
    if not g:
        rp.ekle("❓", f"GPU Operator {s_ad}: veri yok — hesaplanamadı (veriye ekle: o sürümün Platform Support sayfası)", "[gpu-operator]")
        return
    if k8s:
        ok = hat_t(g["alt"]) <= hat_t(k8s) <= hat_t(g["ust"])
        rp.ekle("✅" if ok else "⚠️", f"GPU Operator {s_ad} ↔ RKE2 {k8s}: NVIDIA doğrulama aralığı {g['alt']}–{g['ust']}"
                + ("" if ok else " — listede yok, destek kapsamı dışı olabilir"), kaynak)
    for r in a.rhel:
        ok = r in g["rhel"]
        rp.ekle("✅" if ok else "⚠️", f"GPU Operator {s_ad} ↔ RHEL {r}: " + ("listede" if ok else f"listede yok ({', '.join(g['rhel'])}) — doğrulanmamış"), kaynak)
    if getattr(a, "surucu", None):
        ok = a.surucu in g["suruculer"]
        rp.ekle("✅" if ok else "⚠️", f"Sürücü {a.surucu} ↔ GPU Operator {s_ad}: "
                + ("desteklenenler listesinde" + (" (varsayılan/önerilen)" if a.surucu == g["varsayilan"] else f"; varsayılan {g['varsayilan']}")
                   if ok else f"listede yok (varsayılan {g['varsayilan']})"), kaynak)


def yol(v, a, bugun):
    """Hedefe adım adım yol. Kurallar: RKE2 minor atlanmaz (K8s skew); Rancher minor geçişi aynı minor'ın son yamasından
    sonrakinin son yamasına (Rancher docs); Antrea K8s'ten önce, tek seferde ≤4 minor; her ara durumda Rancher↔RKE2 uyumlu."""
    if not (a.rancher and a.rke2 and a.antrea and a.hedef_rke2):
        sys.exit("yol için --rancher --rke2 --antrea --hedef-rke2 gerekli")
    rancher, k8s, antrea = "v" + a.rancher.lstrip("v"), hat(a.rke2), hat(a.antrea)
    antrea_ad = "v" + a.antrea.lstrip("v")
    hedef_k8s, hedef_r = hat(a.hedef_rke2), hat(a.hedef_rancher) if a.hedef_rancher else hat(a.rancher)
    print(f"== yükseltme yolu · {bugun} · rol {a.rol}: Rancher {rancher} · RKE2 {a.rke2} · Antrea {a.antrea} → RKE2 {hedef_k8s} · Rancher {hedef_r}")
    adimlar, sorun = [], 0

    def rancher_destekler(r, h):
        _, s, _ = v.matris_satiri(r)
        if not s:
            return None
        if a.rol == "upstream":
            return hat_t(s["up"][0]) <= hat_t(h) <= hat_t(s["up"][1])
        return h in s["down"]

    def rancher_son(mn):
        return v.r_yama.get(mn)

    son = rancher_son(hat(rancher))
    if son and surum_t(rancher) < surum_t(son):
        adimlar.append(f"Rancher {rancher} → {son} (aynı minor'ın son yaması — minor geçişinin ön şartı)")
        rancher = son
    guvenlik = 0
    while (hat_t(k8s) < hat_t(hedef_k8s) or hat_t(hat(rancher)) < hat_t(hedef_r)) and guvenlik < 20:
        guvenlik += 1
        r_mn = hat(rancher)
        sonraki_r = sonraki(r_mn)
        sonraki_r_son = rancher_son(sonraki_r)
        # Önce Rancher: hedefin altındaysa ve yeni minor mevcut RKE2 hattını hâlâ destekliyorsa
        if hat_t(r_mn) < hat_t(hedef_r) and sonraki_r_son and rancher_destekler(sonraki_r_son, k8s):
            adimlar.append(f"Rancher {rancher} → {sonraki_r_son}")
            rancher = sonraki_r_son
            continue
        if hat_t(k8s) < hat_t(hedef_k8s):
            yeni = sonraki(k8s)
            d = rancher_destekler(rancher, yeni)
            if d is False:
                if hat_t(r_mn) < hat_t(hedef_r) and sonraki_r_son and rancher_destekler(sonraki_r_son, k8s) is not False:
                    adimlar.append(f"Rancher {rancher} → {sonraki_r_son}")
                    rancher = sonraki_r_son
                    continue
                adimlar.append(f"❌ Rancher {rancher} RKE2 {yeni}'i desteklemiyor ve hedef Rancher {hedef_r} buna izin vermiyor — hedefi değiştir")
                sorun += 1
                break
            if d is None:
                adimlar.append(f"❓ Rancher {rancher} matris verisi yok — {yeni} adımı doğrulanamadı")
                sorun += 1
            if not v.antrea_destekler(antrea, yeni):
                # Kalan yolu (mevcut..hedef) kapsayan en küçük minor; yoksa mevcut+sonrakini kapsayan
                adaylar = sorted(v.antrea, key=hat_t)
                uygun = [m for m in adaylar if hat_t(m) > hat_t(antrea) and hat_t(m)[1] - hat_t(antrea)[1] <= ANTREA_ATLAMA
                         and v.antrea_destekler(m, k8s)]
                kapsayan = [m for m in uygun if v.antrea_destekler(m, hedef_k8s)]
                secim = (kapsayan or [m for m in uygun if v.antrea_destekler(m, yeni)] or [None])[0]
                if not secim:
                    adimlar.append(f"❌ RKE2 {k8s}→{yeni} için hem {k8s} hem {yeni}'i destekleyen Antrea (≤{ANTREA_ATLAMA} minor atlama) yok")
                    sorun += 1
                    break
                adimlar.append(f"Antrea {antrea_ad} → {v.antrea[secim]['yama']} ({k8s}: {v.antrea_dayanak(secim, k8s)}; "
                               f"{yeni}: {v.antrea_dayanak(secim, yeni)}; önce controller sonra agent, node node)")
                antrea, antrea_ad = secim, v.antrea[secim]["yama"]
            hedef_yama = v.k_yama.get(yeni, f"v{yeni}.x (veri yok)")
            adimlar.append(f"RKE2 {k8s} → {hedef_yama} (önce etcd snapshot; server'lar tek tek, sonra agent'lar)")
            k8s = yeni
            continue
        if hat_t(r_mn) < hat_t(hedef_r):
            adimlar.append(f"❌ Rancher {sonraki_r} RKE2 {k8s}'i desteklemiyor ya da verisi yok — önce RKE2'yi yükselt ya da veriyi güncelle")
            sorun += 1
            break
    for i, s in enumerate(adimlar, 1):
        print(f"{i}. {s}")
    if not adimlar:
        print("Adım yok — zaten hedefte.")
    print("-- son durum")
    son_a = argparse.Namespace(rancher=rancher, rke2=v.k_yama.get(k8s, k8s), antrea=v.antrea[antrea]["yama"], rhel=a.rhel, rol=a.rol)
    rp = kontrol(v, son_a, bugun)
    if a.rol == "downstream":
        _, s, _ = v.matris_satiri(rancher)
        if s:
            print(f"ℹ️ Rancher {rancher} kendi local kümesinin v{s['up'][0]}…v{s['up'][1]} aralığında olmasını ister — local için ayrıca: --rol upstream")
    return sorun + rp.kotu


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("islem", choices=["kontrol", "yol", "veri"])
    p.add_argument("--rancher")
    p.add_argument("--rke2", help="ör. v1.33.13+rke2r1")
    p.add_argument("--antrea", help="ör. v2.3.0")
    p.add_argument("--gpu-operator", help="ör. v25.3.4 (NVIDIA GPU Operator)")
    p.add_argument("--surucu", help="ör. 580.82.07 (GPU sürücüsü, --gpu-operator ile)")
    p.add_argument("--rhel", default="", help="virgüllü: 9.2,9.4,9.8")
    p.add_argument("--rol", choices=["downstream", "upstream"], default="downstream", help="upstream = Rancher'ın kendi local kümesi")
    p.add_argument("--hedef-rke2")
    p.add_argument("--hedef-rancher")
    p.add_argument("--tarih", help="YYYY-AA-GG (varsayılan bugün)")
    a = p.parse_args()
    a.rhel = [r.strip() for r in a.rhel.split(",") if r.strip()]
    d, kaynak = veri_oku()
    if a.islem == "veri":
        for b, k in kaynak.items():
            print(f"[{b}] " + (k[0] if k else ""))
        return 0
    try:
        v = Veri(d)
        bugun = dt.date.fromisoformat(a.tarih) if a.tarih else dt.date.today()
        if a.islem == "kontrol":
            return 1 if kontrol(v, a, bugun).kotu else 0
        return 1 if yol(v, a, bugun) else 0
    except (ValueError, KeyError) as e:
        print(f"hata: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
