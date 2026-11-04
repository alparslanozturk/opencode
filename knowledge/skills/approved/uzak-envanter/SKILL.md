---
name: uzak-envanter
description: Buradan (spllnxmgmt01) erişilemeyen bir ortamın envanterini incelemek için kullan — kullanıcı o ortamdaki ansible makinesinde (ör. başka ortamın Satellite'ı) `uzak-topla.sh` çalıştırır, salt-okunur host bilgisi + erişim sonucu tek .tgz olur, buraya getirilir, `uzak-ozet.py` IP bloğu başına erişim (FW talebi adayı) ve host tablosu (OS, çekirdek, CPU/RAM, kök disk, açılış, IP, sanal, kayıtlı Satellite, alan adı, DNS sunucuları, NTP kaynakları, sssd AD alanı) basar. "uzak ortam", "erişemiyoruz ama orada çalıştırırım", "oradaki envanter", "başka ortamın satellite'ı", "çıktıyı getiririm", "ktbulut envanteri" isteklerinde tetiklenir. Erişilebilen ortamda doğrudan `filo-kontrol`.
---

# Uzak ortam envanteri — orada topla, burada incele (salt-okunur)

Alp (2026-11-04): "[ortama] erişemezsek de orada bir ansible çalıştırıp daha sonra oradaki bilgiyi alıp sana verebilirim … uzaktaki
sistemlerin envanterini inceleme şeklinde bir yetenek." İş **inceleme**dir: uzak sunucularda hiçbir şey değişmez; ajan uzak ortama
bağlanmaz — komutu kullanıcı çalıştırır, sonucu getirir.

## 0. Önce sor (tek mesaj, numaralı — oturumda cevabı varsa sorma)

1. **Ortam adı** (dosya adına girer; ör. `ktbulut`) ve orada **ansible çalışan makine** (ad/IP). O makinede `ansible --version`
   çalışıyor mu? Çalışmıyorsa bu beceri yürümez — söyle, kurulum/başka makine kullanıcının kararı.
2. **Envanter dosyası** o makinede nerede, hangi grup (varsayılan `all`)? ansible'ı orada her zaman hangi dizinden çalıştırıyor
   (ansible.cfg, ssh anahtarı/kullanıcı oradan okunur)?
3. **Dosya taşıma yolu**: betiği oraya, .tgz'yi buraya nasıl taşıyacak (scp, MobaXterm sürükle-bırak, içeriği yapıştırma)? `[SAHA]`

## 1. Uzak makinede — kullanıcı çalıştırır

Betik: `/root/ai/opencode/knowledge/skills/approved/uzak-envanter/uzak-topla.sh` (~50 satır, yalnız bash + ansible; kit gerekmez).
Kullanıcıya **betiğin yolunu ve tek komutu** ver; içeriği sohbete basma (yapıştırma isterse `cat` ile kendisi alır):

```bash
bash uzak-topla.sh <envanter> <ortam-adı> [<grup>]
```

Ne yapar (kaynağı oku, kullanıcıya böyle anlat — fazlasını söyleme):
- `ansible <grup> -m raw -T 5 --task-timeout 30 -f 30 -t uzak-<ortam>-<tarih>/bilgi` ile her sunucuda **yalnız okuma** komutları:
  `ad` · `os` (`/etc/os-release`) · `cekirdek` · `cpu` · `bellek_gb` · `kok_doluluk` · `acilis` (`uptime -s`) · `ip` (varsayılan yolun kaynak IP'si — k8s node'unda veth/CNI adresleri gürültü olmasın; saha 2026-11-04:
  `ip -br a` çıktısı yüzlerce veth satırı getirdi) · `ip_sayisi` (`hostname -I` adet) · `sanal`
  (`systemd-detect-virt`) · `satellite` (`/etc/rhsm/rhsm.conf` hostname — hangi Satellite'a kayıtlı) · `alan_adi` (`hostname -d`) ·
  `dns` / `dns_arama` (`/etc/resolv.conf`) · `ntp` (`chrony.conf`/`ntp.conf` server/pool satırları — yapılandırılan, anlık senkron
  değil) · `ntp_senkron` (`chronyc tracking` Leap status — `Normal` = senkron) · `ad_alani` (`/etc/sssd/sssd.conf` `domains=`; boşsa AD'ye sssd ile katılmamış ya da dosya yok). `-m raw`: hedefte python gerekmez.
- Çıktıyı **yapıştırtma** — tek dosya getirtilir (saha 2026-11-04: yapıştırılan 347 sunucu çıktısı oturumu 262k pencereye kilitledi).
- Erişilemeyen sunucunun ssh hata mesajı da tree'ye yazılır — erişim analizi ayrı tarama gerektirmez.
- `meta.txt` (ortam, tarih, makine, **kaynak IP** — FW talebi satırına girer, ansible sürümü, host sayısı) + envanterin kopyası.
- Yazdığı tek yer: çalışılan dizinde `uzak-<ortam>-<tarih>/` ve `.tgz`. Sonda .tgz'nin tam yolunu basar.

Süre: erişilemeyen sunucu başına ~5 sn, 30 paralel (ölçüldü yerelde: 3 sunucu, 1 zaman aşımı → ~6 sn). Büyük envanterde
kullanıcıya "birkaç dakika" de, sayı uydurma.

## 2. Burada — getirilen .tgz'yi incele

```bash
mkdir -p uzak && tar xzf <getirilen>.tgz -C uzak
python3 /root/ai/opencode/knowledge/skills/approved/uzak-envanter/uzak-ozet.py uzak/uzak-<ortam>-<tarih>
```

Basar (hesap betiklerde — **aynen aktar**, sayı/blok/sınıf kafadan yazma):
1. **Başlık**: ortam, toplama zamanı, toplayan makine + IP, envanterdeki ve tree'deki sunucu sayısı.
2. **Erişim — IP bloğu başına** (`filo-kontrol/erisim-blok.py`, ayrıntı `filo-kontrol` §7): AĞ YOLU KAPALI (FW talebi adayı:
   `kaynak → blok tcp/22`) · BLOK AÇIK AMA SUNUCU SORUNLU (yetki/reddedildi = ağ açık; zaman aşımı tek sunucuda = kapalı ya da
   sunucu FW'ı) · HEPSİNE ERİŞİLDİ · IP'siz (DNS).
3. **Host tablosu** (`filo-kontrol/filo-tablo.py --kv`): erişilen her sunucu bir satır, çoğunluktan farklı hücre `*`; `os`,
   `satellite`, `sanal` dağılımı (değer başına sunucu adları). `--csv <dosya>` → Excel için CSV (`rapor` becerisi HTML/XLSX).

Ek karşılaştırma isteğe bağlı: depodaki listeyle (`git` §6) — `envanter-fark.py uzak/…/envanter.ini --birlesik --karsi <liste>…`.

## 3. Cevap biçimi

```
<ortam> envanteri (<toplama zamanı>, <makine>'den): N sunucu — erişilen A, erişilemeyen B
FW talebi adayı bloklar: <blok> (k sunucu) … — kaynak <IP>, tcp/22
Blok açık ama sorunlu: <sunucu> <sınıf> …
Host özeti: os dağılımı …, Satellite kaydı …, dikkat çeken '*' hücreler …
```

Kök disk doluluğu, eski çekirdek vb. **yorum** ise "tahmin:" de; eşik uydurma (kullanıcı eşik verirse onu kullan).

## Yapmayacakların

- Uzak ortama kendin bağlanmaya çalışma (erişim yok — bu becerinin varlık sebebi); "erişim açılsın" diye ağ/FW önerisini blok
  sonucuna dayandır.
- Betiğe değişiklik yapan komut ekleme, kullanıcıya "şunu da ekle" deme — ayrı ihtiyaç ayrı iş (adım onayı).
- .tgz içeriğini kurum dışına taşıma/özetini dışarı yazma (saha verisi); repoya koyma.
- `/24` varsayımdır; ağ maskesi farklıysa kullanıcıya sor.
