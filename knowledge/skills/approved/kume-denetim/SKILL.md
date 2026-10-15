---
name: kume-denetim
description: Rancher'ın yönettiği bir RKE2 kümesini uçtan uca incelerken kullan — sürüm/uyumluluk matrisi, control plane (etcd, apiserver), node'ların NotReady/Unavailable olması, Antrea/OVS, sistem pod'ları, node işletim sistemi ve çekirdek. "kümeyi incele", "kümede neler oluyor", "node unavailable", "notready", "node düşüyor", "rke2 incele", "rancher kümesi", "antrea", "ovs", "etcd", "control plane", "kube-system", "uyumlu mu", "matris", "kernel", "çekirdek" isteklerinde tetiklenir. Yalnız okur; değişiklik önerir, uygulamaz. GPU kümesi için ayrıca `gpu-kume-denetim`.
---

Doğrulama: Doktor'un makinesinde küme yok — komutlar sahada ilk kullanımda doğrulanacak; emin olmadığın bayrakta
`--help`. Kaynak etiketi: **(Alp)** kurum bilgisi · **(saha G…)** saha gözlemi · **(genel)** Kubernetes/RKE2 genel
bilgisi — "(genel)" maddeyi öneri olarak yaz, kural olarak değil.

## İlkeler (önce oku)

- **Canlı ortam — yalnız okuma** (Alp, 2026-10-14). Reboot, pod/servis yeniden başlatma, drain/cordon, `kubectl exec`,
  event silme yok. Gerekirse **öneri** yaz, en hafif adımdan başlayarak (saha G11: "fiziksel reboot" daha hafif
  adımlar düşünülmeden önerildi).
- **Önce altyapı, sonra uygulama** (Alp, saha G9): altyapı = rke2-server/agent, kubelet, containerd, etcd, apiserver,
  **Antrea/OVS**, CoreDNS, ingress, Rancher ajanları (`cattle-*`), node işletim sistemi/disk/ağ. Uygulama pod'ları
  (milvus, kafka, fluent, prometheus, starburst …) ayrı başlık — Alp ayrıca istemedikçe derine inme.
- **Her sayı ve iddia bir çıktıdan:** "container runtime down", "ağ kopması", "%61 CPU" gibi ifadeler yalnız o turda
  görülen çıktıya dayanır; yoksa "tahmin:" de (saha G7, G8). `kubectl top` `<unknown>` dediyse yüzde yazma.
- **Kanıt reboot'tan önce toplanır:** reboot logları ve bellek durumunu siler (saha G11: wor03 kanıtı kayboldu).
  Kullanıcı reboot edecekse önce §4'teki node komutlarını çalıştırmayı öner.
- **Çok node'a aynı komut → ansible ad-hoc** (tek izin, paralel): `filo-durum-kontrolu` becerisi; node başına ssh
  döngüsü kurma (saha G6). Tek node'u derinlemesine incelerken ssh.
- **Bağlamı koru:** çıktıyı sınırla (`--tail`, `head`, `grep`); katman bitince en fazla 5 satır ara özet; sonraki
  katmanda ham çıktıyı tekrarlama (saha G20/G22).

## 0. Ortam (Alp ve Rancher ekranları, 2026-10-15)

- Nonprod Rancher (`rke-nonprod.<kurum>`) **v2.14.3**. Prod Rancher (`rke-prod.<kurum>`) sürümü `[SAHA]`.
- Nonprod downstream RKE2 kümeleri (`gpu-dtx`, `test`, `test-sasviya`, `peaka-poc`, `vibecode-test`, `devops-utilities`
  …) ve `local`: **v1.33.13+rke2r1**. Anthos (GKE) kümeleri de Rancher'da görünür — bu becerinin kapsamı dışı.
