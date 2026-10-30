---
name: ansible
description: Ansible ile birden çok sunucuda iş yaparken kullan — proje düzeni kurma, CN/değişiklik numarasıyla iş envanteri (hosts-<CN>-<tarih>.ini) üretme, sertifika/ayar dosyasını playbook'a gömülü dağıtma, envanter doğrulama, tek sunucuya daraltma, ad-hoc komut, playbook yazma ve hazır playbook'u inceleme (`playbook-denetim.py`), playbook çalıştırma, kuru çalıştırma. "ansible", "playbook", "hosts dosyası", "tüm sunucularda", "şu sunucuda çalıştır", "ansible-playbook" isteklerinde tetiklenir.
---

Doğrulandı: ansible-core 2.16.16, AlmaLinux 10.2 — 2026-08-29
`--limit` davranışı ansible-core 2.15.13'te ölçüldü — 2026-08-31

> Tetikleyici listesinden "envanter" ve "inventory" kasıtlı olarak
> çıkarıldı (B-20): proje bağlamında hemen her istekte geçiyor ve
> "envanteri çıkar, ansible ile uğraşma sadece sayılar lazım" gibi tam
> tersini söyleyen isteklerde bile bu beceriyi tetikliyordu. Yeni bir
> tetikleyici eklerken aynı hataya düşme — kelime yalnızca BU beceriye
> özgü olmalı.

Ansible tek makineyi değil **filoyu** etkiler; eksik `--limit` yüzlerce
sunucuya dokunur. Sıra: proje düzeni → hangi cfg etkin → envanter doğru mu →
kimi kapsıyor → kuru çalıştırma → gerçek çalıştırma.

## 1. Proje düzeni — ilk iş

Ansible işleri kendi klasöründe durur; **her proje kendi yapılandırmasını ve
kendi envanterini taşır**. Playbook yazmadan ÖNCE bu ikisini oluştur:

```
ansible/
  ansible.cfg          [defaults] altında: inventory = hosts-<proje>.ini
  hosts-<proje>.ini    envanter, INI biçimi
  site.yml             playbook
```

Envanter adında proje geçer (`hosts-uretim.ini`), yalın `hosts` değil — bir
dizinde birden çok envanter durabilir, hangisinin ne olduğu ancak adından
anlaşılır. INI biçimi yeterlidir, YAML'e geçme:

```ini
[web]
web01 ansible_host=10.0.0.11
[uretim:children]
web
```

Host değişkeni satır sonuna, grup değişkeni `[web:vars]`, alt grup
`[uretim:children]` bloğuna yazılır.

Düzenin karşılığı: doğru dizine `cd` ettiğin an doğru envanter etkin olur.
`-i` verirsen cfg'deki envanteri **ezer**; ikisi farklıysa çalışan `-i`'dir.

### Envanter düzeni ve iş envanteri (CN başına) — saha G100/G101

```
ansible/
  inventories/
    hosts.ini                          ana envanter — KAYNAK, işe göre değiştirme
    hosts-rke2.ini                     RKE2 kümeleri — KAYNAK
    hosts-dn29000-20261022-1430.ini    iş envanteri: CN önce, tarih-saat arkada (YYYYMMDD-HHMM)
    hosts-kriz-20261022-1515.ini       CN'siz: kriz / kurulum / is
  playbooks/
    12-google-captcha-cert.yaml
```

