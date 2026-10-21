#!/usr/bin/env python3
# k8s-ozet.py — tek `kubectl get nodes,pods,events,ds,leases -A -o json` çıktısından küme durum özeti: node'lar (Ready/koşul
# mesajı/süre, lease tazeliği, sürüm sapması), çalışmayan pod'lar (altyapı / uygulama ayrı), yeniden başlayan konteynerler ve
# SON ÇIKIŞ SEBEBİ (OOMKilled / exit kodu sınıfı), DaemonSet istenen ↔ hazır ↔ node sayısı, uyarı olayları (gruplu, zamanlı).
# Yalnız okur (stdin / dosya). Süreler betikte hesaplanır.
# Neden (saha G7, G8, G12, G50, G59, G62, G65): model "container runtime down"u kaynaksız yazdı, NotReady node'a yüzde verdi,
# Exit Code 2 + panic'i "OOM" sandı, "Antrea 18/18 ↔ 17 node" çelişkisini açıklamadı, tam node yaml'ı döküp bağlamı doldurdu,
# yaş/kalan gün hesaplarını kafadan yaptı. Bu betik her satırı nesnenin kendi alanından basar.
#
# kullanım (SKILL.md — k8s-sorun "Durum özeti", rke2-denetim §2-§4):
#   ssh root@<master> "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes,pods,events,ds,leases -A -o json" | k8s-ozet.py -
#   k8s-ozet.py <dosya.json>      [--altyapi ns1,ns2,…]  [--olay N] [--restart N]
import datetime
import json
import re
import sys

ALTYAPI = ["kube-system", "kube-node-lease", "kube-public", "cattle-system", "cattle-fleet-system", "cattle-fleet-local-system",
           "cattle-impersonation-system", "cattle-monitoring-system", "cattle-logging-system", "cattle-neuvector-system",
           "calico-system", "tigera-operator", "kube-flannel", "ingress-nginx", "cert-manager", "longhorn-system",
           "gpu-operator", "nvidia-gpu-operator", "fleet-default", "fleet-local"]


def zaman(s):
    if not s:
        return None
    m = re.match(r"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})", s)
    if not m:
        return None
    return datetime.datetime.strptime(m.group(1) + " " + m.group(2), "%Y-%m-%d %H:%M:%S")


