#!/usr/bin/env python3
# nfs-tani.py — NFS istemcisinde açılışta bağlama sırası ve bağlamayı kullanan konteynerler; kararı model değil bu betik verir,
# her bulgu kaynağını (man sayfası / ölçülen zaman damgası) yazar, tahmin "tahmin:" diye ayrılır.
# Saha (Alp, 2026-11-03, G118): splastnginx* açılışında /ab (NFS, medya kayıtları) "dizin istemede sorun" — yeniden bağlanınca dizinler
# geldi; yazma da etkilenmiş olabilir. Ajan nfsidmap satırlarını kök neden yazdı (kanıtsız).
#
#   nfs-tani.py komut              → sunucuda çalıştırılacak SALT-OKUNUR komutu basar (ssh root@<sunucu> '<komut>')
#   nfs-tani.py tani <dosya|->     → çıktıyı okur: BULGU / NOT / EKSİK KANIT. Çıkış 0 bulgu yok, 1 bulgu var, 2 hata.
#   nfs-tani.py perf-komut [sn]    → performans: /proc/self/mountstats'ı iki kez (arada sn, varsayılan 10) okuyan SALT-OKUNUR komut
#   nfs-tani.py perf <dosya|->     → NFSv3 ve NFSv4 aynı: bağlama başına sürüm/seçenek + işlem başına op/s, kB/s, yeniden gönderim,
#                                    avg RTT/exe/queue (ms), hata — nfsiostat ile aynı hesap (/usr/sbin/nfsiostat, nfs-utils 2.8.3).
#                                    Tek okuma → bağlamadan beri ortalama; iki okuma → aralık. Eşik uydurmaz: yalnız man nfs'te yazan
#                                    risk (soft) ve sıfırdan farklı yeniden gönderim/hata BULGU'dur; gerisi karşılaştırma için tablo.
import re
import sys

KOMUT = (
    'echo acilis=$(date -d "$(uptime -s)" +%s); '
    'for t in $(findmnt --fstab -t nfs,nfs4 -rn -o TARGET); do u=$(systemd-escape -p --suffix=mount $t); '
    'echo "nfs_$(echo $t | tr -c "a-zA-Z0-9\\n" _)=hedef:$t|kaynak:$(findmnt --fstab -rn -o SOURCE $t)|fstab:$(findmnt --fstab -rn -o OPTIONS $t)'
    '|etkin:$(findmnt -rn -o OPTIONS $t || echo BAGLI_DEGIL)'
    '|ilk_baglama:$(journalctl -b -u $u -o short-unix --no-pager 2>/dev/null | awk "/Mounted /{print int(\\$1); exit}")'
    '|baglama_sayisi:$(journalctl -b -u $u --no-pager 2>/dev/null | grep -c "Mounted ")'
    '|hata:$(journalctl -b -u $u --no-pager 2>/dev/null | grep -iE "fail|timed out|error|denied" | tail -2 | tr "\\n;|" "   " | cut -c1-240)'
    '|readahead:$(cat /sys/class/bdi/$(findmnt -rn -o MAJ:MIN $t)/read_ahead_kb 2>/dev/null)"; done; '
    'echo nfsrahead_conf=$(grep -A4 "^\\[nfsrahead\\]" /etc/nfs.conf 2>/dev/null | grep -E "^(nfs|nfs4|default)" | tr "\\n" " "); '
    'echo nfs_cekirdek=$(journalctl -k -b --no-pager 2>/dev/null | grep -iE "nfs: server .* (not responding|OK)|nfs.*(error|fail)" '
    '| tail -4 | tr "\\n;|" "   " | cut -c1-400); '
    'for r in docker podman; do command -v $r >/dev/null 2>&1 || continue; '
    'echo "motor_$r=after_remote_fs:$(systemctl show $r.service -p After --value 2>/dev/null | grep -c remote-fs.target)'
    '|requires_mounts:$(systemctl show $r.service -p RequiresMountsFor --value 2>/dev/null)'
    '|baslangic:$(date -d "$(systemctl show $r.service -p ActiveEnterTimestamp --value)" +%s 2>/dev/null)"; '
    'for c in $($r ps -q 2>/dev/null); do echo "konteyner_${r}_$c=$($r inspect -f "{{.Name}}" $c)'
    '|basladi:$(date -d "$($r inspect -f "{{.State.StartedAt}}" $c | cut -d" " -f1-3)" +%s 2>/dev/null)'
    '|baglar:$($r inspect -f "{{range .Mounts}}{{.Source}}>{{.Destination}}:{{.Propagation}},{{end}}" $c)"; done; done'
)

