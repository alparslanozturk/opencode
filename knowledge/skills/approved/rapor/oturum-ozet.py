#!/usr/bin/env python3
# oturum-ozet.py — opencode oturum dökümünden (session export JSON) KANITLI özet: yalnız kullanıcının sözü ve komut çıktısı bilgi sayılır;
# ajanın kendi metni (yanıt, akıl yürütme) bilgi kaynağı DEĞİLDİR, özete girmez. Kullanıcının düzelttiği ajan sözü "yanlış — tekrarlama"
# diye ayrı bölümde durur; başarısız/reddedilen komut "hata — bilgi değil" bölümündedir. Özetin hiçbir satırı modelden gelmez.
# Alp (2026-11-03): "session sonunda doğru bilgileri ve kurum bilgilerini özetlemeye ayrıca efor harcıyorum … hataları bilgi olarak
# kaydetmemesi lazım."
#
#   opencode session export <id> | oturum-ozet.py -        → Markdown özet (stdout)
#   oturum-ozet.py <dosya.json>
import json
import re
import sys

DUZELTME = re.compile(r"\b(hayır|yanlış|hatalı|hata yap|büyük bir hata|öyle değil|doğru değil|yapma|iptal|gerek yok|kanıtsız|uydurma|"
                      r"işime yaramayacak|olmamalı|bunu değil)", re.I)
TAHMIN = re.compile(r"\b(sanırım|galiba|muhtemelen|olabilir|bilmiyorum|bilemiyorum|emin değilim|zannediyorum|herhalde)\b", re.I)
DEGISTIRIR = re.compile(r"(^|[\s;&|(\"'])(dnf|yum)\s+(-y\s+)?(install|update|upgrade|remove|erase|downgrade)\b|systemctl\s+(restart|stop|start|"
                        r"enable|disable|mask|daemon-reload)\b|\b(lvextend|lvcreate|lvremove|vgextend|vgremove|vgcreate|vgreduce|pvcreate|"
                        r"pvremove|mkfs\S*|parted|growpart|xfs_growfs|resize2fs|wipefs\s+-a|umount|reboot|shutdown|useradd|usermod|"
                        r"userdel|chmod|chown|rm|mv|cp|tee|ansible-playbook|kubectl\s+(apply|delete|edit|patch|scale|rollout|drain|"
                        r"cordon|uncordon|label|annotate))\b|\bsed\s+-i|\bmount\s+(-a|/|\S+\s+/)|(^|[^2&])>\s*/(etc|usr|var|opt|data|root)/")
CIKIS = re.compile(r"Exited with code (\d+)|exit(?: code|code)?[=: ]+(\d+)", re.I)


def maskele(x):
    # Alp (2026-11-03): yerel ortam, parola/token dosyada olabilir — maskeleme yok
    return x


def kisa(x, n):
    x = maskele(" ".join(str(x).split()))
    return x if len(x) <= n else x[:n - 1] + "…"


def satirlar(x, n):
    ls = [maskele(l.rstrip()) for l in str(x).splitlines() if l.strip()]
    return ls[:n] + (["… (%d satır daha)" % (len(ls) - n)] if len(ls) > n else [])


