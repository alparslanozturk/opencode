#!/usr/bin/env python3
# node-cpu.py — Kubernetes node'unda "CPU neden %100?" sorusunun deterministik tanısı. Kararı model değil bu betik verir.
# Saha G127 (Alp, 2026-11-23): gpu-dtx sdlgpumaster2 %100 CPU — ajan önce başka kümeye, sonra başka master'a (IP'yi kendisi seçti) baktı,
# kendi (yanlış sunucu) ölçümüyle çelişen `kubectl top node`'a "SAHTE" deyip kaynaksız bir metrics-server açıklaması uydurdu; asıl sebep
# (SEP sisamddaemon %356 / 4 çekirdek, %94 sy) hiç ölçülmedi. Bu betik üç hatayı da engeller:
#   1) node IP'si kubectl'den gelir (ajanın hafızasından değil), 2) ölçülen sunucunun hostname'i node adıyla eşleşmezse DURUR (çıkış 3),
#   3) "node CPU − pod'ların CPU'su = pod dışı süreçler" hesabını ve sürecin hangi ajana ait olduğunu betik yapar; iki ölçüm farklıysa
#      ikisi de gösterilir, hiçbiri "sahte" sayılmaz.
#
#   node-cpu.py komut <node>          → iki SALT-OKUNUR komut basar: (1) 1. master'da kubectl, (2) node'un kendisinde (IP 1. çıktıdan)
#   node-cpu.py tani <node> <dosya|-> → iki çıktının birleşimini okur: tablo + BULGU/NOT. Çıkış 0 bulgu yok · 1 bulgu · 2 eksik · 3 yanlış sunucu
import re
import sys

K = "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml"  # tam yol: kilitte kesin okuma (export/değişken yok)
KUBE = (
    'echo "#bolum kube"; echo node=NODE; '
    'echo node_ip=$(K get node NODE -o jsonpath="{.status.addresses[?(@.type==\\"InternalIP\\")].address}"); '
    'echo kapasite_cpu=$(K get node NODE -o jsonpath="{.status.capacity.cpu}"); '
    'echo "top_node=$(K top node NODE --no-headers 2>&1 | head -1)"; '
    'K get pods -A --field-selector spec.nodeName=NODE --no-headers -o custom-columns=NS:.metadata.namespace,AD:.metadata.name '
    '| sed "s/^/pod /"; K top pod -A --no-headers 2>/dev/null | sed "s/^/toppod /"'
).replace("K ", K + " ")
NODE = (
    'echo "#bolum node"; echo hostname=$(hostname); echo nproc=$(nproc); echo loadavg=$(cat /proc/loadavg); '
    'LC_ALL=C COLUMNS=512 top -b -n 2 -d 2 | awk "/^top -/{n++} n==2" | head -40 | sed "s/^/top /"; '
    'for s in sdcss.slice sdcss-amd.slice; do echo "slice $s $(systemctl show $s -p ActiveState -p CPUQuotaPerSecUSec -p CPUUsageNSec '
    '-p MemoryCurrent 2>/dev/null | tr "\\n" " ") $(grep -E "nr_throttled|throttled_usec" /sys/fs/cgroup/$s/cpu.stat 2>/dev/null '
    '| tr "\\n" " ")"; done'
)

# Süreç adı → sahibi (rke2-edr §0: SEP daemon'ları /usr/lib/symantec/status.sh, saha 2026-11-23; XDR traps_pmd; Twistlock defender)
SAHIP = [
    (re.compile(r"^(sis|caf|sdcss|rtvscan|symcfg)", re.I), "SEP"),
    (re.compile(r"^(traps|pmd$|cytool)", re.I), "XDR"),
    (re.compile(r"^(defender|fsmon)", re.I), "Twistlock"),
    (re.compile(r"^(etcd|kube-|kubelet|containerd|rke2|antrea|ovs-|cloud-controller)", re.I), "Kubernetes"),
    (re.compile(r"^(splunkd|process-export|node_export|pushprox)", re.I), "izleme/log"),
]
AJAN = {"SEP", "XDR", "Twistlock"}


def sahip(komut):
    for r, ad in SAHIP:
        if r.search(komut):
            return ad
    return ""


def milicore(x):
    x = x.strip()
    m = re.fullmatch(r"(\d+(?:\.\d+)?)m", x)
    if m:
        return float(m.group(1))
    m = re.fullmatch(r"(\d+(?:\.\d+)?)", x)
    return float(m.group(1)) * 1000 if m else None


