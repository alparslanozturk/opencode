---
name: solaris-ntp
description: Solaris 11 (SPARC/x86) NTP işleri — özellikle tarama bulgusu "NTP Mode 6" (ntpd dışarıdan kontrol sorgusuna/ntpq'ya cevap veriyor) düzeltmesi; ntp.conf'a `restrict … noquery`, `svcadm restart`, öncesi/sonrası dışarıdan test (`ntp-mode6.py`). "solaris ntp", "mode 6", "ntp mode 6", "ntpq açık", "noquery", "ntp bulgusu", "ntp.conf solaris", "svc:/network/ntp" isteklerinde tetiklenir. Linux saati (chrony) `rhel-yonetim`; Solaris genel komut keşfi parked `solaris-ldom`.
---

# Solaris NTP — mode 6 bulgusu ve düzeltme

Saha (Alp, 2026-10-27): "Solaris 11.4 SPARC makinelerimizde NTP ayarlarında mod 6 diye bir bulgu bulundu; NTP ayarlarını düzeltip servisi
restart edeceğiz." Etiketler: **(ölçüldü)** burada denendi · **(genel)** Solaris/NTP genel bilgisi — canlı Solaris'te doğrulanmadı, ilk
koşuda çıktıyla teyit et; değer yoksa `?`, uydurma.

## 0. Bulgu ne?

ntpd'nin **mode 6** (kontrol) sorgularına — `ntpq -c rv`, `ntpq -p` — dışarıdan cevap vermesi (genel): sürüm/OS/eş bilgisi sızar, yanıtlar
trafik büyütmede (amplification) kullanılabilir. Düzeltme: varsayılan erişim kuralına **`noquery`**. `noquery` yalnız mode 6/7 sorgularını
reddeder; **saat hizmeti (istemcilerin eşitlemesi) sürer** (genel). Etki: başka makineden `ntpq -p <sunucu>` ile izleyen araç varsa artık
cevap alamaz → kullanıcıya sor `[SAHA]`. Sunucunun kendisinde `ntpq -p` çalışmaya devam eder (127.0.0.1 / ::1 serbest bırakılır).

## 1. Önce gör (okuma)

Bulgu sürüyor mu — bu makineden, ek araç kurmadan (RHEL'de ntpq yok):

```bash
python3 /root/ai/opencode/knowledge/skills/approved/solaris-ntp/ntp-mode6.py <sunucu> [<sunucu> …]
```

`AÇIK` = bulgu var · `KAPALI` = cevap yok · `BELIRSIZ` = 123/udp cevap verdi ama mode 6 değil. Çıkış 1 = en az biri AÇIK.
(ölçüldü: sahte NTP cevaplayıcısına AÇIK + sürüm, kapalı porta KAPALI, olmayan ada HATA; gerçek ntpd ile karşılaştırma yapılamadı —
sahadaki ilk "önce" koşusu AÇIK çıkmalı, çıkmazsa söyle.)

Sunucunun kendisi:

```bash
ssh root@<sunucu> 'uname -a; head -1 /etc/release; svcs -l svc:/network/ntp:default | egrep "^(fmri|state|enabled|logfile)"; svcprop -p config svc:/network/ntp:default; grep -v "^#" /etc/inet/ntp.conf | grep -v "^$"; ntpq -p'
```

- `uname -s` `SunOS` değilse bu beceri değil.
- Yapılandırma dosyası `/etc/inet/ntp.conf` (genel). `svcprop -p config` çıktısında başka bir dosya yolu görürsen onu kullan, söyle.
- `restrict` satırlarını **aynen** göster: `noquery` var mı, `ignore` var mı (ignore daha sıkıdır — zaten kapalıdır, dokunma).

## 2. Düzelt (değişiklik — onay ekranı; CN'yi iş envanteri adı için sor, zorunlu değil)

**Çok sunucu → ansible** (`ansible` becerisi: iş envanteri, `--check --diff`, onay, gerçek):

```bash
python3 /root/ai/opencode/knowledge/skills/approved/ansible/is-envanter.py <CN> <sunucular> --grup solaris_ntp
cp /root/ai/opencode/knowledge/skills/approved/solaris-ntp/solaris-ntp-noquery.yaml ansible/playbooks/<sıradaki-no>-solaris-ntp-noquery.yaml
cd ansible && ansible -i inventories/<iş envanteri> solaris_ntp -m ping -T 10      # Solaris'te python3 var mı (genel: /usr/bin/python3)
ansible-playbook -i inventories/<iş envanteri> playbooks/<…>-solaris-ntp-noquery.yaml --check --diff
```

Playbook (ölçüldü — localhost'ta 4 ntp.conf örneğiyle, yeniden başlatma kapalı; ikinci koşu `changed=0`):
- `restrict default …` satırı varsa **yalnız eksik `noquery`'yi ekler** (bayraklar korunur); `ignore`'lu satıra dokunmaz; satır hiç yoksa
  `restrict default kod nomodify notrap nopeer noquery` (+ `-6`) ekler; `restrict 127.0.0.1` / `restrict -6 ::1` ekler (yerel ntpq).
- Her değişiklikte `backup` (yanına tarihli kopya). Değişiklik olduysa handler `svcadm restart svc:/network/ntp:default`, ardından
  `svcs -H -o state` **online** bekler (5 × 3 sn).
- `--diff` çıktısını kullanıcıya göster; onaydan sonra `--check`'siz.

**Tek sunucu, ansible yoksa** (aynı mantık elle): `cp -p /etc/inet/ntp.conf /etc/inet/ntp.conf.<CN>` → yalnız `restrict default`
satırına ` noquery` ekle (yoksa yukarıdaki satırları ekle) → `svcadm restart svc:/network/ntp:default` → `svcs -xv svc:/network/ntp:default`.

## 3. Sonra doğrula ve raporla

```bash
ssh root@<sunucu> 'svcs -xv svc:/network/ntp:default; ntpq -p'
python3 /root/ai/opencode/knowledge/skills/approved/solaris-ntp/ntp-mode6.py <sunucu> [<sunucu> …]
```

- Servis `online`; `ntpq -p` sunucunun kendisinde eşleri listeler (birkaç dakika sonra seçili eşin başında `*` — genel).
- `ntp-mode6.py` → **KAPALI**. Rapor: sunucu · önce (AÇIK) · değişen satır · servis · sonra (KAPALI). Kapanmayan varsa `restrict`
  satırlarını ve servisin gerçekten yeniden başladığını (`svcs -l … | grep state_time`) göster.

## Yapmayacakların

- `ntp.conf`'u baştan yazma, `server` satırlarına dokunma; `ignore`'u `noquery` ile **gevşetme**.
- `svcadm disable ntp` "bulguyu kapatır" ama saati bozar — bulgunun çözümü değil.
- Linux komutu refleksi (`systemctl`, `chronyc`) — Solaris'te SMF: `svcs` / `svcadm` (parked `solaris-ldom` tablosu).
