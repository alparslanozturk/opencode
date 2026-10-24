---
name: rke2-cis
description: RKE2 kümesini CIS Kubernetes Benchmark'a göre ölçerken ve "hangi maddeler uygulanabilir" kararını hazırlarken kullan — RKE2 sürümü ↔ CIS öz-değerlendirme rehberi, `profile: cis`'in yaptıkları ve kırdıkları (PSA restricted → GPU Operator/Run:ai/Antrea), Rancher Compliance taraması (rancher-compliance, kube-bench), manuel maddeler, audit policy, etcd kullanıcısı. "k8s cis", "kubernetes cis", "rke2 cis", "cis benchmark", "kube-bench", "compliance scan", "rancher compliance", "hardening guide", "profile cis", "psa restricted" isteklerinde tetiklenir. Genel küme güvenlik puan kartı `rke2-guvenlik`; node işletim sistemi CIS'i `rhel-cis`. Yalnız okur; profil/ayar değişikliğini önerir.
---

# RKE2 CIS Kubernetes Benchmark

Kaynak: RKE2 *CIS Hardening Guide* ve *CIS Self-Assessment Guide v1.12* (docs.rke2.io/security, indirme 2026-10-24) · Rancher
*Compliance Scans* (ranchermanager.docs.rancher.com/integrations-in-rancher/compliance-scans) · **(Alp)** kurum · **(genel)** doğrulanmadı.

## 0. Kurum durumu (Alp)

- Kümelerde `profile` **yok** (kurum kararı, `rke2-guvenlik`). Kubernetes CIS önemli; **uygulanabilir maddeler seçilecek** — hepsi
  zorunlu değil. Bu beceri seçimi hazırlar: hangi madde neyi kırar, kanıtı nedir. Karar Alp'in.
- Kümeler canlı: tarama ve okuma serbest; `profile` eklemek, PSA/NetworkPolicy uygulamak değişikliktir (CN + sunucular).

## 1. Hangi rehber? (RKE2 sürümü → CIS sürümü)

| RKE2 | Öz-değerlendirme rehberi | |
|---|---|---|
| v1.35 ve sonrası | CIS v2.0 | docs.rke2.io/security/cis_self_assessment20 |
| v1.33–v1.34 | CIS v1.12 | …/cis_self_assessment112 |
| v1.29–v1.32 | CIS v1.11 | …/cis_self_assessment111 |
| v1.28–v1.31 | CIS v1.10 | …/cis_self_assessment110 |

Sürümü kümeden oku (`get nodes` VERSION). v1.12 rehberinde (RKE2 1.33–1.34, sertleştirilmiş küme): **81 PASS · 45 WARN (manuel) ·
5 Not Applicable**. WARN = CIS'te "Manual" — operatör müdahalesi gerekir, otomatik geçmez. Her maddenin `Audit:` komutu ve
beklenen değeri rehberde yazılı → tek madde kontrolü o komutla (master/worker'da, okuma).

## 2. `profile: cis` ne yapar (Hardening Guide)

RKE2 "hardened by default" — maddelerin çoğu profilsiz de geçer. Profil eklenince RKE2:
1. Ana makine şartlarını denetler, yoksa **açılmaz**: `etcd` kullanıcı/grubu (`useradd -r -c "etcd user" -s /sbin/nologin -M etcd -U`)
   — **`/etc/passwd`/`/etc/group`'ta olmalı; NSS/sssd (IdM) kullanıcısı sayılmaz** · CIS sysctl dosyası (`/usr/share/rke2/rke2-cis-sysctl.conf`
   → `/etc/sysctl.d/60-rke2-cis.conf`; RPM kurulumu) · kubelet `protect-kernel-defaults=true`.
2. etcd'yi `etcd` kullanıcısıyla çalıştırır; ayar/manifest izinlerini 600 yapar.
3. **PSA `restricted`'ı tüm namespace'lerde zorlar** (istisna yalnız `kube-system`, `compliance-operator-system`, `tigera-operator`).
4. `kube-system`, `kube-public`, `default`'a NetworkPolicy koyar (aynı ns içi + DNS/ingress/metrics istisnaları).
5. API sunucusuna audit bayraklarını ekler; **varsayılan politika `level: None`** (`/etc/rancher/rke2/audit-policy.yaml`) — yani
   log yazılmaz; en az `Metadata` gerekir (sonra rke2-server yeniden başlatma).

