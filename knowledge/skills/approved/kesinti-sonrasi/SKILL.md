---
name: kesinti-sonrasi
description: Elektrik / veri merkezi kesintisinden sonra Linux sunucuları toplu taramak için kullan — hangi sunucu kesintide kapandı (ani mi, kapatılarak mı), açılmayan/ulaşılamayan hangisi, açılanda kesintiden kalan sorun (başarısız servis, bağlanmamış disk/NFS, dosya sistemi hatası, saat, durmuş konteyner, rke2) var mı; tek salt-okunur ansible komutu + deterministik `kesinti-ozet.py`. "elektrik kesintisi", "güç kesintisi", "enerji kesintisi", "veri merkezi", "kesintiden sonra", "sunucular kapandı", "ups", "kesintiden kaynaklı hata" isteklerinde tetiklenir.
---

# Kesinti sonrası filo taraması (salt-okunur)

Alp (2026-11-03): "veri merkezinde elektrik kesintisine bağlı olarak sunucular kapandı … bütün sunuculara bağlan … başka hatalar değil,
kesintiden kaynaklı bir hata mesajı var mı … bir özet çıkartacağım". İş **özet**tir: hiçbir şey başlatılmaz, bağlanmaz, düzeltilmez.
Düzeltme önerisi yazılır, her biri ayrı komut ve ayrı onayla (AGENTS — adım onayı).

## 0. Önce sor (tek mesaj, numaralı — kurumsal bilgide/oturumda cevabı varsa sorma)

