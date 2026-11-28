#!/usr/bin/env python3
# kume-bul.py — bir sunucu adı / kısa ad / IP verildiğinde çalışma dizinindeki ansible INI envanterlerinde
# nerede geçtiğini (dosya:satır), hangi grupta ve üst grupta (:children) olduğunu, aynı IP'nin başka adla
# geçtiği yerleri ve grubun diğer üyelerini basar. Yalnız okur; ağ/ssh/DNS yok.
# Ayrıştırma kuralları engine/plugins/lib/envanter.ts ile aynı (aralık x[01:05], ansible_host, :children).
# Saha G94 (2026-10-21): "bir master ya da worker söylediğimde kümeyi hemen bulması lazım" (Alp).
import ipaddress
import os
import re
import sys

KOKLER = ("ansible", "inventories", "inventory")
ATLA = {"node_modules", "roles", "group_vars", "host_vars", "dn", "is"}  # dn/, is/: iş dizinleri (…/hosts.ini) — iş envanteri, kaynak değil (Alp 2026-11-12, 11-23)
# İş envanteri (CN/tarihli kopya: hosts-dn29000-20261022-1430.ini, hosts-20261022-dn29000.ini) ana envanterden türetilir — okunmaz
IS_DESEN = re.compile(r"^hosts-(?:.+-\d{8}(?:-\d{4})?|\d{8}(?:-\d{4})?-.+)\.ini$", re.I)
GIZLI = re.compile(r"pass|token|secret|key|vault", re.I)
BUYUK = 2 * 1024 * 1024


def ip_mi(s):
    try:
        ipaddress.ip_address(s)
        return True
    except ValueError:
        return False


def aralik(desen):
    m = re.search(r"\[([0-9a-z]+):([0-9a-z]+)(?::(\d+))?\]", desen, re.I)
    if not m:
        return [desen]
    bas, son, adim = m.group(1), m.group(2), int(m.group(3) or 1) or 1
    once, sonra = desen[: m.start()], desen[m.end():]
    ogeler = []
    if bas.isdigit() and son.isdigit():
        gen = len(bas) if len(bas) > 1 and bas.startswith("0") else 0
        for i in range(int(bas), int(son) + 1, adim):
            ogeler.append(str(i).zfill(gen))
            if len(ogeler) >= 512:
                break
    elif len(bas) == 1 and len(son) == 1 and bas.isalpha() and son.isalpha():
        ogeler = [chr(c) for c in range(ord(bas), ord(son) + 1, adim)]
    else:
        return [desen]
    out = []
    for o in ogeler:
        out.extend(aralik(once + o + sonra))
    return out[:512]


def dosyalar(kok):
    ortam = os.environ.get("OPS_AGENT_ENVANTER")
    if ortam:
        return [d for d in ortam.split(":") if d]
    out = []

    def gez(dizin, derinlik):
        try:
            girdiler = sorted(os.listdir(dizin))
        except OSError:
            return
        for g in girdiler:
            if g.startswith(".") or g in ATLA:
                continue
            yol = os.path.join(dizin, g)
            if os.path.isdir(yol):
                if derinlik < 3:
                    gez(yol, derinlik + 1)
            elif (g.lower().endswith(".ini") or g.lower().startswith("hosts")) and not IS_DESEN.match(g) and not re.search(
                r"\.(ya?ml|json|j2|bak|orig)$", g, re.I
            ):
                try:
                    if os.path.getsize(yol) <= BUYUK:
                        out.append(yol)
                except OSError:
                    pass

    for k in KOKLER:
        gez(os.path.join(kok, k), 1)
    return out[:50]


