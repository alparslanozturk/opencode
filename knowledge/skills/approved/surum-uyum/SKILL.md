---
name: surum-uyum
description: Sürüm uyumu, destek sonu (EOL / bakım sonu) ve en son yama sorusunda kullan — deterministik `uyum.py` (çevrimdışı veri): Rancher ↔ RKE2 ↔ RHEL ↔ Antrea matrisi, SUSE/K8s/RHEL ömür tarihleri, en son yama, yükseltme yolu hesabı. "uyumlu mu", "matris", "destekleniyor mu", "eol", "end of life", "destek sonu", "destek bitiyor", "bakım sonu", "en son yama", "patch", "sürüm geride mi", "kaç gün kaldı", "supported mı" isteklerinde tetiklenir. Yükseltme planı için `rke2-yukseltme`.
---

# Sürüm uyumu ve destek sonu — `uyum.py`

**Kural:** uyum, ömür (EOL) ve gün hesabını **betik verir, sen hesaplama** (saha G65: 84 gün "120 gün" yazıldı). Veri
`veri/surumler.txt`'de; her bölümün kaynağı ve indirme tarihi orada. Veride yoksa "hesaplanamadı (veri yok)" de.

Betik kitin **kaynak deposundan** çalışır (kur.sh kökü; sahada `/root/ai/opencode` — `./kur.sh kontrol` "kok:" satırı).
`~/.config/opencode/skills/` altından çalıştırma: orası ajanın kendi alanı, kilit K6 kapatır. Değişken (`U=…; $U`) kullanma,
tam yolu yaz:

```bash
python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py kontrol --rancher v2.14.3 --rke2 v1.33.13+rke2r1 --antrea v2.3.0 --rhel 9.2,9.4,9.8
python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py yol --rancher v2.14.3 --rke2 v1.33.13+rke2r1 --antrea v2.3.0 --hedef-rke2 1.35 --hedef-rancher 2.15
python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py kontrol --rol upstream --rancher v2.14.3 --rke2 v1.33.13+rke2r1   # Rancher'ın kendi local kümesi
python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py veri                                                              # veri hangi tarihte indirildi
```

Çıktıyı **olduğu gibi** aktar (✅/⚠️/❌ + `[kaynak: …]`); satır ekleme, tarihi yeniden hesaplama. Çıkış kodu 1 = en az bir ❌.
Sürümleri toplama komutları: `rke2-yukseltme` §1. Kapsam şimdilik Rancher/RKE2/Antrea/RHEL; Anthos ve VMware VCF verisi gelince
aynı dosyaya bölüm olarak eklenir.

## Veriyi güncelleme (internetli makinede, Doktor)

`veri/surumler.txt` bölümleri ve kaynakları: Rancher matrisi `suse.com/suse-rancher/support-matrix/all-supported-versions/rancher-vX-Y-Z/`
· Rancher/RKE2 ömür `suse.com/lifecycle` · K8s/Rancher son yama, RHEL ana sürüm `endoflife.date/api/{kubernetes,rancher,rhel}.json`
· RKE2 son yama `github.com/rancher/rke2/releases` · Antrea `antrea-uyum.txt` kuralı. Güncelledikten sonra `uyum.py kontrol`'ü
eski çıktıyla karşılaştır; bölüm başlığındaki indirme tarihini değiştir. Veri 3 aydan eskiyse çıktıda bunu söyle.

## Elle uyumluluk kontrolü (betik yoksa — T33, Alp: "uyumlulukları kontrol edebilsin matriksleri")

Girdi: kullanıcı beyanı **ya da** kümeden okuma (`rke2-yukseltme` §1; Antrea için
`kubectl -n kube-system get ds antrea-agent -o jsonpath='{.spec.template.spec.containers[0].image}'`).
Veri: aşağıdaki **Çevrimdışı veri** bölümü (her zaman elinde; internet gerekmez).

1. **Mevcut durumu denetle** — her bileşen için tek satır:
   - Rancher ↔ upstream (local) RKE2: upstream sürümü Rancher satırındaki aralıkta mı?
   - Rancher ↔ downstream RKE2: kümenin hattı (1.33 gibi) Rancher satırının downstream hatlarında mı?
   - Rancher ↔ RHEL: sunucunun RHEL sürümü listede mi?
   - Antrea ↔ K8s: kümenin hattı, Antrea satırının Kubernetes aralığında mı?
2. **Kurulum/yükseltme ÖNCESİ** ("X'e geçersem uyumlu mu?"): hedef kombinasyonu aynı dört satırla kontrol et;
   sırayı söyle (Antrea → RKE2 → Rancher; her adımda ara durum da uyumlu olmalı).
3. **Sonuç biçimi** — her satır: `✅ UYUMLU` / `❌ KURAL DIŞI` + **en az / önerilen sürüm** + **kanıt**
   (tablo satırı ve `Kaynak` sütunundaki dosya, ör. `rancher-v2-14-3.txt`, `antrea-uyum.txt:12`).
