---
name: rancher-sertifika
description: Rancher sunucusunun (ingress / web arayüzü) TLS sertifikasını yenilerken ya da değiştirirken kullan — kurumun aynı-CA yenileme akışı (old/ dizini, aynı dosya adları, apply), `tls-rancher-ingress` ve `tls-ca` secret'ları, privateCA, "aynı CA mı yeni CA mı" kararı, dosya hazırlama (PKCS#8 anahtar, .cer DER/PEM, zincir sırası, Windows CRLF), doğrulama, yedek ve geri alma, CA değiştiyse Rancher pod'ları + ajanların CATTLE_CA_CHECKSUM'u + Fleet force update. "rancher sertifika", "sertifika yenile", "sertifikaları değiştir", "sertifika yükle", "yeni sertifika geldi", "tls.crt", "tls.key", "ingress sertifikası", "cacerts.pem", "chain.pem", "pfx", "tls-rancher-ingress", "tls-ca", "cacerts", "privateCA", "ingress sertifikası", "not secure", "x509", "certificate signed by unknown authority" isteklerinde tetiklenir. RKE2'nin kendi iç sertifikaları (etcd, apiserver — 120 gün kala kendiliğinden yenilenir) bu beceri değil: `rke2-denetim`, `rke2-guvenlik`.
---

# Rancher sunucu sertifikası — yenileme / değiştirme

**Kaynak:** Rancher resmi dokümanı *Updating the Rancher Certificate* ve *Adding TLS Secrets*
(`github.com/rancher/rancher-docs` → `docs/getting-started/installation-and-upgrade/resources/update-rancher-certificate.md`,
`add-tls-secrets.md`; indirme 2026-10-21). Etiket: **(Rancher docs)** · **(genel)** genel bilgi — öneri olarak yaz · **(Alp)** kurum.

