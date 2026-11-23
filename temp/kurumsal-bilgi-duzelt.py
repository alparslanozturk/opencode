#!/usr/bin/env python3
# kurumsal-bilgi-duzelt.py — TEK SEFERLİK (Doktor, 2026-11-23; Alp'in 2026-11-23 cevapları). Model değil, bu betik düzeltir.
#
#   python3 /root/ai/opencode/temp/kurumsal-bilgi-duzelt.py            → yedek alır, düzeltir, farkı (parolalar maskeli) basar
#   python3 /root/ai/opencode/temp/kurumsal-bilgi-duzelt.py --kuru     → yalnız gösterir, dosyaya dokunmaz
#   [dosya] verilmezse: /root/ai/work/opencode/kurumsal-bilgi.ini
#
# Yaptıkları (her biri "yapıldı / zaten yapılmış / BULUNAMADI" diye raporlanır; bulamadığını uydurmaz):
#   1 DNS kuralı: "alt ortam üst ortam DNS'lerini kullanır" satırı → prod 10.13 / alt 10.14 / kesin izolasyon
#   2 "AD/NS için … ikisi yeterlidir" satırına "yalnız üst ortam" eki
#   3 Adlandırma: "Tüm Olası Kombinasyonlar" + "Örnekler" → 3 harf kuralı + 20 kodun listesi; "dtl = Thirdparty" satırı silinir
#   4 İş envanteri biçimi bloğu → is-envanter.py'nin bugünkü davranışı
#   5 PASSWORD = <değer> satırlarında değer kaldırılır (PAT'e dokunulmaz)
#   6 "K3s embedded containerd" bloğu → genel RKE2 satırları (05.11 talimatı)
#   7 Bölüm başlık numaraları (==== çizgisine bitişik "N. Başlık") sırayla yeniden numaralanır
#   Sonra (değiştirmeden) liste: [doğrula] satırları ve birebir tekrar eden satırlar — Alp/Doktor karar verir.
import datetime
import difflib
import os
import re
import shutil
import sys

VARSAYILAN = "/root/ai/work/opencode/kurumsal-bilgi.ini"
DAMGA = "[Alp 2026-11-23]"
TR = str.maketrans("ıİşŞğĞüÜöÖçÇ", "iisSgGuUoOcC")


def n(s):
    """Eşleştirme için: Türkçe harfleri sadeleştir, küçük harf."""
    return s.translate(TR).lower()


def bul(satirlar, desen, bas=0):
    r = re.compile(desen)
    for i in range(bas, len(satirlar)):
        if r.search(n(satirlar[i])):
            return i
    return -1


def girinti(s):
    return s[: len(s) - len(s.lstrip())]


ADLANDIRMA = """Kural (Alp 2026-11-23): adin YALNIZ ilk 3 harfi anlam tasir; sonrasi serbesttir.
  1. harf lokasyon : s = Istanbul ("sunucu" diye de okunur), d = DRC (Ankara)
  2. harf ortam    : p = production, x = prep, t = test, d = development, b = bugfix
  3. harf yer      : l = local (ic ag, ana AD alani), d = dmz (DMZ alani)
  Ayni harf yerine gore farkli anlam tasir: 1. harf d = DRC, 2. harf d = development, 3. harf d = dmz.
Butun kodlar (20):
  spl prod-local    spd prod-dmz     | dpl DRC prod-local    dpd DRC prod-dmz
  sxl prep-local    sxd prep-dmz     | dxl DRC prep-local    dxd DRC prep-dmz
  stl test-local    std test-dmz     | dtl DRC test-local    dtd DRC test-dmz
  sdl dev-local     sdd dev-dmz      | ddl DRC dev-local     ddd DRC dev-dmz
  sbl bugfix-local  sbd bugfix-dmz   | dbl DRC bugfix-local  dbd DRC bugfix-dmz
Bu kurala uymayan onekler (srv, drc, scl, vcf ...) eski adlardir; anlami bilinmiyorsa "bilinmiyor" kalir, tahmin yazilmaz.
""".splitlines()

