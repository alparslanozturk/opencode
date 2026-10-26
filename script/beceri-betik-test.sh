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
#                  düz PEM stdin; --uc canlı uç (https/ldaps) zinciri — yalnız 127.0.0.1'de yerel s_server
#    k8s-ozet      exit 2 = OOM DEĞİL (G59), OOMKilled, NotReady süre + lease, sürüm sapması
#    cis-ozet      kurum kararı (SELinux/firewalld/root ssh/ip_forward) bulgu sayılmaz; oscap "Title\r\t" biçimi
#    leapp-rapor   inhibitor (groups + eski flags) ENGEL sayılır, çıkış 1; çok sunucu özeti; kesik rapor ❌
#    uyum          GPU Operator ↔ GPU modeli (B300 ≥ 25.10), Run:ai ↔ K8s ↔ GPU Operator
#    python 3.6    (vermin varsa) betikler RHEL 8 platform-python ile uyumlu
#
#  Örnek veriler genel adlıdır (kurum verisi yok); sertifikalar ve JSON'lar test anında üretilir.
#  Ağ yok (yalnız 127.0.0.1 döngü), ssh yok, gerçek sisteme yazmaz (yalnız geçici dizin). Geliştirici testidir.
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
python3 "$B/kume-bul/kume-bul.py" uygulama > kb5.txt 2>&1
icerir "küme adıyla (rancher_kume_adi) bulundu" kb5.txt "rancher_kume_adi=uygulama"
icerir "küme adıyla üyeler listelendi" kb5.txt "üyeler (1): ornekapp01"
python3 "$B/kume-bul/kume-bul.py" rke-ornek-test > kb6.txt 2>&1
icerir "grup adıyla bulundu" kb6.txt "üyeler (3): ornekwor01 ornekwor02 ornekwor03"
python3 "$B/kume-bul/kume-bul.py" ai-test > kb7.txt 2>&1
icerir "olmayan küme adı hâlâ YOK der" kb7.txt "envanterde YOK"

# --------------------------------------------------------------------------- playbook-denetim
baslik "playbook-denetim.py (G26, G43, G93)"
cat > pd-ekip.yml << 'E'
- hosts: all
  ignore_errors: yes
  tasks:
    #- copy: src=k.sh dest=/tmp/k.sh
    - name: kur
      shell: bash /tmp/k.sh
    - name: eski kaldır
      shell: rpm -e sep
    - name: indir
      shell: curl -s -o /root/x http://srv/x
    - shell: dnf update -y --skip-broken | tail -5; echo Update complete.
E
cat > pd-temiz.yml << 'E'
- hosts: google-captcha-cert
  tasks:
    - name: oku
      ansible.builtin.command: rpm -q chrony
      changed_when: false
  handlers:
    - name: yenile
      ansible.builtin.command: update-ca-trust extract
E
printf -- '- hosts: x\n  tasks:\n    - debug:\n        msg: {{ x }}\n' > pd-bozuk.yml
python3 "$B/ansible/playbook-denetim.py" pd-ekip.yml > pd1.txt 2>&1; echo "rc=$?" >> pd1.txt
for k in hosts-all play-ignore yorumdaki-onkosul yikici-sira curl-fail pipefail sahte-basari skip-broken "rc=1"; do
  icerir "ekip playbook'u: $k" pd1.txt "$k"
done
python3 "$B/ansible/playbook-denetim.py" pd-temiz.yml > pd2.txt 2>&1; echo "rc=$?" >> pd2.txt
icerir "temiz playbook (okuma görevi + handler) bulgusuz" pd2.txt "bulgu yok"
icerir "temiz çıkış 0" pd2.txt "rc=0"
python3 "$B/ansible/playbook-denetim.py" pd-bozuk.yml > pd3.txt 2>&1; echo "rc=$?" >> pd3.txt
icerir "bozuk YAML çıkış 2" pd3.txt "rc=2"

