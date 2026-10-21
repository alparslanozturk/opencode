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
sayı hedefi yok (eski "6-10" hedefi kaldırıldı; şu an **20**). Kullanılmayan beceri silinmez, `parked/`'a taşınır.

## Adlandırma: `<platform>-<iş>` (Alp onayı, 2026-10-17)

Çok sayıda, küçük, adından ne yaptığı anlaşılan beceri — büyük karma beceri yerine. Neden: ajan her oturumda yalnız ad +
açıklamayı görür, içerik gerekince yüklenir; büyük beceri her yüklemede bağlamı doldurur (eski `kume-denetim` ~15 bin token,
GPU bölümü test kümesinde boşa yükleniyordu) ve Qwen dolu bağlamda bozuluyor (saha G62/G65). Kural: **bir beceri = bir
platformda bir iş**; ortak veri/araç tek yerde (`surum-uyum/uyum.py`), diğerleri ona yönlendirir.

- **k8s-** (her Kubernetes — Anthos/GKE dahil): `k8s-sorun`
- **rke2-** (Rancher'ın yönettiği RKE2): `rke2-denetim` · `rke2-gpu` · `rke2-guvenlik` · `rke2-yukseltme` · `rke2-kurulum` · `rke2-node-ekle` · `rke2-edr`
- **rancher-** (Rancher yönetim sunucusu): `rancher-sertifika`
  (Alp, 2026-10-17: genel olan `k8s-`, RKE2'ye özgü olan `rke2-`, GKE'leri yöneten Anthos `anthos-`)
- **anthos-**: `anthos-erisim` (ileride `anthos-yukseltme`)
- **vcf-** (VMware VCF): veri gelince `vcf-denetim` · `vcf-yukseltme`
- **rhel-**: `rhel-yonetim` · `rhel-guncelleme` · `rhel-guvenlik` (CIS/SCAP) · `rhel-depolama` · `rhel-performans` · `rhel-sorun` · `rhel-teslim`
- **genel**: `ansible` · `filo-kontrol` · `kume-bul` (ad/IP → küme/platform, `kume-bul.py`) · `rapor` · `sep-paket`
- **ortak**: `surum-uyum` (uyum.py + çevrimdışı matris/EOL verisi — tüm platformlar)

Eski → yeni (2026-10-17): kume-denetim → rke2-denetim + rke2-gpu · rke2-ansible → rke2-kurulum + rke2-node-ekle (+ matris →
surum-uyum, Antrea notları → rke2-yukseltme) · guvenlik-saglik → rke2-guvenlik + rhel-guvenlik · yukseltme-plani → rke2-yukseltme +
surum-uyum · k8s-rancher → k8s-sorun · k8s-anthos → anthos-erisim · depolama → rhel-depolama · performans → rhel-performans ·
sorun-giderme → rhel-sorun · sistem-guncelleme → rhel-guncelleme · sunucu-teslim → rhel-teslim · filo-durum-kontrolu →
filo-kontrol · rapor-envanter → rapor · paket-uret → sep-paket. Sahada `al.sh` (`--delete`) eski klasörleri siler; kalırsa
`./kur.sh` kurmaz (G64 koruması).
