---
name: rke2-ansible
description: Kurumun RKE2 kümelerini kuran rke2-ansible playbook'u (rancherfederal 2.x; kurum fork'u alparslanozturk/rke2-ansible) ile çalışırken kullan — hangi RKE2 sürümü (Rancher destek matrisi), Antrea sürümü, kümeye yeni node/worker ekleme, envanter (host.yml, group_vars/all.yml), air-gap tarball, yükseltme (system-upgrade-controller), RHEL 9 CIS (/tmp noexec, SELinux), "rke2", "node ekle", "worker ekle", "antrea", "rancher sürümü", "hepapi" isteklerinde tetiklenir. Küme içi sorun arama için `k8s-rancher`.
---

# rke2-ansible — sürüm seçimi, node ekleme ve güvenli kullanım

## Kurumda nasıl karar veriliyor (Alp, 2026-09-29)

- **RKE2 sürümü Rancher sürümüne göre seçilir** (SUSE destek matrisi:
  `suse.com/suse-rancher/support-matrix/all-supported-versions/rancher-v2-X-Y/`). OS yalnız RHEL 8 / 9 / 10.
  Matris dışı sürüm kurulmaz/yükseltilmez. Örnek (2026-09-29):

  | Rancher | RKE2 (downstream) | RKE2 için RHEL |
  |---|---|---|
  | v2.15.2 | 1.34 · 1.35 · 1.36 | 8.10, 9.6, 9.8, 10.0, 10.2 |
  | v2.12.3 | 1.31 · 1.32 · 1.33 | 8.8, 8.10 |
  | v2.11.3 | 1.30 · 1.31 · 1.32 | 8.8–8.10, 9.3–9.5 |

  Rancher v2.15.2'de **1.33 destek dışı**. Rancher sürümünü kullanıcıya sor, uydurma.
- **CNI = Antrea** (`cni: none` + `pre_deploy_manifests/antrea.yaml`). Antrea kuralı: her minor, çıktığı gün
  desteklenen son 4 K8s'i destekler → v2.4: 1.30–1.33 · v2.5: 1.31–1.34 · v2.6: 1.32–1.35 · v2.7: 1.33–1.36.
  K8s yükseltmeden önce Antrea yeni sürümü desteklemiyorsa önce Antrea yükseltilir. Kümedeki sürüm:
  `kubectl -n kube-system get ds antrea-agent -o jsonpath='{.spec.template.spec.containers[0].image}'`.
- **Yükseltmeyi system-upgrade-controller (SUC) yapar**, playbook değil → envanterde `rke2_upgrade: false`.
  SUC sonrası `all.yml`'deki `rke2_install_version` kümenin yeni sürümüne güncellenmeli.
- **Kurum kararları (Alp, 2026-09-29):** işletim sistemine CIS Level 1 Satellite/OpenSCAP ile uygulanıyor
  (RHEL 10 dahil); **Kubernetes CIS profili kullanılmıyor** (`profile` yok) · **SELinux kapalı** · **firewalld kapalı**
  (imajlarda zaten) · **`net.ipv4.ip_forward=1`** kalıcı (CIS 0 yazıyor; kurum fork'u `/etc/sysctl.d/99-zz-rke2.conf`
  yazar — elle kontrol: `sysctl net.ipv4.ip_forward`, 0 ise pod ağı bozulur) · **`/tmp` noexec** kurulum sırasında
  geçici `mount -o remount,exec /tmp`, bitince `remount,noexec`. Node NotReady / pod ağı sorununda önce ip_forward'a bak.
- **Air-gap:** dosyalar `github.com/rancher/rke2/releases/download/<sürüm>/` (tarball + `rke2-images-core`);
  Antrea imajları RKE2 paketinde yok → kurum kayıt aynasında olmalı (`files/registries.yaml`, `mirrors: "*"`).

## Kurum fork'u (github.com/alparslanozturk/rke2-ansible)

