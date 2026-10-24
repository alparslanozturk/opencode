---
name: rke2-gpu-kurulum
description: RKE2 kümesine NVIDIA GPU Operator kurarken/yükseltirken ve containerd ayarını (config.toml / config-v3.toml.tmpl, nvidia runtime, CDI, NRI) yaparken kullan — HelmChart manifesti sürüme göre (v25.3 / v25.10 / v26.3), CONTAINERD_SOCKET, sürücü host'ta mı operator'de mi (driver.enabled, toolkit.enabled), kapalı ağ (özel registry, repoConfig), containerd yeniden yüklemesinin RKE2'yi yeniden başlatması, doğrulama pod'u. "gpu operator kur", "gpu operator yükselt", "helmchart gpu", "config.toml", "config-v3.toml.tmpl", "containerd nvidia", "nvidia runtime", "runtimeclass", "cdi", "nri", "device plugin", "air-gap gpu" isteklerinde tetiklenir. Host sürücüsü `rhel-gpu-surucu`; mevcut kümeyi denetleme `rke2-gpu`; Run:ai `rke2-runai`. Kurulum değişikliktir (yetki).
---

# GPU Operator + containerd — RKE2

Kaynak: RKE2 *GPU Operators* (docs.rke2.io/add-ons/gpu_operators) ve *Advanced → Configuring containerd* (docs.rke2.io/advanced) ·
NVIDIA GPU Operator *Getting Started*, *Platform Support*, *Air-Gapped* (latest = 26.7) · Run:ai *Cluster System Requirements* — indirme
2026-10-24. **(Alp)** kurum · **(genel)** doğrulanmadı.

## 0. Önce oku (okuma)

