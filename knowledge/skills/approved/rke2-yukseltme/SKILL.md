---
name: rke2-yukseltme
description: Rancher / RKE2 / Antrea (Kubernetes) yükseltmesini planlarken kullan — adım adım yol (minor atlanmaz, Rancher son yama kuralı, Antrea önce), ön kontroller (etcd snapshot, rancher-backup, kaldırılan API, PDB, sertifika), geri dönüş, Rancher'ın sürüm yönetimi (imported küme), Antrea sürüm notları; danışman firmanın (Hepapi) planını veriyle çapraz kontrol. "k8s yükseltme", "rke2 yükseltme", "rancher yükseltme", "upgrade", "upgrade planı", "hangi sürüme", "yol haritası", "antrea yükseltme", "hepapi", "danışman planı", "plan doğru mu" isteklerinde tetiklenir. Destek durumu/EOL sorusu tek başına ise `surum-uyum`. Yalnız okur ve plan yazar; uygulamaz.
---

# Kubernetes yükseltme planı (Rancher · RKE2 · Antrea)

**Kural:** uyum, ömür (EOL) ve sıra kararını **betik verir, sen hesaplama** — `surum-uyum` becerisindeki `uyum.py`
(çalıştırma, veri ve güncelleme orada). Bu beceri Kubernetes tarafının (Rancher / RKE2 / Antrea) yükseltme planıdır;
Anthos ve VMware VCF yükseltmeleri ayrı beceri olacak (veri geldikçe `anthos-…`, `vcf-…`).

```bash
python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py kontrol --rancher v2.14.3 --rke2 v1.33.13+rke2r1 --antrea v2.3.0 --rhel 9.2,9.4,9.8
python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py yol --rancher v2.14.3 --rke2 v1.33.13+rke2r1 --antrea v2.3.0 --hedef-rke2 1.35 --hedef-rancher 2.15
python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py kontrol --rol upstream --rancher v2.14.3 --rke2 v1.33.13+rke2r1   # Rancher'ın local kümesi
```

Çıktıyı **olduğu gibi** aktar (✅/⚠️/❌ + `[kaynak: …]`); satır ekleme, tarihi yeniden hesaplama. Çıkış kodu 1 = en az bir ❌.

## 1. Sürümleri topla (okuma)

```bash
kubectl get nodes -o wide                                   # RKE2 (VERSION), RHEL (OS-IMAGE), çekirdek — node başına
kubectl -n kube-system get ds antrea-agent -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl -n kube-system get deploy antrea-controller -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl -n cattle-system get deploy cattle-cluster-agent -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'   # Rancher sürümü
kubectl -n cattle-system get deploy system-upgrade-controller 2>/dev/null   # varsa: yükseltmeyi Rancher yönetiyor (§2)
```

RHEL listesi için `OS-IMAGE` sütunundaki ara sürümleri tekilleştir. Rancher'ın local kümesi ayrı bir kümedir — onu da topla.

## 2. Resmi kurallar (kaynaklı; uyum.py `yol` bunları uygular)

