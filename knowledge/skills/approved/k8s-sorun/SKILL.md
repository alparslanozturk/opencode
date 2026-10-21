---
name: k8s-sorun
description: Kubernetes ve Rancher üzerinde sorun ararken kullan — pod, deployment, node, namespace, log, event; küme durum özeti deterministik `k8s-ozet.py` ile (NotReady node + süre + lease, sürüm sapması, altyapı/uygulama pod'ları, restart son çıkış sebebi OOM/exit kodu, DaemonSet, olaylar). "kubernetes", "k8s", "rancher", "pod", "kubectl", "deployment", "node", "namespace", "kümede neler oluyor", "notready", "restart", "crashloop", "oom", "durum özeti" isteklerinde tetiklenir. Küme dışı tek makinedeki konteynerler için `podman-docker`.
---

## Önce hangi kümedesin

En pahalı hata yanlış kümede komut çalıştırmaktır. Rancher'da birden çok
downstream küme aynı kubeconfig içinde olur.

```bash
kubectl config current-context
kubectl config get-contexts
```

Bağlamı **doğrulamadan** hiçbir şey yapma. Kullanıcı küme adı söylemediyse
sor; tahmin etme.

Namespace de aynı şekilde: `-n <ad>` vermezsen `default` kullanılır ve
aradığın şey orada olmayabilir. Bilmiyorsan `-A` ile tüm namespace'lere bak.
Bileşenin namespace'ini **tahmin etme** (`kube-system` varsayma): önce bul — `kubectl get ds,deploy,sts -A | grep -i <ad>`.
`No resources found` / `NotFound` alınca aynı namespace'te başka etiketle tekrar deneme, `-A` ile ara (saha G71:
nfs-subdir-external-provisioner ve fluent-bit `kube-system`'de aranıp iki tur boşa gitti).

## Durum özeti — önce `k8s-ozet.py` (kümenin genel hali sorulunca)

"Kümede neler oluyor", "node'lar nasıl", "neden NotReady", "restart'lar ne" sorusunda ham çıktıyı **sen birleştirme** — tek çağrı +
betik (saha G7/G8/G12/G59/G65: kaynaksız "container runtime down", NotReady node'a yüzde, exit 2'yi "OOM" sanmak, DaemonSet ↔ node
sayısı çelişkisi, tam yaml dökümü):

```bash
ssh root@<master> "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes,pods,events,ds,leases -A -o json" | python3 /root/ai/opencode/knowledge/skills/approved/k8s-sorun/k8s-ozet.py -
```

(kubectl yerelde çalışıyorsa `kubectl get … -o json | python3 …/k8s-ozet.py -`.) Basar: Ready olmayan node'lar (koşul reason/mesajı,
**ne kadar süredir**, lease son yenileme, taint), baskı koşulları, **sürüm sapması** (kubelet · OS · çekirdek · runtime grupları);
çalışmayan pod'lar **altyapı / uygulama** ayrı (`--altyapi ns1,ns2` ile ekle), Ready olmayan node'daki pod `(NR)`; en çok yeniden
başlayan konteynerler ve **son çıkış sebebi** (OOMKilled · exit 137 liveness/OOM · exit 143 · exit N = uygulama hatası, OOM değil);
DaemonSet istenen/hazır/güncel; uyarı olayları gruplu (sebep × sayı × son zaman); node olay zaman çizelgesi. Süreler betikte hesaplı.
Raporda bu satırları **aynen** kullan; ayrıntı için aşağıdaki komutlarla **tek nesneye** in (`describe`, `logs --previous`).

## Salt-okunur teşhis

Hiçbiri bir şeyi değiştirmez:

```bash
kubectl get pods -A                      # genel tablo
kubectl get pods -n <ns> -o wide         # hangi node'da
kubectl get deploy,sts,ds -n <ns>
kubectl get nodes -o wide
kubectl describe pod <pod> -n <ns>       # en bilgilendirici tek komut
kubectl logs <pod> -n <ns> --tail=200
kubectl logs <pod> -n <ns> --previous    # çökmeden önceki kap
kubectl events -n <ns>                   # zamana göre sıralı
kubectl top nodes ; kubectl top pods -n <ns>   # metrics-server gerekir
```

