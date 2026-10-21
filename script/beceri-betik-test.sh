#!/usr/bin/env bash
# =============================================================================
#  beceri-betik-test.sh — beceri betiklerinin (knowledge/skills/approved/*/*.py) SAHA HATA SINIFLARINI
#  yakaladığını doğrular. Her durum bir saha gözlemine (G…) bağlıdır; betik değişince bunu çalıştır.
#
#  Neyi kanıtlar:
#    kume-bul      ad ↔ IP ↔ grup eşlemesi dosyalar arası (G94); kubectl JSON'dan Rancher kümeleri + --kaydet
#    filo-tablo    ok / rc≠0 / ERİŞİLEMEZ / ZAMAN AŞIMI / ÇIKTI YOK ayrımı, --kv çoğunluk sapması (G22, G77)
#    sar-ozet      sadf sütun ADIYLA ortalama, sunucular arası birebir aynı değer uyarısı (G21, G22)
#    disk-durum    OS diski sdb'deyken sda BOŞ ADAY (G38), /data LV KULLANIMDA, aynı boyut uyarısı
#    sertifika     kalan gün, anahtar eşleşmesi, chain.pem'deki ESKİ yaprak (G86), verify, özel anahtar basılmaz
#    k8s-ozet      exit 2 = OOM DEĞİL (G59), OOMKilled, NotReady süre + lease, sürüm sapması
#    python 3.6    (vermin varsa) betikler RHEL 8 platform-python ile uyumlu
#
#  Örnek veriler genel adlıdır (kurum verisi yok); sertifikalar ve JSON'lar test anında üretilir.
#  Ağ yok, ssh yok, gerçek sisteme yazmaz (yalnız geçici dizin). Geliştirici testidir.
#
#  Kullanim:  ./script/beceri-betik-test.sh
#  Cikis:     0 = hepsi gecti · 1 = en az bir durum kaldi
# =============================================================================
set -uo pipefail

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
B="$KOK/knowledge/skills/approved"
GECEN=0
KALAN=0
CALISMA="$(mktemp -d "${TMPDIR:-/tmp}/oc-beceri-betik.XXXXXX")"
trap 'rm -rf "$CALISMA"; find "$B" -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null' EXIT

gecti() { printf '  GECTI  %s\n' "$*"; GECEN=$((GECEN + 1)); }
kaldi() { printf '  KALDI  %s\n' "$*"; KALAN=$((KALAN + 1)); }
baslik() { printf '\n== %s\n' "$*"; }
# icerir <aciklama> <cikti-dosyasi> <sabit-metin>
icerir() { if grep -qF -- "$3" "$2"; then gecti "$1"; else kaldi "$1 — beklenen: $3"; fi; }
icermez() { if grep -qF -- "$3" "$2"; then kaldi "$1 — olmamalı: $3"; else gecti "$1"; fi; }

cd "$CALISMA" || exit 1

# --------------------------------------------------------------------------- kume-bul
baslik "kume-bul.py (G94)"
mkdir -p ansible/inventories
cat > ansible/inventories/hosts.ini << 'E'
[production]
ornek-local1 ansible_host=192.0.2.11
ornek-local2 ansible_host=192.0.2.12
E
cat > ansible/inventories/hosts-rke2.ini << 'E'
[rke-ornek-local]
192.0.2.11
192.0.2.12
[rke-ornek-test]
ornekwor[01:03]
[rke-ornek-test:vars]
rke2_token=GIZLI
E
python3 "$B/kume-bul/kume-bul.py" ornek-local2 > kb1.txt 2>&1
icerir "adla düz listede, IP ile küme grubunda" kb1.txt "grup=[rke-ornek-local]  ← aynı IP, farklı ad"
python3 "$B/kume-bul/kume-bul.py" wor02 > kb2.txt 2>&1
icerir "kısa ad (sonek) + aralık açma" kb2.txt "ad=ornekwor02  grup=[rke-ornek-test]"
icerir "gizli değişken maskeli" kb2.txt "rke2_token=***"
python3 - > k8s-rancher.json << 'E'
import json
mc = lambda i, n: {"apiVersion": "management.cattle.io/v3", "kind": "Cluster", "metadata": {"name": i}, "spec": {"displayName": n},
                   "status": {"provider": "rke2", "version": {"gitVersion": "v1.33.13+rke2r1"}, "conditions": [{"type": "Ready", "status": "True"}]}}