- **K8s minor atlanmaz** (kubernetes.io version-skew-policy; RKE2 docs upgrades/manual: "Ensure that your plan does not skip
  intermediate minor versions"). kubelet apiserver'dan en çok 3 minor eski olabilir, yeni olamaz.
- **RKE2 sırası:** önce server'lar **tek tek**, hepsi bitince agent'lar (RKE2 docs upgrades/manual). SUC planında server
  planı `concurrency: 1`, agent planı `prepare: server-plan` (upgrades/automated).
- **Kim yükseltir:** küme Rancher'a **içe aktarılmış (imported) ve sürüm yönetimi açıksa** Rancher, SUC'u ve Plan'ları kendisi
  kurar → yükseltme **Rancher arayüzünden** (Cluster Management → Edit Config → Kubernetes Version); dışarıdan yükseltmek
  "beklenmeyen sonuç" doğurur (Rancher docs register-existing-clusters, "Configuring Version Management"). İşaret:
  `cattle-system`'da `system-upgrade-controller`. Sürüm yönetimi kapalıysa SUC Plan'ı ya da elle (RKE2 docs).
- **Rancher sırası:** minor geçişi yalnız **mevcut minor'ın son yamasından → sonraki minor'ın son yamasına** (Rancher docs
  upgrades.md "Upgrade Path"). Önce `rancher-backup` ile yedek. Air-gap: yeni sürümün imajları önce özel registry'ye.
- **Antrea:** K8s'ten **önce**; tek seferde en çok 4 minor; önce controller sonra agent; agent yeniden başlarken o node'da
  yeni bağlantı kurulamaz → node node (Antrea docs versioning.md). Ayrıntı: aşağıda "Antrea yükseltme notları".
- **Her ara durum uyumlu olmalı:** Rancher ↔ downstream hattı, Rancher ↔ local (upstream) aralığı, Rancher ↔ RHEL listesi,
  Antrea ↔ K8s. Yeni Rancher eski hattı bırakıyorsa (2.15 → 1.33 yok) önce RKE2, sonra Rancher.
- **Hedef seçimi:** bakım sonu (EOM) yakın bir hatta inme — `kontrol` çıktısında hedef hattın EOM'una bak (ör. 1.35 EOM
  2026-12-28). Ara durak kısa sürecekse sorun değil; son durak için en az bir EOM dönemi kalmalı.

## 3. Ön kontroller (okuma — plandan önce, her adımdan önce)

```bash
# master'da (ssh): etcd snapshot'ı var ve yeni mi (varsayılan 00:00/12:00, node başına 5 adet, yerel diskte)
ls -lt /var/lib/rancher/rke2/server/db/snapshots/ | head -5
df -h /var/lib/rancher /var/lib/kubelet
# küme:
kubectl get nodes | grep -v ' Ready ' ; kubectl get pods -A | grep -v -e Running -e Completed | head
kubectl get --raw /metrics | grep apiserver_requested_deprecated_apis | grep -v '^#' | head -20   # kaldırılacak API kullanan var mı (removed_release etiketi)
kubectl get pdb -A | awk 'NR==1 || $5=="0"'                      # ALLOWED DISRUPTIONS 0 → drain takılır
kubectl -n cattle-resources-system get backups.resources.cattle.io 2>/dev/null   # Rancher local'de: rancher-backup var mı
```

**Üç master'da tek tablo — `filo-tablo.py --kv`** (değerleri gözle `ls -lt`'den hesaplama; snapshot yaşı komutta hesaplı):

```bash
ansible <master-grubu|mas01,mas02,mas03,> -i <envanter> -m shell -f 20 -T 10 --task-timeout 30 -t cikti/filo/master -a 'd=/var/lib/rancher/rke2/server/db/snapshots; echo snapshot_sayisi=$(ls $d 2>/dev/null | wc -l); echo snapshot_son_24sa=$(find $d -maxdepth 1 -type f -mmin -1440 2>/dev/null | wc -l); echo snapshot_son=$(ls -t -l --time-style=+%F_%H:%M $d 2>/dev/null | awk "NR==2{print \$6}"); echo etcd_s3_satiri=$(grep -c "^etcd-s3" /etc/rancher/rke2/config.yaml 2>/dev/null); echo sifreleme_ilk=$(grep -o -E "aescbc|secretbox|aesgcm|identity" /var/lib/rancher/rke2/server/cred/encryption-config.json 2>/dev/null | head -1); echo audit_log_mb=$(du -sm /var/lib/rancher/rke2/server/logs/audit.log 2>/dev/null | cut -f1); echo anonim_auth=$(ps -ef | grep -o -E -- "--anonymous-auth=[a-z]+" | sort -u | tr "\n" " "); echo rancher_disk=$(df --output=pcent /var/lib/rancher 2>/dev/null | tail -1 | tr -d " "); echo rke2_surum=$(rke2 --version 2>/dev/null | head -1 | cut -d" " -f3)'
python3 /root/ai/opencode/knowledge/skills/approved/filo-kontrol/filo-tablo.py cikti/filo/master --kv
```

