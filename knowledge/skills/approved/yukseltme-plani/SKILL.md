---
name: yukseltme-plani
description: Rancher / RKE2 / Antrea / RHEL yükseltmesini planlarken ve sürümlerin destek durumunu (EOL, bakım sonu, en son yama, matris) denetlerken kullan — deterministik `uyum.py` ile adım adım yol, ön kontroller, geri dönüş; danışman firmanın (Hepapi) yükseltme planını veriyle çapraz kontrol. "yükseltme", "upgrade", "upgrade planı", "hangi sürüme", "eol", "end of life", "destek sonu", "destek bitiyor", "bakım sonu", "en son yama", "patch", "sürüm geride mi", "yol haritası", "hepapi", "danışman planı", "plan doğru mu" isteklerinde tetiklenir. Yalnız okur ve plan yazar; yükseltmeyi uygulamaz.
---

# Yükseltme planı ve sürüm destek durumu

**Kural:** uyum, ömür (EOL) ve sıra kararını **betik verir, sen hesaplama** (saha G65: 84 gün "120 gün" yazıldı). Matris/EOL
verisi `veri/surumler.txt`'de; her satırın kaynağı ve indirme tarihi orada. Veride yoksa "hesaplanamadı (veri yok)" de.

Betik kitin **kaynak deposundan** çalışır (kur.sh kökü; sahada `/root/ai/opencode` — `./kur.sh kontrol` "kok:" satırı).
`~/.config/opencode/skills/` altından çalıştırma: orası ajanın kendi alanı, kilit K6 kapatır. Değişken (`U=…; $U`) kullanma,
tam yolu yaz:

```bash
python3 /root/ai/opencode/knowledge/skills/approved/yukseltme-plani/uyum.py kontrol --rancher v2.14.3 --rke2 v1.33.13+rke2r1 --antrea v2.3.0 --rhel 9.2,9.4,9.8
python3 /root/ai/opencode/knowledge/skills/approved/yukseltme-plani/uyum.py yol --rancher v2.14.3 --rke2 v1.33.13+rke2r1 --antrea v2.3.0 --hedef-rke2 1.35 --hedef-rancher 2.15
python3 /root/ai/opencode/knowledge/skills/approved/yukseltme-plani/uyum.py kontrol --rol upstream --rancher v2.14.3 --rke2 v1.33.13+rke2r1   # Rancher'ın local kümesi
python3 /root/ai/opencode/knowledge/skills/approved/yukseltme-plani/uyum.py veri       # veri hangi tarihte indirildi
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
  yeni bağlantı kurulamaz → node node (Antrea docs versioning.md). Ayrıntı: `rke2-ansible` → "Antrea yükseltme notları".
- **Her ara durum uyumlu olmalı:** Rancher ↔ downstream hattı, Rancher ↔ local (upstream) aralığı, Rancher ↔ RHEL listesi,
  Antrea ↔ K8s. Yeni Rancher eski hattı bırakıyorsa (2.15 → 1.33 yok) önce RKE2, sonra Rancher.
- **Hedef seçimi:** bakım sonu (EOM) yakın bir hatta inme — `kontrol` çıktısında hedef hattın EOM'una bak (ör. 1.35 EOM
  2026-12-28). Ara durak kısa sürecekse sorun değil; son durak için en az bir EOM dönemi kalmalı.

## 3. Ön kontroller (okuma — plandan önce, her adımdan önce)

```bash
# master'da (ssh): etcd snapshot'ı var ve yeni mi (varsayılan 00:00/12:00, node başına 5 adet, yerel diskte)
ls -lt /var/lib/rancher/rke2/server/db/snapshots/ | head -5
for f in /var/lib/rancher/rke2/server/tls/*.crt; do printf '%s ' "$f"; openssl x509 -enddate -noout -in "$f"; done | sort -t= -k2 | head -5
df -h /var/lib/rancher /var/lib/kubelet
# küme:
kubectl get nodes | grep -v ' Ready ' ; kubectl get pods -A | grep -v -e Running -e Completed | head
kubectl get --raw /metrics | grep apiserver_requested_deprecated_apis | grep -v '^#' | head -20   # kaldırılacak API kullanan var mı (removed_release etiketi)
kubectl get pdb -A | awk 'NR==1 || $5=="0"'                      # ALLOWED DISRUPTIONS 0 → drain takılır
kubectl -n cattle-resources-system get backups.resources.cattle.io 2>/dev/null   # Rancher local'de: rancher-backup var mı
```

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

## 7. Veriyi güncelleme (internetli makinede, Doktor)

`veri/surumler.txt` bölümleri ve kaynakları: Rancher matrisi `suse.com/suse-rancher/support-matrix/all-supported-versions/rancher-vX-Y-Z/`
· Rancher/RKE2 ömür `suse.com/lifecycle` · K8s/Rancher son yama, RHEL ana sürüm `endoflife.date/api/{kubernetes,rancher,rhel}.json`
· RKE2 son yama `github.com/rancher/rke2/releases` · Antrea `antrea-uyum.txt` kuralı. Güncelledikten sonra `uyum.py kontrol`'ü
eski çıktıyla karşılaştır; bölüm başlığındaki indirme tarihini değiştir. Veri 3 aydan eskiyse çıktıda bunu söyle.

## Yapmayacakların

- Yükseltme, `helm upgrade`, Plan oluşturma/değiştirme, `rke2 certificate rotate`, snapshot silme — hepsi değişiklik; plan yaz, uygulama.
- Betik çıktısı yerine kafadan uyum/EOL/gün sayısı yazma; veride olmayan sürüme "uyumludur" deme.