**Kurum kümesinde kıracakları (önce oku, sonra öner):**
- PSA restricted ↔ ayrıcalıklı iş yükleri: `gpu-operator` (sürücü/toolkit DaemonSet'leri), Run:ai (**belge: Kubernetes'te yalnız
  `privileged` PSA desteklenir**, restricted yalnız OpenShift'te), Antrea (kube-system'de — istisnada), `cattle-*`, EDR/agent DaemonSet'leri,
  vLLM `hostPath: /models` pod'ları. Hangi namespace'te ayrıcalıklı pod var: `rke2-guvenlik` §3 komutu.
- sysctl dosyası: "yalnız yeni kurulumda; çalışan kümede `systemd-sysctl` yeniden başlatmak beklenmedik yan etki yapabilir" (Hardening Guide).
- `ip_forward`: RKE2/CNI ister (kurum kararı) — CIS sysctl dosyasıyla çelişip çelişmediğini dosyadan oku, tahmin etme.

## 3. Ölçüm — iki yol

**a) Rancher Compliance (üreticinin varsayılanı, Rancher 2.12+; kurum Rancher 2.14):** `rancher-compliance` uygulaması (kube-bench +
Sonobuoy), ns `compliance-operator-system`. Rapor Rancher arayüzünde, **CSV ya da XCCDF** indirilir; "Manual" maddeler rapora
girmez. Profiller "RKE2 permissive / hardened" + CIS sürümü — profilsiz kümede **permissive** beklenir (genel). Kurulu mu (okuma):
```bash
kubectl get ns compliance-operator-system; kubectl api-resources | grep -i compliance
kubectl get clusterscans.compliance.cattle.io; kubectl get clusterscanprofiles.compliance.cattle.io
```
Uygulamayı kurmak, ClusterScan oluşturmak değişikliktir (Rancher Apps — Alp'e öner). Rapor CSV'si gelirse sütunlar: `id, description,
remediation, state, node_type, audit, …` → `rapor` becerisi `tablo-cevir.py` ile; değerleri elle yazma.

**b) Rehberin `Audit:` komutlarıyla tek tek (okuma):** örnekler (v1.12):
```bash
stat -c permissions=%a /var/lib/rancher/rke2/agent/pod-manifests/kube-apiserver.yaml        # 1.1.1 → 600
stat -c %U:%G /var/lib/rancher/rke2/server/db/etcd                                             # 1.1.12 → etcd:etcd (profilsiz kümede root — beklenen)
grep -E "^(profile|protect-kernel-defaults|kube-apiserver-arg|audit-policy-file)" /etc/rancher/rke2/config.yaml
grep -c "level: None" /etc/rancher/rke2/audit-policy.yaml 2>/dev/null                           # audit yazılıyor mu
kubectl get sa default -A -o jsonpath='{range .items[*]}{.metadata.namespace}{"\t"}{.automountServiceAccountToken}{"\n"}{end}'   # 5.1.5
```
Sonucu madde no + komut + değer ile yaz; rehberdeki "Returned Value" ile karşılaştır.

## 4. Manuel maddeler (WARN) — kanıt nerede

5.1.x RBAC (cluster-admin, secret erişimi, wildcard, pod create, system:masters, bind/impersonate/escalate…) → `rke2-guvenlik` §3
komutları · 5.2.x pod güvenliği (PSA etiketi, privileged/hostPath/hostNetwork) → aynı · 5.3 NetworkPolicy sayısı · 4.2.x kubelet
bayrakları → `ps -ef | grep kubelet` · 1.2.x audit log → §2.5. Her maddede "uygulanabilir mi" sütununu **Alp doldurur**; sen
kanıtı ve kırılma riskini (§2) yaz.

## 5. Uygulanabilirlik tablosu (Alp'e sunulacak biçim)

```
CIS <sürüm> · küme <ad> · <tarih> · yalnız okuma
madde | durum (PASS/FAIL/WARN, kanıt) | uygularsa ne kırılır (§2) | öneri
```
`profile: cis` tek seferde PSA + NetworkPolicy + etcd kullanıcısı getirir; maddeleri tek tek almak istenirse (ör. yalnız audit policy +
default SA + dosya izinleri) bunu ayrı satırlarda göster.

## Yapmayacakların

- `profile: cis` eklemek, PSA/NetworkPolicy uygulamak, `systemd-sysctl` yeniden başlatmak, `kubectl patch sa default …` — değişiklik.
- Rancher Compliance raporundaki "Not Applicable"ı FAIL sayma; "Manual"ı "uygulanmamış" diye yazma.
