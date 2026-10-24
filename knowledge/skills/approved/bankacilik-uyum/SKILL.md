---
name: bankacilik-uyum
description: Bankacılık regülasyonlarının (BDDK Bilgi Sistemleri ve Elektronik Bankacılık Hizmetleri Yönetmeliği, KVKK teknik tedbirler, PCI DSS v4.0.1) sunucu ve Kubernetes tarafındaki karşılığını çıkarırken, denetçi sorusuna kanıt toplarken ve CIS/kurum istisnasını regülasyon diliyle belgelerken kullan — madde → teknik kontrol → okuma komutu/beceri eşlemesi, iz kaydı 5 yıl, ayrıcalıklı hesap, standart konfigürasyondan sapma kaydı, PCI kart ortamında SELinux/firewalld/root-login çakışması. "bddk", "bilgi sistemleri yönetmeliği", "kvkk", "pci", "pci dss", "kart verisi", "cde", "denetim", "denetçi", "regülasyon", "uyum kanıtı", "iz kaydı", "log saklama", "istisna kaydı", "telafi edici kontrol" isteklerinde tetiklenir. Teknik ölçüm becerileri: `rhel-cis`, `rke2-cis`, `idm-erisim`, `rhel-guvenlik`, `rke2-guvenlik`. Hukuki yorum yapmaz; yalnız okur.
---

# Bankacılık regülasyonu ↔ altyapı kanıtı

Kaynak (indirme 2026-10-24): **BDDK** *Bankaların Bilgi Sistemleri ve Elektronik Bankacılık Hizmetleri Hakkında Yönetmelik* — Resmî Gazete
15.03.2020, sayı 31069 (resmigazete.gov.tr/eskiler/2020/03/20200315-10.htm), yürürlük 01.07.2020 · **KVKK** *Kişisel Veri Güvenliği Rehberi
(Teknik ve İdari Tedbirler)* (kvkk.gov.tr), dayanak 6698 s. Kanun m.12/1 · **PCI DSS v4.0.1** — ComplianceAsCode SSG v0.1.82 `pcidss_4.yml`
kontrol dosyası ve RHEL `pci-dss` profili (PCI belgesinin kendisi indirilmedi). Madde metni değişmiş olabilir: denetimde güncel metni kontrol et.

**Sınır:** bu beceri hukuki yorum yapmaz, "uyumlu/uyumsuz" hükmü vermez. Yalnız "bu madde şu teknik kontrolü ister → kanıtı şu komut/beceri →
ölçülen değer" zincirini kurar; yorum ve kabul uyum/güvenlik biriminin.

## 1. BDDK Yönetmeliği — altyapıya değen maddeler

