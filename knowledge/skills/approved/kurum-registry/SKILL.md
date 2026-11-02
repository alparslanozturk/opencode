---
name: kurum-registry
description: Kümeye uygulama/helm kurarken imaj NEREDEN çekilecek — kurum registry'leri (amiral gemisi Nexus `registry.<kurum>`, eski platform Harbor `cr` / `cr-test`), düğümün RKE2 `registries.yaml` aynaları, imaj yolunu Harbor'a çevirme, kurulum sonrası çekme hatası kontrolü. Deterministik `imaj-yol.py` (imajlar · yol · cekme). "imaj çekemiyor", "ImagePullBackOff", "ErrImagePull", "registry", "nexus", "harbor", "proxy cache", "imaj yolu", "image path", "registries.yaml", "mirror", "ayna", "helm kur", "chart kur", "imaj nereden geliyor" isteklerinde tetiklenir. Manifest uygulama akışı `rke2-manifest`, küme bulma `kume-bul`; registry'yi podman ile kullanma parked `nexus-registry`.
---

# Kurum registry'leri — imaj nereden çekilir, çekildi mi?

Saha (Alp, 2026-11-02, G115): eski RKE2 platformunda (Harbor) nfs-subdir-external-provisioner kurulduktan sonra imaj yolu elle
`cr.<kurum>/registry.k8s.io_2/sig-storage/nfs-subdir-external-provisioner:v4.0.2` yapıldı. Amiral gemisinde (in-place yükseltilen RKE2
prod + nonprod; Nexus `registry.<kurum>`) tam ad verilmeden çekiliyor. **Öncelik amiral gemisi;** eski platformlar kaldırılacak.
Etiketler: **(saha)** Alp'in ekranı/sözü · **(genel)** ürün bilgisi, kurumda ölçülmedi · bilinmeyen `[SAHA]` — uydurma, oku ya da sor.

## 0. Kurum registry'leri (saha, 2026-11-02 ekranları)

**Nexus — `registry.<kurum>` (amiral gemisi; Alp: "daha aktif kullanıyorum").** Sunucu `splsonatype01`, `~/nexus/docker-compose.yml`:
traefik v3.3.5 önde, `sonatype/nexus3:3.79.1`, veri `/data/nexus-data`. Traefik yönlendirmesi (hepsi `registry.<kurum>`, TLS):

