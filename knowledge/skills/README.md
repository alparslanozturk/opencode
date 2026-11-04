# skills/ — beceri kütüphanesi

opencode becerileri **talep üzerine** yükler: ajan listeyi görür (isim + `description`),
gerektiğinde `skill` aracıyla içeriği çeker → bağlam şişmez.

> **Yönlendirme:** hangi işte hangi beceri — `engine/AGENTS.md` "İş haritası" (gerçek saha cümleleriyle testli). Kurum gerçekleri becerilere
> yazılmaz; sahada `kurumsal-bilgi.ini`'de durur ve her oturumda yüklenir (`/kaydet` günceller).

## Yaşam döngüsü

| Dizin | Kim koyar | opencode okur mu? |
|---|---|---|
| `approved/` | insan (onay) | ✅ **evet — tek canlı yer** |
| `experimental/` | ajan/insan (deneme) | ❌ hayır |
| `generated/` | ajan (ham üretim) | ❌ hayır |

Dosya biçimi her üç dizinde aynı: `<ad>/SKILL.md`, frontmatter'da `name` + `description`.

**Kural (2026-09-28):** `approved/`'daki her beceri `./kur.sh` ile sahaya kurulur — ayrı bir liste yok,
sayı hedefi yok (eski "6-10" hedefi kaldırıldı; şu an **43**, 2026-11-03). Kullanılmayan beceri silinmez, `parked/`'a taşınır.

## Düstur: önce sor, her şey kanıtlı (Alp, 2026-11-03 — "her yetenek için genel anlamda böyle sorması ve kanıtlı olması gerekir")

Her `approved/` becerisi şu iki şeyi taşır (yeni beceride zorunlu; eskiler dokunuldukça tamamlanır — G118):
- **"Önce sor" listesi** — o işte cevabı sonucu değiştiren, kullanıcıdan gelmesi gereken bilgiler (belirti, kapsam, zaman/önceki
  değişiklik, kısıt + işe özel olanlar). Ölçülebilen şey listeye girmez; betiğin `komut` adımı onu toplar.
- **Kanıt etiketi** — her olgu/kural/ayar yanında kaynağı: `man <x>` · komut çıktısı (ölçüldü, sürümüyle) · üretici KB/belge ·
  `(saha G…)` · `(Alp)`. Kaynaksız satır `tahmin:` ya da `[SAHA]` işaretlenir; doğrulanmamış kural yazılmaz. Başka yapay zekanın
  cevabı kaynak sayılmaz. Ayrıntı: `engine/AGENTS.md` "Düstur" bölümü, `knowledge/policy/KAYNAK-ZORUNLULUGU.md`.

## Deterministik betik ilkesi (Alp, 2026-10-21 — saha G94: "yapay zekânın ortamda çözebilmesi için yetenek geliştir")

Sahadaki model (offline, 35B-A3B) kural metnini her zaman uygulamıyor; en ağır hatalar **ham çıktıyı kafadan birleştirmekten**
çıktı (G21/G22 uydurma kapasite raporu, G38 OS diski "boş", G65 kalan gün, G94 base64). Bu yüzden tekrar eden ağır işler
betiktir; model ham veriyi betiğe **borular**, betiğin bastığı satırı **aynen** aktarır.

