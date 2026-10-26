---
name: surum-uyum
description: Sürüm uyumu, destek sonu (EOL / bakım sonu) ve en son yama sorusunda kullan — deterministik `uyum.py` (çevrimdışı veri, her satır kaynaklı): Rancher ↔ RKE2 ↔ RHEL ↔ Antrea (upstream garanti + VMware VCN/VKr) ↔ NVIDIA GPU Operator matrisi, SUSE/K8s/RHEL ömür tarihleri, en son yama, yükseltme yolu hesabı. "uyumlu mu", "matris", "destekleniyor mu", "eol", "end of life", "destek sonu", "destek bitiyor", "bakım sonu", "en son yama", "patch", "sürüm geride mi", "kaç gün kaldı", "supported mı" isteklerinde tetiklenir. Yükseltme planı için `rke2-yukseltme`.
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
python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py kontrol --rke2 v1.33.13+rke2r1 --gpu-operator v25.3.4 --surucu 580.82.07 --rhel 9.4,9.6   # GPU kümesi (NVIDIA matrisi)
python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py kontrol --rke2 v1.33.13+rke2r1 --gpu-operator v25.3.4 --gpu H200,B300,L40S --runai 2.24   # GPU modeli + Run:ai
python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py veri                                                              # veri hangi tarihte indirildi
```

Çıktıyı **olduğu gibi** aktar (✅/⚠️/❌ + `[kaynak: …]`); satır ekleme, tarihi yeniden hesaplama. Çıkış kodu 1 = en az bir ❌.
Kaynağı olmayan uyum cümlesi yazma — §"Kanıt zorunluluğu".
Sürümleri toplama komutları: `rke2-yukseltme` §1 (Run:ai sürümü `rke2-runai` §1). Kapsam: Rancher/RKE2/Antrea/RHEL + NVIDIA GPU Operator
(25.3, 25.10, 26.3, 26.7 patch'leri; sürücü D/R listesi; GPU modeli H200/B300/L40S) + **NVIDIA Run:ai** 2.21–2.26 (K8s ve GPU Operator aralığı;
RKE2 "upstream K8s'e göre"). GPU Operator ve Run:ai NVIDIA'nın ticari matrisi: GPU Operator liste dışı = ⚠️ (doğrulanmamış), Run:ai liste dışı = ❌
"destek kapsamı dışı — çalışmadığı anlamına gelmez" (belge: "must align"). Anthos ve VMware VCF verisi gelince aynı dosyaya bölüm olarak eklenir.

## Kanıt zorunluluğu (Alp, 2026-10-21 — "matrisi kanıtlarıyla istiyorum; kanıt yoksa yalnız 'olabilir' desin")

Saha G77: "Antrea v2.3.0 + 1.33 ❌ KURAL DIŞI" yazıldı ve test kümesindeki node donmaları Antrea'ya bağlandı; kaynak kurumun
"son 4 K8s" kestirmesiydi, ne Antrea ne VMware böyle bir yasak yazmıyor. Kural:

1. **Her uyum satırının kaynağı yazılır:** belge adı + bölüm/URL (veri dosyasındaki `# Kaynak:` satırı) ya da komut çıktısı.
   Kaynağı olmayan satır **"❓ kaynak yok — uyumlu/uyumsuz olabilir"** diye yazılır.
2. **Kaynak katmanları — hepsine bak, ayrı satır yaz** (biri diğerinin yerine geçmez):
   - **Ürün üreticisinin destek matrisi** (ticari ürün): SUSE Rancher matrisi, Broadcom *VMware Container Networking with
     Antrea*, NVIDIA GPU Operator *Platform Support*, Red Hat … — destek sözleşmesinin konusu budur.
   - **Üreticinin kendi paketlediği ikili** (ör. Broadcom VKr 1.33.x içinde Antrea 2.3.x): üretici bu ikiliyi çalıştırıyor =
     çalıştığına dair kanıt; ama başka ürünün destek matrisi yerine geçmez.
   - **Upstream proje politikası** (ör. Antrea `docs/versioning.md`): çoğu zaman **asgari garanti**dir ("at least"), yasak listesi değil.
   - **Upstream kayıtları** (CHANGELOG, issue): belirli ikiliye özgü bilinen hata — yalnız bu ❌ yapabilir.
   - **Saha gözlemi** (bizim kümede komut çıktısı).
3. **İşaretin anlamı kaynağa göre:**
   - ✅ kaynakta **açıkça** listede / garanti aralığında.
   - ⚠️ kaynakta listede değil, uyumsuzluk kaydı yok → "**garanti/destek kapsamı dışı — uyumsuz olabilir**" (kanıt değil).
   - ❌ kaynakta açıkça uyumsuz / kanıtlı hata kaydı / destek süresi bitmiş (EOL) / üreticinin destek listesi (SUSE gibi
     "desteklenen sürümler" yayımlayan) dışında → yanına "destek kapsamı dışı — çalışmadığı anlamına gelmez" notu.
