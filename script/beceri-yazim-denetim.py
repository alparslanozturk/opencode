#!/usr/bin/env python3
"""Beceri yazım denetimi — approved/ becerileri biçim kurallarına ve deponun maskeleme kuralına uyuyor mu.

Kullanım: python3 script/beceri-yazim-denetim.py [depo kökü]      (çıkış 0 = HATA yok)
Yalnız okur. Kurallar ve kaynakları:
  - name: dizin adıyla aynı, 1-64 karakter, a-z 0-9 tire, tire ile başlamaz/bitmez, çift tire yok   (agentskills.io/specification)
  - description: 1-1024 karakter, XML etiketi yok                                                    (agentskills.io/specification;
    platform.claude.com/docs → agent-skills/best-practices "no XML tags")
  - SKILL.md gövdesi 500 satırın altında                                                             (aynı iki kaynak)
  - SKILL.md'nin andığı beceri dosyası (approved/<beceri>/<dosya>, $B/<dosya>) yerinde                (kırık yönlendirme = saha hatası)
  - her beceri engine/AGENTS.md "İş haritası"nda geçer                                               (Alp 2026-11-03: yönlendirme haritadan)
  - maskeleme: iç IP ve kurum alan adı yazılmaz (knowledge/operations-notes/README.md, Alp 2026-10-14; depo GitHub'da public)
  - beceri dizinindeki ek .md dosyası (SKILL.md'den taşınan ayrıntı) SKILL.md'de adıyla anılır; maskeleme ona da uygulanır
    (Alp 2026-11-11: büyük beceriler bölündü — anılmayan ek dosyayı model açmaz)
  - her beceride "Önce sor" bölümü (## / ### başlık ya da kalın satır)                                (düstur, Alp 2026-11-03; 2026-11-11'de
    46/46 tamamlandı → zorunlu; "güvenlik önemli, kararları insan alacak")
BİLGİ satırı testi düşürmez: gövdesi büyük beceriler (öneri < 5000 token ≈ 20 bin karakter).
"""
import os
import re
import sys

KOK = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ONAYLI = os.path.join(KOK, "knowledge", "skills", "approved")

# Maskeleme: örnek olarak yazılabilen bloklar (RFC 5737 belge blokları, depo örnek kuralı 10.0.x, K8s/RKE2 varsayılan pod/servis
# CIDR'leri, podman/docker varsayılanları, loopback). Bunların dışındaki RFC 1918 adresi "gerçek iç IP" sayılır.
IP_SERBEST = re.compile(r"^(10\.0\.|10\.42\.|10\.43\.|10\.88\.|10\.89\.|10\.96\.|172\.17\.|192\.168\.(0|1|122)\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)")
IP_OZEL = re.compile(r"(?<![\d.])((?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)(?:\.\d{1,3}){2,3})(?![\d])")
ALAN = re.compile(r"(?<![\w<>-])([a-z0-9][a-z0-9-]*)\.(local|corp|lan|intra)\b", re.I)
ALAN_SERBEST = {
    "ornek", "kurum", "ic", "dmz", "test", "example", "cluster", "svc", "env", "opencode", "node", "production",
    "development", "usr", "share", "localhost", "site", "sirket", "alan", "idm", "ad", "ipa", "lab", "rke2", "rancher",
}


def oku(yol):
    with open(yol, encoding="utf-8") as f:
        return f.read()


def on_madde(metin):
    m = re.match(r"---\n(.*?)\n---\n", metin, re.S)
    if not m:
        return None, metin
    alan = {}
    for satir in m.group(1).split("\n"):
        e = re.match(r"([A-Za-z_-]+):\s*(.*)$", satir)
        if e:
            alan[e.group(1)] = e.group(2).strip()
    return alan, metin[m.end():]


def maske_tara(yol, metin, hata):
    kisa = os.path.relpath(yol, KOK)
    for no, satir in enumerate(metin.split("\n"), 1):
        for ip in IP_OZEL.findall(satir):
            if ip.count(".") == 3 and not IP_SERBEST.match(ip):
                hata.append("%s:%d iç IP maskelenmemiş: %s  (yer tutucu <ip-…> ya da örnek blok 10.0.x)" % (kisa, no, ip))
        for ad, son in ALAN.findall(satir):
            if ad.lower() not in ALAN_SERBEST:
                hata.append("%s:%d alan adı maskelenmemiş olabilir: %s.%s  (yer tutucu <kurum>.local; genel adsa ALAN_SERBEST'e ekle)" % (kisa, no, ad, son))


