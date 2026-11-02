#!/usr/bin/env python3
# veeam-tani.py — Veeam'in yönettiği Linux sunucuda (restore hedefi, repository, mount sunucusu) restore/iş hatasının bilinen sebeplerini
# sunucudan okunan anahtar=değer çıktısına göre sıralar. Kararı model değil bu betik verir; her bulgu kaynağını (Veeam KB / forum) yazar.
# Saha (Alp, 2026-11-02): dtlmrestore'da restore başlatınca "dosya ya da dizin bulunamadı" — "temp diziniyle mi alakalı?". Ajan önce
# servisleri yeniden başlattı (kanıt toplamadan) ve "5 serviden 6'sı" yazdı.
#
#   veeam-tani.py komut            → sunucuda çalıştırılacak SALT-OKUNUR komutu basar (ssh root@<sunucu> '<komut>')
#   veeam-tani.py mongo-komut      → MongoDB restore hedefi için ek SALT-OKUNUR komut (aynı `tani` ile okunur; ikisinin çıktısı birleştirilebilir)
#   veeam-tani.py tani <dosya|->   → o komutun çıktısını okur, BULGU listesi + eksik kanıt. Çıkış 0 bulgu yok, 1 bulgu var, 2 hata.
import re
import sys

SERVISLER = ["veeamservice", "veeamtransport", "veeamdeployment", "veeamenvironment", "veeamimmurepo", "veeamnetfsmount"]

KOMUT = (
    'echo acilis=$(uptime -s); echo bugun=$(date +%F); '
    'echo veeam_paket=$(rpm -qa "veeam*" --qf "%{NAME}-%{VERSION} " 2>/dev/null); '
    'for d in /tmp /var/tmp /opt; do echo "baglama$(echo $d | tr / _)=$(findmnt -n -o TARGET,OPTIONS --target $d | tr -s " " " ")"; done; '
    'echo tmp_bos=$(df -h --output=avail /tmp | tail -1 | tr -d " "); '
    'echo run_veeamtransport=$(test -d /run/veeamtransport && echo var || echo YOK); '
    'echo opt_veeam=$(test -d /opt/veeam && echo var || echo YOK); '
    'for s in ' + " ".join(SERVISLER) + '; do echo "servis_$s=$(systemctl is-active $s 2>/dev/null)/$(systemctl is-enabled $s 2>/dev/null)"; done; '
    'echo ssh_anahtar=$(for f in /etc/ssh/ssh_host_*_key.pub; do printf "%s=%s@%s " "$(basename $f .pub)" "$(ssh-keygen -lf $f | cut -d" " -f2)" '
    '"$(date -r $f +%F)"; done); '
    'echo kripto=$(update-crypto-policies --show 2>/dev/null); '
    'echo sshd_kisit=$(cat /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | grep -iE "^(AllowUsers|AllowGroups|DenyUsers|DenyGroups|HostKeyAlgorithms|KexAlgorithms|Ciphers|MACs)" '
    '| tr "\n" "|" | cut -c1-400); '
    'echo log_hata=$(grep -rhE "No such file or directory|Permission denied|Failed to (create|open|change)" /var/log/VeeamBackup /var/log/veeam 2>/dev/null '
    '| tail -8 | tr "\\n" "|" | cut -c1-900)'
)

