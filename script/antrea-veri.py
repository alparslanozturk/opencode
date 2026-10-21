#!/usr/bin/env python3
"""script/antrea-veri.py — Antrea ↔ Kubernetes GARANTİ penceresini resmi kaynaklardan üretir (saha G77).

İnternetli makinede çalışır; sahaya veri dosyası ve SKILL.md tablosu olarak gider (al.sh → ./kur.sh).

Kural (Antrea docs/versioning.md "Supported K8s versions", aynen):
  "Each Antrea minor release should support maintained K8s releases at the time of release
   (3 up to K8s 1.19, 4 after that). ... we guarantee that 0.10 supports at least 1.19, 1.18 and 1.17
   (in practice it also supports K8s 1.16)."
→ Pencere = Antrea minor'ın İLK sürümünün (x.y.0) yayın günü bakımı sürmekte olan K8s minor'ları
  (endoflife.date: releaseDate ≤ gün ≤ eol). Bu bir ASGARİ GARANTİDİR: pencere dışı "desteklenmiyor" değil,
  "garanti yok" demektir (uyum.py ⚠️). Uyumsuzluk iddiası yalnız [antrea-kayit] bölümündeki kaynaklı kayıtla.

Kaynaklar: api.github.com/repos/antrea-io/antrea/releases (yayın günü, en son yama) ·
           endoflife.date/api/kubernetes.json (K8s çıkış/EOL).
Kullanım:  python3 script/antrea-veri.py           (veri dosyası + SKILL.md günceller)
           python3 script/antrea-veri.py --kuru    (yalnız ekrana basar)
"""
import datetime
import json
import re
import sys
import urllib.request
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
BECERI = KOK / "knowledge/skills/approved/surum-uyum"
VERI = BECERI / "veri/surumler.txt"
SKILL = BECERI / "SKILL.md"
EN_ESKI = (2, 0)


def getir(url):
    istek = urllib.request.Request(url, headers={"User-Agent": "antrea-veri", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(istek, timeout=30) as yanit:
        return json.load(yanit)


def surum(t):
    m = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)", t)
    return tuple(map(int, m.groups())) if m else None


def main():
    kuru = "--kuru" in sys.argv
    surumler = []
    for sayfa in range(1, 6):
        parca = getir(f"https://api.github.com/repos/antrea-io/antrea/releases?per_page=100&page={sayfa}")
        surumler += [(surum(r["tag_name"]), r["tag_name"], r["published_at"][:10]) for r in parca
                     if not r.get("prerelease") and not r.get("draft") and surum(r["tag_name"])]
        if len(parca) < 100:
            break
    k8s = [r for r in getir("https://endoflife.date/api/kubernetes.json")
           if isinstance(r.get("releaseDate"), str) and isinstance(r.get("eol"), str)]

    minorlar = sorted({s[:2] for s, _, _ in surumler if s[:2] >= EN_ESKI})
    satirlar = []
    for mn in minorlar:
        ilk = [x for x in surumler if x[0] == (*mn, 0)]
        if not ilk:
            continue
        gun = ilk[0][2]
        son = max((x for x in surumler if x[0][:2] == mn), key=lambda x: x[0])[1]
        bakimda = sorted((r["cycle"] for r in k8s if r["releaseDate"] <= gun <= r["eol"]),
                         key=lambda c: tuple(map(int, c.split("."))))
        if not bakimda:
            continue
        satirlar.append((f"{mn[0]}.{mn[1]}", son, gun, bakimda[0], bakimda[-1], len(bakimda)))

    bugun = datetime.date.today().isoformat()
    veri_blok = [
        "[antrea]",
        f"# Antrea minor → GARANTİLİ K8s (asgari): x.y.0 yayın günü bakımdaki K8s minor'ları. Üretim {bugun}: script/antrea-veri.py.",
        "# Kural: github.com/antrea-io/antrea docs/versioning.md \"Supported K8s versions\" ('guarantee … supports at least').",
        "# Kaynak: api.github.com/repos/antrea-io/antrea/releases (CIKIS = x.y.0 published_at) · endoflife.date/api/kubernetes.json.",
        "# Pencere dışı = garanti yok (⚠️ olabilir), uyumsuz DEĞİL. Kanıtlı uyumsuzluk yalnız [antrea-kayit].",
        "# MINOR  EN_SON_YAMA  CIKIS       K8S_ALT  K8S_UST",
        *[f"{m}  {y}  {g}  {a}  {u}" for m, y, g, a, u, _ in satirlar],
    ]
    tablo = [
        "<!-- VERI-ANTREA:BASLA — script/antrea-veri.py üretir, ELLE DÜZENLEME -->",
        f"**Antrea → GARANTİLİ Kubernetes** (üretim {bugun}). Kural: Antrea `docs/versioning.md` \"Supported K8s versions\" —",
        "her minor, **çıktığı gün bakımı süren** K8s minor'larını *en azından* destekler (\"guarantee … at least\"; \"in practice it",
        "also supports\" daha eskileri). Çıkış günü: GitHub release `x.y.0`; K8s bakım tarihleri: endoflife.date. Pencere dışı =",
        "**garanti yok → \"uyumsuz olabilir\"**, \"desteklenmiyor\" değil.",
        "",
        "| Antrea | En son yama | x.y.0 çıkışı | Garantili K8s | Bakımdaki K8s sayısı |",
        "|---|---|---|---|---|",
        *[f"| v{m} | {y} | {g} | {a} – {u} | {n} |" for m, y, g, a, u, n in satirlar],
        "<!-- VERI-ANTREA:BITIS -->",
    ]
    if kuru:
        print("\n".join(veri_blok + [""] + tablo))
        return

    metin = VERI.read_text(encoding="utf-8")
    yeni = re.sub(r"\[antrea\]\n.*?(?=\n\[)", lambda _: "\n".join(veri_blok) + "\n", metin, count=1, flags=re.S)
    if yeni == metin and "[antrea]" not in metin:
        sys.exit("!! surumler.txt içinde [antrea] bölümü yok")
    VERI.write_text(yeni, encoding="utf-8")
    sk = SKILL.read_text(encoding="utf-8")
    if "<!-- VERI-ANTREA:BASLA" not in sk:
        sys.exit("!! SKILL.md içinde <!-- VERI-ANTREA:BASLA --> … <!-- VERI-ANTREA:BITIS --> yok")
    SKILL.write_text(re.sub(r"<!-- VERI-ANTREA:BASLA.*?<!-- VERI-ANTREA:BITIS -->", lambda _: "\n".join(tablo), sk,
                            flags=re.S), encoding="utf-8")
    print(f"güncellendi: {len(satirlar)} Antrea minor → {VERI.relative_to(KOK)}, {SKILL.relative_to(KOK)}")


if __name__ == "__main__":
    main()
