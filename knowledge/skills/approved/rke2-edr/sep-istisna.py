#!/usr/bin/env python3
# sep-istisna.py — SEP (Symantec Linux Agent) Auto-Protect için sunucuda GERÇEKTEN var olan yollardan, tam yol + kaynaklı istisna adayı
# listesi üretir. Liste elle yazılmaz: sunucudan okunan duruma göre betik çıkarır; her satırın kaynağı yanındadır.
# Saha (Alp, 2026-11-03): "Scan files on remote computers sanırım açık; temiz tam yollar çıkar — /data, sanal dizinler, NFS, rke2,
# mongo, postgresql". Ajan sürümü "1.4 diye duydum" [SAHA] → komut paket adını okur.
#
#   sep-istisna.py komut            → sunucuda çalıştırılacak SALT-OKUNUR komutu basar (ssh root@<sunucu> '<komut>')
#   sep-istisna.py liste <dosya|->  → çıktıdan istisna listesi: KAYNAKLI · KURUM KARARI · KAYNAKSIZ ADAY (güvenlik ekibi karar verir)
import re
import sys

ADAY = ["/proc", "/sys", "/dev", "/var/spool", "/var/lib/rpm", "/data", "/var/lib/rancher", "/var/lib/kubelet", "/etc/rancher/rke2",
        "/run/k3s", "/var/log/pods", "/var/log/containers", "/etc/cni", "/opt/cni"]

KOMUT = (
    'echo sep_paket=$(rpm -qa 2>/dev/null | grep -iE "sdcss|symantec|^sep" | tr "\\n" " "); '
    'echo var=$(for d in ' + " ".join(ADAY) + '; do test -e $d && printf "%s " $d; done); '
    'echo nfs=$(findmnt -rn -t nfs,nfs4 -o TARGET | tr "\\n" " "); '
    'echo mongo_conf=$(cat /etc/mongod*.conf 2>/dev/null | grep -E "^[[:space:]]*(dbPath|path):" | tr -s " " | tr "\\n" " "); '
    'echo mongo_args=$(ps -o args= -C mongod 2>/dev/null | grep -oE "[-]{2}(dbpath|logpath)[= ][^ ]+" | tr "\\n" " "); '
    'echo pg_data=$(ps -o args= -C postgres,postmaster 2>/dev/null | grep -oE " -D *[^ ]+" | tr "\\n" " "); '
    'echo docker_root=$(docker info -f "{{.DockerRootDir}}" 2>/dev/null); '
    'echo podman_root=$(podman info -f "{{.Store.GraphRoot}}" 2>/dev/null)'
)

KB244505 = "Broadcom KB 244505 (sisamddaemon %100 CPU — istisna listesi: /proc, /sys, /dev, /var/spool/, /var/lib/rpm/)"
UIPATH = ("UiPath Automation Suite belgesi 'Antivirus causes installation issues' (RKE2 tabanlı ürün; SUSE/Rancher'ın resmi AV listesi "
          "bulunamadı — 2026-11-03 arandı)")
MONGO = "MongoDB Production Notes: 'configure your scanner to exclude the database storage path and the database log path'"
PG = ("resmi PostgreSQL belgesi bulunamadı; pgsql-admin listesi 2025-09 (AV dosya değiştirirse kurulumu bozar — topluluk görüşü, "
      "kanıt düzeyi düşük)")
NFS = ("Broadcom KB 162599: tercih SEPM'de 'Scan files on remote computers' kapalı (\"files should be scanned by the local host\"); "
       "politika kapatılamıyorsa bağlama noktası istisnası")


def kv_oku(metin):
    return dict(re.findall(r"^([a-z_]+)=(.*)$", metin, re.M))