# Veeam v13 MongoDB (Veeam Explorer for MongoDB / plug-in): resmi belge build 13.1.2.57 — mongo_plan_and_manage_requirements,
# vemdb_how_restore_works, mongo_data_restore, vemdb_permissions (helpcenter.veeam.com/docs/vbr/userguide/…; 2026-11-02 okundu).
MONGO_RHEL = ((8, 4), (9, 6))          # "RHEL 8.4 - 9.6"
MONGO_SURUM = ("7.0", "8.0", "8.2", "8.3")
MONGO_KOMUT = (
    'echo os=$(cat /etc/redhat-release 2>/dev/null); '
    'echo mongod_surum=$(mongod --version 2>/dev/null | head -1); '
    'echo mongod_args=$(ps -o args= -C mongod 2>/dev/null | head -3 | tr "\n" "|"); '
    'echo replset=$(cat /etc/mongod*.conf 2>/dev/null | grep -A2 "^replication" | grep -i replSetName | tr -d " "; '
    'ps -o args= -C mongod 2>/dev/null | grep -oE "[-]{2}replSet[= ][^ ]*" | head -1); '
    'echo fuse=$(test -c /dev/fuse && echo var || echo YOK); '
    'echo run_media=$(findmnt -rn -o TARGET,FSTYPE 2>/dev/null | grep "^/run/media" | tr "\n" "|"); '
    'echo vemdb_log=$(grep -rlE "vemdb" /var/log /opt/veeam 2>/dev/null | head -5 | tr "\n" " "); '
    'echo vemdb_hata=$(grep -rhE "vemdb|mongod" /var/log/VeeamBackup /opt/veeam 2>/dev/null | grep -iE "error|fail|exit|No such file|featureCompatibility|version" '
    '| tail -8 | tr "\n" "|" | cut -c1-900)'
)


def kv_oku(metin):
    return dict(re.findall(r"^([a-z0-9_]+)=(.*)$", metin, re.M))


