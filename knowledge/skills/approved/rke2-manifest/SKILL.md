---
name: rke2-manifest
description: Kümeye git'teki manifesti uygularken ya da küme ile git'i karşılaştırırken kullan — kurum "elle GitOps": her kümenin manifestleri (StorageClass, optic izleme, twistlock, commvault …) Azure DevOps kubernetes deposunda `rancher/<adres>/<küme>/`; otomatik senkron yok. Sıra: pull → hedef küme → `kubectl diff` (salt-okunur) → CN ile `apply` → doğrulama + uygulanan commit. "manifest uygula", "gitten yükle", "kümeye yükle", "optic", "twistlock", "storage class", "storageclass", "commvault", "yeni kümeye standart bileşenler", "git ile küme aynı mı", "drift", "kayma", "bu kümenin manifestlerini şu kümeye uyarla", "özelleştir", "yeni kümeye kopyala" isteklerinde tetiklenir. Depo/klon/kimlik `git`, küme bulma `kume-bul`.
---

# Git'teki manifesti kümeye uygulama — elle GitOps

Alp (2026-10-26): "Her küme için gerekli manifestler — storage class, optic ya da twistlock — git'te dursun, oradan alıp yükleyeyim.
Bir nevi GitOps ama otomatik değil (Anthos Config Management gibi değil)."

## 0. Depo düzeni (kubernetes deposu, sahada görülen — G109/G110)

```
rancher/
  <rancher-ya-da-platform-adresi>/     ör. rancher-dtx.<alan>, rke-nonprod.<alan>, rke-prod.<alan>
    <küme>/                            ör. local (Rancher'ın kendi kümesi), test, production, third-party-prod
      optic.yaml  twistlock-<küme>.yaml  <ad>-sa.yaml  nfs-<…>.yaml …
      <ad>.md                          o manifestin notu (kurulum, önkoşul) — uygulamadan ÖNCE oku
    optic.yaml                         platform düzeyinde (küme klasörü dışında) dosya da olabilir
ENVANTER.md  KT-CA.md  NOTLAR.md …     doküman
```

Klasör adından küme/ortam **türetme** — README/`.md` notu ve `kume-bul` ne diyorsa o. Bilinmeyen eşleme `[SAHA]`, kullanıcıya sor.
Otomatik senkron **yok** → kümede elle yapılmış değişiklik ve git'te uygulanmamış commit olağandır; her uygulamadan önce `diff`.

## 1. Sıra

1. **Güncel ve temiz depo:** `git -C git/kubernetes pull --ff-only` · `git -C git/kubernetes status --short` boş olmalı. Commit
   edilmemiş dosyadan **uygulama** — önce kullanıcı commit'lesin (git'te olmayan, kümede olur → izi kalmaz).
2. **Hedef küme:** dosyanın klasörü → küme; master/kubeconfig `kume-bul` (§1/§2). Yanlış kümeye uygulamak bu işin en büyük riski:
   komutta küme açıkça görünsün (`--context <ad>` ya da `ssh root@<o kümenin master'ı>`), "şu anki context" varsayılmaz.
   `kubectl config current-context` / master hostname'ini kullanıcıya göster.
3. **Notu oku:** aynı klasördeki `<ad>.md` / README — önkoşul (namespace, secret, CRD, sıra) varsa önce o.
4. **Fark (salt-okunur, kilit serbest):**
   ```bash
   kubectl --context <küme> diff -f git/kubernetes/rancher/<adres>/<küme>/<dosya>.yaml
   ssh root@<master> "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml diff -f -" < git/kubernetes/rancher/<adres>/<küme>/<dosya>.yaml
   ```
   Çıkış: **0** fark yok · **1** fark var (çıktı = kümede değişecek alanlar) · **>1** hata (CRD yok, namespace yok, yetki). Diff'i
   kullanıcıya özetle: hangi kaynak oluşur / değişir; kümede olup dosyada olmayan alan (elle değişiklik) **ezilecek** mi.
   Yalnız şema/doğrulama: `kubectl apply --dry-run=server -f …` (o da serbest).
