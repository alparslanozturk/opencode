---
name: rke2-gpu-kurulum
description: RKE2 kümesine NVIDIA GPU Operator kurarken/yükseltirken ve containerd ayarını (config.toml / config-v3.toml.tmpl, nvidia runtime, CDI, NRI) yaparken kullan — HelmChart manifesti sürüme göre (v25.3 / v25.10 / v26.3), CONTAINERD_SOCKET, sürücü host'ta mı operator'de mi (driver.enabled, toolkit.enabled), kapalı ağ (özel registry, repoConfig), containerd yeniden yüklemesinin RKE2'yi yeniden başlatması, doğrulama pod'u. "gpu operator kur", "gpu operator yükselt", "helmchart gpu", "config.toml", "config-v3.toml.tmpl", "containerd nvidia", "nvidia runtime", "runtimeclass", "cdi", "nri", "device plugin", "air-gap gpu", "FailedCreatePodSandBox", "nvidia-container-runtime no such file", "GPU node'unda pod açılmıyor", "antrea install-cni Init" isteklerinde tetiklenir (§6). Host sürücüsü `rhel-gpu-surucu`; mevcut kümeyi denetleme `rke2-gpu`; Run:ai `rke2-runai`. Kurulum değişikliktir (yetki).
---

# GPU Operator + containerd — RKE2

Kaynak: RKE2 *GPU Operators* (docs.rke2.io/add-ons/gpu_operators) ve *Advanced → Configuring containerd* (docs.rke2.io/advanced) ·
NVIDIA GPU Operator *Getting Started*, *Platform Support*, *Air-Gapped* (latest = 26.7) · Run:ai *Cluster System Requirements* — indirme
2026-10-24; §6: RKE2 *GPU Operators* + NVIDIA *Getting Started* (toolkit/CDI satırları) yeniden okundu 2026-11-13. **(Alp)** kurum · **(genel)** doğrulanmadı.

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

## Önce sor (tek mesaj, numaralı — oturumda/kurumsal bilgide cevabı varsa sorma)

1. **Küme** ve GPU node'ları.
2. **İş:** ilk kurulum mu, yükseltme mi (hangi sürümden hangisine), yalnız containerd ayarı mı, yalnız doğrulama mı (§5).
3. **Sürücü nerede:** host'ta kurulu mu, operator mü kuracak (§1 — `driver.enabled` buna göre).
4. **Kapalı ağ:** imajlar hangi kayıt deposunda (§4; `kurum-registry`).
5. **Zamanlama:** containerd ayarı RKE2'yi yeniden başlatır — bakım penceresi ve node sırası onayı.

Sorma: kurulu operator sürümü, ClusterPolicy durumu, RKE2 sürümü — §0 okur; hedef sürüm uyumu `surum-uyum`.

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

## 6. Sorun: GPU node'unda hiçbir pod açılmıyor — `nvidia-container-runtime: no such file or directory` (saha 2026-11-13, G125)

