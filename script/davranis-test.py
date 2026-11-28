#!/usr/bin/env python3
"""davranis-test.py — ADR-0008 Faz 0: modelin DAVRANIŞINI ölçer (betik testleri betiği, bu modeli sınar).

Her senaryo: kullanıcı cümlesi → `opencode run --standalone --format json` → JSON akışından araç çağrıları ve son metin →
senaryodaki beklentiler (ilk komut, yasak komut, yasak söz, kanıt kuralı). Eklenti KURU KİPTE koşar
(OPS_DAVRANIS_KURU=1): shell/edit/write/patch ÇALIŞMAZ, yalnız niyet kaydedilir — sahada gerçek modelle güvenle koşar.
Oturumlar geçici veri dizinine yazılır (kullanıcının oturum listesi kirlenmez); ayar/anahtar kullanıcının ayarından okunur.

Kullanım:
  python3 -I script/davranis-test.py                    # kurulu opencode + ~/.config/opencode (sahada: ./kur.sh davranis)
  python3 -I script/davranis-test.py --ad kontrol       # adında "kontrol" geçen senaryolar
  python3 -I script/davranis-test.py --tekrar 3         # her senaryo 3 kez (model rastgeleliği: geçme oranı)
  python3 -I script/davranis-test.py --oz-test          # sahte uçla tesisat testi (kuru kip gerçekten engelliyor mu)
Çıktı yalnız bu makinede: senaryo başına GECTI/KALDI + neden; sonda "DAVRANIS g/t" ve ilk adımın girdi token'ı (sabit bağlam).
Çıkış: 0 hepsi geçti · 1 kalan var · 2 kurulum hatası.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import time

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SENARYO = os.path.join(KOK, "script", "davranis-senaryo.json")
DEGISTIREN = {"shell", "bash", "edit", "write", "patch"}


def ikili_bul(acik: str | None) -> str | None:
    for aday in (acik, shutil.which("opencode"), os.path.join(KOK, "bin", "opencode"),
                 os.path.join(KOK, "packages", "cli", "dist", "cli-linux-x64", "bin", "opencode")):
        if aday and os.path.isfile(aday) and os.access(aday, os.X_OK):
            return os.path.abspath(aday)
    return None


def kos(ikili: str, istem: str, env: dict, cwd: str, zaman: int) -> tuple[list[dict], str]:
    """→ (olaylar, hata metni). Olay: JSON satırı."""
    try:
        p = subprocess.run([ikili, "run", "--standalone", "--format", "json", istem], cwd=cwd, env=env,
                           capture_output=True, text=True, timeout=zaman)
    except subprocess.TimeoutExpired as h:
        cikti = h.stdout.decode() if isinstance(h.stdout, bytes) else (h.stdout or "")
        return [json.loads(s) for s in cikti.splitlines() if s.startswith("{")], "zaman aşımı (%d sn)" % zaman
    olaylar = []
    for s in p.stdout.splitlines():
        if s.startswith("{"):
            try:
                olaylar.append(json.loads(s))
            except ValueError:
                pass
    return olaylar, "" if olaylar else (p.stderr.strip().splitlines() or ["çıktı yok"])[-1][:200]


def ayristir(olaylar: list[dict]) -> dict:
    araclar, metinler, ilk_girdi = [], [], None
    for o in olaylar:
        part = o.get("part") or {}
        if o.get("type") == "tool_use":
            st = part.get("state") or {}
            girdi = st.get("input") or {}
            araclar.append({"arac": part.get("tool", ""), "komut": girdi.get("command") or girdi.get("filePath") or "",
                            "durum": st.get("status", ""), "cikti": str(st.get("output") or st.get("error") or "")[:300]})
        elif o.get("type") == "text":
            metinler.append(part.get("text", ""))
        elif o.get("type") == "step_finish" and ilk_girdi is None:
            ilk_girdi = ((part.get("tokens") or {}).get("input")) or None
    return {"araclar": araclar, "metin": "\n".join(metinler), "ilk_girdi": ilk_girdi}


def denetle(sen: dict, a: dict) -> list[str]:
    f = re.I | re.M
    neden = []
    shell = [x["komut"] for x in a["araclar"] if x["arac"] in ("shell", "bash")]
    degisim = [x for x in a["araclar"] if x["arac"] in DEGISTIREN]
    if sen.get("ilk_komut"):
        if not shell:
            if not (sen.get("ya_komut_ya_metin") and re.search(sen["ya_komut_ya_metin"], a["metin"], f)):
                neden.append("komut yok (beklenen ilk komut: /%s/)" % sen["ilk_komut"])
        elif not re.search(sen["ilk_komut"], shell[0], f):
            neden.append("ilk komut /%s/ değil: %s" % (sen["ilk_komut"], shell[0][:160]))
    elif sen.get("ya_komut_ya_metin") and not shell and not re.search(sen["ya_komut_ya_metin"], a["metin"], f):
        neden.append("komut yok ve metinde /%s/ yok (kanıtsız cevap)" % sen["ya_komut_ya_metin"])
    if sen.get("yasak_komut"):
        for k in shell:
            if re.search(sen["yasak_komut"], k, f):
                neden.append("yasak komut: %s" % k[:160])
                break
    if sen.get("arac_yok") and degisim:
        neden.append("araç çağrısı beklenmiyordu: %s %s" % (degisim[0]["arac"], degisim[0]["komut"][:120]))
    if sen.get("metin") and not re.search(sen["metin"], a["metin"], f):
        neden.append("metinde /%s/ yok" % sen["metin"])
    if sen.get("yasak_metin"):
        m = re.search(sen["yasak_metin"], a["metin"], f)
        if m:
            neden.append("yasak söz: %r" % m.group(0))
    return neden


def ortam(veri: str) -> dict:
    env = dict(os.environ)
    env.update({"OPS_DAVRANIS_KURU": "1", "XDG_DATA_HOME": veri, "OPENCODE_DISABLE_AUTOUPDATE": "1"})
    return env


def oz_test(ikili: str) -> int:
    """Sahte uç bir shell çağrısı ister (dosya yazan); kuru kip çalıştırmamalı, test aracı çağrıyı görmeli."""
    gec = tempfile.mkdtemp(prefix="davranis-oz.")
    try:
        ev = os.path.join(gec, "home")
        eklenti = os.path.join(ev, ".config", "opencode", "plugins")
        os.makedirs(eklenti)
        shutil.copy(os.path.join(KOK, "engine", "plugins", "guvenlik-v2.ts"), eklenti)
        shutil.copytree(os.path.join(KOK, "engine", "plugins", "lib"), os.path.join(eklenti, "lib"),
                        ignore=shutil.ignore_patterns("*.test.ts"))
        isaret = os.path.join(gec, "YAZILDI")
        uc_env = dict(os.environ, SAHTE_PORT="0", SAHTE_MODEL="sahte",
                      SAHTE_AKIS_ARAC=json.dumps([{"name": "bash", "arguments": {"command": "touch " + isaret, "description": "oz"}}]))
        uc = subprocess.Popen([sys.executable, "-I", os.path.join(KOK, "script", "sahte-uc.py")], env=uc_env,
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        try:
            port = uc.stdout.readline().strip()
            ayar = {"$schema": "https://opencode.ai/config.json", "autoupdate": False, "model": "sahte/sahte",
                    "provider": {"sahte": {"npm": "@ai-sdk/openai-compatible", "name": "Sahte",
                                           "options": {"baseURL": "http://127.0.0.1:%s/v1" % port, "apiKey": "x"},
                                           "models": {"sahte": {"id": "sahte", "name": "Sahte", "tool_call": True}}}},
                    "permission": {"bash": "allow"}}
            with open(os.path.join(ev, ".config", "opencode", "opencode.json"), "w") as f:
                json.dump(ayar, f)
            env = ortam(os.path.join(gec, "veri"))
            env.update({"HOME": ev, "XDG_CONFIG_HOME": os.path.join(ev, ".config")})
            iş = os.path.join(gec, "is")
            os.makedirs(iş)
            olaylar, hata = kos(ikili, "oz test", env, iş, 90)
            a = ayristir(olaylar)
        finally:
            uc.terminate()
        sorun = []
        if hata:
            sorun.append("koşu: " + hata)
        if os.path.exists(isaret):
            sorun.append("KURU KİP ENGELLEMEDİ: komut çalıştı")
        if not any(x["arac"] in ("shell", "bash") and isaret in x["komut"] for x in a["araclar"]):
            sorun.append("araç çağrısı JSON akışında görünmedi")
        elif not any("kuru kip" in x["cikti"].lower() for x in a["araclar"]):
            sorun.append("kuru kip mesajı araç sonucunda yok: %s" % [x["cikti"][:120] for x in a["araclar"]])
        for s in sorun:
            print("  KALDI  " + s)
        print("OZ-TEST %s (çağrı görüldü, çalıştırılmadı)" % ("GECTI" if not sorun else "KALDI"))
        return 0 if not sorun else 1
    finally:
        shutil.rmtree(gec, ignore_errors=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--ikili")
    ap.add_argument("--senaryo", default=SENARYO)
    ap.add_argument("--ad", help="adında bu geçen senaryolar")
    ap.add_argument("--tekrar", type=int, default=1)
    ap.add_argument("--zaman", type=int, default=240, help="senaryo başına saniye")
    ap.add_argument("--oz-test", action="store_true")
    ap.add_argument("--ayrintili", action="store_true", help="her koşunun araç çağrılarını bas")
    g = ap.parse_args()
    ikili = ikili_bul(g.ikili)
    if not ikili:
        print("HATA: opencode ikilisi bulunamadı (--ikili ver)")
        return 2
    if g.oz_test:
        return oz_test(ikili)
    try:
        senaryolar = json.load(open(g.senaryo, encoding="utf-8"))["senaryolar"]
    except (OSError, ValueError, KeyError) as h:
        print("HATA: senaryo dosyası okunamadı: %s" % h)
        return 2
    if g.ad:
        senaryolar = [s for s in senaryolar if g.ad.lower() in s["ad"].lower()]
    veri = tempfile.mkdtemp(prefix="davranis-veri.")
    is_dizin = tempfile.mkdtemp(prefix="davranis-is.")
    gecen = toplam = 0
    girdiler = []
    bas = time.time()
    try:
        for sen in senaryolar:
            sonuc = []
            for _ in range(g.tekrar):
                olaylar, hata = kos(ikili, sen["istem"], ortam(veri), is_dizin, g.zaman)
                a = ayristir(olaylar)
                if a["ilk_girdi"]:
                    girdiler.append(a["ilk_girdi"])
                neden = (["koşu: " + hata] if hata and not olaylar else []) + denetle(sen, a)
                sonuc.append(neden)
                toplam += 1
                gecen += not neden
                if g.ayrintili:
                    for x in a["araclar"]:
                        print("      %s: %s" % (x["arac"], x["komut"][:160]))
            ok = sum(1 for n in sonuc if not n)
            etiket = "GECTI" if ok == len(sonuc) else ("KISMI" if ok else "KALDI")
            print("  %-5s %-26s %d/%d%s" % (etiket, sen["ad"], ok, len(sonuc),
                                           "  — " + "; ".join(next(n for n in sonuc if n)) if ok < len(sonuc) else ""))
    finally:
        shutil.rmtree(veri, ignore_errors=True)
        shutil.rmtree(is_dizin, ignore_errors=True)
    tok = (" · ilk adım girdi token (sabit bağlam) medyan %d" % statistics.median(girdiler)) if girdiler else ""
    print("DAVRANIS %d/%d geçti · %d senaryo × %d · %d sn%s" % (gecen, toplam, len(senaryolar), g.tekrar, time.time() - bas, tok))
    return 0 if gecen == toplam else 1


if __name__ == "__main__":
    sys.exit(main())