**Kurum (Alp, 2026-10-21):** Rancher `privateCA=true`, `ingress.tls.source=secret` ile kurulu (Alp'in kurulum notu: `helm upgrade
--install rancher … --set hostname=… --set ingress.tls.source=secret --set privateCA=true --set systemDefaultRegistry=<kurum kayıt
aynası> --set rancherImage=…`; `cacerts.pem` kurum CA dosyalarının birleşimi). İki platform var; **bulut platformuna bu makineden
erişim yok** (AGENTS "erişilemeyen platform") → orada komutları **kullanıcı** çalıştırır: sen dosya hazırlama/doğrulama komutlarını
ve sırayı ver, çıktıyı yorumla.

Değişiklik adımları (§4, §5) CN/KRİZ yetkisi ister; bu beceri önce **okur ve karar verir**.

## 0. Kurumun yenileme akışı — aynı CA (Alp, 2026-10-21, saha G84) — en sık senaryo

Alp'in yolu: PFX → (araçla) şifresiz anahtar + sertifika metni → local kümenin bir master'ında sertifika dizinine (`cacerts.pem`,
`chain.pem`, kök/ara `.cer` dosyalarının yanı) → **eski `tls.crt`/`tls.key` `old/` dizinine**, yenileri **aynı adlarla** (`tls.crt`,
`tls.key`) → komutlar. Bulut platformunda komutları **kullanıcı** çalıştırır; sen aşağıdaki listeyi **dosya adlarını onun `ls`
çıktısından alarak** ver, her adımın çıktısını iste, yorumla. `cacerts.pem`/`chain.pem`/`.cer` dosyalarına dokunulmaz (aynı CA).

```bash
export KUBECONFIG=/etc/rancher/rke2/rke2.yaml
# 1) eski düzeni örnek al — eski tls.crt kaç sertifikaydı (2 = yaprak + ara)?
grep -c "BEGIN CERTIFICATE" old/tls.crt; grep -c "BEGIN CERTIFICATE" tls.crt
# 2) yapıştırma kontrolü: BEGIN = END, CR = 0 (değilse: sed -i 's/\r$//' tls.crt tls.key)
for f in tls.crt tls.key; do echo "$f BEGIN=$(grep -c BEGIN $f) END=$(grep -c END $f) CR=$(grep -c $'\r' $f) ilk=$(head -1 $f | cut -c1-32)"; done
# 3) yeni sertifika: ad (SAN), tarih, issuer — şu an kullanılanla AYNI issuer mı?
openssl x509 -in tls.crt -noout -subject -issuer -dates -ext subjectAltName
kubectl -n cattle-system get secret tls-rancher-ingress -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -issuer -enddate
# 4) anahtar bu sertifikanın mı — iki satır AYNI olmalı
openssl x509 -in tls.crt -noout -pubkey | sha256sum; openssl pkey -in tls.key -pubout | sha256sum
# 5) zincir — chain.pem ara+kök içeriyorsa "tls.crt: OK"
openssl verify -CAfile chain.pem tls.crt
```

- 1) yeni dosya 1 sertifika, eskisi 2 ise ara sertifikayı ekle: `.cer` PEM ise (`head -1` → `-----BEGIN CERTIFICATE`)
  `cat <ara>.cer >> tls.crt`; DER ise `openssl x509 -inform der -in <ara>.cer >> tls.crt`. Sonra 1)'i tekrar oku.
- 3) issuer **farklıysa dur** — bu akış değil, §1 "farklı CA" (tls-ca, Rancher restart, ajan, Fleet).
- Hepsi ✓ ise uygula — notlardaki ilk kurulum komutu `kubectl create secret tls tls-rancher-ingress …` **AlreadyExists** verir;
  yenilemede `apply` yolu:

```bash
kubectl -n cattle-system get secret tls-rancher-ingress -o yaml > old/tls-rancher-ingress-yedek-$(date +%F).yaml && chmod 600 old/*.yaml
kubectl -n cattle-system create secret tls tls-rancher-ingress --cert=tls.crt --key=tls.key --dry-run=client --save-config -o yaml | kubectl apply -f -
echo | openssl s_client -connect <rancher-hostname>:443 -servername <rancher-hostname> 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

`notAfter` yeni tarih → tamam. Eski tarih → birkaç dakika sonra tekrar (§5). Geri alma: `kubectl apply -f old/tls-rancher-ingress-yedek-<tarih>.yaml`.
Aynı CA'da `helm upgrade`, `tls-ca`, `rollout restart`, ajan/Fleet adımı **yok** — önerme.

**Bu akışta yapılan hatalar (saha G86) — yapma:**
- `--cert=chain.pem` vermek: `chain.pem`/`cacerts.pem` **eski** kurulumdan kalan dosyalardır; `chain.pem`'deki sunucu sertifikası
  ESKİSİDİR. `--cert` yalnız **yeni `tls.crt`** (yaprak + ara). (kubectl anahtar–sertifika uyuşmazlığında genelde hata verir — genel;
  ama yanlış dosyayla denemek zaten yanlış.)
- Yedek almadan, anahtar eşleşmesine ve issuer karşılaştırmasına (adım 3-4) bakmadan uygulama komutu vermek.
- Aynı CA'da `kubectl rollout restart deploy rancher` önermek — docs yalnız `tls-ca` değişince ister; ingress secret'ı kendisi alır.
- jsonpath'te noktayı kaçırmamak: `{.data.tls.crt}` boş döner, doğrusu `{.data.tls\.crt}`.
- Okumadığın değeri yazmak ("2028'e kadar geçerli") — `openssl x509 -dates` çıktısından al.

## 1. İlk karar — yeni sertifika aynı CA'dan mı? (her şey buna bağlı)

Mevcut durumu oku (Rancher'ın **local** kümesinde, bir master'da `export KUBECONFIG=/etc/rancher/rke2/rke2.yaml`):

```bash
kubectl -n cattle-system get secret tls-rancher-ingress -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -subject -issuer -enddate
kubectl -n cattle-system get secret tls-rancher-ingress -o jsonpath='{.data.tls\.crt}' | base64 -d | grep -c "BEGIN CERTIFICATE"
kubectl -n cattle-system get secret tls-ca -o jsonpath='{.data.cacerts\.pem}' | base64 -d | grep -c "BEGIN CERTIFICATE"
helm get values rancher -n cattle-system          # hostname, ingress.tls.source, privateCA
helm ls -n cattle-system                          # chart sürümü (helm gerekirse aynı sürüm şart)
```

Yeni yaprak sertifikanın **issuer**'ı (`openssl x509 -in leaf.pem -noout -issuer`, §2) mevcut issuer ile aynı mı?

| Durum | Ne yapılır (Rancher docs) |
|---|---|
| **Aynı CA** (aynı ara + kök; yalnız süresi yenilenen yaprak) | Yalnız §4a: `tls-rancher-ingress` güncelle. `tls-ca`, Rancher restart, ajan, Fleet **gerekmez** — docs: ajan adımı yalnız "signed by a different private CA" ise. |
| **Farklı CA** (yeni ara ya da kök) | §4a + §4b: `tls-ca` + `kubectl rollout restart deploy/rancher` + her downstream kümede ajan yeniden dağıtımı + Fleet "Force Update". Ajanlar güncellenene kadar downstream kümeler Rancher'a bağlanamaz — **bakım penceresi**. |
| Sertifika **kaynağı** değişiyor (self-signed / letsEncrypt → secret) | Ayrıca helm değerleri (docs 3b) — kurumda kaynak zaten `secret`; bu satır normalde yok. |

Not (Rancher docs): basit "sil + yeniden oluştur" yolu yalnız yeni sertifika **aynı CA** tarafından imzalandıysa yeterlidir.

## 2. Dosyaları hazırla (yerelde, okuma + çalışma dizinine yazma)

Gelen dosyalar tipik olarak: anahtar (`*.p8.pem`, `*.key`), sertifika (`*.cer`, `*.crt`), bazen `*.pfx` (genel):

```bash
head -1 <anahtar-dosyası>                  # BEGIN PRIVATE KEY = PKCS#8 şifresiz → olduğu gibi tls.key · BEGIN RSA PRIVATE KEY = PKCS#1 → olduğu gibi
                                            # BEGIN ENCRYPTED PRIVATE KEY → şifreli: openssl pkey -in <dosya> -out tls.key (parolayı kullanıcı girer)
head -c 40 <sertifika.cer>; echo            # "-----BEGIN CERTIFICATE" yoksa DER → openssl x509 -inform der -in <sertifika.cer> -out leaf.pem
openssl pkcs12 -in <dosya.pfx> -info -nokeys | head      # .pfx ise içindeki sertifikalar (parola kullanıcıda)
```

- **PFX geldiyse doğrudan sunucuda ayır** (kopyala-yapıştır hatası olmaz — genel, `openssl pkcs12` man; parola kullanıcıda; OpenSSL 3
  eski şifreli PFX'te `unsupported` derse `-legacy` ekle):
  `openssl pkcs12 -in <dosya.pfx> -nocerts -nodes -out tls.key` · `openssl pkcs12 -in <dosya.pfx> -clcerts -nokeys -out leaf.pem` ·
  `openssl pkcs12 -in <dosya.pfx> -cacerts -nokeys -out ara-kok.pem` (çıktıdaki `Bag Attributes` satırları zararsız; PEM blokları geçerli).
- **Metin yapıştırarak (vi) oluşturulduysa** (Alp'in yolu, G83) önce bak: her dosyada `BEGIN`/`END` sayısı eşit, `\r` yok, satır
  kırılmamış — `grep -c BEGIN <f>; grep -c END <f>; grep -c $'\r' <f>`; `openssl x509 -in <f> -noout` hata vermiyorsa sertifika sağlam.
- **Önceki yenilemeyi örnek al:** eski `tls.crt` kaç sertifika içeriyordu (`grep -c "BEGIN CERTIFICATE" tls.crt`) — kurumun zincir
  alışkanlığı budur; yenisini aynı biçimde kur.
- **`tls.crt` = yaprak + ara sertifika(lar)**, bu sırayla; kök eklenmez (docs: "server certificate followed by any intermediate
  certificate(s)"). `cat leaf.pem subca.pem > tls.crt`.
- **`cacerts.pem` = ara + kök**, bu sırayla (docs: "signed by an intermediate CA … must contain both the intermediate and root CA
  certificates (in this order)") — yalnız `tls-ca` güncellenecekse (§1 farklı CA).
- Ara/kök sertifika elde yoksa: CA ekibinden iste ya da Windows'ta sertifikanın *Certification Path* sekmesinden her birini
  "Base-64 encoded X.509" olarak dışa aktar (genel). Uydurma, internetten indirme.
- Windows'tan gelen dosyada `\r` olabilir (genel): `grep -c $'\r' tls.crt` > 0 ise `sed -i 's/\r$//' tls.crt tls.key`.
- **Özel anahtarı ekrana basma** (`cat tls.key`) — gerekmez; yalnız ilk satırına bak.

## 3. Doğrula (değiştirmeden ÖNCE — hepsi okuma)

```bash
openssl x509 -in leaf.pem -noout -subject -issuer -dates -ext subjectAltName     # SAN'da helm "hostname" değeri olmalı
openssl x509 -in leaf.pem -noout -pubkey | sha256sum; openssl pkey -in tls.key -pubout | sha256sum   # iki satır AYNI olmalı (anahtar eşleşmesi)
openssl verify -CAfile root.pem -untrusted subca.pem leaf.pem                        # "leaf.pem: OK"
grep -c "BEGIN CERTIFICATE" tls.crt                                                   # yaprak + ara sayısı (en az 2 — ara varsa)
openssl x509 -in tls.crt -noout -issuer; openssl x509 -in subca.pem -noout -subject   # yaprağın issuer'ı = ara'nın subject'i
```

Yazmadan önce ekrana tek blok: SAN ✓/❌ · geçerlilik (notBefore ≤ şimdi, notAfter) · anahtar eşleşmesi ✓/❌ · zincir OK · §1 kararı
(aynı CA / farklı CA). Biri ❌ ise dur, kullanıcıya söyle — uygulama.

## 4. Uygula (değişiklik — yetki; bulut platformunda kullanıcı çalıştırır)

Önce **yedek** (geri alma bunun üzerine kurulu; içinde özel anahtar var — `chmod 600`, paylaşma):

```bash
kubectl -n cattle-system get secret tls-rancher-ingress tls-ca -o yaml > yedek-rancher-tls-$(date +%F).yaml && chmod 600 yedek-rancher-tls-*.yaml
```

**4a. Sunucu sertifikası** (her durumda; docs, `--dry-run` bayrağı yeni kubectl'de `--dry-run=client`):

```bash
kubectl -n cattle-system create secret tls tls-rancher-ingress --cert=tls.crt --key=tls.key --dry-run=client --save-config -o yaml | kubectl apply -f -
```

**4b. Yalnız CA değiştiyse** (docs adım 2, 3a, 4 yöntem 1, 5):

```bash
kubectl -n cattle-system create secret generic tls-ca --from-file=cacerts.pem --dry-run=client --save-config -o yaml | kubectl apply -f -
kubectl rollout restart deploy/rancher -n cattle-system                                   # tls-ca açılışta okunur
kubectl get clusters.management.cattle.io -o custom-columns=ID:.metadata.name,AD:.spec.displayName   # downstream küme kimlikleri (c-xxxxx)
kubectl annotate clusters.management.cattle.io <c-xxxxx> io.cattle.agent.force.deploy=true            # HER downstream küme için
```

Sonra Rancher arayüzü → *Continuous Delivery* → kümeler → **Force Update** (fleet-agent'ın kubeconfig'indeki CA yenilenir).
Ajan yöntemi 1 kümeler hâlâ bağlıyken çalışır; bağlantı koptuysa docs yöntem 2 (`CATTLE_CA_CHECKSUM`'u elle) / yöntem 3.

**Helm gerekmez** (kaynak `secret` ve `privateCA=true` zaten). Alp'in kurulum notundaki `helm upgrade --install` satırı yalnız ilk
kurulum ya da kaynak değişikliği içindir; çalıştırılacaksa `helm get values` ile **mevcut** değerler ve **aynı chart sürümü**
(`--version <helm ls'teki>`) şart — yoksa Rancher yükseltilir (docs 3b).

## 5. Sonrası — doğrulama

```bash
echo | openssl s_client -connect <rancher-hostname>:443 -servername <rancher-hostname> 2>/dev/null | openssl x509 -noout -subject -issuer -dates
kubectl -n cattle-system get pods -l app=rancher -o wide                      # CA değiştiyse yeni pod'lar Running
curl -s --cacert cacerts.pem https://<rancher-hostname>/v3/settings/cacerts | head -c 300; echo   # CA değiştiyse tls-ca ile aynı (docs)
kubectl get clusters.management.cattle.io -o custom-columns='ID:.metadata.name,AD:.spec.displayName,HAZIR:.status.conditions[?(@.type=="Ready")].status'
```

Downstream'de ajan logunda `x509` / `certificate signed by unknown authority` → CA güncellemesi eksik (§4b).

- s_client'taki `notAfter` yeni tarih → ingress yeni sertifikayı sunuyor. Eski tarih görünürse (genel): ingress denetleyicisi secret'ı
  henüz almamış olabilir — birkaç dakika bekle, tekrar oku; hâlâ eskiyse ingress'in hangi secret'ı kullandığına bak
  (`kubectl -n cattle-system get ingress rancher -o jsonpath='{.spec.tls}'`).
- **Tarayıcı "Not secure"** sertifika doğru olsa da görünebilir: istemci (Windows) o kök CA'ya güvenmiyorsa (genel). Ayırmak için
  s_client çıktısı + `openssl verify` (§3) — ikisi temizse sorun istemcinin güven deposunda, Rancher'da değil.

## 6. Geri alma

```bash
kubectl apply -f yedek-rancher-tls-<tarih>.yaml          # eski secret'lar
kubectl rollout restart deploy/rancher -n cattle-system  # yalnız tls-ca da değiştirilmişse; sonra ajanlar için §4b son adımlar
```

## Yapmayacakların

- Özel anahtarı sohbete/rapora yazma; yedek dosyasını çalışma dizini dışına kopyalama.
- `kubectl delete secret tls-rancher-ingress` ile başlama — `apply` yolu kesintisiz; silmek gerekirse yedekten sonra (docs not).
- Aynı CA'da gereksiz `rollout restart`, ajan yeniden dağıtımı ya da `helm upgrade` önerme (docs bunları yalnız CA değişikliğinde ister).
