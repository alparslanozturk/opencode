---
name: rke2-guvenlik
description: RKE2/Rancher kümesinin güvenlik sağlığını yalnız okuyarak denetleyip puan kartı çıkarırken kullan — sürüm destek durumu (EOL, yama, Antrea matrisi), etcd yedeği, secrets şifreleme, sertifika, audit log, anonim erişim, RBAC (cluster-admin), privileged/hostPath/hostNetwork pod, PSA, açık servis (NodePort/LB), NetworkPolicy, imaj kaynağı, Rancher admin/token/yedek. "küme güvenliği", "k8s güvenlik", "güvenlik sağlığı", "güvenlik kontrolü", "hardening", "cluster-admin kim", "rbac", "secret şifreli mi", "etcd yedeği var mı", "token süresi", "rancher güvenlik", "danışman güvenlik raporu" isteklerinde tetiklenir. Node işletim sistemi tarafı: `rhel-guvenlik`. Yalnız okur; düzeltmeyi önerir, uygulamaz.
---

# Kubernetes güvenlik sağlığı — küme + Rancher puan kartı

**İlkeler:** yalnız okuma (canlı ortam). Her satır bu turdaki bir çıktıdan; çıktı yoksa "ölçülmedi". Kurum kararlarını
(aşağıda) risk diye yazma, "kurum kararı" diye bilgi satırı yap. Çok node → `ansible <grup> -m shell -a '…' -o` (tek izin;
`filo-kontrol`). Uzun çıktıyı `head`/`wc -l` ile sınırla — bağlamı koru.

**Kurum kararları (Alp, 2026-09-29 — bulgu değil):** SELinux kapalı · firewalld kapalı · Kubernetes CIS profili yok
(`profile` yok) · `net.ipv4.ip_forward=1` · işletim sistemine CIS Level 1 Satellite/OpenSCAP ile uygulanıyor · `/tmp` noexec.
**CIS (Alp, 2026-10-17):** RHEL 10 şablonunda Satellite'tan SCAP ile **CIS Level 1** uygulanıyor (SELinux ve firewall kapsam dışı,
politikaların çoğu uygulanmış); Kubernetes ve VMware CIS benchmark'ları da önemli ama kurumda **uygulanabilecek olanlar seçilecek**
(hepsi zorunlu değil). Puan kartında CIS maddesini "uygulanmadı" diye bulgu yazma — kurumun seçtiği profil belli olana kadar
"CIS: kurum profili [SAHA]" bilgi satırı. **Kubernetes CIS ölçümü ve "uygulanabilir madde" hazırlığı → `rke2-cis`; node CIS → `rhel-cis`.**
Okuma kısıtı yok (kapalı sistem): sır dosyası okunabilir ama **değerini ekrana basma** (anahtar/token içeriği yerine var/yok, sayı).

Erişim kalıbı (`rke2-denetim` §0): `K="/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml"` bir
master'da; aşağıda `kubectl` = bu.

## 1. Sürüm ve destek durumu (en yüksek ağırlık — EOL = güvenlik yaması yok)

Sürümleri `rke2-yukseltme` §1 ile topla, sonra betik (kafadan hesaplama):
```bash
python3 /root/ai/opencode/knowledge/skills/approved/surum-uyum/uyum.py kontrol --rancher <r> --rke2 <k> --antrea <a> --rhel <liste>
```
❌ satırları (EOL geçmiş / üreticinin destek listesi dışı) puan kartında **kritik**; ⚠️ "garanti dışı — olabilir" satırları kritik
**değil**, "destek kapsamı" başlığında kaynağıyla yazılır (`surum-uyum` §"Kanıt zorunluluğu", G77). Antrea ↔ K8s satırı zorunlu.

## 2. Control plane ve veri koruma (master'da, ssh)

