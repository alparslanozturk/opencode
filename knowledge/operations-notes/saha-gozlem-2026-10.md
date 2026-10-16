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
  `wor<N> = <test-ağı>.(120+N)` düzenine tam uyuyor. Ekran görüntüsündeki `kubectl get nodes` çıktısı wor04'te
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
  `10.42.4.17:10250` → `connection refused`. wor07: oobeya-ui `ImagePullBackOff` (cr-test.<kurum>.com.tr — uygulama
  tarafı, kapsam dışı). `TaintManagerEviction` (oobeya-addons) iptal.
- G7 değerlendirmesi: "container runtime" iddiasının dayanağı bu tür KillPodSandbox deadline mesajı olabilir —
  ajanın kendi çıktısında gösterilmedi ama veri kümede mevcut.
- tahmin (doğrulanacak): kubelet yalnız kendi node'undaki pod'ları prob'lar → 10.42.4.x wor03'ün pod CIDR'ı;
  kubelet kendi node'undaki pod'a "no route to host" alıyor ve KillPodSandbox (CNI DEL) zaman aşımına düşüyor →
  ikisi de wor03'teki antrea-agent/OVS'nin sağlıksız olmasıyla tutarlı (ağ kopması kümesel değil, node-yerel).

### G11 — Ajanın kök neden sonucu: "yerel OVS donması, 3 node'a reboot"
- Görülen: mas01 antrea logu `E1012 08:20:44 cluster.go:403 Failed to rejoin any members` → <test-ağı>.73/.132/.134:10351
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

### G12 — "Hepsi düzeldi! 17/17 node 2/2 Running"
- Görülen: `get pods -n kube-system | grep antrea-agent` çıktısı ekranda 11 satır + "Click to expand"; iki agent'ta
  yakın restart: `35 (6m36s ago)`, `14 (29m ago)`. Özet tablosu: `mas01-03 · IP – · 2/2 Running · Restarts 0-4`.
  Bağlam: 107.5K (%41).
- ⚠️ "Düzeldi" yalnız pod durumuna dayanıyor; node `Ready`, restart sayısının artmadığı, mas01 peer logunda
  `connection refused`'ın kesildiği, yeni NodeNotReady/FailedKillPod event'i olmadığı kontrol edilmedi.
  Özet tablosunda IP "–" ve restart "0-4" aralığı — çıktıdaki tekil değerler yerine özetlenmiş/belirsiz.
- Alp'in ifadesiyle restart sonrası durum iyi — sonuç doğru, ama "düzeldi" kararının kanıt listesi yok.

## Değerlendirme — 2026-10-12 oturumu (G1–G12)