- **Değişiklik işi (CN verildi) ya da kriz/kurulum** → o işin sunucularıyla iş envanteri üret. Elle INI yazma, IP kopyalama —
  betik ana envanterden host satırını, grubunu, üst grubunu (`:children`) ve `[grup:vars]`'ı **aynen** alır; CN yazıldığı gibi kalır:

  ```bash
  python3 /root/ai/opencode/knowledge/skills/approved/ansible/is-envanter.py dn29000 wor07-14 stlweb01 10.0.0.12 --grup google-captcha-cert
  printf '%s\n' "<kullanıcının yapıştırdığı liste>" | python3 …/is-envanter.py dn29000 - --grup <iş grubu>   # serbest biçim
  python3 …/is-envanter.py --liste      # önceki iş envanterleri (etiket, tarih, host sayısı)
  ```

  Ad, kısa ad (`wor07`), IP, aralık (`wor07-14`, `10.0.9.127-134`, yalın `07-14`) ve grup adı kabul edilir. `--grup` tüm
  host'ları playbook'un `hosts:` grubuna koyar. Çıktıdaki tabloyu (ad · IP · `dosya:satır [grup]`) kullanıcıya **aynen**
  göster. `❓ birden çok host'a uyuyor` → dosya yazılmaz, yalnız o adı sor. `⚠️ envanterde yok` → `[is_ek]`'e olduğu gibi
  yazıldı, kullanıcıyla doğrula (kurulumda normal).
