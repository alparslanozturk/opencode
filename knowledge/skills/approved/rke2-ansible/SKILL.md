---
name: rke2-ansible
description: Kurumun RKE2 kümelerini kuran hepapi/rke2-ansible playbook'u ile çalışırken kullan — kümeye yeni sunucu/node ekleme, envanter (hosts.yaml/hosts.ini), sürüm sabitleme, site.yml koşusu, rke2-server/rke2-agent, token, "rke2", "node ekle", "worker ekle", "hepapi" isteklerinde tetiklenir. Küme içi sorun arama için `k8s-rancher`.
---

# hepapi/rke2-ansible — kümeye node ekleme ve güvenli kullanım

Kaynak: `https://github.com/hepapi/rke2-ansible`, **`hepapi` dalı** (danışman firma). `rancherfederal/rke2-ansible`
2023-11 sürümünün fork'u; hepapi dalı yalnız doküman/terraform/yorum ekler, **rol kodu upstream ile aynıdır**.
Aşağıdaki davranışlar kod okunarak çıkarıldı (dosya adları verildi) — sahadaki kopya farklıysa önce onu oku.

## Playbook nasıl çalışır (kısa)

- `site.yml`: önce `rke2_servers` (**serial: 1**, `any_errors_fatal`), sonra `rke2_agents` (**serial: 3**).
- Gruplar: `rke2_servers`, `rke2_agents`, `rke2_cluster` (ikisinin çocuğu). Envanter INI ya da YAML olabilir.
- **`groups['rke2_servers'][0]` özeldir:** ilk sunucu. `first_server.yml` yalnız onda koşar; katılım token'ını
  (`/var/lib/rancher/rke2/server/node-token`) okuyup `rke2_config_token` fact'ine koyar. Diğer sunucular ve
  tüm agent'lar token'ı `hostvars[groups['rke2_servers'][0]].rke2_config_token`'dan, sunucu adresini
  `https://<ilk sunucu inventory_hostname>:9345`'ten alır (`kubernetes_api_server_host`).
- Node başına hostvar: `node_ip`, `node_name`, `node_labels=[]`, `node_taints=[]`, `bind_address`,
  `advertise_address`, `node_external_ip`, `cloud_provider_name`. Ortak ayar: `group_vars/rke2_servers.yml`,
  `rke2_agents.yml` → `rke2_config: {}` (RKE2 config.yaml anahtarları birebir).
- Kurulum yolu (`roles/rke2_common/tasks/main.yml`): RHEL/Rocky → **RPM** (`rpm_install.yml`, `yum rke2-agent-<sürüm>`);
  `tarball_install/rke2.linux-amd64.tar.gz` varsa → **tarball** (`/usr/local` ya da `/opt/rke2`). Airgap imajları:
  `tarball_install/rke2-images.linux-amd64.tar.{gz,zst}` → `/var/lib/rancher/rke2/agent/images/`.
- Mevcut node'da `config.yml` config.yaml'ı yeniden üretir; **içerik ya da sürüm değiştiyse servisi yeniden
  başlatır** (rke2-server/agent restart).
- Denetim (control) makinesinde `ansible.utils` koleksiyonu gerekir (`update_fact`).

## Tuzaklar (kod teyitli — node eklemeden ÖNCE bil)

1. **Sürüm sabitlenmezse internetten "stable" çekilir** (`calculate_rke2_version.yml` → `update.rke2.io`).
   Offline'da görev düşer; online'da yeni node'lar kümeden **farklı sürümle** kurulur, koşuya giren eski node'lar
   **yükseltilip yeniden başlatılır**. → `install_rke2_version` her zaman kümenin **tam** sürümü olmalı
   (ör. `v1.33.x+rke2r1` — `kubectl get nodes` VERSION sütunundan birebir).
2. **Kanal listesi v1.28'de biter** (`roles/rke2_common/vars/main.yml`): `rke2_channel: v1.33` "not valid" diye
   düşer. Kanal değil, `install_rke2_version` kullan (tanımlıysa kanal denetimi atlanır).
3. **Token ilk sunucudan gelir:** `--limit` yalnız yeni node'larla verilirse token **tanımsız** kalır ve koşu
   düşer. İki yol var (aşağıda). Yeni sunucuyu `rke2_servers` listesinin **başına koyma** — `[0]` değişirse
   yeni makine "ilk sunucu" sanılır ve **ayrı bir küme** başlatır.
4. **RPM deposu yalnız RHEL/Rocky 7-8 için eklenir** (`rpm_install.yml`); RHEL 9'da `rke2-server/agent`
   paketleri Satellite/yerel depoda **önceden** bulunmalı, yoksa yum düşer.
5. **CIS görevleri yalnız `profile: cis-1.x` biçimini tanır** (`cis-hardening.yml` regex `cis-\d+.\d+`). Yeni
   RKE2'lerde `profile: cis` ise etcd kullanıcısı/sysctl adımları **atlanır** → yeni **sunucu** rke2-server'ı
   başlatamayabilir. CIS profili varsa elle doğrula (`id etcd`, `/etc/sysctl.d/60-rke2-cis.conf`). CIS tetiklenirse
   node **reboot edilir**.