| Yol | Nexus portu | Not |
|---|---|---|
| `/` | 8081 | Nexus arayüzü |
| `/v2` | 8082 | `docker-group` (group; HTTP connector 8082 — ekranda) |
| `/v2/hosted` · `/v2/quay` · `/v2/k8s` · `/v2/elk` · `/v2/twistlock` · `/v2/peaka` | 8083 · 8084 · 8085 · 8086 · 8087 · 8088 | hangi Nexus deposu hangi portta: `[SAHA]` (ad benzerliğinden türetme; Nexus'ta deponun ayarından oku) |

Nexus depoları (ekran): docker — `dockerhub-proxy`, `hosted`, `quay-proxy`, `docker-group` (group), `registry_k8s_proxy`,
`elastic_docker_proxy`, `fluentbit_docker_proxy`, `twistlock` (hosted), `peaka` (hosted), `kyvernoimageproxy`; helm — `nfs_subdir_proxy`,
`kube_prometheus_helm_proxy`, `elastic_helm_proxy`, `fluentbit_helm_proxy`, `milvus`, `kyvernoproxy`, `rancherhelm-proxy`.
`docker-group`'un üyeleri `[SAHA]` (Nexus → Repositories → docker-group → Group).

**Harbor — `cr-test.<kurum>` / `cr.<kurum>` (eski platform).** cr-test'te 81 proje; proxy cache projeleri kaynak kayıt adıyla:
`docker.io`, `registry.k8s.io`, `quay.io`, `ghcr.io`, `nvcr.io`, `mcr.microsoft.com`, `docker.elastic.co` … (saha). Proxy cache'ten çekme
yolu (genel): `<harbor>/<proje>/<kaynaktaki depo yolu>:<etiket>`; Docker Hub resmi imajlarında `library/` eklenir
(`<harbor>/docker.io/library/nginx`). Örnekteki `registry.k8s.io_2` projesi cr-test listesinde yok — cr'deki ad kuralı `[SAHA]`.

Kümenin hangi registry'yi kullandığını buradan **varsayma** — §1'de düğümden oku.

## 1. Kümenin aynaları (okuma)

Küme ve düğüm: `kume-bul`. Bir düğümde (parola/token değerleri gizlenir):

```bash
ssh root@<düğüm> "sed -E 's/((password|token|identitytoken|auth)\"?:).*/\1 ***/' /etc/rancher/rke2/registries.yaml; grep -i registry /etc/rancher/rke2/config.yaml; ls /var/lib/rancher/rke2/agent/etc/containerd/certs.d/"
```

- `mirrors:` altındaki anahtar = kaynak kayıt (`docker.io`, `registry.k8s.io`, `"*"` = hepsi), `endpoint` = kurum adresi, `rewrite` = depo
  yolunu değiştiren kural (genel). `certs.d/<kayıt>/hosts.toml` = RKE2'nin containerd için ürettiği sonuç (genel) — dosyayla çelişirse söyle.
- `config.yaml`'da `system-default-registry` varsa RKE2'nin kendi imajları o adresten gelir (genel).
- Gördüğünü aynen raporla: "bu küme `<adres>` aynasını kullanıyor, `<kayıtlar>` için". Amiral gemisi/eski platform ayrımını bu çıktı söyler.

## 2. Kurmadan önce: imajlar nereden gelecek?

```bash
B=/root/ai/opencode/knowledge/skills/approved/kurum-registry
helm template <ad> <chart> -f <values.yaml> > /tmp/<ad>-render.yaml        # helm ise; düz manifestte dosyanın kendisi
ssh root@<düğüm> "sed -E 's/((password|token|identitytoken|auth)\"?:).*/\1 ***/' /etc/rancher/rke2/registries.yaml" \
  | python3 $B/imaj-yol.py yol --registries - --dosya /tmp/<ad>-render.yaml
```

İmaj başına: kayıt · eşleşen ayna (tam ad / `"*"` / yok) · uç · rewrite sonrası yol · **KARAR**. Çıkış 1 = aynasız imaj var.

- **AYNADA** → imajı olduğu gibi bırak (amiral gemisinde beklenen; yolu elle Nexus'a çevirme).
- **AYNA YOK** → ya imaj yolunu kurum adresine çevir (Harbor: §0 kuralı) ya da aynayı ekle (düğüm değişikliği — ayrı iş, kullanıcıya sor).
  Helm'de yolu **values ile** ver (`image.repository` vb. — chart'ın values anahtarını `helm show values` ile oku); kurulumdan sonra
  deployment'ı elle düzenlemek bir sonraki `helm upgrade`'de geri döner (genel).
- Bu çözümleme yapılandırmayı okur; imajın aynada **gerçekten bulunduğunu** göstermez → §3.

## 3. Kurduktan sonra: çekildi mi? (kanıt)

```bash
ssh root@<master> "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get pods -n <ns> -o json" \
  | python3 $B/imaj-yol.py cekme -
```

"Çekme hatası yok" + pod'lar `Running`/`Ready` olmadan "kuruldu" deme. Hata varsa mesajı aynen göster (`not found` = aynada/projede yok ·
`unauthorized` = kimlik · `x509` = sertifika · `i/o timeout` = ağ) ve hangi adrese gidildiğini söyle; sebebi tahmin etme.

## Yapmayacakların

- Registry adresi, proje adı, port ↔ depo eşlemesi **uydurma** — §0'da yoksa `[SAHA]`, oku ya da sor.
- `registries.yaml`'ı ve parolaları sohbete yazdırma (§1 komutu gizler). Nexus/Harbor yönetim ayarlarını değiştirme — bu beceri okuma ve
  imaj yolu içindir.
- Eski (Harbor) platform için yeni kalıcı düzen kurma önerisi — kaldırılacak; amiral gemisi önceliklidir (Alp, 2026-11-02).
