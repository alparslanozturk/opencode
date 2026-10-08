---
name: cekirdek-teshis
description: Çekirdek (kernel) kaynaklı sorunları loglardan teşhis ederken kullan — çöküş/panic, donma, "call trace", oops, soft lockup, hung task, OOM, disk G/Ç hatası, beklenmeyen reboot. "kernel", "çekirdek", "dmesg", "call trace", "panic", "oops", "lockup", "donma", "hung task", "kdump", "vmcore", "crash", "bpftrace", "perf", "kgdb", "debuginfo" isteklerinde tetiklenir. Genel yavaşlık için `performans`.
---

Çekirdek sorununda sıra hep aynı: **log → canlı gözlem → döküm.** Her adım bir
öncekinden pahalıdır; bir önceki cevap verdiyse sonrakine geçme.

| Adım | Araç | Paket gerekir mi | Sistemi etkiler mi |
|---|---|---|---|
| 1. Log | `journalctl -k`, `dmesg` | Hayır | Hayır |
| 2. Canlı gözlem | `bpftrace`, `perf` | `bpftrace`/`perf` paketi | Hayır (yalnız izler) |
| 3. Çökme dökümü | kdump + `crash` | `kernel-debuginfo` | kdump açmak reboot ister |

**KGDB, JTAG, QEMU kullanma.** Bunlar çekirdek geliştiricisi araçları: KGDB
breakpoint'te **bütün çekirdeği durdurur** ve seri konsol ister — çalışan bir
sunucuda bu kesinti demektir. Bizim işimiz çekirdek yazmak değil, teşhis.

## 1. Log: çekirdek ne demiş

```bash
journalctl -k -b --no-pager | tail -100        # bu önyükleme
journalctl -k -b -1 --no-pager | tail -100     # bir ÖNCEKİ önyükleme (çöküş/reboot sonrası)
journalctl --list-boots --no-pager | tail -5   # beklenmeyen reboot var mı
```

`-b -1` hata veriyorsa (önceki açılış yok) journal kalıcı değildir (`/var/log/journal`
yok) — önceki açılışın logu **kaybolmuştur**; bunu raporda söyle, uydurma.

Önemli kalıplar için tek seferde ara:

```bash
journalctl -k -b --no-pager | grep -nE \
  'Call Trace|BUG:|Oops|general protection|soft lockup|hard LOCKUP|rcu.*stall|blocked for more than|Out of memory|I/O error|EXT4-fs error|XFS.*(error|Corruption)|Hardware Error|mce:|segfault|Tainted' | tail -40
```

| Satırda | Anlamı | Sonraki bakış |
|---|---|---|
| `Call Trace:` | Çekirdek bir yığın izi bastı | Üstündeki 5-10 satır asıl mesajdır; izde **ilk bizim/üçüncü taraf modül** adı (ör. `[vendor_mod]`) şüphelidir |
| `BUG:` / `Oops` / `general protection fault` | Çekirdek kodu hata yaptı | Modül adı + `Tainted:` satırı |
| `soft lockup` / `hard LOCKUP` / `rcu ... stall` | Bir CPU uzun süre bırakmadı | Sanal makinede önce hipervizör (`%steal`) — `performans` |
| `blocked for more than N seconds` | Süreç D state'te takıldı (hung task) | Neredeyse hep disk/NFS/SAN; `depolama`, `nfs-mount` |
| `Out of memory: Killed process` | OOM killer süreç öldürdü | Hangi süreç, `total-vm`/`anon-rss` — `performans` §4 |
| `I/O error, dev sdX` / FS `error`/`Corruption` | Disk/SAN/dosya sistemi hatası | `depolama`; multipath varsa `multipath -ll` |
| `Hardware Error` / `mce:` | Donanım (bellek/CPU) hatası | Donanım ekibine; yazılım tarafında çözüm arama |
| `segfault at` | **Kullanıcı** programı çöktü, çekirdek değil | O programın logu/servisi |

`Tainted:` satırındaki harfler sık sorulur:

| Harf | Anlamı |
|---|---|
| `G` | Tüm modüller GPL (normal) |
| `P` | Kapalı kaynak modül yüklü |
| `O` | Ağaç dışı (out-of-tree) modül yüklü |
| `E` | İmzasız modül yüklü |
| `W` | Daha önce bir uyarı (WARN) basılmış |
| `D` | Daha önce bir oops/BUG olmuş |
| `L` | Daha önce soft lockup olmuş |
| `M` | İşlemci makine kontrol hatası (MCE) bildirmiş — donanım |
| `K` | Çekirdek canlı yamalı (kpatch) |

Kaynak: çekirdek belgesi `Documentation/admin-guide/tainted-kernels.rst` (tam
liste orada; sayısal değer `cat /proc/sys/kernel/tainted`, 0 = temiz).

`P`/`O`/`E` varsa üretici desteği (Red Hat dahil) önce o modülü sorar:
`lsmod` ve `modinfo <modül>` ile adını, sürümünü, sağlayıcısını rapora koy.