- CNI: **Antrea** (OVS veri yolu). İşletim sistemi RHEL (8/9/10 — node başına `get nodes -o wide`'dan oku).
- `test` kümesi: 3 master (`stlranchermas01-03`) + 14 worker (`stlrancherwor01-14`). Worker'ların bir kısmı zaman
  zaman `Unavailable` oluyor: 2026-10-12 wor03/wor12/wor14 (saha G7-G11: wor03/wor14'te OVS transaction timeout),
  2026-10-15 wor03/wor08 Unavailable, wor14'te `antrea-ovs` liveness hatası (Rancher ekranı). **Aynı node'lar
  tekrarlıyor** — kalıp ara (§4).
- Erişim: kubectl → bir master'a ssh, `/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml`
  (`engine/AGENTS.md`). Node'lara ssh açık. Envanter: `ansible/inventories/` (test kümesi grubu `hosts-rke2.ini` içinde,
  ör. `[rke-nonprod-test]` — adı dosyadan oku).

Aşağıda `kubectl …` yazan her satır bu kalıpla çalışır.

## 1. Sürüm envanteri ve uyumluluk

```bash
kubectl get nodes -o wide      # VERSION (RKE2), OS-IMAGE (RHEL minor), KERNEL-VERSION, CONTAINER-RUNTIME — tek komut
kubectl -n kube-system get pods -l app=antrea -o jsonpath='{range .items[*]}{.spec.containers[0].image}{"\n"}{end}' | sort | uniq -c
```

- Node'lar arasında **sapma** var mı: farklı RKE2, RHEL minor, çekirdek, containerd → bulgu (aynı kümede çekirdek farkı
  davranış farkı demektir).