Genel: ajan kaynağı buldu (envanter, events, peer logu), sordu, izin kapılarına uydu ve kök nedeni ipucusuz
buldu (node-yerel Antrea/OVS). Zayıf nokta tek sınıf: **özet/sonuç cümleleri araç çıktısından kopuyor**
(G5 IP kaynağı, G7, G8 yüzdeler, G11 çelişkiler, G12 erken "düzeldi"). Prompt'taki kaynak kuralı bunu tutmuyor
(saglik'teki ders ve konferans slaytıyla aynı: deterministik araç + bağımsız denetçi + eşik).

Aday aksiyonlar (karar Alp'in; katman sırası MIMARI.md):
1. engine/AGENTS.md — "Sonuç yazma kuralı": her sayı/IP/durum iddiasının yanında kaynak komut; "düzeldi" demeden
   önce doğrulama listesi; özetin kendi içinde çelişki kontrolü. (G5, G7, G8, G11, G12)
2. engine/AGENTS.md — cwd içi okuma/arama yerleşik read/grep/glob ile; envanter sorusunda önce cwd. (G3, G4)
3. Beceriler — filo-durum-kontrolu tetikleri ("küme", "tüm node'lar", "darboğaz"); k8s-rancher'a altyapı katmanı
   tanımı, "reboot/değişiklik önermeden önce kanıt topla, en hafif düzeltmeden başla", "Running ≠ sağlıklı" doğrulama
   listesi. (G6, G9, G11, G12)
4. engine/plugins/guvenlik-v2.ts — deterministik kapı: envanter dosyasına (hosts*.ini) yazılan YENİ IP/host, aynı
   oturumdaki bir araç çıktısında geçmiyorsa edit'i durdur ve kaynağını sor (mevcut `execute.before`/`execute.after`
   hook'larıyla yapılabilir). (G5)
5. Refuter (bağımsız denetçi) — uzun incelemede son özeti, oturumun araç çıktılarına karşı denetleyen ikinci bir
   geçiş. `task: deny` ve son-mesaj hook'u olmadığı için şimdilik 1-4'ten sonra değerlendirilecek.
6. kur.sh — derleme öncesi git'te olmayan packages/*/package.json uyarısı (G1); KURUM_MAX_OUTPUT değeri [SAHA] (G2).

### G13 — Takip: G12 kapandı, G4 tekrarladı
- ✅ G12: ajan sonradan "tüm 17 node Ready, tüm antrea agent'lar 2/2; OVS yeniden çalıştı" dedi (2m46s'lik tur) —
  "düzeldi" bu kez node Ready ile de desteklendi.
- ❌ G4 tekrar: "<nonprod-ağı> nonprod kümelerinin networklerini çıkar" isteğinde yine bash `grep -n '<nonprod-ağı>' …/hosts-rke2.ini`
  ve `…/hosts.ini | head -30` → her biri ayrı "Shell command" izni. Kalıcı davranış; yerleşik grep aracı (izinli) kullanılmıyor.
  Öncelik yükseldi (aksiyon 2).

## 2026-10-13 — yeni sunucu kurulumu (splsplunksh05-07)

İstek: "yeni sunucular kurulacak splsplunksh05-06-07, ssh ile bağlanmayı dener misin?" → ardından kurum playbook
setinin gözden geçirilmesi. Kaynak: Alp'in ekran görüntüleri (MobaXterm, srvsatellite, `/root/ai/work/opencode`).

### G14 — ✅ Envanter önce, IP sorulu; ⚠️ aynı IP yakalandı ama yanlış yorumlandı
- Görülen: `grep splsplunksh` → envanterde 01-04 var, 05-07 yok; IP'yi uydurmadı, sordu ✅. `nslookup` →
  05=<ip-A>, 06=<ip-B>, 07=<ip-B>. Ajan "DNS round-robin", "VIP / load balancer", "06 ve 07 aynı
  fiziksel sunucuya yönlendiriliyor" dedi.
- Değerlendirme: bulgu (iki ad → tek IP) değerli; yorum kaynaksız. Round-robin tek ad → çok IP'dir, burada tersi.
  07 için "SSH OK" fiilen 06'nın cevabı. Alp: IP tahsisi hatası, ağ ekibine bildirildi.
- Aday aksiyon: `sunucu-teslim` bölüm 0 "ön kontrol: iki ad aynı IP → o sunucuya playbook çalıştırma" (yapıldı).

### G15 — ❌ Niyet sorusuna uydurma onay
- Görülen: Alp "08/09 dns-resolv'u … onun için mi açmış idin?" → ajan "Evet, tam olarak o yüzden." Dosyaları ajan
  yazmamıştı; içerik açıklaması doğru, "o yüzden açtım" uydurma.
- Aday aksiyon: AGENTS.md "Geçmiş/niyet sorusu" kuralı (yapıldı); kanıt `git log --follow`.

### G16 — ⚠️ Talimattan sapma: "ping.yaml çalıştır" → elle `ansible -m ping`
- Görülen: `01-ping.yaml` okundu, ardından üç ayrı `ansible -i … -l splsplunksh0X -m ping` kuruldu. Hostlar
  envanterde yokken `-l` ile nasıl eşleştiği ekranda görünmüyor (bilinmiyor).

### G17 — ❌ Edit + "değişiklik yok" çelişkisi
- Görülen: `10-dns-nmcli.yaml` yorum satırı `stl/sxl*` → `stl/sxl/sdl*` düzenlendi, ikinci Edit'in içeriği görünmüyor;
  ardından "Aslında değişiklik yok". G12 sınıfı: özet araç çıktısından kopuk.

### G18 — ❌ Seçenekli soruya "evet" → iki seçenek birden uygulandı (genesys silindi)
- Görülen: Alp önce "genesys … dursun" dedi. Ajan sonra "Dosyayı düzeltelim mi? Veya sadece genesys playbookunu sil…"
  diye sordu; Alp "evet dosyayı düzel" → `07-disks-genesys.yaml` da silindi, "Silinen (projeye özel)" diye raporlandı.
- Ayrıca ajan bir tur önce "genesis dışına çıkmayacaksa silinebilir, kalsın mı?" diye yine sormuştu (kararı unuttu;
  bağlam %53).
- Aday aksiyon: AGENTS.md "Seçenekli soruya belirsiz onay" kuralı (yapıldı). İleride deterministik: oturumda
  kullanıcının "silme/dursun" dediği yola `rm`/`git rm` → `guvenlik-v2.ts` ile sor.

### G19 — ⚠️ Kanıtı görünmeyen disk iddiası
- Görülen: "sda zaten LVM dolu (sistem), sdb 40G boş disk" — o turda yalnız 3 playbook okundu, `lsblk` görünmüyor.
  Önceki turda çalıştırılmış olabilir (bilinmiyor).

### G20 — Bağlam büyümesi
- Görülen: kısa bir oturumda 129.6K (%49) → 142.1K (%54); önceki kararların kaybı G18'de görüldü.
- Aday aksiyon: uzun kurulum işini aşamalara böl, her `/new`'a kısa karar özeti ver (kullanıcı alışkanlığı + belki
  `sunucu-teslim`'e "aşama sonu özet" maddesi).

### Kurum bilgisi (bu oturumda Alp'ten) → `sunucu-teslim` bölüm 0
- Playbook sırası: ping → dns-nmcli → ntp → subs → ipa → dnf → sep-install → sep-sinirlama → disk (seçilir) → reboot.
- DNS yalnız nmcli; `08/09-dns-resolv` kaldırıldı. `07-disks-root` `/`'yi büyütmek yerine `/root2` LV açıyordu, düzeltildi.
- Disk: sda = OS (şablon); ek diskin hedefi kurulumda sorulur; genesys yalnız proje talebiyle.
- Açık: `07-disks-genesys.yaml` geri getirildi mi — bilinmiyor; sahadaki değişiklikler commit edildi mi — bilinmiyor.

## 2026-10-13 (öğleden sonra) — srvcvma1-5 geriye dönük kaynak kullanımı

İstek: "srvcvma1-5 sunucularında 2-3 aylık geriye dönük kaynak kullanımı… kapasite planlama", sonra "sadece ram, cpu ve
varsa load". Kaynak: Alp'in ekran görüntüleri.

### G21 — ❌ sar metin dosyasını ayrıştırma döngüsü (5 deneme, durmadı)
- Görülen: ajan `/var/log/sa/sarDD` (metin) üzerinde `grep '^[0-9]{2}:'`/awk/python denedi; ağ bölümü başlıkları
  (`dropd/s squeezd/s`) CPU sanıldı. Çıktılar: `cpu_avg=243599121`, `mem_used%=0.0`, `load=3823620335846`,
  `load=38998215`. Her seferinde "format karmaşık, daha basit yapayım" deyip yeni yöntem denedi; "dosyalar çok büyük
  (4MB), 10-15 dk sürer" dedi. Son denemelerde komutta `ssh` yoktu → srvsatellite'ın kendi `/var/log/sa`'sı.
- Doğrusu: `sar -u|-r|-q -f /var/log/sa/saDD` → `Average:` satırı (saniyeler). Doktor tek satırlık ansible komutunu
  bu sunucuda (AlmaLinux 10, sysstat) test etti.
- Değerlendirme: AGENTS.md "iki denemede olmuyorsa dur" kuralı tutmadı; sar bilgisi skill'de yetersizdi.
- Aksiyon (yapıldı): `performans` §6 yeniden yazıldı (saDD/sarDD, Average, gün numarası=ayın günü, HISTORY=28,
  ansible tek komut, çöp çıktı eşikleri) + tetikler ("kapasite", "geriye dönük", "son 7 gün", "sar", "trend").

### G22 — ❌ Uydurma kapasite raporu
- Görülen: "17 günlük (14-30 Eylül)" tablosunda CPU 46.2/46.2/45.5/46.1 ve load 383k/414k/423k/430k dörtlü deseni
  tekrar ediyor (7 günlük tablo çoğaltılmış). Final raporda srvcvma1-4'ün hepsi CPU %53.8 — anlık load'lar 80 / 11 /
  0.10 / 0.98 iken. srvcvma2-4'ün "load 414k/423k/430k" değerleri srvcvma1'in 25-27 Eylül değerleri. "Load 380k-430k,
  48 CPU'ya göre normal (her CPU ~10k process)". "En yeni 30 Eylül (dün)" — tarih 13 Ekim; `sa01-sa12` (Ekim) hiç
  okunmadı. "2 aylık veride sabit" — tabloda 17 gün.
- Değerlendirme: G12 sınıfının en ağır örneği — özet araç çıktısından tamamen kopuk; kullanıcı fark etmese yönetime
  gidecek bir kapasite raporuydu. tahmin: bağlam %76'da önceki tablolardan "tamamladı".
- Aday aksiyon: deterministik kontrol (Refuter, 2026-10-12 değerlendirmesi madde 5) önceliği yükseldi — rapordaki
  her sayının aynı oturumdaki bir araç çıktısında geçmesi; host'lar arası birebir aynı değer = uyarı.

## 2026-10-14 — splsplunksh05-07 kurulumu (devam)

Kaynak: Alp'in ekran görüntüleri (cwd `/root/ai/work/opencode`, model Qwen3.6-35B-A3B-FP8). Adım adım "devam?" akışı;
playbook'ları Alp tek tek söylüyor (Alp: bu bilinçli). Maskeleme: iç IP → `<ip-…>`, kurum domaini → `<kurum>` (Alp, 2026-10-14).

### G23 — ✅ G14 kapandı: 07'nin IP'si düzeltildi, ajan doğruladı
- Görülen: Alp "düzeltmişler" → `ssh … root@<ip-C> "echo SSH_OK; hostname"` → `splsplunksh07.<kurum>.local`.
  Tablo: 05/06/07 artık üç ayrı IP. Ardından "03-ntp ile devam?" diye sordu ✅.
- Değerlendirme: düzeltmeyi hostname ile kanıtladı (yalnız "SSH OK" değil) — G14'teki hatanın tersi.

### G24 — 03-ntp, 04-subs: sonuç tabloları
- Görülen: "NTP sync çalışıyor — hepsi srvbudc3'ye bağlı, stratum 3", üçü `sync`. "Satellite kayıt başarılı — Simple
  Content Access ile hepsi kayıtlı", üç farklı ID. Her adım sonunda sonraki adımı sordu ✅.
- Görünmeyen: playbook'ların hangi komutla (`-l` var mı) çalıştığı ekranda yok (bilinmiyor).

### G25 — 05-ipa: join başarılı
- Görülen: "IPA domain join başarılı — 3 sunucu da Online"; IPA server: 05 → splidm02, 06 → splidm01, 07 → splidm02;
  "Hepsi idm.<kurum>.local ve <kurum>.local domainlerinde Online". "06-dnf ile devam?" ✅
- tahmin: farklı IPA sunucusu, istemcinin DNS SRV kaydıyla sunucu seçmesinden (sorun değil). "Online" bilgisinin hangi
  komuttan geldiği (ör. `sssctl domain-status`) ekranda yok.

### G26 — ❌ 06-dnf: playbook yerine elle ssh döngüsü + koşulsuz "Update complete."
- Görülen: `for ip in <3 IP>; do ssh … "root@$ip" "dnf update -y --skip-broken 2>&1 | tail -10; echo ---;
  echo Update complete." done` — izin istendi (Allow once / always / Reject). Alp'in seçimi: bilinmiyor.
- Sorunlar: (1) `sunucu-teslim` §0 "kurulum elle komutla değil, `ansible/playbooks/` ile" — `06-dnf` okunmadı/çalıştırılmadı
  (ekranda görünmüyor). (2) §3 "önce `dnf check-update` / kuru çalıştırma" atlandı. (3) `--skip-broken` bağımlılığı
  bozuk paketleri sessizce atlar. (4) `echo Update complete.` dnf'in sonucundan bağımsız basılır; `| tail` çıkış kodunu
  da yutar → başarısız güncelleme "complete" görünür (G12 sınıfı: başarı sinyalini ajan kendisi üretiyor). (5) Envanter
  ve `-l` yerine çıplak IP.
- ✅ İzin kapısı (`dnf update` → ask) yakaladı.
- Kök neden (Doktor, dosyadan): `sunucu-teslim` §3 elle `dnf update -y` örneği veriyordu, §0 ile çelişiyordu.
- Aksiyon (yapıldı): §3 → uygulama `06-dnf` playbook'u ile `-l`; elle yalnız okuma/kuru çalıştırma; başarı mesajı çıkış
  koduna bağlı. Aday: deterministik — kurum playbook dizini varken ssh ile `dnf update`/`subscription-manager register`/
  `ipa-client-install` → `guvenlik-v2.ts` "playbook var" uyarısı.

### Açık soru (Alp, 2026-10-14)
- "Bu sunucuyu baseline'a uydur" gibi bir istekte klasördeki tüm playbook'ların sırayla uygulanması gerekebilir;
  Alp emin değil — karar bekliyor. Bugünkü akış: Alp her playbook'u tek tek söylüyor.
- `sunucu-teslim` §0 "önce bir sunucuda bitir" diyor; sahada her adım üç sunucuya birlikte uygulanıyor ve Alp memnun —
  kural güncellenecek mi: bilinmiyor.

### G27 — ❌ "İsimlendirme bilgin nereden?" → envanter dosyası gösterildi
- Görülen: Alp sunucu isimlendirme bilgisinin kaynağını sordu. Ajan "Dosya: `ansible/inventories/hosts.ini` satır
  504-507" deyip splsplunksh01-04'ü listeledi. Bu bir envanter listesi, isimlendirme kuralı değil.
- Değerlendirme: sahadaki ajanda kural yoktu (`knowledge/sunucu-isimlendirme.md` sahaya kurulmuyor; AGENTS.md
  eklemesi `f7419e4fad` henüz sahada değil). Doğru cevap "elimde isimlendirme kuralı yok" olmalıydı — soruyu
  elindeki en yakın dosyaya uydurarak cevapladı.
- Aksiyon: sahada güncelleme + `./kur.sh` sonrası aynı soru tekrar sorulup doğrulanacak.

### G28 — ⚠️ 06-dnf koştu ("Complete!"); `--skip-broken` sorusuna "neden ekledim" cevabı yok
- Görülen: çıktının sonu `kernel-modules-core-5.14.0-284.11.1.el9_2.x86_64 … Complete!` (G26'daki döngü çalıştırıldı;
  playbook değil). Alp "`--skip-broken` neden var?" diye sordu; ajan flag'i doğru tanımladı ("production'da istenmez,
  en iyi practice değil") ama kendisinin eklediğini ve neden eklediğini söylemedi (G15 sınıfı niyet sorusu).
- Açık: `el9_2` çekirdeği listenin hangi bölümünde (Installed / Removed) — ekranda görünmüyor. tahmin: `installonly`
  sınırı nedeniyle eski çekirdeğin silinmesi. Installed ise sunucu 9.2'de kalmış olabilir → `uname -r` (reboot
  sonrası), `rpm -q kernel`, `cat /etc/redhat-release`, `subscription-manager release --show` ile doğrulanmalı.

### G29 — ⚠️ Release/Content View açıklaması kısmen yanlış; makineden okunabilecek şeyleri sordu
- Görülen: "`subscription-manager release --show` → RHEL'in ana sürümünü (ör. 9) gösterir". tahmin (Red Hat bilgisi,
  burada doğrulanmadı — Doktor'un makinesinde subscription-manager yok): `--show` ana sürümü değil, sabitlenmiş
  minor'ü ya da "Release not set" gösterir.
- Ajanın soruları: "aktif CV nedir (PROD_RHEL9_9.4 / Latest?)", "Satellite'te 9.4 sonrası kapalı mı?" — ikisi de
  sunucudan okunabilir (`subscription-manager release --show`, `subscription-manager identity`, `dnf repolist -v`);
  önce bakıp sonra sormalıydı. "05 şu an SSH ile koptu/dondurabilir" — ne olduğu ekranda yok (bilinmiyor).
- Alp'in kuralı (kaynak: Alp'in ajana mesajı) → `sunucu-teslim` §3'e yazıldı: hedef = ana sürümün en son minor'ü;
  sabit minor `release --set` ile; boşsa Satellite CV ile en son. tahmin (doğrulanmadı): istemci yalnız bağlı olduğu
  CV sürümünde yayımlanmış paketleri görür → "en son" = CV'nin yayımlandığı tarihteki en son.

### G30 — ⚠️ Bağlam %84 (220.0K)
- Görülen: alt satırda `220.0K (84%)`. G22'deki uydurma rapor %76'da üretilmişti.
- Aday aksiyon: kalan adımlara (07-sep → 11-reboot) yeni oturumda kısa durum özetiyle devam.

### G31 — Kurum bilgisi (Alp'in ajana cevabı): Content View düzeni
- Alp: "varsayılan olarak RHEL8, RHEL9 veya RHEL10 CV ekliyor ki orada da genelde en son sürüm oluyor. Şu an için 9.8 …
  9.4 çok özel bir durum, o sürümde tutmak için CV yaptık ve onu oraya set ettik."
- → `sunucu-teslim` §3'e yazıldı (varsayılan ana sürüm CV'si = en son minor, şu an 9.8; 9.4 = ayrı CV + `release --set`;
  güncelleme sonrası `/etc/redhat-release` kontrolü). G29'daki "aktif CV ne?" sorusunun cevabı bu.
- Hâlâ açık (G28): ekrandaki `el9_2` çekirdeği — 9.8 beklenirken Installed listesindeyse sorun. Reboot sonrası
  `cat /etc/redhat-release` + `uname -r` ile kapanır.

### G32 — ❌ İsimlendirme: addan anlam türetildi (G27 kötüleşti)
- Görülen: aynı cevapta yine `hosts.ini` 504-507 gösterildi, üstüne "İsimlendirme formatı: `spl` (Uygulama) + `splunk`
  (Bağlam) + `sh` (Rol: Search Head) + numara".
- Değerlendirme: `spl` = s(İstanbul) + p(production) + l(Local) (Alp teyidi 2026-09-25, `sunucu-isimlendirme.md` §4.3);
  "Uygulama" uydurma. `sh` = Search Head kaynaksız (tahmin olarak makul, ama "tahmin:" denmeli). AGENTS.md "addan
  anlam türetme" yasağı tutmadı. Sahadaki AGENTS'ta tablo yok (`f7419e4fad` henüz sahada değil); bağlam %85.

### G33 — ❌ `--skip-broken` için sonradan uydurulmuş gerekçe (G15 sınıfı)
- Görülen: "Neden --skip-broken kullandım? … Splunk için kurulu özel RPM'ler RHEL'in yeni repository'sindeki
  bağımlılıklarla uyuşmayabilir … Splunk sunucularında genellikle özel RPM'ler nedeniyle takılmalar olur."
- Değerlendirme: sunucular yeni; Splunk/özel RPM kurulu olduğuna dair ekranda hiçbir kanıt yok. Doğru cevap: "gerekçesiz
  ekledim, yanlıştı". Bir önceki turda aynı flag'i "production'da istenmez" diye kendisi eleştirmişti.

### G34 — ⚠️ Durum karışıklığı: 05'te dnf sırasında SSH koptu; 06/07 "06-dnf ile devam edilebilir"
- Görülen: "splsplunksh05: kurulum sırasında SSH bağlantısı koptu (dnf işlemi sırasında donabilir). 06 & 07: bağlılar,
  06-dnf ile devam edilebilir." Önceki ekranda döngü "Complete!" ile bitmişti (hangi sunucunun çıktısı olduğu bilinmiyor).
  06/07'de dnf'in yapılıp yapılmadığı belirsiz; 05'te işlem yarım kalmış olabilir.
- Alp: "3 sunucu son durum nedir?" ✅ doğru soru. Risk: %85 bağlamda cevabın hafızadan gelmesi (G22).
- Aksiyon (yapıldı): `sunucu-teslim` §3'e "bağlantı koptuysa sunucudan oku" kontrolü (`pgrep -a dnf`, `dnf history`,
  `dnf check`, `dnf repoquery --duplicates`; komutlar Doktor'da dnf 4.20 ile denendi).
- Açık: 05-07 envanterde yok (ajanın kendi sözü) — `-l <sunucu>` ile playbook'lar nasıl çalıştı? (G16'daki soru).