def sure(t, simdi):
    if t is None:
        return "?"
    s = int((simdi - t).total_seconds())
    if s < 0:
        return "gelecekte(%ds — saat farkı?)" % -s
    if s < 120:
        return "%dsn" % s
    if s < 7200:
        return "%ddk" % (s // 60)
    if s < 172800:
        return "%dsa" % (s // 3600)
    return "%dg" % (s // 86400)


def cikis_sinifi(term):
    if not term:
        return "?"
    neden, kod = term.get("reason") or "", term.get("exitCode")
    if neden == "OOMKilled":
        return "OOMKilled (bellek limiti — exit %s)" % kod
    if kod == 137:
        return "exit 137 (SIGKILL, reason=%s — liveness öldürmesi ya da OOM; Unhealthy olayı / dmesg oom ile ayırt et)" % (neden or "?")
    if kod == 143:
        return "exit 143 (SIGTERM — durduruldu/liveness)"
    if kod == 0:
        return "exit 0 (%s — normal bitiş)" % (neden or "Completed")
    if kod is not None:
        return "exit %s (%s — uygulama hatası; OOM DEĞİL — logs --previous)" % (kod, neden or "Error")
    return neden or "?"


def oku(argv):
    if argv and argv[0] != "-":
        metin = open(argv[0], encoding="utf-8", errors="replace").read()
    else:
        metin = sys.stdin.read()
    dec, i, out = json.JSONDecoder(), 0, []
    while True:
        while i < len(metin) and metin[i] not in "{[":
            i += 1
        if i >= len(metin):
            break
        try:
            obj, i = dec.raw_decode(metin, i)
        except ValueError:
            i += 1
            continue
        out.extend(obj.get("items", []) if isinstance(obj, dict) and obj.get("kind", "").endswith("List") else [obj])
    return out


def main(argv):
    if argv and argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import datetime")[0])
        return 0
    secenek = lambda ad, vars: argv[argv.index(ad) + 1] if ad in argv else vars
    altyapi = set(ALTYAPI + [x for x in secenek("--altyapi", "").split(",") if x])
    olay_n, restart_n = int(secenek("--olay", 20)), int(secenek("--restart", 15))
    dosya = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or not argv[i - 1].startswith("--"))]
    nesneler = oku(dosya)
    tur = lambda k: [o for o in nesneler if o.get("kind") == k]
    nodes, pods, events, dss, leases = tur("Node"), tur("Pod"), tur("Event"), tur("DaemonSet"), tur("Lease")
    if not nesneler:
        print("JSON yok — kubectl/ssh hata verdi mi? Borusuz çalıştırıp hatayı oku. Sonuç YAZMA.")
        return 1
    simdi = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    print("Küme özeti — Node %d · Pod %d · Event %d · DaemonSet %d · Lease %d · referans saat %s UTC (bu makine)" % (
        len(nodes), len(pods), len(events), len(dss), len(leases), simdi.strftime("%Y-%m-%d %H:%M:%S")))

    # --- Node'lar
    lease_t = {l["metadata"]["name"]: zaman((l.get("spec") or {}).get("renewTime")) for l in leases
               if l.get("metadata", {}).get("namespace") == "kube-node-lease"}
    hazir_degil, baski, surumler = [], [], {}
    for n in nodes:
        ad = n["metadata"]["name"]
        st = n.get("status") or {}
        kosul = {c["type"]: c for c in st.get("conditions") or []}
        r = kosul.get("Ready", {})
        ni = st.get("nodeInfo") or {}
        anahtar = (ni.get("kubeletVersion", "?"), ni.get("osImage", "?"), ni.get("kernelVersion", "?"), ni.get("containerRuntimeVersion", "?"))
        surumler.setdefault(anahtar, []).append(ad)
        taint = [t.get("key", "").split("/")[-1] for t in (n.get("spec") or {}).get("taints") or []]
        if r.get("status") != "True":
            hazir_degil.append((ad, r, taint, lease_t.get(ad)))
        for k in ("MemoryPressure", "DiskPressure", "PIDPressure", "NetworkUnavailable"):
            if kosul.get(k, {}).get("status") == "True":
                baski.append((ad, k, kosul[k].get("message", "")))
    print("\n== Node'lar: %d toplam · Ready %d · Ready değil %d" % (len(nodes), len(nodes) - len(hazir_degil), len(hazir_degil)))
    for ad, r, taint, lt in hazir_degil:
        print("  ❌ %s · Ready=%s · %s süredir · reason=%s · mesaj: %s" % (
            ad, r.get("status", "?"), sure(zaman(r.get("lastTransitionTime")), simdi), r.get("reason", "?"), (r.get("message") or "")[:160]))
        print("     lease son yenileme: %s önce%s" % (sure(lt, simdi), "  · taint: " + ",".join(taint) if taint else ""))
    for ad, k, m in baski:
        print("  ⚠ %s · %s=True · %s" % (ad, k, m[:140]))
    if leases and nodes:
        bayat = [(ad, lt) for ad, lt in lease_t.items() if lt and (simdi - lt).total_seconds() > 60]
        if bayat:
            print("  ⚠ lease'i 60 sn'den eski node'lar (kubelet API'ye yazamıyor — Ready=True görünse de): " +
                  ", ".join("%s (%s)" % (a, sure(t, simdi)) for a, t in sorted(bayat)))
    if len(surumler) > 1:
        print("  ⚠ SÜRÜM SAPMASI — node'lar %d farklı (kubelet · OS · çekirdek · runtime) grubunda:" % len(surumler))
    for (kv, os_, kr, cr), adlar in sorted(surumler.items(), key=lambda x: -len(x[1])):
        print("    [%d] %s · %s · %s · %s : %s" % (len(adlar), kv, os_, kr, cr, " ".join(sorted(adlar)[:12]) + (" …" if len(adlar) > 12 else "")))

    # --- Çalışmayan pod'lar
    def pod_durum(p):
        st = p.get("status") or {}
        faz = st.get("phase", "?")
        for cs in (st.get("initContainerStatuses") or []) + (st.get("containerStatuses") or []):
            w = (cs.get("state") or {}).get("waiting")
            if w:
                return w.get("reason", "Waiting")
            t = (cs.get("state") or {}).get("terminated")
            if t and faz not in ("Succeeded",) and t.get("reason") != "Completed":
                return "Terminated:" + (t.get("reason") or str(t.get("exitCode")))
        if faz == "Running":
            hazir = [c.get("ready") for c in st.get("containerStatuses") or []]
            if hazir and not all(hazir):
                return "Running ama hazır değil (%d/%d)" % (sum(1 for x in hazir if x), len(hazir))
            return None
        if faz == "Succeeded":
            return None
        if faz == "Pending":
            for c in st.get("conditions") or []:
                if c.get("type") == "PodScheduled" and c.get("status") == "False":
                    return "Pending/zamanlanamadı: " + (c.get("message") or c.get("reason") or "")[:80]
        return faz + (":" + st.get("reason") if st.get("reason") else "")
    sorunlu = []
    for p in pods:
        d = pod_durum(p)
        if d:
            sorunlu.append((p["metadata"].get("namespace"), p["metadata"]["name"], d, (p.get("spec") or {}).get("nodeName", "-")))
    nr = {a for a, _, _, _ in hazir_degil}
    for baslik, kume in (("ALTYAPI", [s for s in sorunlu if s[0] in altyapi]), ("UYGULAMA", [s for s in sorunlu if s[0] not in altyapi])):
        print("\n== Çalışmayan/hazır olmayan pod'lar — %s: %d" % (baslik, len(kume)))
        nedenler = {}
        for ns, ad, d, node in kume:
            nedenler.setdefault(d.split(":")[0].split(" (")[0], []).append((ns, ad, node))
        for d, liste in sorted(nedenler.items(), key=lambda x: -len(x[1])):
            print("  %-34s %3d · %s" % (d, len(liste), " ".join("%s/%s@%s%s" % (ns, ad, node, "(NR)" if node in nr else "")
                                                          for ns, ad, node in liste[:6]) + (" …" if len(liste) > 6 else "")))
    if nr:
        print("  (NR) = Ready olmayan node'daki pod — API'deki durumu eski olabilir")

    # --- Yeniden başlamalar ve son çıkış sebebi
    rs = []
    for p in pods:
        for cs in (p.get("status") or {}).get("containerStatuses") or []:
            if cs.get("restartCount", 0) > 0:
                son = (cs.get("lastState") or {}).get("terminated")
                rs.append((cs["restartCount"], p["metadata"].get("namespace"), p["metadata"]["name"], cs.get("name"),
                           (p.get("spec") or {}).get("nodeName", "-"), son))
    rs.sort(key=lambda x: -x[0])
    print("\n== Yeniden başlayan konteynerler (en çok %d; toplam %d) — son çıkış sebebi lastState'ten" % (restart_n, len(rs)))
    for n_, ns, ad, kon, node, son in rs[:restart_n]:
        print("  %5d  %-55s node=%-22s son: %s · %s önce" % (
            n_, "%s/%s[%s]" % (ns, ad, kon), node, cikis_sinifi(son), sure(zaman((son or {}).get("finishedAt")), simdi)))

    # --- DaemonSet'ler
    sorunlu_ds = []
    for d in dss:
        st = d.get("status") or {}
        ist, haz, guncel = st.get("desiredNumberScheduled", 0), st.get("numberReady", 0), st.get("updatedNumberScheduled", 0)
        if ist != haz or ist != guncel or st.get("numberMisscheduled", 0):
            sorunlu_ds.append((d["metadata"].get("namespace"), d["metadata"]["name"], ist, haz, guncel, st.get("numberMisscheduled", 0)))
    print("\n== DaemonSet'ler: %d · sorunlu %d · küme node sayısı %d (istenen ≠ node sayısı normal olabilir: nodeSelector/toleration)" % (
        len(dss), len(sorunlu_ds), len(nodes)))
    for ns, ad, ist, haz, guncel, yanlis in sorunlu_ds:
        print("  ⚠ %s/%s · istenen %d · hazır %d · güncel %d%s" % (ns, ad, ist, haz, guncel, " · yanlış yerleşim %d" % yanlis if yanlis else ""))

    # --- Uyarı olayları
    def olay_t(e):
        return zaman(e.get("lastTimestamp") or e.get("eventTime") or ((e.get("series") or {}).get("lastObservedTime"))
                     or (e.get("metadata") or {}).get("creationTimestamp"))
    uyarilar = [e for e in events if e.get("type") == "Warning"]
    grup = {}
    for e in uyarilar:
        io = e.get("involvedObject") or e.get("regarding") or {}
        k = (e.get("reason", "?"), io.get("kind", "?"))
        g = grup.setdefault(k, {"say": 0, "nesne": set(), "son": None, "mesaj": e.get("message") or e.get("note") or ""})
        g["say"] += e.get("count") or 1
        g["nesne"].add("%s%s" % (io.get("namespace") + "/" if io.get("namespace") else "", io.get("name", "?")))
        t = olay_t(e)
        if t and (g["son"] is None or t > g["son"]):
            g["son"], g["mesaj"] = t, e.get("message") or e.get("note") or ""
    print("\n== Uyarı olayları (Warning): %d kayıt, %d farklı sebep — en yeni %d (event'ler varsayılan ~1 sa saklanır)" % (
        len(uyarilar), len(grup), olay_n))
    for (neden, kind), g in sorted(grup.items(), key=lambda x: x[1]["son"] or datetime.datetime.min, reverse=True)[:olay_n]:
        nesneler = sorted(g["nesne"])
        print("  %-24s %-10s ×%-4d son %s önce · %s · %s" % (neden, kind, g["say"], sure(g["son"], simdi),
              " ".join(nesneler[:4]) + (" …(+%d)" % (len(nesneler) - 4) if len(nesneler) > 4 else ""), g["mesaj"][:120].replace("\n", " ")))
    node_olay = sorted([(olay_t(e), (e.get("involvedObject") or {}).get("name"), e.get("reason")) for e in events
                        if (e.get("involvedObject") or {}).get("kind") == "Node" and olay_t(e)], key=lambda x: x[0])
    if node_olay:
        print("\n== Node olay zaman çizelgesi (UTC, son 20) — aynı dakikalardaki olaylar tek kalıp olabilir")
        for t, ad, neden in node_olay[-20:]:
            print("  %s  %-24s %s" % (t.strftime("%m-%d %H:%M:%S"), ad, neden))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