- Rancher sürümü: Rancher arayüzü sol alt ya da downstream'de `kubectl -n cattle-system get deploy cattle-cluster-agent
  -o jsonpath='{.spec.template.spec.containers[0].image}'` (genel).
- **Uyumluluk yorumu yalnız `rke2-ansible` becerisindeki çevrimdışı matristen** (Rancher ↔ RKE2 ↔ RHEL; Antrea notu
  orada). Matriste olmayan sürüm → "matriste yok — `--kaydet` ile eklenmeli" de, tahmin etme.

## 2. Control plane

```bash
kubectl get --raw='/readyz?verbose' | grep -v ' ok$' | head        # boşsa hepsi ok; etcd dahil
kubectl -n kube-system get pods -o wide | grep -e etcd -e kube-apiserver -e kube-controller -e kube-scheduler -e cloud-controller
```

Master'da (ssh, okuma):

```bash
systemctl is-active rke2-server; journalctl -u rke2-server --since -3h --no-pager | grep -i -e error -e "took too long" -e leader -e "slow" | tail -30
for f in /var/lib/rancher/rke2/server/tls/*.crt; do printf '%s ' "$f"; openssl x509 -enddate -noout -in "$f"; done | sort -t= -k2 | head
df -h /var/lib/rancher; cat /proc/pressure/io
```

- etcd logunda `apply request took too long` / `slow fdatasync` (genel) → master diski yavaş; `performans` becerisi
  disk bölümü. Üç master'da da aynı mı, tek birinde mi?
- Sertifika bitişi 30 günden yakınsa bulgu (RKE2 süresi yaklaşan sertifikayı yeniden başlatmada yeniler — genel;
  yenileme değişikliktir).

## 3. Sistem pod'ları (altyapı)

```bash
kubectl get pods -A -o wide | grep -v -e Running -e Completed | head -30
kubectl get pods -n kube-system -o wide --sort-by='.status.containerStatuses[0].restartCount' | tail -15
kubectl get pods -n cattle-system -o wide; kubectl get pods -n cattle-fleet-system 2>/dev/null | head
```

Altyapı namespace'leri: `kube-system` (antrea, coredns, ingress, metrics), `cattle-system`, `cattle-fleet-*`,
`cattle-monitoring-system` (varsa). Restart sayısı yüksek altyapı pod'u → hangi node'da? (§4'teki kalıpla karşılaştır.)

## 4. Node'lar — NotReady / Unavailable

**Küme tarafı (önce):**

```bash
kubectl get nodes
kubectl describe node <node> | sed -n '/Conditions:/,/Addresses:/p'          # Ready satırının Reason/Message'ı
kubectl get events -A --field-selector involvedObject.kind=Node -o custom-columns='ZAMAN:.lastTimestamp,NODE:.involvedObject.name,NEDEN:.reason' | sort | tail -40
kubectl -n kube-node-lease get lease <node> -o jsonpath='{.spec.renewTime}'; echo
```

Ready mesajını sınıflandır (genel):

| Mesaj | Ne demek | Nereye |
|---|---|---|
| `Kubelet stopped posting node status` / `NodeStatusUnknown` | kubelet API'ye ulaşamıyor ya da duruk | node: rke2-agent, ağ, yük |
| `container runtime is down` / `PLEG is not healthy` | containerd ya da pod yaşam döngüsü takılı | node: containerd, CNI DEL, hung task |
| `NetworkUnavailable` / `network plugin not ready` | CNI hazır değil | antrea-agent / OVS |
| `MemoryPressure` / `DiskPressure` / `PIDPressure` | kaynak eşiği | node: bellek, `/var/lib` diskleri |

**Kalıp ara:** hangi node'lar, hangi saatler, ne sıklıkla? Aynı node'lar tekrar ediyorsa (test kümesi: wor03, wor08,
wor14) o node'larda ortak olan ne — aynı hipervizör/ESX, aynı RHEL/çekirdek, aynı iş yükü (ör. milvus)? Hipervizör
bilgisi kümeden görünmez → kullanıcıya sor. Aynı dakikada birden çok node düşüyorsa ortak altyapıyı (ağ, depolama,
yedekleme penceresi, vMotion) sor.

**Node tarafı (ssh, okuma — reboot'tan önce):**

```bash
uptime; cat /proc/pressure/{cpu,memory,io}
systemctl is-active rke2-agent; journalctl -u rke2-agent --since -3h --no-pager | grep -i -e "not ready" -e pleg -e "context deadline" -e error | tail -40
journalctl -k --since -3h --no-pager | grep -i -e "hung task" -e "blocked for more than" -e "soft lockup" -e oom -e "link is down" -e openvswitch | tail -30
CRI_CONFIG_FILE=/var/lib/rancher/rke2/agent/etc/crictl.yaml /var/lib/rancher/rke2/bin/crictl ps 2>&1 | head -5
free -g; df -h / /var/lib/rancher /var/lib/kubelet
chronyc tracking | head -5
```

- `crictl` cevap vermiyor / zaman aşımı → containerd takılı (saha G10: `KillPodSandbox … context deadline exceeded`).
- `hung task` / `blocked for more than` → çekirdek düzeyinde G/Ç ya da kilit; `cekirdek-teshis` becerisi.
- VM ise `%steal` (`performans` §3) — hipervizör CPU vermiyorsa kubelet zamanında durum yazamaz.

**Antrea / OVS (saha G10-G11 — test kümesinde tekrar eden):**

```bash
kubectl -n kube-system get pods -o wide | grep antrea | grep <node>
kubectl -n kube-system logs <antrea-agent-pod> -c antrea-agent --tail=100 | grep -i -e error -e timeout -e rejoin
kubectl -n kube-system logs <antrea-agent-pod> -c antrea-ovs --tail=100 | grep -i -e error -e timeout -e "unreasonably long"
lsmod | grep -e openvswitch -e br_netfilter -e overlay              # node'da (ssh)
```

- `OVS transaction timeout`, `Failed to rejoin any members` (saha G11) → node-yerel Antrea/OVS sorunu: kümesel ağ
  değil ama **ağ veri yolu** — "ağ sorunu yok" deme, "node-yerel CNI sorunu" de.
- Neden-sonuç yönünü (OVS mi containerd'yi, containerd mi OVS'yi kilitledi) kanıt olmadan yazma.

## 5. Node işletim sistemi — toplu (ansible ad-hoc, tek izin)

```bash
ansible <grup> -i <envanter> -m shell -o -a 'uname -r; cat /etc/redhat-release; uptime; free -g | sed -n 2p; sysctl -n net.ipv4.ip_forward; swapon --show | wc -l'
```

- Çekirdek ve RHEL minor'ün node'lar arası farkı; `ip_forward=1`, swap kapalı (RKE2 gereği — `rke2-ansible`).
- SELinux ve firewalld kapalı olması **normal** (kurum kararı) — bulgu sayma.
- Sorunlu node'larla sağlıklı node'ları yan yana koy: fark neyse aday sebep odur (yine "tahmin:").

## 6. Sonuç (ekrana, kısa)

```
Küme <ad> · Rancher v… · RKE2 v… · <tarih>
Sürüm/uyumluluk: ✅/⚠️ … (matris satırı)
Control plane: ✅/⚠️ … (kanıt)
Altyapı pod'ları: …
Node'lar: wor03, wor08 Unavailable — Ready: "<mesaj>" · kalıp: … · node kanıtı: …
Uygulama tarafı (yalnız not): …
Öneri (uygulanmadı, en hafiften): …
Açık kalanlar: [SAHA] …
```

## Yapmayacakların

- Reboot, `systemctl restart rke2-*`, antrea/coredns pod'u silme, `kubectl drain/cordon/delete`, `kubectl exec`
- Event silme (Rancher'daki "Delete" düğmesi dahil), Rancher'da düzenleme
- Sürüm yükseltme önerisini matrise bakmadan yapma (`rke2-ansible`)