def ayristir(yol, kayitlar, gruplar, cocuklar, grup_vars):
    grup, tur = "ungrouped", "host"
    try:
        metin = open(yol, encoding="utf-8", errors="replace").read()
    except OSError as e:
        print("okunamadı: %s (%s)" % (yol, e))
        return
    for no, ham in enumerate(metin.split("\n"), 1):
        satir = re.sub(r"\s[#;].*$", "", ham).strip()
        if not satir or satir[0] in "#;":
            continue
        b = re.match(r"^\[([^\]:]+)(?::(children|vars))?\]$", satir)
        if b:
            grup, tur = b.group(1).strip().lower(), b.group(2) or "host"
            continue
        anahtar = (yol, grup)
        if tur == "vars":
            grup_vars.setdefault(anahtar, []).append((no, satir))
            continue
        parca = satir.split()
        if tur == "children":
            cocuklar.setdefault(anahtar, set()).add(parca[0].lower())
            continue
        ad = parca[0].lower()
        degisken = {}
        for d in parca[1:]:
            if "=" in d:
                k, v = d.split("=", 1)
                degisken[k] = v.strip("'\"")
        ip = degisken.get("ansible_host") or degisken.get("ansible_ssh_host")
        for h in aralik(ad):
            ipler = set()
            if ip and "[" not in ad:
                ipler.add(ip.lower())
            if ip_mi(h):
                ipler.add(h)
            kayitlar.append({"dosya": yol, "satir": no, "grup": grup, "ad": h, "kisa": h.split(".")[0],
                             "ipler": ipler, "vars": degisken})
            gruplar.setdefault(anahtar, []).append(h)


def ustler(yol, grup, cocuklar):
    # grup'u :children olarak içeren grupları (aynı dosyada) yukarı doğru topla
    out, bak = [], [grup]
    while bak:
        g = bak.pop()
        for (d, ust), alt in cocuklar.items():
            if d == yol and g in alt and ust not in out:
                out.append(ust)
                bak.append(ust)
    return out


def goster_vars(v):
    return " ".join("%s=%s" % (k, "***" if GIZLI.search(k) else x) for k, x in v.items())