**Belirti (saha):** bir GPU node'unda Antrea (`antrea-agent` Init `install-cni`), `kube-proxy` ve GPU Operator pod'larının **hepsi** Init /
ContainerCreating'de kalıyor; olay `FailedCreatePodSandBox … failed to create shim task: OCI runtime create failed … fork/exec
/usr/local/nvidia/toolkit/nvidia-container-runtime: no such file or directory`. GPU Operator pod'ları `driver-validation` /
`toolkit-validation` bekliyor.

**Sebep:** containerd'nin **varsayılan** runtime'ı `nvidia`, ama ikiliyi diske koyacak toolkit DaemonSet'i o node'da henüz çalışmamış.
`runtimeClassName` vermeyen her pod sandbox'ı varsayılan runtime ile açılır (genel, containerd) → CNI açılamaz, toolkit pod'u da açılamaz →
**kısır döngü**; kimse ikiliyi koyamaz. Sahada: şablona `nvidia` varsayılanı node ayağa kalkmadan (toolkit gelmeden) yazılmıştı (Alp).

**Teşhis (okuma):**
```bash
kubectl get pods -A -o wide --field-selector spec.nodeName=<node> | grep -v -e Running -e Completed
kubectl get events -A --field-selector reason=FailedCreatePodSandBox -o wide | grep <node> | tail -5
ssh root@<node> 'cd /var/lib/rancher/rke2/agent/etc/containerd && ls -la && grep -n -e default_runtime_name -e BinaryName -e "^imports" config.toml *.tmpl 2>/dev/null; ls -la /usr/local/nvidia/toolkit/ 2>&1 | head -5'
```
| Gözlem | Anlamı |
|---|---|
| `default_runtime_name = "nvidia"` + ikili **yok** | bu sorun — aşağıdaki çözüm |
| varsayılan `nvidia` + ikili **var**, hata sürüyor | başka sebep: toolkit/validator logları (§5, `rke2-gpu` GPU Operator tablosu) |
| varsayılan runc/yok + ikili yok | normal ilk kurulum aşaması: CNI Ready olunca toolkit DaemonSet ikiliyi koyar |
| `default_runtime_name` yalnız `config.toml`'da, şablonda yok | ayarı toolkit yazmış olabilir (tahmin) — operator `toolkit.env` değerlerine bak (`CONTAINERD_SET_AS_DEFAULT`) |

Operator sürümünü pod imajından oku (`gpu-operator-validator:<v>`); tahmin etme.

**Kalıcı çözüm — değişiklik (CN + onay, node başına; RKE2 ajanı yeniden başlar, node'daki pod'lar yeniden kurulur):**
1. Şablonu yedekle — **aynı dizinde `.tmpl` adıyla bırakma**: `cp -p <şablon> /root/<şablon>.yedek-<tarih>`.
2. Şablondan varsayılanı nvidia yapan satır(lar)ı çıkar. Şablonun başka işi yoksa şablonu kaldır; varsa yalnız `{{ template "base" . }}` +
   gereken ek blok kalsın (§3). Elle `config.toml` düzenleme — RKE2 yeniden yazar.
3. `systemctl restart rke2-agent` (server node'u ise `rke2-server`) — playbook ile, bir node'da önce (`ansible` §1c).
4. Doğrula: `grep -n default_runtime_name config.toml` → nvidia değil · `antrea-agent` Running, node Ready · ardından toolkit pod'u Running,
   `ls /usr/local/nvidia/toolkit/nvidia-container-runtime` var · `grep nvidia config.toml` (RKE2 belgesi doğrulaması) · `clusterpolicy` ready.

Varsayılanı nvidia yapmak gerekmez: operator ≥ 25.10 CDI ile çalışır (NVIDIA: CDI açıkken "The Operator will no longer configure the nvidia
runtime class as the default runtime handler"); 25.3'te GPU pod'u `runtimeClassName: nvidia` ile çalışır (§2). İstisna: host'ta sürücü +
toolkit önceden kurulu ve `toolkit.enabled=false` (§1) — orada ikili zaten diskte.

**Geçici çıkış (sahada yapıldı, 2026-11-13):** aynı operator sürümündeki sağlıklı bir GPU node'undan `/usr/local/nvidia/toolkit` dizinini
arşivleyip bu node'da `/` altına açmak → ikili yerinde olur, sandbox açılır, döngü kırılır (kubelet sandbox'ı kendisi yeniden dener — genel;
takılı kalan pod silinirse yeniden kurulur, silmek değişiklik). Koşullar: arşivdeki sürüm toolkit imaj etiketiyle aynı (ör. `libnvidia-container.so.1.17.8`
↔ `container-toolkit:v1.17.8`), kaynak node'la sürücü yerleşimi aynı (host sürücüsü / sürücü konteyneri). **Kalıcı değil:** şablon hâlâ
varsayılanı nvidia yapıyorsa dizin silinince ya da yeni node'da aynı kilit tekrar olur → kalıcı çözümü de uygula.

**Sıra kuralı (önleme):** yeni GPU node'u kümeye **nvidia'sız** katılır (şablon yok ya da yalnız base) → CNI Ready → GPU Operator toolkit
ikiliyi koyar → containerd ayarı ancak bundan sonra, gerekiyorsa değişir; değiştirmeden önce `ls /usr/local/nvidia/toolkit/nvidia-container-runtime`
ile ikilinin varlığını kanıtla. Aynı kural `rke2-node-ekle` (GPU worker) için de geçerli.

## Yapmayacakların

- `config.toml`'u elle düzenleme; prerendered dosyayı şablona kopyalama.
- İkili (`/usr/local/nvidia/toolkit/nvidia-container-runtime`) diskte yokken varsayılan runtime'ı `nvidia` yapma (§6 — tüm node kilitlenir).
- Operator'ü iki yoldan (HelmChart + `helm install`) kurma — mevcut kurulum yöntemini §0'dan oku, aynısıyla yükselt.
- Major atlama (25.3 → 26.3 gibi): NVIDIA yalnız aynı major ya da bir sonraki major'a yükseltmeyi destekler.
