---
name: filo-kontrol
description: Aynı kontrolü birden çok sunucuda çalıştırıp sorunluları ayıklarken kullan — ansible ad-hoc + `--tree` + deterministik `filo-tablo.py` (sunucu başına durum, sapmalar, çıktı grupları, anahtar=değer tablosu; çıktısı gelmeyen sunucular). "tüm sunucularda", "filoda", "hepsinde kontrol et", "kaç sunucuda", "toplu", "hangi sunucularda", "tablo", "karşılaştır", "hepsinde aynı mı" isteklerinde tetiklenir. Envanter ve playbook ayrıntıları için `ansible`.
---

Doğrulandı: ansible-core 2.16.16, AlmaLinux 10.2 — 2026-08-29

**SSH döngüsü kurma.** `for h in ...; do ssh $h ...; done` kalıbı sırayla
çalışır, tek bir ulaşılamayan sunucuda takılır ve çıktısı ayrıştırılamaz.
Ansible ad-hoc bunu tek komutta, paralel ve makine okunur biçimde yapar.

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
- **Durum** sayımı: `ok · rc≠0 · ERİŞİLEMEZ · ZAMAN AŞIMI`;
- **Sapmalar**: her sorunlu sunucu ve mesajı; `--grup` verilince beklenip **hiç çıktısı gelmeyen** sunucular (`ÇIKTI YOK`) —
  bu sunucular için değer yazma, durumlarını yaz;
- **Çıktı grupları**: birebir aynı çıktıyı veren sunucular tek satırda ("[31 sunucu] …") — sapanı bulmanın en hızlı yolu;
- `--kv`: komut `anahtar=değer` satırları basıyorsa sütunlu tablo, çoğunluktan farklı hücre `*` ile.

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

## Sınır

**Bu beceri salt-okunur tarama içindir.** Filo geneli bir değişiklik
gerekiyorsa (paket kurmak, servis yeniden başlatmak) ad-hoc komutla yapma:
`ansible` becerisine geç, playbook yaz, `--check` ile kuru çalıştır,
`--limit` ile daralt ve kullanıcıdan onay al.

Bir yazma işlemini ad-hoc `-m shell` ile tüm filoya uygulamak, geri alması
en zor hatadır.
