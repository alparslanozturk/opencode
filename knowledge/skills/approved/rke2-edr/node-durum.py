#!/usr/bin/env python3
# node-durum.py — node (Kubernetes ya da düz RHEL) sağlık tanısı: CPU · RAM · disk · ağ · loglar (çekirdek/dmesg/journal/messages) +
# Kubernetes koşulları. Kararı model değil bu betik verir; sayılar ölçümden, eşikler yalnız kaynaklı (kubelet varsayılan tahliye eşikleri).
# Alp (2026-11-23): "sadece CPU değil — CPU, RAM, disk, network ve loglara bakmak lazım … dmesg kernel logları da"; saha G127 (yanlış
# sunucu, "SAHTE" yargısı) dersleri node-cpu.py ile aynı: IP kubectl'den, hostname eşleşmezse DUR, iki ölçüm farklıysa ikisi gösterilir.
# CPU bölümü node-cpu.py'den (aynı dizin) gelir. Geçmiş eğilim için rhel-performans/sar-ozet.py --son <süre>.
#
#   node-durum.py komut <node> [--saat N]     → iki SALT-OKUNUR komut: (1) 1. master'da kubectl (kümede değilse atla) · (2) node'da
#                                               (log penceresi son N saat, varsayılan 24)
#   node-durum.py tani <node> <dosya|->       → rapor. Çıkış 0 bulgu yok · 1 bulgu · 2 eksik · 3 yanlış sunucu · 4 node erişilemedi
#                                               (yalnız Kubernetes bölümü var — erişilemeyen node modu)
import datetime
import importlib.util
import os
import re
import sys

BURASI = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("node_cpu", os.path.join(BURASI, "node-cpu.py"))
nc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(nc)

K = nc.K
KUBE_EK = (
    'echo "#bolum kube2"; K describe node NODE | sed -n "/^Taints:/,/^Unschedulable:/p" | sed "s/^/kt /"; '
    'K describe node NODE | sed -n "/^Conditions:/,/^Addresses:/p" | sed "s/^/kc /"; '
    'K describe node NODE | sed -n "/^Allocated resources:/,/^Events:/p" | sed "s/^/ka /"; '
    'K get events -A --field-selector involvedObject.name=NODE --sort-by=.lastTimestamp 2>/dev/null | tail -12 | sed "s/^/ke /"; '
    'K get pods -A --field-selector spec.nodeName=NODE --no-headers -o custom-columns=NS:.metadata.namespace,AD:.metadata.name,'
    'RS:.status.containerStatuses[*].restartCount 2>/dev/null | sed "s/^/kr /"'
).replace("K ", K + " ")

# Çekirdek mesajı sınıfları — rhel-sorun §3 tablosu (anlamı oradadır); sıra önemlidir (ilk eşleşen)
CEKIRDEK = [
    ("OOM", r"out of memory|oom-kill|oom_reaper|memory cgroup out of memory"),
    ("hung task (D state — disk/NFS)", r"blocked for more than [0-9]+ seconds|hung_task"),
    ("soft/hard lockup · rcu stall", r"soft lockup|hard lockup|rcu.{0,20}stall"),
    ("disk/dosya sistemi hatası", r"i/o error|blk_update_request|xfs.{0,40}(error|corrupt|shutdown)|ext4-fs error|buffer i/o"),
    ("conntrack tablosu dolu", r"nf_conntrack: table full"),
    ("ağ arayüzü koptu/geldi", r"link is (down|up)|nic link is"),
    ("çekirdek hatası (Call Trace/BUG/Oops)", r"call trace|\bbug:|\boops\b|general protection"),
    ("segfault", r"segfault"),
]
DESEN = "|".join("(%s)" % d for _, d in CEKIRDEK)