IS_ENVANTERI = """Is envanteri: elle yazilmaz - ansible becerisindeki is-envanter.py uretir. [Alp 2026-11-23]
  - Degisiklik numarasi (CN) varsa: dn/<numara>/hosts.ini (isin playbook'lari ve loglari da o dizinde)
  - CN yoksa (kurulum / kriz / bulgu / is): ansible/inventories/hosts-<YYYYMMDD>-<etiket>.ini
  - Kullanici "ad  IP" satirlari verdiyse host satirina ansible_host=IP yazilir; yalniz ad verildiyse IP ana envanterden/DNS'ten gelir.
""".splitlines()

RKE2 = [
    "- RKE2 node'larinda containerd, rke2-server/rke2-agent sureci altinda calisir; ayri containerd.service kullanilmaz - "
    "systemctl'de inactive gorunmesi normaldir, bulgu degildir. [Alp 2026-11-05]",
    "- Takili Terminating pod'da force delete yalniz API kaydini siler; node'da sandbox kalabilir (2026-11-05 olayi: node reboot "
    "gerekti) - once k8s-sorun becerisi \"Takili Terminating\" bolumu. [Alp 2026-11-05]",
]


def duzelt(sat):
    rapor = []

    # 1 DNS kuralı
    i = bul(sat, r"ust ortam dns.?lerini kullanir")
    if i >= 0:
        sat[i] = girinti(sat[i]) + ("- Ust ortam = production (spl) -> DNS 10.13.x; alt ortamlar = test/prep/development (stl, sxl, sdl) "
                                    "-> DNS 10.14.x. Iki ortam arasinda kesin izolasyon vardir; alt ortam ust ortam DNS'ine erismez. "
                                    "Satellite iki tarafa da SSH ile erisir. " + DAMGA)
        rapor.append("1 DNS kuralı: yapıldı (satır %d)" % (i + 1))
    elif bul(sat, r"kesin izolasyon vardir") >= 0:
        rapor.append("1 DNS kuralı: zaten yapılmış")
    else:
        rapor.append("1 DNS kuralı: BULUNAMADI (\"üst ortam DNS'lerini kullanır\" satırı yok)")

    # 2 AD/NS ikisi yeterlidir
    i = bul(sat, r"ad/ns icin:.*yeterlidir")
    if i >= 0 and "yalniz ust ortam" not in n(sat[i]):
        sat[i] = sat[i].rstrip() + " (yalniz ust ortam; alt ortamda 10.14.x DNS'leri) " + DAMGA
        rapor.append("2 AD/NS satırı: yapıldı (satır %d)" % (i + 1))
    elif i >= 0:
        rapor.append("2 AD/NS satırı: zaten yapılmış")
    else:
        rapor.append("2 AD/NS satırı: BULUNAMADI")

    # 3 Adlandırma
    a = bul(sat, r"tum olasi kombinasyonlar")
    b = bul(sat, r"eski isimlendirme", a + 1) if a >= 0 else -1
    if a >= 0 and b > a:
        sat[a:b] = ADLANDIRMA + [""]
        rapor.append("3a adlandırma tablosu + örnekler: yapıldı (satır %d)" % (a + 1))
    elif bul(sat, r"butun kodlar \(20\)") >= 0:
        rapor.append("3a adlandırma: zaten yapılmış")
    else:
        rapor.append("3a adlandırma: BULUNAMADI (\"Tüm Olası Kombinasyonlar\" … \"Eski İsimlendirme\" aralığı yok)")
    i = bul(sat, r"^\s*dtl\s*=.*third\s*party|^\s*dtl\s*=.*thirdparty")
    if i >= 0:
        del sat[i]
        rapor.append("3b dtl = Thirdparty: silindi")
    else:
        rapor.append("3b dtl = Thirdparty: yok (zaten silinmiş ya da farklı yazılmış)")

    # 4 İş envanteri biçimi
    a = bul(sat, r"is envanteri dosya formati")
    if a >= 0:
        b = a + 1
        while b < len(sat) and sat[b].strip() and not sat[b].lstrip().startswith("==="):
            b += 1
        sat[a:b] = IS_ENVANTERI
        rapor.append("4 iş envanteri biçimi: yapıldı (satır %d–%d değişti)" % (a + 1, b))
    elif bul(sat, r"is envanteri: elle yazilmaz") >= 0:
        rapor.append("4 iş envanteri: zaten yapılmış")
    else:
        rapor.append("4 iş envanteri: BULUNAMADI")

    # 5 Parolalar (PAT hariç)
    sayi = 0
    r = re.compile(r"(?i)(password\s*=\s*)(?!<)\S.*$")
    for k, s in enumerate(sat):
        if r.search(s) and "pat" not in n(s).split("password")[0]:
            sat[k] = r.sub(lambda m: m.group(1) + "<sunucudaki /usr/local/assistbox/<hostname>/*.env dosyasinda - buraya yazilmaz> "
                           + DAMGA, s)
            sayi += 1
    rapor.append("5 parola değeri kaldırıldı: %d satır" % sayi)

    # 6 K3s bloğu
    a = bul(sat, r"k3s embedded containerd")
    if a >= 0:
        bas = a
        if a > 0 and re.search(r"bilinen node davran", n(sat[a - 1])):
            bas = a  # başlık kalır, altı değişir
        son = a + 1
        while son < len(sat) and sat[son].strip() and len(girinti(sat[son])) > len(girinti(sat[a])):
            son += 1
        sat[bas:son] = [girinti(sat[a]) + x for x in RKE2]
        rapor.append("6 K3s bloğu: yapıldı (satır %d–%d)" % (bas + 1, son))
    elif bul(sat, r"rke2-server/rke2-agent sureci altinda") >= 0:
        rapor.append("6 K3s bloğu: zaten yapılmış")
    else:
        rapor.append("6 K3s bloğu: BULUNAMADI")

    # 7 Bölüm numaraları
    no, deg = 0, []
    bas_re = re.compile(r"^(\s*)(\d+)([a-z]?)\.(\s+\S.*)$")
    for k, s in enumerate(sat):
        m = bas_re.match(s)
        if not m:
            continue
        komsu = [sat[j].strip() for j in (k - 1, k + 1) if 0 <= j < len(sat)]
        if not any(c.startswith("====") for c in komsu):
            continue
        if m.group(3):  # 1b gibi alt bölüm: üst numarayı izler
            yeni = "%s%d%s.%s" % (m.group(1), no, m.group(3), m.group(4))
        else:
            no += 1
            yeni = "%s%d.%s" % (m.group(1), no, m.group(4))
        if yeni != s:
            deg.append("%s → %d" % (m.group(2) + m.group(3), no))
            sat[k] = yeni
    rapor.append("7 başlık numaraları: " + (", ".join(deg) if deg else "değişiklik yok"))
    return rapor