| Madde | Ne ister (özet) | Kanıt / beceri |
|---|---|---|
| m.9 Veri gizliliği | Günün teknolojisine uygun şifreleme; anahtar ömrü ve güvenli yaşam döngüsü; sunucularda açık metin hassas veri taraması | K8s secrets şifreleme (`rke2-guvenlik` §2) · TLS/sertifika (`rancher-sertifika`, `sertifika-kontrol.py`) |
| m.11 Kimlik ve erişim | Görevler ayrılığı · başarısız deneme sınırında kilit · hareketsiz oturumu sonlandırma/kilitleme · yetkiler **yılda en az bir** gözden geçirilir · **ayrıcalıklı hesap**: ek kontrol, iz kaydı + düzenli gözden geçirme, hesap oluşturma/silme ve başarısız girişte uyarı, ortak kullanımı engelleme ya da kullanan gerçek kişiye sorumluluk atama · benzersiz kullanıcı; ortak/ön tanımlı hesap zorunlu değilse kullanılmaz, zorunluysa sorumluluk atayan ilave kontrol (11/10) · onaysız yerel yönetici hakkı yok (11/13) | IdM HBAC/sudo (`idm-erisim`) · CIS 5.3–5.4 parola/faillock (`rhel-cis`) · K8s RBAC (`rke2-guvenlik` §3) |
| m.12 Bütünlük | İşlem/kayıt/veri bütünlüğü | AIDE (CIS 6.1, `rhel-cis`) |
| m.13 İz kayıtları | Kayıtta asgari: sistem, tarih-saat-zaman dilimi, yapılan değişiklik, tekil kullanıcı/sistem · kritik işlem, hassas veri erişimi, yetki verme/değiştirme ve yetkisiz erişim denemesi kayıtları **asgari beş yıl** saklanır · güvenilir ortamda yedek · bütünlük koruması; kullanıcı kendi kaydına müdahale edemez; kayıt sisteminin durdurulmasını önleme/tespit | auditd/journald (CIS 6.2–6.3) · chrony (saat) · K8s audit policy — RKE2 profilsiz/varsayılan `level: None` log yazmaz (`rke2-cis` §2) · audit.log boyutu (`rke2-guvenlik` §2). Saklama süresi merkezi log sisteminde `[SAHA]` |
| m.14 Ağ güvenliği | Katmanlı güvenlik · iç ağ segmentasyonu · hassas sistemler internetten doğrudan erişilemez · uzaktan erişim çok bileşenli doğrulama + iz kaydı · kimlik alanı (AD vb.) bankaya özgü (14/5) | Host güvenlik duvarı kurumda kapalı (kurum kararı) → katman ağ cihazında `[SAHA]` · K8s NetworkPolicy (`rke2-guvenlik` §3) |
| m.15 Güvenlik konfigürasyonu | Sıkılaştırılmış ve test edilmiş **standart konfigürasyon**; **sapmalar değişiklik yönetimiyle kayıt + onay; iş gereksinimi, iş sorumlusu, gereksinim süresi kaydedilir** (15/1) · uygulama beyaz listesi + dosya bütünlüğü · OS tipi/sürüm/yama seviyesi envanteri · yalnız onaylı port/servis açık, düzenli port taraması | CIS profili + istisna kaydı (§4) · `filo-kontrol`/`rapor` envanter · `ss -tlnp` |
| m.16 Yama ve açık yönetimi | Yama süreci değişiklik yönetiminde; uygulanmayan yamaya telafi edici kontrol · **üretici desteği biten sistem**, telafiyle de güvenli değilse kullanımdan kalkar (16/2) · otomatik açık taraması · zararlı yazılım izleme | `rhel-guncelleme`, `rhel-guvenlik` · EOL `surum-uyum` (`uyum.py`) · EDR `rke2-edr` |
| m.24 Değişiklik yönetimi | Her değişiklik süreçten; geçerli iş ihtiyacı; görevler ayrılığı; test; değişiklik öncesi yedek + **geri alma planı**; yeterli iz kaydı; acil değişikliğin belgeleri sonradan tamamlanır | Kit kilidi: CN + sunucu listesi yetkisi, audit log · `ansible --check --diff` · kurum git deposu |
| m.27 Erişilebilirlik ve yedekleme | Kritik sistemde yedekli çalışma · OS + uygulama + veri yedeği, **geri yükleme testi**, taşımada şifreleme · hangi yedeğin nerede/ne sıklıkta tutulduğu kayıtlı | etcd snapshot + dış kopya, `rancher-backup` (`rke2-guvenlik` §2, §4) · Run:ai yedeği (`rke2-runai` §4) |
| m.25 Birincil/ikincil sistem | Birincil ve ikincil sistemler yurt içinde | Bilgi (kurum mimarisi) |

## 2. KVKK — Kurul rehberi teknik tedbirleri

Kanun m.12/1: veri sorumlusu hukuka aykırı işlemeyi/erişimi önlemek ve muhafazayı sağlamak için "uygun güvenlik düzeyini temin etmeye yönelik
gerekli her türlü teknik ve idari tedbiri" alır. Rehber Tablo 4.1 teknik tedbirleri: yetki matrisi · yetki kontrol · erişim logları · kullanıcı
hesap yönetimi · ağ güvenliği · uygulama güvenliği · şifreleme · sızma testi · saldırı tespit/önleme · log kayıtları · veri maskeleme · veri kaybı
önleme · yedekleme · güvenlik duvarları · güncel anti-virüs · silme/yok etme/anonimleştirme · anahtar yönetimi. Rehber §3.1–3.2 ayrıca: parola
deneme sınırı, düzenli parola değişimi, yönetici yetkisinin yalnız ihtiyaçta kullanımı, ilişiği kesilen hesabın gecikmeden kapatılması, tüm
kullanıcı işlem kayıtlarının düzenli tutulması, düzenli zafiyet taraması ve sızma testi. Kanıtı §1'deki becerilerle aynı komutlardan topla.

