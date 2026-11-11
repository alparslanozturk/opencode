---
name: platform-bilgi
description: Kurumun kullandığı ya da değerlendirdiği altyapı platformları hakkında teknoloji bilgisi ve edinim (satın alma/geçiş) sorularında kullan — VMware Cloud Foundation (VCF 9.x, vSphere, VKS), Google Distributed Cloud (eski adı Anthos / GKE on-prem), Azure Local (eski adı Azure Stack HCI) + Azure Arc + AKS Arc; RHEL'in bu platformlardaki yeri, harici SAN, bağlantısız çalışma, sorulacak edinim soruları. "vcf", "vmware cloud foundation", "vsphere", "vks", "tanzu", "azure local", "azure stack hci", "azure arc", "aks arc", "on-prem azure", "google distributed cloud", "gdc", "anthos sürüm", "teknoloji edinimi", "platform karşılaştır", "hangi platform" isteklerinde tetiklenir. Anthos kümesine erişim/teşhis `anthos-erisim`; RKE2 sürüm uyumu `surum-uyum`.
---

# Platform bilgisi — VCF · Google Distributed Cloud (Anthos) · Azure Local

Bu beceri **bilgi kartıdır**, komut çalıştırmaz. Her satırın kaynağı yanında; erişim tarihi **2026-11-04** (Doktor araştırması).
Ürünler hızlı değişir: kart tarihinden eskiyse "bu bilgi <tarih> itibarıyla" de, yeni sürüm iddiası kurma. Kaynak etiketi:
**(Alp)** kurum bilgisi · **(üretici)** üretici belgesi/blogu · **(ikincil)** üçüncü taraf, doğrulanmadı.

## 0. Kurum durumu (Alp, 2026-11-04)

- Temel: **Red Hat** (RHEL 7–10, Satellite ile kurulum/baseline). Sanallaştırma ESX/vCenter.
- **VCF** (VMware Cloud Foundation) yakında gündemde olabilir — karar/sürüm `[SAHA]`.
- **Google Anthos** kullanılıyor (erişim zinciri `anthos-erisim`).
- **Azure'un on-prem çözümleri** ciddi biçimde değerlendiriliyor — Microsoft lisansları alınmış; **depolama (storage) kısmı hariç**
  kullanılması düşünülüyor. Hangi ürün (Azure Local, Arc, AKS Arc) ve "storage hariç"in tam anlamı `[SAHA]` — §4 soruları.

## Önce sor (tek mesaj, numaralı — oturumda/kurumsal bilgide cevabı varsa sorma)

1. **Hangi platform:** VCF, Google Distributed Cloud (Anthos), Azure Local — ya da karşılaştırma mı.
2. **Soru türü:** teknoloji bilgisi mi, edinim/geçiş değerlendirmesi mi — değerlendirmeyse §4'teki soru listesi kullanılır.
3. **Bağlam:** hangi iş yükü (RHEL VM, Kubernetes, GPU); bağlantısız çalışma şartı var mı.

Uydurma: kurumun kararı, sürümü, lisans durumu `[SAHA]` — kullanıcı söylemediyse "bilinmiyor". Kart tarihi eskiyse söyle.

## 1. VMware Cloud Foundation (VCF 9.x)

- Bileşenler (üretici, VCF 9.1 belgesi): vSphere (hesaplama), vSAN (depolama), NSX (ağ), **vSphere Kubernetes Service (VKS)**,
  VCF Operations, VCF Automation, Private AI hizmetleri — tek platform.
- Güncel sürüm: **VCF 9.1.1** (üretici: "Oct 14, 2026 VMware Cloud Foundation 9.1.1" özellik karşılaştırma belgesi).
- **RHEL konuk:** VCF 9.0 desteklenen konuklar RHEL 10.x / 9.x / 8.x / 7.x; RHEL 6 ve öncesi eski/kullanımdan kalkan (üretici blogu,
  2025-06-19). 9.1 için güncel matris Broadcom Compatibility Guide'da — `[doğrula]`.
- **RHEL Kubernetes node'u:** VKS 3.6 ile RHEL 9 node imajı "Build Your Own Image" — VCF CLI'daki Image Baker (`vcf kr bake`) UBI 9
  tabanından OVA üretir; Red Hat abonelik bilgisi müşteriden; karışık OS küme (ör. Ubuntu/Photon control plane + RHEL worker)
  desteklenir; yükseltmede yeni RHEL OVA müşteri sağlar (üretici blogu, 2026-02-13). Hangi RHEL 9 ara sürümleri: belirtilmemiş.
- Kurum için anlamı (tahmin): bugünkü ESX + RKE2 düzeninin yanında VKS ikinci bir Kubernetes yolu olur; RKE2 ↔ VKS seçimi edinim kararı.

## 2. Google Distributed Cloud (software only) — eski adıyla Anthos / GKE on-prem

- Ürün adı artık **Google Distributed Cloud (software only)**: *for VMware* ve *for bare metal* (üretici belgeleri). "Anthos" adı
  güncel belgelerde geçmiyor (araştırma sonucu) — kurumda hâlâ "Anthos" denir, ikisi aynı ürün ailesi.