MAN_NOFAIL = ("man systemd.mount: ağ bağlaması remote-fs.target'tan ÖNCE sıralanır \"unless one or more mount options among nofail, "
              "x-systemd.wanted-by=, and x-systemd.required-by= is set\"")
MAN_RMF = "man systemd.unit: RequiresMountsFor= \"Automatically adds dependencies of type Requires= and After= for all mount units\""


def kv_oku(metin):
    return dict(re.findall(r"^([a-z0-9_]+)=(.*)$", metin, re.M))


def alanlar(deger):
    out = {}
    for parca in deger.split("|"):
        k, _, v = parca.partition(":")
        out[k.strip()] = v.strip()
    return out


def sayi(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def tani(kv):
    bulgular, notlar, eksik = [], [], []
    baglamalar = [alanlar(v) for k, v in sorted(kv.items()) if k.startswith("nfs_") and k not in ("nfs_cekirdek",)]
    motorlar = {k[len("motor_"):]: alanlar(v) for k, v in kv.items() if k.startswith("motor_")}
    konteynerler = []
    for k, v in kv.items():
        if k.startswith("konteyner_"):
            ad, _, kalan = v.partition("|")
            a = alanlar(kalan)
            a["ad"], a["motor"] = ad.lstrip("/"), k.split("_")[1]
            konteynerler.append(a)
    if not baglamalar:
        notlar.append("fstab'da NFS satırı yok (findmnt --fstab -t nfs,nfs4) — bu betik fstab'daki NFS bağlamalarına bakar")
    for b in baglamalar:
        t = b.get("hedef", "?")
        print("Bağlama %s ← %s · fstab: %s · etkin: %s · readahead: %s KB" % (t, b.get("kaynak", "?"), b.get("fstab", "?"),
                                                                       b.get("etkin", "?"), b.get("readahead") or "?"))
        if b.get("etkin") == "BAGLI_DEGIL":
            bulgular.append(("%s fstab'da var, şu an bağlı değil" % t, "uygulama bağlama noktasının altındaki yerel dizini görür/yazar",
                             "findmnt (ölçüldü)"))
        if "nofail" in b.get("fstab", "").split(","):
            bulgular.append(("%s fstab'da nofail ile" % t, "bağlama remote-fs.target sıralamasından çıkar; remote-fs.target'a göre "
                             "sıralanan servisler bağlamayı beklemeden başlayabilir", MAN_NOFAIL))
        if b.get("hata"):
            bulgular.append(("%s bu açılışta hata satırı: %s" % (t, b["hata"]), "bağlama denemesi başarısız/gecikmeli olmuş",
                             "journalctl -b -u <birim> (ölçüldü)"))
        n = sayi(b.get("baglama_sayisi"))
        if n and n > 1:
            notlar.append("%s bu açılışta %d kez bağlandı (elle yeniden bağlama dahil) — ilk bağlama zamanı karşılaştırmada kullanılır" % (t, n))
        ilk = sayi(b.get("ilk_baglama"))
        if not ilk:
            eksik.append("%s için bu açılışta journal'da 'Mounted' satırı yok — bağlama zamanı ölçülemedi (journal kalıcı mı: "
                         "`journalctl --list-boots`)" % t)
        for k in konteynerler:
            kullanan = [m for m in k.get("baglar", "").split(",") if m and (m.split(">")[0] == t or m.split(">")[0].startswith(t.rstrip("/") + "/"))]
            if not kullanan:
                continue
            bas = sayi(k.get("basladi"))
            satir = "%s konteyneri (%s) %s kullanıyor: %s" % (k["ad"], k["motor"], t, " ".join(kullanan))
            if ilk and bas and bas < ilk:
                bulgular.append((satir + " — konteyner NFS bağlanmadan %d sn ÖNCE başladı" % (ilk - bas),
                                 "tahmin: bağlama yayılımı private/rprivate ise konteyner, NFS yerine bağlama noktasının altındaki "
                                 "yerel dizini görür ve oraya yazar (kayıtlar yerel diske düşer, NFS bağlanınca altında gizli kalır). "
                                 "Kesinleştiren: konteyner içinden `ls <hedef>` ile host'taki `ls %s` karşılaştırması" % t,
                                 "zaman damgaları (ölçüldü: konteyner StartedAt, journal 'Mounted'); yayılım satırda"))
            elif ilk and bas:
                notlar.append(satir + " — konteyner bağlamadan %d sn sonra başladı (şimdiki başlangıç; önceki yeniden başlatmaları göstermez)"
                              % (bas - ilk))
    for r, m in motorlar.items():
        hedefler = [b.get("hedef") for b in baglamalar if b.get("hedef")]
        rmf = m.get("requires_mounts", "")
        bekler = m.get("after_remote_fs") not in ("", "0") or all(h in rmf.split() for h in hedefler)
        if hedefler and not bekler and any(any(h in kk.get("baglar", "") for h in hedefler) for kk in konteynerler if kk["motor"] == r):
            bulgular.append(("%s.service remote-fs.target'tan sonra sıralı değil, RequiresMountsFor'da NFS hedefi yok (%s)" % (r, rmf or "boş"),
                             "konteyner motoru (ve restart politikalı konteynerler) NFS bağlanmadan başlayabilir; olası düzeltme "
                             "(değişiklik, sahibin kararı): drop-in `[Unit] RequiresMountsFor=%s`" % " ".join(hedefler),
                             MAN_RMF + "; systemctl show (ölçüldü)"))
    if kv.get("nfs_cekirdek"):
        notlar.append("çekirdek NFS satırları (bu açılış): " + kv["nfs_cekirdek"])
    if any(b.get("readahead") for b in baglamalar):
        notlar.append("readahead: nfsrahead udev ile ayarlar, değer /etc/nfs.conf [nfsrahead] (%s); varsayılan 128 — man nfsrahead. "
                      "Bu açılış sorunuyla ilgisi ölçülmedi" % (kv.get("nfsrahead_conf") or "bölüm yok"))
    eksik.append("kullanıcıdan: hangi açılış (saat), ne görüldü (dizin boş mu / hata mı / uygulama mı), yeniden bağlama nasıl yapıldı, "
                 "konteyner/servis o arada yeniden başlatıldı mı")
    return bulgular, notlar, eksik


# ---- performans (mountstats) — biçim: /usr/sbin/nfsiostat (nfs-utils 2.8.3) DeviceData.__parse_*_line ----
PERF_ISLEM = ("READ", "WRITE", "COMMIT", "GETATTR", "LOOKUP", "ACCESS", "READDIR", "READDIRPLUS", "OPEN", "CLOSE", "LOCK")
MAN_SOFT = ("man nfs (soft / softerr / hard): \"A so-called \\\"soft\\\" timeout can cause silent data corruption in certain cases\" — "
            "varsayılan hard (istek süresiz yinelenir)")
MAN_RETRANS = ("man nfs (retrans=n): \"The NFS client generates a \\\"server not responding\\\" message after retrans retries\"; "
               "man nfsiostat: retrans = yeniden gönderim sayısı")


def perf_oku(metin):
    """mountstats metni → [(zaman|None, {hedef: bağlama})]. '#zaman <epoch>' satırı yeni okumayı başlatır."""
    okumalar, b = [], None
    simdiki = None
    for satir in metin.splitlines():
        w = satir.split()
        if not w:
            continue
        if w[0] == "#zaman":
            simdiki = {"zaman": float(w[1]) if len(w) > 1 else None, "baglar": {}}
            okumalar.append(simdiki)
            b = None
            continue
        if w[0] == "device" and len(w) >= 8:
            if simdiki is None:
                simdiki = {"zaman": None, "baglar": {}}
                okumalar.append(simdiki)
            if w[7] not in ("nfs", "nfs4"):
                b = None
                continue
            b = {"kaynak": w[1], "hedef": w[4], "tur": w[7], "secenek": {}, "islem": {}, "xprt": None, "yas": None, "rpc": False}
            if w[4] in simdiki["baglar"]:  # aynı okumada aynı hedef ikinci kez (ör. iki cat) → yeni okuma say
                simdiki = {"zaman": None, "baglar": {}}
                okumalar.append(simdiki)
            simdiki["baglar"][w[4]] = b
            continue
        if b is None:
            continue
        if w[0] == "age:":
            b["yas"] = int(w[1])
        elif w[0] == "opts:":
            for o in "".join(w[1:]).split(","):
                k, _, v = o.partition("=")
                b["secenek"][k] = v if _ else True
        elif w[0] == "RPC":
            b["rpc"] = True
        elif w[0] == "xprt:" and len(w) > 2:
            # tcp: port bind connect connect_time idle sends recvs badxids inflight backlog (nfsiostat __parse_rpc_line)
            if w[1] in ("tcp", "rdma") and len(w) >= 12:
                b["xprt"] = {"proto": w[1], "baglanti": int(w[4]), "gonderim": int(w[7]), "badxid": int(w[9]), "backlog": int(w[11])}
            elif w[1] == "udp" and len(w) >= 9:
                b["xprt"] = {"proto": "udp", "baglanti": None, "gonderim": int(w[4]), "badxid": int(w[6]), "backlog": int(w[8])}
        elif b["rpc"] and w[0].endswith(":") and w[0] != "per-op":
            try:
                b["islem"][w[0][:-1]] = [int(x) for x in w[1:]]
            except ValueError:
                pass
    return okumalar


def perf_satir(ad, d, sure):
    # nfsiostat __print_rpc_op_stats: ops=d[0], retrans=d[1]-d[0], kB=(d[3]+d[4])/1024, queue=d[5], rtt=d[6], exe=d[7], err=d[8]
    ops = d[0]
    if ops <= 0:
        return None
    yg = d[1] - d[0]
    kb = (d[3] + d[4]) / 1024.0
    hata = d[8] if len(d) >= 9 else None
    return {"ad": ad, "ops": ops, "ops_s": ops / sure, "kb_s": kb / sure, "kb_op": kb / ops, "yg": yg, "yg_y": yg * 100.0 / ops,
            "rtt": d[6] / ops, "exe": d[7] / ops, "kuyruk": d[5] / ops, "hata": hata}


def perf(metin):
    okumalar = [o for o in perf_oku(metin) if o["baglar"]]
    if not okumalar:
        print("NFS bağlaması yok (mountstats'ta fstype nfs/nfs4 satırı bulunamadı) — `nfs-tani.py perf-komut` çıktısını ver")
        return 2
    son = okumalar[-1]
    once = okumalar[0] if len(okumalar) >= 2 else None
    aralik = None
    if once and once["zaman"] and son["zaman"]:
        aralik = son["zaman"] - once["zaman"]
    bulgu_var = False
    for hedef, b in sorted(son["baglar"].items()):
        s = b["secenek"]
        surum = s.get("vers", "?")
        onceki = once["baglar"].get(hedef) if once else None
        if onceki and aralik and aralik > 0:
            kip, sure = "aralık %.0f sn" % aralik, aralik
        else:
            kip, sure = "bağlamadan beri (age %s sn)" % b["yas"], float(b["yas"] or 1)
            onceki = None
        print("== %s  ←  %s   NFS v%s  [%s]" % (hedef, b["kaynak"], surum, kip))
        anahtar = ["proto", "rsize", "wsize", "nconnect", "timeo", "retrans", "sec", "lookupcache", "actimeo", "acregmin", "acregmax", "local_lock"]
        bayrak = [k for k in ("hard", "soft", "softerr", "noac", "nocto", "nolock") if k in s]
        print("   seçenek: " + " ".join("%s=%s" % (k, s[k]) for k in anahtar if k in s and s[k] is not True) +
              ("  " + " ".join(bayrak) if bayrak else ""))
        x = b["xprt"]
        if x:
            if onceki and onceki["xprt"]:
                ox = onceki["xprt"]
                bag = None if x["baglanti"] is None else x["baglanti"] - (ox["baglanti"] or 0)
                print("   taşıma: %s · aralıkta yeniden bağlanma %s · badxid %d" % (x["proto"], bag, x["badxid"] - ox["badxid"]))
            else:
                print("   taşıma: %s · bağlanma sayısı %s · badxid %d" % (x["proto"], x["baglanti"], x["badxid"]))
        print("   %-12s %9s %10s %8s %14s %9s %9s %9s %8s" % ("işlem", "op/s", "kB/s", "kB/op", "yeniden(%)", "RTT ms", "exe ms",
                                                                 "kuyruk", "hata"))
        satirlar = []
        for ad in PERF_ISLEM:
            if ad not in b["islem"]:
                continue
            d = b["islem"][ad]
            if onceki and ad in onceki["islem"]:
                d = [y - e for y, e in zip(d, onceki["islem"][ad])]
            r = perf_satir(ad, d, sure)
            if r:
                satirlar.append(r)
                print("   %-12s %9.2f %10.1f %8.1f %8d (%4.1f) %9.2f %9.2f %9.2f %8s" % (
                    ad.lower(), r["ops_s"], r["kb_s"], r["kb_op"], r["yg"], r["yg_y"], r["rtt"], r["exe"], r["kuyruk"],
                    "-" if r["hata"] is None else r["hata"]))
        if not satirlar:
            print("   (bu %s işlem yok — yük yokken ölçüldü; yük altında tekrar al)" % ("aralıkta" if onceki else "bağlamada"))
        if "soft" in s or "softerr" in s:
            bulgu_var = True
            print("   BULGU: %s ile bağlı → istek zaman aşımında uygulamaya EIO/ETIMEDOUT döner\n      kaynak: %s" %
                  ("soft" if "soft" in s else "softerr", MAN_SOFT))
        for r in satirlar:
            if r["yg"] > 0:
                bulgu_var = True
                print("   BULGU: %s yeniden gönderim %d (%%%.1f) — ağ/sunucu yanıtı gecikiyor; aynı anda `journalctl -k` "
                      "\"not responding\" satırına bak\n      kaynak: %s" % (r["ad"].lower(), r["yg"], r["yg_y"], MAN_RETRANS))
            if r["hata"]:
                bulgu_var = True
                print("   BULGU: %s %d işlem hata durumuyla bitti (man nfsiostat: errors = status < 0)" % (r["ad"].lower(), r["hata"]))
        for r in satirlar:
            if r["exe"] > 0 and r["exe"] - r["rtt"] > r["rtt"]:
                print("   NOT: %s exe %.2f ms, RTT %.2f ms — sürenin yarıdan fazlası ağ dışında, istemci tarafında (man nfsiostat: exe = "
                      "isteğin çekirdeğe verilişinden bitişine, RTT'yi içerir)" % (r["ad"].lower(), r["exe"], r["rtt"]))
        if surum.startswith("3"):
            print("   NOT: v3 — kilit NLM yan protokolüyle (man nfs lock/nolock), mountd/rpcbind gerekir; v4'te kilit ve bağlama 2049'da tek "
                  "protokolde (man nfs, \"Options for NFS version 4 only\" port=n)")
        elif surum.startswith("4"):
            print("   NOT: v4 — kullanıcı/grup adı ↔ UID/GID eşlemesi NFSv4 alanında (man idmapd.conf: Domain \"The local NFSv4 domain "
                  "name\", varsayılan makinenin DNS alanı) — rhel-nfs §3")
    if not once:
        print("NOT: tek okuma — değerler bağlamadan beri ortalama; güncel durum için `perf-komut` (iki okuma) kullan")
    print("Karşılaştırma aynı komutla: sorunlu ↔ sağlam sunucu ya da önce ↔ sonra (rhel-nfs §4). Eşik yok — tek ölçümden \"yavaş\" deme.")
    return 1 if bulgu_var else 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import re")[0].replace("# ", "").replace("#!/usr/bin/env python3\n", ""))
        return 0
    if argv[0] == "komut":
        print("ssh root@<sunucu> '%s'" % KOMUT)
        return 0
    if argv[0] == "tani" and len(argv) > 1:
        metin = sys.stdin.read() if argv[1] == "-" else open(argv[1], encoding="utf-8", errors="replace").read()
        kv = kv_oku(metin)
        if "acilis" not in kv:
            print("acilis= satırı yok — `nfs-tani.py komut` çıktısındaki komutu çalıştır")
            return 2
        bulgular, notlar, eksik = tani(kv)
        for i, (b, ne, kaynak) in enumerate(bulgular, 1):
            print("BULGU %d: %s\n    → %s\n    kaynak: %s" % (i, b, ne, kaynak))
        for n in notlar:
            print("NOT: " + n)
        for e in eksik:
            print("EKSİK KANIT: " + e)
        return 1 if bulgular else 0
    if argv[0] == "perf-komut":
        sn = argv[1] if len(argv) > 1 and argv[1].isdigit() else "10"
        print("ssh root@<sunucu> 'echo \"#zaman $(date +%%s)\"; cat /proc/self/mountstats; sleep %s; "
              "echo \"#zaman $(date +%%s)\"; cat /proc/self/mountstats'" % sn)
        print("# çok sunucu: ansible <grup> -i <iş envanteri> -m shell -t cikti/filo/nfsperf -a '<tırnak içindeki komut>'"
              " → her sunucunun dosyası ayrı: nfs-tani.py perf cikti/filo/nfsperf/<sunucu>")
        return 0
    if argv[0] == "perf" and len(argv) > 1:
        metin = sys.stdin.read() if argv[1] == "-" else open(argv[1], encoding="utf-8", errors="replace").read()
        if metin.lstrip().startswith("{"):  # ansible -t çıktısı (JSON) → stdout
            import json
            try:
                metin = json.loads(metin).get("stdout", "")
            except ValueError:
                pass
        return perf(metin)
    print("alt komut: komut | tani | perf-komut | perf")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