def maskele(s):
    return re.sub(r"(?i)(password\s*=\s*)(?!<)\S+", r"\1****", s)


def main(argv):
    kuru = "--kuru" in argv
    yol = next((a for a in argv if not a.startswith("--")), VARSAYILAN)
    if not os.path.isfile(yol):
        print("HATA: dosya yok: %s" % yol)
        return 2
    eski = open(yol, encoding="utf-8").read().splitlines()
    sat = list(eski)
    rapor = duzelt(sat)
    for r in rapor:
        print(r)
    print()
    fark = list(difflib.unified_diff(eski, sat, "önce", "sonra", n=0, lineterm=""))
    print("\n".join(maskele(x) for x in fark) if fark else "(fark yok)")
    print()
    # İnceleme listesi (değiştirmez)
    dogrula = [(k + 1, s.strip()) for k, s in enumerate(sat) if "[dogrula]" in n(s)]
    gorulen, tekrar = {}, []
    for k, s in enumerate(sat):
        t = n(s.strip())
        if len(t) > 25 and not t.startswith("===") and not t.startswith("─") and not t.startswith("┌"):
            if t in gorulen:
                tekrar.append((gorulen[t], k + 1, s.strip()))
            else:
                gorulen[t] = k + 1
    print("İNCELEME (değiştirilmedi) — [doğrula] satırları: %d" % len(dogrula))
    for k, s in dogrula:
        print("  %4d  %s" % (k, maskele(s)[:160]))
    print("İNCELEME — birebir tekrar eden satırlar: %d" % len(tekrar))
    for a, b, s in tekrar:
        print("  %4d = %4d  %s" % (a, b, maskele(s)[:140]))
    if kuru:
        print("\n--kuru: dosyaya dokunulmadı.")
        return 0
    if not fark:
        return 0
    yedek = "%s.%s" % (yol, datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
    shutil.copy2(yol, yedek)
    with open(yol, "w", encoding="utf-8") as f:
        f.write("\n".join(sat) + "\n")
    print("\nYAZILDI: %s\nyedek:   %s\ngeri al: cp -p %s %s" % (yol, yedek, yedek, yol))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
