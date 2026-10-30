---
name: rhel-ca-guven
description: RHEL'de CA sertifikasını güven deposuna yükleme ve GERÇEKTEN yüklendiğini kanıtlama — anchors (/etc/pki/ca-trust/source/anchors), update-ca-trust extract, güven paketi (tls-ca-bundle.pem), trust list, hedef URL'lere sertifika hatasız erişim; çok sunucuda `ca-dogrula.py` ile TAMAM/EKSİK tablosu. "sertifika yükle", "ca yükle", "root ca", "anchors", "update-ca-trust", "trust list", "sertifika yüklendi mi", "captcha sertifikası", "ssl certificate problem", "unable to get local issuer" isteklerinde tetiklenir. Rancher/küme sertifikası `rancher-sertifika`.
---

# CA sertifikası — yükle ve kanıtla

Saha (Alp, 2026-10-27, G108 düzeltmesi): dn29000 işinde ajan "18/18 BAŞARILI" tablosu yazdı; sertifika **hiçbir sunucuya** yüklenmemişti.
Alp: "İnsan bir kontrol eder, fonksiyonel test yapar: anchors'a konur, update-ca-trust extract, trust list kontrol edilir, URL'ler çekilir,
gidebiliyor mu?" Bu beceri o kontrolü zorunlu ve deterministik yapar.

## 0. Kural: "yüklendi" = ölçüldü

Başarı ancak `ca-dogrula.py tablo` çıktısında **TAMAM** ise yazılır. PLAY RECAP `ok/changed`, "dosya anchors'ta var", ajanın kendi
tablosu kanıt **değildir** (dosya var ama extract edilmemiş = güvende değil; ölçüldü). Ölçemiyorsan "ölçülmedi" yaz.

## 1. Yükle — playbook (`ansible` becerisi, `gomulu-dosya.py`)

```bash
ssh root@<kaynak> cat <sertifika.crt> | python3 /root/ai/opencode/knowledge/skills/approved/ansible/gomulu-dosya.py --kaynak - \
  --hedef /etc/pki/ca-trust/source/anchors/<ad>.crt --hosts <iş grubu> --cikti ansible/playbooks/<no>-<ad>.yaml \
  --dogrula-url https://<hedef-url-1> --dogrula-url https://<hedef-url-2>
```

Anchors hedefinde üretilen playbook (ölçüldü — openssl CLI'sı olmayan AlmaLinux 10 container'ında, ansible-core 2.16):
kopyala → sha256 assert → (değiştiyse) `update-ca-trust extract` → **güven paketinde mi** (yoksa extract çalıştırıp yeniden bakar; yine
yoksa FAIL) → her `--dogrula-url` için `curl -fsS` (rc 60 sertifika hatası = FAIL). İkinci koşu `changed=0`. "Dosya var, extract edilmemiş"
durumunu kendisi düzeltir (ölçüldü). Hedefte `openssl` gerekmez (eski `validate: openssl` minimal sunucuda copy'yi düşürüyordu — ölçüldü).
Sıra: `playbook-denetim.py` → `--syntax-check` → `--check --diff` → onay → gerçek → **§2 ölçüm**.

## 2. Ölç — her sunucu, salt-okunur (`ca-dogrula.py`)

```bash
python3 /root/ai/opencode/knowledge/skills/approved/rhel-ca-guven/ca-dogrula.py komut --kaynak <sertifika.pem> \
  --hedef /etc/pki/ca-trust/source/anchors/<ad>.crt --url https://<url-1> --url https://<url-2> --grup <iş grubu>
```

Betik iki satır basar — **aynen** çalıştır: (1) `ansible <grup> -i <envanter> -m shell -a '<okuma>' -t cikti/ca-dogrula` (her sunucuda:
dosya var mı + sha, güven paketinde mi, `trust list` sayısı, URL'ler `curl` ile; hepsi okuma), (2) `ca-dogrula.py tablo cikti/ca-dogrula …`.
Tablo: `sunucu · dosya · sha · paket · trust · url · karar`. Karar **TAMAM** ya da **EKSİK: <sebep>**:

| Sebep | Anlam / sonraki adım |
|---|---|
| dosya yok | playbook o sunucuya hiç ulaşmadı / kopyalama düştü — PLAY RECAP + o sunucunun hatası |
| dosya farklı (sha) | anchors'ta başka sürüm — doğru dosyayı yeniden dağıt |
| güven paketinde yok | `update-ca-trust extract` çalışmamış (dosya var ama güvende değil) — playbook'u yeniden koş |
| URL sertifika doğrulanamadı (rc 60) | zincir eksik (ara CA?) ya da URL başka CA kullanıyor — `openssl s_client -connect <host>:443 -showcerts` (okuma) |
| URL ağ/DNS/zaman aşımı (rc 6/7/28) | sertifika sorunu **değil** — DNS, güvenlik duvarı, proxy `[SAHA]` |
| erişilemedi | ssh/ansible bağlantısı yok — o sunucu ölçülmedi, TAMAM sayılmaz |

Önceden "yapıldı" denmiş işi denetlemek için de aynı iki komut (yükleme yapmadan).

## Yapma

- "Yüklendi / başarılı" tablosunu kendin yazma — `ca-dogrula.py tablo` çıktısını aynen ver.
- `curl -k` / `--insecure` ile "erişiliyor" deme — sertifika doğrulaması atlanır, test anlamsızlaşır.
- Kaynak sertifikayı elle kopyalama/yeniden yazma (base64 bozulur) — `gomulu-dosya.py` bayt bayt gömer.