def node_komut(saat):
    s = int(saat)
    return (
        'echo "#bolum node2"; echo pencere_saat=@SAAT@; echo simdi=$(date +%s); echo tz=$(date +%z); echo uptime_s=$(cut -d. -f1 /proc/uptime); '
        'cat /proc/diskstats | sed "s/^/ds1 /"; cat /proc/net/dev | sed "s/^/nd1 /"; echo t1=$(date +%s.%N); '
        + nc.NODE + '; '
        'cat /proc/diskstats | sed "s/^/ds2 /"; cat /proc/net/dev | sed "s/^/nd2 /"; echo t2=$(date +%s.%N); '
        'grep -E "^(MemTotal|MemAvailable|SwapTotal|SwapFree|Dirty|Committed_AS|CommitLimit):" /proc/meminfo | sed "s/^/mem /"; '
        'ps -eo rss=,comm= --sort=-rss | head -6 | sed "s/^/rss /"; '
        'for f in cpu memory io; do echo "psi $f $(cat /proc/pressure/$f 2>/dev/null | tr "\\n" " ")"; done; '
        'echo dstate=$(ps -eo stat= | grep -c "^D"); '
        'df -P -x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null | sed "s/^/df /"; '
        'df -Pi -x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null | sed "s/^/dfi /"; '
        'echo ct=$(cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null)/$(cat /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null); '
        'echo journal_kalici=$(test -d /var/log/journal && echo evet || echo hayir); '
        'echo boot_sayisi=$(journalctl --list-boots --no-pager 2>/dev/null | grep -cE "^ *-?[0-9]+ "); '
        'echo dmesg_ilk=$(dmesg -T 2>/dev/null | head -1 | cut -c2-25); '
        'echo messages_eski=$(ls /var/log/messages-* 2>/dev/null | head -1); '
        'journalctl -k --since "-@SAAT@h" --no-pager -o short-iso 2>/dev/null | grep -iE "@DESEN@" | tail -300 | sed "s/^/kj /"; '
        'dmesg -T 2>/dev/null | grep -iE "@DESEN@" | tail -150 | sed "s/^/dm /"; '
        'grep -hiE "@DESEN@" /var/log/messages 2>/dev/null | tail -150 | sed "s/^/ms /"; '
        'journalctl -p 4 --since "-@SAAT@h" --no-pager -o short 2>/dev/null | awk "{print \\$5}" | sed "s/\\[.*//; s/:\\$//" '
        '| sort | uniq -c | sort -rn | head -12 | sed "s/^/ju /"; '
        'echo sysstat=$(rpm -q sysstat 2>/dev/null | head -1); '
        'echo sa_timer=$(systemctl is-enabled sysstat-collect.timer 2>/dev/null); echo sa_cron=$(grep -s -c "sa1" /etc/cron.d/sysstat); '
        'echo sa_history=$(grep -h "^HISTORY" /etc/sysconfig/sysstat 2>/dev/null); '
        'echo sa_aralik=$(systemctl cat sysstat-collect.timer 2>/dev/null | grep -i "^OnCalendar" | head -1); '
        'echo sa_dosya=$(ls /var/log/sa/sa[0-9]* 2>/dev/null | wc -l)'
    ).replace("@SAAT@", str(s)).replace("@DESEN@", DESEN)


def satirlar(metin, onek):
    return [s[len(onek) + 1:] for s in metin.splitlines() if s.startswith(onek + " ")]


def kv(metin):
    d = {}
    for s in metin.splitlines():
        m = re.match(r"^([a-z_0-9]+)=(.*)$", s)
        if m:
            d[m.group(1)] = m.group(2).strip()
    return d


def diskstats(ls):
    d = {}
    for s in ls:
        w = s.split()
        if len(w) >= 14 and re.fullmatch(r"sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|dm-\d+|md\d+", w[2]):
            # Documentation/admin-guide/iostats.rst: 4 reads, 7 ms reading, 8 writes, 11 ms writing, 13 ms doing I/O
            d[w[2]] = [int(x) for x in w[3:14]]
    return d


def netdev(ls):
    d = {}
    for s in ls:
        if ":" not in s:
            continue
        ad, deger = s.split(":", 1)
        w = deger.split()
        if len(w) >= 16:
            # /proc/net/dev: rx bytes packets errs drop … (8) · tx bytes packets errs drop …
            d[ad.strip()] = [int(x) for x in w[:16]]
    return d


def kib(x):
    return "%.1f GiB" % (x / 1048576.0) if x >= 1048576 else "%.0f MiB" % (x / 1024.0)