def main():
    hata, bilgi_buyuk = [], []
    harita = ""
    ajan = os.path.join(KOK, "engine", "AGENTS.md")
    if os.path.isfile(ajan):
        t = oku(ajan)
        if "## İş haritası" in t:
            harita = t.split("## İş haritası", 1)[1].split("\n## ", 1)[0]
    beceriler = sorted(d for d in os.listdir(ONAYLI) if os.path.isfile(os.path.join(ONAYLI, d, "SKILL.md")))
    for b in beceriler:
        yol = os.path.join(ONAYLI, b, "SKILL.md")
        metin = oku(yol)
        alan, govde = on_madde(metin)
        if alan is None:
            hata.append("%s: frontmatter (--- … ---) yok" % b)
            continue
        ad = alan.get("name", "")
        if ad != b:
            hata.append("%s: name '%s' dizin adıyla aynı değil" % (b, ad))
        if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", ad) or len(ad) > 64:
            hata.append("%s: name biçimi (1-64, a-z 0-9 tek tire)" % b)
        ack = alan.get("description", "")
        if not ack:
            hata.append("%s: description boş (opencode açıklamasız beceriyi modele göstermez)" % b)
        if len(ack) > 1024:
            hata.append("%s: description %d karakter > 1024" % (b, len(ack)))
        if re.search(r"<[A-Za-z/][^>]*>", ack):
            hata.append("%s: description içinde <…> etiketi var (liste modele XML içinde verilir)" % b)
        satir = len(govde.split("\n"))
        if satir >= 500:
            hata.append("%s: gövde %d satır ≥ 500 — ayrıntıyı aynı dizinde ek dosyaya taşı" % (b, satir))
        if len(govde) > 20000:
            bilgi_buyuk.append("%s (%d bin karakter)" % (b, len(govde) // 1000))
        if not re.search(r"(?im)^(#{2,3} .*|\*\*)(önce sor|sorulacak)", govde):
            hata.append('%s: "Önce sor" bölümü yok (başlık "## Önce sor …" — kullanıcıdan gelmesi gereken 3-5 soru + "Sorma:" satırı)' % b)
        # anılan beceri dosyaları: approved/<beceri>/<dosya> ve bu becerinin $B/<dosya>'sı
        for hedef, dosya in re.findall(r"approved/([a-z0-9-]+)/([A-Za-z0-9_.-]+\.(?:py|sh|md|json|ini|txt|ya?ml))", metin):
            if not os.path.isfile(os.path.join(ONAYLI, hedef, dosya)):
                hata.append("%s: anılan dosya yok: approved/%s/%s" % (b, hedef, dosya))
        if re.search(r"(?m)^\s*B=\S*approved/%s\s*$" % re.escape(b), metin):
            for dosya in set(re.findall(r"\$B/([A-Za-z0-9_.-]+\.(?:py|sh|md|json|ini|txt|ya?ml))", metin)):
                if not os.path.isfile(os.path.join(ONAYLI, b, dosya)):
                    hata.append("%s: anılan dosya yok: $B/%s" % (b, dosya))
        if harita and not re.search(r"`%s`" % re.escape(b), harita):
            hata.append("%s: engine/AGENTS.md iş haritasında geçmiyor (model yönlendirmeyi haritadan yapar)" % b)
        maske_tara(yol, metin, hata)
        # ek dosyalar (SKILL.md'den taşınan ayrıntı): SKILL.md'de adıyla anılmalı (anılmayan dosyayı model hiç açmaz), maskeleme aynı
        for ek in sorted(f for f in os.listdir(os.path.join(ONAYLI, b)) if f.endswith(".md") and f != "SKILL.md"):
            if ek not in metin:
                hata.append("%s: ek dosya %s SKILL.md'de anılmıyor (tam yoluyla ve ne zaman okunacağıyla yaz)" % (b, ek))
            ek_yol = os.path.join(ONAYLI, b, ek)
            maske_tara(ek_yol, oku(ek_yol), hata)
    # maskeleme: saha notları, şablonlar, politika (depo public)
    for alt in (("knowledge", "operations-notes"), ("knowledge", "templates"), ("knowledge", "policy"), ("knowledge", "incidents")):
        d = os.path.join(KOK, *alt)
        if not os.path.isdir(d):
            continue
        for kok, _, dosyalar in os.walk(d):
            for f in dosyalar:
                if f.endswith((".md", ".txt", ".ini")):
                    y = os.path.join(kok, f)
                    maske_tara(y, oku(y), hata)
    for h in hata:
        print("HATA " + h)
    print("BECERI=%d HATA=%d" % (len(beceriler), len(hata)))
    if bilgi_buyuk:
        print("BİLGİ gövdesi büyük (öneri < 20 bin karakter; bölünmeye aday): " + ", ".join(bilgi_buyuk))
    return 1 if hata else 0


if __name__ == "__main__":
    sys.exit(main())
