#!/usr/bin/env python3
# nfs-tani.py — NFS istemcisinde açılışta bağlama sırası ve bağlamayı kullanan konteynerler; kararı model değil bu betik verir,
# her bulgu kaynağını (man sayfası / ölçülen zaman damgası) yazar, tahmin "tahmin:" diye ayrılır.
# Saha (Alp, 2026-11-03, G118): splastnginx* açılışında /ab (NFS, medya kayıtları) "dizin istemede sorun" — yeniden bağlanınca dizinler
# geldi; yazma da etkilenmiş olabilir. Ajan nfsidmap satırlarını kök neden yazdı (kanıtsız).
#
#   nfs-tani.py komut              → sunucuda çalıştırılacak SALT-OKUNUR komutu basar (ssh root@<sunucu> '<komut>')
#   nfs-tani.py tani <dosya|->     → çıktıyı okur: BULGU / NOT / EKSİK KANIT. Çıkış 0 bulgu yok, 1 bulgu var, 2 hata.
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
    print("alt komut: komut | tani")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
