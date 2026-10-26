---
name: kume-bul
description: Envanter ve küme kimliği — bir sunucu adı/kısa ad/IP'nin hangi RKE2/Kubernetes kümesine ve hangi Rancher platformuna ait olduğunu, bir Rancher'ın hangi kümeleri yönettiğini, kümenin node'larını, ingress adlarını ve Rancher sertifikasının CN/SAN'ını bulurken kullan. Deterministik `kume-bul.py`: envanter eşleme (ad ↔ IP ↔ grup, dosya:satır) + master'dan gelen kubectl JSON'unu çözme (`k8s`, sertifika dahil) + Rancher haritasını envantere kaydetme (`--kaydet`). "hangi kümede", "hangi cluster", "hangi kümeye ait", "kümesi ne", "hangi platform", "hangi rancher", "rancher hangi kümeleri yönetiyor", "kümeler neler", "kümeleri listele", "downstream", "envanterden bak", "envanterde ara", "sertifikadan bak", "sertifikayı oku", "CN", "ingress", "kimlik", "master mı worker mı", "küme bul" isteklerinde tetiklenir. Sertifika değiştirme işi için `rancher-sertifika`.
---

# Envanter ve küme kimliği — `kume-bul.py`

Betik: `python3 /root/ai/opencode/knowledge/skills/approved/kume-bul/kume-bul.py` (aşağıda **`KB`** — komutta açık yaz).
Kaynak etiketi: **(Alp)** kurum bilgisi · **(saha G…)** saha gözlemi · **(genel)** Rancher/Kubernetes genel bilgisi, sahada ilk
koşuda doğrulanacak (betik bulamadığı alana `?` basar, uydurmaz).

## 0. İlkeler (önce oku)

- **Önce envanter, betikle** (Alp, saha G94: "bir master ya da worker söylediğimde kümeyi hemen bulması lazım"). Elle grep/awk
  zinciri kurma; betik tüm envanter dosyalarını ad, kısa ad **ve IP** üzerinden birlikte eşler.
- **Kubectl JSON'unu sen çözme — betiğe boru ile ver** (§2). Base64, sertifika, node/ingress listesi betikte çözülür; private key
  hiç okunmaz/basılmaz. Kullanıcının yapıştırdığı base64/JSON'u **yeniden yazma** (G94: 1857 karakter bozuldu) — tek satırı ver
  ya da ssh ile kendin çalıştır.
- **Ad kalıbından küme/rol/sürüm türetme** (G94: "splkubelocal1/2/3 = 3 node'lu local küme", "RKE1 olabilir"). Ad yalnız AGENTS'taki
  ilk 3 harf tablosuyla yorumlanır.
- `execute` diye araç yok (kapalı); komut = `bash`, dosya = `read`/`grep`/`glob`.

## 1. Envanter — `KB <ad|kısa ad|IP> [...]` (bağlanmadan)

Çalışma dizinindeki `ansible/`, `inventories/`, `inventory/` altındaki `*.ini` ve `hosts*` dosyalarını okur (kilitteki
`envanter.ts` kuralları: `x[01:14]`, `ansible_host`, `:children`). Basar: her eşleşme `dosya:satır ad grup üst`; **"← aynı IP,
farklı ad"**; tek sorguda grup üyeleri ve `[grup:vars]` (gizli alanlar `***`); çok sorguda **"Toplu özet"** (`3/3 [grup]` = aynı küme).

- §3'teki Rancher haritası kaydedildiyse (`rancher-<adres>.ini`) cevap doğrudan oradadır: grup = küme, `:vars` = `rancher_url`,
  `rancher_kume_adi`, `rancher_kume_id`, `k8s_surum`, host satırında `rancher_rol`. Cevabı bu satırlarla ver (`dosya:satır`).
- **Küme adıyla sorgu** (ör. `KB ai-test`, saha G106): host yoksa betik grup adına ve kayıtlı haritadaki `rancher_kume_adi`'ya
  bakar, üyeleri + `:vars`'ı basar. Küme adı ancak §3 haritası kaydedildiyse ya da envanterde aynı adla bir grup varsa bulunur;
  yoksa "YOK" doğru cevaptır → §2/§3 (Rancher local master'ından `--kaydet`), elle grep/for döngüsü kurma.
- Yalnız düz bir listede (ör. `[production]`) ya da hiç yoksa: `getent hosts <ad>` → IP ile tekrar; yine yoksa §2.
- Hangi dosyanın küme envanteri olduğunu dosya adından tahmin etme — betiğin bastığı grup/`:vars` ne diyorsa o.

## 2. Kimlik — master'dan tek satır → `KB k8s` (salt-okunur)

Kullanıcı "envanterden/sertifikadan bak" dediyse ssh istenmiştir (Alp, G94); onay ekranı çıkar. Master'ı envanterden al (§1 grup
üyeleri). Node worker'sa ya da master bilinmiyorsa önce bağlandığı adres (genel):
`ssh root@<node> "systemctl is-active rke2-server rke2-agent; grep -hE '^(server|tls-san|node-name):|^ +- ' /etc/rancher/rke2/config.yaml /etc/rancher/rke2/config.yaml.d/*.yaml 2>/dev/null"`
→ `server: https://<X>:9345` → X = master/kayıt adresi (§1 ile ara). Token satırı basılmaz; config'i `cat` ile dökme.

