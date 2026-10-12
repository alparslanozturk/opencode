# Saha gözlem günlüğü — 2026-10

Alp'in sahadan (srvsatellite, MobaXterm) gönderdiği ekran görüntülerinden çıkarılan gözlemler.
Amaç: toplu değerlendirme → AGENTS.md / beceri / plugin / kur.sh iyileştirmesi.
Her madde: ne görüldü (kaynak = ekran görüntüsü) · değerlendirme · aday aksiyon. Tahminler "tahmin:" ile işaretli.

## 2026-10-12

### G1 — kur.sh: 2.x derlemesi `@opencode-ai/*@workspace:* failed to resolve`
- Görülen: `git status` → 1.x'ten kalan untracked dosyalar (`specs/project.md`, `specs/tui-package.md`,
  `packages/ui/src/components/*.tsx` …); derleme başarısız, kur.sh eski `bin/opencode` ile devam etti.
- Değerlendirme: 2.0.23 geçişinde (`78839d283c`) paket kapsamı `@opencode-ai/*` → `@opencode/*` oldu;
  2.x'te silinen dizinler (`packages/opencode`, `llm`, `sdk-next`, `slack`, `effect-sqlite-node`, `docs`)
  sahada kalmış, `packages/*` workspace glob'u onları okuyor. tahmin: `al.sh` rsync'i `--delete` olmadan çalışıyor.
- Önerilen çözüm: `git clean -nd` → kontrol → `git clean -fd` → `./kur.sh`. Sonuç: bilinmiyor (Alp'ten bekleniyor).
- Aday aksiyon: kur.sh derleme öncesi `packages/*` altında git'te olmayan package.json varsa durup uyarsın.

### G2 — kur.sh: çıktı sınırı uçtan alınamadı → 4096 token varsayılanı
- Aday aksiyon: Qwen3.6 sunucusunun gerçek `max_tokens` değeri öğrenilip `KURUM_MAX_OUTPUT` yazılmalı (değer: bilinmiyor).

### G3 — Ajan ilk adımda çalışma dizini yerine dışarıya baktı
- İstek (cwd `/root/ai/work/opencode`): "test kümesinin sorunlarını incelemek istiyorum, sadece okuma… disk, cpu,
  ram, network darboğazı nasıl bakarız?"
- Görülen: ilk komut tek satırda `ls /etc/rancher/rke2/; ls ~/rke2-ansible*; …; ~/.kube/config; env | grep -i kube`
  + `~/ansible` altında Glob → `external_directory` izni istendi (`/etc/rancher/*`, `/root/*`, `/root/ansible/*`,
  `/root/.kube/*`). Alp **reddetti** — envanter zaten alt dizindeydi.
- Ret sonrası: ajan `ansible/inventories` içinde grep yaptı, 8 "test" kümesini satır numarasıyla listeleyip
  "hangisi?" diye sordu. ✅ Doğru davranış (kaynaklı, varsaymadı, sordu).
- Değerlendirme: `engine/AGENTS.md` "Çalışma dizini kapsamı" kuralı (önce cwd, dışarı çıkarken gerekçeyle tek tek
  izin) ilk adımda uygulanmadı; deterministik kapı (`external_directory: ask`) yakaladı. Yani prompt kuralı
  tutmadı, izin kapısı tuttu.
- Aday aksiyon: AGENTS.md'ye "envanter/küme sorusunda önce cwd'de `hosts*`/`inventories` ara" adımı; birden çok
  dış dizini tek komutta toplamama.

### G4 — cwd içindeki dosyayı okumak için bile izin soruldu
- Görülen: `grep -A 20 '\[rke-nonprod-test\]' /root/ai/work/opencode/ansible/inventories/hosts-rke2.ini` → "Permission
  required · Shell command". Dosya cwd içinde.
- Değerlendirme: model yerleşik `grep`/`read` aracı (`engine/opencode.json`: `"grep": "allow"`, `"read": {"*": "allow"}`)
  yerine bash `grep` kullandı; bash varsayılanı `ask` olduğu için gereksiz onay çıktı.
- Aday aksiyon: AGENTS.md'ye "cwd içi dosya okuma/arama için yerleşik read/grep/glob aracını kullan, bash grep/cat değil".

### G5 — Envanter eksikti; Alp düzeltti, ajan güncelledi
- Görülen: ajan `[rke-nonprod-test]` grubundan "3 master + 6 worker" dedi (wor01-06, envanterle tutarlı). Alp: "14 worker
  olması lazım, bir daha bak, envanteri güncelle." Ajan: "Kümede 3 master + 14 worker = 17 node var; 07-14 eksik" →
  `hosts-rke2.ini`'ye wor07-14 eklendi (grup listesi + `ansible_host` satırları), edit izni soruldu ✅.
- ⚠️ DOĞRULANACAK: eklenen IP'ler wor07=.127, wor08=.128, wor09=.129; sonra ssh wor12=.132, wor14=.134 →
  `wor<N> = 10.14.9.(120+N)` düzenine tam uyuyor. Ekran görüntüsündeki `kubectl get nodes` çıktısı wor04'te
  kesiliyor ("Click to expand"), IP'lerin bu çıktıdan mı geldiği yoksa düzenden mi türetildiği görülemiyor.
  tahmin: kaynak `get nodes -o wide` INTERNAL-IP olabilir; düzenden türetildiyse bu tam bir uydurma vakası.
- Aday aksiyon: envantere host/IP yazan her edit için ajan kaynağı (komut + satır) göstermeli; kur/AGENTS kuralı +
  ileride deterministik kontrol (eklenen IP, aynı turdaki araç çıktısında geçiyor mu).

### G6 — Ajan dosya-başına ssh döngüsü kurdu, `filo-durum-kontrolu` becerisini kullanmadı
- Görülen: master'a ssh ile `kubectl top/get events` ✅ (salt-okunur, rke2'nin kendi kubectl'i). Ardından her node'a
  ayrı ayrı `ssh … "free -h; nproc; uptime; df -h"` → her biri ayrı izin.
- Değerlendirme: `knowledge/skills/approved/filo-durum-kontrolu/SKILL.md` "SSH döngüsü kurma; ansible ad-hoc kullan"
  diyor. İstekte tetik kelimeler ("tüm sunucularda", "toplu") yoktu → beceri yüklenmedi.
  Doğrusu: `ansible rke-nonprod-test -m shell -a "free -h; nproc; uptime; df -h" -o` (tek izin, paralel, kaynaklı çıktı).
- Aday aksiyon: becerinin description'ına "küme", "tüm node'lar", "darboğaz" tetikleri; performans becerisinden
  çok-sunucu durumunda filo-durum-kontrolu'ya yönlendirme. Bu, slayttaki "deterministik araç" maddesinin karşılığı.

### G7 — Teşhis iddiası: "wor03 container runtime'ı down"
- Görülen: `get events --field-selector reason=NodeNotReady` → wor12 (4m2s), wor14 (3m21s), wor03 (26s) NodeNotReady.
  Ajan: "wor03 container runtime'ı down; wor12 ve wor14 de 3 dk önce NotReady oldu."
- ⚠️ Görülen event'ler yalnız NodeNotReady diyor; "container runtime down" ifadesinin kaynağı (ör. `describe node`
  Conditions mesajı) ekran görüntülerinde yok. Kaynaklı mı, çıkarım mı — doğrulanacak.
- Not: `StrictHostKeyChecking=accept-new` kendi kuralımız (`engine/AGENTS.md:103`), sorun değil.