# --------------------------------------------------------------------------- envanter-fark
baslik "envanter-fark.py (mükerrer envanter, Alp 2026-10-26)"
printf '[web]\nornekweb01 ansible_host=192.0.2.11\nornekweb02 ansible_host=192.0.2.12\n[db]\nornekdb[01:02].kurum.local\n' > ef.ini
printf '| Sunucu | IP |\n|---|---|\n| ornekweb01 | 192.0.2.11 |\n| ornekweb02 | 192.0.2.99 |\n| ornekdb01 | - |\n| eskiweb03 | 192.0.2.13 |\n' > ef.md
printf '[x]\nornekweb01.kurum.local ansible_host=192.0.2.11\nornekweb02 ansible_host=192.0.2.12\nornekdb01\nornekdb02.kurum.local\nyeniapp01 ansible_host=192.0.2.21\n' > ef2.ini
python3 "$B/git/envanter-fark.py" ef.ini --karsi ef.md --karsi ef2.ini > ef.txt 2>&1; echo "rc=$?" >> ef.txt
icerir "MD: aynı ad farklı IP" ef.txt "ornekweb02: kaynakta 192.0.2.12 (ef.ini:3) · ef.md:4'de 192.0.2.99"
icerir "MD: aralıktan açılan host MD'de yok" ef.txt "ornekdb02.kurum.local (ef.ini:5) ef.md'de yok"
icerir "MD: yalnız dokümanda olan IP" ef.txt "ef.md:6  192.0.2.13"
icerir "INI: yalnız karşıda" ef.txt "yeniapp01 (ef2.ini:6) kaynak envanterde yok"
icermez "INI: kısa ad = FQDN fark sayılmaz" ef.txt "ornekweb01.kurum.local (ef2.ini"
icerir "fark varsa çıkış 1" ef.txt "rc=1"

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

python3 "$B/filo-kontrol/filo-tablo.py" tree --kv --grup g -i filo.ini --csv filo.csv > ft3.txt 2>&1
icerir "--csv: çıktısız sunucu da satır" filo.csv "e1;ÇIKTI YOK"
icerir "--csv: sapan alan sütunu" filo.csv "a3;ok;;8;Normal;cpu"
python3 "$B/rapor/tablo-cevir.py" filo.csv --html filo.html --kaynak test > tc1.txt 2>&1
icerir "tablo-cevir HTML vurgu (ERİŞİLEMEZ/rc≠0/ZAMAN AŞIMI/sapan)" tc1.txt "7 satır · 5 vurgulu"
python3 "$B/rapor/tablo-cevir.py" filo.csv --html filo.html > tc2.txt 2>&1
icerir "üzerine yazmaz" tc2.txt "zaten var"

# G102: disk dolu hedef — modül kopyalanamaz (ölçülen mesaj), ssh'ta UNREACHABLE da gelebilir → ERİŞİLEMEZ değil DİSK DOLU
mkdir -p tree-dolu
cat > tree-dolu/f1 << 'E'
{"changed": false, "msg": "failed to transfer file to /root/.ansible/tmp/ansible-tmp-1/AnsiballZ_command.py: [Errno 28] No space left on device"}
E
cat > tree-dolu/f2 << 'E'
{"changed": false, "unreachable": true, "msg": "Failed to create temporary directory. mkdir: cannot create directory '/root/.ansible/tmp/x': No space left on device"}
E
cat > tree-dolu/f3 << 'E'
{"changed": false, "msg": "Failed to connect to the host via ssh: Connection timed out", "unreachable": true}
E
python3 "$B/filo-kontrol/filo-tablo.py" tree-dolu > ft4.txt 2>&1
icerir "disk dolu ayrı (ERİŞİLEMEZ değil)" ft4.txt "Durum: DİSK DOLU 2 · ERİŞİLEMEZ 1"
icerir "disk dolu → raw ilk yardım" ft4.txt "§3c"
python3 "$B/rhel-depolama/disk-durum.py" tree-dolu > dd-dolu.txt 2>&1
icerir "disk-durum: disk dolu ayrı" dd-dolu.txt "f2 · DİSK DOLU"

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
  cat cert/yeni.pem cert/ara.pem | python3 "$B/rancher-sertifika/sertifika-kontrol.py" - > sk3.txt 2>&1
  icerir "düz PEM stdin (s_client çıktısı) okunur" sk3.txt "== stdin · PEM · 2 sertifika"
  # canlı uç (--uc): yalnız 127.0.0.1'de yerel s_server — https/ldaps ucunun GÖNDERDİĞİ zincir
  P=$((20000 + RANDOM % 20000))
  ( cd cert && exec openssl s_server -accept "127.0.0.1:$P" -cert yeni.pem -key yeni.key -cert_chain ara.pem -quiet ) \
    > /dev/null 2>&1 &
  SP=$!
  for _ in 1 2 3 4 5 6 7 8 9 10; do  # s_server hazır olana dek (yoklama bağlantısı açmadan — betiğin kendisi dener)
    sleep 0.3
    python3 "$B/rancher-sertifika/sertifika-kontrol.py" --uc "127.0.0.1:$P" cert/kok.pem --ad rancher.ornek.local > sk4.txt 2>&1
    grep -qF "canlı uç (" sk4.txt && break
  done
  kill "$SP" 2> /dev/null; wait "$SP" 2> /dev/null
  icerir "--uc canlı uç zinciri okundu" sk4.txt "canlı uç (sunucunun gönderdiği zincir) · 2 sertifika"
  icerir "--uc kök dosyasıyla verify + SAN" sk4.txt "SAN rancher.ornek.local ✓ · kalan 729 gün · anahtar — (canlı kaynağın anahtarı okunmaz) · verify OK"
  python3 "$B/rancher-sertifika/sertifika-kontrol.py" --uc "127.0.0.1:1" > sk5.txt 2>&1
  icerir "--uc kapalı uç açıkça ❌" sk5.txt "❌ bağlanılamadı"
