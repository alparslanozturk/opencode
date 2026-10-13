---
name: performans
description: Sunucu yavaşlığı, yüksek yük, CPU/bellek/disk darboğazı, page cache/kirli sayfa/Direct I/O izleme ve log analizinde kullan. "yavaş", "yük yüksek", "load average", "cpu", "bellek", "swap", "iowait", "page cache", "dirty", "writeback", "o_direct", "performans", "kapasite", "geriye dönük", "son 7 gün", "sar", "trend", "log", "hata arıyorum" isteklerinde tetiklenir.
---

Darboğazı bulmadan çözüm önerme. Sıra: yük → hangi kaynak → hangi süreç.

## 1. Yük gerçekten yüksek mi

```bash
uptime
nproc
```

Load average'ı **çekirdek sayısına böl.** 4 çekirdekte 4.0 yük %100'dür,
8 çekirdekte aynı sayı %50. Üç sayı 1/5/15 dakikalık ortalamadır: ilki
büyükse sorun yeni başlamış, sonuncusu büyükse süreklidir.

Linux'ta load average yalnızca CPU'yu değil, **kesintisiz uykudaki (D state)
süreçleri de** sayar. Yani yüksek yük çoğu zaman diski ya da NFS'i gösterir,
CPU'yu değil.

## 2. Hangi kaynak

```bash
vmstat 1 5
```

**İlk satırı yok say** — o önyüklemeden beri ortalamadır, anlık durum değil.

| Sütun | Yüksekse |
|---|---|
| `r` | CPU kuyruğu — çekirdek sayısını aşıyorsa CPU darboğazı |
| `b` | Kesintisiz uykudaki süreç — **disk ya da ağ bekliyor** |
| `si`/`so` | Swap giriş/çıkış — bellek yetmiyor, en kötü durum |
| `wa` (CPU) | I/O bekleme — disk darboğazı |
| `id` | Boşta; düşükse CPU dolu |

`si`/`so` sürekli sıfırdan büyükse başka hiçbir şeye bakma, bellek sorunu var.

## 3. CPU

```bash
mpstat -P ALL 1 3         # çekirdek başına; biri %100 diğerleri boşsa tek iş parçacığı
pidstat -u 1 3            # süreç başına
top -b -n1 -o %CPU | head -15
```

`%steal` yüksekse (sanal makinede) sorun sende değil, hipervizörde — komşu
VM'ler CPU'yu yiyor.

## 4. Bellek

```bash
free -h
ps aux --sort=-%mem | head -10
```

**`free` çıktısında `available` sütununa bak, `free` sütununa değil.**
`buff/cache` işletim sisteminin kullandığı ve gerektiğinde bıraktığı alandır;
"bellek dolu" görünmesi normaldir.

OOM killer devreye girdi mi:

```bash
journalctl -k | grep -i "out of memory"
dmesg -T | grep -i oom
```

## 5. Disk

```bash
iostat -x 1 3             # ilk örnek önyüklemeden beri, ATLA
pidstat -d 1 3            # süreç başına G/Ç
```

| Sütun | Anlamı |
|---|---|
| `%util` | Cihazın meşguliyeti; %90+ doymuş |
| `r_await`/`w_await` | Milisaniye cinsinden bekleme. SSD'de >10ms, HDD'de >50ms sorun |
| `aqu-sz` | Kuyruk uzunluğu; sürekli >1 birikme var |

Disk **dolu** mu diye ayrıca bak — dolu disk yavaşlık gibi görünür:
`depolama` becerisine geç.

### Page cache, kirli sayfa ve Direct I/O — yalnız izle

Bu ayarları **değiştirmiyoruz** (`vm.dirty_*` sysctl'leri, `drop_caches` —
değişiklik, K1). İş yalnız bakmak ve yorumlamak.

**Ayarlar ne:**

```bash
sysctl vm.dirty_background_ratio vm.dirty_ratio vm.dirty_expire_centisecs vm.dirty_writeback_centisecs
```