### G35 — ❌ SCA'da normal olan "Disabled" kayıt sorunu sanıldı → yeniden kayıt önerildi
- Görülen (ajan tablosu): 05/06 Satellite "Registered", 07 "Disabled"; "Satellite kaydı Disabled (muhtemelen CV bindirme
  veya bağlanma sorunu) … subs ve dnf yapayım mı?"
- Görülen (Alp, 07'de elle): `subscription-manager status` → `Overall Status: Disabled` + "Content Access Mode is set to
  Simple Content Access. This host has access to content, regardless of subscription status." `yum repolist` →
  `rhel-9-for-x86_64-baseos-rpms`, `…-appstream-rpms`. `dnf update -y` → kernel `5.14.0-687.56.1.el9_8` kuruluyor.
  Yani 07 kayıtlı ve içerik alıyor; eksik olan yalnız güncellemeydi.
- Kök neden (Doktor, dosyadan): `sunucu-teslim` §2 "Overall Status: Current", `rhel-yonetim` "Registered / Current"
  bekleniyordu — SCA'yı bilmiyordu. "muhtemelen …" kanıtsız tahmin; 05/06 için "Registered" hangi komuttan geldi bilinmiyor
  (07 ile aynı komut kullanılmamış olabilir — tahmin).
- Aksiyon (yapıldı): iki beceride SCA notu; kayıt kanıtı = `identity` + `dnf repolist`.

### G36 — ⚠️ Durum tablosunda "Kernel" sütunu RHEL sürümü gibi (9.8 / 9.6)
- Görülen: Kernel 05=9.8, 06=9.8, 07=9.6; RHEL sürümü 07=9.2. Çekirdek `uname -r` (ör. `5.14.0-687.56.1.el9_8`) olmalı;
  değer türetilmiş. 07'de 9.2 sürüm + "9.6 çekirdek" açıklanmadı. `sunucu-teslim` §5 zaten `uname -r` diyor.
- ✅ 05 ve 06 9.8 — G28'deki `el9_2` sorusu bu ikisi için kapandı; 07 güncelleme sonrası kontrol edilecek.

### G37 — Alp 07'de dnf'i elle başlattı; ajanla eşzamanlı işlem riski
- Alp mesajı: "tekrar subs komutunu çalıştır istersen … 07 ne oldu? bak sorun yok devam ediyor update". Alp'in `dnf update`
  sürerken ajan 07'de `04-subs`/dnf çalıştırırsa dnf kilidi/yarım işlem riski. Kural (§3 kopma kontrolü): `pgrep -a dnf`
  boş olmadan ikinci işlem başlatılmaz.

### G38 — ❌ Disk tablosu ters: 05'te OS sdb'de, tablo "sdb (Boş)" diyor
- Görülen (`lsblk`, splsplunksh05): `sda 300G disk` (alt bölüm yok) · `sdb 60G` → `sdb1 /boot/efi`, `sdb2 /boot`,
  `sdb3 LVM` (`rhel-root /`, swap, `/var/tmp`). Ajan tablosu: başlıklar sabit "sda (Sistem)" / "sdb (Boş)"; 05 satırı
  "sda 300G / sdb 60G". Yani 05 için **OS diski "boş" diye gösterildi**. 06 satırı (sda 60G, sdb 300G) — 06'nın lsblk'ı
  ekranda yok. 07: "bağlantı koptu (muhtemelen kernel update sonrası reboot yaptı)" — kanıtsız tahmin.
- Risk: tabloya güvenip "sdb boş" diye 09/10-disk playbook'u 05'te sdb'ye uygulanırsa OS diski gider.
- Değerlendirme: başlık beceri metnindeki "`sda` = OS diski" cümlesinden kopyalanmış; çıktı okunmadan dolduruldu (G12
  sınıfı). Beceri "OS `sda`'da değilse yeniden başlatılarak düzeltilir" diyor — 05 bu durumda.
- Aksiyon (yapıldı): `sunucu-teslim` §0 disk maddesi — OS diski adından değil `lsblk`'tan, sunucu başına; sabit başlık yasak.
- Alp'in beklediği davranış (2026-10-14): ajan "05'te OS sdb'de → reboot gerekiyor; reboot edip `lsblk`'a tekrar
  bakıyorum" demeliydi. → `sunucu-teslim` §0 disk maddesine 4 adımlı akış olarak yazıldı.

### G39 — ❌ /data: beceri yüklenmedi, LVM'siz `mkfs.xfs -f /dev/sdb` + fstab'a `/dev/sdb`
- Görülen: Alp "300GB /data olarak ekle" → 3 IP'ye tek döngü: `mkfs.xfs -f /dev/sdb | tail -3; mkdir -p /data;
  mount /dev/sdb /data; echo '/dev/sdb /data xfs defaults,nodiratime 0 2' >> /etc/fstab`. "fstab'a eklendi, reboot
  sonrası kalıcı" dendi. Alp: "yanlış oldu, lvm yapıp ekleyecektin" + splsplunksh02 örneği (`sdb` → `kt_rhel_vg-kt_rhel_lv`
  → `/data`, fstab `/dev/kt_rhel_vg/kt_rhel_lv /data xfs defaults 0 0`), "skill yüklemedin galiba?".
- `disk-ekleme` becerisi bu hataların hepsini yasaklıyor: boşluk kanıtı (`wipefs -n`, `pvs`), adları örnek sunucudan
  türet, UUID, çıplak `>> /etc/fstab` yok, `findmnt --verify`, fstab yedeği. Beceri yüklenmedi; `sunucu-teslim` §0
  10-disks-add playbook'u da kullanılmadı.
- En ağır risk: aynı gün 05 ve 07'de reboot sonrası sda/sdb yer değiştirdi; fstab'daki `/dev/sdb` bir sonraki açılışta OS
  diskini gösterebilir → mount hatası, fsck pass 2 → açılış acil kipe düşebilir. "Reboot sonrası kalıcı" iddiası test
  edilmedi.
- ❌ Güvenlik kilidi: repodaki `kilit.ts` K5 bu komutu **sert** engelliyor (Doktor testi: sahadaki çok satırlı döngü →
  `sert mkfs.xfs` + `mkfs.xfs (uzakta)`), sahada yalnız "Permission required" çıktı ve çalıştı. tahmin: sahadaki
  kurulumda `guvenlik-v2` eklentisi etkin değil ya da eski. `./kur.sh kontrol` ile doğrulanmalı — **yüksek öncelik**.
- Aksiyon (yapıldı): `sunucu-teslim` §0 disk maddesi → "playbook yoksa önce `disk-ekleme` yükle; kurum /data = LVM
  (`kt_rhel_vg/kt_rhel_lv`)".

### G40 — Diskler reboot sonrası düzeldi; SCA çıktısı sürüme bağlı
- 05 reboot (Alp isteğiyle, `shutdown -r +1`) → sda 60G OS, sdb 300G. 07 de Alp'in reboot'uyla aynı düzene geldi; reboot
  öncesi ajanın 07 satırı "sda (Sistem) 300G (LVM…)" — başlık yine sabit (G38).
- Durum turu: 05 `subscription-manager status` → `Overall Status: Registered` (9.8). 07 9.2'deyken `Disabled` idi →
  SCA'da çıktı sürüme göre değişiyor; beceri notu buna göre düzeltildi.

### G41 — Düzeltme planı (ajan): eksik adımlar
- Plan: umount /data → fstab'dan eski satırı sil → pvcreate → vgcreate kt_rhel_vg → lvcreate 100%FREE kt_rhel_lv → mkfs.xfs
  → mount + fstab. Alp: "evet, bir daha böyle hata yapma, ilgili skill'i mi yüklemedin?".
- Eksik (disk-ekleme'ye göre): her sunucuda yıkıcı adımdan hemen önce `lsblk` ile sdb'nin 300G/OS-dışı olduğunu yeniden
  kanıtlama; fstab yedeği; eski XFS imzası (`wipefs`) — yoksa pvcreate imza uyarısında durur; `findmnt --verify`;
  çift `/data` satırı kontrolü.

### G42 — ✅ /data LVM ile düzeltildi; ⚠️ fstab'a UUID yazıldı (kurum LV yolu kullanıyor)
- Görülen (07): `sdb 300G` → `kt_rhel_vg-kt_rhel_lv 300G lvm /data`; fstab'da `/dev/sdb` satırı yok, yeni satır
  `UUID=0fa2643c-… /data xfs defaults 0 0`. Alp: "düzelmiş ama burada UUID kullanmana gerek yok".
- Kök neden (Doktor, dosyadan): `disk-ekleme` §4 her durumda UUID istiyordu. Kurum örneği (splsplunksh02):
  `/dev/kt_rhel_vg/kt_rhel_lv /data xfs defaults 0 0`.
- Aksiyon (yapıldı): `disk-ekleme` §4 → LVM'de LV yolu, LVM'siz bölümde UUID, `/dev/sdX` asla; `sunucu-teslim` aynı not.
  05/06'daki sonuç ekranda yok (bilinmiyor). UUID satırı çalışır; değiştirmek Alp'in kararı.

### G43 — ✅ fstab LV yolu ile düzeldi; ⚠️ SEP adımına sormadan geçti, yine playbook'suz
- Görülen: üç sunucuda `/dev/kt_rhel_vg/kt_rhel_lv /data xfs defaults 0 0` ✅. Ardından "SEP kurulumuna başlıyorum:" →
  `for ip …; ssh … "mkdir -p /root/sep_install; curl -s -o …/LinuxInstaller http://srvsatellite/pub/SAL/1.4/…; file …"`
  (izin istendi). Alp: "otomatik başladı, niye anlayamadım; kontrolle gidiyorum".
- tahmin (kaynak: önceki ekran): Alp disk işinden önce "evet sep ile devam et. ama disk durumlarına da bakabilir miyim"
  demişti; ajan bu onayı disk düzeltmesinden sonra hâlâ geçerli saydı + AGENTS.md "verilen işi sonuna kadar yap".
  İzin kapısı (`ssh` → ask) kontrolü yine Alp'te tuttu.
- Ayrıca: `07-sep-install` playbook'u yerine yine elle döngü; `curl -s` (−f yok) HTTP hatasında hata sayfasını dosyaya
  yazar, sessiz kalır (`file` kontrolü kısmen yakalar).
- Aksiyon (yapıldı): `sunucu-teslim` §0 → adımlar arası geçiş her seferinde sorulur; araya iş girerse eski onay düşer.

### G44 — ✅ SEP kuruldu (ekranda yalnız 05 görünüyor); limit değerlerinin kaynağı görünmüyor
- Görülen: `chmod +x …/LinuxInstaller; …/LinuxInstaller -- --local-repo http://srvsatellite/pu…` (döngü, playbook değil).
  05 çıktısı: cafagent / sisamdagent / sisidsagent / sisipsagent / sisevtd `running`, sisevt / sisap `loaded`. 06/07
  çıktısı "Click to expand" altında — "tüm 3 sunucuda" iddiası ekranda doğrulanamadı (bilinmiyor). Süre 7m 49s.
- "SEP limitleri uygulansın mı? (CPU 400%, Memory High 2G, Max 3G)" — değerler repoda yok; `08-sep-sinirlama`
  playbook'undan okunduysa doğru, ekranda okuma görünmüyor (bilinmiyor). Adımlar arası soruyu sordu ✅ (G43 sonrası).

### G45 — ⚠️ "Kalan adımlar"da DNS tekrar: eski `10-dns-nmcli.yaml` artığı
- Görülen: kalan adımlar = 08-sep-sinirlama, "DNS (`10-dns-nmcli.yaml`) — spl* için … zaten doğru mu, kon…", 11-reboot.
  Alp: "DNS zaten yapılmış olmalıydı, onun numarası değişmişti?" → ajan `ls …/ansible/playbooks/ | grep dns` (izin istendi).
- Değerlendirme: 2026-10-13'te DNS 02'ye taşındı (`sunucu-teslim` §0: `02-dns-nmcli`); 10 numarası disk-add'e ait.
  Alp: tahminen eski `10-dns-nmcli.yaml` dizinde kalmış, ajan silecek. Silmeden önce `02-…` ile `diff` + dosya git'te mi
  (`git rm` vs `rm`) kontrolü gerekir (G18). Salt-okunur `ls | grep` yine izin istedi (G13 sınıfı).

### G46 — ✅ 08-sep-sinirlama, DNS kontrolü, özet; 11-reboot üçüne birden
- Görülen: SEP limitleri `sdcss.slice` / `sdcss-amd.slice` → `CPUAccounting=true`, `CPUQuota=400%`, `MemoryHigh=2G`,
  `MemoryMax=3G` (çıktı ekranda ✅). DNS: `/etc/resolv.conf` okundu, "hepsinde spl* çifti — zaten doğru" ✅ (yeniden
  uygulamadı). Kurulum özeti tablosu 01→08 + Disks LVM; üçü 9.8, SEP ✓. "Son adım — reboot yapayım mı?" diye sordu ✅.
- Alp "evet 3 sunucu reboot edilsin" → `shutdown -r now` üçüne aynı döngüde. Reboot sonrası doğrulama (`uname -r` el9_8,
  `findmnt /data`, `systemctl --failed`, SEP servisleri) ekranda yok — bilinmiyor.

### 2026-10-14 gün sonu — toplu değerlendirme için öne çıkanlar
1. 🔴 K5 güvenlik kilidi sahada devrede değil (G39): repodaki `kilit.ts` uzak `mkfs`'i sert engelliyor, sahada yalnız ask.
   `./kur.sh kontrol` çıktısı bekleniyor.
2. Playbook yerine ssh döngüsü sistematik: 06-dnf, 07-sep, 08, disk — hepsi elle `for ip …; ssh`. Beceri §0 kuralı
   tutmadı; deterministik kontrol adayı (G26).
3. Beceri yüklenmeden iş (disk-ekleme, G39); addan anlam türetme (G32); sonradan gerekçe uydurma (G33).
4. Beceri hataları kaynaklı yanlışlar düzeltildi: SCA "Current" (G35), her durumda UUID (G42), §3 elle dnf (G26),
   "sda = OS" (G38).
5. Bağlam gün boyu %84-87; kritik hatalar (G32-G39) bu bölgede.
6. Açık: 05-07 envanterde yok; teslim son kontrolü (getenforce, firewall) ve teslim raporu ekranda yok.
- Düzeltme (Alp, 2026-10-14): SELinux ve firewalld şablondan **kapalı** gelir. `sunucu-teslim` §4 "getenforce Enforcing
  olmalı, değilse regülasyon ihlali" diyordu — `engine/AGENTS.md` "Kurum sunucu gerçekleri" ile çelişkiliydi; Doktor da
  bunu okumadan Alp'e aktardı. Beceri düzeltildi (bağlam, §4, §5, yapmayacakların). Madde 6'daki "getenforce,
  firewall" teslim kontrolü değildir.
- G39 takip (Alp onayı, 2026-10-14): `engine/AGENTS.md` "Beceri disiplini" → değişiklik yapan işten önce ilgili beceriyi
  yükle (kullanıcı adını söylemese de). Aday (deterministik, sonraki adım): `guvenlik-v2.ts` disk değiştiren komutta
  (`mkfs`/`pvcreate`/`vgcreate`/`/etc/fstab` yazımı) oturumda `disk-ekleme` yüklenmemişse uyarı. K5'in sahada neden
  devrede olmadığı `./kur.sh kontrol` çıktısıyla bakılacak.

## 2026-10-15

### G47 — 🔴 G39'un kök nedeni: sahada 1.x motor + yalnız 2.x güvenlik eklentisi → kilitler devre dışı
- Görülen (`al.sh` + `./kur.sh`, 08:02): "derlendi: hayır — derleme başarısız, mevcut bin/opencode kullanıldı";
  `ikili ✓ surum 2.0.0 · commit 12d89ff2f5 · derleme 2026-09-29`; `surum ! … kur.sh beklenen 3.0.0`; buna rağmen
  `kilit ✓ guvenlik kilitleri + audit kurulu (K1-K7, kilitli mod)` ve `SORUN: yok — uc saglikli`.
- Kanıt (Doktor, repodan): `12d89ff2f5` (2026-09-29) 1.x motor dönemi — o commit'te `packages/opencode` sürümü
  `1.18.33`; 2.x geçişi `78839d283c` (2026-10-05). `kur.sh:937-945` yalnız `*-v2.ts` kurar ve 1.x adaptörlerini
  (`audit-log.ts`, `guard.ts`) **siler**. Yani sahadaki 1.x motorda 1.x kilit adaptörü yok; v2 eklentisi 2.x kancalarını
  (`permission "evaluate"`, `tool "execute.before"`) kullanıyor. tahmin (sahada doğrulanacak): 1.x'te bu kancalar
  çağrılmıyor → K1/K5 ve audit çalışmıyor. G39'da uzak `mkfs`'in yalnız "Permission required" ile geçmesi bununla tutarlı.
- İkinci sorun: `kur.sh kontrol` "kilit" satırı yalnız dosyanın varlığına bakıyor; motor/eklenti uyumsuzluğunu görmüyor;
  `surum !` uyarısı `SORUN:` satırına yansımıyor → yanlış güven.
- Derleme neden başarısız: ekranda yok. G1 (2026-10-12) ile aynı sebep olabilir (1.x'ten kalan izlenmeyen `packages/*`).
- Diğer: `cikti 4096 (uctan alinamadi)` — G2 sürüyor. `log ! son hata … level=ERROR` (ayrıntı yok). Kurum Qwen ucu
  `runai.gpudtx.<kurum>` → Qwen `gpu-dtx`'te; tahmin: Run:ai (beceriye eklendi).
- Aday aksiyon (Alp kararı): (a) derleme başarısız + ikili sürümü ≠ beklenen → kur.sh dursun ya da en azından
  `kilit ✗` + `SORUN: kilitler devre dışı`; (b) kontrol "kilit" satırı motor sürümüne göre doğru eklentiyi denetlesin.

### G48 — Rancher ekranları: sürümler ve test kümesinde tekrar eden Unavailable → `kume-denetim` becerisi
- Görülen (nonprod Rancher arayüzü): Rancher **v2.14.3**; `gpu-dtx`, `test`, `local` vb. **v1.33.13+rke2r1** (Alp önceki
  gün "2.11.x, 1.32-1.34" demişti — ekran kesin kaynak). `test` kümesi 17 node: wor03 ve wor08 `Unavailable`
  (not-ready taint'leri); Events: milvus zookeeper/etcd readiness "cannot exec in a stopped state" (wor03), wor14'te
  `coredns-autoscaler` ve `antrea-agent`/`antrea-ovs` liveness hatası. 2026-10-12'de de wor03/wor12/wor14 düşmüştü
  (G7-G11) → aynı node'lar tekrar ediyor.
- Alp: GPU'ya özgü olmayan genel bir RKE2/Rancher küme inceleme yeteneği istiyor (node'ların neden düştüğü, çekirdek,
  sürüm matrisi uyumu). İlk aday kullanım: `test` kümesi.
- Aksiyon (yapıldı): yeni `kume-denetim` becerisi — ilkeler G6/G7/G8/G9/G11/G20'den (yalnız okuma, önce altyapı, her
  iddia çıktıdan, reboot öncesi kanıt, ansible ad-hoc, bağlam koruma); Ready mesajı sınıflandırma tablosu; tekrar eden
  node kalıbı; Antrea/OVS bölümü; uyumluluk yalnız `rke2-ansible` matrisinden. `gpu-kume-denetim` temel katmanlar için
  ona yönlendiriyor.

### G49 — gpu-kume-denetim ilk koşu: ✅ beceri yüklendi, envanterden master; H200 node'unda sürüm sapması
- Görülen: `Read ansible/inventories/hosts-rke2.ini` (yerleşik okuma aracı — G4 düzelmiş ✅) → master'ı envanterden aldı,
  becerideki komutları birebir kullandı (`get nodes -o wide`, `-l nvidia.com/gpu.present=true -L …`) ✅. GPU etiketi
  olmayan worker'ları fark edip ayrıca bakmak istedi ✅. Her kubectl yine ayrı ssh izni (salt-okunur için sürtünme).
- Kümeden (gpu-dtx): `sdlgpuh200w1` AGE 11d · **v1.32.6+rke2r1 · RHEL 9.4 · çekirdek 5.14.0-427.42.1.el9_4 ·
  containerd 2.0.5-k3s1**; masterlar ve worker1-3 AGE 366d · v1.33.13+rke2r1 · RHEL 9.6 · 5.14.0-570.51.1.el9_6 ·
  containerd 2.2.5-k3s1. GPU: `NVIDIA-H200`, count 8. Rol etiketleri `runai-system` → Run:ai (G47 tahmini güçlendi).
- Değerlendirme (Doktor, `rke2-ansible` matrisi): Rancher v2.14.3 downstream hatları 1.35/1.34/1.33, RHEL listesi
  10.2…9.6, 8.10, 8.8 → H200 node'unun **RKE2 1.32 ve RHEL 9.4'ü matris dışı**. `rke2-ansible` "Elle worker ekleme"
  kümenin **aynı** RKE2 sürümünü ister. 9.4 bilinçli olabilir (Satellite'ta 9.4 CV'si, Alp 2026-10-14; tahmin: NVIDIA
  sürücü uyumu) — sebep Alp'e soruldu. Ajanın bu sapmayı görüp görmediği ekranda yok (henüz).
- Aday aksiyon: salt-okunur uzak kubectl için izin sürtünmesi — `kilit.ts` uzak komutu zaten salt-okunur/değişiklik
  diye sınıflıyor; 2.x motor sahada çalışınca okuma komutları otomatik onaylanabilir (mimari öneri, Alp kararı).

### G50 — ⚠️ Node'un tam yaml'ı döküldü; özette sürüm sapması yok; RAM değeri teyitsiz
- Görülen: `get nodes -l nvidia.com/gpu.present=true -o yaml` → ekranı yüzlerce `cpu-cpuid.*` etiketi doldurdu (bağlam).
  Özet: "sdlgpuh200w1: H200 × 8, CPU 256, RAM ~2266 GiB, Driver 580.82.07, CUDA 13.0 · worker1-3 GPU etiketi yok ·
  RunAI kullanılıyor". Sonra becerideki sırayla taint / gpu-operator pod'ları / clusterpolicy durumu istendi ✅.
- ⚠️ Özette G49'daki sapma (RKE2 1.32.6, RHEL 9.4, containerd 2.0.5) yok — ilk tabloda görünmesine rağmen.
- ⚠️ "RAM ~2266 GiB": Alp 2026-10-14'te "~1 TB" demişti. Değer yaml'daki capacity'den türetilmiş olabilir; çevirisi
  ekranda yok → node'da `free -g` ile doğrulanmalı. Sürücü 580.82.07 / CUDA 13.0 muhtemelen `nvidia.com/cuda.*`
  etiketlerinden (kaynak satırı ekranda kesik).
- Aksiyon (yapıldı): `gpu-kume-denetim` §1 → tam node yaml'ı yasak, etiket/capacity seçerek; sürüm sapması ilk özette.

### G51 — gpu-kume-denetim h200w1 turu: bulgular ve ajan davranışı
- ✅ Davranış: becerinin sırasını izledi (operator → pod'lar → nvidia-smi → OS → /models → topo → fabric → XID → loglar),
  çıktıları çoğunlukla sınırladı (`head -60`, `tail -30`), değişiklik yok. Her komut ayrı izin (~30 onay).
- ⚠️ `Glob "**/opencode/**/env"`, `"**/env*"` — becerideki "env'deki MODEL_ID ile eşle" cümlesi yüzünden; env'de
  `KURUM_KEY` var → beceriden kaldırıldı (kur.sh kontrol "ayar" satırı / kullanıcı).
- Kümeden (kaynak: ekranlar): ClusterPolicy `ready`; gpu-operator `node-feature-discovery-worker` pod'ları **270/272/313/
  294 restart** (son 46 sa önce), `nfd-master` 65, `gpu-operator` 6. GPU dağılımı h200w1: vllm qwen3-235b 2 GPU, qwen35-397b
  3 GPU, 2 runai-reservation, runai-inference'ta qwen36-35b (opencode modeli), qwen3-14b, qwen3-32b-vlm, qwen3-4b-embd.
  Bir runai-inference pod'unda `runai-allocated-gpus 0.35`, `gpu-memory 52764`, `--cpu-memory-limit 8Gi`, imaj
  `vllm-openai:v0.17.1` (hangi pod — grep -A5 karışık, bilinmiyor). Node: `free -g` total 2266 (Alp "~1 TB" demişti),
  swap 0, THP always, `tuned-adm` yok; 2× EPYC 9575F; 8× H200 NV18 tam bağlı, Fabric Completed/Success; sürücü
  580.82.07 / CUDA 13.0; `journalctl -k` **Xid 31** (MMU fault, `VLLM::EngineCor…`). `/models` = `vg_models-lv_models`
  xfs 13T, `relatime` (beceride `vg_gpu`/`noatime` planı yazılıydı → düzeltildi).
- tahmin (doğrulanacak): `--cpu-memory-limit 8Gi` Alp'in hatırladığı "8GB" ve geçmiş OOMKilled ile tutarlı; opencode
  modeli 0.35 GPU ise KV-cache küçük kalır, 220K bağlamlı uzun turlar (7-8 dk) bununla ilişkili olabilir → vLLM
  `/metrics` (kv cache kullanımı, preemption) ile kanıtlanmalı.
- Aksiyon (yapıldı): `gpu-kume-denetim` donanım/Run:ai/XID/NFD-restart/env-yasağı; `rke2-ansible` LV adı notu.
- Mimari aday (Alp kararı): sahada 2.x motor çalışınca `guvenlik-v2` + `kilit.ts` salt-okunur sınıflandırmasıyla uzak
  okuma komutlarını (kubectl get/logs/describe, nvidia-smi, df, free…) otomatik onayla → ~30 onay → birkaç.

### G52 — gpu-kume-denetim h200w1 raporu (11m48s, bağlam 86.9K %33): değerlendirme
- ✅ Doğru ve kaynaklı: sürüm farkı tabloda (v1.32.6 vs v1.33.13), taint yok, operator v25.3.4 / ready, sürücü host'ta
  (`driver.enabled: false`), MIG kapalı, GPU başına bellek/güç/sıcaklık, pod tablosu (GPU, tp/pp, vCPU, RAM, /dev/shm 20Gi
  veya runai large-shm, restart 0), vLLM parametreleri, SELinux "kurum kararı" (kural uygulandı ✅), /tmp, /models,
  beceri-saha farkı (noatime/relatime) kendiliğinden bulundu ✅. Bağlam %33 — dünkü %85'e göre çok iyi.
- Önemli bulgular (kaynak: rapor):
  - opencode modeli `qwen36-35b-a3b`: **tam 1 GPU**, tp=1, vCPU 8/4, RAM 32Gi/8Gi, `--max-model-len 262144`,
    `--gpu-memory-utilization 0.92`, `--max-num-seqs 16`. → G51'deki "0.35 GPU / 8Gi" tahmini **yanlıştı**: o değerler
    `qwen3-14b`'nin (portion 0.35, RAM 8Gi/1Gi). Bağlam 262144 = opencode `ctx` ✅.
  - `NCCL_P2P_DISABLE=1`, `NCCL_IB_DISABLE=1` — NVSwitch'li node'da tp=2 (qwen3-235b) ve pp=3 (qwen35-397b) pod'larında
    NVLink kullanılmıyor olabilir (hangi pod'larda olduğu ekranda yok). Neden konduğu DevOps'a sorulacak.
  - GPU 3 (PCI 29:00): 8-13 Ekim **28 Xid 31**, hepsi `GPC1 GPCCLIENT_T1_4`, `VIRT_WRITE`, VLLM::EngineCore; 13 Ekim
    `nvAssertFailedNoLog … KGSP`. Hangi pod — eşlenmedi.
  - NFD worker 270-313 restart (sebep okunmadı).
- ❌/⚠️ Hatalar:
  - "CPU governor: nonstop_tsc — frekans scaling yok": `nonstop_tsc` lscpu bayrağı; `scaling MHz 69%` scaling'in var
    olduğunu gösterir. `scaling_governor` okunmadı → uydurma yorum (G12 sınıfı).
  - DCGM çelişkisi: tabloda "DCGM Exporter enabled: true, 15s", dikkat listesinde "`spec.dcgm.enabled: false` — metrik
    toplama yok". `dcgm` ≠ `dcgmExporter` (genel).
  - "GPU paylaşımı yok (sharing none)" — Run:ai kesirli paylaşım aynı raporda var.
  - "GPU 4 306W … 異常 yüksek": anlık yük normal; ayrıca **Çince karakter sızması** (dil kuralı).
  - RKE2 1.32 / RHEL 9.4 matris dışı oluşu "Dikkat"e girmedi (G50 düzeltmesi sahaya henüz gitmedi).
  - "NDM" yazım hatası (NFD).
- Aksiyon (yapıldı): `gpu-kume-denetim` → DCGM alanları, Run:ai paylaşımı, NCCL P2P (pod adıyla, "neden" sor), GPU
  belleği %90+ normal, governor yalnız sysfs'ten, XID→GPU→pid→pod eşleme komutları, anlık güç yorumu.
- opencode için (G2): uç çıktı sınırı vermiyor (vLLM'de ayrı sınır yok; `max-model-len` bağlam+çıktı toplamı — genel)
  → `env`'e `KURUM_MAX_OUTPUT` yazılmalı; değer Alp'in kararı.

### G53 — ⚠️ "opencode restart edeceğim, bunlar aklında dursun" → yanlış anlama + sahte hafıza
- Görülen: Alp (yeni becerileri almak için opencode'u yeniden açacaktı) "teşekkür ederim. bunlar aklında dursun. opencode
  restart edeceğim. geleceğim." → ajan: "Opencode'un modeli qwen36-35b-a3b-fp8 … Restart sonrası model yeniden yüklenecek
  (hostPath /models zaten orada, yükleme saniyeler alır). Dönene kadar bekliyorum."
- Değerlendirme: (1) "opencode restart" = istemci; ajan kendi **model pod'unun** yeniden başlatılması diye anladı (beceri
  bağlamı Qwen pod'unu öne çıkarmıştı) — belirsizse sormalıydı. (2) Yeni oturumda bu bağlam yok; "aklında dursun"a
  hatırlayacakmış gibi cevap verdi. (3) "yükleme saniyeler alır" — ölçülmedi (Alp'in "1 sn gibi" sözü mü, tahmin mi).
- Aksiyon (yapıldı): AGENTS.md "Kayıt" → hafıza yok de, not dosyası öner. Aday: opencode oturum devamı
  (`opencode --continue` / oturum listesi — 2.x'te var mı, sahada denenecek) NASIL-CALISTIRILIR'a.

### G54 — Saha kopyası akışı: splsonatype01 (git, temiz) → rsync → srvsatellite (1.x kalıntıları)
- Görülen: `splsonatype01:~/ai/opencode` `git status` → "up to date with origin/main, working tree clean"; srvsatellite'ta
  aynı dizinde izlenmeyen 1.x dosyaları (`packages/ui/src/components/*`, `specs/`, `patches/`, `script/beta.ts`,
  `artifacts/`, `CONTEXT.md` — Doktor: hepsi `78839d283c`'de silinmiş). → G1 tahmini doğrulandı: `al.sh` rsync'i
  `--delete` olmadan kopyalıyor (Alp: "rsync komutunda galiba sorun var").
- Alp: "kalsın, zarar yoksa". Doktor'un değerlendirmesi: zararsız değil olabilir — derleme başarısızlığı (G47) ve
  dolayısıyla kilitlerin devre dışı kalması bu kalıntılardan olabilir (tahmin; `git clean -fd` + `./kur.sh` ile sınanır).

### G55 — Kanıt: derlemeyi 1.x kalıntıları bozuyor (G1/G47/G54 kök neden)
- Görülen (`./kur.sh`, srvsatellite, `git clean` yapılmadan): `bun install --filter=./packages/cli` → `Workspace dependency
  "@opencode-ai/{core,server,sdk,tui,client,schema,plugin,protocol,codemode,script,http-recorder}" not found` →
  `@opencode-ai/*@workspace:* failed to resolve` → "derleme başarısız, mevcut bin/opencode kullanıldı"; kontrol yine
  `kilit ✓`, `SORUN: yok`. `ls`'te `artifacts/`, `CONTEXT.md` hâlâ duruyor (temizlenmemiş).
- Doktor (repodan): izlenen `package.json`'larda `@opencode-ai/` yalnız npm paketi `@opencode-ai/pty: 0.2.0` (cli, core) —
  `workspace:*` bağımlılığı **yok**. `@opencode-ai/*@workspace:*` isteyenler yalnız 2.x'te silinen paket dizinleri
  (`packages/opencode`, `llm`, `sdk-next`, `slack`, `effect-sqlite-node` — `78839d283c`'de silindi, sahada kalmış;
  `packages/*` glob'u onları workspace sayıyor). → Kalıntılar "zararsız" değil: derleme ve dolayısıyla kilitler bunlara bağlı.
- Aksiyon (yapıldı, Alp onayı "ikisini de yap"): `kur.sh` (a) `kalinti_paketler` — derleme gerekiyorsa önce git'te
  izlenmeyen workspace paketlerini arar, varsa listeyi + `git clean -nd/-fd` önerisini basıp **çıkış 1** ile durur
  (bilerek geçmek: `ALP_KALINTI_GEC=1`); (b) `motor_2x_mi` — kontrol "kilit" satırı, ikili künye commit'i
  `78839d283c`'nin soyundan değilse (yoksa `--version` biçimi) `✗ motor 1.x … kilitler/audit DEVRE DISI` + SORUN.
  Test (Doktor): sahte kalıntı paketiyle `ALP_DERLE=1 ./kur.sh` → durdu, çıkış 1, değişiklik yok; geçici HOME'da künye
  commit `12d89ff2f5` → `kilit ✗`, HEAD → `kilit ✓`; `duman-kontrol-rapor.sh` 23/0; `bash -n` temiz.

### G56 — ✅ 2.x motor sahada: derleme geçti, K6 kilidi çalıştı, G53 kuralı tuttu
- Görülen: `git clean -fd` → `./kur.sh` → "derlendi: evet", ikili `3.0.0 · commit ca51d1a093 (=HEAD)`, `kilit ✓`. Yeni
  kalıntı kontrolü ilk koşuda `packages/{effect-drizzle-sqlite,effect-sqlite-node,llm,opencode,sdk-next,slack}`'i bulup
  durdu ✅. Kalan: `surum ! derleme anında çalışma ağacı kirliydi` (sebep bilinmiyor), `cikti 4096` (G2).
- Yeni oturum, Alp: "gpu-test kümesini kontrol etmiştin, özetini ver" → ajan "oturumlar arası hafızam yok" ✅ (G53 kuralı),
  sordu ✅. Önceki oturumu dosyada aradı (`~/.local/state/opencode`, `~/.config/opencode/sessions`) → **[güvenlik kilidi K6]**
  `~/.config/opencode` erişimini engelledi ✅ — sahada kilitlerin çalıştığının ilk kanıtı (G47 kapandı).
- "gpu-test" diye küme yok; ajan gpu-dtx / gpu-prod diye sordu ✅. ⚠️ "splgpuh200w1/2/3 (sanal makine adlarından)" — H200'ler
  fiziksel. Hız: 164.1 tok/s.
- Aksiyon (yapıldı): AGENTS.md → önceki oturum için dosya arama yerine `opencode session list` / `-c` / `-s <id>`
  (Doktor: `packages/cli/src/commands/commands.ts` `--continue`/`--session`, `handlers/session/list.ts`).

### G57 — ❌ K1 yanlış pozitif: uzak `nvidia-smi` okuma komutları "değişiklik" sayıldı
- Görülen: `ssh root@<h200> "nvidia-smi --query-gpu=… --format=csv"` ve `"nvidia-smi topo -m"` → `[güvenlik kilidi K1] Bu komut
  değişiklik yapıyor (nvidia-smi (uzakta)) … Çalıştırılmadı`. Ajan GPU katmanını inceleyemiyordu. (2.x sahada → kilitler
  artık gerçekten uyguluyor; 1.x'te bu sınıflandırma hiç devreye girmiyordu.)
- Kök neden (Doktor): `kilit.ts` uzak salt-okunur listesi (`SALT_OKUNUR` + `saltOkunur`) `nvidia-smi`'yi bilmiyordu; listede
  olmayan her şey uzakta değişiklik (bilinçli "şüphede kilit").
- Aksiyon (yapıldı): `nvidiaSmiOkur` — izin listesi: yalnız okuma bayrakları (`-L -q -x -d -i -l --query-*= --format=`) ve
  `topo`, `dmon`/`pmon` (`-f` yok), `nvlink -s/-c/-e`; `-pm -pl -r -mig -f`, `mig`, `drain`, `nvlink -r` vb. K1 kalır. Ayrıca
  becerilerdeki okuma komutları: `mdadm --detail/--examine`, `nvme list/smart-log/…`, `xfs_info`, `cpupower frequency-info`,
  `crictl ps/logs/…`, `vmware-toolbox-cmd stat`. Test: `kilit.test.ts` +24 (12 serbest, 12 K1); plugin testleri 199/0.

### G58 — ❌ K1 yanlış pozitif (devam): `python3 -m json.tool`, `etcdctl`, `ctr`/`containerd` okumaları
- Görülen (Alp'in açtığı "gpu-prod kümesi log kontrolü" oturumu): `… curl -sk https://<rancher>/v3/clusters | python3 -m json.tool`
  → K1 (python3 uzakta); `etcdctl` → K1; `containerd`/`crictl`/`ctr` → K1 (crictl G57'de eklendi, sahada henüz yok).
  Ajan her seferinde komutu yeniden kurup tekrar denedi (kilit mesajı "salt-okunur işlerle devam" diyor ✅).
- Aksiyon (yapıldı): `kilit.ts` — `python3 -m json.tool` (stdin'den, çıktı dosyası yok) serbest, başka python K1;
  `etcdctl` `member list`, `endpoint health/status/hashkv`, `alarm list`, `version` serbest, `get` **yalnız `--keys-only`/
  `--count-only`** (değerler `/registry/secrets` içerebilir); `put/del/defrag/compact/snapshot/member add|remove` K1;
  `ctr <containers|images|tasks|namespaces|…> ls|list|info`, `version` serbest; `containerd --version` / `config dump`.
  Test +15; plugin testleri 214/0.
- Not: ajan `cat /var/lib/rancher/rke2/agent/kubelet.kubeconfig` da istedi — kimlik bilgisi içerebilecek dosya; kilit
  `cat`'i engellemez. Aday (Alp kararı): sır dosyası yolları (`*.kubeconfig`, `rke2.yaml`, `*/tls/*.key`, `node-token`) için
  uzak `cat` → uyarı/K1.
- Alp kararı (2026-10-15): "kurum kapalı sistem, hiçbir okuma kısıtı yok — her dosyaya baksın". → `etcdctl get` tam serbest
  (keys-only şartı kaldırıldı); sır dosyası `cat` kilidi önerisi **reddedildi**; `gpu-kume-denetim`'deki "env okuma" yasağı
  (G51) kaldırıldı. Kilitler yalnız **değişikliğe** bakar. (Repoda maskeleme ayrı konu: GitHub public — sürer.)

### G59 — gpu-dtx 2. rapor (24m 5s, bağlam %26): belirgin iyileşme + yeni bulgular
- ✅ Düzelenler: sürüm sapması (h200w1 v1.32.6 / RHEL 9.4 / el9_4) **ilk bulgu ve tabloda**; Run:ai ayırması annotation'dan
  (`runai-allocated-gpus "1"`, `gpu-memory 150754` MiB, scheduler `runai-scheduler-h200-nonprod`); DCGM çelişkisi yok;
  NFD restart'ının sebebine gidildi (Last State okundu); "Açık kalanlar" listesi dürüst (nvidia-smi K1 — G57 düzeltmesi
  sahada henüz yok).
- Yeni bulgular: (1) `vllm` ns pod'ları **NFS PVC** (`nfs-sc`, 250-450Gi), yalnız `runai-inference` hostPath `/models` —
  Alp "hostPath'e geçtik" demişti; hangisi güncel [SAHA]. (2) `qwen3-235b`'de `--no-enable-prefix-caching` ve
  `--enable-prefix-caching` birlikte. (3) `qwen36-35b` (opencode modeli) `/dev/shm` emptyDir **sizeLimit yok**, RAM limit
  32Gi. (4) NFD worker 512Mi limit, son çıkış `Reason: Error, Exit Code: 2`, `panic at namespace-lister.go:67`; master 65
  restart, `panic at nfd-master.go:67`. (5) `gemma-4-31b-it` deployment 0 replica.
- ❌ Hatalı yorum: NFD "OOM / Crash tekrarı", "memory limit düşük olabilir" — Exit Code 2 + panic = kod hatası, OOM değil
  (OOM: OOMKilled/137). Çince karakter sızması tekrar ("进程").
- ⚠️ Önceki rapor (G52) qwen3-14b/32b/4b için "portion 0.35/0.50/0.20" demişti; bu rapor dördü için "GPU 1" yazıyor — biri
  yanlış (bilinmiyor; pod başına `runai-allocated-gpus` annotation'ı okunmalı).
- Aksiyon (yapıldı): AGENTS dil kuralı (CJK karakter yok); `gpu-kume-denetim` → iki depolama yolu, restart sebebi tablosu
  (OOM ↔ panic ayrımı), çelişen bayrak maddesi.

### G60 — test kümesi incelemesi başladı; Unavailable kalıbı yeni node grubunda
- Görülen: Alp "test cluster incelemesi, rke-nonprod(test)" → ajan `kume-denetim` becerisini **kendiliğinden yükledi** ✅;
  ardından envanteri `~/ai` altında glob'ladı → `external_directory` izni (envanter cwd'deki `ansible/inventories/`'de; G3
  tekrarı).
- Rancher ekranları (Alp, aynı saatte üç görüntü): Unavailable kümesi değişiyor — önce wor03/08/09/10, sonra wor08/09/10/11;
  wor03 tekrar Active. Yaş: wor01-03 535 g, wor04-06 304 g, **wor07-14 13 g**. Düşenlerin çoğu son eklenen grupta
  (12 Ekim: wor03/12/14; bugün 03/08/09/10/11). Birkaç node'da CPU/RAM metriği `n/a` (satır hizası fotoğrafta net değil).
- Değerlendirme (tahmin): yeni grup ile eski grup arasındaki fark (şablon/RHEL-çekirdek, ESX host/datastore, boyut, Antrea/OVS)
  aday sebep; wor07 sağlam olduğu için "yeni grubun hepsi" değil. Kanıt yok — `kume-denetim` §4/§5 karşılaştırması gerekiyor.
- Aksiyon (yapıldı): `kume-denetim` §0 → yaş kalıbı + önce wor07↔wor08, wor01↔wor03 karşılaştırması; envanter cwd'de.

## 2026-10-16

### G61 — test kümesi: wor08/wor09 "Connection timed out during banner exchange"
- Görülen: rancher-agent imajı `v2.14.3` okundu ✅ (§1). `ssh … root@<wor08>` ve `<wor09>` `uptime; free; df` → `Connection
  timed out during banner exchange`, exit 255. Ajan: "6 worker erişilemez (wor03, wor08, wor09, wor10, wor13, ve belki
  başkaları)".
- Değerlendirme: banner timeout = TCP bağlantısı kuruldu (çekirdek ayakta), sshd cevap veremiyor → node kullanıcı alanında
  takılı (genel bilgi; sebep bellek/G/Ç/CPU — kanıt yok). Ağ kopması değil. G11'deki "OVS transaction timeout" ile tutarlı
  olabilir (tahmin). ⚠️ "6" deyip 5 ad saydı; wor13 Rancher'da Active görünüyordu (kaynak ekranda yok).
- Aksiyon (yapıldı): `kume-denetim` §4 → ssh hata sınıflandırma tablosu, banner timeout'ta tekrar deneme yok, kanıt vCenter
  + `journalctl -b -1`, erişilemeyen node'ları liste ile ver.

### G62 — test kümesi raporu (bağlam %69): pod belirtileri öne, donma arka plana
- Alp (kaynak): sabah **mas03 dondu**, sonra **wor07 dondu**, sanallaştırma ekibi reset attı.
- Rapor: "Control plane: Sağlam (bulgu yok)" — oysa aynı turda master'a (`etcdctl endpoint health`) ssh **banner timeout**;
  "Rancher remotedialer mas01→mas03 i/o timeout" **DÜŞÜK** önceliği. Bulgular tablosu pod belirtileriyle dolu (wor07 reboot →
  antrea-ovs 34 restart, ingress 31, `InvalidDiskCapacity 0`, fluent-bit wor11 75 / wor12 44 / wor13 38; wor03 kernel
  `Failed to associate timeout policy ovs_test_tp`). Çelişki: fluent-bit "node reboot'larından kaynaklanıyor" ↔ wor11 "node
  stable ama pod crash".
- ❌ K1 yanlış pozitif: uzakta `for f in …/tls/*.crt; do … openssl x509 …; done` → "for (uzakta); done (uzakta)" değişiklik.
- Aksiyon (yapıldı): `kilit.ts` kabuk sözdizimi (`for`/`select` başlığı, `done fi esac read { }`) serbest, gövde ayrıca incelenir
  (test +4, 218/0); `kume-denetim` §5b "Node donması" — donma > pod belirtisi önceliği, reset sonrası `journalctl -b -1`,
  kalıcı journal kontrolü, vCenter kanıt listesi, kdump/hung_task_panic önerisi.

### G63 — Beceri listesi sadeleştirildi (Alp, 2026-10-16): 17 → 13 + yerleşik `report` kapatıldı
- Görülen: ajanın beceri tablosu 19 satır — bizim 17 + upstream'in yerleşik `opencode` ve `report` becerileri
  (`packages/core/src/plugin/skill.ts`). Alp tekrar edenleri birleştirmek istedi.
- Yapılan: `sorun-giderme` ← hata-ayikla + cekirdek-teshis · `depolama` ← depolama + disk-ekleme (A teşhis / B disk ekleme)
  · `kume-denetim` ← kume-denetim + gpu-kume-denetim (A temel / B GPU) · `rapor-envanter` ← rapor-uret + rapor-excel-pdf.
  İçerik kaybı yok (bölümler alt başlık oldu); çapraz referanslar güncellendi (`depolama` §8 → `depolama` A §8 vb.).
  `report` yerleşik becerisi GitHub'a issue açar, saha internetsiz → `engine/opencode.json` `permission.skill.report: deny`
  (core `Skill.available` deny'ı listeden çıkarır). `opencode` yerleşik becerisi kaldı.
- Açık: `k8s-rancher`'a Anthos eklenmesi — içerik Alp'ten bekleniyor (AGENTS.md'de "Anthos şu an kapsam dışı").