def arac_metni(st):
    return "\n".join(c.get("text", "") for c in (st.get("content") or []) if isinstance(c, dict) and c.get("type") == "text")


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import json")[0].replace("# ", "").replace("#!/usr/bin/env python3\n", ""))
        return 0
    ham = sys.stdin.read() if argv[0] == "-" else open(argv[0], encoding="utf-8", errors="replace").read()
    try:
        veri = json.loads(ham)
    except ValueError as e:
        print("JSON okunamadı: %s — `opencode session export <id>` çıktısı bekleniyor" % e)
        return 2
    info, mesajlar = veri.get("info") or {}, veri.get("messages") or []
    kullanici, duzeltme, olculen, degisiklik, hata, beceri, dosya = [], [], [], [], [], [], []
    son_ajan, ajan_sayisi = "", 0
    for i, m in enumerate(mesajlar, 1):
        tur = m.get("type")
        if tur == "user":
            metin = (m.get("text") or "").strip()
            if not metin:
                continue
            etiket = " _(kullanıcı tahmini — doğrula)_" if TAHMIN.search(metin) else ""
            kullanici.append("- #%d: %s%s" % (i, kisa(metin, 600), etiket))
            if DUZELTME.search(metin) and son_ajan:
                duzeltme.append("- #%d kullanıcı: %s\n  - düzeltilen ajan sözü (bilgi DEĞİL, tekrarlama): %s" % (i, kisa(metin, 300), kisa(son_ajan, 300)))
        elif tur == "shell":
            out = (m.get("output") or {}).get("output", "") if isinstance(m.get("output"), dict) else ""
            hedef = hata if m.get("exit") not in (None, 0) else olculen
            hedef.append("- #%d kullanıcı kabuğu `%s` (çıkış %s)\n%s" % (i, kisa(m.get("command", ""), 300), m.get("exit", "?"),
                                                                       "\n".join("      " + l for l in satirlar(out, 8))))
        elif tur == "assistant":
            ajan_sayisi += 1
            for c in m.get("content") or []:
                if not isinstance(c, dict):
                    continue
                if c.get("type") == "text" and c.get("text", "").strip():
                    son_ajan = c["text"]
                if c.get("type") != "tool":
                    continue
                ad, st = c.get("name", "?"), c.get("state") or {}
                girdi = st.get("input") if isinstance(st.get("input"), dict) else {}
                durum, cikti = st.get("status"), arac_metni(st)
                if ad == "skill":
                    beceri.append(str(girdi.get("name", "?")))
                    continue
                if ad in ("edit", "write", "apply_patch", "multiedit", "patch"):
                    dosya.append("- #%d %s `%s` (%s)" % (i, ad, kisa(girdi.get("filePath", girdi.get("path", "?")), 200), durum))
                    continue
                if ad not in ("bash", "shell"):
                    continue
                komut = girdi.get("command", "")
                kod = CIKIS.search(cikti)
                kod = int(kod.group(1) or kod.group(2)) if kod else None
                satir = "- #%d `%s`\n%s" % (i, kisa(komut, 400), "\n".join("      " + l for l in satirlar(cikti, 10)))
                if durum == "error" or (kod not in (None, 0)):
                    neden = (st.get("error") or {}).get("message", "") if isinstance(st.get("error"), dict) else ""
                    hata.append("- #%d `%s` — %s" % (i, kisa(komut, 300), kisa(neden or "çıkış %s: %s" % (kod, cikti), 300)))
                elif durum == "completed":
                    (degisiklik if DEGISTIRIR.search(komut) else olculen).append(satir)
    baslik = info.get("title") or "?"
    print("# Oturum özeti — %s\n" % baslik)
    print("Oturum: `%s` · mesaj %d · ajan yanıtı %d (ajan metni özete alınmadı — bilgi kaynağı değil)\n" % (info.get("id", "?"), len(mesajlar), ajan_sayisi))
    print("Kural: aşağıdaki her satır ya kullanıcının sözü ya komut çıktısıdır (`#n` = dökümdeki mesaj sırası). Ders yazarken yalnız buradan al;\n"
          "\"Düzeltmeler\" ve \"Başarısız\" bölümleri bilgi değil, tekrarlanmaması gerekenlerdir.\n")
    for ad, xs in (("Kullanıcının verdiği bilgi (kurum bilgisi kaynağı)", kullanici),
                   ("Düzeltmeler — ajanın yanlışı, bilgi değil", duzeltme),
                   ("Değişiklik yapan komutlar (başarılı)", degisiklik),
                   ("Ölçülen — okuma komutları ve çıktıları", olculen),
                   ("Başarısız / reddedilen — bilgi değil", hata),
                   ("Dosya değişiklikleri", dosya)):
        print("## %s\n" % ad)
        print("\n".join(xs) if xs else "(yok)")
        print()
    print("## Kullanılan beceriler\n\n%s\n" % (", ".join(sorted(set(beceri))) or "(yok)"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
