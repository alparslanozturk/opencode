---
name: rhel-cis
description: RHEL 9/10 sunucularda CIS Level 1 / Level 2 uyumunu OpenSCAP (SCAP Security Guide) ile ölçerken, maddeleri tek tek denetlerken, kurum istisnalarını (SELinux, firewalld, root ssh) ayırırken ve uygulanacak maddeleri Ansible'a çevirirken kullan — deterministik `cis-ozet.py` (oscap çıktısı → CIS madde no + L1/L2, kurum kararı ayrı). "cis", "cis level 1", "cis level 2", "l1", "l2", "benchmark", "openscap", "oscap", "scap", "sıkılaştırma", "hardening", "tailoring", "autotailor", "uyum taraması", "madde madde kontrol" isteklerinde tetiklenir. Genel güvenlik sağlığı (yama, reboot, ssh) `rhel-guvenlik`; Kubernetes CIS `rke2-cis`; bankacılık regülasyonu eşlemesi `bankacilik-uyum`. Tarama yalnız okur; düzeltme yetki ister.
---

# RHEL CIS Level 1 / Level 2 — ölç, ayır, uygula

Kaynak etiketi: **(Alp)** kurum kararı · **(RH)** Red Hat belgesi · **(SSG)** ComplianceAsCode *scap-security-guide* v0.1.82
(2026-09-01) kontrol dosyaları · **(genel)** sahada doğrulanmadı. Her sayı/madde bu turdaki bir çıktıdan; yoksa "ölçülmedi".

## 0. Kurum durumu (Alp)

- RHEL 10 şablonu: Satellite'tan SCAP ile **CIS Level 1** (politikaların çoğu uygulanmış). RHEL 9: CIS uygulanmış ESX şablonu.
- **Kurum istisnaları (bulgu değil):** SELinux kapalı (grub) · firewalld kapalı · **root ssh kapatılmaz** — yerine MS AD + IdM:
  sunucular IdM'e katılır (`ipa-client`), AD trust + grup eşleme ile **HBAC (sshd) ve sudo kuralları** (`idm-erisim`) ·
  RKE2 node'larında `net.ipv4.ip_forward=1` · `/tmp` noexec (CIS ile aynı yönde).
- Kurumun hangi maddeleri seçtiği (tailoring) belli olana kadar "uygulanmamış madde" = **bilgi**, kritik bulgu değil.
  CIS'in tek tek elle kontrolü ve istenen maddenin Ansible ile uygulanması gerekebilir (Alp) — §4, §5.

## 1. Profil ve içerik (SSG — RHEL paketinde gelir)