1. **Kesinti saati** (yaklaşık, yerel saat; "09:40 civarı" yeter). Bilinmiyorsa betik sınıflamayı yalnız "ani kapanış" kaydına göre yapar — söyle.
2. **Kapsam:** hangi envanter / grup (tamamı mı, belirli kümeler mi)? Windows/Exchange bu becerinin dışında (ansible Linux'a bağlanır;
   Windows sunucu `ERİŞİLEMEZ` görünür — TTL 128 ise Windows'tur, `rhel-teslim` §1).
3. **Kubernetes kümeleri** de bakılacak mı, hangileri? (Node taraması §1'de zaten gelir; küme düzeyi §3.)

## 1. Tek komut — tara ve sınıfla

```bash
ansible <grup> -i <envanter> -m shell -f 20 -T 15 --task-timeout 90 -t cikti/filo/kesinti -a 'echo acilis=$(uptime -s); l=$(last -x reboot shutdown 2>/dev/null | sed -n 2p); case "$l" in shutdown*) k=temiz;; reboot*) k=ANI;; *) k=bilinmiyor;; esac; echo onceki_kapanis=$k; e=$(timeout 15 journalctl -b --since -24h -p err -q -o cat --no-pager 2>/dev/null); r=$?; [ $r -eq 124 ] && echo hata=takildi || echo hata=$(printf "%s\n" "$e" | grep -vc "^ *$"); echo hata_ilk=$(printf "%s\n" "$e" | grep -v "^ *$" | cut -c1-90 | sort | uniq -c | sort -rn | head -3 | tr -s " " | tr "\n" ";"); echo fs_hata=$(printf "%s\n" "$e" | grep -ciE "I/O error|EXT4-fs error|XFS.*(corrupt|error|shutdown)"); echo basarisiz=$(timeout 10 systemctl --failed --plain --no-legend 2>/dev/null | cut -d" " -f1 | tr "\n" " "); echo bagli_degil=$(findmnt --fstab -n -o TARGET,OPTIONS 2>/dev/null | awk "\$1 != \"none\" && \$1 != \"swap\" && \$2 !~ /noauto/ {print \$1}" | while read t; do timeout 5 findmnt -n "$t" >/dev/null || printf "%s " "$t"; done); echo saat=$(timeout 5 chronyc tracking 2>/dev/null | grep "^Leap status" | cut -d: -f2 | tr -d " "); for r in docker podman; do which $r >/dev/null 2>&1 && echo ${r}=$(timeout 10 $r ps -q 2>/dev/null | wc -l)/$(timeout 10 $r ps -aq 2>/dev/null | wc -l); done; for s in rke2-server rke2-agent; do systemctl is-enabled $s >/dev/null 2>&1 && echo $s=$(systemctl is-active $s); done; echo yuk=$(cut -d" " -f1-3 /proc/loadavg)/$(nproc); echo d_surec=$(ps -eo stat= | grep -c "^D"); true'
python3 /root/ai/opencode/knowledge/skills/approved/kesinti-sonrasi/kesinti-ozet.py cikti/filo/kesinti --kesinti "YYYY-MM-DD HH:MM" --grup <grup> -i <envanter>
```

Komut yalnız okur (kilit onay sormaz — test edildi). Her ağır okuma kendi `timeout`'u içinde: journal tek geçişte ve yalnız son 24 saat
(`--since -24h`; kesinti daha eskiyse o saati yaz) — saha 2026-11-03 ilk koşu: üç ayrı tam-açılış journal taraması, `--task-timeout 30`
ile sağlıklı sunucularda da `ZAMAN AŞIMI` verdi (Alp: "iki sunucuya zaman aşımı dedi ama sonra SSH'da bağlanabildi"). Komutu **olduğu gibi** kopyala; parça parça ya da `for h in …; do ssh` döngüsüyle
çalıştırma (`filo-kontrol` — sırayla çalışır, takılan sunucu hepsini düşürür). Saat bilinmiyorsa `--kesinti`'yi çıkar.
`DİSK DOLU` görünen sunucu için aynı `-a '…'` ile `-m raw` (modül kopyalamaz — `filo-kontrol` §3c).

Toplanan (sunucu başına): `yuk` (load/çekirdek) · `d_surec` (G/Ç bekleyen süreç) · `acilis` (`uptime -s`) · `onceki_kapanis` (`last -x reboot shutdown` 2. satırı: `shutdown` → **temiz**,
`reboot` → **ANI** = kapanış kaydı yok, güç gitti ya da çöktü; ölçüldü: util-linux 2.40, AlmaLinux 10 — kapanışsız açılış `crash` ile
görünür; wtmp döndüyse `bilinmiyor`) · `hata`/`hata_ilk` (bu açılıştaki err+ journal satırı sayısı ve en sık 3'ü) · `fs_hata` (çekirdekte
G/Ç, XFS, EXT4 hatası) · `basarisiz` (`systemctl --failed`) · `bagli_degil` (fstab'da olup bağlı olmayan; noauto/swap hariç) · `saat`
(chrony Leap status) · `docker`/`podman` (çalışan/toplam) · `rke2-server`/`rke2-agent` (etkinse durumu).
Journal kalıcı olmasa da çalışır: hepsi **bu açılıştan** ya da wtmp'den okunur (önceki açılışın logu gerekmez).

## 2. Sonucu oku — betiğin sınıfları

| Sınıf | Anlamı | Sonraki adım (öneri, okuma önce) |
|---|---|---|
| YANIT VERMEDİ | bağlandı ama komut süresinde bitmedi (`ZAMAN AŞIMI`) ya da disk dolu — sunucu **ayakta** | sebep yazma ("ağır yük" gibi — kanıt yok). Önce yalnız onları tekrar: aynı komut `--limit 'a:b'` `-f 5 --task-timeout 180`; yine düşerse `-m raw` + `filo-kontrol` §3c (yük, D-state, takılı mount). Sonra tek sunucu `ssh` ile bak |
| ULAŞILAMADI | ssh bağlantısı kurulamadı / çıktı yok | açılmamış ya da açılışta takılı olabilir: `ping`/TTL (`rhel-teslim` §1); ssh yoksa vCenter konsolu — konsoldaki ekranı kullanıcıdan iste (`filo-kontrol` §3c). Emergency mode sık sebep: bozuk fstab (`rhel-guncelleme` 1) |
| KESİNTİDE KAPANDI | açılış kesintiden sonra | `ANI` = kesintiyle uyumlu; `temiz` = kapatılarak inmiş (UPS/elle). Altındaki sorunlar **kesinti sonrası** sorunlardır |
| KAPANMADI | açılış kesintiden önce | kesintiden etkilenmemiş; altındaki sorun kesintiye **bağlanamaz** — ayrı yaz |

Sorun satırı → okuma komutu (tek sunucu, `ssh root@<ad> '…'`):
- **başarısız servis** → `systemctl status <birim> --no-pager; journalctl -b -u <birim> -n 50 --no-pager`
- **bağlı değil** → NFS ise `rhel-nfs` (`nfs-tani.py` — açılışta NFS'ten önce başlayan konteyner dahil); yerel disk ise `fs_hata` ile
  birlikte bak, `lsblk -f`. Bağlamak (`mount -a`) değişikliktir → onay.
- **fs_hata** → `journalctl -b -k --no-pager | grep -iE "I/O error|XFS|EXT4" | tail -20`. Onarım (`xfs_repair`, `fsck`) bağlama
  kaldırmayı ister — yalnız öner, kendin yapma.
- **saat** → `chronyc sources -v` (açılıştan hemen sonra senkron birkaç dakika sürebilir — tekrar ölç, sonra yaz).
- **konteyner çalışan < toplam** → durmuş olanlar ve restart politikası: `rhel-guncelleme` 1b komutu. Kurum politikası (Alp, 2026-11-02):
  uygulamayı sahibi açar — ajan listeler, başlatmaz.
- **rke2-server/agent ≠ active** → `rke2-denetim` §4 (node) ve §2 (control plane).
- **yuk / d_surec**: betik yük > çekirdek sayısı ya da `d_surec` > 0 ise yazar — G/Ç bekleme (NFS, datastore) ya da takılı süreç; kesintide
  kapanmamış sunucuda bile kesintiyle ilgili olabilir (dayandığı depolama/NFS gidip geldi — tahmin, kanıt `dmesg`/`ps` ile).
- `hata` sayısı **tek başına sorun değildir** (sağlıklı sunucuda da yüzlerce olur; ölçüldü: sshd kex satırları). `hata_ilk`te disk, dosya
  sistemi, servis adı geçiyorsa yukarıdaki satıra bağla; yoksa yalnız bilgi.

## 3. Kubernetes (küme düzeyi)

Node'lar §1'de ulaşılır görünüyorsa küme başına (master'ı `kume-bul` ile bul):
`k8s-sorun` → "Durum özeti" (`k8s-ozet.py`: NotReady node, Pending/CrashLoop pod, olaylar). Kesinti sonrası Pending/ContainerCreating
pod'da NFS bağlaması ve imaj çekme sık sebeptir — `rke2-denetim` §3–4, `kurum-registry`. Salt-okunur: pod silme, restart, drain yok.

## 4. Özet (kullanıcıya — betik çıktısını AYNEN aktar)

```
Kesinti 09:40 · 48 sunucu tarandı
  ulaşılamadı 2   : <ad> ERİŞİLEMEZ, <ad> ZAMAN AŞIMI   → konsol
  kesintide kapandı 41 (ANI 39, temiz 2) — sorunlu 3:
      <ad>  başarısız servis: <birim>
      <ad>  fstab'da olup bağlı değil: /ab
  kapanmadı 5 — sorun yok
```
Değer, ad, sayı betik çıktısından; yorum "tahmin:" ile. Kayıt istenirse: `rapor` → `is-kaydi.py ac kesinti-<tarih>` ve özet
`… | is-kaydi.py ekle son kesinti-ozet`; `/kaydet` iş geçmişine tek satır yazar.

## Yapmayacakların

- Servis başlatma, `mount -a`, reboot, `xfs_repair`, konteyner başlatma — hepsi değişiklik; yalnız öner, onayla ve tek tek.
- Kesintiye bağlanamayan sorunu (KAPANMADI sınıfı, ya da açılıştan önceki tarihli) "kesintiden" diye yazma.
- Windows/Exchange sunucularına bağlanmaya çalışma — kapsam dışı, listede `ERİŞİLEMEZ` olarak kalır.