- **Bare metal OS desteği** (üretici, "Select your operating system"): 1.34 / 1.35 / 1.36 → **RHEL 9.6, 9.4, 8.10**; Ubuntu 24.04 /
  22.04 (HWE çekirdeği). RHEL 9.6 için en az 1.33.200.
  - "doesn't support **odd-numbered RHEL minor releases**" (kısa ömür, EUS yok) · Red Hat'in Full/Maintenance desteği dışındaki RHEL
    desteklenmez · **1.35'ten itibaren cgroups v2 zorunlu** (cgroups v1 görülürse ön kontrol kurulum/yükseltmeyi durdurur) · 1.36'da
    RHEL 8'de Python ≥ 3.9 · dağıtımın **orijinal çekirdeği** kullanılmalı.
  - Kurum için anlamı: GDC bare metal node'u için RHEL **9.5 / 9.7 gibi tek sayılı ara sürüm seçilmez**; `rhel-guncelleme` ile ara
    sürüm kilidi buna göre (Satellite içerik görünümü).
- Güncel sürümler (üretici sürüm notları): 1.35.x ve 1.34.x yamaları 2026-10-22'ye kadar; 1.36 hattı var. *for VMware* OS listesi
  ayrı sayfada — `[doğrula]`.

## 3. Azure Local (eski adı Azure Stack HCI) + Azure Arc

- Azure Local, Azure Arc ile yönetilen on-prem altyapı; sürümler **YYMM** adlı (2510, 2604, 2607, 2610 …), aylık (üretici, "What's
  new", 2026-11-02 güncel; varsayılan sürüm **2610**).
- **Depolama — kurumun "storage hariç" isteğiyle ilgili:**
  - 2604: **SAN storage GA** — Storage Spaces Direct yanında SAN bağlanabilir; ayrıca **disaggregated** dağıtım: yalnız SAN ile
    (S2D olmadan) Azure Local (üretici).
  - 2607: **iSCSI SAN** hem hyperconverged hem disaggregated için GA; desteklenmeyen üreticinin SAN'ı ile disaggregated doğrulama
    başarısız olur — **SAN üreticisi Microsoft'un destek listesinde olmalı** (üretici).
  - 2610: rack-aware küme + SAN (önizleme), SAN için disk witness, düğüm başına iSCSI ayarı (üretici).
- **Bağlantısız çalışma (disconnected operations):** 2508'de eklendi — internet bağlantısı kısıtlı/yok ortamda VM ve konteyner
  yönetimi (üretici). AKS Arc bağlantısız modda önizleme olarak listeleniyor; bağlı modda desteklenen her özellik bağlantısızda
  otomatik desteklenmez (üretici + ikincil) — **air-gap kurum için kritik**, `[doğrula]` güncel sayfadan.
- **AKS enabled by Azure Arc:** Azure Local üzerinde Kubernetes; Azure Local yükseltmesinden önce AKS kümelerinin desteklenen
  Kubernetes sürümünde olması gerekir (üretici, her sürüm notunda). GPU: VM'lerde DDA/GPU-P GA (2604); RTX PRO 6000 Blackwell (2603)
  (üretici). H200/B300 desteği listede görülmedi — `[doğrula]`.
- **Azure Migrate:** VMware VM'lerini Azure Local'e taşıma GA (2510); SAN kullanan Azure Local'e taşıma (2605) (üretici).
- RHEL ilişkisi: RHEL sunucular Azure Arc-enabled servers ile Azure'dan yönetilebilir (genel — destek matrisi `[doğrula]`);
  Satellite'ın yerini almaz, yanında ikinci bir yönetim düzlemi olur (tahmin).

## 4. Edinim / değerlendirme soruları (kullanıcıya numaralı sor — cevap yoksa kart yetmez)

1. Hangi iş yükü? (VM, Kubernetes, GPU/AI, VDI) — her platformda karşılığı farklı.
2. **Air-gap / internet:** platform buluta bağlanmadan çalışmalı mı? (Azure Local bağlantısız mod kapsamı, GDC'nin Google Cloud'a
   bağlantı ihtiyacı — `[doğrula]`.)
3. **Depolama:** mevcut SAN'ın üreticisi/modeli; Azure Local destek listesinde mi (2607 doğrulama kuralı)?
4. **Kubernetes standardı:** RKE2 + Rancher kalacak mı; VKS / AKS Arc / GDC hangisi, kaç küme yönetim aracı?
5. **OS:** node'lar RHEL mi (lisans + Satellite içerik görünümü), RHEL ara sürüm kısıtları (GDC: çift sayılı ara sürüm).
6. **Regülasyon:** BDDK/KVKK — yönetim düzlemi/telemetri yurt dışına gidiyor mu (`bankacilik-uyum`).
7. **Lisans ve destek sözleşmesi:** hangi lisans alındı (Alp: Microsoft lisansı var), destek süresi, yükseltme sıklığı (Azure Local aylık).

## Yapmayacakların

- Sürüm, fiyat, destek tarihi uydurma; burada olmayanı "bilgi kartında yok, üretici sayfasından doğrulanmalı" de.
- İkincil kaynağı (blog) üretici bilgisi gibi sunma. Fiyat/lisans bedeli yazma (kart doğrulanmış fiyat içermiyor).
- Edinim kararını verme — karşılaştırma + sorular + kaynak; karar kurumun.
- Bu kart Doktor'un aylık eğilim araştırmasında güncellenir; tarihi eskiyse söyle.
