---
name: k8s-anthos
description: Anthos (GKE on-prem) kümeleriyle ilgili soru ve incelemelerde kullan — erişim yolu (jumpbox → admin workstation → admin/user cluster kubeconfig) ve kubectl ile salt-okunur teşhis. "anthos", "gke", "admin cluster", "user cluster", "admin workstation", "anthosjb", "jumpbox" isteklerinde tetiklenir. Rancher/RKE2 kümeleri için `k8s-rancher` ve `kume-denetim`.
---

## Ortam (Alp, 2026-10-16)

- Anthos kümeleri **GKE** (on-prem); Rancher arayüzünde de görünürler.
- Erişim zinciri: **jumpbox → ssh ile admin workstation** → orada admin ve user cluster yapılandırmaları ve
  kubeconfig dosyaları.
  - Prod: `stpanthosjb` · Alt ortamlar: `stlanthosjb` · DRC (Ankara): `dplanthosjb`
- **Şimdilik ajan bu zinciri atlayamaz** (jumpbox üzerinden çoklu ssh yok) ve kubeconfig dosyaları verilmedi.
  Bu yüzden: Anthos kümesine kendin bağlanmaya çalışma, jumpbox'a ssh kurma, kubeconfig arama.

## Ne yapabilirsin

- Kullanıcı bir kubeconfig yolu verirse ya da komut çıktısını yapıştırırsa: yalnız **okuyan** kubectl komutları
  (`get`, `describe`, `logs --tail`, `events`, `top`) — her komutta `--kubeconfig <verilen-yol>` ve önce
  `kubectl config current-context` ile hangi kümede olduğunu doğrula (admin cluster mı user cluster mı — ikisini karıştırma).
- Genel Kubernetes teşhisi (pod durumları, CrashLoopBackOff, Pending, OOMKilled, events, yan etkili komut listesi):
  **`k8s-rancher`** becerisindeki "Salt-okunur teşhis", "Pod durumlarını okuma" ve "Yan etkili komutlar" bölümleri
  Anthos için de geçerlidir (Rancher'a özgü kısım hariç).
- Kullanıcı jumpbox/workstation'da komutu kendisi çalıştıracaksa: tam komutu ver, çıktıyı iste, sonra yorumla.

## Bilinmeyenler — sor, tahmin etme

Admin workstation adları, kubeconfig dosya yolları, küme adları ve sürümleri, GKE on-prem sürümü: `[SAHA]`.
Anthos'un RKE2 sürüm matrisi (`rke2-ansible`) ile ilgisi yoktur — o matrisi Anthos için kullanma.
