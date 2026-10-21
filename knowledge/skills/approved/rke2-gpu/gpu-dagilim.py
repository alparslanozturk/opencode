#!/usr/bin/env python3
# gpu-dagilim.py — tek `kubectl get nodes,pods -A -o json` çıktısından GPU dağılımı: node başına GPU kapasitesi/ayrılabilir ve
# ürün etiketi; GPU kullanan her pod için (adıyla aynı satırda) GPU limiti, Run:ai kesirli ayırma + GPU belleği, scheduler,
# vLLM parametreleri (tp × pp ↔ GPU limiti, çelişen --enable/--no-enable bayrakları), bellek limiti, /dev/shm sizeLimit,
# NCCL_* değişkenleri, restart + son çıkış sebebi. Yalnız okur (stdin / dosya).
# Neden (saha G51, G52, G59): `grep -A` ile birden çok pod'un alanları karıştı (0.35 GPU / 8Gi başka pod'undu), aynı pod'lar bir
# raporda "0.35/0.50/0.20", diğerinde "1 GPU" yazıldı, çelişen prefix-caching bayrakları ve shm sizeLimit'siz pod elle arandı.
#
# kullanım:
#   ssh root@<master> "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes,pods -A -o json" | gpu-dagilim.py -
#   gpu-dagilim.py <dosya.json>
import json
import re
import sys

RUNAI = ("runai-allocated-gpus", "runai-allocated-gpu-memory", "runai-allocated-mig-gpus", "gpu-fraction", "gpu-memory",
         "runai-nodepools", "runai-job-name")
VLLM = ("--tensor-parallel-size", "--pipeline-parallel-size", "--max-model-len", "--gpu-memory-utilization", "--max-num-seqs",
        "--dtype", "--quantization", "--served-model-name")


def oku(argv):
    metin = open(argv[0], encoding="utf-8", errors="replace").read() if argv and argv[0] != "-" else sys.stdin.read()
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
        out.extend(obj.get("items", []) if isinstance(obj, dict) and obj.get("kind", "").endswith("List") else [obj])


def gpu_say(kaynak):
    v = (kaynak or {}).get("nvidia.com/gpu")
    try:
        return float(v) if v is not None else None
    except ValueError:
        return None


def args_coz(liste):
    # ["--tensor-parallel-size", "2"] ya da ["--tensor-parallel-size=2"] ya da tek dizgide "vllm serve … --x 2"
    simge = []
    for a in liste or []:
        simge.extend(a.split() if (" " in a and a.strip().startswith(("vllm", "python", "--"))) else [a])
    deger, bayrak = {}, []
    for i, s in enumerate(simge):
        if not s.startswith("--"):
            continue
        if "=" in s:
            k, v = s.split("=", 1)
        else:
            k = s
            v = simge[i + 1] if i + 1 < len(simge) and not simge[i + 1].startswith("--") else True
        deger[k] = v
        bayrak.append(k)
    celisen = sorted({b[len("--no-"):] for b in bayrak if b.startswith("--no-") and ("--" + b[len("--no-"):]) in bayrak})
    return deger, celisen