```bash
ls -lt /var/lib/rancher/rke2/server/db/snapshots/ | head -5            # son snapshot ne zaman (varsayılan 00:00/12:00, 5 adet)
grep -E "^(secrets-encryption|etcd-s3|etcd-snapshot|audit-policy-file|profile|kube-apiserver-arg)" /etc/rancher/rke2/config.yaml
ls -l /var/lib/rancher/rke2/server/cred/encryption-config.json
grep -o "aescbc\|secretbox\|aesgcm\|identity" /var/lib/rancher/rke2/server/cred/encryption-config.json | head -3   # ilk sağlayıcı = yazma
ls -l /var/lib/rancher/rke2/server/logs/                                 # audit.log var mı, boyutu/zamanı
ps -ef | grep -o -E -- "--anonymous-auth=[a-z]+" | sort | uniq -c       # apiserver/kubelet anonim erişim ([a-z]* grep'in kendi satırını da sayıyordu)
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

Değerlendirme:
- Snapshot son 24 saatte yoksa ❌; yalnız master diskinde (S3/dış kopya yok) ⚠️ — VM/datastore kaybında yedek de gider.
- Şifreleme dosyası yok ya da ilk sağlayıcı `identity` → secrets etcd'de düz metin ❌.
- Sertifika (ayrı komut — yerelde çalışan betik, ssh borunun başında):
  `ssh root@<master> 'cd /var/lib/rancher/rke2/server/tls && for f in *.crt */*.crt; do [ -f "$f" ] && { echo "#DOSYA $f"; base64 -w0 "$f"; echo; }; done' | python3 /root/ai/opencode/knowledge/skills/approved/rancher-sertifika/sertifika-kontrol.py - --ozet` → sertifika başına tek satır,
  **kalan güne göre sıralı, gün betikte hesaplı** (eski `sort -t= -k2` ay adına göre alfabetik sıralıyordu — en yakın bitişi göstermez).
  < 30 gün ❌; 120 gün içinde ⚠️ bilgi (RKE2 yeniden başlatmada kendisi yeniler — `rke2-yukseltme` §3).
- audit.log yok ya da boş ⚠️ (kim ne yaptı izlenemez); `--anonymous-auth=true` ⚠️.
- Doğrudan araç da serbest (saha G67): `/var/lib/rancher/rke2/bin/rke2 certificate check --output table`, `rke2 secrets-encrypt status`,
  `rke2 etcd-snapshot list` — çıktısı daha net; `rotate`/`save`/`prune` değişikliktir (onay ekranı).

## 3. Yetki ve iş yükü (kubectl)

```bash
kubectl get clusterrolebindings -o jsonpath='{range .items[?(@.roleRef.name=="cluster-admin")]}{.metadata.name}{"\t"}{.subjects[*].kind}:{.subjects[*].name}{"\n"}{end}'
kubectl get ns -L pod-security.kubernetes.io/enforce                      # PSA etiketi olmayan uygulama namespace'leri
kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name} hostNetwork={.spec.hostNetwork} priv={.spec.containers[*].securityContext.privileged} hostPath={.spec.volumes[*].hostPath.path}{"\n"}{end}' | grep -E "=true|hostPath=/" | grep -v -E "^(kube-system|cattle-|calico-|antrea|gpu-operator)" | head -30
kubectl get svc -A --no-headers | grep -E "NodePort|LoadBalancer"           # küme dışına açık servisler
kubectl get networkpolicy -A --no-headers | wc -l; kubectl get acnp,anp -A --no-headers 2>/dev/null | wc -l   # K8s + Antrea-native
kubectl get pods -A -o jsonpath='{..image}' | tr " " "\n" | sort | uniq -c | sort -rn | head -20   # imaj kaynağı (kurum aynası mı)
```
Değerlendirme:
- cluster-admin'e bağlı **kullanıcı/grup/ServiceAccount** listesi — sistem bileşenleri (`system:`, `rke2-`, Rancher'ın `cattle-*`)
  dışındakiler ⚠️, sahibi sorulmalı.
- Uygulama namespace'inde privileged / hostNetwork / hostPath pod ⚠️ (GPU vLLM `hostPath: /models` bilinen istisna — `rke2-gpu`).
- NetworkPolicy sayısı 0 → namespace'ler arası trafik serbest ⚠️ (karar Alp'in; bilgi olarak yaz).
- `docker.io`/genel registry'den çekilen imaj ⚠️ (air-gap kurumunda ayna dışı kaynak).

## 4. Rancher (Rancher'ın local kümesinde)

```bash
kubectl -n cattle-system get deploy rancher -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl get authconfigs.management.cattle.io -o jsonpath='{range .items[?(@.enabled==true)]}{.metadata.name}{"\n"}{end}'
kubectl get globalrolebindings.management.cattle.io -o jsonpath='{range .items[?(@.globalRoleName=="admin")]}{.userName}{" "}{.groupPrincipalName}{"\n"}{end}'
kubectl get settings.management.cattle.io auth-token-max-ttl-minutes kubeconfig-default-token-ttl-minutes -o custom-columns=AD:.metadata.name,DEGER:.value,VARSAYILAN:.default
kubectl get tokens.management.cattle.io --no-headers 2>/dev/null | wc -l
kubectl -n cattle-resources-system get backups.resources.cattle.io 2>/dev/null; kubectl get crd | grep -c resources.cattle.io
```
Değerlendirme: yalnız `local` kimlik doğrulaması (AD/LDAP yok) ⚠️; Rancher admin sayısı ve kimler; token TTL `0` (süresiz)
⚠️; `rancher-backup` yok ❌ (Rancher yükseltmesi geri dönüşsüz — `rke2-yukseltme` §3). Ayar adı/alan sürüme göre farklıysa
(boş dönerse) `-o yaml | head -40` ile bak, uydurma.

## 5. RHEL node'ları → `rhel-guvenlik`

Küme node'larının işletim sistemi tarafı (bekleyen güvenlik yaması, çalışan↔kurulu çekirdek, ara sürüm kilidi, ssh, auditd,
chrony, CIS/SCAP) **`rhel-guvenlik`** becerisinde; puan kartına onun bulgularını da ekle (aynı biçim).

## 6. Puan kartı (ekrana, kısa — telefondan okunur)

```
Güvenlik sağlığı · küme <ad> · <tarih> · yalnız okuma
❌ Kritik: … (kanıt: komut/çıktı satırı)
⚠️ Önemli: …
ℹ️ Kurum kararı: SELinux/firewalld kapalı, K8s CIS profili yok
✅ İyi: …
Ölçülmedi: … (neden)
Öneri (uygulanmadı, önceliğe göre, en hafiften): …
```
Kritik sırası: EOL/matris dışı → yedek yok → secrets şifresiz → süresi geçen sertifika → reboot bekleyen güvenlik yaması → RBAC.

## 7. Danışman güvenlik/yükseltme raporu çapraz kontrolü

Rapordaki her iddiayı bu bölümlerin komutlarıyla sına: "doğrulandı / çelişiyor (bizim çıktı: …) / ölçülemedi". Sürüm ve
EOL iddiaları için `uyum.py`; yükseltme planı için `rke2-yukseltme` §5.

## Yapmayacakların

- Düzeltme uygulama: RBAC değiştirme, token silme, sertifika rotasyonu, `dnf update`, reboot, ayar dosyası düzenleme.
- Sır değerini (token, anahtar, encryption-config içeriği) ekrana basma; var/yok ve sayı yeter.