def tani(node, metin):
    d = kv(metin)
    kube = "#bolum kube" in metin
    dugum = "#bolum node2" in metin
    bulgu = []
    if not kube and not dugum:
        print("EKSİK: ne kubectl ne node bölümü var — `node-durum.py komut %s` çıktısındaki komutları çalıştır" % node)
        return 2
    if dugum:
        h = d.get("hostname", "")
        if nc.kisa(h) != nc.kisa(node):
            print("DUR: ölçülen sunucu '%s', istenen node '%s' — YANLIŞ SUNUCU. Node komutunu kubectl'in verdiği IP'ye (%s) çalıştır; "
                  "bu çıktıdan sonuç yazma." % (h or "?", node, d.get("node_ip", "?")))
            return 3
    print("== %s — %s" % (node, "node + Kubernetes" if (kube and dugum) else ("yalnız node (kümede değil ya da kubectl verilmedi)"
                                                                            if dugum else "YALNIZ Kubernetes — NODE'A ERİŞİLEMEDİ")))
    # --- Kubernetes tarafı (koşullar, taint, olaylar, restart)
    if kube:
        kc = satirlar(metin, "kc")
        kosul = []
        for s in kc:
            w = s.split()
            if len(w) >= 2 and w[0] in ("Ready", "MemoryPressure", "DiskPressure", "PIDPressure", "NetworkUnavailable"):
                kosul.append((w[0], w[1], " ".join(w[2:])))
        if kosul:
            print("Kubernetes koşulları: " + " · ".join("%s=%s" % (a, b) for a, b, _ in kosul))
            for a, b, r in kosul:
                if (a == "Ready" and b != "True") or (a != "Ready" and b == "True"):
                    bulgu.append("Kubernetes %s=%s — %s" % (a, b, r[:160]))
        taint = " ".join(x.replace("Taints:", "").strip() for x in satirlar(metin, "kt") if not x.startswith("Unschedulable"))
        taint = " ".join(taint.split())
        if taint and taint != "<none>":
            print("taint: " + taint)
            if "unreachable" in taint:
                bulgu.append("node 'unreachable' taint'li — kubelet API'ye durum gönderemiyor (node kapalı/takılı/ağsız)")
        rs = []
        for s in satirlar(metin, "kr"):
            w = s.split()
            if len(w) >= 3:
                toplam = sum(int(x) for x in re.findall(r"\d+", w[2]))
                if toplam:
                    rs.append((toplam, "%s/%s" % (w[0], w[1])))
        if rs:
            rs.sort(reverse=True)
            print("bu node'da en çok yeniden başlayan pod'lar: " + " · ".join("%s %d" % (a, n) for n, a in rs[:6]))
        ke = satirlar(metin, "ke")
        if ke:
            print("node olayları (son %d):" % min(len(ke), 12))
            for s in ke[-8:]:
                print("  " + " ".join(s.split())[:170])
    if kube and not dugum:
        print("\nNODE'A ERİŞİLEMEDİ — yalnız Kubernetes'in son bildiği durum yukarıda. Sonraki adım: vCenter/konsoldan makine açık mı, "
              "takılı mı (ssh 'banner timeout' = TCP açık ama sshd/makine yanıt vermiyor); açılınca bu betiği yeniden çalıştır. Etcd "
              "çoğunluğu için k8s-sorun `k8s-ozet.py` (master sayısı).")
        for b in bulgu:
            print("BULGU: " + b)
        return 4
    # --- CPU (node-cpu.py)
    print("\n-- CPU")
    cpu_rc = nc.tani(node, metin if kube else "#bolum kube\nnode=%s\n" % node + metin)
    if cpu_rc == 1:
        bulgu.append("CPU bölümünde bulgu var (yukarıda)")
    # --- RAM
    print("\n-- RAM")
    mem = {}
    for s in satirlar(metin, "mem"):
        m = re.match(r"(\w+):\s+(\d+)", s)
        if m:
            mem[m.group(1)] = int(m.group(2))
    if mem:
        tot, av = mem.get("MemTotal", 0), mem.get("MemAvailable", 0)
        sw_t, sw_f = mem.get("SwapTotal", 0), mem.get("SwapFree", 0)
        print("toplam %s · kullanılabilir %s (%%%.0f) · swap %s%s · commit %s / sınır %s · dirty %s" % (
            kib(tot), kib(av), 100.0 * av / tot if tot else 0, kib(sw_t) if sw_t else "yok",
            " (kullanılan %s)" % kib(sw_t - sw_f) if sw_t else "", kib(mem.get("Committed_AS", 0)), kib(mem.get("CommitLimit", 0)),
            kib(mem.get("Dirty", 0))))
        if av and av < 100 * 1024:
            bulgu.append("kullanılabilir bellek %s < 100 MiB — kubelet varsayılan tahliye eşiği memory.available<100Mi "
                         "(kubernetes.io 'Node-pressure Eviction')" % kib(av))
    rss = [s.split(None, 1) for s in satirlar(metin, "rss")]
    if rss:
        print("en çok bellek: " + " · ".join("%s %s" % (w[1].strip(), kib(int(w[0]))) for w in rss if len(w) == 2 and w[0].isdigit()))
    # --- Disk
    print("\n-- Disk")
    for onek, ad, esik, kaynak in (("df", "doluluk", 10, "nodefs.available<10%"), ("dfi", "inode", 5, "nodefs.inodesFree<5%")):
        for s in satirlar(metin, onek)[1:]:
            w = s.split()
            if len(w) >= 6 and w[4].endswith("%"):
                kul = int(w[4].rstrip("%"))
                if 100 - kul < esik:
                    bulgu.append("%s %s %%%d — kalan %%%d < %%%d (kubelet varsayılan %s; bu dosya sistemi kubelet/containerd'ninse "
                                 "tahliye başlar)" % (w[5], ad, kul, 100 - kul, esik, kaynak))
    dfs = [s.split() for s in satirlar(metin, "df")[1:]]
    print("dosya sistemleri: " + " · ".join("%s %s" % (w[5], w[4]) for w in dfs if len(w) >= 6))
    ds1, ds2 = diskstats(satirlar(metin, "ds1")), diskstats(satirlar(metin, "ds2"))
    try:
        dt = float(d.get("t2", "0")) - float(d.get("t1", "0"))
    except ValueError:
        dt = 0.0
    if ds1 and ds2 and dt > 0:
        # ds1 → ds2 arası (top'un örnek süresi dahil, ~4-5 sn)
        sat = []
        for ad in sorted(ds2):
            if ad not in ds1:
                continue
            a, b = ds1[ad], ds2[ad]
            r, w_, rms, wms, io = b[0] - a[0], b[4] - a[4], b[3] - a[3], b[7] - a[7], b[9] - a[9]
            n = r + w_
            if n == 0 and io == 0:
                continue
            sat.append("%s r/s %.0f w/s %.0f await %s ms %%util %.0f" % (
                ad, r / dt, w_ / dt, "%.1f" % ((rms + wms) / float(n)) if n else "-", min(100.0, io / (dt * 10.0))))
        print("disk G/Ç (%.1f sn örnek, /proc/diskstats): %s" % (dt, " · ".join(sat) if sat else "G/Ç yok"))
    print("D durumunda (G/Ç bekleyen) süreç: %s" % d.get("dstate", "?"))
    # --- Ağ
    print("\n-- Ağ")
    n1, n2 = netdev(satirlar(metin, "nd1")), netdev(satirlar(metin, "nd2"))
    for ad in sorted(n2):
        if ad == "lo" or ad not in n1:
            continue
        a, b = n1[ad], n2[ad]
        rx, tx = (b[0] - a[0]) / dt if dt > 0 else 0, (b[8] - a[8]) / dt if dt > 0 else 0
        hata = (b[2] - a[2]) + (b[3] - a[3]) + (b[10] - a[10]) + (b[11] - a[11])
        top_hata = b[2] + b[3] + b[10] + b[11]
        if rx or tx or top_hata:
            print("  %-16s rx %.1f MB/s tx %.1f MB/s · hata+düşen (örnekte) %d · açılıştan beri rx_err %d rx_drop %d tx_err %d tx_drop %d"
                  % (ad, rx / 1e6, tx / 1e6, hata, b[2], b[3], b[10], b[11]))
        if hata > 0:
            bulgu.append("%s arayüzünde ölçüm sırasında %d hata/düşen paket arttı" % (ad, hata))
    ct = d.get("ct", "")
    if re.fullmatch(r"\d+/\d+", ct):
        c, m = (int(x) for x in ct.split("/"))
        print("conntrack: %d / %d (%%%.0f)" % (c, m, 100.0 * c / m if m else 0))
    # --- Loglar
    saat = d.get("pencere_saat", "?")
    print("\n-- Loglar (çekirdek: journal son pencere · dmesg açılıştan beri · /var/log/messages)")
    print("kaynak derinliği: journal kalıcı=%s · journal boot sayısı=%s · dmesg ilk satır=%s · açık kalma=%s · en eski messages=%s" % (
        d.get("journal_kalici", "?"), d.get("boot_sayisi", "?"), d.get("dmesg_ilk") or "?",
        "%.1f gün" % (int(d["uptime_s"]) / 86400.0) if d.get("uptime_s", "").isdigit() else "?", d.get("messages_eski") or "yok"))
    if d.get("journal_kalici") == "hayir":
        print("NOT: journal kalıcı değil — önceki açılışın logu yok (reboot öncesi için yalnız /var/log/messages ve sar). Kalıcı journal "
              "değişikliktir (CN).")
    for onek, ad in (("kj", "journal -k"), ("dm", "dmesg"), ("ms", "messages")):
        ls = satirlar(metin, onek)
        sayac = {}
        for s in ls:
            for sinif, desen in CEKIRDEK:
                if re.search(desen, s, re.I):
                    ilk, son, n = sayac.get(sinif, (s, s, 0))
                    sayac[sinif] = (ilk, s, n + 1)
                    break
        if sayac:
            for sinif, (ilk, son, n) in sorted(sayac.items(), key=lambda x: -x[1][2]):
                print("  [%s] %s: %d satır · ilk: %s" % (ad, sinif, n, " ".join(ilk.split())[:120]))
                if n > 1:
                    print("  %s son: %s" % (" " * (len(ad) + 2), " ".join(son.split())[:120]))
                if sinif != "ağ arayüzü koptu/geldi":
                    bulgu.append("%s: %s (%d satır) — anlamı rhel-sorun §3" % (ad, sinif, n))
        else:
            print("  [%s] çekirdek hata deseni yok (%d satır okundu)" % (ad, len(ls)))
    ju = satirlar(metin, "ju")
    if ju:
        print("uyarı+ (journal -p warning, son %s saat) birim başına: %s" % (
            saat, " · ".join(" ".join(s.split()[::-1]) for s in ju[:10])))
    # --- sysstat (geçmiş için)
    print("\n-- sysstat (geriye dönük ölçüm)")
    print("paket=%s · timer=%s · cron(sa1)=%s · %s · %s · arşiv dosyası=%s" % (
        d.get("sysstat") or "?", d.get("sa_timer") or "yok", d.get("sa_cron") or "0", d.get("sa_history") or "HISTORY=?", d.get("sa_aralik") or "aralık=?",
        d.get("sa_dosya", "?")))
    if "not installed" in (d.get("sysstat") or "") or d.get("sa_dosya") == "0":
        print("NOT: sar verisi yok — geriye dönük CPU/RAM/disk/ağ bakılamaz. sysstat kurmak/açmak değişikliktir (CN).")
    else:
        print("geçmiş: rhel-performans §6 — sar-ozet.py --son %sh (aynı pencere) · disk/ağ/swap/kuyruk dahil" % saat)
    print("\n== ÖZET: %s" % ("bulgu yok" if not bulgu else "%d bulgu" % len(bulgu)))
    for b in bulgu:
        print("BULGU: " + b)
    print("Yorum sınırı: sebep yalnız ölçülenle; olay anı için rhel-sorun olay-penceresi.py. Değişiklik (istisna, sınır, kalıcı journal) CN.")
    return 1 if bulgu else 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import datetime")[0].replace("# ", "").replace("#!/usr/bin/env python3\n", ""))
        return 0
    if argv[0] == "komut" and len(argv) > 1:
        n = argv[1]
        if not re.fullmatch(r"[A-Za-z0-9._-]+", n):
            print("node adı geçersiz: %r" % n)
            return 2
        saat = argv[argv.index("--saat") + 1] if "--saat" in argv and argv.index("--saat") + 1 < len(argv) else "24"
        if not saat.isdigit():
            print("--saat sayı olmalı")
            return 2
        print("# 1) 1. master'da (kubectl; node IP'si buradan — IP'yi kendin seçme). Master erişilmezse SIRADAKİ master (k8s-sorun):")
        print("ssh root@<master> '%s; %s'" % (nc.KUBE.replace("NODE", n), KUBE_EK.replace("NODE", n)))
        print("# 2) node'un KENDİSİNDE — IP = 1. çıktıdaki node_ip (kümede olmayan sunucuda doğrudan): log penceresi son %s saat" % saat)
        print("ssh root@<node_ip> '%s'" % node_komut(saat))
        print("# 3) birleştir:  { <1. komut>; <2. komut>; } | python3 %s tani %s -   (node'a ssh olmuyorsa yalnız 1. çıktıyı ver)" % (
            os.path.join(BURASI, "node-durum.py"), n))
        return 0
    if argv[0] == "tani" and len(argv) > 2:
        metin = sys.stdin.read() if argv[2] == "-" else open(argv[2], encoding="utf-8", errors="replace").read()
        return tani(argv[1], metin)
    print("alt komut: komut <node> [--saat N] | tani <node> <dosya|->")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