def oku(metin):
    d = {"pod": set(), "toppod": {}, "top": [], "slice": {}, "_kube": False, "_node": False}
    for s in metin.splitlines():
        s = s.rstrip()
        if s.startswith("#bolum kube"):
            d["_kube"] = True
        elif s.startswith("#bolum node"):
            d["_node"] = True
        elif s.startswith("pod "):
            w = s.split()
            if len(w) >= 3:
                d["pod"].add((w[1], w[2]))
        elif s.startswith("toppod "):
            w = s.split()
            if len(w) >= 4:
                d["toppod"][(w[1], w[2])] = milicore(w[3])
        elif s.startswith("top "):
            d["top"].append(s[4:])
        elif s.startswith("slice "):
            w = s.split(None, 2)
            if len(w) >= 2:
                d["slice"][w[1]] = dict(re.findall(r"(\w+)=(\S+)", w[2] if len(w) > 2 else "")) or {}
                for k, v in re.findall(r"(nr_throttled|throttled_usec) (\d+)", w[2] if len(w) > 2 else ""):
                    d["slice"][w[1]][k] = v
        else:
            m = re.match(r"^(\w+)=(.*)$", s)
            if m:
                d[m.group(1)] = m.group(2).strip()
    return d


def top_coz(satirlar):
    cpu, surecler, bas = {}, [], None
    for s in satirlar:
        if s.startswith("%Cpu"):
            for v, k in re.findall(r"([\d.]+)\s*(us|sy|ni|id|wa|hi|si|st)", s.replace(",", " ")):
                cpu[k] = float(v)
        elif re.match(r"\s*PID\s+USER", s):
            bas = s.split()
        elif bas:
            w = s.split(None, len(bas) - 1)
            if len(w) == len(bas) and w[0].isdigit():
                r = dict(zip(bas, w))
                try:
                    surecler.append((float(r.get("%CPU", "0").replace(",", ".")), r.get("COMMAND", "?").strip(), r.get("USER", "")))
                except ValueError:
                    pass
    return cpu, surecler


def kisa(ad):
    return (ad or "").strip().lower().split(".")[0]