```bash
kubectl get clusterpolicies.nvidia.com -o jsonpath='{.items[*].status.state}'; echo
kubectl get helmcharts.helm.cattle.io -A | grep -i gpu; helm list -A 2>/dev/null | grep -i gpu
kubectl -n gpu-operator get pods -o wide 2>/dev/null | head -20
ssh root@<gpu-node> 'grep -n -i nvidia /var/lib/rancher/rke2/agent/etc/containerd/config.toml | head; ls /var/lib/rancher/rke2/agent/etc/containerd/; ls /usr/local/nvidia/toolkit/nvidia-container-runtime 2>/dev/null; cat /etc/default/rke2-agent /etc/sysconfig/rke2-agent 2>/dev/null | grep -i path'
```
Sürüm uyumu (operator ↔ RKE2 ↔ RHEL ↔ sürücü ↔ GPU modeli ↔ Run:ai) **betikle**:
`python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py kontrol --rke2 <v> --gpu-operator <v> --surucu <v> --gpu H200,B300 --runai <v> --rhel <liste>`.
Bilinen sınırlar (veri): GPU Operator **25.3 listesinde HGX B300 yok** (25.10+'da var) · 26.7 RKE2 1.33–1.37, RHEL 9.2/9.4/9.6/9.7/9.8 ve 10.0–10.2 ·
Run:ai 2.24 ↔ operator 25.3–25.10, 2.25/2.26 ↔ 25.10–26.3. Operator yaşam döngüsü: 26.7 destekli, 26.3 deprecated, 25.10 ve öncesi
destek sonu (NVIDIA *Platform Support*, 2026-10-24); yükseltme yalnız aynı major içinde ya da **bir sonraki** major'a.

## 1. Sürücü nerede olacak?

| Seçenek | Değer | Ne zaman |
|---|---|---|
| Host'a kurulu sürücü (`rhel-gpu-surucu`) | `driver.enabled=false` | Sürücü RPM ile host'ta; sürüm kurum kontrolünde. `false` verilmezse sürücü pod'u önceden kurulu sürücüyü görüp kendini kapatır (NVIDIA) |
| Host'ta sürücü + container toolkit | `driver.enabled=false`, `toolkit.enabled=false` | Varsayılan runtime `nvidia` olmalı (NVIDIA; DGX OS örneği) |
| Operator sürücü konteyneri | `driver.enabled=true` (varsayılan) | Kapalı ağda sürücü konteyneri OS paketi indirir (kernel-headers/devel/core, gcc) → yerel paket deposu + `driver.repoConfig.configMapName` (NVIDIA *Air-Gapped*); RHEL 9 konteynerleri yalnız x86 |

Kurum hedefi `[SAHA]` — mevcut durumu §0 + `rke2-gpu` §2 "Sürücü kimde" satırından oku, karar Alp'in.

## 2. HelmChart manifesti (RKE2 belgesi — `kube-system`'e uygulanır, RKE2'nin helm denetleyicisi kurar)

Ortak: `toolkit.env CONTAINERD_SOCKET=/run/k3s/containerd/containerd.sock` (RKE2'nin containerd soketi; NVIDIA varsayılanı
`/run/containerd/containerd.sock`). Sürüme göre fark:

| Operator | Fark (RKE2 belgesi) |
|---|---|
| v25.3.x | ek `ACCEPT_NVIDIA_VISIBLE_DEVICES_ENVVAR_WHEN_UNPRIVILEGED=false`, `ACCEPT_NVIDIA_VISIBLE_DEVICES_AS_VOLUME_MOUNTS=true`, device plugin `DEVICE_LIST_STRATEGY=volume-mounts` (GPU yalıtımı); pod'larda `runtimeClassName: nvidia` |
| v25.10.x | **CDI** — ek env ve `runtimeClassName` gerekmez; **containerd 2.0** ister |
| v26.3.x | Sürücü/kütüphaneyi işletim sistemi üreticisinin sürücü imajıyla da yönetebilir (`driver.repository`, `usePrecompiled`) |
| v26.3.x + NRI | `cdi.nriPluginEnabled: true` — NVIDIA **deneysel** sayar; containerd 2.1 (RKE2 v1.31.13/v1.32.9/v1.33.5/v1.34.1 +rke2r1 ve sonrası) |

Şablon (v25.10+; v25.3'te yukarıdaki env satırlarını ekle):
```yaml
apiVersion: helm.cattle.io/v1
kind: HelmChart
metadata: {name: gpu-operator, namespace: kube-system}
spec:
  repo: https://helm.ngc.nvidia.com/nvidia      # kapalı ağ: kurum aynası / chart: dosyası [SAHA]
  chart: gpu-operator
  version: <v>                                   # uyum.py ile seçildi
  targetNamespace: gpu-operator
  createNamespace: true
  valuesContent: |-
    driver:
      enabled: false                             # host sürücüsü varsa
    toolkit:
      env:
      - name: CONTAINERD_SOCKET
        value: /run/k3s/containerd/containerd.sock
```
⚠️ **"The NVIDIA operator restarts containerd with a hangup call which restarts RKE2"** (RKE2 belgesi) — toolkit DaemonSet'i her GPU
node'unda containerd'yi yeniden yükler; o node'daki RKE2 ajanı yeniden başlar. Canlı GPU node'unda (kurum Qwen) **bakım penceresi**.

## 3. containerd ayarı (`config.toml`) — elle düzenleme yok

- RKE2 ayarı her açılışta **üretir**: `/var/lib/rancher/rke2/agent/etc/containerd/config.toml` — doğrudan düzenleme kalıcı değil (genel; RKE2 yeniden yazar).
- Özelleştirme şablonla: containerd **2.0** (RKE2 v1.31.6/v1.32.2 Şubat 2025 sürümlerinden itibaren) → `config-v3.toml.tmpl`; containerd 1.7 →
  `config.toml.tmpl`. 2.0, v3 şablonu yoksa eski `config.toml.tmpl`'i de işler (RKE2 belgesi).
- **Tam kopya yapma**, temel şablonu genişlet: ilk satır `{{ template "base" . }}`, altına yalnız ek blok (RKE2 belgesi: "do NOT simply copy a
  prerendered config.toml into the template"). Örnek (RKE2 belgesindeki biçim):
  ```
  {{ template "base" . }}
  [plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.'custom']
    runtime_type = "io.containerd.runc.v2"
  [plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.'custom'.options]
    BinaryName = "/usr/bin/custom-container-runtime"
    SystemdCgroup = true
  ```
- NVIDIA runtime'ı genelde **şablon gerekmeden** gelir: RKE2 alternatif runtime ikililerini `PATH`'te de arar; gerekirse
  `/etc/default/rke2-agent` (ya da `/etc/sysconfig/…`) içinde `PATH=` (RKE2 belgesi; "PATH değişikliğinde root servise güvenilmeyen ikili
  sokma" uyarısı). GPU Operator toolkit'i ikiliyi `/usr/local/nvidia/toolkit/nvidia-container-runtime`'a koyar.
- Doğrula (NRI kullanılmıyorsa): `grep nvidia /var/lib/rancher/rke2/agent/etc/containerd/config.toml`.

## 4. Kapalı ağ

İmajlar kurum registry'sine (RKE2 `registries.yaml` aynası) · sürücü konteyneri kullanılıyorsa yerel paket deposu + `repo-config`
ConfigMap'i (`driver.repoConfig.configMapName`), HTTPS iç repo öz-imzalıysa `cert-config` (`driver.certConfig.name`) · önderlenmiş sürücü
konteyneri paket indirmeyi kaldırır ama yalnız destek tablosundaki OS/çekirdek için (NVIDIA *Air-Gapped*, *Precompiled*). Chart:
`helm pull https://helm.ngc.nvidia.com/nvidia/charts/gpu-operator-<v>.tgz` (internetli makinede).

## 5. Doğrulama (okuma; RKE2 belgesinin sırası)

```bash
kubectl get node <gpu-node> -o jsonpath='{.metadata.labels}' | tr ',' '\n' | grep nvidia.com | head
kubectl get node <gpu-node> -o jsonpath='{.status.allocatable}'; echo          # "nvidia.com/gpu": <adet>
kubectl get clusterpolicies.nvidia.com -o jsonpath='{.items[*].status.state}'; echo   # ready
```
Örnek iş yükü (değişiklik — pod oluşturur): belgede `nvcr.io/nvidia/k8s/cuda-sample:nbody`, `limits nvidia.com/gpu: 1`, v25.3'te
`runtimeClassName: nvidia`. Canlı GPU node'unda boş GPU yoksa çalıştırma; Run:ai varsa GPU'yu Run:ai zamanlayıcısı paylaştırır (`rke2-runai`).

## Yapmayacakların

- `config.toml`'u elle düzenleme; prerendered dosyayı şablona kopyalama.
- Operator'ü iki yoldan (HelmChart + `helm install`) kurma — mevcut kurulum yöntemini §0'dan oku, aynısıyla yükselt.
- Major atlama (25.3 → 26.3 gibi): NVIDIA yalnız aynı major ya da bir sonraki major'a yükseltmeyi destekler.
