#!/usr/bin/env python3
# leapp-rapor.py — `leapp preupgrade` raporunu (/var/log/leapp/leapp-report.json) özetler: ENGEL (inhibitor) önce, sonra
# önem derecesine göre (high → medium → low → info); her bulguda başlık, özet ve çözüm (ipucu / komut / playbook).
# Birden çok sunucu: dosya başına bir rapor (ad = dosya adı ya da `#SUNUCU <ad>` satırı). Yalnız okur.
# Neden: rapor uzun (yüzlerce satır) ve model ENGEL'i "uyarı" sanıp atlayabilir; karar betikte — ENGEL varsa çıkış 1.
# Şema (leapp kaynağı, oamg/leapp `leapp/reporting/__init__.py` + `leapp/utils/report.py`, 2026-10-25):
#   {"entries": [{"title", "summary", "severity": info|low|medium|high, "groups": [..."inhibitor"...], "flags": [...] (eski),
#                 "detail": {"remediations": [{"type": "hint"|"command"|"playbook", "context": ...}]}}], "leapp_run_id": ...}
#
# kullanım:
#   leapp-rapor.py leapp-report.json [...]                         (yerel dosyalar)
#   ssh root@<h> cat /var/log/leapp/leapp-report.json | leapp-rapor.py - --ad <h>
#   for h in a b; do echo "#SUNUCU $h"; ssh root@$h cat /var/log/leapp/leapp-report.json; done | leapp-rapor.py -
#   --kisa : bulgu başına tek satır (çözüm basılmaz) · --hepsi : info düzeyini de bas (varsayılan: info yalnız sayılır)
import json
import sys

SIRA = {"high": 0, "medium": 1, "low": 2, "info": 3}


def engel_mi(e):
    return "inhibitor" in (e.get("groups") or []) or "inhibitor" in (e.get("flags") or [])


def cozumler(e):
    out = []
    for r in ((e.get("detail") or {}).get("remediations") or []):
        t, c = r.get("type", "?"), r.get("context", "")
        if isinstance(c, list):
            c = " ".join(str(x) for x in c)
        out.append("%s: %s" % ({"hint": "ipucu", "command": "komut", "playbook": "playbook"}.get(t, t), str(c).strip()))
    return out


def raporlari_oku(argv, ad):
    raporlar = []
    for a in argv:
        metin = sys.stdin.read() if a == "-" else open(a, encoding="utf-8", errors="replace").read()
        if "#SUNUCU " in metin:
            parca, isim = [], None
            for s in metin.splitlines():
                if s.startswith("#SUNUCU "):
                    if isim is not None:
                        raporlar.append((isim, "\n".join(parca)))
                    isim, parca = s[8:].strip(), []
                else:
                    parca.append(s)
            if isim is not None:
                raporlar.append((isim, "\n".join(parca)))
        else:
            raporlar.append((ad or ("stdin" if a == "-" else a), metin))
    return raporlar


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import json")[0])
        return 0 if argv else 2
    ad = argv[argv.index("--ad") + 1] if "--ad" in argv else None
    kisa, hepsi = "--kisa" in argv, "--hepsi" in argv
    yollar = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] != "--ad")]
    toplam_engel = 0
    ozet = []
    for isim, metin in raporlari_oku(yollar, ad):
        try:
            veri = json.loads(metin)
        except ValueError:
            print("\n== %s · ❌ JSON okunamadı (rapor yok/kesik? preupgrade çalıştı mı?)" % isim)
            ozet.append((isim, None, None))
            continue
        girdiler = veri.get("entries") or []
        engeller = [e for e in girdiler if engel_mi(e)]
        digerleri = sorted((e for e in girdiler if not engel_mi(e)), key=lambda e: SIRA.get(e.get("severity"), 9))
        sayac = {}
        for e in digerleri:
            sayac[e.get("severity", "?")] = sayac.get(e.get("severity", "?"), 0) + 1
        toplam_engel += len(engeller)
        ozet.append((isim, len(engeller), sayac))
        print("\n== %s · %d bulgu · ENGEL %d · high %d · medium %d · low %d · info %d" % (
            isim, len(girdiler), len(engeller), sayac.get("high", 0), sayac.get("medium", 0), sayac.get("low", 0), sayac.get("info", 0)))
        for e in engeller + [e for e in digerleri if hepsi or e.get("severity") != "info"]:
            etiket = "⛔ ENGEL" if engel_mi(e) else {"high": "⚠ high", "medium": "• medium", "low": "· low"}.get(e.get("severity"), e.get("severity", "?"))
            print("  %s · %s" % (etiket, (e.get("title") or "?").strip()))
            if kisa:
                continue
            ozet_metni = " ".join((e.get("summary") or "").split())
            if ozet_metni:
                print("      özet: %s%s" % (ozet_metni[:400], "…" if len(ozet_metni) > 400 else ""))
            for c in cozumler(e):
                print("      %s" % c[:400])
    if len(ozet) > 1:
        print("\n== Sunucu özeti (ENGEL çok olan üstte)")
        for isim, n, s in sorted(ozet, key=lambda x: -(x[1] if x[1] is not None else 10 ** 6)):
            print("  %-30s %s" % (isim, "❌ rapor okunamadı" if n is None else
                                   ("⛔ ENGEL %d" % n if n else "✓ engel yok") + " · high %d" % s.get("high", 0)))
    print("\nKarar: %s" % ("⛔ %d ENGEL var — çözülmeden `leapp upgrade` çalışmaz (RH)" % toplam_engel if toplam_engel
                           else "engel yok — yine de high/medium bulguları oku; rapor her sorunu yakalamaz (RH)"))
    return 1 if toplam_engel or any(n is None for _, n, _ in ozet) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
