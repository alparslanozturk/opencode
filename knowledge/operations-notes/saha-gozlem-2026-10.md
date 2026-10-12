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

### G8 — Özette çelişki: "erişilemez" denen node'lara yüzde değer verildi
- Görülen (özet, 3m46s'lik tur): "Yüksek yük gösteren node'lar: wor03 CPU 61%, RAM 45%; wor12 CPU 36%, RAM 16%;
  wor14 CPU 35%, RAM 16% — ama NotReady". Aynı özette: "`kubectl top nodes` → wor03/wor12/wor14: `<unknown>` (erişilemez)".
- ⚠️ `top nodes` bu üç node için değer vermediyse yüzdeler nereden? ssh `free -h`/`uptime` yüzde CPU vermez.
  tahmin: ya önceki bir çıktıdan bayat değer ya da uydurma. Kaynağı ekranda yok — doğrulanacak.
- Ayrıca nedensellik iddiaları kaynaksız: "antrea ağında kopma", "containerd asılı", "ağ katmanı kararsız".
- Aday aksiyon: özet/rapor satırındaki her sayı, aynı oturumdaki bir araç çıktısında geçmeli (slayttaki "structured
  output + deterministic acceptance threshold"). Önce AGENTS.md kuralı: "her sayının yanına kaynak komutu";
  sonra plugin: cevaptaki sayılar oturumun araç çıktılarında yoksa uyarı ekle (saglik'teki öneri A'nın aynısı).

### G9 — Kapsam: altyapı mı uygulama mı
- Alp: "antrea bizim için önemli; fluent, prometheus, starburst vb. altyapı değil, gerçek uygulamalar. Altyapı
  sorunlarını incelemek isterim." Ajan 7 sorunu altyapı/uygulama ayırmadan aynı listede verdi.
- Aday aksiyon: `k8s-rancher` becerisine "altyapı katmanı" tanımı (rke2/kubelet/containerd, etcd, apiserver, antrea,
  CoreDNS, ingress, node OS/disk/ağ) ve "küme sorunu" isteğinde önce bu katmana bak; uygulama pod'ları ayrı başlık.
  Liste Alp'ten onaylanacak [SAHA].

### G10 — Rancher Events ekranı (Alp, el ile) — G7'ye kısmi dayanak
- Görülen: wor03 kubelet'i NotReady iken hâlâ event üretiyor: `FailedKillPod` (milvus-kafka-0: `KillPodSandbox …
  rpc error … context deadline exceeded`), readiness probe `10.42.4.13:9091` / `10.42.4.19:9091` → `no route to host`,
  `10.42.4.17:10250` → `connection refused`. wor07: oobeya-ui `ImagePullBackOff` (cr-test.kuveytturk.com.tr — uygulama
  tarafı, kapsam dışı). `TaintManagerEviction` (oobeya-addons) iptal.
- G7 değerlendirmesi: "container runtime" iddiasının dayanağı bu tür KillPodSandbox deadline mesajı olabilir —
  ajanın kendi çıktısında gösterilmedi ama veri kümede mevcut.
- tahmin (doğrulanacak): kubelet yalnız kendi node'undaki pod'ları prob'lar → 10.42.4.x wor03'ün pod CIDR'ı;
  kubelet kendi node'undaki pod'a "no route to host" alıyor ve KillPodSandbox (CNI DEL) zaman aşımına düşüyor →
  ikisi de wor03'teki antrea-agent/OVS'nin sağlıksız olmasıyla tutarlı (ağ kopması kümesel değil, node-yerel).

### G11 — Ajanın kök neden sonucu: "yerel OVS donması, 3 node'a reboot"
- Görülen: mas01 antrea logu `E1012 08:20:44 cluster.go:403 Failed to rejoin any members` → 10.14.9.73/.132/.134:10351
  `connection refused`; diğer 14 node ile peer çalışıyor. wor14 için `OVS transaction timeout 5001ms`.
  Sonuç: "Ağ erişimi sorunu YOK … yerel OVS donması, 3 node'a fiziksel reboot gerekiyor." Alp wor03'ü restart etti.
- ✅ Kanıta dayalı kısım: sorun 3 node'a yerel (peer logu), OVS yanıt vermiyor (transaction timeout). G10 hipoteziyle
  uyumlu — ajan kendisi buldu (bizden ipucu verilmedi).
- ⚠️ Çelişkiler: (1) "10351 kapalı" ↔ aynı ekranda "port kapalı değil"; (2) "OVS kernel modülü donmuş" ↔ "OVS process
  donmuş" (farklı iddialar; görülen kanıt yalnız ovsdb transaction timeout → kullanıcı alanı); (3) "Ağ sorunu YOK /
  network sorunu değil" — OVS, Antrea'nın veri yolu; doğrusu "kümesel ağ değil, node-yerel CNI (Antrea/OVS) sorunu".
  Alp'in "antrea mı sorun?" sorusuna dolaylı cevap "hayır" gibi okunuyor, oysa yanıt "evet, 3 node'da Antrea/OVS".
- ⚠️ Neden-sonuç yönü belirsiz: containerd mi OVS'yi, OVS mi CNI DEL üzerinden containerd'yi kilitledi — kanıt yok.
  "Fiziksel reboot gerekiyor" önerisi daha hafif adımlar (antrea-agent pod'u / OVS yeniden başlatma) denenmeden verildi.
- ⚠️ Kök neden (3 node neden ~aynı dakikalarda?) sorulmadı; reboot öncesi kanıt (ovs-vswitchd logu, dmesg hung task)
  toplanmadı → wor03 kanıtı reboot ile kayboldu.
- Aday aksiyon: k8s-rancher/hata-ayikla becerisine "değişiklik/reboot önermeden önce kanıt topla (log, dmesg) +
  en hafif düzeltmeden başla"; özette çelişki kontrolü (G8 ile aynı sınıf — refuter adayı).
