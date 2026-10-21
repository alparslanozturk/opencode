---
name: rke2-kurulum
description: Kurumun RKE2 kümelerini rke2-ansible playbook'u (rancherfederal 2.x; kurum fork'u alparslanozturk/rke2-ansible) ile KURARKEN kullan — Rancher sürümüne göre RKE2 sürümü seçme, envanter (host.yml, group_vars/all.yml), air-gap tarball, Antrea manifesti, RHEL 9 CIS tuzakları (/tmp noexec, ip_forward), kurum kararları (SELinux/firewalld kapalı), SUC'u kim yönetir. "rke2 kur", "yeni küme", "rke2-ansible", "playbook", "hangi rke2", "envanter", "air-gap", "tarball", "hepapi" isteklerinde tetiklenir. Node ekleme: `rke2-node-ekle` · uyum/EOL: `surum-uyum` · yükseltme: `rke2-yukseltme`.
---

# RKE2 kurulumu — rke2-ansible playbook'u, sürüm seçimi, kurum kararları

## Sürümü tespit et → matrise göre seç → kur (T31, Alp 2026-09-30)

Terimler: **upstream** = Rancher'ın kendisinin çalıştığı `local` küme · **downstream** = Rancher'ın yönettiği kümeler.
SUSE matrisi ikisine **ayrı** kural koyar (upstream için RKE2 aralığı, downstream için RKE2 hatları + RHEL).

**1) Tespit (salt-okunur).** Uydurma — değer yoksa kullanıcıdan iste:
| Ne | Kesin yol (sahada gözlendi) | Diğer yol (sahada doğrulanacak) |
|---|---|---|
| Rancher sürümü | Rancher arayüzü sol alt köşe (ör. `v2.14.3`) | local kümede `kubectl -n cattle-system get deploy rancher -o jsonpath='{.spec.template.spec.containers[0].image}'` · `helm -n cattle-system list` |
| Upstream RKE2 | Rancher küme listesinde `local` satırı · local kümede `kubectl get nodes` (VERSION) | — |
| Downstream RKE2 | Rancher küme listesi · o kümede `kubectl get nodes` | — |

**2) Matrise göre değerlendir** — rke2-ansible reposunda (sahada `/root/ai/rke2-ansible`), **internetsiz çalışır**
(matris `araclar/matris/` içinde; saha suse.com'a erişemez):
```bash
araclar/rancher_matris.py v2.14.3 rhel9 --upstream v1.33.13+rke2r1 --downstream v1.33.13+rke2r1
```
Çıktı: upstream aralığı, downstream hatları (+ en son kararlı sürüm, GitHub'dan), RHEL sürümleri, her kümeye
✅ UYGUN / ❌ DESTEK DIŞI. Matriste olmayan Rancher sürümü için: internetli makinede `--kaydet v2.x.y` → commit/push.

**3) Seç.** Yeni küme için matristeki hatlardan birini seç; **bir sonraki Rancher sürümünde de desteklenen** hattı
tercih et (Rancher yükseltilince küme destek dışı kalmasın). Antrea bu K8s'i desteklemeli (aşağıdaki tablo).
Seçimi kullanıcıya gerekçesiyle öner, kararı o verir.

**4) Kur** — kurum fork'uyla: `airgap/indir.sh --rancher <rancher> --os rhel9 [--antrea v2.x]` → envanterde
`rke2_install_version` = seçilen **tam** sürüm → `--check --diff` → gerçek koşu (K1: kullanıcı "kurulum yapacağım" +
`sunucular:` yazar; numara istenmez).