else
  kaldi "openssl yok — sertifika testleri atlandı"
fi

# --------------------------------------------------------------------------- leapp-rapor
baslik "leapp-rapor.py (ENGEL önce, çok sunucu, bozuk rapor)"
python3 - > leapp1.json << 'E'
import json
print(json.dumps({"leapp_run_id": "x", "entries": [
  {"title": "Bilgi notu", "summary": "s", "severity": "info", "groups": ["sanity"]},
  {"title": "Eski paket imzası SHA-1", "summary": "SHA-1 imzalı paket var", "severity": "high", "groups": ["inhibitor", "security"],
   "detail": {"remediations": [{"type": "hint", "context": "Paketi kaldır"}, {"type": "command", "context": ["dnf", "remove", "ornek"]}]}},
  {"title": "network-scripts kullanımda", "summary": "s", "severity": "medium", "groups": ["network"]},
  {"title": "Eski bayraklı engel", "summary": "s", "severity": "high", "flags": ["inhibitor"]}]}))
E
python3 -c 'import json; print(json.dumps({"entries": [{"title": "Uyarı", "summary": "s", "severity": "low", "groups": []}]}))' > leapp2.json
python3 "$B/rhel-yukseltme/leapp-rapor.py" leapp1.json > lr1.txt 2>&1
echo "cikis=$?" >> lr1.txt
icerir "groups inhibitor = ENGEL" lr1.txt "⛔ ENGEL · Eski paket imzası SHA-1"
icerir "eski flags inhibitor da ENGEL" lr1.txt "⛔ ENGEL · Eski bayraklı engel"
icerir "çözüm komutu basıldı" lr1.txt "komut: dnf remove ornek"
icerir "sayaç" lr1.txt "ENGEL 2 · high 0 · medium 1 · low 0 · info 1"
icermez "info varsayılanda basılmaz" lr1.txt "Bilgi notu"
icerir "ENGEL varken çıkış 1" lr1.txt "cikis=1"
{ echo "#SUNUCU web01"; cat leapp1.json; echo "#SUNUCU web02"; cat leapp2.json; echo "#SUNUCU web03"; echo "{kesik"; } \
  | python3 "$B/rhel-yukseltme/leapp-rapor.py" - --kisa > lr2.txt 2>&1
icerir "çok sunucu: engel yok" lr2.txt "web02                          ✓ engel yok"
icerir "çok sunucu: kesik rapor ❌" lr2.txt "web03                          ❌ rapor okunamadı"
python3 "$B/rhel-yukseltme/leapp-rapor.py" leapp2.json > lr3.txt 2>&1; echo "cikis=$?" >> lr3.txt
icerir "engel yoksa çıkış 0" lr3.txt "cikis=0"

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

# --------------------------------------------------------------------------- gpu-dagilim
baslik "gpu-dagilim.py (G51, G52, G59)"
python3 - > gpu.json << 'E2'
import json
node = {"kind": "Node", "metadata": {"name": "ornekgpu1", "labels": {"nvidia.com/gpu.present": "true", "nvidia.com/gpu.product": "NVIDIA-H200"}},
        "status": {"capacity": {"nvidia.com/gpu": "8"}, "allocatable": {"nvidia.com/gpu": "8"}}}
