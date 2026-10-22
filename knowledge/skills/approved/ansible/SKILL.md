---
name: ansible
description: Ansible ile birden çok sunucuda iş yaparken kullan — proje düzeni kurma, CN/değişiklik numarasıyla iş envanteri (hosts-<CN>-<tarih>.ini) üretme, sertifika/ayar dosyasını playbook'a gömülü dağıtma, envanter doğrulama, tek sunucuya daraltma, ad-hoc komut, playbook çalıştırma, kuru çalıştırma. "ansible", "playbook", "hosts dosyası", "tüm sunucularda", "şu sunucuda çalıştır", "ansible-playbook" isteklerinde tetiklenir.
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
  (yetki: kullanıcının CN + sunucu listesi). Yetkide olmayan host varsa K1 — dosyayı genişletme, kullanıcıya o adı sor.
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

- Sertifikada `openssl` denetimi (subject, issuer, notAfter, parmak izi — başlığa yazılır) + `validate:` + sha256 `assert`
  görevi. Bozuk PEM → dosya yazılmaz. `--sonra` yalnız içerik değiştiyse çalışır (handler).
- Özel anahtar yalnız `--anahtar` ile (0600, `no_log`); git'e commit'lenen dizine koyma. İkili dosya gömülmez (`src:` kullan).
- `--yedek` eski dosyayı yanına saklar — `ca-trust/source/anchors` gibi dizindeki her dosyanın okunduğu yerde **verme**.
- Sonra: `--syntax-check` → `--check --diff` (`-i` iş envanteri) → kullanıcı onayı → gerçek çalıştırma.

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
ansible-playbook site.yml --syntax-check         # yazım
ansible-playbook site.yml -l web01 --list-hosts  # kimi kapsıyor
ansible-playbook site.yml -l web01 --check       # kuru çalıştırma
ansible-playbook site.yml -l web01               # gerçek
```

`--check` her modülde desteklenmez; `command`/`shell` kuru çalıştırmada
atlanır — "değişiklik yok" çıktısı güvence değildir.

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

Kurumda ekiplerin hazır playbook'ları var (Splunk UF, SEP güncelleme, kullanıcı …). Çalıştırmadan önce dosyayı oku ve kullanıcıya
bulduğunu **tek liste** halinde söyle (düzeltmek kullanıcının kararı; kendin düzenleme):

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
