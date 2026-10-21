---
name: kume-bul
description: Bir sunucu adı, kısa ad ya da IP verildiğinde hangi RKE2/Kubernetes kümesine ve hangi Rancher platformuna ait olduğunu bulurken kullan — önce deterministik `kume-bul.py` (envanter: ad ↔ IP ↔ grup, dosya:satır), envanter yetmezse node'dan salt-okunur kanıt (rke2 config `server:`, `get nodes`, Rancher adresi, sertifika CN/SAN). "hangi kümede", "hangi cluster", "hangi kümeye ait", "kümesi ne", "hangi platform", "hangi rancher", "master mı worker mı", "bu node nerede", "envanterden bak", "sertifikadan bak", "küme bul" isteklerinde tetiklenir. Sertifika değiştirme işi için `rancher-sertifika`.
---

# Node / IP → küme ve platform

Kaynak etiketi: **(Alp)** kurum bilgisi · **(saha G…)** saha gözlemi · **(genel)** Kubernetes/RKE2/Rancher genel bilgisi —
"(genel)" komut sahada ilk kullanımda doğrulanacak; hata verirse `--help` ve hata mesajı (AGENTS "Komut hata verirse").

## 0. İlkeler (önce oku)

- **Önce envanter, betikle** (Alp, saha G94: "bir master ya da worker söylediğimde kümeyi hemen bulması lazım"). Elle
  grep/awk zinciri kurma; §1'deki betik tüm envanter dosyalarını ad, kısa ad **ve IP** üzerinden birlikte eşler.
  Bir dosyada adla yok diye "kümede tanımlı değil" deme — küme envanteri node'u IP ile tutuyor olabilir.