mn = lambda c, n, ip, cp: {"apiVersion": "management.cattle.io/v3", "kind": "Node", "metadata": {"namespace": c, "name": "m"},
                           "spec": {"controlPlane": cp, "etcd": cp, "worker": not cp},
                           "status": {"nodeName": n, "internalNodeStatus": {"addresses": [{"type": "InternalIP", "address": ip}]}}}
print(json.dumps({"apiVersion": "management.cattle.io/v3", "kind": "Setting", "metadata": {"name": "server-url"}, "value": "https://rancher.ornek.local"}))
print("Error from server (NotFound): örnek stderr satırı")
print(json.dumps({"kind": "List", "items": [mc("local", "local"), mc("c-m-1", "uygulama"), mn("local", "ornek-local1", "192.0.2.11", True),
                                            mn("c-m-1", "ornekapp01", "192.0.2.21", False)]}))
E
python3 "$B/kume-bul/kume-bul.py" k8s --kaydet < k8s-rancher.json > kb3.txt 2>&1
icerir "Rancher local kümesi tanındı" kb3.txt "Rancher bu kümede KURULU"
icerir "yönetilen küme listelendi" kb3.txt "[uygulama] id=c-m-1"
icerir "--kaydet dosya yazdı" kb3.txt "yazıldı ansible/inventories/rancher-rancher.ornek.local.ini"
python3 "$B/kume-bul/kume-bul.py" ornekapp01 > kb4.txt 2>&1
icerir "kaydedilen haritadan bağlanmadan bulundu" kb4.txt "rancher_kume_adi=uygulama"

# --------------------------------------------------------------------------- filo-tablo
baslik "filo-tablo.py (G22, G77)"
mkdir -p tree
cat > tree/a1 << 'E'
{"changed": true, "rc": 0, "stdout": "cpu=4\nntp=Normal", "stderr": ""}
E
cat > tree/a2 << 'E'
{"changed": true, "rc": 0, "stdout": "cpu=4\nntp=Normal", "stderr": ""}
E
cat > tree/a3 << 'E'
{"changed": true, "rc": 0, "stdout": "cpu=8\nntp=Normal", "stderr": ""}
E
cat > tree/b1 << 'E'
{"changed": true, "rc": 3, "failed": true, "msg": "non-zero return code", "stdout": "cpu=4", "stderr": "chronyc: komut yok"}
E
cat > tree/c1 << 'E'
{"changed": false, "msg": "Failed to connect to the host via ssh: Connection timed out", "unreachable": true}
E
cat > tree/d1 << 'E'
{"changed": false, "msg": "The shell action failed to execute in the expected time frame (30) and was terminated"}
E
cat > filo.ini << 'E'
[g]
a1
a2
a3
b1
c1
d1
e1
E
python3 "$B/filo-kontrol/filo-tablo.py" tree --grup g -i filo.ini > ft1.txt 2>&1
icerir "durum sayımı" ft1.txt "Durum: ok 3 · ERİŞİLEMEZ 1 · ZAMAN AŞIMI 1 · rc≠0 1"
icerir "zaman aşımı ayrı" ft1.txt "ZAMAN AŞIMI"
icerir "rc≠0 ayrı" ft1.txt "rc=3"
icerir "beklenip çıktısı gelmeyen" ft1.txt "e1                           ÇIKTI YOK"
python3 "$B/filo-kontrol/filo-tablo.py" tree --kv > ft2.txt 2>&1
icerir "kv tablosunda sapan hücre işaretli" ft2.txt "8*"

