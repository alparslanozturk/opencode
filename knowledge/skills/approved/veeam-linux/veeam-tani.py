#!/usr/bin/env python3
# veeam-tani.py — Veeam'in yönettiği Linux sunucuda (restore hedefi, repository, mount sunucusu) restore/iş hatasının bilinen sebeplerini
# sunucudan okunan anahtar=değer çıktısına göre sıralar. Kararı model değil bu betik verir; her bulgu kaynağını (Veeam KB / forum) yazar.
# Saha (Alp, 2026-11-02): dtlmrestore'da restore başlatınca "dosya ya da dizin bulunamadı" — "temp diziniyle mi alakalı?". Ajan önce
# servisleri yeniden başlattı (kanıt toplamadan) ve "5 serviden 6'sı" yazdı.
#
#   veeam-tani.py komut            → sunucuda çalıştırılacak SALT-OKUNUR komutu basar (ssh root@<sunucu> '<komut>')
#   veeam-tani.py tani <dosya|->   → o komutun çıktısını okur, BULGU listesi + eksik kanıt. Çıkış 0 bulgu yok, 1 bulgu var, 2 hata.
import re
import sys

SERVISLER = ["veeamservice", "veeamtransport", "veeamdeployment", "veeamenvironment", "veeamimmurepo", "veeamnetfsmount"]

KOMUT = (
    'echo acilis=$(uptime -s); '
    'echo veeam_paket=$(rpm -qa "veeam*" --qf "%{NAME}-%{VERSION} " 2>/dev/null); '
    'for d in /tmp /var/tmp /opt; do echo "baglama$(echo $d | tr / _)=$(findmnt -n -o TARGET,OPTIONS --target $d | tr -s " " " ")"; done; '
    'echo tmp_bos=$(df -h --output=avail /tmp | tail -1 | tr -d " "); '
    'echo run_veeamtransport=$(test -d /run/veeamtransport && echo var || echo YOK); '
    'echo opt_veeam=$(test -d /opt/veeam && echo var || echo YOK); '
    'for s in ' + " ".join(SERVISLER) + '; do echo "servis_$s=$(systemctl is-active $s 2>/dev/null)/$(systemctl is-enabled $s 2>/dev/null)"; done; '
    'echo log_hata=$(grep -rhE "No such file or directory|Permission denied|Failed to (create|open|change)" /var/log/VeeamBackup /var/log/veeam 2>/dev/null '
    '| tail -8 | tr "\\n" "|" | cut -c1-900)'
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
    if not log:
        eksik.append("sunucu logunda bu hatalardan satır yok → asıl hata VBR tarafında: yedekçiden iş (restore session) logunun TAM hata "
                     "satırı + restore türü (dosya/dizin geri yükleme, tam VM, Instant) + hedef yol")
    if "veeam_paket" in kv and not kv["veeam_paket"].strip():
        eksik.append("veeam paketi yok (rpm) — transport/bileşen /opt/veeam altında olabilir (opt_veeam=%s)" % kv.get("opt_veeam", "?"))
    return bulgular, notlar, eksik


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
        if not kv:
            print("anahtar=değer satırı yok — `veeam-tani.py komut` çıktısındaki komutu çalıştır")
            return 2
        print("Sunucu: açılış %s · paket %s · /tmp %s · /tmp boş %s" % (kv.get("acilis", "?"), kv.get("veeam_paket", "?").strip() or "yok",
                                                                    kv.get("baglama_tmp", "?"), kv.get("tmp_bos", "?")))
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
