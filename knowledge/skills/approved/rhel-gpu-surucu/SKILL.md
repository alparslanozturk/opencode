---
name: rhel-gpu-surucu
description: NVIDIA veri merkezi GPU sürücüsünü (H200, B300; L40S VM) RHEL 9/10 host'a kurarken, yükseltirken, sürüm kilitlerken ve doğrularken kullan — yol seçimi (yerel repo RPM / Satellite repo / RHEL 10 önderlenmiş kmod / DKMS / .run / CUDA runfile), açık çekirdek modülleri, Fabric Manager + NVLSM (NVSwitch), persistenced, çekirdek güncellemesi etkisi, /tmp noexec. "nvidia sürücü", "driver kur", "nvidia-open", "kmod-nvidia", "dkms", "cuda kur", "cuda toolkit", "runfile", ".run", "fabricmanager", "nvlsm", "h200", "b300", "h300", "sürücü sürümü", "versionlock" isteklerinde tetiklenir. Sürücüyü GPU Operator kuracaksa `rke2-gpu-kurulum`; kümedeki GPU denetimi `rke2-gpu`. Kurulum değişikliktir (yetki).
---

# NVIDIA sürücüsü — RHEL 9/10 host kurulumu

Kaynak: NVIDIA *Driver Installation Guide* (docs.nvidia.com/datacenter/tesla/driver-installation-guide, "Last updated Sep 23, 2026") ·
*CUDA Installation Guide for Linux* · *Fabric Manager User Guide* · R580 sürüm notları (580.196.07, 2026-10-21) — indirme 2026-10-24.
**(Alp)** kurum · **(genel)** doğrulanmadı → sahada `--help`/belgeyle doğrula. Sürüm uyumu: `surum-uyum` (`uyum.py --gpu-operator … --surucu … --gpu …`).

## 0. Önce ne var? (okuma — kuruluma başlamadan)

```bash
ssh root@<gpu-node> 'lspci -nn | grep -i nvidia | head -3; nvidia-smi -L 2>/dev/null | head -3; cat /proc/driver/nvidia/version 2>/dev/null; lsmod | grep -e ^nvidia -e nouveau; rpm -qa | grep -i -e nvidia -e cuda -e dkms | sort | head -30; dkms status 2>/dev/null; uname -r; grep ^VERSION_ID= /etc/os-release; subscription-manager release --show; systemctl is-active nvidia-persistenced nvidia-fabricmanager 2>/dev/null'
ssh root@<gpu-node> 'ls /usr/local/cuda* -d 2>/dev/null; ls /usr/bin/nvidia-uninstall 2>/dev/null; dnf repolist 2>/dev/null | grep -i -e cuda -e nvidia -e extensions -e epel'
```
- `rpm -qa` boş ama `nvidia-smi` çalışıyor → sürücü `.run` ile kurulmuş olabilir (`/usr/bin/nvidia-uninstall` varlığı ipucu, tahmin) ya da
  GPU Operator'ün sürücü konteyneri (`rke2-gpu` §2 "Sürücü kimde"). **İki yöntem birlikte olmaz** — karıştırma (NVIDIA: "Handle conflicting
  installation methods").
- Kart modeli `nvidia-smi -L`'den okunur. **"H300" adlı ürün NVIDIA belgelerinde yok** (2026-10-24) — B300 kastedilmiş olabilir; sor.

## 1. Yol seçimi