# --------------------------------------------------------------------------- sar-ozet
baslik "sar-ozet.py (G21, G22)"
sadf() { # <host> <cpu-idle> <mem%> <ldavg5>
  printf '#NPROC 4\n#TZ +0300\n#HISTORY HISTORY=28\n'
  printf '# hostname;interval;timestamp;CPU;%%user;%%nice;%%system;%%iowait;%%steal;%%idle\n'
  printf '%s;600;2026-10-01 10:00:00 UTC;-1;1;0;1;0;0;%s\n%s;600;2026-10-02 10:00:00 UTC;-1;1;0;1;0;0;%s\n' "$1" "$2" "$1" "$2"
  printf '# hostname;interval;timestamp;kbmemfree;kbavail;kbmemused;%%memused;kbbuffers;kbcached;kbcommit;%%commit\n'
  printf '%s;600;2026-10-01 10:00:00 UTC;1;1;1;%s;0;0;0;10\n%s;600;2026-10-02 10:00:00 UTC;1;1;1;%s;0;0;0;10\n' "$1" "$3" "$1" "$3"
  printf '# hostname;interval;timestamp;runq-sz;plist-sz;ldavg-1;ldavg-5;ldavg-15;blocked\n'
  printf '%s;600;2026-10-01 10:00:00 UTC;0;100;1;%s;1;0\n%s;600;2026-10-02 10:00:00 UTC;0;100;1;%s;1;0\n' "$1" "$4" "$1" "$4"
}
mkdir -p sartree
python3 -c "import json,sys; print(json.dumps({'rc':0,'stdout':sys.stdin.read()}))" < <(sadf ornek01 75 40 2) > sartree/ornek01
python3 -c "import json,sys; print(json.dumps({'rc':0,'stdout':sys.stdin.read()}))" < <(sadf ornek01 75 40 2) > sartree/ornek02
python3 "$B/rhel-performans/sar-ozet.py" sartree > so1.txt 2>&1
icerir "CPU = 100 - %idle, ada göre" so1.txt "CPU % (100 - %idle)       : ort 25.0"
icerir "bellek %memused" so1.txt "Bellek %memused (sar -r)  : ort 40.0"
icerir "hostname ≠ hedef uyarısı (G21)" so1.txt "verideki hostname (ornek01) ≠ hedef adı (ornek02)"
icerir "birebir aynı değer uyarısı (G22)" so1.txt "günlük değerleri birebir aynı"

# --------------------------------------------------------------------------- disk-durum
baslik "disk-durum.py (G38, G39)"
cat > g38.txt << 'E'
#LSBLK
NAME="sda" KNAME="sda" PKNAME="" TYPE="disk" SIZE="322122547200" FSTYPE="" MOUNTPOINT="" UUID=""
NAME="sdb" KNAME="sdb" PKNAME="" TYPE="disk" SIZE="64424509440" FSTYPE="" MOUNTPOINT="" UUID=""
NAME="sdb1" KNAME="sdb1" PKNAME="sdb" TYPE="part" SIZE="629145600" FSTYPE="vfat" MOUNTPOINT="/boot/efi" UUID="A"
NAME="sdb2" KNAME="sdb2" PKNAME="sdb" TYPE="part" SIZE="1073741824" FSTYPE="LVM2_member" MOUNTPOINT="" UUID="B"
NAME="rhel-root" KNAME="dm-0" PKNAME="sdb2" TYPE="lvm" SIZE="50000000000" FSTYPE="xfs" MOUNTPOINT="/" UUID="C"
#PVS
  /dev/sdb2|rhel
#MOUNT
/dev/mapper/rhel-root /
/dev/sdb1 /boot/efi
#SWAP
Filename Type Size Used Priority
#FSTAB
/dev/mapper/rhel-root / xfs defaults 0 0
#IMZA
== /dev/sda
== /dev/sdb
PTTYPE=gpt
E
python3 "$B/rhel-depolama/disk-durum.py" - --ad ornek05 < g38.txt > dd1.txt 2>&1
icerir "OS diski sdb'de tanındı" dd1.txt "/dev/sdb            60.0G  OS DİSKİ"
icerir "sda boş aday" dd1.txt "/dev/sda           300.0G  BOŞ ADAY"
cat > data.txt << 'E'
#LSBLK
NAME="sda" KNAME="sda" TYPE="disk" SIZE="64424509440" FSTYPE="" MOUNTPOINT="" UUID=""
NAME="sda1" KNAME="sda1" TYPE="part" SIZE="63000000000" FSTYPE="xfs" MOUNTPOINT="/" UUID="r"
NAME="sdb" KNAME="sdb" TYPE="disk" SIZE="322122547200" FSTYPE="LVM2_member" MOUNTPOINT="" UUID="v"
NAME="sdc" KNAME="sdc" TYPE="disk" SIZE="53687091200" FSTYPE="" MOUNTPOINT="" UUID=""
NAME="sdd" KNAME="sdd" TYPE="disk" SIZE="53687091200" FSTYPE="" MOUNTPOINT="" UUID=""
#PVS
  /dev/sdb|veri_vg
