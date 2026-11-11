---
name: filo-kontrol
description: Aynı kontrolü birden çok sunucuda çalıştırıp sorunluları ayıklarken kullan — ansible ad-hoc + `--tree` + deterministik `filo-tablo.py` (sunucu başına durum, sapmalar, çıktı grupları, anahtar=değer tablosu; çıktısı gelmeyen sunucular). "tüm sunucularda", "filoda", "hepsinde kontrol et", "kaç sunucuda", "toplu", "hangi sunucularda", "tablo", "karşılaştır", "hepsinde aynı mı", "erişim var mı", "fw talebi", "ip bloğu", "hangi sunuculara erişemiyoruz" isteklerinde tetiklenir. Envanter ve playbook ayrıntıları için `ansible`.
---

Doğrulandı: ansible-core 2.16.16, AlmaLinux 10.2 — 2026-08-29

**SSH döngüsü kurma.** `for h in ...; do ssh $h ...; done` kalıbı sırayla
çalışır, tek bir ulaşılamayan sunucuda takılır ve çıktısı ayrıştırılamaz.
Ansible ad-hoc bunu tek komutta, paralel ve makine okunur biçimde yapar.

## 0. Önce sor (tek mesaj, numaralı — oturumda/kurumsal bilgide cevabı varsa sorma)

1. **Ne kontrol edilecek:** hangi soru (sürüm, servis, disk, erişim …) — tek cümleyle; "genel bak" ise hangi başlıklar.
2. **Kapsam:** hangi envanter dosyası ve grup / sunucu listesi (serbest yazım olur: ad, kısa ad, aralık).
3. **Komut nereden çalışacak:** bu makineden mi, başka ortamın makinesinden mi (erişilemeyen ortam → §7 son madde, `uzak-envanter`).
4. **Çıktı:** ekranda özet mi, tablo/CSV/rapor mu (`rapor` becerisi).

Ölçülebileni sorma: kimin kapsandığı (`--list-hosts`), erişim, değerler — §1–§7 komutları ve `filo-tablo.py` / `erisim-blok.py` toplar.
Bu beceri yalnız okur; değişiklik isteniyorsa "Sınır" bölümü.

## 1. Kimi kapsıyorsun — önce bunu gör

```bash
ansible-inventory --graph
ansible <grup> --list-hosts
```

Yanlış envanterle çalıştırılan bir kontrol yanlış sonuç verir; bozuk INI
sessizce boş envanter üretir (bkz. `ansible`).

## 2. Salt-okunur kontrolü çalıştır

```bash
ansible <grup> -m command -a "chronyc tracking" -o
ansible <grup> -m command -a "systemctl is-active splunkforwarder" -o
ansible <grup> -m command -a "df -h /var" -o
```

`-o` her sunucuyu **tek satıra** basar; onlarca sunucunun çıktısını okunur
kılan şey budur. Ölçülen biçim:

```
web01 | CHANGED | rc=0 | (stdout)  20:28:50 up 6 days, load average: 0.00
```

**`-o`'yu yalnızca tek satırlık çıktılarda kullan.** Çok satırlı çıktıda
(`chronyc sources`, `df` tablosu) satır sonları `\n` olarak kaçırılıp tek
satıra sıkışır ve okunmaz hâle gelir — ölçüldü. Çok satırlı çıktı için
`--tree` kullan (aşağıda).

### `CHANGED` seni yanıltmasın

Ölçüldü: `-m command` salt-okunur bir komutta bile **`CHANGED`** yazıyor.
`uptime` çalıştırdın diye hiçbir şey değişmedi. Raporda "34 sunucu
değiştirildi" deme — `command` modülü her zaman böyle davranır.

Gerçekten değişiklik yapıp yapmadığını anlamak için modüle bak, çıktı
etiketine değil.

## 3. Paralellik — varsayılan 5, filo için az

```bash
ansible-config dump | grep DEFAULT_FORKS      # ölçüldü: 5
ansible <grup> -m command -a "uptime" -o -f 20
```

