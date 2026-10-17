---
name: guvenlik-saglik
description: RKE2/Rancher kümesinin ve RHEL node'larının güvenlik sağlığını yalnız okuyarak denetleyip puan kartı çıkarırken kullan — sürüm destek durumu (EOL, yama), etcd yedeği, secrets şifreleme, sertifika, audit, RBAC (cluster-admin), privileged/hostPath/hostNetwork pod, PSA, açık servis (NodePort/LB), NetworkPolicy, imaj kaynağı, Rancher admin/token/yedek; RHEL bekleyen güvenlik yaması, çalışan↔kurulu çekirdek, reboot gereksinimi, ara sürüm kilidi, ssh, auditd, chrony. "güvenlik sağlığı", "güvenlik kontrolü", "güvenlik taraması", "security check", "hardening", "sıkılaştırma", "denetim öncesi", "zafiyet", "yama durumu", "cluster-admin kim", "rbac", "secret şifreli mi", "etcd yedeği var mı", "token süresi", "danışman güvenlik raporu" isteklerinde tetiklenir. Yalnız okur; düzeltmeyi önerir, uygulamaz.
---

# Güvenlik sağlığı — küme + Rancher + RHEL puan kartı

**İlkeler:** yalnız okuma (canlı ortam). Her satır bu turdaki bir çıktıdan; çıktı yoksa "ölçülmedi". Kurum kararlarını
(aşağıda) risk diye yazma, "kurum kararı" diye bilgi satırı yap. Çok node → `ansible <grup> -m shell -a '…' -o` (tek izin;
`filo-durum-kontrolu`). Uzun çıktıyı `head`/`wc -l` ile sınırla — bağlamı koru.

**Kurum kararları (Alp, 2026-09-29 — bulgu değil):** SELinux kapalı · firewalld kapalı · Kubernetes CIS profili yok
(`profile` yok) · `net.ipv4.ip_forward=1` · işletim sistemine CIS Level 1 Satellite/OpenSCAP ile uygulanıyor · `/tmp` noexec.
**CIS (Alp, 2026-10-17):** RHEL 10 şablonunda Satellite'tan SCAP ile **CIS Level 1** uygulanıyor (SELinux ve firewall kapsam dışı,
politikaların çoğu uygulanmış); Kubernetes ve VMware CIS benchmark'ları da önemli ama kurumda **uygulanabilecek olanlar seçilecek**
(hepsi zorunlu değil). Puan kartında CIS maddesini "uygulanmadı" diye bulgu yazma — kurumun seçtiği profil belli olana kadar
"CIS: kurum profili [SAHA]" bilgi satırı. RHEL şablonları/SCAP profilleri yakında paylaşılacak.
Okuma kısıtı yok (kapalı sistem): sır dosyası okunabilir ama **değerini ekrana basma** (anahtar/token içeriği yerine var/yok, sayı).

Erişim kalıbı (`kume-denetim` §0): `K="/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml"` bir
master'da; aşağıda `kubectl` = bu.

## 1. Sürüm ve destek durumu (en yüksek ağırlık — EOL = güvenlik yaması yok)

Sürümleri `yukseltme-plani` §1 ile topla, sonra betik (kafadan hesaplama):
```bash
python3 /root/ai/opencode/knowledge/skills/approved/yukseltme-plani/uyum.py kontrol --rancher <r> --rke2 <k> --antrea <a> --rhel <liste>
```
❌ satırları (EOL geçmiş/matris dışı) puan kartında **kritik**. Antrea ↔ K8s satırı zorunlu.

## 2. Control plane ve veri koruma (master'da, ssh)