`snapshot_son_24sa` = son 24 saatteki snapshot sayısı (0 → ❌), `snapshot_son` = en yeni dosyanın zamanı, `etcd_s3_satiri` 0 → dış kopya
yok (⚠️), `sifreleme_ilk` = `identity` ya da boş → secrets düz metin (❌), `audit_log_mb` boş → audit log yok, `anonim_auth` boş =
bayrak verilmemiş (varsayılan), `rke2_surum` master'lar arasında farklıysa `*` ile görünür. Boş hücre = dosya/bayrak yok.
Ölçüldü (sahte RKE2 dizin ağacı, 2026-10-21); kilitten geçiyor.

Sertifika kalan günü (kalan güne göre sıralı — eski `sort -t= -k2` ay adına göre alfabetikti): `ssh root@<master> 'cd /var/lib/rancher/rke2/server/tls && for f in *.crt */*.crt; do [ -f "$f" ] && { echo "#DOSYA $f"; base64 -w0 "$f"; echo; }; done' | python3 /root/ai/opencode/knowledge/skills/approved/rancher-sertifika/sertifika-kontrol.py - --ozet`.

- `rke2 certificate check --output table` ve `rke2 etcd-snapshot list` de serbest (saha G67) — `openssl`/`ls` karşılıkları yedek. RKE2 sertifikaları 365 gün geçerli; **120 gün** kala (v1.33.1+rke2r1'den beri; öncesi 90)
  `CertificateExpirationWarning` event'i üretilir ve **rke2 yeniden başlarken** kendiliğinden yenilenir (RKE2 docs
  security/certificates). Yükseltme zaten servisleri yeniden başlatır → yenileme yükseltmeyle gelir.
- **Geri dönüşün ön şartı snapshot'tır:** önceki minor'a dönmek için **o minor'da alınmış** etcd snapshot gerekir; yoksa geri
  dönüş yok (RKE2 docs upgrades/roll-back). Snapshot'lar yalnız master diskindeyse VM/datastore kaybında yedek de gider → bulgu.
- **Rancher geri dönüşü** = `rancher-backup` geri yükleme + `rancher-cleanup` (kesinti var); v2.14'ten 2.13'e dönüş özel adım
  ister (Rancher docs rollbacks.md). `rancher-backup` yoksa Rancher yükseltmesi geri dönüşsüzdür → ❌ bulgu.
- `apiserver_requested_deprecated_apis` satırı varsa hedef sürümde kaldırılan API'yi kullanan istemci var → kimin kullandığını
  (`resource`, `group`, `version`, `removed_release`) plana yaz; uygulama sahibine bildirilmeli.

## 4. Plan çıktısı (ekrana, kısa)

```
Küme <ad> · şimdi: Rancher … · RKE2 … · Antrea … · RHEL … · <tarih>
Destek durumu: (uyum.py kontrol çıktısı — ❌ ve ⚠️ satırları)
Hedef: RKE2 … · Rancher … — neden bu hedef (EOM/EOL)
Yol: (uyum.py yol adımları, sırası değiştirilmeden) + her adımın ön kontrolü
Geri dönüş: hangi snapshot/backup, nerede, hangi minor'da alındı
Riskler: kaldırılan API kullanan iş yükleri, PDB, RHEL listede olmayan node'lar, local küme
Açık kalanlar: [SAHA] …
```

## 5. Danışman (Hepapi) planını çapraz kontrol

