---
name: rke2-node-ekle
description: Mevcut RKE2 kümesine yeni worker ya da sunucu (control-plane) eklerken kullan — firewall ve storage (NFSv3 IP izni) hatırlatması, rke2-ansible ile --limit'li ekleme, kayıt adresi (9345/6443), token, sürüm eşleşmesi, Antrea imajı, node adı, elle fiziksel GPU worker (H200) ve disk düzeni. "node ekle", "worker ekle", "sunucu ekle", "kümeye ekle", "yeni worker", "gpu worker ekle", "h200 ekle", "join", "nfs izni", "firewall izni", "storage izni" isteklerinde tetiklenir. Playbook temeli ve kurum kararları: `rke2-kurulum`.
---

# Kümeye node ekleme

Playbook düzeni, sürüm seçimi ve kurum kararları **`rke2-kurulum`**'da; yeni node'un RHEL ara sürümünü ve sürüm uyumunu
**`surum-uyum`** ile doğrula. Değişiklik kilidi: yeni makine için kullanıcı "kurulum yapacağım" + sunucuları yazar (biçim serbest).

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
5. **Resmi kurallar (RKE2 docs install/ha, security/token; K8s version-skew-policy):** kayıt adresi sabit olmalı (LB / DNS /
   VIP; **9345** kayıt, **6443** API) ve sunucu sertifikasında `tls-san` olarak bulunmalı; sunucu sayısı **tek** (etcd yeter
   sayısı, önerilen 3); sunuculardaki kritik bayraklar aynı olmalı, değilse katılım `critical configuration value mismatch`
   ile düşer; yeni node **kümeden yeni sürümde olamaz** (kubelet apiserver'dan yeni olamaz, en çok 3 minor eski) → kümenin
   tam sürümü; token için **güvenli biçim** (`K10…`, `/var/lib/rancher/rke2/server/node-token`) — kısa biçimde katılan node
   sunucu CA'sını doğrulamaz (ortadaki adam riski). Yeni node'un RHEL ara sürümü Rancher'ın RHEL listesinde olmalı:
   `uyum.py kontrol --rancher <r> --rke2 <k> --rhel <yeni>` (Rancher v2.14+ listesinde 9.2/9.4 yok).
6. **`node_name` hostvar'ı 2.x'te etkisizdir** (1.x'ten kalma; 2.x yeniden yazımında kaldırıldı — `grep -rn node_name
   roles/` boş döner). Sahadaki `host.yml` (`<ip>: node_name: "stlrancherwor0N"`) bu biçimde. Node adı
   makinenin hostname'inden gelir. `kubectl get nodes` adları hostname ile aynıysa sorun yok; yeni node'lara
   farklı ad gerekiyorsa: `<ip>: {host_rke2_config: {node-name: "stlrancherwor07"}}`. Sahadaki kopyada
   `grep -rn node_name roles/` sonuç veriyorsa sürüm farklıdır — önce onu oku.

7. **Ekipler arası erişim izinleri — HER node eklemede hatırlat (Alp, 2026-10-21):** kümedeki node'lar NFS paylaşımlarına
   ve diğer sistemlere izinli. Yeni node'un **IP'leri** için kullanıcıya iki soruyu kurulumdan önce sor (ajan yapamaz, ekip işi):
   - **Firewall / BT-Network:** mevcut node'ların erişimleri (NFS sunucusu, kayıt aynası, Rancher, DNS/NTP …) yeni IP'ler için de
     açıldı mı? Genelde firewall izni gerekir.
   - **BT-Storage (NFS):** kurumda NFSv4 değil, NFSv3 kullanılıyor → paylaşımlarda **host tabanlı (IP) kısıtlama** var; yeni node
     IP'leri her NFS paylaşımının izin listesine eklenmezse o node'a düşen pod'ların bağlaması `access denied` / takılma verir. Storage
     ekibine yeni IP'ler bildirilip paylaşıma eklenmeli.
   Okuma ile yardımcı ol (yeni node'da, kurulum öncesi/sonrası): mevcut bir worker'daki NFS bağlamalarını listele (hangi
   paylaşımlar gerekecek) — `findmnt -t nfs,nfs4 -o SOURCE,TARGET,OPTIONS`; kümedeki NFS PV'leri — `kubectl get pv -o
   custom-columns=AD:.metadata.name,NFS:.spec.nfs.server,YOL:.spec.nfs.path,SC:.spec.storageClassName | grep -v '<none>'`;
   yeni node'dan erişim — `showmount -e <nfs-sunucu>`, `rpcinfo -s <nfs-sunucu>`, `timeout 3 bash -c '</dev/tcp/<nfs-sunucu>/2049'`.
   `showmount` listede yeni IP'yi görmüyorsa ya da 2049 kapalıysa izin eksiktir. Bağlama **denemesi** (`mount -t nfs`) değişiklik —
   yapma. Rapor/teslim satırına "Firewall izni: ✓/❓ · Storage NFS izni: ✓/❓" yaz.

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

Değişiklik (onay ekranı): yeni makine kurulumu — hangi node'ların ekleneceğini kullanıcıya teyit ettir. Tüm küme
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
**Fiziksel GPU sunucusu disk düzeni (işletim sistemi katmanı, RKE2 ayarı değil — RKE2 kurulmadan önce):** RAID10 NVMe (Alp, 2026-10-08: 16 × 1.7 TB NVMe — 12'si RAID10, 2'si spare; RAID **yazılım (mdadm)**, RHEL 9 — Alp aynı gün; kalan 2 diskin işi `[SAHA]`. Sağlık kontrolü: `rhel-depolama` A §8. 12 diskli RAID10 ≈ 10.2 TB eder, aşağıdaki LV planı ~14 TB — `vgs vg_gpu` ile gerçek boyutu doğrula, boyutları ona göre ver) → LVM `vg_gpu` (plan; sahadaki h200w1'de gerçek ad `vg_models/lv_models`, `relatime` — 2026-10-15): `lv_rke2` 2T →
`/var/lib/rancher/rke2`, `lv_kubelet` 2T → `/var/lib/kubelet`, `lv_models` kalan (~10T) → `/models` (xfs, `noatime`,
noexec YOK). Cihaz adını varsayma — boş olduğunu `rhel-depolama` B §1 `disk-durum.py` ile gör (`wipefs -n` okuma; silen `wipefs -a` K5). Kilit:
`/etc/systemd/system/rke2-agent.service.d/diskler.conf` → `RequiresMountsFor=/var/lib/rancher/rke2 /var/lib/kubelet`
(disk bağlanmazsa agent başlamaz, kök diski doldurmaz). Sonra NVIDIA GPU Operator; vLLM pod'ları `hostPath: /models`
ile çalışır → namespace PSA istisnasında olmalı, pod GPU sunucusuna `nodeSelector` ile sabitlenmeli.

**`/models` okuma performansı — öneri gelirse önce ölç** (Alp'in getirdiği genel AI önerisi değerlendirildi, 2026-10-31; kaynak: bu makinedeki
man sayfaları, mdadm 4.4): `--chunk=512` mdadm'ın **varsayılanı** (man mdadm: "default when creating an array is 512KB") · `noatime` zaten
`nodiratime`'ı kapsar (man mount) · XFS `logbufs=8` **varsayılan** (man xfs); `logbsize` metadata log'u — model okuma hızına etkisi beklenmez
(tahmin) · SELinux kurumda kapalı → `semanage`/`container_file_t` adımları uygulanmaz · read-ahead (`blockdev --setra`), LPV, GDS gibi
değişiklikler **ölçmeden** önerilmez. Önce oku: `blockdev --getra /dev/md<N> /dev/<vg>/lv_models` · `mdadm --detail /dev/md<N> | grep -i chunk`
· `findmnt /models` (sahada `relatime` görüldü) · soğuk okuma testi `dd if=<büyük model dosyası> of=/dev/null bs=16M iflag=direct status=progress`
(okuma). Model ilk yüklemeden sonra page cache'ten gelir — disk hızı yalnız soğuk açılışta belirleyici. Değişiklik (fstab, udev, setra) onay
ekranı + önce/sonra aynı ölçüm.