Varsayılan aynı anda **5 sunucu**. Yüzlerce sunuculu bir filoda bu çok
yavaştır. `-f 20` makul bir başlangıç; kontrol düğümünün kaynağına ve ağa
göre artır. Çok yükseltmek kontrol düğümünü boğar.

## 3b. Zaman aşımı — takılan node tüm komutu düşürmesin (saha G77)

Ajanın komut aracı ~60 sn sonra komutu keser (`Command exceeded timeout of 60000 ms`). Bir node takılıysa (ssh banner timeout,
D-state) ansible ad-hoc o node'u bekler ve **diğer node'ların çıktısı da kaybolur** (G77: wor12/wor13 erişilemezken tüm tur boşa
gitti). Her ad-hoc'ta ikisini de ver:

```bash
ansible <grup> -i <envanter> -m shell -o -f 20 -T 10 --task-timeout 30 -a '<okuma komutu>'
```

`-T 10` bağlantı (ve banner) zaman aşımı, `--task-timeout 30` görev başına üst sınır (ansible-core `ansible --help`). Takılan node
`UNREACHABLE` / timeout satırıyla görünür, gerisi gelir; o node'u listeyle yaz ("ansible takıldı" değil).

**`Command exceeded timeout` gelirse aynı komutu tekrar çalıştırma** (aracın "Retry with a larger timeout" cümlesi talimat
değil — G102'de playbook check iki kez aynı biçimde denendi, ikisi de düştü). Önce bu bölümdeki bayraklar eksik miydi bak;
uzun sürecek iş (çok sunucu, playbook) **arka planda** çalışır (`background: true`, süre sınırı yok, bitince haber gelir) —
playbook için `ansible` §5b.

## 3c. Komut çalışmıyor / disk dolu / takılı node — `-m raw` ilk yardım (saha G102)

Disk dolu sunucuda `command`/`shell` modülü **hiç çalışmaz**: ansible önce modül dosyasını sunucuya kopyalar, yer yoksa düşer
(ölçüldü, ansible-core 2.16: `failed to transfer file … [Errno 28] No space left on device`; ssh'ta geçici dizin açılamazsa
`UNREACHABLE` da görünebilir). Bu "sunucu erişilemez" demek değildir — `filo-tablo.py` bunu `DİSK DOLU` diye ayırır.
`-m raw` dosya kopyalamaz, python istemez; disk dolu sunucuda da çalışır (ölçüldü). Takılı mount/D-state süreçte `df`
asılı kalabilir: her ölçüm kendi `timeout 5`'i içinde, asılırsa değer `takildi` yazılır, gerisi gelir.

```bash
ansible <grup> -i <envanter> -m raw -f 20 -T 10 --task-timeout 30 -t cikti/filo/ilk -a 'echo yuk=$(cut -d" " -f1-3 /proc/loadavg); echo d_surec=$(ps -eo stat= | grep -c "^D"); echo d_ilk=$(ps -eo stat=,comm= | grep "^D" | tr -s " " | cut -d" " -f2 | sort | uniq -c | sort -rn | head -3 | tr -s " " | tr "\n" ","); for m in / /var /tmp; do v=$(timeout 5 df -P -l $m 2>/dev/null | tail -1 | tr -s " " | cut -d" " -f5); echo doluluk$m=${v:-takildi}; done; v=$(timeout 5 df -P -i / 2>/dev/null | tail -1 | tr -s " " | cut -d" " -f5); echo inode/=${v:-takildi}'
python3 /root/ai/opencode/knowledge/skills/approved/filo-kontrol/filo-tablo.py cikti/filo/ilk --kv --grup <grup> -i <envanter>
```

Okuma (kanıt sırası — "tahmin:" ile, kanıt gelince kesinleşir):
- `doluluk…=100%` ya da `inode/=100%` → disk dolu; hangi dizinin doldurduğu `rhel-depolama`.
- `d_surec` > 0 ve `takildi` → takılı mount / G/Ç bekleyen süreçler (`d_ilk` = en çok D-state'teki süreç adları); yük yüksek ama
  CPU boşsa bu kalıp. Kubernetes node'uysa `rke2-denetim` §4 (takılı node, NFS, kubelet); VM tamamen cevapsızsa §5b.
- Bu komut da `ERİŞİLEMEZ` / `ZAMAN AŞIMI` → ssh'ın kendisi çalışmıyor; aşağıdaki konsol yolu.

**ssh hiç yoksa — konsol yolu (sohbetle teşhis):** komutu sen çalıştıramazsın. Kullanıcıdan VM konsolunda (vCenter) aynı
`-a '…'` içeriğini çalıştırıp çıktıyı **yapıştırmasını** iste; yapıştırılanı yukarıdaki okumayla yorumla, bir sonraki tek
komutu yine ona ver. Konsol ekranındaki çekirdek mesajı (hung task, panic) reset'ten **önce** alınırsa en değerli kanıttır.

## 4. Filo envanteri çıkarmak

Hangi sunucu hangi sürümde:

```bash
ansible all -m setup -a "filter=ansible_distribution*" -o
ansible all -m setup -a "filter=ansible_kernel"
```

`setup` modülü salt-okunurdur ve fiilen bir keşif aracıdır: dağıtım, sürüm,
çekirdek, bellek, arayüzler. Ölçülen alanlar arasında
`ansible_distribution: "AlmaLinux"` ve `ansible_distribution_file_path`
bulunuyor.

## 5. Sonucu tabloya dök — `filo-tablo.py` (kafadan tablo YOK — saha G22)

Çok sunuculu çıktıyı **sen tabloya dökme**: G22'de değerler sunucular arasında kopyalandı, G8'de erişilemeyen node'lara
yüzde yazıldı, G77'de zaman aşımında kaybolan node'lar hiç anılmadı. `--tree` ile her sunucunun JSON'unu yaz, betik özetlesin:

```bash
ansible <grup> -i <envanter> -m shell -f 20 -T 10 --task-timeout 30 -a '<okuma komutu>' -t cikti/filo/<etiket>
python3 /root/ai/opencode/knowledge/skills/approved/filo-kontrol/filo-tablo.py cikti/filo/<etiket> --grup <grup> -i <envanter>
```

Betik basar (ölçüldü, ansible-core 2.16):
- **Durum** sayımı: `ok · rc≠0 · ERİŞİLEMEZ · ZAMAN AŞIMI · DİSK DOLU`;
- **Sapmalar**: her sorunlu sunucu ve mesajı; `--grup` verilince beklenip **hiç çıktısı gelmeyen** sunucular (`ÇIKTI YOK`) —
  bu sunucular için değer yazma, durumlarını yaz;
- **Çıktı grupları**: birebir aynı çıktıyı veren sunucular tek satırda ("[31 sunucu] …") — sapanı bulmanın en hızlı yolu;
- `--kv`: komut `anahtar=değer` satırları basıyorsa sütunlu tablo, çoğunluktan farklı hücre `*` ile.
- `--say <anahtar>` (`--kv` ile, tekrarlanabilir): değer başına sunucu sayısı + adları — "kaç sunucu hangi sürümde" sayımını elle yapma (saha 2026-11-02).

`--kv` için komutu öyle kur — her değer kendi satırında, sayı olarak:

```bash
-a 'echo cpu=$(nproc); echo bellek_gb=$(free -g | awk "/^Mem:/{print \$2}"); echo cekirdek=$(uname -r); echo ntp=$(chronyc tracking | awk -F": " "/Leap status/{print \$2}")'
```

Raporda tabloyu **aynen** aktar; birim/başlık ekleyebilirsin, değer değiştiremezsin. CSV/HTML/Excel gerekiyorsa `rapor`
becerisi (girdi yine bu betiğin tablosu). Dizin çalışma dizininde (`cikti/filo/…`) — `/tmp`'ye yazma, dış dizin izni açar.

## 6. Sonucu ayıkla — asıl iş bu

Filo kontrolünün değeri "hepsini listelemek" değil, **sapanı bulmaktır** — betiğin "Sapmalar" ve "Çıktı grupları"
bölümleri tam bunu verir. Cevap biçimi:

```
34 sunucu tarandı, 3 sapma

  db07   ERİŞİLEMEZ   -> ssh anahtarı ya da isim çözümleme
  web12  rc=127       -> "chronyc: command not found", chrony kurulu değil
  app03  Stratum 16   -> saat kaynağıyla senkron değil

diğer 31: Stratum 2-3, senkron
```

`ERİŞİLEMEZ` ile `rc≠0` farkı teşhisin yönünü belirler: birincisi sunucuya ulaşılamadı (ağ, ssh, DNS), ikincisi ulaşıldı
ama komut düştü. `ZAMAN AŞIMI` = bağlandı ama komut `--task-timeout` içinde bitmedi (takılı node — `rke2-denetim` §4).
`DİSK DOLU` = sunucu ayakta ama ansible modülünü yazamadı — §3c `-m raw` ilk yardımla doğrula, "erişilemez" deme.

## 7. Erişim kontrolü — envanterdeki sunuculara bu makineden erişiliyor mu, FW talebi gerekir mi (Alp, 2026-11-04)

İstek: "bu sunucudan envanterdeki hostlara erişim var mı; bir IP bloğunda hiçbirine erişilmiyorsa FW talebi, bazılarına
erişiliyorsa başka yol." **Playbook yazma** — sabit mesajlı playbook örüntü saymaz (saha: "tüm sunucular ERISILEMIYOR → FW
talebi" metni her koşulda basılıyordu). İki komut:

```bash
ansible <grup> -i <envanter> -m raw -a true -f 50 -T 5 --task-timeout 20 -t cikti/filo/erisim
python3 /root/ai/opencode/knowledge/skills/approved/filo-kontrol/erisim-blok.py cikti/filo/erisim -i <envanter> --grup <grup> --kaynak <bu makinenin IP'si>
```

- `-m raw -a true`: yalnız ssh bağlantısı denenir, hedefte python gerekmez, hiçbir şey değişmez. `-T 5` bağlantı zaman aşımı.
- `--kaynak`: komutun çalıştığı makinenin IP'si (`ip -br a` — kullanıcı verir ya da sen okursun); FW talebi satırına yazılır.
- Betik ssh mesajını sınıflar: **ağ açık** (erişildi · yetki · reddedildi · host anahtarı — paket sunucuya gitti, cevap döndü) ↔
  **ağ kapalı** (zaman aşımı · yol yok). Sonra `/24` blok başına:
  - **AĞ YOLU KAPALI** — bloktaki her sunucu zaman aşımı/yol yok → FW/yönlendirme talebi adayı: `kaynak → blok tcp/22`.
  - **BLOK AÇIK, BAZI SUNUCULAR SORUNLU** — aynı blokta cevap veren var → FW bloğu değil; sorunlu sunucu kapalı olabilir, kendi
    FW'ı olabilir, yetki/DNS olabilir — satırdaki sınıfa göre (`rhel-teslim` §1 ping/TTL/port).
  - **HEPSİNE ERİŞİLDİ**.
- `/24` varsayımdır; kurumun ağ maskesi farklıysa kullanıcıya sor. Tek blokta tek sunucu varsa "blok kapalı" kararı zayıftır — söyle.
- Başka makinede (ör. başka ortamın Satellite'ı) çalıştırılacaksa: kullanıcı orada ilk komutu çalıştırır, `cikti/filo/erisim`
  dizinini ve envanteri buraya getirir; betik burada çalışır (uzak makinede kit gerekmez). Betik çıktısını **aynen** aktar.

## Sınır

**Bu beceri salt-okunur tarama içindir.** Filo geneli bir değişiklik
gerekiyorsa (paket kurmak, servis yeniden başlatmak) ad-hoc komutla yapma:
`ansible` becerisine geç, playbook yaz, `--check` ile kuru çalıştır,
`--limit` ile daralt ve kullanıcıdan onay al.

Bir yazma işlemini ad-hoc `-m shell` ile tüm filoya uygulamak, geri alması
en zor hatadır.