| Betik | Beceri | Soru |
|---|---|---|
| `kume-bul.py` | `kume-bul` | sunucu/IP hangi kümede · Rancher hangi kümeleri yönetiyor · ingress · sertifika CN |
| `filo-tablo.py` | `filo-kontrol` | çok sunucuda aynı komut → durum/sapma/tablo |
| `uzak-ozet.py` | `uzak-envanter` | erişilemeyen ortamda kullanıcının `uzak-topla.sh` ile topladığı .tgz → IP bloğu başına erişim (FW adayı) + host tablosu (OS, çekirdek, CPU/RAM, kök disk, açılış, Satellite kaydı) |
| `erisim-blok.py` | `filo-kontrol` | envanterdeki sunuculara bu makineden erişim, /24 blok başına: ağ yolu kapalı (FW talebi adayı) · blok açık ama sunucu sorunlu · hepsine erişildi |
| `sar-ozet.py` | `rhel-performans` | geçmiş kapasite (CPU/bellek/yük, gün tablosu, CSV) |
| `disk-durum.py` | `rhel-depolama` | hangi disk OS / kullanımda / boş |
| `sertifika-kontrol.py` | `rancher-sertifika` | sertifika dosyaları, kalan gün, anahtar, zincir, eski yaprak; RKE2 tls `--ozet`; canlı uç `--uc host:port` (https/ldaps — `idm-kurulum` §7) |
| `k8s-ozet.py` | `k8s-sorun` | küme durumu: NotReady, restart sebebi, DaemonSet, olaylar |
| `gpu-dagilim.py` | `rke2-gpu` | GPU dağılımı: pod başına GPU/Run:ai kesir, vLLM parametreleri, shm, NCCL |
| `olay-penceresi.py` | `rhel-sorun` | olay saati → yerel/UTC pencere + hazır journalctl/sar/UTC grep komutları |
| `tablo-cevir.py` | `rapor` | betik CSV'si → HTML/XLSX (değerler elle yazılmaz) |
| `uyum.py` | `surum-uyum` | sürüm uyumu, EOL, yükseltme yolu; GPU Operator/sürücü/GPU modeli, Run:ai ↔ K8s ↔ GPU Operator |
| `leapp-rapor.py` | `rhel-yukseltme` | `leapp preupgrade` raporu (JSON) → ENGEL önce, önem sırası, çözüm; çok sunucu özeti |
| `cis-ozet.py` | `rhel-cis` | oscap ekran çıktısı → CIS madde no + L1/L2, kurum kararı ayrı (veri: SSG kontrol dosyaları) |
| `playbook-denetim.py` | `ansible` | playbook'u çalıştırmadan bilinen hata kalıpları (hosts all, ignore_errors, pipefail, sahte başarı, curl -f …) |
| `envanter-fark.py` | `git` | aynı envanter bilgisi birden çok yerde: ansible INI ↔ ENVANTER.md / başka INI farkı |
| `manifest-uyarla.py` | `rke2-manifest` | küme manifest klasörünü yeni kümeye: parametre bul (kümeler arası fark) · kuru plan · kopyala + değiştir · kalan değer; sır kopyalanmaz |
| `ca-dogrula.py` | `rhel-ca-guven` | CA sertifikası gerçekten yüklü mü: dosya + sha, güven paketi, trust list, URL'ler → sunucu başına TAMAM/EKSİK |
| `imaj-yol.py` | `kurum-registry` | Manifest/helm imajları düğümün RKE2 aynalarına (mirrors + rewrite) göre nereden çekilir; kurulum sonrası çekme hatası (ErrImagePull/ImagePullBackOff) |
| `nfs-tani.py` | `rhel-nfs` | NFS istemcisi: açılışta bağlama zamanı/hatası, NFS'ten önce başlayan konteyner, motor servis sırası, nofail, readahead → BULGU (man kaynaklı) |
| `sep-istisna.py` | `rke2-edr` | SEP Auto-Protect istisna adayları: sunucuda var olan yollardan tam yol + kaynak (Broadcom KB, MongoDB, RKE2), kurum kararı ve kaynaksız aday ayrı |
| `is-kaydi.py` | `rapor` | Geçici saha işinin kaydı (sahada `~/ai/work/is-kayitlari/<tarih>-<etiket>/`): plan.md (önce sor, kanıt, adımlar, risk), okuma/ (komut çıktıları), sonuc.md — kurum iş bilgi tabanı; yalnız bu köke yazar, onaysız |
| `oturum-ozet.py` | `rapor` | opencode oturum dökümünden kanıtlı özet (`/kaydet`): yalnız kullanıcı sözü + komut çıktısı; ajan metni girmez; düzeltilen ajan sözü ve başarısız komut "bilgi değil" bölümünde |
| `envanter-harita.py` | `kurum-envanter` | Sunucu adı + IP (getent) → ilk 3 harf (lokasyon·ortam·alan) başına sayı, domain, /16 blok; tabloya uymayan kod ve domain uyuşmazlığı SOR listesine |
| `kesinti-ozet.py` | `kesinti-sonrasi` | Elektrik/veri merkezi kesintisi sonrası filo, host düzeyinde hızlı (tek ansible okuma komutu): ulaşılamayan · yanıt vermeyen (ayakta) · kesintide kapanan (`last -x` ile ani/temiz) · kapanmayan; yük/D-state, bağlanmamış fstab/NFS (servis, journal, konteyner yalnız istenirse) |
| `veeam-tani.py` | `veeam-linux` | Veeam Linux sunucusunda restore/iş hatası: salt-okunur komut + bilinen sebep kararı (/tmp noexec KB2099, /run/veeamtransport, koşullu veeamnetfsmount) |
| `ntp-mode6.py` | `solaris-ntp` | NTP mode 6 (ntpq kontrol sorgusu) dışarıya açık mı — tarama bulgusunu bu makineden, ek araçsız sınar (önce/sonra) |
| `belge-oku.py` | `belge-oku` | Excel/Word/PowerPoint/PDF/OneNote dışa aktarımı → yer bilgili metin (serbest metin: sır maskelenmez — kopyalama kuralı SKILL §3) |

Betik yazarken:
- **Yalnız okur.** Uzak komut betiğin **içinde değil**, borunun başında (`ssh … "<okuma>" | python3 betik.py -` ya da
  `ansible … -t <dizin>` → `betik.py <dizin>`) — güvenlik kilidi ve onay ekranı uzak komutu görür. Uzak komut betiğin başındaki
  yorumda **sabit** yazılır; SKILL.md onu birebir verir.
- Sütun **adıyla** okur (sıra sürüme göre değişir); sayı/gün/süre betikte hesaplanır; bulamadığı alana `?` basar, uydurmaz.
- Erişilemeyen/çıktısız hedef için "değer YAZMA" satırı basar; çelişki/şüpheyi (aynı değerler, hostname ≠ hedef) kendisi uyarır.
- Sır basmaz (özel anahtar, token — `***`). Python **3.6** uyumlu (RHEL 8 platform-python; `vermin -t=3.6-` ile denetlenir).
- Kurum verisi içermez; örnek veriler genel adlıdır. Regresyon: `script/beceri-betik-test.sh`.