- Çalıştırırken: `ansible-playbook -i inventories/hosts-<CN>-….ini <playbook>` — **`--limit` gerekmez** (Alp, G101: dosyada
  yalnız değişikliğin sunucuları var). Kilit hedefi bu dosyadan okur: her host adı ve `ansible_host` IP'si yetkide olmalı
  Değişiklikte opencode onay ekranı çıkar (kullanıcı onaylar). Dosya adındaki CN'yi bilmiyorsan kullanıcıya sor (zorunlu değil; yoksa
  `hosts-is-<tarih>.ini`). Dosyaya kullanıcının vermediği host ekleme.
  `[grup:vars]` altında `ansible_host` yazma (kilit hedefi belirleyemez). `-i` vermeden (ansible.cfg'nin ana envanteri) değişiklik
  → `--limit` şart.
- Ad ↔ IP eşlemesinde iş envanteri **kaynak sayılmaz** (desen `hosts-<x>-YYYYMMDD[-HHMM].ini` / `hosts-YYYYMMDD-<x>.ini`) — yetkiyi
  ajanın yazdığı dosya genişletemez.
- Aynı CN'ye sunucu eklenirse yeniden üret (yeni dakika → yeni dosya); eski dosya kayıt olarak kalır, üzerine yazılmaz.
- `group_vars/`/`host_vars/` uyarısı → o değişkenler iş envanterine gelmez; ana envanteri `-i` ile, hedefi `--limit` ile ver.
- Ana envanterde düzeltme gerekiyorsa (yanlış IP, eksik host) bu ayrı bir iştir: kullanıcıya söyle, onayla düzelt.

### Dosya dağıtma — içerik playbook'a gömülü (`copy content:`) — saha G101

Sertifika, ayar, repo dosyası gibi **metin** dosyayı sunuculara dağıtırken içeriği playbook'a gömersin (Alp: "dosya olarak
eklemedik, copy ile text olarak gömdük — o daha iyi"): `fetch` / `/tmp` ara dosyası / `src:` yok, playbook tek başına taşınır ve
okunur. **İçeriği sen yazma/kopyalama** (base64 tek karakter bozulur) — betik dosyayı bayt bayt okur, YAML'e çevirir:

```bash
ssh root@<kaynak-sunucu> cat /tmp/pan-captcha.crt | python3 /root/ai/opencode/knowledge/skills/approved/ansible/gomulu-dosya.py \
  --kaynak - --hedef /etc/pki/ca-trust/source/anchors/pan-captcha.crt --hosts google-captcha-cert \
  --cikti ansible/playbooks/12-google-captcha-cert.yaml --sonra "update-ca-trust extract"
```

- Sertifikada üretim anında yerel `openssl` denetimi (subject, issuer, notAfter, parmak izi — başlığa yazılır) + hedefte sha256 `assert`
  (hedefte `validate: openssl` YOK — minimal sunucuda copy'yi düşürüyordu, ölçüldü). **CA anchors hedefinde** extract + güven paketi
  kontrolü + `--dogrula-url` ile URL testi playbook'a girer; sonrası ölçüm `rhel-ca-guven` (`ca-dogrula.py`). Bozuk PEM → dosya yazılmaz. `--sonra` yalnız içerik değiştiyse çalışır (handler).
- Özel anahtar yalnız `--anahtar` ile (0600, `no_log`); git'e commit'lenen dizine koyma. İkili dosya gömülmez (`src:` kullan).
- `--yedek` eski dosyayı yanına saklar — `ca-trust/source/anchors` gibi dizindeki her dosyanın okunduğu yerde **verme**.
- Sonra: `--syntax-check` → `--check --diff` (`-i` iş envanteri) → kullanıcı onayı → gerçek çalıştırma.

### Gerçek çalıştırma sonrası — başarıyı hedefte doğrula

Playbook'un çıkış kodu veya ajanın "yüklendi" özeti tek başına sertifikanın sunucuya ulaştığını göstermez. Özellikle hazır
`ansible/playbooks/12-*.yaml` dosyalarında:

1. `--list-hosts` ile beklenen host listesini çalıştırmadan önce gör; sayı ve adlar iş envanteriyle uyuşmuyorsa dur.
2. Gerçek çalıştırmadan sonra recap'te beklenen her host'un bulunduğunu, `unreachable=0` ve `failed=0` olduğunu doğrula.
3. Her hedefte `/etc/pki/ca-trust/source/anchors/` altındaki dosyanın kaynakla aynı SHA-256 olduğunu ve `update-ca-trust extract`
   adımının hatasız bittiğini doğrula. Sonra hedef sistemin trust store'unda beklenen sertifikanın bulunduğunu kontrol et.
4. Bir host için bile bu kanıtlar yoksa işi "tamamlandı" diye raporlama; o host'u doğrulanmadı olarak ayır.

`gomulu-dosya.py` ile üretilen playbook, içeriği `copy: content:` içine gömer ve uzak dosyanın SHA-256'sını assert eder. Hazır
playbook'un bu betikten üretildiğini varsayma; içeriği ve gerçek host listesini çalıştırmadan önce incele.

## 1b. Playbook yazma — kurallar ve denetim (saha G26, G43, G93)

Yazdığın her playbook'u ve çalıştırmadan önce okuduğun her hazır playbook'u denetimden geçir (ağ istemez, yalnız okur):

```bash
python3 /root/ai/opencode/knowledge/skills/approved/ansible/playbook-denetim.py ansible/playbooks/12-google-captcha-cert.yaml
python3 /root/ai/opencode/knowledge/skills/approved/ansible/playbook-denetim.py ansible/playbooks/      # dizindeki hepsi
```

Çıktı `satır · ENGEL/UYARI/NOT · kod · neden`; çıkış 0 temiz, 1 uyarı, 2 YAML bozuk. Kendi yazdığında ENGEL/UYARI'yı düzelt,
yeniden çalıştır; hazır (ekip) playbook'ta **düzeltme** — bulguları kullanıcıya tek liste ver (§8). Betik `--syntax-check`'in yerini
tutmaz (Jinja/modül adı onun işi); ikisi birlikte.

Yazarken (betiğin denetlediği kurallar):

- **Modül önce:** `dnf`, `systemd_service`, `file`, `lineinfile`, `get_url`, `reboot` — shell yalnız modülü olmayan iş için.
  Modül tekrar çalıştırılabilir ve `--check`'i destekler; shell ikisini de yapmaz.
- **shell/command tekrar çalıştırılabilir olsun:** `creates:`/`removes:` ya da `changed_when:`; okuma görevi `changed_when: false`.
- **Boru varsa** `set -o pipefail` (`executable: /bin/bash`); `| tail` çıkış kodunu yutar (G26).
- **Başarıyı komut basmaz:** `echo "Update complete."` yok — `register:` + `failed_when:`/`assert` (G26, G12 sınıfı).
- **İndirme:** `get_url` + `checksum:`; shell'de zorunluysa `curl -fsS` (G43). Yıkıcı sıra: indir → doğrula → kaldır → kur (G93).
- `hosts:` iş grubunun adı (`google-captcha-cert`), `all` değil; play düzeyinde `ignore_errors` yok; `state: latest` yerine
  sürüm ya da `present`; parola/token değişkenle (`no_log: true`), playbook'a değer yazma; `NOPASSWD: ALL` yazma (IdM — `rhel-yonetim`).
- Her görevin `name:`'i olsun — rapordaki "web12 failed" satırı ancak adla okunur.
- Dosya dağıtımı → aşağıdaki `gomulu-dosya.py` (içeriği sen yazma).
- Dosya adı: dizindeki sıradaki numara (`13-…yaml`); var olan playbook'un üzerine yazma — yeni sürüm yeni numara.

## 2. Hangi ansible.cfg etkin

`ansible.cfg` çalışılan dizinden okunur. Hangisi okundu, **varsayma**:

```bash
ansible --version | head -3          # "config file = ..." satırı
ansible-config dump --only-changed   # etkin ayarlar ve kaynağı
```

**Tuzak: dizin herkese yazılabilirse (777) ansible.cfg sessizce yok sayılır.**
Ölçüldü — uyarı basıp `/etc/ansible/ansible.cfg`'ye düşüyor:

```
[WARNING]: Ansible is being run in a world writable directory
```

Belirti: "ayarım uygulanmıyor". `ls -ld .` ile bak, `chmod 755 .` ile düzelt.

## 3. Envanteri çalıştırmadan önce doğrula

```bash
ansible-inventory --graph            # grup ağacı
ansible-inventory --host web01       # o hostun değişkenleri
ansible <grup> --list-hosts          # kimi kapsıyor
```

Bir sunucunun/IP'nin **hangi kümede/platformda** olduğu, Rancher'ın yönettiği kümelerin envantere alınması →
`kume-bul` becerisi (`kume-bul.py <ad|IP>`; tüm envanter dosyalarını ad + IP ile eşler).

**Bozuk INI hata vermez, sessizce boş envanter üretir.** Kapatılmayan köşeli
parantez yeterli; ölçülen sonuç:

```
[WARNING]: No inventory was parsed, only implicit localhost is available
```

O hâlde playbook hiçbir sunucuya değmez ya da localhost'a çalışır.

## 4. Tek sunucuda çalıştırma

Envanterin tamamı yerine tek makine için `-l` (`--limit`):

```bash
ansible-playbook -i hosts-uretim.ini site.yml -l web01     # tek sunucu
ansible-playbook -i hosts-uretim.ini site.yml -l web       # tek grup
ansible-playbook -i hosts-uretim.ini site.yml -l 'web01,db01'
ansible -i hosts-uretim.ini web01 -m ping                  # ad-hoc
```

Kullanıcı "şu sunucuda" dediğinde varsayılan yol budur; playbook'un `hosts:`
satırını değiştirme, `-l` ile daralt.

Yazım hatası **sessizce geçmez** — ölçüldü, çıkış kodu 1 ile düşer:

```
[WARNING]: Could not match supplied host pattern, ignoring: yok-boyle-bir-sey
ERROR! Specified inventory, host pattern and/or --limit leaves us with no hosts to target.
```

Tersi güvence değil: **doğru yazılmış ama yanlış makineyi gösteren ad** hata
vermez, sessizce oraya çalışır. Gerçek çalıştırmadan önce her zaman
`--list-hosts`.

## 5. Çalıştırma sırası

```bash
python3 /root/ai/opencode/knowledge/skills/approved/ansible/playbook-denetim.py site.yml   # bilinen hata kalıpları (§1b)
ansible-playbook site.yml --syntax-check         # yazım
ansible-playbook site.yml -l web01 --list-hosts  # kimi kapsıyor
ansible-playbook site.yml -l web01 --check       # kuru çalıştırma
ansible-playbook site.yml -l web01               # gerçek
```

`--check` her modülde desteklenmez; `command`/`shell` kuru çalıştırmada
atlanır — "değişiklik yok" çıktısı güvence değildir.

## 5b. Çok sunucuda playbook — zaman sınırı, arka plan, yalnız düşenleri yeniden (saha G102)

G102: playbook `--check` birkaç sunucuda takıldı (biri disk dolu, biri D-state süreçlere takılı), ajanın komut aracı
`Command exceeded timeout` ile kesti — **bitmiş sunucuların sonucu da gitti**; aynı komut iki kez denendi, ikisi de düştü.
Ansible'da görev süresi varsayılan **sınırsız** (`TASK_TIMEOUT default: 0`, `ansible-config list`); `ansible-playbook`'ta
`--task-timeout` bayrağı yok, ortam değişkeniyle verilir. Üçünü birlikte kullan:

```bash
ANSIBLE_TASK_TIMEOUT=120 ANSIBLE_RETRY_FILES_ENABLED=1 ANSIBLE_RETRY_FILES_SAVE_PATH=cikti/retry \
  ansible-playbook -i <iş envanteri> <playbook> --check --diff -f 20 -T 10
```

- `-T 10` bağlantı/banner zaman aşımı; `ANSIBLE_TASK_TIMEOUT` görev başına üst sınır (saniye; işin süresine göre seç —
  paket kurulumu gibi uzun görevde büyüt). Takılan sunucu `failed` olur, diğerleri devam eder (ölçüldü, ansible-core 2.16:
  `The command action failed to execute in the expected time frame (5) and was terminated`).
- **Arka planda çalıştır:** komut aracına `background: true` ver — süre sınırı yok, çıktı dosyaya akar, bitince haber gelir
  (yoklama yapma). Birkaç sunucuyu aşan her playbook (`--check` dahil) böyle. Ön planda kesilirse çıktı yarım kalır.
- **Yalnız düşenleri yeniden:** düşen/erişilemeyen sunucular `cikti/retry/<playbook-adı>.retry` dosyasına yazılır, çıktı
  `to retry, use: --limit @…retry` satırını basar (ölçüldü). Sorun giderildikten sonra **aynı komutu** `--limit @cikti/retry/<ad>.retry`
  ile çalıştır — bitmiş sunuculara tekrar dokunulmaz. Retry dosyası yalnız playbook **sonuna kadar** koşarsa yazılır.
- Sonuç raporu: `PLAY RECAP`'ten "N sunucu bitti, şu M sunucu düştü (sebep)" — düşen sunucuya `filo-kontrol` §3c `-m raw`
  ilk yardımla bak (disk dolu sunucuda normal modüller hiç çalışmaz).
- Gerçek çalıştırma (`--check`'siz) onay ekranına düşer; kullanıcı onaylar.

## 6. Modül seçeneklerini ezberden yazma

`ansible-doc` yerel belgedir, ağ istemez:

```bash
ansible-doc ansible.builtin.systemd_service  # seçenekler ve örnekler
ansible-doc -s ansible.builtin.copy          # kısa şablon
ansible-doc -l | wc -l                       # kurulu modül sayısı
```

Ölçüldü: koleksiyonsuz ansible-core'da 71 modül var. Modül listede yoksa
koleksiyon eksiktir — çevrimdışı ortamda galaxy kurulumu çalışmaz, sor.

## 7. Yan etkili — onaysız çalıştırma

```
ansible-playbook <p>.yml     -l/--limit yoksa TÜM envanter
-m command/shell             uzak makinede komut çalıştırır
-m file/copy/template        dosya değiştirir
-e "degisken=deger"          playbook değişkenini ezer
--become                     uzak makinede root'a yükselir
```

Önce **kimi kapsadığını göster** (`--list-hosts`) ve `--check` çıktısını sun.

## 8. Hazır (kurum/arkadaş) playbook'u çalıştırmadan önce oku — kontrol listesi

Kurumda ekiplerin hazır playbook'ları var (Splunk UF, SEP güncelleme, kullanıcı …). Çalıştırmadan önce dosyayı oku, **`playbook-denetim.py`
ile denetle** (§1b; aşağıdakilerin çoğunu satır numarasıyla bulur) ve kullanıcıya bulduğunu **tek liste** halinde söyle (düzeltmek
kullanıcının kararı; kendin düzenleme):

- `hosts: all` → `--limit` şart; `--list-hosts` ile kapsamı göster.
- Play düzeyinde `ignore_errors: yes` → hatalar sessizce geçer, `PLAY RECAP` "ok" der ama iş yapılmamış olabilir; sonucu ayrı doğrula.
- **Yıkıcı adım doğrulamadan önce mi?** (ör. eski ajanı kaldır → sonra indir/doğrula: indirme bozulursa sunucu ajansız kalır). Sıra
  "indir → doğrula → kaldır → kur" olmalı.
- **Yorum satırına alınmış ön koşul:** sonraki görev bir dosyayı kullanıyor ama o dosyayı kopyalayan görev `#` ile kapalı mı?
  (ör. kurulum betiği `/tmp/…sh` çalıştırılıyor, betiği kopyalayan görev yorumda → betik sunucuda yoksa görev düşer, `ignore_errors`
  ile de görünmez).
- **Tekrar çalıştırılabilir mi?** Sürüm kontrolü yoksa her koşuda kaldır-kur yapar; `stat`/sürüm karşılaştırması var mı.
- Sabit sürüm/yol (`…-9.4.14-….tgz`, `sal_version`) — kullanıcının beklediği sürüm mü, sor.
- Parola/anahtar düz metin mi (`vars/main.yaml`), sudo `NOPASSWD: ALL` veriyor mu → güvenlik notu olarak söyle.

## 9. Semaphore'dan çalışacak playbook (Alp, 2026-10-23)

Ekip playbook'ları **Semaphore UI**'den çalıştırır; playbook'lar Azure DevOps Server'daki ansible deposundan okunur (`git` §0).
Semaphore'un okuma kuralı (semaphoreui.com/docs, user-guide: repositories, inventory, task-templates):

- Playbook yolu **deponun köküne göre** (`playbooks/12-…yaml`). Envanter türü `file` ise **göreli yol şablonun kendi deposunu**
  gösterir, mutlak yol Semaphore sunucusundaki dosyayı — ayrı envanter deposu doğrudan okunamaz. Bu yüzden iş envanteri
  (`inventories/hosts-<CN>-<tarih>.ini`) playbook'la **aynı ansible deposuna** yazılır ve push edilir (`git` §4).
- Semaphore yalnız depoda olanı görür: push edilmemiş playbook/envanter orada **yok**.
- Kimlik (ssh kullanıcısı, sudo, depo için AD hesabı) Semaphore **Key Store**'da; playbook'a/depoya parola yazma, gerekiyorsa
  Variable Group **Secrets**'a koy ve playbook'ta değişken adıyla kullan.
- Zaman sınırı (§5b): şablonun Variable Group'una ortam değişkeni `ANSIBLE_TASK_TIMEOUT=<sn>`.
- Kuru çalıştırma: aynı playbook için ayrı "kuru" şablon — ek CLI argümanı `["--check","--diff"]`. Sıra yine: kuru şablon →
  çıktıyı kullanıcı okur → gerçek şablon.

Kullanıcıya teslim: push edilen dosya yolları + Semaphore şablonu için doldurulacak alanlar (depo, dal `main`, playbook yolu,
envanter dosyası, Variable Group'taki ortam değişkeni) — tek kısa liste.

## Raporlama

`PLAY RECAP` satırlarını olduğu gibi yapıştırma; sorunluları ayır:

```
34 sunucu, 2 sorunlu
  db07   unreachable=1  -> ssh anahtarı ya da isim çözümleme
  web12  failed=1       -> "chronyc: command not found"
diğer 32: ok, changed=0
```

`unreachable` ulaşılamadı (ssh/isim), `failed` ulaşıldı ama görev düştü.
Teşhisin yönünü bu ayrım belirler.