**Kurum durumu (saha ekranları, 2026-09-30):** Rancher **v2.14.3**; `local` ve downstream kümeler (peaka-poc, test,
test-sasviya, vibecode-test) **v1.33.13+rke2r1** → hepsi ✅ (v2.14.3: upstream v1.33…v1.35, downstream 1.33/1.34/1.35,
RHEL 9.6–9.8). **Dikkat:** Rancher **v2.15.x**'e geçilirse 1.33 destek dışı (upstream v1.34…v1.36) → önce RKE2 ≥ 1.34
(SUC), sonra Rancher. Yeni küme için 1.34 ya da 1.35 öner (v2.14.3 ve v2.15'te ortak; 1.35 → Antrea ≥ v2.6).

## Uyumluluk, destek sonu ve matris verisi → `surum-uyum`

Rancher ↔ RKE2 ↔ RHEL ↔ Antrea uyumu, EOL ve en son yama kararını **`surum-uyum`** becerisindeki `uyum.py` verir (çevrimdışı
matris tablosu da orada). Kurulum öncesi seçtiğin sürümü onunla doğrula; yükseltme sırası için `rke2-yukseltme`.

## Kurumda nasıl karar veriliyor (Alp, 2026-09-29)

- **RKE2 sürümü Rancher sürümüne göre seçilir** (SUSE destek matrisi). OS yalnız RHEL 8 / 9 / 10. Matris dışı sürüm
  kurulmaz/yükseltilmez. Rancher sürümünü kullanıcıya sor ya da yukarıdaki yollarla oku, uydurma.
- **CNI = Antrea** (`cni: none` + `pre_deploy_manifests/antrea.yaml`; RKE2'nin kendi CNI listesinde Antrea yok → SUSE
  desteği kapsamaz). Antrea uyumu: **`surum-uyum` becerisi** (`uyum.py`) — kaynak katmanları: upstream `versioning.md` asgari
  garantisi (çıktığı gün bakımdaki K8s'ler), VMware VCN matrisi (VMware imajı kullanılıyorsa), VMware VKr ikilisi, bilinen
  kayıtlar. "Son 4 K8s" kestirmesini kullanma (G77). **Uyumu tahmin etme** —
  "Uyumluluk kontrolü" adımlarını uygula; tabloda yoksa "hesaplanamadı" de. K8s yükseltmeden ÖNCE Antrea yeni sürümü
  desteklemiyorsa önce Antrea yükseltilir. Kümedeki sürüm:
  `kubectl -n kube-system get ds antrea-agent -o jsonpath='{.spec.template.spec.containers[0].image}'`.
  **Kurum durumu (2026-10-21, kaynaklı — `surum-uyum`):** Antrea **v2.3.0** + K8s **1.33.13** = ⚠️ upstream garantisi (1.29–1.32)
  ve VMware VCN 1.11.0 matrisi (1.27–1.32) dışında; VMware VKr 1.33.x aynı ikiliyi (2.3.0–2.3.2) paketliyor; kanıtlı uyumsuzluk
  yok. Garanti kapsamına girmek için 1.33'ü garanti eden en küçük: v2.4 (1.30–1.33); 1.34'e geçişi de kapsayan v2.5 (1.32–1.34).
- **Yükseltmeyi system-upgrade-controller (SUC) yapar**, playbook değil → envanterde `rke2_upgrade: false`.
  SUC sonrası `all.yml`'deki `rke2_install_version` kümenin yeni sürümüne güncellenmeli. **SUC'u kim yönetiyor — önce bak:**
  küme Rancher'a içe aktarılmış ve sürüm yönetimi açıksa SUC + Plan'ları Rancher kurar (`cattle-system`'da
  `system-upgrade-controller`; `test` kümesinde görüldü, saha G65) → yükseltme **Rancher arayüzünden** (Edit Config →
  Kubernetes Version); elle Plan yazmak "beklenmeyen sonuç" doğurur (Rancher docs register-existing-clusters). Sıra, ön kontrol,
  EOL ve adım adım yol: **`rke2-yukseltme`** becerisi (`uyum.py`).
- **Kurum kararları (Alp, 2026-09-29):** işletim sistemine CIS Level 1 Satellite/OpenSCAP ile uygulanıyor
  (RHEL 10 dahil); **Kubernetes CIS profili kullanılmıyor** (`profile` yok) · **SELinux kapalı** · **firewalld kapalı**
  (imajlarda zaten) · **`net.ipv4.ip_forward=1`** kalıcı (CIS 0 yazıyor; kurum fork'u `/etc/sysctl.d/99-zz-rke2.conf`
  yazar — elle kontrol: `sysctl net.ipv4.ip_forward`, 0 ise pod ağı bozulur) · **`/tmp` noexec** kurulum sırasında
  geçici `mount -o remount,exec /tmp`, bitince `remount,noexec`. Node NotReady / pod ağı sorununda önce ip_forward'a bak.
- **Air-gap:** dosyalar `github.com/rancher/rke2/releases/download/<sürüm>/` (tarball + `rke2-images-core`);
  Antrea imajları RKE2 paketinde yok → kurum kayıt aynasında olmalı (`files/registries.yaml`, `mirrors: "*"`).

## Kurum fork'u (github.com/alparslanozturk/rke2-ansible)

Sahada bu fork kullanılıyorsa (`KURUM.md` dosyası varsa) aşağıdakiler hazırdır — elle yapma, bunları kullan:
- `araclar/rancher_matris.py <rancher> [rhel9] [--upstream v…] [--downstream v…]` — RKE2 hatları + RHEL + mevcut
  kümeler uygun mu; matris repoda (internetsiz). `--liste` repodaki Rancher sürümleri.
- Saha dışarıda **yalnız GitHub'a** erişir: suse.com/get.rke2.io kapalı → gerekenler repoda (matris, `airgap/install.sh`).
- `araclar/antrea_surum.py` — **kullanma** (G77): "son 4 K8s" kestirmesine dayanır; Antrea uyumu `surum-uyum`/`uyum.py`
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

## Node ekleme → `rke2-node-ekle`

Mevcut kümeye worker/sunucu ekleme (tuzaklar, prosedür, elle fiziksel GPU worker) ayrı beceride: **`rke2-node-ekle`**.

## Sürüm/küme bilgisi eksikse

Rancher sürümü, küme RKE2 sürümü, Antrea sürümü bilinmiyorsa uydurma — `[SAHA]` bırak, kullanıcıdan iste
(`kubectl get nodes`, yukarıdaki antrea komutu, Rancher arayüzündeki sürüm). Kurumdaki SUC plan ayarları ve sürüm
geçmişi henüz yazılmadı (Alp anlatacak).