| Yol | Ne zaman | Not (kaynak) |
|---|---|---|
| **A. Yerel repo RPM** `nvidia-driver-local-repo-<distro>-<sürüm>-1.0-1.x86_64.rpm` | Kapalı ağ, **belli bir sürüm** indirilip kurulacaksa (Alp: "download edip belli sürüm") | Paket bir repo anlık görüntüsünü `/var/`'a koyar, kurmaz; sonra `dnf install` (NVIDIA). Kurulumdan sonra `dnf remove nvidia-driver-local-repo\*` önerilir |
| **B. Satellite'ta senkron CUDA/NVIDIA repo** | Satellite NVIDIA repolarını yansıtıyorsa | Ağ reposu yerine Satellite içerik görünümü — repo adını `dnf repolist`'ten oku `[SAHA]` |
| **C. RHEL 10 önderlenmiş kmod** (`kmod-nvidia-open`, RHEL *extensions* reposu) | RHEL 10, Secure Boot, EPEL yok | Red Hat imzalı modül; kernel-devel/DKMS/GCC/EPEL gerekmez; DNF eklentisi önderlenmiş modülü olmayan çekirdeğe yükseltmeyi **süzer** (`dnf nvidia-plugin` raporu) — NVIDIA |
| **D. DKMS** (`kmod-nvidia-open-dkms`) | RHEL 9 (önderlenmiş bölüm yalnız RHEL 10 için yazılı) | `kernel-devel-matched kernel-headers` + **EPEL** (dkms) + CRB gerekir; her çekirdekte yeniden derler — NVIDIA |
| **E. `.run` (NVIDIA-Linux-x86_64-<sürüm>.run)** | Paket yöneticisi dışı; tek seferlik | NVIDIA "mümkünse dağıtım paketleri önerilir"; dağıtım bağımsız paket paket yöneticisiyle güncellenmez. Bayraklar: `sh <dosya>.run --help` / `--advanced-options` ile oku (genel) |
| tarball (`compute/nvidia-driver/redist/`) | — | **Kurulum aracı değil** ("not installers") — NVIDIA |

- **Yalnız açık çekirdek modülleri var:** "proprietary kernel modules have been removed" (NVIDIA *Recent Updates*) → paket `nvidia-open` /
  `kmod-nvidia-open*`. GPU Operator'de `driver.kernelModuleType` (`auto`/`open`).
- **Önderlenmiş ile DKMS karıştırılmaz** (sürücü 570+ — NVIDIA *Optional Components*; GDS `nvidia-fs` yalnız DKMS).
- Yalnız hesaplama (masaüstü bileşensiz): `nvidia-driver-cuda` + çekirdek modülü (NVIDIA "Compute-only System") — sunucu için doğru seçim (genel).

## 2. Kurulum adımları (değişiklik — kurulum yetkisi + `sunucular:`)

Hazırlık (NVIDIA *Pre-installation*): desteklenen dağıtım (`hostnamectl`) · çalışan çekirdeğin `kernel-devel`'i (DKMS'te) · sürücü
sürümünü seç (GPU Operator matrisi / sürüm notu) · çakışan kurulumu temizle.

**RHEL 9** (DNF modül akışı; DKMS):
```
dnf install kernel-devel-matched kernel-headers            # DKMS için
dnf module enable nvidia-driver:580-open                   # dal sabitleme (akış adı: 580-open / open-dkms)
dnf install nvidia-driver-cuda kmod-nvidia-open-dkms       # yalnız hesaplama
```
**RHEL 10** (modül yok; dal kilidi versionlock ile — `python3-dnf-plugin-versionlock`):
```
dnf versionlock '*nvidia*580*'                             # dal sabitleme
dnf install kmod-nvidia-open nvidia-driver nvidia-driver-cuda   # önderlenmiş (extensions reposu açık olmalı)
```
Sonra **reboot** → §4 doğrulama. Yerel repo yolunda önce `dnf install ./nvidia-driver-local-repo-…rpm`.

**NVSwitch'li sistemler (HGX/DGX 8-GPU):**
- **H200 HGX** (3. nesil NVSwitch): `nvidia-fabricmanager` şart; **sürücü < 620'de FM sürümü sürücüyle aynı olmalı** (FM guide). RHEL 9:
  `dnf module install nvidia-driver:580-open/fm` (≤615 dalları); RHEL 10: `dnf install nvidia-fabricmanager libnvidia-nscq libnvsdm nvidia-imex`.
- **B300 HGX** (4. nesil NVSwitch): FM + **NVLSM** (NVLink Subnet Manager, FM servisi birlikte başlatır) + **OFED/MOFED (DOCA)** +
  `libibumad` + `infiniband-diags`; çekirdek ≥ 5.17 ya da NVIDIA backport'ları (FM guide). Bilinen sorun: RHEL 10 çekirdek
  `6.12.0-55.29.1.el10_0`'da doca-ofed `ib_umad.ko` içermiyor → FM açılmıyor (R580 sürüm notu). R580 notunda HGX B300 için listelenen
  RHEL: 8.10, 9.8, 10.2.