Sahada bu fork kullanılıyorsa (`KURUM.md` dosyası varsa) aşağıdakiler hazırdır — elle yapma, bunları kullan:
- `araclar/rancher_matris.py <rancher> [rhel9]` — RKE2 hatları + RHEL (internet gerekir; sahada çıktıyı kullanıcı getirir)
- `araclar/antrea_surum.py <k8s>` — Antrea uyum tablosu + öneri
- `airgap/indir.sh --rancher v2.15.2 --os rhel9 [--antrea v2.7] [--kuru]` — indirir, sha256 doğrular, sonda tablo
- **Preflight** (playbook başında, değişiklik yapmaz) şunlarda durur: sürüm verilmemiş · tarball/imaj dosyası yok ·
  `--limit`'li koşuda API adresi boş · `rke2_upgrade: false` iken küme sürümü ≠ envanter sürümü. `node_name` için uyarır.
- `/tmp` noexec görevi, `rke2-selinux` kurulumu, `/opt/rke2` sürüm algısı, `in groups[..][0]` hatası düzeltilmiş.
- Kullanım rehberi `KURUM.md` (sade Türkçe); teknik farklar `TEKNIK.md`.
Fork yoksa (sahadaki `rke2-ansible-last` kopyası) aşağıdaki tuzakları elle kontrol et.

## Sahadaki kopyanın sürümü

**Hangi sürüm?** Sahadaki kopya (`rke2-ansible-last`, envanter `inventory/<küme>/host.yml` + `group_vars/all.yml`
+ `files/` + `pre_deploy_manifests/`) **rancherfederal/rke2-ansible 2.x** yapısındadır (tek `roles/rke2`,
`playbooks/install.yml`, `playbooks/upgrade.yml`). `github.com/hepapi/rke2-ansible` `hepapi` dalı **eski 1.x**
(2023-11) — oradaki davranış (ör. token yalnız ilk sunucudan) 2.x'te **geçerli değil**. İlk iş sahadaki sürümü
teyit et: `git -C <playbook-dizini> log -1 --format='%h %ad %s'` ve `ls roles/` (tek `rke2` = 2.x).
Aşağısı 2.x kodundan (`roles/rke2/tasks/*.yml`) çıkarıldı.

## 2.x nasıl çalışır (kısa)

- `site.yml` → `playbooks/install.yml`: **`hosts: all`**, tek rol `rke2`, serial yok. Gruplar: `rke2_servers`,
  `rke2_agents`.