```bash
ls -lt /var/lib/rancher/rke2/server/db/snapshots/ | head -5            # son snapshot ne zaman (varsayılan 00:00/12:00, 5 adet)
grep -E "^(secrets-encryption|etcd-s3|etcd-snapshot|audit-policy-file|profile|kube-apiserver-arg)" /etc/rancher/rke2/config.yaml
ls -l /var/lib/rancher/rke2/server/cred/encryption-config.json
grep -o "aescbc\|secretbox\|aesgcm\|identity" /var/lib/rancher/rke2/server/cred/encryption-config.json | head -3   # ilk sağlayıcı = yazma
for f in /var/lib/rancher/rke2/server/tls/*.crt; do printf '%s ' "$f"; openssl x509 -enddate -noout -in "$f"; done | sort -t= -k2 | head -5
ls -l /var/lib/rancher/rke2/server/logs/                                 # audit.log var mı, boyutu/zamanı
ps -ef | grep -o -- "--anonymous-auth=[a-z]*" | sort | uniq -c           # apiserver/kubelet anonim erişim
```
Değerlendirme:
- Snapshot son 24 saatte yoksa ❌; yalnız master diskinde (S3/dış kopya yok) ⚠️ — VM/datastore kaybında yedek de gider.
- Şifreleme dosyası yok ya da ilk sağlayıcı `identity` → secrets etcd'de düz metin ❌.
- Sertifika < 30 gün ❌; 120 gün içinde ⚠️ bilgi (RKE2 yeniden başlatmada kendisi yeniler — `yukseltme-plani` §3).
- audit.log yok ya da boş ⚠️ (kim ne yaptı izlenemez); `--anonymous-auth=true` ⚠️.
- Doğrudan araç da serbest (saha G67): `/var/lib/rancher/rke2/bin/rke2 certificate check --output table`, `rke2 secrets-encrypt status`,
  `rke2 etcd-snapshot list` — çıktısı daha net; `rotate`/`save`/`prune` değişikliktir (K1).

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
- Uygulama namespace'inde privileged / hostNetwork / hostPath pod ⚠️ (GPU vLLM `hostPath: /models` bilinen istisna — `kume-denetim` B).
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
⚠️; `rancher-backup` yok ❌ (Rancher yükseltmesi geri dönüşsüz — `yukseltme-plani` §3). Ayar adı/alan sürüme göre farklıysa
(boş dönerse) `-o yaml | head -40` ile bak, uydurma.

## 5. RHEL node'ları (ansible ad-hoc, tüm küme grubu)

```bash
ansible <grup> -m shell -a 'uname -r; rpm -q --last kernel | head -1; uptime -p; subscription-manager release --show; dnf -q updateinfo list --security 2>/dev/null | wc -l' -o
ansible <grup> -m shell -a 'needs-restarting -r 2>/dev/null | tail -1; systemctl is-active auditd chronyd; chronyc tracking | grep -E "Leap|System time"' -o
ansible <grup> -m shell -a 'grep -hEi "^\s*(PermitRootLogin|PasswordAuthentication|MaxAuthTries|X11Forwarding)" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null' -o
```
Değerlendirme:
- Çalışan çekirdek ≠ en son kurulu çekirdek → yama alınmış ama **etkin değil**, reboot gerek ⚠️ (saha: mas01 229 gün açık).
- Bekleyen güvenlik errata sayısı > 0 ⚠️ (kritik/önemli ayrımı: `dnf updateinfo list --security` satırlarındaki önem).
  Satellite içerik görünümü (CV) eski tarihteyse "en son" = CV tarihi — `sistem-guncelleme` becerisi.
- `release --show` bir ara sürüme kilitliyse (ör. 9.4) ve uzatılmış abonelik yoksa o sürüm yama almıyor olabilir ⚠️ (`uyum.py` RHEL satırı).
- Etkin değer için `sshd -T | grep -Ei "^(permitrootlogin|passwordauthentication|maxauthtries|x11forwarding)"` (test kipi, serbest —
  saha G67); dosya okuması `sshd_config.d` sırasını göstermez.
- auditd/chronyd aktif değil ⚠️; saat senkron değil ⚠️ (sertifika/etcd için kritik).

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
EOL iddiaları için `uyum.py`; yükseltme planı için `yukseltme-plani` §5.

## Yapmayacakların

- Düzeltme uygulama: RBAC değiştirme, token silme, sertifika rotasyonu, `dnf update`, reboot, ayar dosyası düzenleme.
- Sır değerini (token, anahtar, encryption-config içeriği) ekrana basma; var/yok ve sayı yeter.