Plan metni/ekranı gelince her maddeyi veriyle sına; eksikleri liste ile ver (suçlama değil, kontrol listesi):
- Her ara adım `uyum.py yol` çıktısıyla aynı sırada mı? Minor atlanıyor mu? Rancher önce son yamaya çıkıyor mu?
- **Antrea** planda var mı ve K8s adımlarından önce mi? (Antrea RKE2 ile gelmez — unutulması kolay; saha G65.)
- Hedef hattın **SUSE EOM/EOL**'u — kısa sürede tekrar yükseltme gerektiriyor mu?
- **RHEL** node'ları hedef Rancher'ın RHEL listesinde mi (9.2/9.4 v2.14+ listesinde yok)? İşletim sistemi yükseltmesi ayrı iş kalemi mi?
- **local (Rancher'ın kendi) kümesi** planda mı? Yeni Rancher'ın upstream aralığı.
- etcd snapshot + `rancher-backup` + geri dönüş adımları yazılı mı? Kesinti penceresi, drain/PDB, sürüm yönetimi (Rancher UI mi SUC mu)?
- Kaldırılan API taraması yapılmış mı?

## 6. Kurum durumu (saha, 2026-10-17)

- Nonprod Rancher **v2.14.3**, `test` ve diğer downstream + local **v1.33.13+rke2r1**, Antrea **v2.3.0**, `test` RHEL 9.2/9.4/9.7/9.8.
- `uyum.py kontrol` (2026-10-17): RKE2 1.33 **SUSE EOL 2026-10-28** (EOM 2026-04-28 bitti); Rancher 2.14 **EOM 2026-10-30**;
  Antrea v2.3 + 1.33 ❌; RHEL 9.2/9.4 Rancher v2.14.3 listesinde ❌; Rancher 3 yama, RKE2 1 revizyon geride.
- `yol` (hedef 1.35 / 2.15): Rancher → v2.14.6 · Antrea → v2.6.3 · RKE2 → 1.34 · Rancher → v2.15.2 · RKE2 → 1.35.
- Danışman: Hepapi yükseltme çalışmalarını yürütüyor (Alp). Kararı Alp verir; bu beceri kontrol listesi üretir.
- **Kurumda 1.33 ve üstü kümeler var (Alp, 2026-10-26: "bizde 1.33'ten itibaren sistemlerimiz var")** — 1.33, SUSE EOL'ünden
  (2026-10-28) sonra da bir süre çalışacak. Sonuçları:
  - 1.33 kümede iş (teşhis, denetim, node ekleme, sertifika) **normal yapılır**; EOL ❌ bilgi satırıdır, işi reddetme sebebi ya da olay
    sebebi değildir (`surum-uyum` 5). Her cevaba "önce yükseltin" ekleme — yükseltme sorulursa bu beceri.
  - **Rancher 2.15'e geçilemez** — kurumda tek bir 1.33 downstream küme kaldıkça: v2.15.x downstream hatları 1.34–1.36
    (`uyum.py kontrol --rancher v2.15.2 --rke2 <1.33>` → ❌, kaynak rancher-v2-15-2.txt). Sıra: önce bütün 1.33 kümeler 1.34'e,
    sonra Rancher. Hangi kümenin hangi sürümde olduğu → `kume-bul.py k8s` (Rancher local master'ından) ya da kullanıcı.
  - 1.33 için yeni RKE2 yaması çıkmayacak (son: v1.33.13+rke2r3, `[rke2-yama]` 2026-10-26); güvenlik açığı çıkarsa hat düzeltilmez.
  - Becerilerdeki 1.33 komutları/sürüm verisi silinmez (`surumler.txt` 1.33 satırları kalır).

## Antrea yükseltme notları (çevrimdışı — resmi CHANGELOG/versioning.md'den, Doktor 2026-10-17)

Saha internetsiz; yükseltme planı/kontrolü bu özete dayanır. Özet bir araçla okundu — yükseltmeden önce hedef sürümün
CHANGELOG'unu tam metin oku (`github.com/antrea-io/antrea/blob/main/CHANGELOG/CHANGELOG-2.X.md`).

**Kurallar (`docs/versioning.md`):**
- **Yama** (v2.3.0 → v2.3.2): yalnız önemli hata/güvenlik düzeltmesi, özellik yok. **Minor** (v2.3 → v2.4): yeni özellik +
  varsayılan değişikliği. Garanti/matris kapsamına girmek minor yükseltme ister — "sadece bug fix" değildir.
- Tek seferde en çok **4 minor** atla. Sıra: **önce Controller, sonra Agent** (agent controller'dan yeni olamaz, en çok 4 minor eski).
- ⚠️ Agent yeniden başlarken o node'un veri yolu etkilenir: yeni bağlantı kurulamaz, mevcutlar kopabilir → node node, sırayla.
- Eski API sürümleri en az GA 12 ay / Beta 9 ay desteklenir.

**v2.3.0'dan ileriye ne değişir:**
- **v2.3.2** (yama, 2025-10-14): NetworkPolicy öncelik taşması, FlexibleIPAM agent çökmesi, ACNP+NodePort (noEncap) düzeltmeleri.
- **v2.4** (son v2.4.5, garanti 1.30–1.33; VMware VKr 1.34.x'te paketli): küçük — packet-in sınırı 5000, rotalar `ip route add` ile, host gateway komşuları periyodik
  eşitleme, BGP confederation; v2.4.4: Antrea'ya özel sysctl'leri uygulayan **init container**; v2.4.5: FQDN cache çökme düzeltmesi.
- **v2.5** (son v2.5.3, garanti 1.32–1.34; VKr 1.35.x'te paketli): ⚠️ **nftables flowtable host ağı hızlandırması varsayılan açık** (geri düşüşlü — veri yolu
  değişikliği); `AntreaProxy`/`NodePortLocal` feature gate'leri manifestten kalktı; WireGuard yalnız Encap; Egress VLAN'da
  benzersiz MAC varsayılan; OVS bundle/flow yeniden deneme düzeltmeleri; agent panic düzeltmeleri.
- **v2.6** (son v2.6.3, garanti 1.33–1.35; VKr 1.36.x'te paketli): L7FlowExporter kaldırıldı; `TopologyAwareHints`/`ServiceTrafficDistribution` hep açık;
  host-local IPAM GC'nin kullanımdaki Pod IP'sini bırakması ve agent panic düzeltmeleri.
- **v2.7.0** (2026-08-15, garanti 1.34–1.36): **OVS 3.7.1**; ⚠️ **agent gossip trafiği varsayılan kimlik doğrulamalı + şifreli** —
  rolling update sırasında Egress/ServiceExternalIP kısa süre bozulabilir, upgrade guide'a uy; multi-cluster token ClusterID'ye bağlı.
- Hiçbir notta node takılması / `OVS transaction timeout` belirtisine doğrudan uyan düzeltme yok → yükseltmeyi donma çözümü
  diye sunma (saha G65).

**Kurum için yol (öneri, karar Alp'in):** Garanti aralıkları resmi kuraldan yeniden hesaplandı (G77, `surum-uyum`): eski tablo
"son 4 K8s" kestirmesiydi (ör. v2.7'ye 1.33'ü yanlışlıkla katıyordu). (1) v2.3.0 → **v2.4.5** (tek minor, 1.33 garanti aralığında, en az değişiklik). (2) K8s 1.34'e
geçerken ayrı adım: ≥ v2.5 (1.35 → ≥ v2.6; v2.15 Rancher için v2.7 uygun). (3) Açık bir teşhis sürerken (ör. node donması)
yükseltme yapma — tek değişken kuralı. Her adımdan sonra: `antrea-agent` DaemonSet DESIRED = node sayısı, restart artmıyor,
`antctl get featuregates`/controller logu temiz.

## Yapmayacakların

- Yükseltme, `helm upgrade`, Plan oluşturma/değiştirme, `rke2 certificate rotate`, snapshot silme — hepsi değişiklik; plan yaz, uygulama.
- Betik çıktısı yerine kafadan uyum/EOL/gün sayısı yazma; veride olmayan sürüme "uyumludur" deme.