- **Ad kalıbından küme türetme** (G94'te yazıldı: "splkubelocal1/2/3 = 3 node'lu local küme", "RKE2 öncesi / RKE1 olabilir").
  Ad yalnız AGENTS'taki ilk 3 harf tablosuyla (lokasyon/ortam/alan) yorumlanır; küme, rol, sürüm adın içinden çıkarılmaz.
- **Uzun veriyi yeniden yazma** (G94): kullanıcının yapıştırdığı base64 / sertifika / JSON değerini kopyalayıp dosyaya
  ya da komuta **yazma** — model uzun diziyi bozuyor (1857 karakter, "1 more than a multiple of 4", PEM sonu çöp). Değeri
  **kaynağından boruyla** al (§3) ya da kullanıcıya orada çalıştıracağı tek satırı ver.
- `execute` diye bir araç yok (kapalı); komut = `bash` aracı, dosya = `read`/`grep`/`glob`.

## 1. Envanter — `kume-bul.py` (bağlanmadan, yalnız okur)

```bash
python3 /root/ai/opencode/knowledge/skills/approved/kume-bul/kume-bul.py <ad|kısa ad|IP>
python3 /root/ai/opencode/knowledge/skills/approved/kume-bul/kume-bul.py <ad1> <ad2> <ad3> ...   # ör. get nodes'tan gelen adlar
```

Çalışma dizinindeki `ansible/`, `inventories/`, `inventory/` altındaki `*.ini` ve `hosts*` dosyalarını okur (kilitteki
`envanter.ts` ile aynı kurallar: `x[01:14]` aralığı, `ansible_host`, `:children`). Çıktı:

- her eşleşme `dosya:satır  ad=…  grup=[…]  üst=[…]`; **"← aynı IP, farklı ad"** satırı = node başka dosyada IP'siyle geçiyor;
- tek sorguda grubun diğer üyeleri ve `[grup:vars]` satırları (token/parola/anahtar `***`);
- çok sorguda **"Toplu özet"**: hangi grup kaç adı kapsıyor (`3/3 [grup]` = hepsi aynı kümede);
- yoksa: `envanterde YOK` → `getent hosts <ad>` ile IP'yi al, betiği IP ile tekrar çalıştır.

Cevap = betiğin satırı: "**<ad> → [<grup>]** (`<dosya>:<satır>`, eşleşme: ad / IP)". Node yalnız düz bir listede
(ör. `[production]`) ve hiçbir küme grubunda değilse bunu **aynen** söyle ve §2'ye geç. Hangi dosyanın küme envanteri
olduğunu dosya adından tahmin etme — betiğin bastığı grup ve `:vars` satırları ne diyorsa onu yaz; belirsizse sor.

## 2. Envanter yetmezse — node'dan salt-okunur kanıt

Kullanıcı "envanterden / sertifikadan bak" dediyse bu adımlar istenmiştir (Alp, G94); her ssh onay ekranına düşer,
hepsi okuma. Kubectl yolu ve kubeconfig: AGENTS "SSH ve Kubernetes erişimi". `K=/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml`
aşağıda kısaltmadır — komutta **açık yaz**.

1. **Rol ve bağlandığı adres (genel):**
   ```bash
   ssh root@<node> "systemctl is-active rke2-server rke2-agent; grep -hE '^(server|tls-san|node-name):|^ +- ' /etc/rancher/rke2/config.yaml /etc/rancher/rke2/config.yaml.d/*.yaml 2>/dev/null"
   ```
   `rke2-server active` → master; `rke2-agent active` → worker. `server: https://<X>:9345` → **X'i §1 betiğiyle ara**
   (master adı/IP'si ya da kayıt adresi). `server:` yoksa ve rke2-server çalışıyorsa → kümenin ilk master'ı; 2. adım.
   (Bu grep token satırını basmaz — config'i `cat` ile dökme.)
2. **Master'daysan küme üyeleri → envanter:**
   ```bash
   ssh root@<master> "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes -o wide"
   ```
   Çıkan adları (ve gerekirse INTERNAL-IP'leri) **tek seferde** betiğe ver → "Toplu özet"teki grup = küme.
3. **Hangi Rancher platformu (genel):**
   - Rancher bu kümede mi kurulu (= platformun `local` kümesi): `ssh root@<master> "…kubectl… -n cattle-system get deploy rancher"`.
     Kuruluysa adresi: `…kubectl… get settings.management.cattle.io server-url -o jsonpath='{.value}'` ve sertifikası (§3):
     ```bash
     ssh root@<master> "/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml -n cattle-system get secret tls-rancher-ingress -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -subject -issuer -dates -ext subjectAltName"
     ```
     subject CN / SAN = Rancher adresi → platform.
   - Rancher kurulu değilse (downstream küme) yöneten Rancher'ın adresi:
     `ssh root@<master> "…kubectl… -n cattle-system get deploy cattle-cluster-agent -o yaml | grep -A1 'name: CATTLE_SERVER'"`.
4. Canlı yoldan bulduğun eşlemeyi kullanıcıya **envantere eklemeyi öner** (yazma = onay; eklenen her ad/IP o turdaki komut
   çıktısından, kaynağıyla — G5). Kullanıcı "bulut/erişilemeyen platform" diyorsa ssh deneme; komutları kullanıcıya ver
   (AGENTS "Bu makineden erişilemeyen platform").

## 3. Kubernetes Secret'tan sertifika okuma (G88, G94)

- Secret'ın `.data` alanları **base64**'tür: bir kez `base64 -d` → PEM (`-----BEGIN CERTIFICATE-----`) → `openssl x509`.
  `kubernetes.io/tls` secret'ında `tls.crt` PEM'dir (genel) — `-inform DER` deneme.
- Anahtar adında nokta var: jsonpath'te **`{.data.tls\.crt}`** yaz. `{.data.tls.crt}` `tls` altında `crt` arar → **boş** çıktı →
  `base64 -d` boş → openssl "Could not find certificate" / "header too long" (G88'de ve G94'te iki kez). Hata "PEM mi DER mi"
  değildir. Emin değilsen önce uzunluk: `… -o jsonpath='{.data.tls\.crt}' | wc -c` → 0 ise yol yanlış.
- jq ile eşdeğeri (sahada çalıştı, G88): `… -o json | jq -r '.data."tls.crt"' | base64 -d | openssl x509 -noout -subject -dates -ext subjectAltName`.
- Kullanıcı `-o json` çıktısını yapıştırdıysa değeri yeniden yazma (§0) — yukarıdaki tek satırı ver ya da ssh ile kendin çalıştır.

## Yapma

- Bir dosyada adla bulamayıp "envanterde yok / kümede tanımlı değil" demek — betik IP ile de bakar (§1).
- Aynı başarısız komutu yazım değiştirerek yeniden denemek (`-inform DER`, python ile base64 onarma, `/tmp/decode_cert3.py`) —
  iki denemede olmuyorsa hata mesajını oku, §3'e bak, dur ve anlat.
- Sonuç tablosuna kaynağı olmayan satır ("RKE1 / Rancher 2.1 olabilir", "3 node'lu küme") — bilinmiyorsa `[SAHA]` / `bilinmiyor`.