def tani(kv):
    bulgular, notlar, eksik = [], [], []
    tmp = kv.get("baglama_tmp", "")
    log = kv.get("log_hata", "")
    if "noexec" in tmp.split(" ")[-1].split(","):
        bulgular.append(("/tmp noexec ile bağlı (%s)" % tmp,
                         "Veeam betiklerini /tmp'ye yükleyip oradan çalıştırır; noexec engeller (tipik hata 'Permission denied'). Çözüm "
                         "yedekçinin: VBR sunucusunda LinAgentFolder (REG_SZ, sondaki / olmadan) + klasör her Linux sunucuda olmalı; ya da "
                         "/tmp'den noexec kaldırmak (CIS sertleştirmesi — güvenlik kararı)", "Veeam KB2099"))
    transport = kv.get("servis_veeamtransport", "").split("/")
    transport_kurulu = len(transport) == 2 and transport[1] not in ("", "not-found")
    if "veeamtransport.pid" in log or (kv.get("run_veeamtransport") == "YOK" and transport_kurulu and transport[0] != "active"):
        bulgular.append(("/run/veeamtransport yok%s" % (" — logda veeamtransport.pid hatası" if "veeamtransport.pid" in log else ""),
                         "reboot sonrası (OS yaması) transport servisi pid dosyasını açamıyor: 'POSIX: Failed to create or open file "
                         "[/var/run/veeamtransport/veeamtransport.pid]'. Destek önerisi: servis dosyasını kaldır, reboot, VBR'de sunucuyu "
                         "Managed servers'ta yeniden onayla (geçici: mkdir + chmod 755 — her reboot'ta kaybolur)",
                         "Veeam forum t=100308 (V13, resmi KB yok)"))
    if "Permission denied" in log and not any("noexec" in b[0] for b in bulgular):
        bulgular.append(("logda 'Permission denied'", "noexec dışı izin sorunu — log satırındaki yolu ve sahibini oku", "log"))
    for yol in sorted(set(re.findall(r"(/(?:tmp|var/tmp|opt|run|var/run)/[^\s\]\[|'\"]+)", log))):
        if "veeamtransport.pid" not in yol:
            notlar.append("logda geçen yol: %s — sunucuda var mı (ls -ld), hangi adımda arandı?" % yol)
    for s in SERVISLER:
        d = kv.get("servis_" + s, "")
        if not d or d.startswith("/") or d.endswith("/not-found"):
            continue
        aktif = d.split("/")[0]
        if s == "veeamnetfsmount" and aktif != "active":
            notlar.append("veeamnetfsmount %s — koşullu servis (ExecCondition -checkserver); NFS bağlantısı yoksa çalışmaması normal" % d)
        elif aktif != "active" and d.split("/")[-1] == "enabled":
            bulgular.append(("%s %s" % (s, d), "etkin ama çalışmıyor — journalctl -u %s -n 50" % s, "systemd"))
    bugun, acilis = kv.get("bugun", ""), kv.get("acilis", "")[:10]
    anahtarlar = []
    for parca in kv.get("ssh_anahtar", "").split():
        ad, _, kalan = parca.partition("=")
        iz, _, tarih = kalan.rpartition("@")
        anahtarlar.append("%s %s (%s)" % (ad.replace("ssh_host_", "").replace("_key", ""), iz, tarih))
        if tarih and ((bugun and tarih >= bugun) or (acilis and tarih >= acilis)):
            bulgular.append(("SSH host anahtarı %s %s tarihli (bugün %s, son açılış %s) — yakın zamanda değişmiş" % (ad, tarih, bugun, acilis),
                             "VBR'deki kayıtlı parmak iziyle uyuşmaz → 'Failed to validate ssh fingerprint' / 'Failed to check fingerprint'. "
                             "Yedekçi: Backup Infrastructure → Managed servers → sunucuyu düzenle → yeni parmak izini onayla; ya da Inventory → "
                             "Untrusted'tan güven (parmak izini önce `ssh-keygen -lf` çıktısıyla karşılaştır)", "Veeam KB4524 (benzer: parmak izi doğrulama)"))
    if anahtarlar:
        notlar.append("SSH host parmak izleri (VBR'nin gösterdiğiyle karşılaştır): " + " · ".join(anahtarlar))
    if kv.get("kripto") and kv["kripto"] not in ("DEFAULT", "DEFAULT:SHA1"):
        notlar.append("kripto politikası %s — Veeam'in SSH istemcisi anahtar/algoritma anlaşamazsa parmak izi doğrulanamaz (tahmin; VBR logunda "
                      "'kex'/'algorithm' satırı ara)" % kv["kripto"])
    if kv.get("sshd_kisit", "").strip("|"):
        notlar.append("sshd kısıtı var: %s — Veeam hesabı (AllowUsers/AllowGroups) içinde mi?" % kv["sshd_kisit"].strip("|"))
    if "os" in kv or "mongod_surum" in kv:
        mongo_tani(kv, bulgular, notlar, eksik)
    if not log:
        eksik.append("sunucu logunda bu hatalardan satır yok → asıl hata VBR tarafında: yedekçiden iş (restore session) logunun TAM hata "
                     "satırı + restore türü (dosya/dizin geri yükleme, tam VM, Instant) + hedef yol")
    if "veeam_paket" in kv and not kv["veeam_paket"].strip():
        eksik.append("veeam paketi yok (rpm) — transport/bileşen /opt/veeam altında olabilir (opt_veeam=%s)" % kv.get("opt_veeam", "?"))
    return bulgular, notlar, eksik