def main(argv):
    if argv and argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import json")[0])
        return 0
    nesneler = oku(argv)
    nodes = [o for o in nesneler if o.get("kind") == "Node"]
    pods = [o for o in nesneler if o.get("kind") == "Pod"]
    if not nesneler:
        print("JSON yok — kubectl/ssh hata verdi mi? Sonuç YAZMA.")
        return 1
    print("GPU dağılımı — Node %d · Pod %d (değerler nesnelerin kendi alanlarından; boş = alan yok)" % (len(nodes), len(pods)))

    gpu_node = {}
    for n in nodes:
        st = n.get("status") or {}
        kap, ayr = gpu_say(st.get("capacity")), gpu_say(st.get("allocatable"))
        lb = (n.get("metadata") or {}).get("labels") or {}
        if kap or lb.get("nvidia.com/gpu.present") == "true":
            gpu_node[n["metadata"]["name"]] = {"kap": kap, "ayr": ayr, "urun": lb.get("nvidia.com/gpu.product", "?"),
                                               "say": lb.get("nvidia.com/gpu.count", "?"), "ayrilan": 0.0, "rez": 0.0, "pod": []}

    satirlar = []
    for p in pods:
        md, sp, st = p.get("metadata") or {}, p.get("spec") or {}, p.get("status") or {}
        ann = md.get("annotations") or {}
        limit = sum(gpu_say((c.get("resources") or {}).get("limits")) or 0 for c in sp.get("containers") or [])
        runai = {k: v for k, v in ann.items() if any(k.endswith(r) for r in RUNAI)}
        node = sp.get("nodeName", "-")
        if not limit and not runai:
            continue  # GPU istemeyen pod (GPU node'unda olsa da) — bu tablo GPU kullananlar
        ana = (sp.get("containers") or [{}])[0]
        deger, celisen = args_coz((ana.get("command") or []) + (ana.get("args") or []))
        bellek = ((ana.get("resources") or {}).get("limits") or {}).get("memory", "-")
        shm = "-"
        for v in sp.get("volumes") or []:
            ed = v.get("emptyDir")
            if ed is not None and ed.get("medium") == "Memory":
                yollar = [m.get("mountPath") for c in sp.get("containers") or [] for m in c.get("volumeMounts") or [] if m.get("name") == v.get("name")]
                if "/dev/shm" in yollar:
                    shm = ed.get("sizeLimit", "SINIRSIZ (sizeLimit yok)")
        nccl = ["%s=%s" % (e.get("name"), e.get("value")) for c in sp.get("containers") or [] for e in c.get("env") or []
                if str(e.get("name", "")).startswith(("NCCL_", "CUDA_VISIBLE", "NVIDIA_VISIBLE"))]
        rs = sum(cs.get("restartCount", 0) for cs in st.get("containerStatuses") or [])
        son = ""
        for cs in st.get("containerStatuses") or []:
            t = (cs.get("lastState") or {}).get("terminated")
            if t:
                son = "%s/exit %s" % (t.get("reason"), t.get("exitCode"))
        tp, pp = deger.get("--tensor-parallel-size"), deger.get("--pipeline-parallel-size")
        uyari = []
        try:
            beklenen = int(tp if tp not in (None, True) else 1) * int(pp if pp not in (None, True) else 1)
            if limit and (tp or pp) and abs(beklenen - limit) > 0.01:
                uyari.append("tp×pp=%d ≠ GPU limiti %g" % (beklenen, limit))
        except ValueError:
            pass
        if celisen:
            uyari.append("çelişen bayrak: " + ", ".join("--%s/--no-%s" % (c, c) for c in celisen))
        if (limit or 0) > 1 and shm.startswith("SINIRSIZ"):
            uyari.append("çok GPU'lu pod'da shm sizeLimit yok")
        ayr = runai.get("runai-allocated-gpus") or runai.get("gpu-fraction")
        try:
            pay = float(ayr) if ayr is not None else limit
        except ValueError:
            pay = limit
        if node in gpu_node and st.get("phase") == "Running":
            if md.get("namespace") == "runai-reservation":
                gpu_node[node]["rez"] += pay or 0  # Run:ai rezervasyon pod'u — kesirli pod'lar bu GPU'yu paylaşır (genel, tahmin)
            else:
                gpu_node[node]["ayrilan"] += pay or 0
                gpu_node[node]["pod"].append(md.get("name"))
        satirlar.append((node, md.get("namespace"), md.get("name"), st.get("phase"), limit, runai, sp.get("schedulerName", "-"),
                         deger, bellek, shm, nccl, rs, son, uyari))

    print("\n== GPU node'ları")
    for ad, g in sorted(gpu_node.items()):
        print("  %-26s %s · etiket sayısı %s · kapasite %s · ayrılabilir %s · Running iş pod'larına ayrılan %.2f (%d pod)%s" % (
            ad, g["urun"], g["say"], g["kap"], g["ayr"], g["ayrilan"], len(g["pod"]),
            " · Run:ai rezervasyon %.0f GPU (kesirli pod'lar bunları paylaşır — toplamla çift sayma; nvidia-smi ile doğrula)" % g["rez"] if g["rez"] else ""))
    print("\n== GPU kullanan pod'lar (%d) — her satır TEK pod; değerleri başka pod'a taşıma" % len(satirlar))
    for (node, ns, ad, faz, limit, runai, sch, d, bellek, shm, nccl, rs, son, uyari) in sorted(satirlar, key=lambda x: (x[0], x[1], x[2])):
        print("  %s/%s · node=%s · %s · restart=%d%s" % (ns, ad, node, faz, rs, (" · son: " + son) if son else ""))
        print("      GPU limiti=%s · Run:ai: %s · scheduler=%s" % (
            ("%g" % limit) if limit else "-", ", ".join("%s=%s" % (k.split("/")[-1], v) for k, v in sorted(runai.items())) or "-", sch))
        vl = ["%s=%s" % (k[2:], v) for k, v in d.items() if k in VLLM]
        print("      bellek limiti=%s · /dev/shm=%s%s" % (bellek, shm, (" · vLLM: " + " ".join(vl)) if vl else ""))
        if nccl:
            print("      env: " + " ".join(nccl))
        for u in uyari:
            print("      ⚠ " + u)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