def pod(ns, ad, limit, args, ann=None, shm=None):
    lim = {"memory": "32Gi"}
    if limit:
        lim["nvidia.com/gpu"] = str(limit)
    ed = {"medium": "Memory"}
    if shm:
        ed["sizeLimit"] = shm
    return {"kind": "Pod", "metadata": {"namespace": ns, "name": ad, "annotations": ann or {}},
            "spec": {"nodeName": "ornekgpu1", "containers": [{"name": "v", "args": args, "resources": {"limits": lim},
                     "volumeMounts": [{"name": "s", "mountPath": "/dev/shm"}]}], "volumes": [{"name": "s", "emptyDir": ed}]},
            "status": {"phase": "Running", "containerStatuses": [{"restartCount": 0}]}}
print(json.dumps({"kind": "List", "items": [node,
    pod("vllm", "buyuk", 2, ["--tensor-parallel-size", "2", "--enable-prefix-caching", "--no-enable-prefix-caching"]),
    pod("vllm", "uyumsuz", 4, ["--tensor-parallel-size=2"], shm="20Gi"),
    pod("runai-inference", "kesirli", None, ["--max-model-len", "32768"], ann={"runai-allocated-gpus": "0.35"})]}))
E2
python3 "$B/rke2-gpu/gpu-dagilim.py" - < gpu.json > gd1.txt 2>&1
icerir "çelişen bayrak" gd1.txt "çelişen bayrak: --enable-prefix-caching/--no-enable-prefix-caching"
icerir "tp×pp ≠ GPU limiti" gd1.txt "tp×pp=2 ≠ GPU limiti 4"
icerir "çok GPU'lu pod shm" gd1.txt "çok GPU'lu pod'da shm sizeLimit yok"
icerir "Run:ai kesir pod adıyla" gd1.txt "runai-allocated-gpus=0.35"
icerir "node toplamı (2+4+0.35)" gd1.txt "ayrılan 6.35"

# --------------------------------------------------------------------------- olay-penceresi
baslik "olay-penceresi.py (G62-G65)"
python3 "$B/rhel-sorun/olay-penceresi.py" "2026-10-19 05:30" --tz +0300 > op1.txt 2>&1
icerir "yerel → UTC çevrimi" op1.txt "UTC   : 2026-10-19 02:15:00 → 2026-10-19 02:45:00"
icerir "saDD = ayın günü" op1.txt "-f /var/log/sa/sa19"
icerir "UTC dakika deseni" op1.txt "2026-10-19T02:(15|16|"
python3 "$B/rhel-sorun/olay-penceresi.py" "2026-10-20 23:55" --tz +0300 --dk 10 > op2.txt 2>&1
icerir "gece yarısı: iki sa dosyası (1)" op2.txt "-s 23:45:00 -e 23:59:59 -f /var/log/sa/sa20"
icerir "gece yarısı: iki sa dosyası (2)" op2.txt "-s 00:00:00 -e 00:05:00 -f /var/log/sa/sa21"
python3 "$B/rhel-sorun/olay-penceresi.py" 2026-10-19T02:30:00Z --tz +0300 > op3.txt 2>&1
icerir "UTC girdi → yerel" op3.txt "yerel : 2026-10-19 05:15:00"

# --------------------------------------------------------------------------- cis-ozet
baslik "cis-ozet.py (kurum kararı ≠ bulgu; Title\\r\\t biçimi; CIS no + seviye)"
python3 - > oscap.txt <<'PY'
print('VERSION_ID="10.0"')
for t, r, s in [("SELinux", "selinux_not_disabled", "fail"), ("root ssh", "sshd_disable_root_login", "fail"),
                ("AIDE", "package_aide_installed", "fail"), ("ip_forward", "sysctl_net_ipv4_ip_forward", "fail"),
                ("firewalld", "service_firewalld_enabled", "fail"), ("cramfs", "kernel_module_cramfs_disabled", "pass"),
                ("elle", "x_manual", "notchecked")]:
    print("Title\r\t%s\nRule\r\txccdf_org.ssgproject.content_rule_%s\nIdent\r\tCCE-1\nResult\r\t%s\n" % (t, r, s))