| Ayar | Anlamı |
|---|---|
| `dirty_background_ratio` | Kirli veri kullanılabilir belleğin bu %'sini geçince arka planda diske yazma başlar |
| `dirty_ratio` | Bu %'yi geçince **yazan uygulama da bekletilir** (yazma takılır) |
| `dirty_expire_centisecs` | Kirli sayfa bu kadar eskiyince (1/100 sn) yazılmaya aday olur |
| `dirty_writeback_centisecs` | Çekirdeğin yazma iş parçacıklarının uyanma sıklığı (1/100 sn) |

Değerler dağıtıma ve tuned profiline göre değişir — ezberden söyleme, komutla oku.

**Şu an ne kadar kirli veri var:**

```bash
grep -E '^(Dirty|Writeback|Cached|MemAvailable):' /proc/meminfo
sar -r 1 5          # kbdirty sütunu; geçmiş için: sar -r -f /var/log/sa/saDD
```

`Dirty` sürekli büyüyüp `dirty_ratio` sınırına yaklaşıyorsa disk yazmaya
yetişemiyor; uygulamalarda ani yazma takılmaları beklenir. `Writeback`
uzun süre yüksek kalıyorsa disk yavaş — §5 `iostat` ile doğrula.

**Pod/konteyner başına** (cgroup v2):

```bash
grep -E '^(file|file_dirty|file_writeback) ' /sys/fs/cgroup/<yol>/memory.stat
```

`file` = o cgroup'un page cache'i (bellek limitine sayılır).

**Bir dosyanın ne kadarı RAM'de** (ör. büyük model dosyası):

```bash
fincore <dosya>
```

**Kim Direct I/O (`O_DIRECT`) kullanıyor** — bu süreçler page cache'i
atlar, her okuma/yazma diske iner:

```bash
for f in /proc/[0-9]*/fdinfo/*; do fl=$(awk '/^flags/{print $2}' "$f" 2>/dev/null)
  [ -n "$fl" ] && (( 8#$fl & 8#40000 )) && p=${f#/proc/} && \
  echo "pid ${p%%/*} $(cat /proc/${p%%/*}/comm 2>/dev/null) $(readlink ${f/fdinfo/fd})"
done 2>/dev/null | head -20
```

`040000` x86_64'te `O_DIRECT` bitidir. Liste anlık durumdur — dosyayı o an
açık tutan süreci gösterir. Veritabanları bilerek kullanır; beklenmeyen bir
süreç görürsen raporla, değiştirme.

## 6. Geçmişe bakmak — sar (kapasite planlama, "son N gün", "geriye dönük")

Kurallar (G21-G22, 2026-10-13 — bu kuralları çiğneyen oturum 5 deneme yaptı ve uydurma rapor üretti):

- **Veri dosyası `saDD`'dir** (ikili, `sar -f` okur). `sarDD` metin raporudur — **grep/awk/python ile
  ayrıştırma**; bölümler karışır (CPU, ağ, disk aynı saat damgasıyla), çıkan sayı anlamsız olur.
- **Hazır günlük ortalama:** `sar ... -f saDD` çıktısının `Average:` satırı. Script yazmaya gerek yok;
  dosya başına saniyeler sürer ("dosya çok büyük, 10-15 dk" doğru değil).
- `DD` **ayın günüdür**: bugün 13'üyse `sa01`-`sa12` bu ay, `sa14`-`sa31` geçen ay. En yeni veri en büyük
  numara değildir — tarihi `sar` çıktısının ilk satırından oku.
- **Saklama süresi:** RHEL'de varsayılan 28 gün (`/etc/sysconfig/sysstat` → `HISTORY`). Kullanıcı 2-3 ay
  isterse önce `ls /var/log/sa` + `HISTORY` ile kaç gün olduğunu söyle; olmayan dönemi raporlama
  (daha uzun geçmiş: vCenter performans grafikleri / izleme sistemi — `[SAHA]`).