```bash
ssh root@<master> "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes,ingress -A -o json; /var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get settings.management.cattle.io server-url -o json; /var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get clusters.management.cattle.io,nodes.management.cattle.io -A -o json; /var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml -n cattle-system get deploy rancher,cattle-cluster-agent -o json; /var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml -n cattle-system get secret tls-rancher-ingress -o json" | python3 /root/ai/opencode/knowledge/skills/approved/kume-bul/kume-bul.py k8s
```

Olmayan kaynak için kubectl'in "NotFound / doesn't have a resource type" satırları normaldir (stderr, ekranda görünür); betik
geleni işler. Çıktı bölümleri:

- **Kimlik:** "Rancher bu kümede KURULU (= platformun local kümesi) · server-url" ya da "Yöneten Rancher (CATTLE_SERVER)".
- **Bu kümenin node'ları:** ad, InternalIP, rol (control-plane/etcd/worker), kubelet sürümü, OS.
- **Ingress host'ları:** kümede yayınlanan adlar (Rancher adı, uygulama alan adları) → platform/ortam ipucu; adı yorumlama, aynen yaz.
- **Secret … tls.crt:** subject (CN), issuer, notBefore/notAfter, SAN — openssl çıktısı aynen.
- **Rancher'ın yönettiği kümeler:** her küme `[ad] id · sağlayıcı · sürüm · Ready · node sayısı` + node'ları (ad, IP, rol).

Cevap: "<node> → küme **<ad>** (Rancher: <server-url / CATTLE_SERVER>) · kaynak: `kume-bul.py k8s` çıktısı, <master>".

## 3. "Rancher'ın ardında hangi kümeler var?" → envantere kaydet

Rancher local kümesinin bir master'ında (§2 "Rancher bu kümede KURULU" dediyse):

```bash
ssh root@<rancher-local-master> "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get settings.management.cattle.io server-url -o json; /var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get clusters.management.cattle.io,nodes.management.cattle.io -A -o json" | python3 /root/ai/opencode/knowledge/skills/approved/kume-bul/kume-bul.py k8s --kaydet
```

- Yönetilen tüm kümeler + node'ları listelenir ve `ansible/inventories/rancher-<rancher-adresi>.ini`'ye yazılır: üst grup
  `rancher_<adres>`, küme başına grup, `ansible_host`, `rancher_rol`, `:vars` (rancher_url, küme adı/id, k8s sürümü), başlıkta
  kaynak + tarih. Dosya yazar — çalıştırmadan önce kullanıcıya **tek cümleyle** söyle. Betik yalnız kendi ürettiği dosyanın
  üzerine yazar; aynı Rancher için tekrar çalıştırmak dosyayı günceller.
- Her Rancher platformu için bir kez (nonprod, prod …); sonra her "hangi kümede?" sorusu §1'den, bağlanmadan cevaplanır.
- Kaydedilen IP/ad Rancher'ın o anki kaydıdır; mevcut elle yazılmış envanterle çelişirse ikisini de `dosya:satır` ile göster,
  hangisinin doğru olduğuna kullanıcı karar verir. Erişilemeyen platformda (AGENTS "Bu makineden erişilemeyen platform") ssh
  deneme: komutu kullanıcıya ver, çıktısını dosyaya kaydedip `KB k8s --kaydet < dosya` ile işle.

## 4. Sertifika / Secret elle (betik yoksa) (G88, G94)

- `.data` değerleri base64 → bir kez `base64 -d` → PEM → `openssl x509`. `kubernetes.io/tls`'te `tls.crt` PEM'dir — `-inform DER` deneme.
- Anahtarda nokta: **`{.data.tls\.crt}`**. `{.data.tls.crt}` **boş** döner → openssl "Could not find certificate" / "header too long".
  Emin değilsen `… | wc -c` (0 = yol yanlış).
  `kubectl -n cattle-system get secret tls-rancher-ingress -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -subject -issuer -dates -ext subjectAltName`

## Yapma

- Bir dosyada adla bulamayıp "envanterde yok / kümede tanımlı değil" demek — betik IP ile de bakar.
- Aynı başarısız komutu yazım değiştirerek denemek (`-inform DER`, python ile base64 onarma, `/tmp/decode_cert3.py`) — iki denemede
  olmuyorsa hata mesajını oku, §4'e bak, dur ve anlat.
- Sonuç tablosuna kaynağı olmayan satır yazmak — bilinmiyorsa `[SAHA]` / `bilinmiyor`.