## 2. Canlı gözlem (sistemi durdurmadan)

Sorun **şu an** oluyorsa (takılma, gecikme, açıklanamayan yük) loglar
yetmez; çekirdeğin ne yaptığını izle. Debuginfo **gerekmez** — RHEL çekirdeği
kendi tip bilgisini (BTF) taşır. Önce kontrol et:

```bash
ls /sys/kernel/btf/vmlinux        # varsa bpftrace debuginfo'suz çalışır
rpm -q bpftrace perf               # kurulu mu
```

Kurulu değilse kurmak **değişikliktir** (K1: `CN:` + `sunucular:`); yetki
yoksa öner ve dur.

**bpftrace — hazır betikleri kullan, tek satırlık betik uydurma.** Paket
hazır araçlarla gelir; sözdizimi sürümden sürüme değişir, ezberden yazılan
betik hata verir:

```bash
ls /usr/share/bpftrace/tools/
timeout 30 /usr/share/bpftrace/tools/<araç>.bt     # timeout şart, yoksa durmaz
```

| Soru | Araç |
|---|---|
| Disk gecikmesi dağılımı | `biolatency.bt` |
| Hangi süreç diske ne yazıyor | `biosnoop.bt` |
| OOM killer kimi, neden öldürdü | `oomkill.bt` |
| Kısa ömürlü süreçler (cron, betik fırtınası) | `execsnoop.bt` |
| Hangi dosyalar açılıyor / bulunamıyor | `opensnoop.bt` |
| CPU kuyruğunda bekleme | `runqlat.bt` |
| TCP yeniden gönderim / düşen paket | `tcpretrans.bt`, `tcpdrop.bt` |
| Bağlantı kuran/kabul eden süreç | `tcpconnect.bt`, `tcpaccept.bt` |
| XFS işlem gecikmesi | `xfsdist.bt` |

Araç listesi kurulu sürüme göre değişebilir — önce `ls` ile bak, listede
yoksa çalıştırma.

**perf — çekirdek CPU'yu nerede harcıyor:**

```bash
perf record -a -g -o /tmp/perf.data -- sleep 10            # 10 sn kayıt
perf report -i /tmp/perf.data --stdio --sort sym | head -60
```

Debuginfo olmadan çekirdek **fonksiyon adları** görünür (satır numarası
görünmez) — teşhis için yeterlidir.

## 3. Çökme dökümü (kdump)

Sunucu kendiliğinden reboot ettiyse ya da panic olduysa:

```bash
systemctl is-active kdump
cat /proc/cmdline | grep -o 'crashkernel=[^ ]*'
ls -lt /var/crash/ 2>/dev/null | head
```

**Döküm varsa önce `vmcore-dmesg.txt`'yi oku** — panic anındaki çekirdek
logudur, debuginfo **gerektirmez**:

```bash
tail -100 /var/crash/<dizin>/vmcore-dmesg.txt
```

Çoğu zaman cevap buradadır (son `Call Trace` + `Kernel panic - not syncing:`
satırı). Bu yetmezse `crash` ile döküm incelenir; bunun için **çalışan değil,
çöken çekirdeğin tam sürümüyle** eşleşen `kernel-debuginfo` gerekir:

```bash
uname -r                                       # çalışan sürüm — çöken sürümle aynı olmayabilir
dnf repolist --all | grep -i debug             # kurum deposunda debug repo var mı
```

Debug repo yoksa `crash` yapılamaz — bunu söyle, `vmcore-dmesg.txt` ile
yetin, dökümü (vmcore) üretici desteğine iletmeyi öner. Paket büyüktür;
kurmadan önce `dnf info kernel-debuginfo-<sürüm>` ile boyutuna bak.

```bash
crash /usr/lib/debug/lib/modules/<sürüm>/vmlinux /var/crash/<dizin>/vmcore
# crash içinde: log | tail -50 · bt · ps | grep UN · kmem -i · mod
```

**kdump kapalıysa** sonraki çöküşte kanıt kalmaz. Açmak `crashkernel=` için
bellek ayırır ve **reboot ister** → değişiklik (K1). Öner, kendin açma.
`kdumpctl` RHEL 10'da `kdump-utils` paketindedir (AlmaLinux 10'da
doğrulandı); RHEL 9'da `kexec-tools` içindedir — emin olmak için
`rpm -qf $(command -v kdumpctl)`.

## Raporlama

Log satırını **olduğu gibi** alıntıla (zaman + ilk mesaj + `Tainted:` +
`Call Trace`'teki ilk modül). "Çekirdek hatası var" demek rapor değildir;
"14:02:11'de `blocked for more than 120 seconds`, süreç `oracle`, izde
`nfs_wait_bit_killable` → NFS sunucusu cevap vermiyor" rapordur.

Hangi adımda durduğunu söyle: log yetti mi, canlı gözlem mi gerekti, döküm
var mı/yok mu, debuginfo bulunabildi mi. Ulaşamadığın kanıt için tahmin
yürütüyorsan "tahmin:" de.
