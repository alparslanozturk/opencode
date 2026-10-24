# skills/ — beceri kütüphanesi

opencode becerileri **talep üzerine** yükler: ajan listeyi görür (isim + `description`),
gerektiğinde `skill` aracıyla içeriği çeker → bağlam şişmez.

## Yaşam döngüsü

| Dizin | Kim koyar | opencode okur mu? |
|---|---|---|
| `approved/` | insan (onay) | ✅ **evet — tek canlı yer** |
| `experimental/` | ajan/insan (deneme) | ❌ hayır |
| `generated/` | ajan (ham üretim) | ❌ hayır |

Dosya biçimi her üç dizinde aynı: `<ad>/SKILL.md`, frontmatter'da `name` + `description`.

**Kural (2026-09-28):** `approved/`'daki her beceri `./kur.sh` ile sahaya kurulur — ayrı bir liste yok,
sayı hedefi yok (eski "6-10" hedefi kaldırıldı; şu an **32**). Kullanılmayan beceri silinmez, `parked/`'a taşınır.

## Deterministik betik ilkesi (Alp, 2026-10-21 — saha G94: "yapay zekânın ortamda çözebilmesi için yetenek geliştir")

Sahadaki model (offline, 35B-A3B) kural metnini her zaman uygulamıyor; en ağır hatalar **ham çıktıyı kafadan birleştirmekten**
çıktı (G21/G22 uydurma kapasite raporu, G38 OS diski "boş", G65 kalan gün, G94 base64). Bu yüzden tekrar eden ağır işler
betiktir; model ham veriyi betiğe **borular**, betiğin bastığı satırı **aynen** aktarır.

| Betik | Beceri | Soru |
|---|---|---|
| `kume-bul.py` | `kume-bul` | sunucu/IP hangi kümede · Rancher hangi kümeleri yönetiyor · ingress · sertifika CN |
| `filo-tablo.py` | `filo-kontrol` | çok sunucuda aynı komut → durum/sapma/tablo |
| `sar-ozet.py` | `rhel-performans` | geçmiş kapasite (CPU/bellek/yük, gün tablosu, CSV) |
| `disk-durum.py` | `rhel-depolama` | hangi disk OS / kullanımda / boş |
| `sertifika-kontrol.py` | `rancher-sertifika` | sertifika dosyaları, kalan gün, anahtar, zincir, eski yaprak; RKE2 tls `--ozet` |
| `k8s-ozet.py` | `k8s-sorun` | küme durumu: NotReady, restart sebebi, DaemonSet, olaylar |
| `gpu-dagilim.py` | `rke2-gpu` | GPU dağılımı: pod başına GPU/Run:ai kesir, vLLM parametreleri, shm, NCCL |
| `olay-penceresi.py` | `rhel-sorun` | olay saati → yerel/UTC pencere + hazır journalctl/sar/UTC grep komutları |
| `tablo-cevir.py` | `rapor` | betik CSV'si → HTML/XLSX (değerler elle yazılmaz) |
| `uyum.py` | `surum-uyum` | sürüm uyumu, EOL, yükseltme yolu; GPU Operator/sürücü/GPU modeli, Run:ai ↔ K8s ↔ GPU Operator |
| `cis-ozet.py` | `rhel-cis` | oscap ekran çıktısı → CIS madde no + L1/L2, kurum kararı ayrı (veri: SSG kontrol dosyaları) |

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
- **rke2-** (Rancher'ın yönettiği RKE2): `rke2-denetim` · `rke2-gpu` · `rke2-gpu-kurulum` (GPU Operator, containerd) · `rke2-runai` · `rke2-guvenlik` · `rke2-cis` · `rke2-yukseltme` · `rke2-kurulum` · `rke2-node-ekle` · `rke2-edr`
- **rancher-** (Rancher yönetim sunucusu): `rancher-sertifika`
  (Alp, 2026-10-17: genel olan `k8s-`, RKE2'ye özgü olan `rke2-`, GKE'leri yöneten Anthos `anthos-`)
- **anthos-**: `anthos-erisim` (ileride `anthos-yukseltme`)
- **vcf-** (VMware VCF): veri gelince `vcf-denetim` · `vcf-yukseltme`
- **rhel-**: `rhel-yonetim` · `rhel-guncelleme` · `rhel-guvenlik` · `rhel-cis` (CIS L1/L2, OpenSCAP) · `rhel-gpu-surucu` (NVIDIA sürücü/CUDA/FM) · `rhel-depolama` · `rhel-performans` · `rhel-sorun` · `rhel-teslim`
- **idm-** (Red Hat IdM + AD trust): `idm-kurulum` · `idm-erisim` (HBAC, sudo, AD grup eşleme)
- **genel**: `bankacilik-uyum` (BDDK/KVKK/PCI ↔ kanıt) · `ansible` · `filo-kontrol` · `kume-bul` (envanter + küme kimliği: ad/IP → küme/platform, Rancher haritası, sertifika — `kume-bul.py`) · `rapor` · `sep-paket`
- **ortak**: `surum-uyum` (uyum.py + çevrimdışı matris/EOL verisi — tüm platformlar)

Eski → yeni (2026-10-17): kume-denetim → rke2-denetim + rke2-gpu · rke2-ansible → rke2-kurulum + rke2-node-ekle (+ matris →
surum-uyum, Antrea notları → rke2-yukseltme) · guvenlik-saglik → rke2-guvenlik + rhel-guvenlik · yukseltme-plani → rke2-yukseltme +
surum-uyum · k8s-rancher → k8s-sorun · k8s-anthos → anthos-erisim · depolama → rhel-depolama · performans → rhel-performans ·
sorun-giderme → rhel-sorun · sistem-guncelleme → rhel-guncelleme · sunucu-teslim → rhel-teslim · filo-durum-kontrolu →
filo-kontrol · rapor-envanter → rapor · paket-uret → sep-paket. Sahada `al.sh` (`--delete`) eski klasörleri siler; kalırsa
`./kur.sh` kurmaz (G64 koruması).