5. **Uygula (K1 — CN + küme master'ı/sunucu listesi kullanıcının mesajında):** aynı komut `apply -f`. Çok dosya → tek tek, sırayla
   (CRD/namespace önce); `-f <dizin>` ile toplu uygulama yalnız kullanıcı açıkça isterse.
6. **Doğrula:** `kubectl get <tür> <ad> -n <ns>`, DaemonSet/Deployment ise `rollout status --timeout=120s`; pod hatası → `k8s-sorun`.
7. **Rapor:** küme · dosya · uygulanan commit `git -C git/kubernetes log -1 --format='%h %ad %an' --date=short -- <dosya>` ·
   diff özeti · sonuç. ("Hangi sürüm kümede?" sorusunun tek kaydı budur — otomatik GitOps yok.)

## 2. Git ile küme aynı mı? (kayma taraması, salt-okunur)

```bash
for f in git/kubernetes/rancher/<adres>/<küme>/*.yaml; do
  echo "#DOSYA $f"; kubectl --context <küme> diff -f "$f" > /dev/null 2>&1; echo "#CIKIS $?"
done
```

Tablo: dosya · 0 aynı / 1 fark / >1 hata. Fark olanın ayrıntısı ayrı `diff` ile. Hangisinin doğru olduğuna kullanıcı karar verir:
kümedeki elle değişiklik doğruysa **önce git'e işlenir** (`git` §4), sonra gerekirse uygulanır; git doğruysa §1.5.

## 2b. Yeni kümeye uyarlama — yöntem A: kopyala + değiştir (Alp, 2026-10-26)

Alp: "önce bir kümenin bütün gerekli manifestlerini kuracağım, sonra 'bu kümenin manifestlerini şu kümeye özelleştir' diyeceğim —
cluster name, isimler, parametreler değişecek." Klasör kopyalanır, düz YAML kalır (Kustomize değil — Alp seçimi). Betik:
`python3 /root/ai/opencode/knowledge/skills/approved/rke2-manifest/manifest-uyarla.py` (aşağıda **`MU`**).

1. **Neyin değişeceğini bul — tahmin etme, depodan çıkar:**
   `MU parametre git/kubernetes/rancher/<adres>/<kaynak-küme> git/kubernetes/rancher/<adres>/<başka-küme>` → aynı adlı dosyalarda
   kümeler arasında **farklı olan** alanlar (ör. `DaemonSet/optic-agent … env[CLUSTER_NAME].value  test=test · production=production`)
   + "değiştirme adayı" listesi. Tek küme varsa: dosyalarda küme adı, Rancher adresi, IP, namespace, NFS sunucusu geçen satırları göster.
   Hedef değerleri (yeni küme adı, adresi …) **kullanıcı** verir ya da `kume-bul`'dan gelir — uydurma.
2. **Kuru plan:** `MU kopyala <kaynak-klasör> git/kubernetes/rancher/<adres>/<yeni-küme> --degis <eski>=<yeni> [--degis …]` →
   değişecek her satır (`- eski` / `+ yeni`), atlanan sır dosyaları, kaynakta hiç geçmeyen `--degis` (yazım?). Değişim **bütün kelime**:
   `test` → `latest` içinde değişmez; `test-nfs` gibi birleşik adlar değişmez, sonda **KALAN** olarak listelenir — her birini kullanıcıya sor.
   Planı kullanıcıya göster, onay al.
3. **Yaz:** aynı komut `--yaz` → dosyalar yazılır, YAML ayrıştırılır (bozulan söylenir), hedefte kaynaktan **kalan** değerler listelenir
   (çıkış 1). Var olan hedef dosyanın üzerine yazmaz. Kalanları ya yeni `--degis` ile (yeni klasöre) ya da tek tek düzelt.
4. **Sır dosyaları** (`kind: Secret`, özel anahtar, `*.key/.pfx`, `pass*`) varsayılan **kopyalanmaz** — kümeye özeldir (twistlock/defender
   sertifikası konsoldan küme için üretilir). Yeni kümede kullanıcı üretir/verir; `--sirlar-dahil` yalnız kullanıcı açıkça isterse.
5. **Git'e işle** (`git` §4: yalnız yeni klasör, `add` tek tek) → **kümeye uygula** §1 (diff → CN ile apply → doğrula).
   Sıra: önce git, sonra küme — kümede olup git'te olmayan manifest bırakma.

## 3. Yapma

- Kümedeki kaynağı `kubectl get -o yaml` ile alıp depoya **olduğu gibi** yazma (status, uid, resourceVersion, managedFields gelir);
  depoya giden manifest elle sadeleştirilir — kullanıcıyla.
- `kubectl delete -f`, `replace --force`, `apply --prune` — kaynak siler (K5/K1); yalnız kullanıcı açıkça isterse, önce `diff`.
- Depodaki parola/anahtar dosyaları (`pass.txt`, `certs/*.key|.pfx`, Secret manifesti): okuma serbest, başka dosyaya/rapora/sohbete
  **kopyalama**; Secret uygularken diff çıktısını kullanıcıya aynen basma — yalnız "Secret <ad> değişecek" de.
- Başka kümenin klasöründeki dosyayı "aynısı" diye bu kümeye uygulama (twistlock/optic dosyaları küme adına özel olabilir) — farkı göster, sor.