## Adlandırma: `<platform>-<iş>` (Alp onayı, 2026-10-17)

Çok sayıda, küçük, adından ne yaptığı anlaşılan beceri — büyük karma beceri yerine. Neden: ajan her oturumda yalnız ad +
açıklamayı görür, içerik gerekince yüklenir; büyük beceri her yüklemede bağlamı doldurur (eski `kume-denetim` ~15 bin token,
GPU bölümü test kümesinde boşa yükleniyordu) ve Qwen dolu bağlamda bozuluyor (saha G62/G65). Kural: **bir beceri = bir
platformda bir iş**; ortak veri/araç tek yerde (`surum-uyum/uyum.py`), diğerleri ona yönlendirir.

- **k8s-** (her Kubernetes — Anthos/GKE dahil): `k8s-sorun`
- **rke2-** (Rancher'ın yönettiği RKE2): `rke2-denetim` · `rke2-gpu` · `rke2-gpu-kurulum` (GPU Operator, containerd) · `rke2-runai` · `rke2-guvenlik` · `rke2-cis` · `rke2-yukseltme` · `rke2-kurulum` · `rke2-node-ekle` · `rke2-edr` · `rke2-manifest` (git'teki manifesti kümeye: diff → CN ile apply — elle GitOps)
- **rancher-** (Rancher yönetim sunucusu): `rancher-sertifika`
  (Alp, 2026-10-17: genel olan `k8s-`, RKE2'ye özgü olan `rke2-`, GKE'leri yöneten Anthos `anthos-`)
- **anthos-**: `anthos-erisim` (ileride `anthos-yukseltme`)
- **vcf-** (VMware VCF): veri gelince `vcf-denetim` · `vcf-yukseltme`
- **rhel-**: `rhel-ca-guven` (CA yükle + kanıtla) · `rhel-yonetim` · `rhel-guncelleme` · `rhel-guvenlik` · `rhel-cis` (CIS L1/L2, OpenSCAP) · `rhel-gpu-surucu` (NVIDIA sürücü/CUDA/FM) · `rhel-depolama` · `rhel-nfs` (açılış sırası, konteyner, üç eksen performans) · `rhel-performans` · `rhel-sorun` · `rhel-teslim` · `rhel-yukseltme` (Leapp 8 → 9 → 10, Satellite CV)
- **veeam-**: `veeam-linux` (restore hatası, servisler, /tmp noexec)
- **solaris-**: `solaris-ntp` (mode 6 bulgusu: noquery + svcadm restart, playbook şablonu) · parked `solaris-ldom` (genel keşif)
- **idm-** (Red Hat IdM + AD trust): `idm-kurulum` · `idm-erisim` (HBAC, sudo, AD grup eşleme) · `idm-bakim` (log şişmesi, logrotate, SSSD debug, KDC'yi yoran istemci)
- **genel**: `bankacilik-uyum` (BDDK/KVKK/PCI ↔ kanıt) · `ansible` · `kurum-registry` (imaj nereden çekilir: Nexus/Harbor, RKE2 aynaları, çekme hatası) · `belge-oku` (kurum belgesi: Excel/Word/PDF/OneNote) · `git` · `filo-kontrol` · `uzak-envanter` (erişilemeyen ortam: orada topla, burada incele — `uzak-topla.sh` / `uzak-ozet.py`) · `kesinti-sonrasi` (elektrik kesintisi sonrası filo taraması — `kesinti-ozet.py`) · `kurum-envanter` (3 harf → sunucu sayısı, domain, IP blokları; DMZ/DRC — `envanter-harita.py`) · `kume-bul` (envanter + küme kimliği: ad/IP → küme/platform, Rancher haritası, sertifika — `kume-bul.py`) · `rapor` · `sep-paket`
- **ortak**: `surum-uyum` (uyum.py + çevrimdışı matris/EOL verisi — tüm platformlar)

Eski → yeni (2026-10-17): kume-denetim → rke2-denetim + rke2-gpu · rke2-ansible → rke2-kurulum + rke2-node-ekle (+ matris →
surum-uyum, Antrea notları → rke2-yukseltme) · guvenlik-saglik → rke2-guvenlik + rhel-guvenlik · yukseltme-plani → rke2-yukseltme +
surum-uyum · k8s-rancher → k8s-sorun · k8s-anthos → anthos-erisim · depolama → rhel-depolama · performans → rhel-performans ·
sorun-giderme → rhel-sorun · sistem-guncelleme → rhel-guncelleme · sunucu-teslim → rhel-teslim · filo-durum-kontrolu →
filo-kontrol · rapor-envanter → rapor · paket-uret → sep-paket. Sahada `al.sh` (`--delete`) eski klasörleri siler; kalırsa
`./kur.sh` kurmaz (G64 koruması).