def duz(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


def platform_kume(q):
    """'platform(küme)' / 'platform/küme' → (platform, küme); değilse None."""
    m = re.match(r"^([^()/]+)\(([^()]+)\)$", q) or re.match(r"^([^()/]+)/([^()/]+)$", q)
    if not m or ip_mi(m.group(1).strip()) or m.group(2).strip().isdigit():  # 10.0.0.0/24 platform/küme değil
        return None
    return m.group(1).strip(), m.group(2).strip()


def uyeler_ozyineli(anahtar, gruplar, cocuklar):
    """Grubun üyeleri, :children alt grupları dahil (kume-bul k8s --kaydet haritası yalnız alt gruplardan oluşur)."""
    out, gor, bak = [], set(), [anahtar]
    while bak:
        a = bak.pop(0)
        if a in gor:
            continue
        gor.add(a)
        out.extend(h for h in gruplar.get(a, []) if h not in out)
        bak.extend((a[0], c) for c in sorted(cocuklar.get(a, ())))
    return out


def url_etiket(url):
    """rancher_url → ilk DNS etiketi (tırnak, şema, port, yol atılır)."""
    return duz(re.sub(r"^https?://", "", url.strip().strip("\"'")).split("/")[0].split(":")[0].split(".")[0])


def grup_degeri(anahtar, grup_vars, ad):
    for _, s in grup_vars.get(anahtar, []):
        k, _, v = s.partition("=")
        if k.strip().lower() == ad:
            return v.strip().lower()
    return ""


def main(argv):
    if argv and argv[0] == "k8s":
        return k8s_main(argv[1:])
    ek = []
    sorgular = []
    i = 0
    while i < len(argv):
        if argv[i] in ("-h", "--help"):
            print("kullanım: kume-bul.py <ad|kısa ad|IP> [...] [--dosya <envanter.ini>]...")
            print("          ssh root@<master> \"<kubectl ... -o json>; ...\" | kume-bul.py k8s [--kaydet]   (SKILL.md §2)")
            print("Çalışma dizinindeki ansible/, inventories/, inventory/ altındaki *.ini ve hosts* dosyalarını okur.")
            return 0
        if argv[i] == "--dosya" and i + 1 < len(argv):
            ek.append(argv[i + 1])
            i += 2
            continue
        # "rke-nonprod (test)" tek sorgudur: platform(küme) — boşluktan bölünmeden önce birleştirilir (G130)
        arg = re.sub(r"\s*\(\s*([^()]*?)\s*\)", r"(\1)", argv[i])
        sorgular.extend(x.strip().lower() for x in re.split(r"[,\s]+", arg) if x.strip())
        i += 1
    if not sorgular:
        print("kullanım: kume-bul.py <ad|kısa ad|IP> [...] [--dosya <envanter.ini>]...")
        return 2

    liste = ek or dosyalar(os.getcwd())
    if not liste:
        print("Envanter dosyası bulunamadı (cwd=%s; ansible/, inventories/, inventory/ altında *.ini / hosts*)." % os.getcwd())
        return 1
    kayitlar, gruplar, cocuklar, grup_vars = [], {}, {}, {}
    for d in liste:
        ayristir(d, kayitlar, gruplar, cocuklar, grup_vars)
    print("Okunan envanter: %s" % ", ".join(os.path.relpath(d) for d in liste))

    kapsama = {}  # (dosya, grup) -> bulunan sorgular
    bulunamayan = []
    for q in sorgular:
        qk = q.split(".")[0]
        if ip_mi(q):
            esles = [k for k in kayitlar if q in k["ipler"]]
            tur = "IP"
        else:
            esles = [k for k in kayitlar if k["ad"] == q or k["kisa"] == qk]
            tur = "ad"
            if not esles and re.search(r"\d", q) and len(q) >= 3:
                esles = [k for k in kayitlar if k["kisa"].endswith(qk)]
                tur = "kısmi ad (sonek)"
        # aynı IP başka adla geçiyor mu
        ipler = set()
        for k in esles:
            ipler |= k["ipler"]
        ayni_ip = [k for k in kayitlar if k["ipler"] & ipler and k not in esles]

        print("\n== %s" % q)
        if not esles and "(" in q:
            # "mas01 (master)": parantez not olabilir — önce baştaki ad host mu bak
            taban = q.split("(")[0]
            esles = [k for k in kayitlar if k["ad"] == taban or k["kisa"] == taban.split(".")[0]]
            if esles:
                tur = "ad (parantez not sayıldı: %s)" % q[len(taban):]
                for k in esles:
                    ipler |= k["ipler"]
                ayni_ip = [k for k in kayitlar if k["ipler"] & ipler and k not in esles]
        pk = platform_kume(q) if not esles and not ip_mi(q) else None
        if pk:
            # Saha G130 (2026-11-25): "rke-nonprod(test)" soruldu, ajan yalnız [rke-nonprod] grubuna (Rancher'ın kendi kümesi, 3/3 Ready)
            # baktı; [rke-nonprod-test] (18 node, bir master NotReady) hiç açılmadı. Platform adı tek başına asla cevap sayılmaz.
            pf, km = duz(pk[0]), duz(pk[1])
            tum = set(gruplar) | set(grup_vars) | set(cocuklar)
            deger = lambda a, ad: duz(grup_degeri(a, grup_vars, ad).strip("\"'"))
            if not pf or not km:  # ASCII dışı ad duz() ile boşalır — boş değer her grupla "eşleşmesin"
                kesin = aday = []
            else:
                kesin = sorted(a for a in tum if duz(a[1]) == pf + "-" + km or (
                    deger(a, "rancher_kume_adi") == km and url_etiket(grup_degeri(a, grup_vars, "rancher_url")) == pf))
                aday = kesin or sorted(a for a in tum if duz(a[1]) == km or duz(a[1]).endswith("-" + km) or
                                       km == deger(a, "rancher_kume_adi") or km == deger(a, "k8s_kume"))
            print("  okunuş: platform=%s · küme=%s" % pk)
            for a in aday:
                uye = uyeler_ozyineli(a, gruplar, cocuklar)
                print("  %s: [%s] %s · üyeler (%d): %s%s" % ("küme" if kesin else "ADAY (doğrula)", a[1], os.path.relpath(a[0]),
                                                          len(uye), " ".join(uye[:30]), " …" if len(uye) > 30 else ""))
                kapsama.setdefault(a, set()).add(q)
            if len(aday) > 1 or (aday and not kesin):
                print("  BELİRSİZ: hangisi olduğunu sor; birini kendin seçme.")
            if not aday:
                bulunamayan.append(q)
                print("  küme '%s' envanterde YOK. [%s] grubu platformun kendisidir, bu kümenin YERİNE geçmez — oradan sağlık sonucu verme;"
                      % (pk[1], pk[0]))
                print("  Rancher haritası (SKILL.md §3 --kaydet) ya da kümenin bir master adını sor.")
            continue
        if not esles and not ip_mi(q):
            # küme/grup adı sorgusu (ör. "ai-test"): grup adı ya da kaydedilmiş Rancher haritasında rancher_kume_adi
            gq = re.sub(r"[^a-z0-9_]+", "_", q).strip("_")
            kume = sorted({a for a in set(gruplar) | set(cocuklar) if a[1] in (q, gq)} | {
                a for a, satirlar in grup_vars.items()
                if any(re.sub(r"\s+", "", s).lower() == "rancher_kume_adi=" + q for _, s in satirlar)})
            if kume:
                for anahtar in kume:
                    uyeler = uyeler_ozyineli(anahtar, gruplar, cocuklar)
                    print("  küme/grup adı: [%s] %s · üyeler (%d): %s%s" % (
                        anahtar[1], os.path.relpath(anahtar[0]), len(uyeler), " ".join(uyeler[:30]),
                        " …" if len(uyeler) > 30 else ""))
                    ust = ustler(anahtar[0], anahtar[1], cocuklar)
                    for g in [anahtar[1]] + ust:
                        for no, s in grup_vars.get((anahtar[0], g), [])[:15]:
                            if GIZLI.search(s.split("=")[0]):
                                s = s.split("=")[0] + "=***"
                            print("  [%s:vars] %s:%d  %s" % (g, os.path.relpath(anahtar[0]), no, s))
                    kapsama.setdefault(anahtar, set()).add(q)
                benzer = sorted({a[1] for a in set(gruplar) | set(grup_vars) | set(cocuklar) if duz(a[1]).startswith(duz(q) + "-")})
                if benzer:
                    print("  ⚠ AYNI ÖNEKLE %d GRUP DAHA VAR: %s%s" % (
                        len(benzer), " ".join("[%s]" % b for b in benzer[:20]), " …" if len(benzer) > 20 else ""))
                    print("    Kullanıcı ek/parantez yazdıysa (ör. \"%s(test)\") hedef onlardan biridir: kume-bul.py \"%s(<küme>)\"; "
                          "emin değilsen sor." % (q, q))
                print("  eşleşme türü: küme/grup adı")
                continue
        if not esles:
            bulunamayan.append(q)
            benzer = sorted({a[1] for a in set(gruplar) | set(grup_vars) | set(cocuklar) if duz(q) and duz(a[1]).startswith(duz(q) + "-")})
            if benzer:
                print("  ⚠ bu adla grup yok ama AYNI ÖNEKLE %d GRUP VAR: %s — hangisi olduğunu sor: kume-bul.py \"%s(<küme>)\"" % (
                    len(benzer), " ".join("[%s]" % b for b in benzer[:20]), q))
            print("  envanterde YOK (ad, kısa ad, ansible_host, grup/küme adı). Sonraki adım: getent hosts %s → IP ile yeniden çalıştır;" % q)
            print("  yine yoksa canlı yol (SKILL.md §2: master'dan kubectl JSON → kume-bul.py k8s).")
            continue
        kisaltilar = sorted({k["ad"] for k in esles})
        if tur == "kısmi ad (sonek)" and len(kisaltilar) > 1:
            print("  BELİRSİZ: kısa yazım birden çok host'a uyuyor: %s — tam adı sor." % ", ".join(kisaltilar[:8]))
        for k in esles + ayni_ip:
            not_ = "" if k in esles else "  ← aynı IP, farklı ad"
            ust = ustler(k["dosya"], k["grup"], cocuklar)
            print("  %s:%d  ad=%s  grup=[%s]%s%s%s" % (
                os.path.relpath(k["dosya"]), k["satir"], k["ad"], k["grup"],
                ("  üst=[%s]" % "] [".join(ust)) if ust else "",
                ("  " + goster_vars(k["vars"])) if k["vars"] else "", not_))
            kapsama.setdefault((k["dosya"], k["grup"]), set()).add(q)
        # saha 2026-11-03: "IP: envanterde yok" eksiklik sanıldı, ajan IP istedi — kurumda envantere IP yazılmaz, ad DNS'ten çözülür
        print("  eşleşme türü: %s · IP: %s" % (tur, ", ".join(sorted(ipler)) or
                                             "envantere yazılmaz (normal — ad DNS'ten çözülür; bağlan: ssh root@%s)" % esles[0]["ad"]))
        # grubun diğer üyeleri ve grup değişkenleri (tek sorguda; toplu sorguda özet yeter)
        if len(sorgular) == 1:
            goruldu = set()
            for k in esles + ayni_ip:
                anahtar = (k["dosya"], k["grup"])
                if anahtar in goruldu or k["grup"] == "ungrouped":
                    continue
                goruldu.add(anahtar)
                uyeler = gruplar.get(anahtar, [])
                print("  [%s] üyeleri (%d, %s): %s%s" % (
                    k["grup"], len(uyeler), os.path.relpath(k["dosya"]), " ".join(uyeler[:30]),
                    " …" if len(uyeler) > 30 else ""))
                for g in [k["grup"]] + ustler(k["dosya"], k["grup"], cocuklar):
                    for no, s in grup_vars.get((k["dosya"], g), [])[:15]:
                        if GIZLI.search(s.split("=")[0]):
                            s = s.split("=")[0] + "=***"
                        print("  [%s:vars] %s:%d  %s" % (g, os.path.relpath(k["dosya"]), no, s))

    if len(sorgular) > 1:
        print("\n== Toplu özet: hangi grup kaç sorguyu kapsıyor (%d sorgu)" % len(sorgular))
        for (d, g), qs in sorted(kapsama.items(), key=lambda x: (-len(x[1]), x[0])):
            print("  %d/%d  [%s]  %s" % (len(qs), len(sorgular), g, os.path.relpath(d)))
        if bulunamayan:
            print("  envanterde yok: %s" % " ".join(bulunamayan))
    return 0 if len(bulunamayan) < len(sorgular) else 1


# ---------------------------------------------------------------------------------------------------------------
# k8s: master'da çalışan kubectl'in JSON çıktısını (stdin, art arda birden çok belge) okuyup küme kimliğini çıkarır.
# ssh betiğin içinde DEĞİL, borunun başında durur — kilit ve onay ekranı uzak komutu görür (atlatma yok).
# Tanınan türler: Node (core v1 ve management.cattle.io v3), Cluster (management.cattle.io), Ingress, Setting
# (server-url), Deployment (rancher / cattle-cluster-agent), Secret (yalnız sertifika alanları; anahtar asla basılmaz).
# Alan adları Rancher v3 tiplerinden (genel); sahada ilk koşuda doğrulanacak — yoksa "?" basılır, uydurulmaz.

def json_belgeler(metin):
    import json
    dec, i, out = json.JSONDecoder(), 0, []
    while True:
        while i < len(metin) and metin[i] not in "{[":
            i += 1
        if i >= len(metin):
            return out
        try:
            obj, i = dec.raw_decode(metin, i)
        except ValueError:
            i += 1
            continue
        items = obj.get("items") if isinstance(obj, dict) and obj.get("kind", "").endswith("List") else None
        out.extend(items if items is not None else [obj])


def al(d, *yol, **kw):
    for y in yol:
        if isinstance(d, dict):
            d = d.get(y)
        elif isinstance(d, list) and isinstance(y, int) and len(d) > y:
            d = d[y]
        else:
            return kw.get("vars", "?")
        if d is None:
            return kw.get("vars", "?")
    return d


def rol_etiket(labels):
    r = []
    for k in ("control-plane", "master", "etcd", "worker"):
        if labels.get("node-role.kubernetes.io/" + k) is not None and not (k == "master" and "control-plane" in r):
            r.append(k)
    return r


def ic_ip(adresler):
    for a in adresler or []:
        if a.get("type") == "InternalIP":
            return a.get("address", "?")
    return "?"


def sertifika_oku(pem):
    import subprocess
    try:
        p = subprocess.run(["openssl", "x509", "-noout", "-subject", "-issuer", "-dates", "-ext", "subjectAltName"],
                           input=pem.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        if p.returncode == 0:
            return p.stdout.decode(errors="replace").strip().splitlines()
        hata = p.stderr.decode(errors="replace").strip().splitlines()[-1:]
    except (OSError, subprocess.SubprocessError) as e:
        hata = [str(e)]
    return ["openssl okuyamadı: %s" % " ".join(hata)]


def k8s_main(argv):
    import base64
    import datetime
    kaydet, kume_adi = None, None
    for i, a in enumerate(argv):
        if a == "--kaydet":
            kaydet = argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith("-") else ""
        if a == "--kume" and i + 1 < len(argv):
            kume_adi = argv[i + 1]
    if sys.stdin.isatty():
        print("stdin boş: ssh root@<master> \"<kubectl> get ... -o json\" | kume-bul.py k8s (SKILL.md §2)")
        return 2
    nesneler = json_belgeler(sys.stdin.read())
    tur = lambda o: (o.get("kind", ""), o.get("apiVersion", "").split("/")[0])
    dugum = [o for o in nesneler if tur(o) == ("Node", "v1")]
    m_dugum = [o for o in nesneler if tur(o) == ("Node", "management.cattle.io")]
    m_kume = [o for o in nesneler if tur(o) == ("Cluster", "management.cattle.io")]
    ingress = [o for o in nesneler if o.get("kind") == "Ingress"]
    ayar = {al(o, "metadata", "name"): o.get("value") for o in nesneler if tur(o) == ("Setting", "management.cattle.io")}
    deploy = {al(o, "metadata", "name"): o for o in nesneler if o.get("kind") == "Deployment"}
    sirlar = [o for o in nesneler if o.get("kind") == "Secret"]
    print("Okunan nesne: %d (Node %d · Rancher Cluster %d · Rancher Node %d · Ingress %d · Secret %d)" % (
        len(nesneler), len(dugum), len(m_kume), len(m_dugum), len(ingress), len(sirlar)))
    if not nesneler:
        print("JSON yok — ssh/kubectl hata verdi mi? stderr'i görmek için borusuz tek komutu çalıştır.")
        return 1

    # Kimlik özeti
    print("\n== Kimlik")
    server_url = ayar.get("server-url")
    if server_url or "rancher" in deploy or m_kume:
        print("  Rancher bu kümede KURULU (= platformun local kümesi) · server-url: %s" % (server_url or "? (okunmadı)"))
    ajan = deploy.get("cattle-cluster-agent")
    if ajan:
        env = al(ajan, "spec", "template", "spec", "containers", 0, "env", vars=[]) or []
        cs = [e.get("value") for e in env if isinstance(e, dict) and e.get("name") == "CATTLE_SERVER"]
        print("  Yöneten Rancher (cattle-cluster-agent CATTLE_SERVER): %s" % (cs[0] if cs else "?"))
    if not (server_url or "rancher" in deploy or m_kume or ajan):
        print("  Rancher izi yok (rancher / cattle-cluster-agent / server-url okunmadı ya da yok)")

    if dugum:
        print("\n== Bu kümenin node'ları (%d)" % len(dugum))
        for o in sorted(dugum, key=lambda o: al(o, "metadata", "name")):
            lb = al(o, "metadata", "labels", vars={}) or {}
            print("  %-28s %-15s %-22s %s · %s" % (
                al(o, "metadata", "name"), ic_ip(al(o, "status", "addresses", vars=[])),
                ",".join(rol_etiket(lb)) or "-", al(o, "status", "nodeInfo", "kubeletVersion"),
                al(o, "status", "nodeInfo", "osImage")))

    if ingress:
        hostlar = {}
        for o in ingress:
            for r in al(o, "spec", "rules", vars=[]) or []:
                h = r.get("host")
                if h:
                    hostlar.setdefault(h, []).append("%s/%s" % (al(o, "metadata", "namespace"), al(o, "metadata", "name")))
        print("\n== Ingress host'ları (%d ad, %d ingress)" % (len(hostlar), len(ingress)))
        for h in sorted(hostlar):
            print("  %-45s %s" % (h, " ".join(hostlar[h][:3]) + (" …" if len(hostlar[h]) > 3 else "")))

    for o in sirlar:
        data = o.get("data") or {}
        for alan in ("tls.crt", "ca.crt", "cacerts.pem"):  # tls.key / anahtarlar hiç okunmaz
            if alan not in data:
                continue
            try:
                pem = base64.b64decode(data[alan]).decode(errors="replace")
            except (ValueError, TypeError) as e:
                print("\n== Secret %s/%s %s: base64 çözülemedi (%s)" % (al(o, "metadata", "namespace"), al(o, "metadata", "name"), alan, e))
                continue
            sayi = pem.count("BEGIN CERTIFICATE")
            print("\n== Secret %s/%s %s (zincirde %d sertifika; ilki:)" % (
                al(o, "metadata", "namespace"), al(o, "metadata", "name"), alan, sayi))
            for s in sertifika_oku(pem):
                print("  " + s.strip())

    if m_kume:
        uyeler = {}
        for o in m_dugum:
            uyeler.setdefault(al(o, "metadata", "namespace"), []).append(o)
        print("\n== Rancher'ın yönettiği kümeler (%d)%s" % (len(m_kume), " · " + server_url if server_url else ""))
        satirlar = []
        for k in sorted(m_kume, key=lambda o: (al(o, "metadata", "name") != "local", str(al(o, "spec", "displayName")))):
            kid = al(k, "metadata", "name")
            hazir = [c.get("status") for c in al(k, "status", "conditions", vars=[]) or [] if c.get("type") == "Ready"]
            print("  [%s] id=%s · %s · %s · Ready=%s · node=%d%s" % (
                al(k, "spec", "displayName"), kid, al(k, "status", "provider") if al(k, "status", "provider") != "?" else al(k, "status", "driver"),
                al(k, "status", "version", "gitVersion"), hazir[0] if hazir else "?", len(uyeler.get(kid, [])),
                (" · api=" + al(k, "status", "apiEndpoint")) if al(k, "status", "apiEndpoint") != "?" else ""))
            dugumler = []
            for n in sorted(uyeler.get(kid, []), key=lambda n: str(al(n, "status", "nodeName"))):
                ad = al(n, "status", "nodeName")
                ad = ad if ad != "?" else al(n, "spec", "requestedHostname")
                roller = [r for r, a in (("control-plane", "controlPlane"), ("etcd", "etcd"), ("worker", "worker"))
                          if al(n, "spec", a, vars=False) is True]
                roller = roller or rol_etiket(al(n, "status", "nodeLabels", vars={}) or {})
                ip = ic_ip(al(n, "status", "internalNodeStatus", "addresses", vars=[]))
                print("      %-28s %-15s %s" % (ad, ip, ",".join(roller) or "-"))
                dugumler.append((ad, ip, roller))
            satirlar.append((k, kid, dugumler))
        if kaydet is not None:
            return rancher_kaydet(kaydet, server_url, satirlar, datetime.date.today().isoformat())
    elif kaydet is not None and dugum and kume_adi:
        return kume_kaydet(kaydet, kume_adi, dugum, datetime.date.today().isoformat())
    elif kaydet is not None:
        print("\n--kaydet: Rancher Cluster/Node nesnesi yok — Rancher haritası için komutu Rancher local master'ında çalıştır; bu kümenin "
              "kendi node listesini kaydetmek için `--kume <küme adı>` ekle (Rancher'da görünen ad, ör. gpu-prod).")
        return 1
    return 0


def kume_kaydet(yol, kume_adi, dugum, tarih):
    """Downstream kümenin node listesini (kubectl get nodes) envantere yazar — G127/gpu-prod (2026-11-23): node'lar envanterde ve DNS'te
    yoktu, ajan komşu IP tahmin etti. Kaynak kubectl; ad ↔ IP kubelet'in bildirdiği InternalIP."""
    temiz = lambda x: re.sub(r"[^a-z0-9_]+", "_", str(x).lower()).strip("_")
    k = temiz(kume_adi)
    if not k:
        print("\n--kume: ad geçersiz")
        return 1
    yol = yol or os.path.join("ansible", "inventories", "kume-%s.ini" % k.replace("_", "-"))
    imza = "# kume-bul.py k8s --kaydet --kume ile üretildi"
    if os.path.exists(yol) and imza not in open(yol, encoding="utf-8", errors="replace").read(400):
        print("\n--kaydet: %s var ve bu betikle üretilmemiş — üzerine yazılmadı." % yol)
        return 1
    master, worker = [], []
    for o in sorted(dugum, key=lambda o: al(o, "metadata", "name")):
        ad = al(o, "metadata", "name")
        ip = ic_ip(al(o, "status", "addresses", vars=[]))
        roller = rol_etiket(al(o, "metadata", "labels", vars={}) or {})
        satir = "%s%s k8s_rol=%s" % (ad, " ansible_host=%s" % ip if ip_mi(ip) else "", ",".join(roller) or "-")
        (master if any(r in ("control-plane", "master", "etcd") for r in roller) else worker).append(satir)
    out = [imza + " — elle düzenleme, yeniden üretilir.",
           "# kaynak: kubectl get nodes (InternalIP) · küme %s · %s" % (kume_adi, tarih),
           "[kume_%s:children]" % k, "kume_%s_master" % k, "kume_%s_worker" % k, "",
           "[kume_%s_master]" % k] + master + ["", "[kume_%s_worker]" % k] + worker + [
           "", "[kume_%s:vars]" % k, "k8s_kume=%s" % kume_adi]
    d = os.path.dirname(yol)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    open(yol, "w", encoding="utf-8").write("\n".join(out) + "\n")
    print("\n--kaydet: yazıldı %s (küme %s: %d master, %d worker). Artık: kume-bul.py <ad|IP> · ansible kume_%s_master -i %s" % (
        yol, kume_adi, len(master), len(worker), k, yol))
    return 0


def rancher_kaydet(yol, server_url, satirlar, tarih):
    host = re.sub(r"^https?://", "", server_url or "").split("/")[0].split(":")[0]
    if not host:
        print("\n--kaydet: server-url okunmadı — dosya adı/kaynak belirsiz, yazılmadı.")
        return 1
    temiz = lambda s: re.sub(r"[^a-z0-9_]+", "_", str(s).lower()).strip("_")
    yol = yol or os.path.join("ansible", "inventories", "rancher-%s.ini" % host)
    imza = "# kume-bul.py k8s --kaydet ile üretildi"
    if os.path.exists(yol) and imza not in open(yol, encoding="utf-8", errors="replace").read(400):
        print("\n--kaydet: %s var ve bu betikle üretilmemiş — üzerine yazılmadı." % yol)
        return 1
    ust = "rancher_" + temiz(host)
    out = [imza + " — elle düzenleme, yeniden üretilir.",
           "# kaynak: Rancher %s · kubectl get clusters/nodes.management.cattle.io · %s" % (server_url, tarih),
           "[%s:children]" % ust]
    gruplar = []
    for k, kid, dugumler in satirlar:
        g = "%s_%s" % (ust, temiz(al(k, "spec", "displayName")) or temiz(kid))
        out.append(g)
        gruplar.append((g, k, kid, dugumler))
    for g, k, kid, dugumler in gruplar:
        out += ["", "[%s]" % g]
        for ad, ip, roller in dugumler:
            out.append("%s%s rancher_rol=%s" % (ad, " ansible_host=%s" % ip if ip_mi(ip) else "", ",".join(roller) or "-"))
        out += ["[%s:vars]" % g, "rancher_url=%s" % server_url, "rancher_kume_id=%s" % kid,
                "rancher_kume_adi=%s" % al(k, "spec", "displayName"), "k8s_surum=%s" % al(k, "status", "version", "gitVersion")]
    d = os.path.dirname(yol)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    open(yol, "w", encoding="utf-8").write("\n".join(out) + "\n")
    print("\n--kaydet: yazıldı %s (%d küme, %d node). Artık: kume-bul.py <ad|IP>" % (
        yol, len(gruplar), sum(len(x[3]) for x in gruplar)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
