# AGENTS.md — Alp'in kurum kuralları (aider'dan aktarıldı)

## Dil ve üslup
- Yanıtlar **Türkçe**; komut/kod İngilizce kalır. Gereksiz giriş cümlesi, özet, övgü yazma.
- Kanıt olmadan "yaptım / düzeldi" deme: çalıştırdığın komutu ve çıktıyı göster.

## Kaynak zorunluluğu — uydurma yasak (Alp kuralı — 2026-09-25)
- **Yazdığın her değer bir kaynaktan gelmeli:** okuduğun dosya + satır, çalıştırdığın komutun çıktısı
  ya da kullanıcının mesajı. Kaynak istenirse göster: `dosya:satır` / komut / mesaj.
- **Bilmiyorsan boş bırak ve sor.** Alanı `[SAHA]`, `bilinmiyor` veya `ölçülmedi` işaretle ve kullanıcıya
  "bu bilgi bende yok — sen mi vereceksin, yoksa şu dosyada mı?" diye sor. Sormak serbesttir.
- **Yasak:** örnek/hipotez tablosunu gerçek veri gibi yazmak; bir ad/kod parçasından anlam türetmek
  (ör. `spl`, `stl`, `std` → lokasyon/ortam eşlemesi); "muhtemelen / büyük olasılıkla" bilgisini kesin
  gibi sunmak; sayı uydurmak.
- Doğrulanmamış bir kuralı dosyaya **yazma** — önce doğrula; doğrulayamıyorsan yazma, boş bırak.

## Envanter / rapor işleri (en sık senaryo) — kural hiyerarşisi
1. **Kullanıcı açıkça "bağlan", "kubectl çalıştır", "envanteri canlı çıkar" derse ssh/kubectl
   SERBESTTİR.** Bu durumda §"SSH ve Kubernetes erişimi" altındaki gerçek yolları/kuralları kullan.
2. **Aksi halde (kullanıcı yalnız "envanteri çıkar" / "sayıları ver" dediyse) envanter işi
   salt-okunurdur:** `Read` / `Glob` / `Grep` ile `hosts*.ini`, kubeconfig, CSV/XLSX içeriğini oku;
   tabloyu kur. Playbook çalıştırma, dosya değiştirme, sunucuya bağlanma — bunlar 1. maddedeki açık
   istek olmadan yapılmaz.
- **Sayı/birim tutarlılığı zorunlu:** aynı tabloda birim karıştırma; satır toplamlarını tek tek doğrula
  (KUME-B + KUME-A toplamı gibi). Kaynağı ve tarihi yaz; ölçmediğin sayıyı "ölçülmedi" diye işaretle.