4. Sürüm tabloda **yoksa**: `❓ HESAPLANAMADI (veri yok)` yaz — **tahmin etme, "varsayım" kullanma**.
   rke2-ansible reposu varsa araçla dene (`araclar/rancher_matris.py … --upstream/--downstream`,
   `araclar/antrea_surum.py <k8s> --antrea <sürüm>`); yoksa kullanıcıdan güncel veriyi iste.

Örnek (kurum, 2026-09-30): Rancher v2.14.3 · upstream v1.33.13 → ✅ (v1.33 … v1.35, `rancher-v2-14-3.txt`) ·
downstream 1.33 → ✅ · Antrea v2.3.0 + 1.33 → ❌ KURAL DIŞI (v2.3 → 1.29–1.32, `antrea-uyum.txt`); en az v2.4,
önerilen v2.7.0 — K8s/Rancher değişikliğinden ÖNCE.

<!-- VERI:BASLA — script/veri-guncelle.sh üretir, ELLE DÜZENLEME -->
## Çevrimdışı veri (üretim 2026-09-30; kaynak: kurum rke2-ansible `araclar/matris/`)

Bu tablolar internetsiz doğrudur — sürüm/uyum sorusunda **önce buraya bak, tahmin etme**. Sorulan sürüm burada
yoksa "bu veride yok — hesaplanamadı" de; rke2-ansible varsa aracı çalıştır, yoksa kullanıcıdan güncel veriyi iste.

**SUSE Rancher destek matrisi** (upstream = Rancher'ın kendi `local` kümesi · downstream = yönettiği kümeler):

| Rancher | Upstream (local) RKE2 | Downstream RKE2 hatları | RKE2 için RHEL | Kaynak (`araclar/matris/`) |
|---|---|---|---|---|
| v2.11.3 | v1.30 … v1.32 | 1.32 · 1.31 · 1.30 | 9.5, 9.4, 9.3, 8.10, 8.9, 8.8 | `rancher-v2-11-3.txt` |
| v2.14.3 | v1.33 … v1.35 | 1.35 · 1.34 · 1.33 | 10.2, 10.1, 10.0, 9.8, 9.7, 9.6, 8.10, 8.8 | `rancher-v2-14-3.txt` |
| v2.14.4 | v1.33 … v1.35 | 1.35 · 1.34 · 1.33 | 10.2, 10.0, 9.8, 9.6, 8.10, 8.8 | `rancher-v2-14-4.txt` |
| v2.14.5 | v1.33 … v1.35 | 1.35 · 1.34 · 1.33 | 10.2, 10.0, 9.8, 9.6, 8.10, 8.8 | `rancher-v2-14-5.txt` |
| v2.14.6 | v1.33 … v1.35 | 1.35 · 1.34 · 1.33 | 10.2, 10.0, 9.8, 9.6, 8.10, 8.8 | `rancher-v2-14-6.txt` |
| v2.15.1 | v1.34 … v1.36 | 1.36 · 1.35 · 1.34 | 10.2, 10.0, 9.8, 9.6, 8.10 | `rancher-v2-15-1.txt` |
| v2.15.2 | v1.34 … v1.36 | 1.36 · 1.35 · 1.34 | 10.2, 10.0, 9.8, 9.6, 8.10 | `rancher-v2-15-2.txt` |

RKE2 hatlarının en son kararlı yaması (üretim anında, github.com/rancher/rke2): v1.30: v1.30.14+rke2r4 · v1.31: v1.31.14+rke2r2 · v1.32: v1.32.13+rke2r2 · v1.33: v1.33.13+rke2r2 · v1.34: v1.34.11+rke2r1 · v1.35: v1.35.8+rke2r1 · v1.36: v1.36.4+rke2r1

**Antrea → desteklenen Kubernetes** (kural: her Antrea sürümü çıktığı gün desteklenen son 4 K8s sürümü; Üretim: 2026-09-30):

| Antrea | En son yama | Çıkış | Kubernetes | Kaynak (`araclar/matris/`) |
|---|---|---|---|---|
| v2.0 | v2.0.1 | 2024-04-26 | 1.27 – 1.30 | `antrea-uyum.txt:9` |
| v2.1 | v2.1.2 | 2024-07-26 | 1.27 – 1.30 | `antrea-uyum.txt:10` |
| v2.2 | v2.2.2 | 2024-11-10 | 1.28 – 1.31 | `antrea-uyum.txt:11` |
| v2.3 | v2.3.2 | 2025-02-22 | 1.29 – 1.32 | `antrea-uyum.txt:12` |
| v2.4 | v2.4.5 | 2025-07-10 | 1.30 – 1.33 | `antrea-uyum.txt:13` |
| v2.5 | v2.5.3 | 2025-12-04 | 1.31 – 1.34 | `antrea-uyum.txt:14` |
| v2.6 | v2.6.3 | 2026-03-21 | 1.32 – 1.35 | `antrea-uyum.txt:15` |
| v2.7 | v2.7.0 | 2026-08-15 | 1.33 – 1.36 | `antrea-uyum.txt:16` |
<!-- VERI:BITIS -->