def liste(kv):
    var = kv.get("var", "").split()
    kaynakli, kurum, kaynaksiz, notlar = [], [], [], []
    for d in ("/proc", "/sys", "/dev", "/var/spool", "/var/lib/rpm"):
        if d in var:
            kaynakli.append((d, KB244505))
    for d in ("/var/lib/rancher", "/var/lib/kubelet", "/etc/rancher/rke2", "/run/k3s", "/var/log/pods", "/var/log/containers",
              "/etc/cni", "/opt/cni"):
        if d in var:
            kaynakli.append((d, UIPATH))
    yollar = re.findall(r"(?:dbPath|path):\s*(\S+)", kv.get("mongo_conf", "")) + \
        re.findall(r"--(?:dbpath|logpath)[= ](\S+)", kv.get("mongo_args", ""))
    for y in dict.fromkeys(yollar):
        kaynakli.append((y.rsplit("/", 1)[0] if y.endswith(".log") else y, MONGO))
    for y in dict.fromkeys(re.findall(r"-D *(\S+)", kv.get("pg_data", ""))):
        kaynaksiz.append((y, PG))
    for t in kv.get("nfs", "").split():
        kaynakli.append((t, NFS))
    if "/data" in var:
        kurum.append(("/data", "Alp, 2026-11-03 (\"/data ile başla\") — üretici kaynağı değil; altında ne olduğu sunucuya göre değişir"))
    for k in ("docker_root", "podman_root"):
        if kv.get(k):
            kaynaksiz.append((kv[k], "konteyner deposu — üretici AV önerisi bulunamadı (2026-11-03 arandı)"))
    if kv.get("pg_data") or kv.get("mongo_args"):
        notlar.append("veritabanı konteynerde çalışıyorsa `ps`'teki yol KONTEYNER yoludur; host yolu `docker inspect -f '{{range .Mounts}}"
                      "{{.Source}}>{{.Destination}} {{end}}' <ad>` ile bulunur")
    # aynı yol birden çok kaynaktan gelirse tek satır
    gorulen = set()
    def tekil(xs):
        out = []
        for y, k in xs:
            if y not in gorulen:
                gorulen.add(y)
                out.append((y, k))
        return out
    return tekil(kaynakli), tekil(kurum), tekil(kaynaksiz), notlar


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import re")[0].replace("# ", "").replace("#!/usr/bin/env python3\n", ""))
        return 0
    if argv[0] == "komut":
        print("ssh root@<sunucu> '%s'" % KOMUT)
        return 0
    if argv[0] == "liste" and len(argv) > 1:
        kv = kv_oku(sys.stdin.read() if argv[1] == "-" else open(argv[1], encoding="utf-8", errors="replace").read())
        if "var" not in kv:
            print("var= satırı yok — `sep-istisna.py komut` çıktısındaki komutu çalıştır")
            return 2
        print("SEP paketi: %s" % (kv.get("sep_paket", "").strip() or "görünmüyor"))
        kaynakli, kurum, kaynaksiz, notlar = liste(kv)
        print("Yazım (Broadcom TechDocs 'Add Folder Exception for Linux clients'): önek [NONE] + tam yol; 14.3 RU1'den beri alt dizinler "
              "her zaman dahil. Önek değişkeni (ROOT/HOME/BIN/ETC/USR/OPT) 14.3 RU1–RU5'te istisnayı GEÇERSİZ yapar (KB 250717).")
        for baslik, xs in (("KAYNAKLI", kaynakli), ("KURUM KARARI", kurum), ("KAYNAKSIZ ADAY — güvenlik ekibi karar verir", kaynaksiz)):
            print("\n== %s" % baslik)
            for y, k in xs:
                print("  [NONE] %-40s  kaynak: %s" % (y, k))
            if not xs:
                print("  (yok)")
        for n in notlar:
            print("NOT: " + n)
        print("\nBilinçli dışarıda: /tmp, /var/run — UiPath listesinde var ama zararlı yazılımın tipik yeri; güvenlik ekibi kararı.")
        return 0
    print("alt komut: komut | liste")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