Olaylar en çok atlanan ve en çok işe yarayan yerdir; pod açıklanamayan bir
durumdaysa önce oraya bak. `kubectl events` ayrı bir alt komuttur (istemci
v1.36.1'de var), zamana göre sıralar, `--for pod/<ad>` ile daraltılır. Eski
`get events --sort-by=.lastTimestamp` da çalışır ama `events.k8s.io/v1` ile
üretilen olaylarda o alan boş kalıp sıralamayı yanıltabilir.

Log alırken `--tail` **her zaman** ver. Sınırsız log bağlamı doldurur.

## Pod durumlarını okuma

| Durum | Anlamı | Nereye bak |
|---|---|---|
| `CrashLoopBackOff` | Kap başlıyor ve çöküyor | `logs --previous` — çıkış sebebi orada |
| `ImagePullBackOff` / `ErrImagePull` | İmaj çekilemiyor | Registry erişimi, imaj adı, `imagePullSecrets` |
| `Pending` | Zamanlanamıyor | `describe` → Events; kaynak yetmiyor, taint, PVC bağlanmamış |
| `OOMKilled` | Bellek limitini aştı | `describe` → Last State; limit artır ya da sızıntı ara |
| `Evicted` | Node kaynağı bitti | Node'da disk/bellek baskısı |
| `ContainerCreating` uzun sürüyor | Volume ya da ağ | Events; PVC, CNI |
| `Terminating` takıldı | Finalizer ya da graceful shutdown | `describe`; zorlamadan önce sebebi anla |

`Running` görmek yeterli değil — `READY` sütununa bak. `1/2` demek bir kabın
hazır olmadığı demektir; readiness probe başarısız olabilir.

## Rancher'a özgü

- Rancher **projeleri** namespace gruplarıdır; `kubectl` projeyi bilmez,
  namespace ile çalışır.
- Downstream kümeye Rancher proxy'si üzerinden bağlanılır; bağlantı koparsa
  sorun kümede değil Rancher'da olabilir.
- `cattle-system` namespace'i Rancher ajanlarını barındırır
  (`cattle-cluster-agent`, `cattle-node-agent`). Küme "unavailable"
  görünüyorsa bu podların loglarına bak.
- Rancher CLI (`rancher`) kurulumdan kuruluma değişir. Önce `rancher --help`
  çıktısını oku, ezberden komut yazma.
- Anthos (GKE) kümeleri → `anthos-erisim` becerisi (erişim yolu farklı).
- Node/IP hangi kümede, bu Rancher hangi kümeleri yönetiyor, kümenin ingress adları, Rancher sertifikasının CN/SAN'ı →
  `kume-bul` becerisi (`kubectl … -o json | kume-bul.py k8s`; base64/sertifikayı betik çözer).
- Kümeyi bütün olarak incelemek (sürüm matrisi, control plane, node Unavailable, Antrea/OVS, OS) → `rke2-denetim`.
- GPU kümesi / H200 node / vLLM pod'u / NVIDIA GPU Operator denetimi → `rke2-denetim` becerisi.
- Pod yavaş ama CPU kullanımı düşük görünüyorsa: CPU limit kısıtlaması
  (throttling) ve çalıştırma kuyruğu gecikmesi — `rhel-sorun` becerisi,
  "CPU gecikmesi" bölümü (cgroup `cpu.stat`, `runqlat.bt`, `rtla timerlat`).

## Yan etkili komutlar — onaysız çalıştırma

```
kubectl delete ...            kaynağı siler
kubectl drain <node>          node'u boşaltır, podları taşır
kubectl cordon <node>         yeni pod almaz
kubectl scale --replicas=0    servisi durdurur
kubectl apply / patch / edit  yapılandırmayı değiştirir
kubectl rollout restart       tüm podları yeniden başlatır
kubectl exec ... -- <komut>   kap içinde komut çalıştırır
```

`kubectl delete pod` "zararsız" sanılır — deployment onu yeniden oluşturur.
Ama StatefulSet'te veri kaybına, tek replikalı serviste kesintiye yol açar.
Silmeden önce ne tarafından yönetildiğine bak.

Değişiklik istendiğinde önce `--dry-run=server` ile göster:

```bash
kubectl apply -f x.yaml --dry-run=server
kubectl diff -f x.yaml
```

## Konteyner çalışma zamanı

Küme dışı, tek makinedeki konteynerler için `podman-docker` becerisine geç.
RHEL ailesinde varsayılan `podman`'dır; `docker` genelde kurulu değildir.

## Raporlama

Birden çok kümeyi/namespace'i tek özette topluyorsan (M-1, `rapor`
becerisiyle aynı kural): node/master sayısını **kümeye göre ayrı say**, sonra
genel toplamı bunların toplamıyla çapraz kontrol et — "34+18=52" derken
envanterde 75 kayıt varsa bu fark edilmeden geçmemeli. Bellek/CPU
(`kubectl top`, `describe node`) MiB/GiB döndürür; ansible envanterinden ya
da başka bir komuttan gelen sayıyla aynı satırda karşılaştıracaksan birimi
tek biçime çevir, karışık MB/GB yazma.

Pod tablosunu olduğu gibi yapıştırma. Sorunlu olanları ayır:

```
üretim namespace'inde 34 pod, 2 sorunlu

  api-7d9f-x2k    CrashLoopBackOff   12 restart
    logs --previous: "connection refused: postgres:5432"
  worker-5b8-mn4  Pending
    events: "0/6 nodes available: insufficient memory"

diğer 32 pod Running ve Ready
```

Çıkarım yap, sadece durum listeleme. "Neden" sorusuna cevap ver.