| | RHEL 9 | RHEL 10 |
|---|---|---|
| CIS sürümü (SSG kontrol dosyası) | v2.0.0 · 300 kontrol (L1 237, yalnız-L2 63) | v1.0.1 · 329 kontrol (L1 249, yalnız-L2 80) |
| Veri akışı (RH) | `/usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml` | `…/ssg-rhel10-ds.xml` |
| Level 1 Server profili | `xccdf_org.ssgproject.content_profile_cis_server_l1` | aynı |
| Level 2 Server profili | `xccdf_org.ssgproject.content_profile_cis` (L1'i kapsar) | aynı |
| Hazır playbook (RH) | `/usr/share/scap-security-guide/ansible/rhel9-playbook-<profil>.yml` | `rhel10-playbook-<profil>.yml` |

Paket: `openscap-scanner` + `scap-security-guide` (+ tailoring için `openscap-utils` → `autotailor`, RH). Sahada önce
`rpm -q openscap-scanner scap-security-guide` — yoksa kurmak değişikliktir (yetki). Dosya adlarını sahada `ls` ile doğrula.
Aynı madde numarası iki üründe farklı olabilir (ör. ip_forward RHEL 9 `3.3.1` **L1**, RHEL 10 `3.3.1.1` **L2** — SSG).

## 2. Tarama — yalnız okuma (rapor dosyası yazmadan, ekrana)

`--report/--results` dosya yazar, `--remediate` sistemi değiştirir → kilit bunları değişiklik sayar. Okuma biçimi ekran çıktısıdır;
sayımı **betik** yapar (elle sayma — G21/G22 sınıfı uydurma):

```bash
ssh root@<sunucu> 'grep ^VERSION_ID= /etc/os-release; oscap xccdf eval --profile xccdf_org.ssgproject.content_profile_cis_server_l1 $(ls /usr/share/xml/scap/ssg/content/ssg-rhel*-ds.xml | head -1)' | python3 /root/ai/opencode/knowledge/skills/approved/rhel-cis/cis-ozet.py - --rke2
ansible <grup> -i <envanter> -m shell -f 10 -T 10 --task-timeout 1200 -t cikti/cis -a 'grep ^VERSION_ID= /etc/os-release; oscap xccdf eval --profile xccdf_org.ssgproject.content_profile_cis_server_l1 $(ls /usr/share/xml/scap/ssg/content/ssg-rhel*-ds.xml | head -1)'
python3 /root/ai/opencode/knowledge/skills/approved/rhel-cis/cis-ozet.py cikti/cis
```

- `--rke2` yalnız RKE2 node'larında (ip_forward kurum kararı). Level 2 için profil `…content_profile_cis`.
- oscap fail varken çıkış kodu sıfırdan farklıdır — ansible "FAILED rc=2" der, çıktı yine ağaçtadır; betik okur.
- Betik basar: sonuç sayıları · **BULGU** (fail, kurum kararı dışı; CIS no + L1/L2) · **KURUM KARARI** (gerekçeli) · NOT ·
  `notchecked` (CIS "Manual" maddeler — otomatik sonuç yok). Satırları **aynen** aktar; `--csv <dosya>` → `rapor` becerisi.
- Tarama birkaç dakika sürer (dosya izinleri taranır); ağır bir okuma — canlı yoğun saatte çok sunucuda `-f` küçük tut.

## 3. Kurum kararı ↔ CIS maddesi (SSG kontrol dosyalarından)

| Kurum kararı | RHEL 9 maddeleri | RHEL 10 maddeleri | SSG kuralı |
|---|---|---|---|
| SELinux kapalı | 1.3.1.2, 1.3.1.4 (L1) · 1.3.1.5 (L2) | aynı | `grub2_enable_selinux`, `selinux_not_disabled`, `selinux_state` |
| firewalld kapalı | 4.1.2, 4.2.2 (L1; 4.2.1 manual) | 4.1.1–4.1.5 (L1; 4.1.6–7 manual) | `service_firewalld_enabled`, `firewalld*`, `nftables*` |
| root ssh açık | 5.1.20 (L1) | 5.1.20 (L1) | `sshd_disable_root_login` |
| ip_forward=1 (RKE2) | 3.3.1 (L1) | 3.3.1.1 (L2) | `sysctl_net_ipv4_ip_forward` |

**Çakışmalar — körlemesine düzeltme yapma:**
- **root umask:** CIS (RHEL 10 5.4.2.6, `accounts_umask_root`) root umask'ı kısıtlar; **IdM sunucu/replica kurulumu root umask
  `0022` ister**, aksi halde ör. replica kurulamaz (RH *Installing IdM* §1.9). IdM sunucusunda kurulum sırasında geçici 0022.
- **authselect:** RHEL 10 CIS profili `var_authselect_profile=local`; SSG `enable_authselect` düzeltmesi yalnız **hiç profil seçili
  değilse** `authselect select` çalıştırır (SSG kaynağı). Önce IdM join (sssd), sonra CIS — `authselect current` ile oku.
- **etcd kullanıcısı (RKE2 CIS):** `etcd` kullanıcı/grubu `/etc/passwd`/`/etc/group`'ta olmalı, NSS/IdM'den gelmez (RKE2 belgesi) — `rke2-cis`.
- **PCI DSS (kart sunucuları):** aynı SELinux/firewalld/root-login kuralları PCI profilinde de var → `bankacilik-uyum` §3.

## 4. Tek tek madde kontrolü (elle, okuma)

- Madde ↔ kural ↔ başlık: `grep -P '\t<madde-no>\t' /root/ai/opencode/knowledge/skills/approved/rhel-cis/veri/cis-kural.tsv`
  (yerel dosya). Kuralın denetimini sunucuda gör: `oscap info --profile …` profil listesi; tek kural sonucu §2 çıktısında.
- "Manual"/`notchecked` maddeler (ör. firewalld servis/port, journald dosya erişimi) için kanıtı **komutla oku**, sonucu
  "elle denetlendi: … (komut)" diye yaz; komut yoksa "ölçülmedi".
- Kurum istisnası dışındaki her fail için kurala ait değeri oku (sysctl, `sshd -T`, `findmnt`, `stat`) — betik satırı + kanıt.

## 5. Uygulama (değişiklik — yetki + iş envanteri, önce `--check`)

Önerilen yol **Red Hat'in hazır içeriği** (yeniden yazma yok — `once-varsayilan`):
1. **Tailoring (istisnalar dışarıda):** `autotailor --unselect=sshd_disable_root_login --unselect=selinux_state … --output=kurum-cis.xml
   --tailored-profile-id=kurum_cis_l1 /usr/share/xml/scap/ssg/content/ssg-rhel10-ds.xml cis_server_l1` (RH; kısa kimlik kabul edilir).
   Satellite'ta aynı dosya *Hosts → Compliance → Tailoring Files* ile yüklenip politikaya bağlanır (RH Satellite *Managing security compliance*).
2. **Playbook üret:** sonuçtan yalnız gerekenler — `oscap xccdf eval --profile <p> --tailoring-file kurum-cis.xml --results sonuc.xml <ds>`
   sonra `oscap xccdf generate fix --fix-type ansible --result-id … --output duzelt.yml sonuc.xml` (RH; ikisi de dosya yazar → yetki/yerel).
   Ya da hazır `rhel10-playbook-cis_server_l1.yml` — görevler **kural adıyla etiketli** (SSG 0.1.82 paket playbook'unda doğrulandı,
   2026-10-24: `tags: - sshd_disable_root_login`); tek madde `--tags <kural>`. RHEL 10 L1 playbook'undaki istisna etiketleri (aynı
   paket): `--skip-tags sshd_disable_root_login,grub2_enable_selinux,selinux_not_disabled,selinux_policytype,package_firewalld_installed,service_firewalld_enabled,firewalld-backend,firewalld_loopback_traffic_trusted`
   (L2'de ayrıca `selinux_state`; RKE2 node'unda `sysctl_net_ipv4_ip_forward`). Başka sürüm/profilde `grep -o -E '^    - (selinux|firewalld|grub2_enable_selinux|sshd_disable_root)[a-z_-]*$' <playbook> | sort -u` ile yeniden çıkar.
3. Kurum akışı: playbook kurum ansible deposuna (`git`), iş envanteri + `--check --diff` önce (`ansible` becerisi). SELinux, firewalld,
   sshd root, authselect görevleri **çıkarılmış** olmalı — `grep -n -e selinux -e firewalld -e PermitRootLogin -e authselect duzelt.yml`.
4. Sonra §2 ile yeniden tara; fark = uygulanan madde.

## Yapmayacakların

- `oscap … --remediate` ile toplu düzeltme yok (istisnaları da uygular: SELinux/firewalld/root ssh kapanır — erişim kesilir).
- Kurum istisnasını "kritik bulgu" diye yazma; açılmasını önerme (AGENTS "Kurum sunucu gerçekleri").
- CIS madde numarasını/seviyesini ezberden yazma — betik ya da `veri/cis-kural.tsv`.