- **`nvidia-fabricmanager`'ı durdurmak fabric durumunu kaybettirir; geri gelmek için NVLink'teki tüm GPU'lar reset ister** (FM guide) —
  canlı node'da FM restart/stop **önerme**, gerekirse bakım penceresi + drain.

**CUDA toolkit** (host'ta gerekiyorsa — konteyner iş yükü CUDA'yı imajdan alır, host'a toolkit gerekmeyebilir — genel):
- CUDA 13.4'ten itibaren toolkit ile sürücü **ayrı** sürümlenir; `cuda-toolkit` meta paketi sürücü kurmaz (CUDA guide). Sabit sürüm:
  `cuda-toolkit-X-Y` (yan yana kurulum desteklenir).
- Runfile: `sh cuda_<sürüm>_linux.run --silent --toolkit --toolkitpath=/usr/local/cuda-X.Y --tmpdir=<noexec-olmayan-dizin>` —
  **kurumda `/tmp` noexec (Alp)** → `--tmpdir` şart ("/tmp … mounted with noexec" — CUDA guide). Kaldırma: `/usr/local/cuda-X.Y/bin/cuda-uninstaller`.
- Aynı nedenle sürücü `.run`'ında da geçici dizin bayrağını `--help`'ten bul (genel).

## 3. Çekirdek güncellemesi ve kilit (rhel-guncelleme ile birlikte)

- DKMS: yeni çekirdek için modül yeniden derlenir → o çekirdeğin `kernel-devel`'i repoda (Satellite CV) olmalı (NVIDIA). Yoksa reboot
  sonrası `nvidia` modülü yüklenmez → GPU iş yükü düşer. Güncelleme öncesi: `dnf list --available kernel-devel` ↔ hedef çekirdek.
- Önderlenmiş (RHEL 10): uygun kmod çıkmamış çekirdek filtrelenir; `dnf nvidia-plugin` raporu okuma.
- Dal değiştirme (RHEL 9): `dnf module reset nvidia-driver` → `enable nvidia-driver:<akış>` → `dnf update --allowerasing` (NVIDIA).
  RHEL 10: versionlock listesini güncelle → `dnf update`.
- GPU node'u Satellite'ta ayrı ara sürüme kilitli olabilir (saha: h200w1 RHEL 9.4) — `surum-uyum` RHEL satırı.

## 4. Doğrulama (okuma)

```bash
ssh root@<gpu-node> 'cat /proc/driver/nvidia/version; nvidia-smi --query-gpu=index,name,driver_version,persistence_mode --format=csv; systemctl is-active nvidia-persistenced nvidia-fabricmanager; nvidia-smi -q | grep -i -A2 fabric | head -12; lsmod | grep -c nouveau; find /usr/ -iname libnvidia-ml.so 2>/dev/null | head -2'
```
İyi: sürüm beklenen · `nvidia-persistenced` active (paketler systemd preset ile açar — NVIDIA *Post-installation*) · NVSwitch'li sistemde
Fabric `State: Completed`, `Status: Success` (kayıt sürerken `In Progress` — FM guide) · nouveau 0 · `libnvidia-ml.so` var (RKE2 belgesinin
"pre-installed driver" üç kontrolü: `lsmod | grep nvidia`, `/proc/driver/nvidia/version`, `libnvidia-ml.so`). Küme tarafı → `rke2-gpu-kurulum` §5.

## Yapmayacakların

- Aynı node'da RPM + `.run` + Operator sürücüsünü birlikte kurma; önderlenmiş + DKMS karıştırma.
- Canlı GPU node'unda FM/persistenced durdurma, `rmmod nvidia`, reboot — iş yükü (kurum Qwen dahil) düşer; drain + yetki.
- Sürücü/CUDA/FM sürümünü ezberden yazma: `nvidia-smi` başlığı, `rpm -q`, sürüm notu.