## SSH ve Kubernetes erişimi (kullanıcı açıkça istediğinde — Alp kuralı, 2026-09-15)
- **Bağlanmak için host dosyası ARAMAYA GEREK YOK.** Erişim **public key** ile parolasız:
  `ssh root@<ip> "<komut>"` doğrudan çalışır. `/etc/hosts`, `hosts*.ini`, kubeconfig peşinde tüm
  dosya sistemini taramak anlamsız — sunucu listesi gerekiyorsa yeri **belli** (arama değil, doğrudan oku).
  **Bu yollar makineye özgüdür — kör kör güvenme, önce `ls` ile doğrula:**
  - **test-sunucu.ornek.local'da** (denetim bulgusu #18, 2026-09-16 itibarıyla): `~/ansible/hosts-k8s-master.ini`
    (~132 satır), `~/ansible/hosts-all.ini` (~284 satır), `~/rke2-ansible-*` klasörleri, ansible.cfg:
    `/root/aider-work/ansible/ansible.cfg`.
  - **Bu makinede (opencode-agent'ın geliştirildiği host) bu yollar YOK** — burada envanter/ansible işi
    varsa `ansible` becerisindeki genel yordamla (proje düzeni, `hosts-<proje>.ini` bul/oluştur) ilerle,
    yukarıdaki sabit yolları burada arama.
- **kubectl için:** `KUBECONFIG=/etc/rancher/rke2/rke2.yaml` — örn.
  `kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes`.
- **ssh güvenliği:** `StrictHostKeyChecking=accept-new` kullan — **asla `no`**.
- **🚫 dahili-bulut erişilemez** (bilinen kısıt): `dahili-bulut.ornek.local` / `192.0.2.x` / `198.51.100.x` —
  bu adreslere ssh **denenmez**; envantere "erişilemez (bilinen kısıt)" notuyla konur (gerçek
  kurum adı/aralığı için Alp'e sor — burada bilinçli olarak genelleştirildi, 2026-09-16, K2).
  Anthos ayrı sınıflandırılır, aynı kısıt Anthos için varsayılmaz.

## Güvenlik kilitleri (Alp kuralı — 2026-09-24, teknik olarak zorlanır: `audit-log.ts`)
- **Değişiklik = yetki.** Sunucuda/sistemde değişiklik (playbook `--check`'siz, ssh ile yazan komut,
  servis/paket/ayar, `/etc` düzenleme) ancak kullanıcı mesajında yetki varsa ve hedef listedeyse çalışır:
  `CN: <numara>` + `sunucular: a, b` · yeni kurulum: `KURULUM` + `sunucular: …` (CN gerekmez) ·
  kriz: `KRİZ` + yapıştırılmış kriz maili/toplantı notu + `sunucular: …`. Bu makine = `localhost`.
- **Kriz akışı:** mail yapıştırılınca etkilenen sunucuları maildan çıkar, listeyi öner ve **dur** —
  liste ancak kullanıcı `sunucular: …` yazınca geçerli olur. Yetki satırını sen yazamazsın/üretemezsin.
- `ansible-playbook` değişikliğinde hedefi her zaman `--limit` ile ver; salt-okunur iş yetkisiz serbest.
- **Asla açılmayanlar:** `rm -rf /`-benzeri, mkfs, diske `dd`, force-push; kendi ayarın/eklentin/audit log.
- Kilit reddederse atlatmaya çalışma (başka komut, betik, farklı yazım): kullanıcıya neyin neden
  gerektiğini tek cümleyle söyle.
- **Atlatma yolu ÖNERME.** Kilit reddederse etrafından dolaşma yolu **sunma** (dosyayı `/tmp`'ye kopyalayıp okumak,
  `bash` üzerinden denemek, farklı araç/yazım, `--limit` ile hedefi gizlemek...). Ne yapamadığını ve **neden**
  gerektiğini tek cümleyle söyle; içerik gerekiyorsa **kullanıcı kendisi paylaşsın**.

## Güvenlik ve sınırlar
- Yıkıcı komut (rm -rf, mkfs, dnf remove, servis durdurma, force push) → **önce sor**.
- Kurum dışına veri gönderme; dış ağ/telemetri kapalı varsay.
- Üretim kümesinde çalışmadan önce "hangi küme bağlı" doğrula (`k8s-rancher` becerisi).
- **Tanımadığın/kısıtlı bir makinede tam-monorepo paralel build/typecheck/lint çalıştırma** (`bun turbo
  typecheck`, `turbo run build` gibi kökten tetiklenen, workspace'teki her paket için ayrı süreç açan
  komutlar). Önce `nproc`/`free -h`/swap durumuna bak; küçükse (ör. 2 vCPU, swap yok) tek paket bazında
  çalıştır ya da `--concurrency=1|2` ile sınırla. Kanıtlı olay: opencode reposunda (`/root/ai/opencode`,
  2026-09-19) bu şekilde ~30 paralel `tsgo` süreci makineyi tamamen dondurdu, 5 kez hard-reboot gerekti
  (bkz. `NASIL-CALISTIRILIR.md` → "Root'tan tam typecheck/build ÇALIŞTIRMA").
- **İzinler bu dosyada TANIMLANMAZ.** Hangi komutun onaysız çalıştığı (`allow`/`ask`/`deny`)
  `opencode.json` → `permission` bloğunda yazılıdır, burada değil. "AGENTS.md'ye göre izin
  politikası" diye bir şey söyleme/varsayma — iki dosyayı karıştırma: burası **davranış kuralı**,
  `opencode.json` **izin kapısı**.

## Dosya arama
- Tüm dosya sistemini `find /` (ya da `/root`, `/home`, `/var` gibi geniş kökler) ile tarama.
  Yol biliniyorsa (bu dosyadaki "SSH ve Kubernetes erişimi" gibi) doğrudan oku/aç.
- Yol bilinmiyorsa ve gerçekten aranması gerekiyorsa **doğrudan kendin** `Glob`/`Grep` ile hedefli bir
  arama yap. `@explore`/`task` (alt-ajan) **kullanma** — `opencode.json`'da `permission.task: "deny"`
  (2026-09-16, faz0-yuzeye-getir): kurumun 16k pencereli modelinde araç şemasını küçük tutmak için
  bilinçli kapatıldı (bkz. `NASIL-CALISTIRILIR.md` "Compaction thrash" — `task` şemasının geri açılması
  aynı context-taşması/livelock riskini geri getirir). Bu iki kural birbiriyle çelişiyordu (denetim
  bulgusu #5); tercih şemayı küçük tutmaktan yana kullanıldı, bu yüzden talimat kaldırıldı.
- **Aynı turda birden fazla bağımsız tarama başlatma** (tek seferde 4 ayrı `find`/`grep` gibi).
  Tek bir hedefli arama dene, sonucu değerlendir, gerekiyorsa bir sonrakini öner.

## Beceri (skill) disiplini
- Beceriler talep üzerine yüklenir; konu kapanınca bırak. Kullanıcı "ansible işlerini bırak" dediyse
  o beceriyi tekrar yükleme.
- Kullanıcının cümlesini tersine çevirme: "x önemli değil" = **x'i yok say** (x'i yapma demek değil).

## Pencere ve endpoint (kurumsal vLLM)
- Bağlam penceresi **küçük** (kurulumda tespit edilen gerçek değer neyse — `/context` veya ekrandaki
  "X tokens / %Y used" göstergesine bak, sabit bir sayı varsayma). Uzun dosya/log'u parça parça oku
  (`offset`/`limit`), tümünü birden çekme.
- Endpoint yavaş: ilk yanıt 60–180 sn sürebilir. Panik yapma; aynı isteği üst üste yineleme.

## Tek adım disiplini (Alp kuralı — 2026-09-15, compaction thrash sonrası)
- Bir araç (tool) çağırdıktan ve sonucu aldıktan sonra **dur**, sonucu kullanıcıya döndür.
  "Next Move / Sıradaki adım: ..." gibi bir sonraki-tur planı üretip kendi kendine devam etme —
  görev bitmediyse bile, kısa bir durum özeti ver ve kullanıcının onayını bekle.
- Bağlam penceresi küçük: plan yazmak da, gereksiz araç çağrısı da pencereyi tüketir.
  Emin değilsen çağırma; sor.

## Çalışma dizini boşsa (Alp kuralı — 2026-09-15)
- Çalışma dizini boşsa ya da beklenen proje köküne (AGENTS.md/README/engine/knowledge gibi işaretler)
  rastlamıyorsan, ilk satırda bunu açıkça söyle: `Çalışma dizini boş / proje kökü bulunamadı: <yol>`.
  Sessizce üst dizine geçme, sessizce beklemeye devam etme.
- Kullanıcının isteği açıkça üst/komşu dizini kapsıyorsa (`external_directory` kapsamı), aynı turda
  tek bir izin iste ve sonucu bekle — tekrar tekrar aynı isteği üretme.

## Kayıt
- Yaptığın değişikliği tek satırda özetle (dosya + ne + neden). Sessiz değişiklik yok.

## Çalışma dizini kapsamı (Alp kuralı — 2026-09-11; A104 — 2026-09-25; A105 — 2026-09-25)
- **Açılışta çalışma dizinini tespit et ve ilk satırda duyur:** `Çalışma dizini: <yol>`.
- Yalnızca bu dizin ağacında çalış. **Dizin değiştirme yok:** `cd` ile başka klasöre geçme,
  başka klasörlerde `find`/`grep`/`ls`/`rg` çalıştırma.
- Proje kökünün dışındaki bir dosyayı okumak/aramak gerekiyorsa **dur ve izin iste**
  (tek tek dosya söyle, gerekçesini yaz). İzin yoksa o yola hiç dokunma.
- Kullanıcı "sadece şu dizin" dediyse bu kural emirdir; beceri/araç ne derse desin dışına çıkma.
- **Çalışma dizini = kapsam. İçindeki her şeyi serbest oku.** Sır/envanter dosyaları (`hosts*`, `env`,
  `*.key`, `*.pem`, `*token*`, `*secret*`, … — bkz. `PERMISSION-MATRIX.md` §5) dahil, çalışma dizini
  İÇİNDE okuma kısıtı **yok** (A105 — Alp: "çalışma izni içerisindeki dosyalara erişimin
  kısıtlanması hiç uygun bir güvenlik kilidi değil"). **Dışına çıkarken izin iste.**
- Okuduğun gizli bilgiyi (anahtar/IP/FQDN/kişi adı, parola, token) çıktıya veya repoya **yazma** —
  kısıt okumadan çıktıya taşındı: oku, ama redakte etmeden yapıştırma/kaydetme.