- Ayar katmanları (birleşir): `cluster_rke2_config` (all.yml) → `group_rke2_config` (group_vars) →
  `host_rke2_config` (host). Sonuç `/etc/rancher/rke2/config.yaml`'a **blockinfile** ile yazılır; blok
  değişirse `rke2-server`/`rke2-agent` **yeniden başlar** (agent'larda `rke2_agent_service_restart_throttle`, vars. 1).
- Kurulum yolu (`collect_info.yml`): `rke2_install_local_tarball_path` / `rke2_install_tarball_url` doluysa
  **tarball** (sahada `kt_tarball_test` = tarball); yoksa RHEL'de **RPM**. Tarball'da sürüm tarball'ın içindeki
  `bin/rke2 -v`'den okunur; kurulu sürümle farklıysa açılır ve servis yeniden başlar.
- `rke2_install_version` boş **ve** tarball yolu boşsa sürüm internetten (`update.rke2.io`, kanal `stable`) çekilir —
  offline'da düşer.
- **Mevcut küme algısı:** koşuya giren, kurulu ve Ready sunucular `ready_servers` listesine girer; token
  `ready_servers[0]`'dan okunur. Liste boşsa "yeni küme" sayılır: `rke2_servers[0]` ilk sunucu olur, token ondan
  **`delegate_to` ile** okunur (`save_generated_token.yml`).
- `server:` satırı = `https://<rke2_kubernetes_api_server_host>:9345`; bu değişken **boşsa** token alınan sunucunun
  `ansible_default_ipv4` adresi kullanılır (o sunucunun **facts'i toplanmış olmalı**).
- Manifestler: `rke2_manifest_config_directory` (ör. `pre_deploy_manifests/`, **antrea.yaml**) yalnız
  `rke2_servers[0]`'a `server/manifests/ansible_managed_0/` altına kopyalanır, RKE2 otomatik uygular; dizinde
  olmayan eski dosyalar oradan **silinir**. `..._post_run_directory` → `ansible_managed_1`.
- PSA/audit/registries/authn-webhook dosyaları `files/`'dan `rke2_*_file_path` değişkenleriyle gider.
- Yan etkiler: firewalld durdurulur (`rke2_ignore_firewalld: false` iken; değişirse restart), NetworkManager
  canal/antrea ayarı, CIS profili varsa sysctl + **reboot**, STIG izinleri.

## Node eklemeden ÖNCE — tuzaklar

1. **`rke2_kubernetes_api_server_host` sabit olsun** (VIP/LB ya da bir sunucunun IP'si, `all.yml`). Boşsa
   `server:` satırı "token alınan sunucunun IP'si"nden türer: koşuya giren sunucu kümesi değişince satır
   değişir → mevcut node'larda config farkı → **toplu restart**; ayrıca yalnız yeni node'larla koşuda ilk
   sunucunun facts'i olmadığı için görev düşer. Mevcut node'lardaki `server:` satırıyla **aynı** değer olmalı
   (`grep ^server: /etc/rancher/rke2/config.yaml`).
2. **Sürüm = kümenin sürümü.** Tarball kurulumda `rke2_install_local_tarball_path` 1.33 yükseltmesinde kullanılan
   **aynı** tarball'ı göstermeli (`tar -xzf <tarball> bin/rke2 -O | …` yerine en kolayı: bir node'da `rke2 -v` ile
   `kubectl get nodes` VERSION'ını karşılaştır). Yanlış tarball = yeni node farklı sürüm, koşuya giren eski
   node'lar **yükseltme + restart**.
3. **Antrea imajları RKE2 imaj paketinde yok.** `cni: none` + `pre_deploy_manifests/antrea.yaml` ile kurulan
   kümede yeni node'daki `antrea-agent` pod'u imajı **kayıt aynasından** (`files/registries.yaml`) çekebilmeli; yoksa
   node NotReady kalır. Antrea sürümünün k8s 1.33'ü desteklediğini de doğrula (1.32→1.33 sonrası).
4. `upgrade.yml` agent'ları **drain etmeden** yükseltir (kendi uyarısı var); node ekleme için **kullanma**.
5. **`node_name` hostvar'ı 2.x'te etkisizdir** (1.x'ten kalma; 2.x yeniden yazımında kaldırıldı — `grep -rn node_name
   roles/` boş döner). Sahadaki `host.yml` (`10.14.9.x: node_name: "stlrancherwor0N"`) bu biçimde. Node adı
   makinenin hostname'inden gelir. `kubectl get nodes` adları hostname ile aynıysa sorun yok; yeni node'lara
   farklı ad gerekiyorsa: `10.14.9.x: {host_rke2_config: {node-name: "stlrancherwor07"}}`. Sahadaki kopyada
   `grep -rn node_name roles/` sonuç veriyorsa sürüm farklıdır — önce onu oku.

## Prosedür: mevcut kümeye N yeni worker ekleme

**0) Keşif — salt-okunur.** Tablo yap, bilinmeyeni `[SAHA]` bırak.
```bash
kubectl get nodes -o wide                                   # sürüm, adlar, IP'ler
cat inventory/<küme>/host.yml inventory/<küme>/group_vars/*.yml
ssh <mevcut-agent> 'rke2 -v | head -1; grep -E "^(server|cni|profile)" /etc/rancher/rke2/config.yaml; ls /usr/local/bin/rke2 /opt/rke2/bin/rke2 2>&1'
ssh <yeni-node> 'head -3 /etc/os-release; swapon --show; df -h /var; timedatectl | grep synchronized'
kubectl -n kube-system get ds -o wide | grep -i antrea      # antrea-agent imajı/sürümü
```

**1) Envanter:** yeni makineleri `rke2_agents` altına ekle; mevcut agent'lardaki `host_rke2_config` (node-label,
node-taint, node-ip) deseni neyse aynısı. `all.yml`'de `rke2_kubernetes_api_server_host` ve tarball yolu 1-2. tuzağa
göre dolu olsun. Sunucu (control-plane) ekliyorsan `rke2_servers`'ın **sonuna**, toplam sunucu **tek** sayı.

**2) Kuru koşu** (değişiklik yapmaz; tarball/shell adımları check modda atlanabilir — amaç hedef listesi ve
config.yaml diff'i):
```bash
ansible-playbook -i inventory/<küme>/host.yml site.yml --check --diff --limit '<yeni1>,<yeni2>,…'
```

**3) Gerçek koşu — yalnız yeni node'lar** (mevcutlara dokunmaz; token `rke2_servers[0]`'dan `delegate_to` ile
okunur, ona yalnız okuma yapılır):
```bash
ansible-playbook -i inventory/<küme>/host.yml site.yml --limit '<yeni1>,…,<yeni7>'
```
Tüm küme (`--limit` yok) koşusu da çalışır ama her node'da config/firewalld/sürüm farkı varsa **restart** olur —
yalnız 2. adımda tüm küme için diff temizse.

Değişiklik kilidi (K1): kullanıcı **`KURULUM` + `sunucular: <yeni1>, …`** vermeli (yeni makine kurulumu). Tüm küme
koşusu mevcut node'ları da değiştirir → **CN** + tüm node'lar listede.

**4) Doğrulama:**
```bash
kubectl get nodes -o wide                                            # yeni node'lar Ready, VERSION aynı
kubectl get pods -A -o wide --field-selector spec.nodeName=<yeni1>   # antrea-agent, kube-proxy Running
ssh <yeni1> 'systemctl is-active rke2-agent; journalctl -u rke2-agent -n 30 --no-pager'
```
NotReady ise sırayla: antrea-agent imaj çekme (ImagePullBackOff) → 9345/6443 erişimi → token/`server:` satırı →
sürüm farkı.

## Elle worker ekleme (fiziksel GPU H200 gibi farklı sunucular)

Sanal worker'lar playbook ile; **farklı donanımlı sunucuyu Alp elle ekler** (host.yml'e yazılmaz). Kurum fork'unda
adım adım: `docs/MANUEL-WORKER.md`. Özet: kümenin **aynı** RKE2 sürümünün dosyaları (`airgap/indir.sh <tam-sürüm>` →
tarball + core imaj + sha256 + `install.sh`) → `ip_forward=1` (`/etc/sysctl.d/99-zz-rke2.conf`), firewalld kapalı,
swap kapalı, tekil hostname → `INSTALL_RKE2_TYPE=agent INSTALL_RKE2_ARTIFACT_PATH=<dizin> sh install.sh` → core imaj
paketini elle `/var/lib/rancher/rke2/agent/images/`'a kopyala (install.sh yalnız tam paketi tanır) →
`/etc/rancher/rke2/registries.yaml` + `config.yaml` (`server: https://<API>:9345`, `token:` yöneticideki
`/var/lib/rancher/rke2/server/node-token`, isteğe bağlı `node-label`/`node-taint`) → `systemctl enable --now rke2-agent`.
GPU sürücü/GPU Operator ayrı kurulum; SUC planlarının nodeSelector'ı GPU sunucusunu da kapsayabilir.
**Fiziksel GPU sunucusu disk düzeni (işletim sistemi katmanı, RKE2 ayarı değil — RKE2 kurulmadan önce):** RAID10 NVMe → LVM `vg_gpu`: `lv_rke2` 2T →
`/var/lib/rancher/rke2`, `lv_kubelet` 2T → `/var/lib/kubelet`, `lv_models` kalan (~10T) → `/models` (xfs, `noatime`,
noexec YOK). Cihaz adını varsayma (`lsblk -f`, `wipefs -n` ile boş olduğunu gör — bkz. `disk-ekleme` becerisi). Kilit:
`/etc/systemd/system/rke2-agent.service.d/diskler.conf` → `RequiresMountsFor=/var/lib/rancher/rke2 /var/lib/kubelet`
(disk bağlanmazsa agent başlamaz, kök diski doldurmaz). Sonra NVIDIA GPU Operator; vLLM pod'ları `hostPath: /models`
ile çalışır → namespace PSA istisnasında olmalı, pod GPU sunucusuna `nodeSelector` ile sabitlenmeli.

## Sürüm/küme bilgisi eksikse

Rancher sürümü, küme RKE2 sürümü, Antrea sürümü bilinmiyorsa uydurma — `[SAHA]` bırak, kullanıcıdan iste
(`kubectl get nodes`, yukarıdaki antrea komutu, Rancher arayüzündeki sürüm). Kurumdaki SUC plan ayarları ve sürüm
geçmişi henüz yazılmadı (Alp anlatacak).