6. `firewalld` her node'da **durdurulup kapatılır**; NetworkManager'a `rke2-canal.conf` yazılır.
7. `when: inventory_hostname in groups['rke2_servers'][0]` alt-dize karşılaştırmasıdır (`"k8s1" in "k8s10"` → true).
   Ad çakışması olan envanterde ilk-sunucu görevleri yanlış makinede koşabilir — adları kontrol et.

## Prosedür: mevcut kümeye N yeni node (worker) ekleme

**0) Keşif — salt-okunur, yetki gerekmez.** Sonuçları tablo yap, bilinmeyeni `[SAHA]` bırak.
```bash
kubectl get nodes -o wide                                  # tam sürüm, mevcut adlar, roller, IP'ler
ansible-inventory -i <envanter> --graph                    # gruplar; ilk sunucu kim?
grep -rn "install_rke2_version\|rke2_channel" <envanter-dizini> group_vars/ 2>/dev/null
ssh <mevcut-agent> 'rpm -q rke2-agent rke2-common; ls -l /usr/bin/rke2 /usr/local/bin/rke2 /opt/rke2/bin/rke2 2>&1; cat /etc/rancher/rke2/config.yaml'
ssh <yeni-node> 'cat /etc/os-release | head -3; dnf -q list --showduplicates rke2-agent 2>&1 | tail -3; swapon --show; df -h /var'
ls <playbook-dizini>/tarball_install/ ; ansible-galaxy collection list ansible.utils
```
Karar: kurulum yolu (RPM mi tarball mı), sabitlenecek tam sürüm, yeni node'larda paket/tarball erişimi var mı.
`config.yaml`'daki `token:`/`server:` satırlarını raporda **gösterme gereği yok** — yalnız "var/yok" yeterli.

**1) Envanter** — yeni makineleri `rke2_agents` altına ekle (sunucu ekleniyorsa `rke2_servers`'ın **sonuna**, etcd
için toplam sunucu sayısı **tek** kalmalı: 3→5). Mevcut node'lardaki `node_labels`/`node_taints`/`node_ip`
deseni neyse aynısını uygula. `install_rke2_version`'ı `all:vars`/`group_vars`'ta kümenin tam sürümüne sabitle.

**2) Kuru koşu** — değişiklik yapmaz:
```bash
ansible-playbook -i <envanter> site.yml --check --diff --limit '<yeni1>,<yeni2>,…' -e @token.yml
```
Check modda shell/register'a dayalı adımlar atlanır ya da düşebilir — amaç: hedef listesi, sürüm hesabı
("Describe versions" çıktısı) ve config.yaml diff'i doğru mu.

**3) Gerçek koşu — iki yol:**
- **(Önerilen) yalnız yeni node'lar, mevcutlara dokunulmaz:** token'ı ilk sunucudan al, 600 izinli dosyaya yaz,
  `-e @` ile ver (yerelde denendi: `hostvars[ilk-sunucu].rke2_config_token` extra-var'dan çözülür):
  ```bash
  ssh <ilk-sunucu> 'cat /var/lib/rancher/rke2/server/node-token'   # → token.yml: rke2_config_token: "<değer>"
  ansible-playbook -i <envanter> site.yml --limit '<yeni1>,…,<yeni7>' -e @token.yml
  ```
- **(Upstream'in yolu) ilk sunucuyu da koşuya kat:** `--limit '<ilk-sunucu>,<yeni1>,…'`. İlk sunucuda
  config.yaml yeniden üretilir; sürüm/config farkı varsa **rke2-server yeniden başlar** → önce 2. adımın diff'ine bak.

Değişiklik kilidi (K1): gerçek koşu için kullanıcı **`KURULUM` + `sunucular: <yeni1>, …`** vermeli (yeni makine
kurulumu); ikinci yolda ilk sunucu da değiştiği için **CN** + listede ilk sunucu da gerekir.

**4) Doğrulama:**
```bash
kubectl get nodes -o wide            # yeni node'lar Ready, VERSION kümeyle aynı
kubectl get pods -A -o wide --field-selector spec.nodeName=<yeni1>   # canal/kube-proxy vb. Running
ssh <yeni1> 'systemctl is-active rke2-agent; journalctl -u rke2-agent -n 20 --no-pager'
```
Sorunlu node: `journalctl -u rke2-agent` → çoğunlukla token/sunucu adresi (9345 erişimi), sürüm uyuşmazlığı ya da
imaj çekme (airgap'te `agent/images/` eksik).

## Geliştirme adayları (şimdilik yalnız not — Alp'le birlikte)

Kanal listesini güncelle / kaldır · sürüm sabitlenmemişse **fail** et (sessiz internet çekişi yerine) · RHEL 9
depo desteği · CIS regex'i `cis` profiline uyarla · `in groups[..][0]` → `==` · token için `rke2_token`
değişkeni desteği (ilk sunucuyu koşuya katmadan) · 1.32→1.33 gibi yükseltmeler için ayrı, node node ilerleyen
upgrade playbook'u (drain → yükselt → uncordon).