- **Çok sunucu:** `ssh` döngüsü kurma, tek `ansible ... -m shell` (bkz. `filo-durum-kontrolu`). Komutta
  hedef sunucu yoksa yerel makineyi (srvsatellite) okursun — çıktının hangi host'tan geldiği satırda görünmeli.
- **İki denemede çöp çıktı** (yüzde > 100, %0 bellek, milyonluk load) → dur, ham `Average:` satırını göster,
  kullanıcıya sor. Yeni ayrıştırma yöntemi deneme.

Tek sunucu, tek gün (önce bununla sütunları doğrula):

```bash
systemctl is-enabled sysstat-collect.timer     # toplama açık mı
grep HISTORY /etc/sysconfig/sysstat; ls /var/log/sa/
LC_ALL=C sar -u -f /var/log/sa/sa12 | tail -2    # CPU: 100 - %idle (son sütun)
LC_ALL=C sar -r -f /var/log/sa/sa12 | tail -2    # bellek: %memused (Average'dan sonra 4. değer)
LC_ALL=C sar -q -f /var/log/sa/sa12 | tail -2    # yük: ldavg-1/5/15
sar -b -f /var/log/sa/sa12 | tail -2             # G/Ç
```

Çok sunucu, tüm günler — her host için gün başına tek satır (2026-10-13 doğrulandı, sysstat Average sütunları):

```bash
ansible <grup|ip1,ip2,> -m shell -a 'for f in /var/log/sa/sa[0-9][0-9]; do c=$(LC_ALL=C sar -u -f $f | grep ^Average | tail -1 | awk "{printf \"%.1f\", 100-\$NF}"); m=$(LC_ALL=C sar -r -f $f | grep ^Average | tail -1 | awk "{print \$5}"); l=$(LC_ALL=C sar -q -f $f | grep ^Average | tail -1 | awk "{print \$5}"); echo "$(basename $f) cpu%=$c mem%=$m load5=$l"; done'
```

Raporda: host başına satır, gün aralığı (gerçek tarih), ortalama + en yüksek gün. Değerleri bu çıktıdan
aynen al; iki host'un sayıları birebir aynıysa ya da bir desen tekrar ediyorsa yanlış kaynak okuyorsun — dur.
Load average 0-çekirdek sayısının birkaç katı aralığındadır; binlerce/milyonlarca ise yanlış sütundur.

Toplama kapalıysa geçmiş veri **yoktur**; o zaman şimdiden açtır ve bir
sonraki olayda hazır ol.

## 7. Log okuma

```bash
journalctl -p err -b --no-pager | tail -50      # bu önyüklemedeki hatalar
journalctl --since "1 hour ago" -p warning --no-pager
journalctl -u <servis> --since "09:00" --until "09:30" --no-pager
journalctl -k | tail -50                        # çekirdek
```

`-n` ya da `--since` olmadan çalıştırma; log devasa olur ve bağlamı doldurur.
`--no-pager` şart, yoksa komut takılır.

Olay zamanını biliyorsan **zaman aralığıyla daralt** — hata mesajı genelde
belirtiden birkaç saniye öncededir.

Uygulama kendi dosyasına yazıyorsa:

```bash
ls -lt /var/log/ | head
tail -n 200 /var/log/<uygulama>/<dosya>
grep -iE 'error|fail|denied|timeout|refused' /var/log/<dosya> | tail -30
```

SELinux engellemesi performans sorunu gibi görünebilir (yeniden deneme
döngüleri): `ausearch -m avc -ts recent` — `ag-teshis` becerisine bak.

## Raporlama

Darboğazı **sayıyla** göster: "load 8.2, 2 çekirdek, `b` sütunu sürekli 6 —
süreçler diske takılıyor; `%util` %99 ve `w_await` 240ms." Yalnızca "sunucu
yavaş" demek raporlama değildir.

Ölçmediğin şeyi söyleme. Bir hipotezin varsa onu doğrulayan komutu çalıştır.