#MOUNT
/dev/sda1 /
/dev/mapper/veri_vg-veri_lv /data
#SWAP
Filename Type Size Used Priority
#FSTAB
/dev/veri_vg/veri_lv /data xfs defaults 0 0
#IMZA
== /dev/sda
PTTYPE=dos
== /dev/sdb
TYPE=LVM2_member
== /dev/sdc
== /dev/sdd
E
python3 "$B/rhel-depolama/disk-durum.py" - < data.txt > dd2.txt 2>&1
icerir "eski util-linux (PKNAME yok) bölüm ebeveyni" dd2.txt "/dev/sda            60.0G  OS DİSKİ"
icerir "/data LV diski kullanımda" dd2.txt "sdb PV → VG veri_vg (/data)"
icerir "aynı boyutta iki boş aday uyarısı" dd2.txt "boyuttan SEÇME"

# --------------------------------------------------------------------------- sertifika-kontrol
baslik "sertifika-kontrol.py (G65, G86, G94)"
if command -v openssl > /dev/null; then
  mkdir -p cert/certs/old && cd cert || exit 1
  O="openssl"
  $O req -x509 -newkey rsa:2048 -nodes -keyout kok.key -out kok.pem -days 3650 -subj "/CN=ORNEKKOKCA" -addext "basicConstraints=critical,CA:TRUE" 2> /dev/null
  $O req -newkey rsa:2048 -nodes -keyout ara.key -out ara.csr -subj "/CN=ORNEKARACA" 2> /dev/null
  printf "basicConstraints=critical,CA:TRUE\n" > ca.ext
  $O x509 -req -in ara.csr -CA kok.pem -CAkey kok.key -CAcreateserial -out ara.pem -days 1825 -extfile ca.ext 2> /dev/null
  yaprak() {
    $O req -newkey rsa:2048 -nodes -keyout "$1.key" -out "$1.csr" -subj "/CN=rancher.ornek.local" 2> /dev/null
    printf "subjectAltName=DNS:rancher.ornek.local\nbasicConstraints=CA:FALSE\n" > l.ext
    $O x509 -req -in "$1.csr" -CA ara.pem -CAkey ara.key -CAcreateserial -out "$1.pem" -days "$2" -extfile l.ext 2> /dev/null
  }
  yaprak eski 20
  yaprak yeni 730
  cat yeni.pem ara.pem > certs/tls.crt && cp yeni.key certs/tls.key
  cat eski.pem ara.pem > certs/old/tls.crt && cp eski.key certs/old/tls.key
  cat eski.pem ara.pem kok.pem > certs/chain.pem
  $O x509 -in kok.pem -outform der -out certs/ORNEKKOKCA.cer
  python3 "$B/rancher-sertifika/sertifika-kontrol.py" certs --ad rancher.ornek.local > ../sk1.txt 2>&1
  cd .. || exit 1
  icerir "chain.pem'deki yaprak ESKİ (G86)" sk1.txt "chain.pem#1                              notAfter"
  icerir "eski/yeni ayrımı" sk1.txt "← EN YENİ"
  icerir "kalan gün hesaplı, eşik altı ❌" sk1.txt "kalan 19 gün ❌"
  icerir "anahtar eşleşmesi" sk1.txt "tls.key anahtar #1 → ✓ eşleşen sertifika: tls.crt#1"
  icerir "DER tanındı" sk1.txt "DER sertifika (ikili)"
  icerir "verify OK" sk1.txt "verify OK"
  icermez "özel anahtar basılmadı" sk1.txt "PRIVATE KEY-----"
  ( cd cert/certs && for f in * */*; do [ -f "$f" ] && { echo "#DOSYA $f"; base64 -w0 "$f"; echo; }; done ) \
    | python3 "$B/rancher-sertifika/sertifika-kontrol.py" - --ozet > sk2.txt 2>&1
  icerir "--ozet kalan güne göre (en yakın üstte)" <(sed -n 2p sk2.txt) "19 gün"
else
  kaldi "openssl yok — sertifika testleri atlandı"
fi

# --------------------------------------------------------------------------- k8s-ozet
baslik "k8s-ozet.py (G7, G8, G59, G65)"
python3 - > k8s.json << 'E'
import datetime, json
now = datetime.datetime.now(datetime.timezone.utc)
ts = lambda dk: (now - datetime.timedelta(minutes=dk)).strftime("%Y-%m-%dT%H:%M:%SZ")
items = []
for i, ad in enumerate(["ornekmas01", "ornekwor01", "ornekwor02"]):
    nr = ad == "ornekwor02"
    items.append({"kind": "Node", "metadata": {"name": ad}, "status": {
        "conditions": [{"type": "Ready", "status": "Unknown" if nr else "True", "reason": "NodeStatusUnknown" if nr else "KubeletReady",
                        "message": "Kubelet stopped posting node status." if nr else "", "lastTransitionTime": ts(42 if nr else 9000)}],
        "nodeInfo": {"kubeletVersion": "v1.33.13+rke2r1", "osImage": "RHEL 9.6", "kernelVersion": "k-el9_4" if ad == "ornekwor01" else "k-el9_6",
                     "containerRuntimeVersion": "containerd://2.2.5"}}})
    items.append({"kind": "Lease", "metadata": {"namespace": "kube-node-lease", "name": ad}, "spec": {"renewTime": ts(41 if nr else 0)}})
def pod(ns, ad, node, n, son):
    return {"kind": "Pod", "metadata": {"namespace": ns, "name": ad}, "spec": {"nodeName": node}, "status": {"phase": "Running",
            "containerStatuses": [{"name": "c", "ready": True, "restartCount": n, "state": {"running": {}}, "lastState": {"terminated": son}}]}}
items.append(pod("gpu-operator", "nfd-worker-1", "ornekwor01", 270, {"reason": "Error", "exitCode": 2, "finishedAt": ts(5)}))
items.append(pod("uygulama", "kafka-0", "ornekwor01", 3, {"reason": "OOMKilled", "exitCode": 137, "finishedAt": ts(60)}))
print(json.dumps({"kind": "List", "items": items}))
E
python3 "$B/k8s-sorun/k8s-ozet.py" - < k8s.json > ko1.txt 2>&1
icerir "exit 2 OOM değil (G59)" ko1.txt "exit 2 (Error — uygulama hatası; OOM DEĞİL"
icerir "OOMKilled ayrı" ko1.txt "OOMKilled (bellek limiti"
icerir "NotReady + süre" ko1.txt "❌ ornekwor02 · Ready=Unknown · 42dk süredir"
icerir "lease tazeliği" ko1.txt "lease son yenileme: 41dk önce"
icerir "sürüm sapması" ko1.txt "SÜRÜM SAPMASI"

# --------------------------------------------------------------------------- kilit
baslik "Becerilerdeki sabit okuma komutları güvenlik kilidinden geçiyor (G67/G68)"
if command -v bun > /dev/null; then
  if (cd "$KOK" && bun script/beceri-komut-kilit.ts) > kilit.txt 2>&1; then gecti "$(tail -1 kilit.txt | sed 's/^ *//')"; else kaldi "$(cat kilit.txt)"; fi
else
  printf '  ATLANDI bun yok\n'
fi

# --------------------------------------------------------------------------- python 3.6
baslik "Python 3.6 uyumu (RHEL 8 platform-python)"
if command -v vermin > /dev/null; then
  if vermin --no-tips -q -t=3.6- --violations "$B"/*/*.py > vermin.txt 2>&1; then gecti "vermin -t=3.6-"; else kaldi "vermin: $(head -3 vermin.txt)"; fi
else
  printf '  ATLANDI vermin yok (python3 -m venv v && v/bin/pip install vermin)\n'
fi

printf '\nSonuç: %d geçti · %d kaldı\n' "$GECEN" "$KALAN"
[ "$KALAN" -eq 0 ]
