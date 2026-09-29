---
name: rke2-ansible
description: Kurumun RKE2 kümelerini kuran rke2-ansible playbook'u (rancherfederal 2.x, hepapi danışmanlığıyla) ile çalışırken kullan — kümeye yeni node/worker ekleme, envanter (host.yml, group_vars/all.yml), tarball kurulum, sürüm, upgrade, pre_deploy_manifests (antrea), token, "rke2", "node ekle", "worker ekle", "hepapi" isteklerinde tetiklenir. Küme içi sorun arama için `k8s-rancher`.
---

# rke2-ansible — kümeye node ekleme ve güvenli kullanım

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

## Geliştirme adayları (şimdilik not — Alp'le)

`rke2_kubernetes_api_server_host` boşken fail et · node ekleme için ayrı `add-nodes.yml` (yalnız yeni node, sürüm ve
server satırı doğrulamalı) · drain'li upgrade · `previous_install.yml` kurulu sürümü yalnız `/usr/local/bin/rke2`'den
okuyor (`/opt/rke2` kurulumunda sürüm bilinmez → gereksiz yeniden açma/restart riski) · `in groups[..][0]` alt-dize
karşılaştırması → `==`.