## 3. PCI DSS v4.0.1 — kart (CDE) sunucuları

- RHEL'de hazır profil: `xccdf_org.ssgproject.content_profile_pci-dss` ("PCI-DSS v4.0.1 Control Baseline"). Tarama `rhel-cis` §2 komutuyla, profil
  adını değiştirerek; `cis-ozet.py` kurum kararlarını yine ayırır (madde no CIS'e göredir, PCI numarası basmaz — PCI no için §3 tablosu).
- **Kurum istisnalarıyla çakışan PCI gereksinimleri (SSG `pcidss_4.yml`):**

| PCI | Konu | SSG kuralları |
|---|---|---|
| 1.2.1 · 1.3.1 · 1.4.1 | Ağ güvenlik kontrolü kural setleri, CDE'ye gelen trafik | `service_firewalld_enabled`, `configure_firewalld_ports`, `firewalld_loopback_*`, `nftables_ensure_default_deny_policy` |
| 1.2.6 | Servis/protokol güvenlik özellikleri | `grub2_enable_selinux`, `selinux_state` (enforcing), `selinux_policytype`, `selinux_confinement_of_daemons` |
| 2.2.6 | Sistem güvenlik parametreleri | `sshd_disable_root_login` |
| 8.6.1 | Etkileşimli girişe açık sistem/uygulama hesapları | `no_direct_root_logins`, `securetty_root_login_console_only` |
| 8.3.4 | Geçersiz giriş denemesi sınırı | `enable_authselect` (`sssd` profili) |
| 10.3.4 · 11.5.2 | Log/dosya bütünlüğü izleme | `audit_rules_mac_modification_etc_selinux`, AIDE kuralları |

  Kart ortamında SELinux/firewalld/root-ssh kurum istisnası bu gereksinimlerin karşısında **belgelenmiş telafi edici kontrol** gerektirebilir
  (genel — kabul QSA/uyum biriminin). Ajan bunu "ihlal" diye yazmaz; tabloyu ve ölçülen değeri verir.

## 4. İstisna (sapma) kaydı — BDDK m.15/1 alanları

Kurum CIS istisnaları (SELinux, firewalld, root ssh, RKE2 ip_forward) için tek satırlık kayıt önerisi:
```
madde (CIS/PCI no) | sapma | iş gereksinimi | iş sorumlusu | süre / gözden geçirme tarihi | telafi edici kontrol (kanıt komutu) | onay (CN)
örnek: CIS 5.1.20 | PermitRootLogin açık | <gerekçe — Alp> | <birim> | <tarih> | IdM HBAC sshd + sudo kuralları (idm-erisim §3) | CHG…
```
Gerekçe/sorumlu/süre alanlarını **uydurma** — Alp ya da kurum kaydı; boşsa `[SAHA]`.

## 5. Denetçi sorusu → kanıt (okuma)

| Soru | Kanıt |
|---|---|
| Sunucular hangi sıkılaştırma standardında, sapmalar neler? | `rhel-cis` §2 (`cis-ozet.py`), istisna kaydı §4 |
| Ayrıcalıklı erişim kimde, kayıt altında mı? | `idm-erisim` §3 (HBAC/sudo), `rke2-guvenlik` §3 (cluster-admin), auditd durumu |
| İz kayıtları 5 yıl saklanıyor mu? | Yerelde `journalctl --disk-usage`, `/var/log/audit` boyutu; asıl saklama merkezi log sisteminde `[SAHA]` — yerel diskten 5 yıl çıkarımı yapma |
| Destek süresi biten sistem var mı? | `uyum.py kontrol …` (EOL satırları) |
| Yamalar güncel mi? | `rhel-guvenlik` §2 |
| Yedek ve geri dönüş? | etcd snapshot/dış kopya, rancher-backup (`rke2-guvenlik`) |

## Yapmayacakların

- "BDDK'ya aykırı", "KVKK ihlali" gibi hukuki hüküm; madde metnini ezberden alıntılama (tablodaki özetler Resmî Gazete metninden, 2026-10-24).
- Kurum istisnasını kapatmayı önerme (SELinux/firewalld açın vb.) — AGENTS "Kurum sunucu gerçekleri".