def mongo_tani(kv, bulgular, notlar, eksik):
    m = re.search(r"release (\d+)\.(\d+)", kv.get("os", ""))
    if m and not (MONGO_RHEL[0] <= (int(m.group(1)), int(m.group(2))) <= MONGO_RHEL[1]):
        bulgular.append(("işletim sistemi %s.%s — Veeam v13 MongoDB destek listesi RHEL 8.4–9.6" % (m.group(1), m.group(2)),
                         "desteklenmeyen OS'ta restore ajanı/geçici instance başarısız olabilir (OS yaması sonrası ilk restore mu?) — "
                         "yedekçiyle Veeam'in güncel destek listesine bak", "Veeam v13 User Guide: MongoDB System Requirements"))
    v = re.search(r"v(\d+\.\d+)\.\d+", kv.get("mongod_surum", ""))
    if v and v.group(1) not in MONGO_SURUM:
        bulgular.append(("mongod %s — desteklenen 7.0/8.0/8.2/8.3" % v.group(0), "sürüm dışı", "Veeam v13 MongoDB System Requirements"))
    if ("mongod_args" in kv and kv["mongod_args"].strip("|") and not kv.get("replset", "").strip()):
        bulgular.append(("replica set görünmüyor (conf'ta replSetName yok, --replSet yok)", "Veeam: tek başına (standalone) MongoDB desteklenmez; "
                         "koleksiyon restore'u replica set'in primary node'una yapılır — conf başka yerdeyse `mongosh --eval rs.status()` ile doğrula",
                         "Veeam v13 MongoDB System Requirements · How Restore Works"))
    if kv.get("fuse") == "YOK":
        bulgular.append(("/dev/fuse yok", "Veeam Mount Service yedeği FUSE ile /run/media altına bağlar; FUSE yoksa geçici instance açılamaz",
                         "Veeam v13 How Restore Works"))
    hata = kv.get("vemdb_hata", "")
    if "vemdb" in hata and "No such file" in hata:
        notlar.append("geçici instance soketi (/var/tmp/vemdb*.sock — tahmin: Veeam'in yedekten açtığı GEÇİCİ mongod'un soketi, sunucudaki "
                      "üretim mongod'u değil) yok → geçici mongod başlamamış olabilir; sebebi aynı zaman damgalı log satırlarında "
                      "(featureCompatibilityVersion / sürüm / disk / izin). Yedeğin alındığı kaynak mongod sürümü hedefle aynı mı?")
    eksik.append("Mongo: yedeği alan Veeam Plug-in build'i ≤ restore eden build olmalı (build numarası dahil) — yedekçiden ikisini iste "
                 "(Veeam v13 User Guide: Data Restore). Kaynak (yedeği alınan) mongod sürümü + hedef kullanıcının MongoDB 'root' rolü.")
    if not kv.get("vemdb_log", "").strip():
        eksik.append("vemdb geçen log bulunamadı (/var/log, /opt/veeam) — restore ajanı logunun yerini yedekçiye sor")


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(open(__file__, encoding="utf-8").read().split("import re")[0].replace("# ", "").replace("#!/usr/bin/env python3\n", ""))
        return 0
    if argv[0] == "mongo-komut":
        print("ssh root@<sunucu> '%s'" % MONGO_KOMUT)
        return 0
    if argv[0] == "komut":
        print("ssh root@<sunucu> '%s'" % KOMUT)
        return 0
    if argv[0] == "tani" and len(argv) > 1:
        metin = sys.stdin.read() if argv[1] == "-" else open(argv[1], encoding="utf-8", errors="replace").read()
        kv = kv_oku(metin)
        if not kv:
            print("anahtar=değer satırı yok — `veeam-tani.py komut` çıktısındaki komutu çalıştır")
            return 2
        if "acilis" in kv:
            print("Sunucu: açılış %s · paket %s · /tmp %s · /tmp boş %s" % (kv.get("acilis", "?"), kv.get("veeam_paket", "?").strip() or "yok",
                                                                    kv.get("baglama_tmp", "?"), kv.get("tmp_bos", "?")))
        if "os" in kv:
            print("MongoDB hedefi: %s · %s · replica set: %s" % (kv.get("os"), kv.get("mongod_surum") or "mongod yok", kv.get("replset") or "görünmüyor"))
        bulgular, notlar, eksik = tani(kv)
        for i, (b, ne, kaynak) in enumerate(bulgular, 1):
            print("BULGU %d: %s\n    → %s\n    kaynak: %s" % (i, b, ne, kaynak))
        for n in notlar:
            print("NOT: " + n)
        for e in eksik:
            print("EKSİK KANIT: " + e)
        if not bulgular:
            print("Bilinen sebeplerden hiçbiri sunucuda görülmedi — karar VBR iş logundaki hata satırıyla verilir; servis yeniden başlatmak "
                  "kanıt değildir.")
        return 1 if bulgular else 0
    print("alt komut: komut | tani")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
