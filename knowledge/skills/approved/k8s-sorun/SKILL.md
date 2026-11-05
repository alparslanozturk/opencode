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

**Kurumda erişim yolu (G122):** her kümeye **kendi 1. master'ından** ssh + `/var/lib/rancher/rke2/bin/kubectl --kubeconfig
/etc/rancher/rke2/rke2.yaml` ile, yalnız okuyan fiillerle (`get`, `describe`, `logs`, `top`, `events`, `auth can-i`). Rancher local
kümesinin node'undan downstream kümeye (`c-xxxxx`) **ulaşmaya çalışma**: `kubectl proxy`, `port-forward`, Rancher `/k8s/clusters/…`
API'si, token/kubeconfig üretmek (Rancher secret'ından kubeconfig çıkarıp `/tmp`'ye yazmak dahil) hedefte iz bırakır (kimliksiz cluster-admin tüneli — 2026-11-03'te Rancher local node'unda oldu).
Kümenin master'ı bilinmiyorsa `kume-bul` ya da kullanıcıya sor.

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
| `Terminating` takıldı | Finalizer, ya da node'da konteyner öldürülemiyor | **Aşağıdaki "Takılı Terminating" bölümü** — force delete'ten önce |

`Running` görmek yeterli değil — `READY` sütununa bak. `1/2` demek bir kabın
hazır olmadığı demektir; readiness probe başarısız olabilir.

## Takılı `Terminating` pod — force delete'ten önce ve sonra (saha 2026-11-05)

Saha: pod 19 saat `Terminating`, olay `FailedKillPod … DeadlineExceeded`. Ajan `kubectl delete pod --force --grace-period=0` ile
sildi → pod Rancher'dan/API'den kayboldu ama **node'da sandbox çalışmaya devam etti**; yeni pod'lar başka node'da startup probe
`connection refused` ile öldürüldü; node reboot edildi (Alp). Ders: force delete node'daki sorunu çözmez, yalnız görünmez yapar.

Kubernetes belgesi (Pod Lifecycle, "Forced Pod termination"): "the API server does not wait for confirmation from the kubelet that
the Pod has been terminated on the node" · "The resource may continue to run on the cluster indefinitely."

**1. Sebebi oku (hepsi okuma):**
```bash
kubectl get pod <pod> -n <ns> -o jsonpath='{.metadata.deletionTimestamp} {.metadata.finalizers} {.spec.nodeName}{"\n"}'
kubectl get events -n <ns> --field-selector involvedObject.name=<pod> --sort-by=.lastTimestamp | tail -15
kubectl get node <node> -o wide
# node'da (ssh, okuma):
C="env CRI_CONFIG_FILE=/var/lib/rancher/rke2/agent/etc/crictl.yaml /var/lib/rancher/rke2/bin/crictl"
$C pods --name <pod>                       # sandbox kimliği, durum (Ready/NotReady)
$C ps -a --pod <sandbox-id>                # içindeki konteynerler
ps -eo pid,stat,wchan:32,etime,cmd | awk '$2 ~ /D/'          # kesintisiz uykuda (D) süreç — kill işlemez
journalctl -k --since -24h --no-pager | grep -i -e "hung task" -e "blocked for more than" -e "nfs: server" | tail -20
findmnt -rn -o TARGET,SOURCE,FSTYPE | grep <pod-uid>         # pod hacimleri; NFS takılıysa → rhel-nfs
```

**2. Karar:**

| Gözlem | Sebep | Yol |
|---|---|---|
| `finalizers` dolu | bir denetleyici bekliyor | finalizer'ı kim ekledi bul; finalizer silmek değişiklik (onay) |
| Node `NotReady` / erişilemez | node gitmiş | node'u düzelt; force delete yalnız node'un **kesin kapalı** olduğu biliniyorsa |
| Node Ready + `FailedKillPod` / `KillPodSandbox … DeadlineExceeded` | node'da süreç öldürülemiyor (D durumu, G/Ç, NFS) ya da containerd takılı (`rke2-denetim` G10) | sorun **node'da**: §3; force delete çözüm değil |

**3. Temizlik — değişiklik, her adım ayrı onay:** `$C stopp <sandbox-id>` → `$C rmp <sandbox-id>`. Süreç D durumundaysa bunlar da
takılır — tek yol node'u boşaltıp yeniden başlatmak: `kubectl cordon <node>` → `kubectl drain <node> --ignore-daemonsets
--delete-emptydir-data` (iş yükü etkisini kullanıcıya söyle) → reboot → `kubectl uncordon <node>`. Önce §1'in kanıtını kaydet
(reboot D sürecini ve logun bir kısmını siler).

**4. Force delete zaten yapıldıysa — hemen node'da bak:** `$C pods --name <pod>` boş değilse **yetim sandbox** var: eski konteyner
hâlâ porta/veriye sahip. RWO PVC: `kubectl get volumeattachment -o wide | grep <pv>` eski node'da kaldıysa yeni pod `Multi-Attach`
ya da `ContainerCreating`'de bekler; RWX/NFS'te iki kopya aynı veriye yazabilir. Kullanıcıya söyle; §3 ile temizle.

**5. Reboot/temizlik sonrası doğrula (bitti demeden):** node `Ready` · `$C pods --name <eski-pod>` boş · volumeattachment eski
node'da değil · yeni pod `Running` ve `READY 1/1`, `RESTARTS` artmıyor · events'te probe hatası yok (birkaç dakika sonra tekrar bak).

**6. Yeni pod "Startup probe failed: connection refused" → Killing** ayrı bir soru: `kubectl logs <yeni> --previous`, `describe`
→ probe tanımı (port, path, `periodSeconds × failureThreshold` = uygulamaya tanınan açılış süresi), uygulama o portu açıyor mu.
Yetim sandbox kilidi/veriyi tutuyorsa yeni pod açılamayabilir — **tahmin**; yetim temizlendikten sonra düzeliyorsa kanıt olur.
Probe süresini artırmak uygulama sahibinin kararı (öneri dili).

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