def tani(node, metin):
    d = oku(metin)
    eksik = [b for b in ("kube", "node") if not d["_" + b]]
    if eksik:
        print("EKSİK: %s bölümü yok — `node-cpu.py komut %s` çıktısındaki İKİ komutu da çalıştırıp birleştir" % (" ve ".join(eksik), node))
        return 2
    h = d.get("hostname", "")
    if kisa(h) != kisa(node):
        print("DUR: ölçülen sunucu '%s', istenen node '%s' — YANLIŞ SUNUCU. 2. komutu kubectl'in verdiği IP'ye (%s) çalıştır; "
              "bu çıktıdan sonuç yazma." % (h or "?", node, d.get("node_ip", "?")))
        return 3
    if d.get("node") and kisa(d["node"]) != kisa(node):
        print("DUR: kubectl bölümü '%s' için, istenen '%s'" % (d["node"], node))
        return 3
    nproc = int(d.get("nproc", "0") or 0)
    cpu, surecler = top_coz(d["top"])
    bulgu = 0
    print("Hedef: %s · kubectl IP %s · ölçülen sunucu %s ✓ (hostname eşleşti)" % (node, d.get("node_ip", "?"), h))
    print("Çekirdek: nproc %s (k8s kapasite %s) · yük ortalaması %s" % (nproc or "?", d.get("kapasite_cpu", "?"),
                                                                      " ".join(d.get("loadavg", "?").split()[:3])))
    if cpu:
        print("CPU (top, 2 sn örnek): us %.1f · sy %.1f · id %.1f · wa %.1f" % tuple(cpu.get(k, 0.0) for k in ("us", "sy", "id", "wa")))
    # kubectl tarafı
    tn = d.get("top_node", "").split()
    node_m = milicore(tn[1]) if len(tn) >= 3 else None
    pod_m = sum(v for k, v in d["toppod"].items() if k in d["pod"] and v is not None)
    eslesen = sum(1 for k in d["pod"] if k in d["toppod"])
    if node_m is not None:
        print("kubectl top node: %s (%s) · node'daki %d pod'un toplamı (kubectl top pod, %d eşleşti): %.0fm → pod dışı ≈ %.0fm"
              % (tn[1], tn[2], len(d["pod"]), eslesen, pod_m, node_m - pod_m))
    else:
        print("kubectl top node: alınamadı (%s)" % (d.get("top_node") or "boş"))
    if cpu and nproc:
        mesgul_m = (100.0 - cpu.get("id", 0.0)) / 100.0 * nproc * 1000
        print("top'a göre meşgul: ≈ %.0fm (= (100 − id) × %d çekirdek)" % (mesgul_m, nproc))
        if node_m is not None and abs(mesgul_m - node_m) > 0.25 * nproc * 1000:
            print("NOT: top ile kubectl top node farklı (%.0fm ↔ %.0fm) — iki ölçüm farklı anda/kaynaktan; HİÇBİRİ 'sahte' sayılmaz. "
                  "Aynı sunucuda ikisini art arda yeniden al." % (mesgul_m, node_m))
    # süreçler
    if surecler:
        print("En çok CPU (top; %100 = 1 çekirdek):")
        gruplar = {}
        sirali_s = sorted(surecler, reverse=True)
        for p, k, u in [x for x in sirali_s if x[0] >= 0.5][:10] or sirali_s[:3]:
            s = sahip(k)
            print("  %7.1f%%  %-22s %s" % (p, k[:22], s))
        for p, k, u in surecler:
            s = sahip(k) or "diğer"
            gruplar[s] = gruplar.get(s, 0.0) + p
        sirali = sorted(gruplar.items(), key=lambda x: -x[1])
        print("Sahibe göre toplam: " + " · ".join("%s %.0f%%" % (s, p) for s, p in sirali if p >= 0.5))
        en_s, en_p = max(((k, p) for p, k, u in surecler), key=lambda x: x[1])
        if sahip(en_s) in AJAN and en_p > 0:
            bulgu += 1
            pay = " (%.1f / %d çekirdek)" % (en_p / 100.0, nproc) if nproc else ""
            print("BULGU: CPU'nun en büyük kullanıcısı %s ajanının süreci %s — %%%.0f%s; pod değil, kubectl top pod'da görünmez."
                  % (sahip(en_s), en_s, en_p, pay))
    else:
        print("EKSİK KANIT: top çıktısı okunamadı (top satırları yok)")
    # SEP sınırı
    for ad, v in sorted(d["slice"].items()):
        q = v.get("CPUQuotaPerSecUSec", "")
        if v.get("ActiveState") and v.get("ActiveState") != "active":
            print("SEP sınırı %s: slice etkin değil (ActiveState=%s) — SEP bu slice'ta çalışmıyor ya da kurulu değil" % (ad, v.get("ActiveState")))
            continue
        if not q:
            print("SEP sınırı %s: yok (birim yok ya da okunamadı)" % ad)
            continue
        kota = None
        m = re.fullmatch(r"(\d+(?:\.\d+)?)(ms|s)", q)
        if m:
            kota = float(m.group(1)) / (1000.0 if m.group(2) == "ms" else 1.0)
        print("SEP sınırı %s: CPUQuotaPerSecUSec=%s%s · throttled %s kez" % (
            ad, q, " (= %.1f CPU)" % kota if kota else "", v.get("nr_throttled", "?")))
        if q == "infinity":
            bulgu += 1
            print("BULGU: %s CPU sınırı yok (infinity)" % ad)
        elif kota and nproc and kota >= nproc:
            bulgu += 1
            print("BULGU: %s kotası %.1f CPU ≥ makinenin %d çekirdeği — sınır bu makinede ETKİSİZ (man systemd.resource-control: "
                  "CPUQuota tek CPU'ya göredir). Kurum değeri %%400 sabit; çekirdek sayısına göre belirlenmeli (rke2-edr §2c)." % (ad, kota, nproc))
    print("Yorum sınırı: sebep yalnız yukarıdaki ölçümle; ajanın etkisi için ayrıca §3 (olay anı kanıtı). Değişiklik (istisna, sınır) "
          "güvenlik ekibi + CN.")
    return 1 if bulgu else 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import re")[0].replace("# ", "").replace("#!/usr/bin/env python3\n", ""))
        return 0
    if argv[0] == "komut" and len(argv) > 1:
        n = argv[1]
        if not re.fullmatch(r"[A-Za-z0-9._-]+", n):
            print("node adı geçersiz: %r" % n)
            return 2
        print("# 1) 1. master'da (kubectl; node IP'si buradan — IP'yi kendin seçme):")
        print("ssh root@<1. master> '%s'" % KUBE.replace("NODE", n))
        print("# 2) node'un KENDİSİNDE — IP = 1. çıktıdaki node_ip satırı:")
        print("ssh root@<node_ip> '%s'" % NODE)
        print("# 3) iki çıktıyı birleştirip ver:  { <1. komut>; <2. komut>; } | python3 %s tani %s -" % (__file__, n))
        return 0
    if argv[0] == "tani" and len(argv) > 2:
        metin = sys.stdin.read() if argv[2] == "-" else open(argv[2], encoding="utf-8", errors="replace").read()
        return tani(argv[1], metin)
    print("alt komut: komut <node> | tani <node> <dosya|->")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