4. **Hangi ürün kullanılıyor, önce oku:** aynı yazılımın upstream ve ticari sürümü farklı matrise tabidir. Antrea için imaj:
   `kubectl -n kube-system get ds -l app=antrea -o jsonpath='{range .items[*].spec.template.spec.containers[*]}{.image}{"\n"}{end}' | sort -u`
   → `antrea/…` ya da `ghcr.io/antrea-io/…` = upstream · `projects.packages.broadcom.com/antreainterworking/…` (`_vmware.N`) = VMware
   ürünü (VCN matrisi geçerli). Okunmadıysa iki matrisi de yaz, hangisinin geçerli olduğunu `[SAHA]` bırak.
5. **Uyum durumu olay sebebi değildir:** "matris dışı" bir node donmasının, pod hatasının **kanıtı olamaz**. Olay sebebi yalnız olayın
   kendi kanıtıyla (log, çekirdek yığını, zaman çizelgesi) yazılır (`rke2-denetim` §4, `rke2-edr` §3).
   Destek sonu (EOL) da öyle: EOL'ü geçmiş hatta (kurumda 1.33 — `rke2-yukseltme` §6) iş normal yapılır; EOL satırı bilgi olarak bir kez
   söylenir, işi reddetme ya da her cevaba yükseltme önerisi ekleme sebebi değildir.

## Antrea — kurum durumu ve kanıtlar (2026-10-21)

Test kümesi: RKE2 v1.33.13+rke2r1 · Antrea **v2.3.0** · Rancher v2.14.3 · RHEL 9.2–9.8 (saha G48, G66). Kanıt satırları:

| Kaynak | Ne diyor | 2.3.0 + K8s 1.33 için |
|---|---|---|
| Antrea `docs/versioning.md` "Supported K8s versions" | her minor, çıktığı gün bakımdaki K8s'leri **en azından** destekler | v2.3.0 çıkışı 2025-02-22 → garanti 1.29–1.32; 1.33 (çıkış 2025-04-23) **garanti dışı → olabilir** ⚠️ |
| Broadcom *VCN Antrea 1.11.0* (= upstream 2.3.0) sürüm notu, "Compatibility Testing Matrix" (2025-04-16) | K8s 1.27–1.32 · Rancher **2.7** (Ubuntu 22.04) · RHEL 8+ | 1.33 ve Rancher 2.14 **matriste yok** ⚠️ — yalnız VMware imajı kullanılıyorsa destek beyanı |
| Broadcom *VKr* sürüm notları (bileşen tabloları) | VKr v1.33.1 → Antrea 2.3.0 · v1.33.3 → 2.3.1 · v1.33.6/v1.33.13 → 2.3.2 | üretici **aynı ikiliyi kendi ürününde** paketliyor ✅ (çalıştığına kanıt) |
| RKE2 v1.33.13+rke2r1 sürüm notu "Available CNIs" | Canal, Calico, Cilium, Multus | Antrea RKE2'nin CNI'ı değil → SUSE desteği Antrea'yı kapsamaz ℹ️ |
| Antrea CHANGELOG-2.5 (#7291) | Multi-cluster ServiceCIDR keşfi 1.33+'da hatalı, v2.5'te düzeltildi | yalnız Multi-cluster kullanılıyorsa ⚠️ |
| Antrea issue #7332 | 1.33+'da "v1 Endpoints is deprecated" uyarı logu | log gürültüsü ℹ️, işlev hatası değil |

**Sonuç (kaynaklı):** Antrea 2.3.0 + K8s 1.33 için **kanıtlı uyumsuzluk yok**; upstream garantisi ve VMware VCN matrisi dışında
(⚠️ "uyumsuz olabilir"), üretici VKr'de aynı ikiliyi paketliyor. Bu durum test kümesindeki node donmalarının sebebi olarak
**yazılamaz**. Yükseltme önerisi (ör. 2.4+/2.5+) "garanti/matris kapsamına girmek" gerekçesiyle yapılır, "hata düzeltmek" diye değil.

## Veriyi güncelleme (internetli makinede, Doktor)

`veri/surumler.txt` bölümleri ve kaynakları: Rancher matrisi `suse.com/suse-rancher/support-matrix/all-supported-versions/rancher-vX-Y-Z/`
· Rancher/RKE2 ömür `suse.com/lifecycle` · K8s/Rancher son yama, RHEL ana sürüm `endoflife.date/api/{kubernetes,rancher,rhel}.json`
· RKE2 son yama `github.com/rancher/rke2/releases` · **Antrea garanti penceresi `python3 script/antrea-veri.py`** (GitHub releases +
endoflife.date, resmi `versioning.md` kuralı) · Antrea VMware matrisi/VKr ve `[antrea-kayit]` elle (Broadcom TechDocs, Antrea
CHANGELOG/issue — her satıra kaynak). Güncelledikten sonra `uyum.py kontrol`'ü
eski çıktıyla karşılaştır; bölüm başlığındaki indirme tarihini değiştir. Veri 3 aydan eskiyse çıktıda bunu söyle.

## Elle uyumluluk kontrolü (betik yoksa — T33, Alp: "uyumlulukları kontrol edebilsin matriksleri")

Girdi: kullanıcı beyanı **ya da** kümeden okuma (`rke2-yukseltme` §1; Antrea için
`kubectl -n kube-system get ds antrea-agent -o jsonpath='{.spec.template.spec.containers[0].image}'`).
Veri: aşağıdaki **Çevrimdışı veri** bölümü (her zaman elinde; internet gerekmez).

1. **Mevcut durumu denetle** — her bileşen için tek satır:
   - Rancher ↔ upstream (local) RKE2: upstream sürümü Rancher satırındaki aralıkta mı?
   - Rancher ↔ downstream RKE2: kümenin hattı (1.33 gibi) Rancher satırının downstream hatlarında mı?
   - Rancher ↔ RHEL: sunucunun RHEL sürümü listede mi?
   - Antrea ↔ K8s: **dört kaynak ayrı satır** — upstream garanti (aşağıdaki tablo), VMware VCN matrisi, VMware VKr ikilisi,
     bilinen kayıtlar (§"Antrea — kurum durumu ve kanıtlar"). Kullanılan imajı oku (upstream mı VMware mı).
2. **Kurulum/yükseltme ÖNCESİ** ("X'e geçersem uyumlu mu?"): hedef kombinasyonu aynı dört satırla kontrol et;
   sırayı söyle (Antrea → RKE2 → Rancher; her adımda ara durum da uyumlu olmalı).
3. **Sonuç biçimi** — her satır: işaret (§"Kanıt zorunluluğu" 3) + **en az / önerilen sürüm** + **kanıt** (belge + bölüm/URL ya
   da tablo satırı, ör. `rancher-v2-14-3.txt`, `versioning.md "Supported K8s versions"`, `VCN 1.11.0 sürüm notu`).
4. Sürüm tabloda **yoksa**: `❓ HESAPLANAMADI (veri yok)` yaz — **tahmin etme, "varsayım" kullanma**.
   Kullanıcıdan güncel veriyi (üreticinin matris sayfası) iste. rke2-ansible'daki `antrea_surum.py` "son 4 K8s" kestirmesidir —
   **kullanma** (G77).

Örnek (kurum, 2026-10-21): Rancher v2.14.3 · upstream v1.33.13 → ✅ (v1.33 … v1.35, `rancher-v2-14-3.txt`) · downstream 1.33 → ✅ ·
Antrea v2.3.0 + 1.33 → ⚠️ garanti/VCN matrisi dışı, VKr'de paketli, kanıtlı uyumsuzluk yok (yukarıdaki tablo).

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
<!-- VERI:BITIS -->


<!-- VERI-ANTREA:BASLA — script/antrea-veri.py üretir, ELLE DÜZENLEME -->
**Antrea → GARANTİLİ Kubernetes** (üretim 2026-10-21). Kural: Antrea `docs/versioning.md` "Supported K8s versions" —
her minor, **çıktığı gün bakımı süren** K8s minor'larını *en azından* destekler ("guarantee … at least"; "in practice it
also supports" daha eskileri). Çıkış günü: GitHub release `x.y.0`; K8s bakım tarihleri: endoflife.date. Pencere dışı =
**garanti yok → "uyumsuz olabilir"**, "desteklenmiyor" değil.

| Antrea | En son yama | x.y.0 çıkışı | Garantili K8s | Bakımdaki K8s sayısı |
|---|---|---|---|---|
| v2.0 | v2.0.1 | 2024-04-26 | 1.27 – 1.30 | 4 |
| v2.1 | v2.1.2 | 2024-07-26 | 1.28 – 1.30 | 3 |
| v2.2 | v2.2.2 | 2024-11-10 | 1.29 – 1.31 | 3 |
| v2.3 | v2.3.2 | 2025-02-22 | 1.29 – 1.32 | 4 |
| v2.4 | v2.4.5 | 2025-07-10 | 1.30 – 1.33 | 4 |
| v2.5 | v2.5.3 | 2025-12-04 | 1.32 – 1.34 | 3 |
| v2.6 | v2.6.3 | 2026-03-21 | 1.33 – 1.35 | 3 |
| v2.7 | v2.7.0 | 2026-08-15 | 1.34 – 1.36 | 3 |
<!-- VERI-ANTREA:BITIS -->
