---
name: paket-uret
description: Resmî `seplpkg` (SEP Linux Packager) ile offline/unmanaged SEP Linux agent installer paketi üretirken kullan. "SEP paketi", "seplpkg", "offline kurulum", "LinuxInstaller", "ARM64 paket", "SEP Linux agent" isteklerinde tetiklenir. Hedef makine internetsiz/izole; ilk faz unmanaged (SEPM'e enroll sonraki faz).
---

## Ne zaman

Hedef Linux makine internetsiz/izole ve üzerine Symantec Endpoint Protection
(SEP) Linux agent kurulacak. Bu beceri **birinci fazı** kapsar: SEPM'e bağlı
olmayan (**unmanaged**) bir `LinuxInstaller` paketi üretmek. SEPM'e enroll
(`rp` + stub, sylink import) **ayrı, sonraki faz**.

## Üretim makinesi ≠ hedef makine

`seplpkg` **x86-64 + internet erişimi olan** bir makinede çalışır. Ürettiği
paket **başka bir mimari için** olabilir — hedef mimari bir parametre
(`--arch`), varsayılan **x86-64**; ARM64 yalnız hedef öyle istediğinde.

## Araç indirme (A32 — sürüm + bütünlük sabitle)

```bash
wget https://linux-repo.us.securitycloud.symantec.com/seplpkg/seplpkg-linux-amd64
chmod +x seplpkg-linux-amd64
```

Sürüm **v1.0.3.91** bekleniyor — indirilen ikilinin sürümünü ve sha256'sını
doğrula, sessizce güven duyma:

```bash
./seplpkg-linux-amd64 --version
sha256sum seplpkg-linux-amd64
```

## Önce doğrula, sonra üret (A39)

Sözdizimini ya da bir platform/mimari kombinasyonunun var olduğunu **tahmin
etme** — çalıştırıp gör:

```bash
./seplpkg-linux-amd64 --help
./seplpkg-linux-amd64 --platform <platform> --arch <mimari> ls
```

`ls` çıktısında istenen platform+mimari için paket **yoksa**, üretime
geçmeden önce alternatif platform/ürün sürümünü kullanıcıyla netleştir ve
sonucu rapora yaz. Örnek açık soru: Ubuntu 22 ARM64 paketi resmî örneklerde
yok (ARM64 örnekleri yalnız rhel8/rhel9) — saha teyidi gerekir.

## Sözdizimi kuralı (EN ÖNEMLİ)

Bayraklar **alt-komuttan önce** gelir:

```
seplpkg [--platform ...] [--arch ...] [--product ...] [--outdir ...] <ls|dl|rp>
```

✅ `seplpkg --platform ubuntu22 --arch ARM64 --product RU9 dl`
❌ `seplpkg dl --platform ubuntu22` (ters sıra — hata verir)

Bayraklar:
- `--platform` — dağıtım adı/aliası (`ubuntu22`, `rhel9`, `"rhel8 rhel9"`, `all`). Büyük/küçük harf duyarsız.
  Aliaslar: amazonlinux2023/al2023, amazonlinux2/al2, debian10/deb10, debian11/deb11,
  rhel7-10/el7-10/redhat/centos/rocky karşılıkları, sles15/suse15, ubuntu16/18/20/22/24.
- `--arch` — `x86-64` (varsayılan) veya `ARM64`.
- `--product` — `14.3ru4|ru5|ru6|ru8|ru9` veya `14.4` (varsayılan: en son).
- `--outdir` — çıktı dizini (varsayılan cwd'de `SEPLPackage`).
- `--download_retry_count <n>`, `--verbose`, `--version`, `--help`

Komutlar: `ls`/`list` (mevcut paketleri listele) · `dl`/`download` (**unmanaged**
installer üret) · `rp`/`repackage <stub>` (SEPM stub'ını yönetilen paket için
enjekte et — sonraki faz).

## Üretim ve aktarım

```bash
./seplpkg-linux-amd64 --platform <platform> --arch <mimari> --product <RU> dl
```

Çıktı: `LinuxInstaller.<platform>.sep<RU>.` — bu dosyayı hedef makineye aktar.

## Hedefte kurulum — insan onay kapısı

Hedef makineye kurulum **yıkıcı/geri dönüşü zor bir adım** — kendi kararınla
çalıştırma, kullanıcı onayını bekle:

```bash
chmod +x ./LinuxInstaller.<platform>.sep<RU>.
./LinuxInstaller.<platform>.sep<RU>. -- -g   # izole makine: güncelleme kontrolünü atlar
```

## Kurulum sonrası doğrulama (A33)

```bash
systemctl is-active --quiet sdcss
systemctl --failed
pgrep -a symantec
lsmod | grep -i sep
uname -r          # dmesg ile karşılaştır — kernel modül uyumu riski
dmesg | tail -50
```

Bir servisin/modülün çalıştığını doğrulamanın ölçüsü bu komutların çıktısını
**görmüş olmaktır** — "kurulmuş olmalı" demek yetmez.

## Sonraki faz: SEPM'e yönetilen bağlama

```bash
/opt/Symantec/sdcssagent/AMD/tools/sav manage -i sylink.xml
```

Bu adım ve `rp`/stub akışı bu becerinin kapsamı dışında — ayrı faz.

## Egress (üretim makinesi)

İki resmî Symantec deposu, 443:
- `linux-repo.us.securitycloud.symantec.com` — araç + paket deposu
- `ent-shasta-rrs.symantec.com` — paket servisi

## Riskler

- **Kernel modül uyumu** — hedef kernel sürümü SEP modülüyle uyuşmayabilir (A33 ile doğrula).
- **Unmanaged** — bu paket SEPM'e bağlı değil; politika/güncelleme merkezi yönetimden gelmiyor.
- **Bütünlük** — indirilen araç ve üretilen installer imzasız/doğrulanmadan kullanılmamalı (A32: sürüm+sha256 sabitle).
- **Ubuntu 22 ARM64** — resmî örneklerde yok, varlığı saha teyidine bağlı; `ls` ile önce doğrula.

## Raporlama

Çıktı **≤35 satır**. Gerçek kurum host/URL/iç IP/model yolu **yazma** —
yalnız yukarıdaki resmî `*.symantec.com` alan adları vendor-genel ve izinli.
Kurum ağı yoksa canlı doğrulanamayan adımı **"canlı doğrulanmadı"** diye
işaretle, çalıştığını iddia etme.