PY
python3 "$B/rhel-cis/cis-ozet.py" - < oscap.txt > cis1.txt 2>&1
icerir "ürün VERSION_ID'den" cis1.txt "ürün rhel10 · kural 7 · fail 5"
icerir "AIDE bulgu, CIS 6.1.1 L1" cis1.txt "6.1.1      L1 fail    package_aide_installed"
icerir "SELinux kurum kararı" cis1.txt "1.3.1.4    L1 selinux_not_disabled — SELinux kurum kararıyla kapalı"
icerir "root ssh kurum kararı" cis1.txt "5.1.20     L1 sshd_disable_root_login"
icerir "ip_forward --rke2 yokken bulgu (RHEL 10 L2)" cis1.txt "3.3.1.1    L2 fail    sysctl_net_ipv4_ip_forward"
python3 "$B/rhel-cis/cis-ozet.py" - --rke2 < oscap.txt > cis2.txt 2>&1
icerir "--rke2: ip_forward kurum kararı" cis2.txt "RKE2 node'u: net.ipv4.ip_forward=1"
icerir "--rke2: bulgu sayısı 1" cis2.txt "BULGU (fail, kurum kararı dışı): 1"
mkdir -p cisagac
python3 -c "import json; json.dump({'unreachable': True, 'msg': 'timeout'}, open('cisagac/web02', 'w'))"
python3 "$B/rhel-cis/cis-ozet.py" cisagac > cis3.txt 2>&1
icerir "erişilemeyen: değer yazma" cis3.txt "ERİŞİLEMEZ — değer YAZMA"

# --------------------------------------------------------------------------- uyum (GPU Operator / Run:ai)
baslik "uyum.py — GPU Operator GPU modeli + Run:ai matrisi (2026-10-24 verisi)"
python3 "$B/surum-uyum/uyum.py" kontrol --rke2 v1.33.13+rke2r1 --gpu-operator v25.3.4 --surucu 580.126.16 --gpu H200,B300 --runai 2.24 --tarih 2026-10-24 > uy1.txt 2>&1
icerir "B300 25.3 listesinde yok" uy1.txt "GPU B300 ↔ GPU Operator 25.3: listede yok"
icerir "580.126.16 önerilen" uy1.txt "desteklenenler listesinde (önerilen)"
icerir "Run:ai 2.24 ↔ 1.33 ✅" uy1.txt "✅ Run:ai 2.24 ↔ RKE2 1.33"
python3 "$B/surum-uyum/uyum.py" kontrol --rke2 v1.33.13+rke2r1 --gpu-operator v25.3.4 --runai 2.26 --tarih 2026-10-24 > uy2.txt 2>&1
icerir "Run:ai 2.26 ↔ 1.33 ❌ destek dışı" uy2.txt "❌ Run:ai 2.26 ↔ RKE2 1.33"
icerir "uygun Run:ai listesi" uy2.txt "destekleyen Run:ai sürümleri (veride): 2.22, 2.23, 2.24"
icerir "2.26 kaynağı kök sayfa" uy2.txt "run-ai-docs.nvidia.com/self-hosted/getting-started/installation/support-matrix.md"
python3 "$B/surum-uyum/uyum.py" yol --rancher v2.14.3 --rke2 v1.33.13+rke2r1 --antrea v2.3.0 --hedef-rke2 1.36 --hedef-rancher 2.15 --tarih 2026-10-26 > uy3.txt 2>&1
icerir "yol 1.33→1.36: Rancher önce son yamaya" uy3.txt "1. Rancher v2.14.3 → v2.14.6"
icerir "yol: RKE2 1.33→1.34 Rancher 2.15'ten önce" uy3.txt "3. RKE2 1.33 → v1.34"
icerir "yol: Rancher 2.15 ancak 1.34'ten sonra" uy3.txt "4. Rancher v2.14.6 → v2.15"
icerir "yol: Antrea ikinci adım (garantili sürüm VKr'den önce)" uy3.txt "Antrea v2.6.3 → v2.7.0 (1.35: upstream garanti; 1.36: upstream garanti"
icerir "yol: son durumda Antrea ↔ 1.36 garantili" uy3.txt "✅ Antrea v2.7.0 ↔ K8s 1.36"
python3 "$B/surum-uyum/uyum.py" kontrol --rancher v2.15.2 --rke2 v1.33.13+rke2r3 --tarih 2026-10-26 > uy4.txt 2>&1
icerir "Rancher 2.15 ↔ downstream 1.33 ❌" uy4.txt "❌ Rancher v2.15.2 ↔ downstream RKE2 1.33"

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
