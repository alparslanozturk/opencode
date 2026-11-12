# SÜRÜM NOTLARI — opencode ajan kiti

> **Güncel saha yüzeyi (2026-09-22):** **`./kur.sh`** TEK betiktir — parametresiz çağrı = `kur`
> (gerekirse derler, kurar, sonda kontrol raporunu basar); alt komutlar: `derle` · `kontrol` ·
> `yardim` (`-h`/`--help`). `01-derle.sh`/`02-kur.sh`/`03-kontrol.sh` kaldırıldı, üçü `kur.sh`
> içinde fonksiyon oldu. Aşağıdaki eski kayıtlarda geçen `alp-*`, `oc-*`, `01/02/03-*` ve önceki
> `kur.sh` anlamları **tarihseldir** — o günkü durumu anlatır.

## 2026-11-12 (8. tur) — Ansible standardı: şablon playbook, tek çalıştırma biçimi, log + iş durumu, hız seçimi

Sahada: `al.sh` → `./kur.sh`, **yeni oturum**. İkili değişmez (kilit eklentisi değişti).
- `ansible/sablon/reboot.yaml` + `iskelet.yaml` (yeni): `hosts: all` (hedef komutta `-l`), `serial: "{{ dilim | default(1) }}"` +
  `max_fail_percentage: 0` (tek tek; biri düşerse kalanına dokunmaz), reboot yalnız `ansible.builtin.reboot`, son görev `Özet`.
- `ansible` §1c: tek çalıştırma biçimi (`ANSIBLE_LOG_PATH=dn/<no>/logs/<playbook>.log` + retry + `-l`); hız kullanıcının sözüyle:
  tek / adlar tek tek / joker / grup / "ilk 3'ü" / "%10'u" / "3'er 3'er" (`-e dilim=3`) / "hızlı" (`-e dilim=100% -f 50`).
- `ansible/is-durum.py` (yeni, okuma): `dn/<no>` için playbook başına ✅ ▶ ❌ 🔌 ⏳, grup grup, düşenin görevi + hatası; yarıda kalan
  koşuyu söyler; elle yazılmış `.ini`'yi uyarır; `--sec 3|10% --pb 01-reboot [--grup stl]` → bekleyen ilk N sunucu `-l '…'`.
- `playbook-denetim.py`: iş dizininde `hosts:` hosts.ini'de yoksa ENGEL; `shell: reboot` (+ `wait_for`) ENGEL; serial yoksa UYARI.
- `is-envanter.py`: "STL/SXL sunucuları (8):" başlığı grup olur (`stl_sxl`; önce "stl/sxl" ve "sunucuları" host satırı oluyordu);
  Türkçe harf ASCII; ad olmayan sözcük dosyaya yazılmaz, ekranda söylenir.
- Kilit: `ansible-playbook -l` içindeki grup, joker ve `@….retry` iş envanterinden host'lara çözülür (yetki host başına; grup adı artık
  "listede yok" onayı açmaz, yetkisiz host'a uyan joker yine onaya düşer).
- **Sahada denenmedi.** Reboot şablonunun başarılı yolu burada ölçülemedi (yalnız yerelde "kontrol düğümünü reboot etmez" düşüşü ve
  serial'ın kalanı durdurması görüldü).

## 2026-11-12 (7. tur) — RHSA sonucu RHSA başına tek satır (x/N)

Sahada: `al.sh` → `./kur.sh`, **yeni oturum**. İkili değişmez.
- `rhsa-kontrol.py`: varsayılan çıktı RHSA başına bir satır (`✅ 7/8 · ➖ 1/8`), sapan sunucu adıyla altında, erişilemeyen sunucu bir kez;
  her sunucu ayrı satır için `--ayrinti`. Olay: ajan 27 RHSA'yı kendi tablosunda tek sunucudan genelledi (saha G124 7. tur).
- **Sahada denenmedi.**

## 2026-11-12 (6. tur) — RHSA kontrolü betikte; iş envanteri tek dosyada gruplu, DNS'ten doğrulanır, ssh denenir

Sahada: `al.sh` → `./kur.sh`, **yeni oturum**. İkili değişmez (kilit eklentisi değişti: okuma betiği listesi).
- `rhel-guncelleme/rhsa-kontrol.py` (yeni): `--komut <RHSA…> -i dn/<no>/hosts.ini` ansible okuma komutunu basar (uname, `dnf repoquery
  --advisory`, `rpm -qa`); tree çıktısından sunucu × RHSA: ✅ kurulu · 🔄 reboot bekliyor · ❌ eksik · ⚠️ depoda yok · ➖ ilgisiz · ❓.
  Sebep: `updateinfo list --installed` depoda olmayan advisory'de de boş, rc=0. Kilitte okuma (`OKUYAN_BETIKLER`).
- `ansible/is-envanter.py`: işin bütün sunucuları tek `dn/<no>/hosts.ini`'de; başlık satırları (`DTL:`) ve `--ad <grup>` → `[dtl]`, `[stl]`;
  sonraki çağrı grup ekler; aynı grup farklı sunucu → yazmaz (`--yenile`). `hosts-<aşama>.ini` / `hosts-2.ini` artık açılmaz (eskiler
  yerinde). Envanterde olmayan ad DNS'ten doğrulanır (IP yorumda, `ansible_host` yazılmaz), her host'a ssh portu TCP denenir.
- `repoquery --advisory` RHEL 8 (dnf 4.7) üzerinde ölçülmedi. **Sahada denenmedi.**

## 2026-11-12 (5. tur) — grup, tabloda açık iş kalmayınca biter ("reboot gerekli" → sıradaki soru reboot)

Sahada: `al.sh` → `./kur.sh`, **yeni oturum**. İkili değişmez.
- Olay: son kontrol 7/7 "reboot gerekli" dedi, ajan 2. reboot'u sormadan "sonraki gruba geçelim mi?" diye sordu (saha G124 5. tur).
- `engine/AGENTS.md` değişiklik işi 6 + `rhel-guncelleme`: sonuç tablosunda reboot gerekli / başarısız / doğrulanmamış sunucu varsa sıradaki
  soru o iştir; "bitti" yazılmaz, sonraki grup önerilmez. Birden çok kurulu çekirdek normal (`installonly_limit`, varsayılan 3).
- **Sahada denenmedi.**

## 2026-11-12 (4. tur) — güncelleme akışı sadeleşti: salt kontrol adımları, son RHSA kontrolü, 2. reboot sorulur

Sahada: `al.sh` → `./kur.sh`, **yeni oturum**. İkili değişmez.
- `rhel-guncelleme` (Alp'in sahadaki düzeltmesi): "reboot sonrası mount kontrolü" ayrı adım değil; `subscription-manager release` salt
  kontrol (set edildiyse güncelleme o sürümde kalır — bilgi, ajan değiştirmez); çekirdek/reboot isteyen paket güncellendiyse 2. reboot
  **sorulur**; son kontrol = durum tablosu + işin hedeflediği RHSA'lar kurulu mu (`dnf updateinfo list --installed <RHSA>`) — Satellite
  CV'nin güncel geldiğini gösterir; not güncellemeyi daraltmaz. Erişilemeyen sunucu kendiliğinden başka gruba taşınmaz.
- Saha günlüğü G124 4. tur. **Sahada denenmedi.**

## 2026-11-12 (3. tur) — CN işi tek dizinde: `dn/<numara>/` (envanter + playbook + README + logs), değişiklik playbook'la, önce tek sunucu

Sahada: `al.sh` → `./kur.sh`, **yeni oturum** (AGENTS.md oturum başında yüklenir). İkili değişmez.
- **Düzen (Alp'in sahada kurduğu):** `dn/<numara>/hosts.ini` · `01-<ad>.yaml`, `02-…` · `README.md` · `logs/plan.md`, `logs/sonuc.md`,
  `logs/okuma/`. Ad'larda tarih/saat yok. `dn29000` → `dn/29000`.
- `ansible/is-envanter.py`: iş envanteri `dn/<numara>/hosts.ini`; `--ad <aşama>` → `hosts-<aşama>.ini`; aynı ad farklı sunucu → `hosts-2.ini`
  (+ uyarı), aynı sunucu → yeniden yazılmaz; iş dizininin içinden çalıştırılsa da kök aynı; çıktı sıradaki adımları basar (okuma ad-hoc,
  değişiklik playbook, onay, önce tek sunucu).
- `rapor/is-kaydi.py`: `ac --cn` → `dn/<numara>/README.md` + `logs/`; aynı numara yeniden açılırsa dokunmaz; `ekle/sonuc <numara|son>`.
  CN'siz kayıt eski yerde (`~/ai/work/is-kayitlari/<YYYYMMDD>-<etiket>/`, saatsiz). Eski dosyalar yeniden adlandırılmaz.
- `ansible.cfg` iş dizinine yazılmaz; komutlar çalışma dizininden: `ansible-playbook -i dn/<no>/hosts.ini dn/<no>/01-<ad>.yaml -l <sunucu>`.
- `engine/AGENTS.md` değişiklik işi 3-4 + "yalnız söylenen adım"; `ansible` §0 "Değişiklik işi akışı"; `rhel-guncelleme` değiştiren
  adımlar playbook'la (`dnf update | tail` yok); `rapor`, `git`, GUVENLIK-KILITLERI ad'ları; ADR-0007 §9; saha günlüğü G124 3. tur.
- Kilit/`kume-bul`: `dn/` dizini ad ↔ IP kaynağı sayılmaz (önceden `ansible/dn/<no>/hosts.ini` kaynak olarak okunabilirdi). Onay
  davranışı değişmedi (CN + sunucu → değişiklik onaysız, 2026-10-27).
- **Sahada denenmedi.**

## 2026-11-12 — değişiklik işi: önce sor / kapsamı daraltma / grup bitince dur (saha G124)

Sahada: `al.sh` → `./kur.sh`, **yeni oturum**. İkili değişmez.
- **Olay:** CN'li güncelleme işinde ajan sormadan başladı, "dnf update"i yapıştırılan nottaki tek pakete daralttı, erişemediği 2 sunucuyu
  sormadan atladı, ilk grup bitince söylenmeden sonraki gruba geçti (ayrıntı: saha günlüğü G124).
- `engine/AGENTS.md`: iş haritasının hemen altına **"Değişiklik işi — ilk komuttan önce bu sıra"** (ilk sürüm 5 madde: beceriyi yükle + sor ve bekle ·
  iş kullanıcının cümlesidir, not daraltmaz · iş kaydı + iş envanteri, çözülmeyen sunucu sorulur · yalnız söylenen grup, bitince dur ·
  ölçmediğini yazma). İş kaydı satırındaki kırık yol (`<rapor>/is-kaydi.py`) tam yola çevrildi — model yolu tahmin ediyordu.
- `rapor/is-kaydi.py`: dizin adı **`<YYYYMMDD-HHMM>-<CN>-<etiket>`** (Alp: "yıl, ay, gün, saat; sonra tire; sonra change numarası").
  `--cn` artık ada girer; etikete yazılmış tarih/CN yinelenmez; etiketsiz `ac --cn <no>` kabul. Eski kayıt dizinleri yeniden adlandırılmaz.
- `rhel-guncelleme`: "Kapsam ve grup sırası" — "dnf update" = tam güncelleme; grup sırası verildiyse ilk grupta tablo → dur; çözülmeyen
  sunucu değişiklikten önce sorulur; hedef iş envanterinden.
- **Ek (aynı gün, 2. tur):** `rhel-guncelleme` "Önce sor" 5 — **Satellite sync / Content View güncel mi, baktın mı?** (ajan Satellite'ı
  göremez; kontrol insanın işi, cevap "evet" olmadan `dnf update` başlamaz) + "Adım adım — her adım ayrı onay" (sıra başta gösterilir; her
  adımın sonunda tablo → dur → "sıradaki adım …, başlayayım mı?"). AGENTS.md değişiklik işi bölümü 6 madde oldu: adım adım + "göremediğin
  sistemdeki ön koşul insanın işidir — sor: yaptın mı?".
- **Değişmeyen (karar Alp'te):** kilit — CN + sunucu verilince değişiklik onay ekranına düşmüyor (2026-10-27). Bu olayda 7 sunucudaki
  değişiklik bu yüzden ekrana gelmedi. İş envanteri dosya adı hâlâ CN önce (`hosts-<CN>-<tarih-saat>.ini`, 2026-10-22).
- Denetimler: `beceri-yazim-denetim.py` BECERI=46 HATA=0 · `beceri-betik-test.sh` 290 geçti · 0 kaldı (is-kaydi 4 yeni + G124 cümlesi
  iş haritasında `rhel-guncelleme`'ye gidiyor) · `beceri-komut-kilit.ts` 76 geçti · 0 takıldı. **Sahada denenmedi:** yerel modelin yeni bölüme uyup uymadığı.

## 2026-11-11 — iki büyük beceri bölündü (SKILL.md + ek dosya); sunucu tam adları becerilerden çıktı

Sahada: `al.sh` → `./kur.sh`, **yeni oturum**. İkili değişmez. Ek dosyalar `kur.sh`'ın beceri dizini kopyasıyla (`cp -r`) birlikte gider.
- **Neden:** SKILL.md tetiklenince tamamı modelin bağlamına girer; öneri < 20 bin karakter (≈ 5000 token). `rke2-denetim` 30,9 →
  **20,0 bin**, `rke2-gpu` 29,0 → **20,0 bin** karakter. Yazım denetiminde "büyük" (BİLGİ) satırı artık yok.
- `rke2-denetim/node-takilma.md` (15,7 bin): belirtiye özel komut blokları — A antrea-ovs restart · B NFS · C tmpmounts · D yük/boyut ·
  E conntrack · F node donması / VMware VM · G control plane · H nonprod Rancher + `test` kümesi tarihli kayıtları.
- `rke2-gpu/gpu-node.md` (12,6 bin): §0 tarihli saha kayıtları · §4 GPU node işletim sistemi · §5 depolama `/models` · §6 ölçüm.
- SKILL.md'de kalan: akış, karar kuralları, "yapma"lar ve ek dosyanın tam yolu + hangi belirtide hangi bölümün okunacağı. Kurallar ek
  dosya okunmasa da geçerli olacak biçimde SKILL.md'de durur. Taşıma betikle doğrulandı: kaybolan komut satırı 0, kaybolan (saha G…)
  etiketi 0. **Sahada denenmedi:** yerel modelin ek dosyayı gerektiğinde açıp açmadığı — ilk `rke2-denetim` / `rke2-gpu` işinde bak.
- **Sunucu adı kuralı (Alp, 2026-11-11):** ortam/rol adları (prod, nonprod, test, gpu, dtx) ve ad kalıpları kalır; tek tek sunucuların
  tam adı becerilere yazılmaz — kaynak envanterdir. `rke2-denetim`, `rke2-gpu` kısa rol biçimine (`mas01-03`, `wor01-14`,
  `gpumaster1-3`, `gpuworker1-3`, `h200w1`); `rke2-node-ekle` → `<node-adı>`; `anthos-erisim` jumpbox adları çıktı (envanterden);
  `uzak-envanter` + `uzak-topla.sh` → "yönetim makinesi". Kalıp örneği olarak duranlar: `engine/AGENTS.md` seri kuralı,
  `GUVENLIK-KILITLERI.md`, `kilit.ts` / `envanter.ts` yorumları, `kilit.test.ts` test verisi, saha günlüğü. Kural `knowledge/skills/README.md`'de.
- Denetimler: `beceri-yazim-denetim.py` — beceri dizinindeki ek `.md` SKILL.md'de anılmıyorsa **HATA**, maskeleme ek dosyaya da
  uygulanır. `beceri-komut-kilit.ts` — ek dosyalardaki sabit okuma komutları da kilitten geçirilir (76 geçti · 0 takıldı).
  `beceri-betik-test.sh` 286 geçti · 0 kaldı.

## 2026-11-11 — beceriler: "Önce sor" 46/46 (artık zorunlu)

Sahada: `al.sh` → `./kur.sh`, **yeni oturum**. İkili değişmez. Alp (2026-11-11): "Güvenlik önemli. Kararları insan alacak. Projenin ana teması bu."
- Kalan 30 beceriye **"Önce sor"** bölümü eklendi — her birinde o becerinin kendi bölümlerinden çıkan 3–5 soru (hedef, okuma mı
  değişiklik mi, kapsam, onay/karar kimde) + "Sorma:" satırı (becerinin kendi okuduğu şeyler sorulmaz). `anthos-erisim`'de var olan
  "Bilinmeyenler" bölümü bu başlığa çevrildi. Yeni kurum bilgisi eklenmedi; sorular yalnız becerinin kendi metnine dayanır.
- `script/beceri-yazim-denetim.py`: "Önce sor" bölümü olmayan beceri artık **HATA** (önceden bilgi satırıydı); başlık `##` ya da
  `###` olabilir. `beceri-betik-test.sh` bozuk kopyada bunu da sınar.
- İki büyük beceri **yerinde sadeleştirildi** (Alp: "biraz küçültebilirsin, özetleyebilirsin"): `rke2-denetim` 32,5 → 30,9 bin
  karakter, `rke2-gpu` 29,9 → 29,0 bin. Yalnız tekrar çıkarıldı — bölüm numaraları, saha gözlemleri ve (saha G…) etiketleri yerinde.
  `rke2-denetim`: elle tarihlenmiş olay penceresi komutları (iki yerde) yerine `rhel-sorun/olay-penceresi.py` çağrısı; iki NFS bloğu
  tek blok; sertifika, `uyum.py`, lease, VMware ve "en yüksek bulgu" tekrarları tek yerde. `rke2-gpu`: Run:ai iki madde → tek
  (doğrulanmış hali), hostPath iki madde → tek, çelişen bayrak ve `NCCL_P2P_DISABLE` §3'te tek yerde (§4'teki kopya kalktı), §2
  tablosunda paylaşım ve restart satırları birleşti. `rke2-gpu` shm maddesindeki "(~1 TB)" node belleği sayısı çıkarıldı (aynı
  dosyanın §0 saha ölçümü 2266 GiB ile çelişiyordu). Yazım denetimi ikisini hâlâ "büyük" diye bildiriyor (BİLGİ, hata değil).

## 2026-11-11 — git geçmişi yeniden yazıldı (kurum alan adı + iç IP eski commit'lerden çıkarıldı)

**Bir kerelik iş — `al.sh`'ın `git pull` yaptığı klonda:** `git fetch origin && git reset --hard origin/main` (yoksa `git pull`
"divergent branches" der ya da eski geçmişle birleştirme commit'i üretir). Dosya içeriği aynı: yeni `main`'in ağacı eskisiyle
birebir (`git rev-parse main^{tree}` ikisinde `38e3ae8ec5df`). Sahaya giden dosyalarda fark yok; `./kur.sh` her zamanki gibi.
- Alp onayı (2026-11-11): "eski commitlerde geçmişi yeniden yazabilirsin". Kapsam: kurum alan adları ve iç IP'ler (sunucu/ortam
  adları kapsam dışı — Alp: maskeleme gerekmez).
- Yöntem: ayrı klonda `git filter-repo --replace-text --replace-message`; 378 commit'in 234'ü yeniden yazıldı (2026-10-12'den
  sonrası), yazar/tarih/mesaj aynı (bir mesajdaki commit kimliği yenisine çevrildi), değişen dosya 11 (hepsi `engine/`,
  `knowledge/`, `script/`). `urun-2.0.0` etiketi değişmedi. Gönderim `--force-with-lease`: `main` `e5272e53c8` → `9510c97fd0`,
  `feature/fare-tekerlegi` `3322fb18e5` → `4d63a46202`.
- Doğrulama: yeni geçmişteki tüm nesneler tarandı — alan adı 0, saha IP bloğu 0 (kalanlar test örneği: `10.1.x`, `10.2.x`).
- **Sınır:** GitHub eski commit'i dal dışında saklamayı sürdürür — kimliği bilen açabilir (denendi: API eski `e5272e53c8`'i hâlâ
  döndürüyor). Tam silme GitHub Destek talebiyle olur. Depo 2026-10-12'den beri public olduğu için önceden alınmış kopya
  olup olmadığı bilinmiyor.
- Yerel yedek (yalnız geliştirme sunucusunda, gönderilmez): `refs/yedek/2026-11-11/{main,fare}` — saha eşitlemesi doğrulanınca silinir.

## 2026-11-11 — beceriler: yazım denetimi, maskeleme, "Önce sor" ×9, `dnf`/`yum` TLS hatası tablosu

Sahada: `al.sh` → `./kur.sh`, **yeni oturum**. İkili değişmez. Örnek istek: "yum SSL hatası veriyor" / hata satırını yapıştır.
- **Yazım denetimi** `script/beceri-yazim-denetim.py` (yalnız okur; `beceri-betik-test.sh` içinde koşar): ad, açıklama ≤1024 ve
  `<…>`'siz, gövde <500 satır, anılan dosya yerinde, iş haritasında, maskeleme. Kaynak: agentskills.io/specification. İlk
  koşuda bulunanlar düzeltildi: `rancher-sertifika` açıklaması 1024'ü aşıyordu (tekrarlar atıldı); 5 becerinin açıklamasında
  `<x>` yer tutucusu vardı (ansible, git, idm-kurulum, kurum-registry, rke2-manifest → `{x}`).
- **Maskeleme** (`knowledge/operations-notes/README.md` kuralı — depo public): beceri, şablon, saha notu, politika ve testlerdeki
  kurum alan adları → `<kurum>.local` / `<kurum-dmz>.local`, iç IP'ler → `<ip-…>` ya da örnek blok. `rhel-teslim` FQDN son ekini
  artık kurumsal bilgi §1–§2'den okur, yoksa sorar.
- **"Önce sor"** bölümü eklendi (her becerinin kendi dallarından): rhel-depolama, rancher-sertifika, k8s-sorun, kume-bul,
  kurum-registry, filo-kontrol, rhel-guncelleme, rhel-sorun, rhel-performans → 16/46.
- **`rhel-guncelleme` → "Depo erişiminde TLS/SSL hatası"**: `dnf -q` sebebi göstermez (ölçüldü) → asıl `Curl error (N)` satırı
  nasıl alınır; 9 durum tek tek üretilip ölçüldü (dnf 4.20.0 / libcurl 8.12.1 / OpenSSL 3.5.8, AlmaLinux 10): bilinmeyen CA,
  süresi dolmuş, henüz geçerli değil, ad uyuşmuyor, istemci sertifikası isteniyor / dosyası yok, `sslcacert` yolu yok, TLS sürümü,
  bağlantı. Her biri → anlamı → sonraki okuma → düzeltme kimde. `sslverify=0` çözüm sayılmaz. İş haritasına satır eklendi.
  **Sahadaki gerçek hata metni henüz görülmedi** (yalnız sekme başlığı "yum SSL …") — RHEL 8/9'da köşeli parantez metni farklı
  olabilir; beceri "kodu ve metni aynen göster, tabloda yoksa söyle" der.
- Test: `script/beceri-betik-test.sh` 284 geçti · 0 kaldı (vermin kurulu değil — 3.6 denetimi atlandı); `engine/plugins` `bun test` 397 pass · 0 fail; `beceri-komut-kilit` 74 geçti · 0 takıldı.

## 2026-11-11 — `ocm` artık `main`'de + kontrol raporunda eski log hatası tarihiyle

Sahada: `al.sh` → `./kur.sh`, sonra `cd <dizin> && ocm`. İkili değişmez (yeniden derleme yok).
- **`ocm` neden sahaya gelmiyordu:** 10.11 işi `feature/fare-tekerlegi` dalındaydı, `al.sh` `main`'i çeker (saha ekranı 11.11:
  "new branch feature/fare-tekerlegi" + "Already up to date"). Alp kararı (10.11): "opencode mini geçelim, artık onu takip
  edelim" → dal `main`'e alındı (ileri sarma, tek commit).
- `ocm` yalnız ikilide `mini` alt komutu varsa kurulur; yoksa uyarı basar (`./kur.sh derle`). Eski ikilide `ocm` genel yardım
  ekranını basardı (skyup'taki 1.0.1 ikiliyle görüldü).
- Kontrol raporu `log` satırı: hata bugüne (UTC) ait değilse başına ay-gün gelir (`11-10 12:46Z …`). Saha 11.11: sabah
  kurulumunda `12:46Z Failed to drain Session` basıldı — tek `opencode.log` dosyasına eklenerek yazıldığı için günler önceki
  hata da "son hata"dır; tarihsiz hâli güncel sorun gibi okunuyordu.
- Sonuç satırı: `SORUN: yok — uc saglikli, sorun opencode tarafinda; log: …` → `SORUN: yok — uc saglikli. Takilirsan opencode
  logu: …` (log temizse `… uc saglikli, log temiz`). Kurulum sonunda da basıldığı için "sorun opencode tarafında" cümlesi
  sorun yokken de sorun varmış gibi okunuyordu.
- Test: `script/duman-kontrol-rapor.sh` T5 (log tarihi), T6 (`ocm` — mini'li ve mini'siz ikili), T7 (sonuç satırı): 33 geçti, 0 kaldı.
- **MobaXterm'de `ocm` hâlâ denenmedi** — ilk saha denemesi bekleniyor (tekerlek + seçip kopyalama).
- **Saha 11.11 11:21:** kurulum `ocm` kısayolunu kurdu (ikili 3.0.0'da `mini` var), `ocm` MobaXterm'de açıldı; kontrol `log`
  satırı `11-04 12:46Z Failed to drain Session` (tarihli — hata 4 Kasım'dan). Soru: "`ocm`'de oturumlarım nerede?" → menüde
  oturum listesi yok; `ocm -c` / `opencode session list` / `ocm -s <kimlik>` (`ALP-README.md`). Yerel deneme (3.0.0, sahte uç,
  tmux): `mini -c` son oturumu geçmişiyle açtı, `session list` yalnız o dizinin oturumunu listeledi, `mini -s` başka dizinin
  oturumunu açtı.
- **Alp kararı (11.11):** `ocm` ayrı kısayol kalır, istenince çağrılır; `opencode` / `oc` olduğu gibi (tam ekran arayüz) açılır.

## 2026-11-10 — `ocm`: fare tekerleğiyle kaydırma (dal `feature/fare-tekerlegi`; 11.11'de `main`'e alındı)

Sahada: `git pull && ./kur.sh`, sonra `cd <dizin> && ocm`. İkili değişmez (yeniden derleme yok).
- `ocm` = `opencode mini`: upstream'in ana ekrana yazan arayüzü (`packages/tui/src/mini/`). Çıktı terminalin kaydırma arabelleğine
  düşer → tekerlek ve seçim/kopyalama terminalde. Fork yaması yok; upstream güncellemesiyle kendiliğinden gelir.
- Yerel ölçüm (v3.0.0 ikili, tmux, sahte uç): 200 satırlık komut çıktısının 200'ü kaydırma arabelleğinde; ham çıktıda alt ekran
  (`ESC[?1049h`) ve fare izleme (`ESC[?1000h/1002h/1003h/1006h`) dizisi 0 (tam TUI'de `1049h` 1). İzin ekranı, `guvenlik-v2`
  eklentisi ve `/kaydet` mini'de çalıştı. **MobaXterm'de denenmedi** — ilk saha denemesi bekleniyor.
- `cli.json`'a `mini.tools: show` (yalnız `mini` anahtarı hiç yoksa; mini varsayılanı araç çağrılarını gizler).
- `opencode` / `oc` değişmedi (tam ekran arayüz, fare kapalı — A22).

## 2026-11-04 — `rhel-aide` (dosya bütünlüğü) + `rhel-cis` Satellite döngüsü

Sahada: `git pull && ./kur.sh`, **yeni oturum**. Örnek istek: "AIDE hangi sunucularda kurulu, NFS'i tarar mı?".
- `rhel-aide`: `aide-ozet.py komut` → `ansible -m raw` (salt-okunur) → `aide-ozet.py <tree>`: kurulu değil / veritabanı yok / zamanlı
  kontrol yok / çalışıyor; NFS-CIFS bağlaması AIDE kapsamında mı (aide.conf seçimi + 0.19 dosya sistemi türü kısıtı `!/ =0x6969`).
  Devreye alma: istisnalar `--init`'ten önce, `--path-check` ile doğrulama, yama sonrası `--update`, `rhel-system-roles.aide`.
- `rhel-cis` §0: Satellite tara → remediation (sihirbaz / OpenSCAP iş şablonu) → tekrar tara; SCAP içeriği RHEL ara sürümüne göre.
- `platform-bilgi` (yeni, bilgi kartı): VCF 9.1 (VKS'de RHEL 9 node), Google Distributed Cloud = eski Anthos (bare metal: RHEL 9.6/9.4/8.10,
  tek sayılı ara sürüm yok, 1.35+ cgroups v2), Azure Local (SAN GA 2604, iSCSI GA 2607, bağlantısız çalışma) + edinim soruları.
- Kurum bilgisi (Alp): AIDE henüz aktif değil; XDR k8s node'larından kaldırıldı, yerine Prisma (Twistlock) Defender; SEP her yerde.

## 2026-11-04 — `uzak-envanter` + erişim kontrolü (`filo-kontrol` §7)

Sahada: `git pull && ./kur.sh`, **yeni oturum**. Örnek istek: "ktbulut ortamına erişemiyoruz; oradaki satellite'ta envanteri toplayıp getireceğim".
- `uzak-topla.sh` uzak ansible makinesinde kullanıcı çalıştırır (yalnız bash + ansible, `-m raw` okuma): host bilgisi + erişim → tek .tgz.
- Burada `uzak-ozet.py`: IP /24 bloğu başına AĞ YOLU KAPALI (FW talebi adayı, kaynak→blok tcp/22) · blok açık ama sunucu sorunlu ·
  hepsine erişildi; host tablosu (OS, çekirdek, CPU/RAM, kök disk, açılış, IP, sanal, kayıtlı Satellite) ve dağılımlar.
- Erişilebilen ortamda: `filo-kontrol` §7 (`ansible -m raw -a true` + `erisim-blok.py`).
- `git`: `…/_git/<depo>?path=/X` adresi = yerel `git/<depo>/X`; listelerden INI awk ile üretilir, `envanter-fark --birlesik` ile doğrulanır.
- Gerçek sahada henüz çalıştırılmadı `[SAHA]`: ilk çıktıyı Doktor'a gönder.

## 2026-11-03 — `kesinti-sonrasi`: elektrik kesintisi sonrası filo taraması

Sahada: `git pull && ./kur.sh`, opencode'u yeniden aç. Örnek istek: "veri merkezinde elektrik kesintisi oldu, saat 09:40 civarı;
<envanter> sunucularını tara, kesintiden kalan hata var mı, özet çıkar".
- Tek salt-okunur ansible komutu (onay sormaz) + `kesinti-ozet.py`: ulaşılamayan · kesintide kapanan (`last -x` ile ANI/temiz) ·
  kapanmayan; açılanlarda başarısız servis, bağlanmamış fstab/NFS, dosya sistemi hatası, saat, durmuş konteyner, rke2.
- Önce sorar: kesinti saati, kapsam (Windows/Exchange dışı), Kubernetes kümeleri. Hiçbir şeyi başlatmaz/düzeltmez; öneri ayrı onayla.
- Gerçek sahada henüz çalıştırılmadı `[SAHA]`: ilk çıktıyı Doktor'a gönder.

## 2026-11-03 — kurumsal bilgi her oturumda + iş haritası + `/kaydet` düzenler

Sahada: `git pull && ./kur.sh`, opencode'u yeniden aç, sonra `/kaydet`.
- `~/ai/work/opencode/kurumsal-bilgi.ini` artık her oturumda modele verilir (yoksa atlanır; değişince yeniden okunur).
- `AGENTS.md` başında iş haritası: isteğin sözcükleri → kurumsal bilgi bölümü → beceri → betik.
- `/kaydet` parametresiz: oturumdan yeni bilgiyi ekler ve dosyayı düzenler (yedek alır; bilgi silmez; mükerrer teke; çelişki ayrı bölüm;
  adlandırma tablosu düzeltilir; zararlı "çözüm" uyarıya; iş geçmişi ≤30 satır, eskisi iş kaydına). İlk çalıştırmada farkı dikkatle oku.
- Kilit: `kubectl proxy/port-forward`, arka plan `&`/`nohup`/`setsid`, `nc -l`, `curl -o`, `wget` (dosyaya), `openssl s_server/-out`,
  `kubectl auth reconcile`/`config set-*` artık onay ister (G122). `kume-bul`: envanterde IP olmaması normal, `ssh root@<ad>` (G123).

## 2026-11-03 — iş kaydı + `/kaydet` (oturum kanıtlı özeti), kilit düzeltmeleri

Sahada: `git pull && ./kur.sh`, opencode'u yeniden aç.
- `is-kaydi.py`: geçici iş kaydı `~/ai/work/is-kayitlari/<tarih>-<etiket>/` (plan, okuma kanıtı, sonuç) — onaysız.
- `/kaydet [etiket]`: oturumun özetini iş kaydına alır — yalnız kullanıcı sözü + komut çıktısı; ajan metni, düzeltilen sözler ve başarısız
  komutlar bilgi sayılmaz. Ders yalnız onayla. İlk kullanımda sonucu ekrandan kontrol et `[SAHA]`.
- Kilit: salt-okunur disk incelemesi (kurulu beceri yolu K6'ya, disk-durum onay ekranına takılıyordu) düzeldi; `opencode session list|export` okuma.
- `kur.sh kontrol`: "son hata" yalnız gerçek ERROR satırı.

## 2026-11-03 — `rhel-teslim`: "Açık sistem 2. onay", iç ağ/DMZ, önce sor (G119)

Sahada: `git pull && ./kur.sh`.
- `rhel-teslim` "2. onay", "açık sistem", "dmz", "ipa client", "xdr" isteklerinde de yüklenir; §0a önce sorar (hangi adımlar, FQDN'den alan,
  CN/envanter). Playbook numarası katalogdur, talepte olmayan adım çalışmaz; baseline ayrı projede.
- IPA/DNS/NTP iç ağ ve DMZ için ayrı değer seti — dosyadan okunur; aynı ayar iki dosyada farklıysa ajan durur ve iki satırı gösterir.
- `rke2-edr`: SEP kurulum kaynağı `SAL/1.4` notu (Broadcom KB 222816); sürüm paketten okunur.

## 2026-11-03 — gece değişikliği dersleri (G116, G118): kilit çift `-l`, compose fotoğrafı, düstur, `rhel-nfs`

Sahada: `git pull && ./kur.sh`, opencode'u yeniden aç.
- Kilit: değiştiren ansible komutunda birden çok `-l` engellenir (ansible yalnız sonuncuyu uygular); `ansible` §4 `-l 'a*:b*'`.
- `is-envanter.py --grup` tireyi `_` yapar ("Invalid characters were found in group names" uyarısı biter).
- `rhel-guncelleme` 1b: konteyner fotoğrafında compose dizini/dosyası (etiketten), "compose'a bak = bu komut".
- `engine/AGENTS.md` **Düstur:** her beceride önce sor, her şey kanıtlı; performans üç eksende; önerilen seçenek man'de olmalı.
- Yeni beceri **`rhel-nfs`** (`nfs-tani.py`): açılışta NFS bağlama zamanı ↔ konteyner başlama zamanı, `nofail`, motor sırası.

## 2026-11-02 — kurum registry becerisi (G115)

Sahada: `git pull && ./kur.sh`, opencode'u yeniden aç.

- **Yeni beceri `kurum-registry`** + `imaj-yol.py`: manifest/helm çıktısındaki imajları düğümün RKE2 `registries.yaml` aynalarına
  (tam ad / `"*"`, rewrite) göre çözer — "aynada" / "ayna yok"; kurulumdan sonra `cekme` ile ErrImagePull/ImagePullBackOff taraması
  ("kuruldu" demenin kanıtı). Kurum registry'leri Alp'in ekranlarından: Nexus (`registry.<kurum>`, traefik yol → port tablosu, depolar),
  Harbor proxy cache proje kuralı. Bilinmeyenler `[SAHA]`. Test 160/160.
- **Yeni beceri `veeam-linux` (G117):** Veeam restore "No such file or directory" — `veeam-tani.py` sunucudan kanıt toplar (/tmp noexec,
  /run/veeamtransport, servisler, Veeam logları) ve bilinen sebepleri kaynağıyla sıralar (KB2099, Veeam forumu); asıl hatanın VBR iş logunda
  olduğunu söyler. Kanıtsız servis restart'ı yok.
- **OS güncelleme (G116):** `rhel-guncelleme` 1b konteyner fotoğrafı (reboot öncesi/sonrası ad · durum · restart politikası; açılmayacakları
  önceden listeler, düzeltmez); `filo-tablo.py --say surum` sürüm dağılımını sayar (elle toplama yok); kilit: `h=$(host …)` atamalı okuma
  döngüsü ve ansible `{% raw %}` artık onay sormaz.
- **Kilit:** kitin yalnız okuyan iki betiği (`imaj-yol.py`, `ca-dogrula.py`) tam yolla çağrılınca onaysız (kilit testi 287/287).

## 2026-10-26 / 27 — saha haftası: git girişi, yeni beceriler, kilit düzeltmeleri (26 commit)

Saha gözlemleri G103–G113 (Alp'in ekranları). Sahada: `git pull && ./kur.sh`, opencode'u yeniden aç.

- **Kurum git'i:** `git-giris.sh` — kurum Azure DevOps Server yalnız Negotiate/NTLM öneriyor, git NTLM seçip PAT'i hiç göndermiyordu
  (yerelde yeniden üretildi). Betik sunucuya özel `proactiveAuth=basic` + bellek önbelleği (10 saat, `setsid` ile terminal kapanınca
  ölmez) ya da `--kalici` (`~/.git-credentials`, 0600); PAT yalnız kullanıcı tarafından girilir. Domain parolası Basic ile çalışmaz —
  yalnız PAT (boş kullanıcı). Uçtan uca ölçüldü (NTLM öneren `git http-backend`).
- **Yeni beceriler:** `belge-oku` (Excel/Word/PowerPoint/PDF/OneNote dışa aktarımı → yer bilgili metin), `rke2-manifest` (git'teki
  manifesti kümeye: diff → CN ile apply; `manifest-uyarla.py` küme klasörünü yeni kümeye uyarlar — Alp yöntem A), `idm-bakim` (IdM log
  şişmesi, KRB5_TRACE/SSSD debug, Red Hat logrotate varsayılanı paketten ölçüldü; kurum kararı 100 GB disk), `solaris-ntp` (NTP mode 6:
  `ntp-mode6.py` + `solaris-ntp-noquery.yaml`).
- **Betikler:** `playbook-denetim.py` (ansible — playbook'u çalıştırmadan bilinen hata kalıpları), `envanter-fark.py` (git — ENVANTER.md
  ↔ ansible INI), `kume-bul.py` küme adıyla arama, `uyum.py yol` Antrea'da garantili sürümü önce seçer (1.33 → 1.36 yolu düzeldi);
  RKE2 sürüm verisi 2026-10-26 (1.37 hattı). Kurum: 1.33 ve üstü kümeler; hedef 1.36; tek 1.33 küme kaldıkça Rancher 2.15'e geçilemez.
- **Güvenlik kilidi:** CN yetkisi oturum boyunca ve diske yazılır (opencode yeniden başlayınca kaybolmaz; KRİZ/KURULUM 12 saat);
  yalın `dn29000` CN sayılır; git'in kullanıcı dosyaları (`~/.gitconfig`, `~/.git-credentials`) bu makinede K1 dışı; okuma olarak
  tanınanlar: `sssctl debug-level` (argümansız), `logrotate -d`, Solaris `svcs`/`svcprop`/`ntpq`; `svcadm`/`svccfg` K1. 279 test.
- **Kurulum/TUI (G103–G104):** çıktı sınırı 32768, örnekleme 0.6/0.95/20 (Qwen3.6 model kartı, model `options`); `kur.sh` eski bun'da
  repodaki 1.4.4'ü kullanır; TUI ilk mesaj çökmesi ("e.replace is not a function", iki `@opentui/core` kopyası) düzeltildi.
- **Kurallar (AGENTS):** "yalnız metni kontrol et, işlem yapma" → komut yok; sohbete yazılan PAT/parola kullanılmaz.

## 2026-10-23 — beceri: `git` (Azure DevOps Server, on-prem) + `ansible` §9 Semaphore

Park'taki genel `git-azuredevops` (bulut + `az` CLI varsayıyordu, sahada denenmemişti) kurum yapısına göre yeniden yazılıp
`approved/git` oldu (Alp): on-prem Azure DevOps Server, https + AD kullanıcı/parola, doğrudan `main`, PR yok; depolar ansible,
envanter, k8s manifest, doküman. Parolaya ajan dokunmaz — terminalsiz git `could not read Username` ile hemen düşer (takılmaz),
kullanıcı bir kez kendi terminalinde girer, `credential.helper cache` bellekte tutar (yerel 401 sunucusuyla ölçüldü; diske
yazmıyor). NTLM/Kerberos isteyen sunucuda davranış sahada doğrulanacak. `ansible` §9: Semaphore playbook'u deponun köküne göre,
envanter dosyasını göreli yolla yalnız şablonun deposundan okur → iş envanteri playbook'la aynı ansible deposunda; kimlik Key
Store'da; `ANSIBLE_TASK_TIMEOUT` Variable Group'ta; ayrı "kuru" şablon `["--check","--diff"]`. Beceri sayısı 24.

## 2026-10-23 — motor: upstream opencode 2.0.24 → 2.1.4 (13 sürüm) + bun 1.4.4

Tek çakışma kök `package.json` `typecheck` satırı: bizimki (CLI ağacı + `safe-concurrency.sh`) kaldı, upstream'in
yeni `typecheck:tsc` görevi aynı sınırla eklendi. Tek çekirdek yamamız (A35, `packages/core/src/file-access.ts`)
upstream'in de değiştirdiği dosyada ama yama seti birebir korundu (v2.0.24→main ile v2.1.4→dal farkı aynı: 3 dosya);
düşürülen yama yok. **Upstream bun@1.4.4 istiyor:** build script'i `^1.4.4` dışını reddeder, paket `typecheck`'leri
`bun check` kullanır (1.4.2'de yok) → bu makine `bun upgrade` ile 1.4.4, repodaki saha paketi
`bin/bun-linux-x64-baseline-1.4.4.tgz` (npm `@oven/bun-linux-x64-baseline@1.4.4`, sha512 npm kaydıyla aynı; 1.4.2 silindi).
Doğrulama: typecheck 19/19 · `engine/plugins` 353/0 · `packages/core` 6430 geçti / 3 başarısız (bilinen üç, root
ortamı) · `kur.sh derle` (bun 1.4.4) + `smoke-ikili.sh` GEÇTİ · yeni ikiliyle izole kurulumda (`kur.sh` + sahte uç)
`rm -r /` K5 ile, `rm -rf /` config `deny` ile reddedildi, `uname -r` çalıştı. Ürün sürümü değişmedi (3.0.0).
Sahada `al.sh` → `./kur.sh` (kaynak yeni → yeniden derler; makinede bun yoksa repodaki 1.4.4 paketi açılır).

## 2026-10-08 — motor: upstream opencode 2.0.23 → 2.0.24

Tek çakışma `.gitignore` (upstream `/artifacts/` ekledi; ikisi de tutuldu). Tek çekirdek yamamız (A35,
`packages/core/src/file-access.ts`) upstream'in değiştirdiği dosyalarla kesişmiyor, taşınıyor; düşürülen yama yok.
Motor farkı: ACP, yerel sağlayıcılar (local/ollama/lmstudio/vllm), kabuk komut ayrıştırıcı (`shell/scan.ts`).
Doğrulama: typecheck 19/19 · `engine/plugins` 175/0 · `packages/core` 6188 geçti / 3 başarısız (bilinen üç, root
ortamı) · `kur.sh derle` + `smoke-ikili.sh` GEÇTİ · yeni ikiliyle izole kurulumda `rm -rf /` K5 ile reddedildi,
`uname -r` çalıştı. Ürün sürümü değişmedi (3.0.0). Sahada `al.sh` → `./kur.sh` (kaynak yeni → yeniden derler).

## 2026-10-08 — beceri: `depolama` §8 yazılım RAID (mdadm) + NVMe sağlığı

GPU sunucusu (Alp): 16 × 1.7 TB NVMe, 12'si yazılım RAID10 (mdadm, RHEL 9), 2 spare. Yeni bölüm salt okunur:
`/proc/mdstat` + `mdadm --detail` okuma tablosu, yedeğin kendiliğinden devreye girmesi, near=2'de ayna çiftleri,
`raid-check.timer` + `mismatch_cnt`, `mdmonitor` bildirimi tanımlı mı, `nvme smart-log` alanları ve RAID üyesi↔NVMe
eşleme. Disk değiştirme K1. mdadm dosyaları (raid-check, mdmonitor) AlmaLinux 10 paketinde doğrulandı; komut
çıktıları RHEL 9'da denenmedi. `rke2-ansible` disk notu: RAID tipi yazılım olarak güncellendi.

## 2026-10-08 — beceri: `performans` + page cache / kirli sayfa / Direct I/O izleme

Alp: "Direct I/O ve vm.dirty_* ayarlarını yapmayız ama izlemek lazım". Yalnız okuma: `vm.dirty_*` anlamları
tablosu, `/proc/meminfo` Dirty/Writeback + `sar -r` kbdirty, cgroup `memory.stat` file/file_dirty, `fincore`,
O_DIRECT kullanan süreçleri `/proc/*/fdinfo` flags (040000) ile bulan döngü — `dd oflag=direct` ile AlmaLinux 10'da
denendi, süreci buldu. Ayar değiştirme ve `drop_caches` K1.

## 2026-10-08 — beceri: `cekirdek-teshis` + CPU gecikmesi (eBPF)

Alp: "eBPF ile CPU latency izleyebilmek Rancher, NVIDIA vb. sistemlerde önemli". Yeni bölüm: önce cgroup v2
`cpu.stat` (`nr_throttled`/`throttled_usec` artıyor mu — konteyner limiti), sonra `runqlat.bt`/`runqlen.bt`,
sonra `rtla timerlat` (cyclictest/clock_nanosleep ölçümünün çekirdek içi karşılığı; sözdizimi `--help`'ten).
GPU'nun içi eBPF ile görülmez. `k8s-rancher`'a yönlendirme satırı. Araç/alan varlığı AlmaLinux 10'da doğrulandı
(`rtla`, `runqlat.bt`, `cpu.stat`, `CONFIG_TIMERLAT_TRACER=y`); RHEL 9 sahada denenmedi.

## 2026-10-08 — beceri: `cekirdek-teshis` (ilk sürüm — çekirdek sorunlarını loglardan teşhis)

Alp: "sahada sorunları anlamakta, logları incelerken lazım olur". Sıra log → canlı gözlem → döküm:
`journalctl -k` kalıp tablosu + `Tainted:` harfleri (çekirdek belgesinden), BTF ile debuginfo'suz
`bpftrace` hazır araçları ve `perf`, kdump'ta önce `vmcore-dmesg.txt`, `crash` yalnız eşleşen
`kernel-debuginfo` varsa. KGDB/JTAG/QEMU bilinçli dışarıda (KGDB çekirdeği durdurur). Paket kurma
ve kdump açma K1 değişikliği. Sahada `./kur.sh` ile kurulur (approved/ = 14 beceri).

## 2026-10-05 — ürün 3.0.0: motor opencode 2.0.23 (ana sürüm geçişi)

Alp: "direk 2.x geç". Motor `packages/opencode` → **`packages/cli`** (+ `core`/`tui`/`server`). Sahada akış aynı:
`al.sh` → `./kur.sh` (kaynak yeni → derler, ~10 sn) → `opencode`. Değişenler:
- **Güvenlik:** `guvenlik-v2.ts` (2.x kancaları; çekirdek aynı). Yeni risk kapatıldı: alt ajan oturumunun mesajını model
  yazar → yetki yalnız kök oturumdaki kullanıcı mesajından. 1.x `audit-log.ts`/`guard.ts` kurulmaz, eskileri silinir.
- **Sınır = açılış dizini** (A35) 2.x'e taşındı (`packages/core/src/file-access.ts`); diğer fork yamaları upstream'de
  çözülmüş ya da katman değişmiş → düşürüldü (vendor commit'i).
- **İlk açılış:** 2.x 1.x oturum veritabanını yerinde dönüştürür; `kur.sh` öncesinde bir kerelik kopya alır
  (`~/.local/share/opencode/yedek-1x-<tarih>/`).
- **TUI:** fare ayarı `~/.config/opencode/cli.json` (`mouse:false`). `websearch` kapalı (çevrimdışı). Model yalnız metin.
- **Bilinen:** 2.x her 5 dk models.dev'e çıkmayı dener (sahada başarısız + tek hata satırı, açılışı etkilemez).
Doğrulama (geliştirme makinesi): sıfır makine benzetimi (temiz klon, bun yok, boş HOME, sahte uç) `./kur.sh` 31 sn,
kontrol raporu kurulum + uç satırları ✓; kurulu ikiliyle uçtan uca `rm -rf /` reddedildi, `ssh … systemctl restart`
K1 mesajıyla reddedildi, `uname -r` çalıştı, audit 3 satır; ikinci `./kur.sh` derlemeyi atladı; `engine/plugins` testleri
175/0; `packages/core` testleri 5287 geçti / 3 başarısız (üçü yamasız 2.0.23'te de başarısız: root kullanıcı ortamı);
CLI bağımlılık ağacı typecheck 19/19.

## 2026-10-05 — sıfır RHEL 9'da yalnız `al.sh` + `env` ile kurulum

bun artık repoda (`bin/bun-linux-x64-baseline-1.4.2.tgz`, 37 MB); makinede bun yoksa `kur.sh` onu açar. Bağımlılık
kurulum betikleri varsayılan kapalı (`--ignore-scripts`) → gcc-c++/make/node header gerekmez (`KUR_BETIKLER=1` eski
davranış). npm'in registry ayarı (`/etc/npmrc` dahil) bun'a aktarılır, `~/.bunfig.toml` gerekmez. Sahada etkisi:
mevcut makinede bun zaten kurulu → aynen o kullanılır; tek fark kurulum betiklerinin atlanması.

## 2026-10-05 — motor: upstream opencode 1.18.33 → 1.18.34

Çakışma yok; yamalarımızın hiçbiri upstream'de çözülmemiş, düşürülen yama yok. Motor farkı küçük: oturum kimliği
başlıkları (`x-opencode-session-id`) artık tüm sağlayıcılara gidiyor (kurum ucu bilmediği başlığı yok sayar).
Doğrulama: yamalı alan testleri + `engine/plugins` 160/0 + typecheck + `kur.sh derle` + `smoke-ikili.sh` GEÇTİ.
Ürün sürümü değişmedi (2.0.0). Sahada `al.sh` → `./kur.sh` (kaynak yeni → yeniden derler).

## 2026-09-30 — çevrimdışı veri + uyumluluk kontrolü varsayılan gelir (T33)

Alp: "opencode yetenek olarak bunlarla gelsin … uyumlulukları kontrol edebilsin matriksleri". `rke2-ansible`
becerisine **Çevrimdışı veri** bölümü gömüldü (Rancher matrisi 7 sürüm: upstream aralığı, downstream hatları, RHEL ·
RKE2 hatlarının en son yaması · Antrea↔K8s tablosu) — her satırda kaynak dosya/satır; beceri yüklenince model
doğrudan görür (dosya/izin/internet gerekmez). **Uyumluluk kontrolü** prosedürü: mevcut durum + kurulum/yükseltme
öncesi kombinasyon → ✅/❌ + en az/önerilen + kanıt; veri yoksa "❓ hesaplanamadı". `AGENTS.md`: sürüm/uyumda tahmin
yasak. Veri tek kaynaktan (kurum rke2-ansible) `script/veri-guncelle.sh` ile üretilir. Sahada `al.sh` → `./kur.sh`.

## 2026-09-30 — beceri: Antrea uyumu tahmin edilmez, tablo kullanılır (T32)

Saha (ekran10): Antrea aracı internetsiz çalışamadı, model v2.3.0 + 1.33'ü tahminle "uyumlu" saydı — yanlış
(v2.3 → 1.29–1.32). Beceride tam tablo (v2.0–v2.7) ve kural: `antrea_surum.py <k8s> --antrea <sürüm>` çalıştır,
tahmin etme. rke2-ansible'da tablo artık repoda (`araclar/matris/antrea-uyum.txt`), araç internetsiz çalışır.
Kurum: Antrea v2.3.0 + 1.33.13 kural dışı → önce Antrea ≥ v2.4 (önerilen v2.7.0). Sahada `al.sh` → `./kur.sh`.

## 2026-09-30 — beceri: Rancher/upstream sürümünü tespit et, matrise uygun kur (T31)

`rke2-ansible` becerisine akış: **tespit** (Rancher sürümü, upstream = `local` küme ve downstream RKE2 sürümleri —
kesin yollar + sahada doğrulanacak `kubectl` yolları) → **matris** (`rancher_matris.py … --upstream/--downstream`,
internetsiz, ✅/❌) → **seç** (bir sonraki Rancher'da da desteklenen hat) → **kur** (`indir.sh` → envanter →
`--check` → K1 "kurulum yapacağım"). Kurum durumu: Rancher v2.14.3, kümeler v1.33.13 → uygun; v2.15'e geçmeden önce
RKE2 ≥ 1.34. Sahada `al.sh` → `./kur.sh`.

## 2026-09-30 — K1: "kurulum yapacağım" harf duyarsız tanınır (T30)

Alp (T28 sorusunun cevabı): kilit kalsın, ama "büyük ya da küçük harf fark etmez, kurulum yapacağım dediği zaman
anlaması lazım". Kurulum beyanı artık cümlenin herhangi bir yerinde, harf duyarsız tanınır (`kurulum yapacağım`,
`Kurulum`, `YENİ KURULUM`); `kurulumu`/`kurulumda` ve `kurulum yapmayacağım` beyan sayılmaz. Sunucu listesi yine
şart. `CN:`/`sunucular:` satırları zaten harf duyarsızdı (testle doğrulandı). Sahada `al.sh` → `./kur.sh`.

## 2026-09-30 — K1: yeni kurulumda numara yok, salt-okunur playbook serbest (T28)

Saha (ekran6): salt-okunur `01-ping.yaml` bile KURULUM/CN yetkisi istiyordu; Alp: "yeni kurulumda değişiklik
numarasına ihtiyaç yok". Artık: kilit playbook dosyasını okur — tüm görevleri yalnız okuyan playbook (ping, setup,
debug, salt-okunur command/shell) **yetkisiz** çalışır. Değişiklik yapan kurulumda yalnız `KURULUM` (ya da
`YENİ KURULUM`) + `sunucular:` (numarasız); ajan yeni kurulumda CN önermez. K5 artık playbook içindeki komutlara da
uygulanır. Sahada `al.sh` → `./kur.sh` (eklenti değişti, ikili değişmedi).

## 2026-09-29 — Satellite: kurumdaki gerçek kullanım (yalnız kayıt)

Kurumda Satellite ile yapılan tek iş sunucu kaydı (kurumun abonelik betiği) — `rhel-yonetim`'e "Satellite kaydı"
bölümü (kontrol komutları, betiği uydurma) eklendi; `sistem-guncelleme`'nin park'taki `satellite-yonetim`'e verdiği
boş yönlendirme buna çevrildi. `satellite-yonetim` (hammer/content view) park'ta kalıyor (kısa süre onaylıya alınıp
geri alındı). Rke2-ansible becerisine gün içinde: CIS kararları, elle worker ekleme (GPU H200), GPU disk düzeni.

## 2026-09-29 — beceri: rke2-ansible güncellendi (sürüm seçimi, Antrea, SUC, kurum fork'u)

`rke2-ansible` becerisi kurumun karar kurallarını öğrendi: RKE2 sürümü **Rancher destek matrisine** göre (tablo;
v2.15.2'de 1.33 destek dışı), **Antrea** uyum tablosu (v2.4–v2.7), yükseltmeyi **system-upgrade-controller**
yapar (`rke2_upgrade: false`), RHEL 9 CIS `/tmp noexec` + SELinux notları ve kurum fork'unun
(`alparslanozturk/rke2-ansible`) araçları: `rancher_matris.py`, `antrea_surum.py`, `airgap/indir.sh`, preflight.
Sahada `al.sh` → `./kur.sh` ile gelir.

## 2026-09-29 — beceri: rke2-ansible (kümeye node ekleme)

Sahadaki playbook **rancherfederal/rke2-ansible 2.x** yapısında (`host.yml`, `group_vars/all.yml`,
`pre_deploy_manifests/antrea.yaml`); `hepapi/rke2-ansible` `hepapi` dalı eski 1.x — beceri 2.x kodundan yazıldı.
İçerik: 2.x akışı (mevcut küme algısı, token `delegate_to`, config.yaml blockinfile → restart), node eklemeden
önceki tuzaklar (`rke2_kubernetes_api_server_host` sabitleme, aynı 1.33 tarball, antrea imajlarının kayıt
aynasında olması, `upgrade.yml` drain etmez) ve prosedür: keşif → envanter → `--check --diff` → yalnız yeni
node'lara `--limit` koşusu → doğrulama. İkili değişmedi; sahada `al.sh` → `./kur.sh` (`beceri: kurulu 13`).

## 2026-09-28 — ürün 2.0.0: kapanış sürümü

1.0.5'in içeriği + kapanış. **Ürün** sürümüdür; motor upstream **1.18.33** (opencode 2.x hattı değil).
Sahada: `al.sh` → `./kur.sh` (2.0.0 → yeniden derler).

- **Gizleme yok:** araç çıktısı, audit kaydı ve dosya erişiminde maskeleme/redaksiyon/hassas dosya engeli
  kaldırıldı (kurum içi offline). Kalan kilitler: K1 değişiklik kapısı (CN/KURULUM/KRİZ), K5 yıkıcı komut,
  K6 yalnız yazma koruması (model kendi ayarını/eklentisini/audit'ini değiştiremez).
- Audit kaydına `cn` alanı (çağrı anındaki yetki).
- Saha sabitleri dosyası isteğe bağlı; kur.sh oluşturmaz.
- Dokümanlar gerçekle hizalandı; öneri listesi kapatıldı (açık madde yok).
- Doğrulama: eklenti testleri 130/0 · motor/sunucu/oturum/araç testleri 810/0 · TUI pano 6/0 ·
  `bash -n` + `shellcheck -S warning` temiz · `duman-kontrol-rapor` 23/0 · derleme + `smoke-ikili` GEÇTİ.

## 2026-09-28 — ürün 1.0.5: Claude Code gibi dizin sınırı, fare/kopyalama, tüm beceriler

Sahada: `al.sh` → `./kur.sh` (1.0.5 → yeniden derler). Kontrol raporunda `fare: kapali` ve
`beceri: kurulu 12` görmelisin.

- **Dizin sınırı = opencode'u açtığın dizin** (Claude Code gibi). Git kökü artık kapsamı genişletmiyor;
  `ls`/`find`/`grep`/`head`/`du`… komutlarının yolları da denetleniyor → dışarı çıkmadan önce izin sorar.
- **Fare/kopyalama:** `tui.json`'da `mouse:true` kalmışsa da `false`'a çekilir; MobaXterm seçip kopyalar.
  Kontrol raporunda yeni `fare` satırı.
- **Beceriler:** `approved/`'daki 12 becerinin hepsi kurulur (disk-ekleme ve paket-uret daha önce kurulmuyordu).
- **Model seçimi:** açılışta otomatik kurum modeli; `/models` ile seçmek gerekmez.
- **Saha sabitleri (isteğe bağlı):** `~/.config/opencode/saha-sabitleri.md` varsa her oturumda modele verilir;
  kur.sh oluşturmaz (şablon: `knowledge/templates/saha-sabitleri.md`).
- **Çalışma akışı:** model işi sonuna kadar yapar, yalnız onay gereken yerde durur; eksik bilgide durmaz,
  sonda "açık kalanlar" verir.
- Kontrol başlığında gerçek makine adı ve dizin (maske kaldırıldı). Motor upstream 1.18.33.
- Repo: AI atıf satırını silen commit hook'u artık gerçekten çalışıyor; öneri listesi sadeleşti.

## 2026-09-26 — ürün 1.0.4: tekrarlar tükenince açık mesaj (A23)

Geçici uç hatasında opencode 5 kez (2 sn → 30 sn arası beklemeyle) yeniden dener. Artık 5. denemeden sonra da
başarısız olursa hata mesajının sonunda "5 otomatik denemeden sonra vazgeçildi; oturum korunuyor, mesajını
tekrar gönderip devam edebilirsin" (İngilizce) yazar. Sahaya `./kur.sh` ile gider (1.0.4 → yeniden derler).

## 2026-09-26 — beceri: disk-ekleme onaylıya alındı, saha dersleriyle yeniden yazıldı (A24, A26–A28)

Sahada model disk ekleme planında cihaz harfini varsaydı, kontrolsüz `mkfs` sıraladı, kurumun ad/bağlama düzenine
uymadı ve `fstab`'a körlemesine `>>` yazdı. Beceri artık: **keşfet → kurum düzenini oku → plan → onay → uygula**;
disk boş kanıtlanmadan yıkıcı adım yok (`lsblk -f`, `pvs`, `wipefs -n`); VG/LV adı ve bağlama noktası mevcut
sunucudan türetilir, çıkmazsa sorulur; fstab satırı yedek + `grep -q … ||` ile tekrar çalıştırılabilir,
`findmnt --verify` ile yeniden başlatmadan doğrulanır. Parked → approved (kur.sh kurar).

## 2026-09-26 — mimari: motordan bağımsız güvenlik çekirdeği + 2.x hazırlığı (ADR-0005)

- Upstream 2.x incelendi: eklenti API'si baştan yazılmış, bizim kancalar (`tool.execute.*`, `chat.message`)
  **yok** → 2.x'te kilitler/audit yüklenmezdi. Karşılıkları mevcut (hatta CN'siz değişikliği "sor"a düşürmek
  mümkün). Geçiş hâlâ npm `latest` 2.x olunca (ADR-0003).
- Hazırlık: güvenlik mantığı `engine/plugins/lib/` altına **motordan bağımsız çekirdek** olarak ayrıldı
  (`kilit.ts`, `maskele.ts`); `audit-log.ts` artık ince 1.x adaptörü. Davranış değişmedi.
- `kur.sh` `plugins/lib/`'i de kurar; **`kontrol` raporuna `kilit` satırı**: eklenti ya da `lib/` dosyası eksikse
  hata (yoksa kilitler sessizce kapanırdı), gözlem modu uyarı. Rapor 26/28 satır (≤29).
- Doğrulama: 122 + 4 (yeni çekirdek testi) test, derlenmiş ikiliyle uçtan uca kilit senaryoları, duman 23/0.

## 2026-09-26 — kurulum: MobaXterm kopyalama + CI (A22 kararı, A14)

- **Kopyalama (A22, Alp kararı):** `./kur.sh` artık `~/.config/opencode/tui.json`'a `"mouse": false` yazar →
  seçimi terminal yapar, MobaXterm "copy on select" panoya gerçekten kopyalar. Bedel: TUI içinde fareyle
  kaydırma/tıklama yok. `mouse` zaten ayarlıysa dokunulmaz; istemeyen `ALP_TUI_FARE=1 ./kur.sh`.
  İkili değişmedi (sürüm 1.0.3 kalır) — yalnız `./kur.sh` yeniden çalıştırılır.
- **CI (A14):** `.github/workflows/alp-ci.yml` — her push/PR'da bash sözdizimi, shellcheck, kilit+audit
  testleri, maskeleme taraması (`script/maskeleme-tara.sh`, yeni). Derleme gerektiren duman testleri yerelde.
- **Açık:** upstream'den gelen 27 iş akışı fork'ta da çalışıyor (issue/PR kapatan botlar dahil, 102 çalıştırma);
  kapatılması Alp'e bırakıldı.

## 2026-09-26 — ürün 1.0.3: anahtar sızıntısı, audit doğrulayıcı, dürüst kopyalama bildirimi

Sahaya `./kur.sh` ile gider (sürüm 1.0.3 → yeniden derler).

- **A16 — anahtar `ps`'te görünmüyor:** kurulum sırasında kurum anahtarı `curl`/`python` komut satırına
  yazılıyordu (aynı makinedeki herkes `ps` ile görebilirdi); artık stdin/ortam değişkeninden gidiyor.
  Ek düzeltme: anahtarda `"` ya da `\` varsa curl onu sessizce kırpıyordu → kaçış eklendi.
- **C3 — `script/dogrula-audit-zinciri.sh`:** audit kayıtlarının silinip/değiştirilmediğini doğrular
  (döndürülmüş `.gz` dosyalar dahil); kopmayı `dosya:satır` ile gösterir. Salt-okunur.
- **A22 — "Copied to clipboard" yalanı:** pano aracı yoksa (MobaXterm + ssh) artık "başarılı" demiyor;
  yalnız terminal yolu (OSC 52) denendiyse **uyarı** gösteriyor, hiçbir yol yoksa hata. Sahada gerçek
  kopyalama için hâlâ bir karar bekleniyor (aşağıdaki not).
- **C4 — kapatıldı (gerek yok):** beceri listesinde çökme riski teorikti; beceri isimleri kayda girmeden
  doğrulanıyor (`skill/index.ts` `isSkillFrontmatter`). Çekirdeğe gereksiz yama yapılmadı.

- **Doğrulama düzeltmesi:** 24 Eylül'deki "1.18.32 duman testi geçti" kaydı yanlıştı — test derleme yapmadan
  eski `bin/opencode` (1.18.30) ile koşmuştu. 1.18.32 motorlu ikili ilk kez bugün derlendi (1.0.3):
  duman testi GEÇTİ, kilit senaryoları (K1 yetkisiz/CN'li, K5, K6, salt-okunur) aynı sonucu verdi.

> **Karar bekleyen (A22 devamı):** MobaXterm'de seçip kopyalamanın gerçekten çalışması için TUI'nin fare
> yakalamasını kapatmak gerekir (`~/.config/opencode/tui.json` → `"mouse": false`; seçim terminale kalır,
> MobaXterm "copy on select" çalışır). Bedeli: TUI içinde fareyle kaydırma/tıklama olmaz.

## 2026-09-24 — ürün 1.0.2: güvenlik kilitleri K1–K7 (ADR-0004)

Tek sayfa: `knowledge/policy/GUVENLIK-KILITLERI.md`. Sahaya `./kur.sh` ile gider (sürüm 1.0.2 → yeniden derler).

- **K1 değişiklik kilidi:** sunucuda/sistemde değişiklik yalnız sohbete yazılan yetkiyle —
  `CN: <no>` + `sunucular: …` · `KURULUM` + `sunucular: …` · `KRİZ` + kriz maili/toplantı notu +
  `sunucular: …`. Hedef listede değilse red. Bu makine için `localhost`. `YETKİ KAPAT` ile kapanır.
- **K2** dizin dışı onay sorar (vardı, korunuyor) · **K3** proje dosyalarını okumak onay sorar ("always" =
  o oturumda serbest) · **K4** izin listesi düzeltildi (`ss*`→`ssh`, `ps*`→`psql` açığı; `find -delete`,
  `hostname x`, `date -s`, `ip … del` artık sorulur).
- **K5** yıkıcı komutlar (`rm -rf /`-benzeri, mkfs, diske dd, force-push) yetkiyle bile çalışmaz ·
  **K6** ajan kendi ayarını/eklentisini/audit log'unu değiştiremez, anahtarı okuyamaz · **K7** varsayılan
  kilitli (gözlem modu: `OPS_AGENT_KAPI=GOZLEM`).
- Düzeltmeler: git'siz dizinde eklentinin kapsam denetimi çalışmıyordu (worktree `/`); `kur.sh` test
  dosyasını da eklenti klasörüne kopyalıyordu (artık `*.test.ts` hariç, eskisi silinir).
- Doğrulama: `audit-log.test.ts` 97 test; derlenmiş ikiliyle uçtan uca 6 senaryo; `duman-kontrol-rapor.sh` 22/22.

## 2026-09-24 — motor opencode 1.18.30 → 1.18.32 + upstream takibi (ADR-0003)

- Motor upstream **1.18.32**'ye alındı (ayrı `vendor:` commit'i). Bizim çekirdek yamalarımıza upstream
  dokunmamış; tek çakışma bir test dosyasıydı. Gelenler: TUI hata çıkış kodu, uzak ayar giriş hatası
  mesajı, AI SDK bağımlılık güncellemeleri. #49414 (sonsuz yeniden deneme) upstream'de hâlâ açık → yama duruyor.
- Yeni: `script/upstream-kontrol.sh` (rapor / `uygula`) + `knowledge/runbooks/upstream-guncelleme.md`.
  Kural: en fazla 2 sürüm geride; 2.x ana sürüm (upstream'de etiketli, npm `latest` değil) ayrı karar.
- Ürün sürümü (`kur.sh SURUM`) değişmedi; sahaya bir sonraki derlemeyle gider.

## 2026-09-23 — saha raporu & sürüm izlenebilirliği (T2 + T3 + T4)

Üçü de `kur.sh` içinde; kökte yeni dosya yok, yardımcılar `script/` altında.

**T2 — kontrol raporu her modda ≤29 satır.** İki uç tanımlıyken (`KURUM_URL_2`) rapor 33 satıra
çıkıyordu. Bilgi kaybı olmadan kısaltıldı:

- Bölüm ayracı + bölüm başlığı **tek satırda** birleşti (`bolum()`): `-- KURULUM (ag gerekmez) ---`.
  Hem KURULUM hem KURUM AI UCU bölümünde birer satır kazandı.
- Uç başlığı iki satırdan bire indi: `-- KURUM AI UCU · <url> ---` + `model: … · anahtar: … ·
  zaman asimi …`. (`ayar kaynagi` satırı `-a`'ya taşındı.)
- `DNS` ve `TCP` satırları tek `ag` satırında birleşti — aynı veri: çözümlenen IP'ler, port açık mı,
  tanımlı proxy değişkenleri.
- İki uç bloğu **4 satırdan 2 satıra** indi: ayraç kaldırıldı, iki uç **iki sütunda** tek satırda
  basılıyor, altında karar satırı. Uç başına veri korundu (erişim · model listede mi · bağlam ·
  3 ölçümün medyanı). Sütun taşarsa **yalnız host kısalır**, ölçüm sayıları hep görünür; iki ucun
  bağlam penceresi ayrıca karar satırına yazılıyor. Tam döküm (uç başına 3 satır) `--ayrintili`/
  yeni kısa yazımı **`-a`** ile.

**Ölçüm (sahte uçla, `wc -l`):** tek uçlu **25**, iki uçlu **27** satır — ikisi de ≤29. Ölçüm
`script/duman-kontrol-rapor.sh` içinde bir test olarak duruyor, elle sayılmıyor.

**T3 — çıktı (output) sınırı artık uçtan öğreniliyor.** `opencode.json`'daki `limit.output`
şablondan gelen sabit 4096'ydı. Sıra: (1) `/v1/models` alanları (`max_output_tokens`,
`max_completion_tokens`, `max_output_len`, `max_generated_tokens`, `max_tokens`, `output_limit`,
`limit.output`) → (2) **probe**: tek istek, `max_tokens` bilerek aşırı büyük; uç reddedip sınırını
hata mesajında söylerse oradan okunur → (3) `env` → `KURUM_MAX_OUTPUT` → (4) **güvenli varsayılan
4096**. Probe `stream: true` gider ve uç isteği kabul ederse akış ilk parçada kesilir (uçta uzun
üretim başlamaz); vLLM'in "maximum **context** length is N" mesajı bilerek eşleşmez — o sayı çıktı
sınırı değildir. Bulunan değer bağlam penceresini aşarsa kırpılır, 512'nin altındaysa yok sayılır.
**Sessizce sabit kalmaz:** kurulum hangi basamağın kazandığını `~/.config/opencode/kur-durum`
künyesine yazar, kontrol raporu da `ayar` satırında basar — fallback hâlinde
`cikti 4096 (uctan alinamadi → 4096)`. `env.example` **şablon kaldı** (yer tutucu `KURUM_MAX_OUTPUT`
satırı yorumlu); gerçek değer `env`/`env.local`'a yazılır.

**T4 — ikili ↔ sürüm ↔ commit (denetim bulgusu 3).** Derleme anında ikilinin yanına künye yazılıyor
(`bin/opencode.derleme`: `surum`/`kanal`/`commit`/`kirli`/`boyut`/`tarih`); kurulum onu ikiliyle
birlikte `~/.opencode/bin/`'e taşıyor. Rapor `ikili` satırında `surum … · commit … (=HEAD) ·
derleme <tarih> · HEAD …` gösteriyor. Tutarsızlıkta tek satırlık `surum !` uyarısı düşüyor:
ikili sürümü `kur.sh`'ın beklediğinden farklı · ikili commit'i repo HEAD'inden farklı · künye yok
(izlenemiyor) · künye başka ikiliye ait (boyut tutmuyor) · derleme anında çalışma ağacı kirliydi.
**Sağlam kurulumda bu satır basılmaz**, bütçe korunur. Künye `.gitignore`'da (yerel derleme çıktısı).

**Testler.** Yeni `script/duman-kontrol-rapor.sh` — sahte uç (`script/sahte-uc.py`, loopback) ile
22 durum: T3'ün dört basamağı (alan/probe/env/varsayılan) uçtan uca (`opencode.json` + künye +
rapor metni), T2 satır bütçesi `wc -l` ile (tek uç/iki uç), 100 sütun taşması, `-a` dökümü, uç
başına verinin korunduğu, T4'ün beş uyarı yolu + `kunye_yaz`. Her durum kendi geçici `HOME`'unda
koşar; gerçek `~/.opencode` ve `~/.config/opencode` değişmez. `kur.sh` `source` edilince ana akışı
çalıştırmıyor (`BASH_SOURCE`/`$0` kapısı) — fonksiyonlar derleme yapmadan sınanabiliyor.

**Doğrulama:** `bash -n kur.sh` temiz · `shellcheck -S warning` temiz · `script/smoke-ikili.sh`
geçti · `script/duman-kontrol-rapor.sh` 22/22 geçti.

**CANLI DOĞRULANMADI:** kurum ağına erişim yok. Gerçek kurum ucunda doğrulanmayanlar: (a) uçun
`/v1/models` yanıtında çıktı sınırı alanı **gerçekten var mı**, adı hangisi; (b) probe'un gerçek
uçtaki hata mesajı biçimi — kalıplar tutmazsa 4096'ya düşer ve rapor bunu yazar (sessiz sabit yok);
(c) iki uç karşılaştırmasının gerçek gecikme değerleri. Ölçülen satır sayıları sahte uçla alındı;
gerçek uçta satır **sayısı** değişmez (içerik uzunluğu değişir, kırpma devrede).

## 2026-09-22 — derlenmiş ikili çöküyordu: `splitting: false` (build.ts) — sürüm 1.0.1

**Sorun (Alp):** sahada `oc` hiçbir prompt gönderemiyordu — TUI'de `Failed to send prompt` /
`Unexpected server error`, log'da `TypeError: undefined is not an object (evaluating 'a.name')`
(stack: `resolve` → `map` (×3) → `SystemPrompt.environment`). Ayarla ilgisi yoktu: boş dizin, config'te
`references` bile yokken tetikleniyordu. `bun run packages/opencode/src/index.ts` ile **kaynaktan**
çalıştırınca hiç çökmüyordu — yalnız `bin/opencode` (derlenmiş tek-dosya ikili) çöküyordu.

**Kök neden:** `packages/opencode/script/build.ts`'deki `Bun.build(...)` çağrısı `splitting: true`
kullanıyordu. Bu ayar tarayıcı paketlerinde gecikmeli (lazy) chunk yüklemesi için var — tek dosyalık
`compile` çıktısında hiçbir faydası yok, ama dairesel import'ları ayrı chunk'lara bölüp değerlendirme
sırasını bozuyor: `core/src/location-services.ts`'deki `locationServices` (bir `LayerNode.group([...])`
dizisi, ör. `Reference.node`) elemanlarından biri, kendi modülü henüz tam başlatılmadan okunduğu için
`undefined` kalıyordu. `LayerNode.hoist`'in `resolve: (a) => replacementMap.get(a.name) ?? a`
fonksiyonu bu `undefined` düğümle çağrılınca `a.name` patlıyordu — ilk prompt gönderiminde
`SystemPrompt.environment` bu ağacı (referans listesi için) kurarken tetikleniyordu.

**Düzeltme:** `splitting: true` → `splitting: false` (`packages/opencode/script/build.ts`). Kod
değişmedi, yalnız derleme bayrağı. `kur.sh`'ın derleme adımı zaten bu dosyayı çağırıyor, başka bir
değişiklik gerekmedi.

**Doğrulama (bu koşumda gerçekten çalıştırıldı)**
- Aynı kaynağı `splitting: true`/`false` ile ayrı ayrı derleyip ikisini de minimal sahte sağlayıcı
  config'iyle (`{"provider":{"sahte":{...}}}`, boş dizin, git deposu değil) çalıştırdım:
  `splitting: true` → aynı `a.name` çökmesi birebir tekrarladı; `splitting: false` → çökme yok,
  istek modele kadar gitti (sahte uca `Cannot connect to API` — beklenen, uç zaten yok).
- Gerçek üretim derlemesi (`OPENCODE_VERSION=1.0.0 OPENCODE_CHANNEL=main bun run
  ./packages/opencode/script/build.ts --single --skip-embed-web-ui --skip-install`, `kur.sh`'ın
  kullandığı komutun aynısı): smoke test `1.0.0` geçti, `bin/opencode --version` → `1.0.0`,
  aynı repro komutu artık `a.name` hatası vermeden modele kadar gidiyor.
- `turbo typecheck` **çalıştırılmadı** (bilinen donma riski, bkz. `knowledge/incidents/2026-09-19-typecheck-donma.md`).

**Ayrıca (defansif koruma, aynı sürüm):** aynı çökmeyi başka bir yoldan (bozuk/eski config'teki
`reference` girdisi veya plugin dönüşümü) imkânsız kılan katman da eklendi — core config plugin'i
ve Reference materialize geçersiz girdiyi **uyarı loguyla** (hangi config dosyası + hangi anahtar)
eler; `SystemPrompt.environment` ve `Agent` ise `list()` çıktısındaki tanımsız/eksik alanlı kayıtları
atlar. Gerileme testleri: `packages/core/test/reference.test.ts` ve
`packages/opencode/test/session/system.test.ts` (düzeltmeden önce aynı `a.name` çökmesiyle
kırmızıydı).

**Sürüm:** asıl düzeltme `cca807db28` (`splitting: false` + sürüm 1.0.1), defansif koruma
`9ad34675c6` (bozuk `reference` girdisi guard'ı) — ikisi de aynı sürümde (1.0.1) birlikte gitti.
Olay kaydı: `knowledge/incidents/2026-09-22-derlenmis-ikili-a-name-cokmesi.md`.

Detay: `NASIL-CALISTIRILIR.md` → "Sorun giderme" tablosu.

## 2026-09-22 — ürün sürümü 1.0.0 (kanal `main`)

**Sorun (Alp):** saha ikilisinin `--version` çıktısı `0.0.0-main-202609221336` idi — kanal git
branch adından (`main`) geldiği için "preview" sayılıyor, sürüm tarih damgalı üretiliyordu.
*"Sürüm numarasını 1.0.0 yap iyi olmaz mı?"* → ürün sürümü **vendor sürümünden ayrıldı**: **1.0.0**.

**Ne değişti**
- `kur.sh` derleme adımı `build.ts`'i `OPENCODE_VERSION` + `OPENCODE_CHANNEL` ile çağırır; sabitler
  bölümünde **tek yer**: `SURUM` (varsayılan `1.0.0`) ve `KANAL` (varsayılan `main`). `bin/opencode
  --version` artık **`1.0.0`** basar.
- **Nasıl değiştirilir:** `OPENCODE_VERSION=1.0.1 ./kur.sh derle` ya da `env.local`'a
  `OPENCODE_VERSION=1.0.1` satırı ekleyip `./kur.sh` (kurulum akışı env'i okur, sabiti ezer).
- **Kanal bilerek `main` kalır:** `packages/core/src/database/database.ts` DB dosyası adını kanala göre
  seçiyor (`opencode-<kanal>.db`); kanal `latest` olursa sahadaki mevcut oturum verisi `opencode.db`'ye
  kayar (istenmiyor). `main` kalınca davranış aynıdır, yalnız sürüm 1.0.0 olur.
- **Sürüm uyuşmazlığı tetikleyicisi:** `kur.sh` artık `bin/opencode --version`'ı `SURUM` ile
  karşılaştırır — farklıysa (ya da sürüm okunamıyorsa) kendiliğinden yeniden derler. Sahada
  `al.sh` + `./kur.sh` yeterli, elle `ALP_DERLE=1` gerekmez.
- **Vendor/upstream değişmedi:** `package.json`'lar upstream `1.18.30`'da kalır — bunlar vendor
  sürümüdür; ürün sürümünü yalnız `kur.sh` içindeki `SURUM` satırı belirler.

**Doğrulama (bu koşumda gerçekten çalıştırıldı)**
- `bash -n` + `shellcheck -S warning` → 0 bulgu; `Script.version/Script.channel` çözümü `1.0.0 main`.
- Gerçek derleme (`ALP_DERLE=1 ./kur.sh derle --bin-kopyala`) → `bin/opencode --version` = `1.0.0`
  (build smoke test'i de `1.0.0`); ikinci `./kur.sh` koşumu derleme yapmadı
  ("hazır bin/opencode güncel"); `./kur.sh kontrol` `ikili` satırı `surum 1.0.0`, satır sayısı aynı.
- Uyuşmazlık tetikleyicisi: saha ikilisi taklit edilince (`--version` = `0.0.0-main-202609221336`)
  `0/4` adımı **"sürüm uyuşmuyor (kurulu: …, istenen: 1.0.0)"** ile yeniden derledi ve ikili
  kendiliğinden `1.0.0`'a döndü.

## 2026-09-22 — tek betik: `kur.sh <parametre>`; 01/02/03 kaldırıldı

**Sorun (Alp):** *"Tek kur.sh yap, parametre alsın, default parametre kurmak olsun. Diğer sh'ları sil."*

**Ne değişti**
- `01-derle.sh`, `02-kur.sh`, `03-kontrol.sh` **`git rm` ile silindi**; içerikleri `kur.sh` içine
  bash fonksiyonu olarak taşındı (`derle()` · `kur()` · `kontrol()`; ortak yardımcılar tek yerde).
  Kök dizinde `*.sh` olarak **yalnız `kur.sh`** kaldı.
- **Parametre düzeni (bayrak değil, alt komut):** parametresiz = `kur`; `kur` · `derle` · `kontrol` ·
  `yardim`/`-h`/`--help`; bilinmeyen parametre → dostça Türkçe hata + kullanım, çıkış kodu `2`.
- Seçenekler korundu ve kontrol aşamasına bağlandı: `--zaman-asimi <sn>` · `--ayrintili` ·
  `--url`/`--key`/`--model` (`kur`/varsayılan akışta verilirse kontrol aşamasına aktarılır).
- `env.example` artık **gerçek saha varsayılanlarını** taşıyor (`KURUM_URL` kurum adresi,
  `KURUM_KEY=***` yer tutucu, `MODEL_ID`; `KURUM_URL_2`/`KURUM_KEY_2`/`MODEL_ID_2` ve
  `KURUM_MAX_CONTEXT` yorum satırı) — `env` yoksa `kur.sh` onu otomatik oluşturur (izin 600).
- Davranış aynen korundu: env kapısı, node header tgz idempotentliği, hazır ikili yolu YOK
  (her zaman kaynaktan derlenir; `bin/ripgrep.tar.xz` korunur), kısayol tek sahibi kurulum,
  kontrol ekranı ≤30 satır + iki uç karşılaştırması (`KURUM_URL_2`), kurulum çıkış kodunu kontrol
  bulguları bozmaz.
- Dokümanlar 01/02/03 referanslarından arındırıldı (`ALP-README.md`, `NASIL-CALISTIRILIR.md`
  — parametre tablosu + "env oluşturma adımı gerekmez" notu —, `MIMARI.md`, `DENEYIM-AKTARIM.md`,
  `docs/CC-GECIS-KARTI.md`, `engine/`, `knowledge/`, `env.example`, `.gitignore`).

**Doğrulama (bu koşumda gerçekten çalıştırıldı)**
- `bash -n` tüm `*.sh` temiz; `shellcheck -S warning` → 0 bulgu.
- İzole `HOME` + geçici kopya: `./kur.sh yardim` → kullanım; bilinmeyen parametre → hata + çıkış 2;
  `env` yokken `./kur.sh` → `env` `env.example`'dan oluştu (izin 600), çıktıda anahtar yok.
- İki yerel sahte uçla (biri yapay gecikmeli) `./kur.sh kontrol`: karşılaştırma bloğu + "daha hızlı"
  karar satırı doğru; `KURUM_URL_2` yokken blok hiç basılmıyor. Gerçek kurum ucuna istek atılmadı,
  derleme yapılmadı.

## 2026-09-22 — saha yüzeyi `./kur.sh`, hazır ikili yolu kaldırıldı

**Sorun (Alp):** *"tek giriş `./kur.sh` olsun; binary durmasın, kaynaktan derliyoruz; env'i sahada elle yazmayalım."*

**Ne değişti**
- **`./kur.sh` saha komutu oldu.** `02-kur.sh` iç uygulama adımı olarak kalır; kurulum bitince
  bayraksız `03-kontrol.sh` raporu basılır.
- **Hazır ikili arşiv/indirme yolu kaldırıldı.** Çözümleme sırası artık yalnız:
  `bin/opencode` varsa kullan → yoksa `01-derle.sh` ile kaynaktan derle.
- `env` yoksa ve `env.local` varsa `env.local` → `env` kopyalanır, izin `600` yapılır. İkisi de yoksa
  dostça hata verilir; kontrol raporu çağrılmaz.
- `node-v24.19.0-headers.tar.gz` **repoya alınır** (sahada ağ yok, kaybolmasın). `.gitignore` artık
  yalnız *açılan* ağacı dışlar: `/node-v[0-9]*/` + `/node-v*-headers` (dizin ya da bağ).
- `01-derle.sh` derleme öncesi header ağacını hazırlar. **Dikkat:** resmi arşiv `node-v24.19.0/`
  dizinine açılır (içinde `include/node/`), adında `-headers` **geçmez**; node-gyp ise sahada
  `node-v24.19.0-headers` adını bekliyor. Betik bu yüzden arşivi açar ve `-headers` adını o dizine
  **symlink** ile bağlar — sahada elle konulmuş gerçek `node-v24.19.0-headers/` dizinine **dokunmaz**.
  Hazırsa tekrar açmaz (idempotent); hata olursa **tek satır uyarı** verip kuruluma devam eder.

## 2026-09-22 — betik adları **numaralandı**: `01-derle.sh` · `02-kur.sh` · `03-kontrol.sh`

**Sorun (Alp):** *"Başına alp yerine 01-derle yaz bari."* — Kişi adı ön eki (`alp-`) saha akışı
hakkında hiçbir şey söylemiyordu; `ls` çıktısı alfabetik sıralıyordu (`alp-derle` → `alp-kontrol`
→ `alp-kur`), yani **yanlış** sırayı gösteriyordu.

**Ne değişti (yalnız adlandırma — davranış birebir aynı):**
- `alp-derle.sh` → **`01-derle.sh`** · `alp-kur.sh` → **`02-kur.sh`** · `alp-kontrol.sh` →
  **`03-kontrol.sh`** (`git mv`, geçmiş korundu). `ls` artık akış sırasını gösteriyor.
- Yönlendiriciler güncellendi: `kur.sh` → `./02-kur.sh`, `oc-teshis.sh` → `./03-kontrol.sh`,
  `oc-dogrula.sh` → `./03-kontrol.sh --kurulum`. Repoya `alp` adlı yeni dosya **eklenmedi**;
  daha eski `alp.sh` depoda zaten yok (sahada rsync'ten kalan kopya varsa yok sayılır).
- Dokümanlarda `alp-*` geçişlerinin tamamı yeni adlara çevrildi (`ALP-README.md`,
  `NASIL-CALISTIRILIR.md`, `MIMARI.md`, `DENEYIM-AKTARIM.md`, `docs/`, `knowledge/`, `engine/`,
  `env.example`, `.gitignore`). Bu dosyadaki **eski kayıtlar** tarihçe olduğu için olduğu gibi
  bırakıldı (yukarıdaki not).
- Saha akışı tek komut olarak aynı: `al.sh` → **`./02-kur.sh`** → **`./03-kontrol.sh`**.

**Doğrulama (bu koşumda gerçekten çalıştırıldı)**
- `bash -n` tüm `*.sh` temiz; `shellcheck -S warning *.sh` → **0 bulgu**.
- İzole `HOME` + izole `KISAYOL_DIZIN`: ikili **yokken** parametresiz `./02-kur.sh` derledi + kurdu
  (çıkış 0); hemen ardından ikinci koşum derleme yapmadan yalnız kurdu (çıkış 0).
- Parametresiz `./03-kontrol.sh`: tek ekran, sonda tek satır `SORUN:`, anahtar maskeli, çökme yok.
- Eski adlarla çağrı (`./kur.sh`, `./oc-teshis.sh`, `./oc-dogrula.sh`) yeni betiğe yönleniyor.
- Ağır turbo typecheck **çalıştırılmadı** (bilerek — bkz. 2026-09-19 donma olayı).

## 2026-09-22 — **bayraklar kaldırıldı**: parametresiz tek komut (`./alp-kur.sh`)

**Sorun (Alp):** *"scriptlerin parametre almasına gerek yok; zaten amaç kurmak :-) Ne gerekçeyle
`--derle` ekledin? Zaten build + setup yapmasını bekliyorum."* — Kullanıcıya dönük bayrak listesi
(bkz. bir alttaki kayıt) sahada öğrenilmesi gereken bir yüzeydi; kararı betiğin kendisi vermeliydi.

**Ne değişti**
- **`./alp-kur.sh` bayrak almaz.** Parametresiz çağrı tam işi yapar: (gerekirse) derler → kurar
  (ayar + kurallar + beceri + plugin + rg) → kısayolu düzeltir → doğrular → **tek ekran özet**
  ("HAZIR — çalıştır: ..." ya da "HAZIR DEĞİL").
- **Derleme kararı otomatik:** `bin/opencode` yok → (paketten aç / kaynaktan derle); kaynak ağacı
  (`packages/opencode/src|script`, `package.json`, `bun.lock`) ikiliden **yeni** → yeniden derle;
  aksi halde derleme yok, yalnız kurulum (**~1.4 sn** ölçüldü). Derleme başarısız olur ama elde
  ikili varsa kurulum eski ikiliyle devam eder ve bunu açıkça söyler.
- **Kısayol çakışması artık soru sormuyor:** `opencode`/`oc` başka bir hedefi gösteriyorsa
  `.bak-<tarih>` olarak yedeklenir ve doğru ikiliye çevrilir (eski davranış: uyarıp dokunmamak +
  `--baglanti-zorla` istemek). Ayrıca PATH'te **önce** gelen başka bir `opencode` varsa uyarı basar.
- **`./alp-kontrol.sh` bayraksız çağrıda TÜM raporu verir:** önce KURULUM (ağ gerekmez), sonra
  KURUM AI UCU; tek ekran (**29 satır** ölçüldü, ≤100 sütun), sonda tek satır `SORUN:`, anahtar maskeli.
  `--ayrintili` gelişmiş seçenek olarak duruyor; `--kurulum`/`--uc` yalnız **iç** kullanımdır
  (`alp-kur.sh` kurulum sonrası doğrulamada `--kurulum` çağırır — ağ beklemesin diye).
- **`alp-derle.sh` sadeleşti:** kullanıcıya dönük `--kisayol` bayrağı kaldırıldı (kısayolun tek
  sahibi `alp-kur.sh`); dosya başlığında "İÇ DETAY — KULLANICI BUNU ÇAĞIRMAZ" yazıyor.
- **Gizli kaçış kapıları** (dokümanda yok, yalnız ayıklama için ortam değişkeni): `ALP_DERLE=1`,
  `ALP_DERLEME_YOK=1`, `ALP_TUM_BECERILER=1`, `ALP_DERLE_EK="..."`, `KISAYOL_DIZIN`.
- **Dokümanlar:** akış her yerde `al.sh` → **`./alp-kur.sh`** → **`./alp-kontrol.sh`**; bayrak
  tabloları kaldırıldı (`ALP-README.md`, `NASIL-CALISTIRILIR.md`, `MIMARI.md`, `docs/`, `knowledge/`).
  Yan düzeltme: aider fork'unun kendi `kur.sh`'ına giden iki atıf yanlışlıkla `alp-kur.sh` diye
  yeniden adlandırılmıştı — geri düzeltildi.

**Doğrulama (bu koşumda gerçekten çalıştırıldı)**
- İzole `HOME` + izole `KISAYOL_DIZIN`, sahte kaynak ağacı: ikili **yokken** parametresiz
  `./alp-kur.sh` derledi + kurdu (çıkış 0); ikili **güncelken** derlemedi; kaynak dosyaya `touch`
  sonrası yeniden derledi.
- Gerçek depoda parametresiz koşum: kaynak ağacı ikiliden yeni olduğu için **gerçekten derledi**
  (`alp-derle.sh`, 140 MB ikili), kurdu, doğruladı, çıkış 0. Hemen ardından ikinci koşum: derleme
  yok, **1.4 sn**, çıkış 0 (derleme döngüsüne girmiyor).
- Kısayol çakışması: `opencode → /bin/true`, `oc → /bin/false` iken parametresiz koşum ikisini de
  `.bak-20260922-…` olarak yedekleyip doğru ikiliye çevirdi.
- `./alp-kontrol.sh` parametresiz: 29 satır, sonda `SORUN:`, anahtar `dummy (yer tutucu)` diye
  maskeli. Hiç kurulum yapılmamış boş `HOME` ile de çökmedi (`SORUN: kurulum yapilmamis`).
- `./alp-kur.sh --derle` gibi bir çağrı artık **çıkış 2** + "bayrak almaz" mesajı veriyor.
- `bash -n` temiz; `shellcheck -S warning alp-kur.sh alp-kontrol.sh alp-derle.sh` → **0 bulgu**.
  Ağır turbo typecheck **çalıştırılmadı** (bilerek — bkz. 2026-09-19 donma olayı).

## 2026-09-21 (üçüncü tur) — saha yüzeyi **2 betiğe** indi: `alp-kur.sh` + `alp-kontrol.sh`

**Sorun (Alp):** *"`oc-teshis.sh` nedir? `kontrol.sh` ile iki ayrı script aynı şeyi yapıyor galiba.
Onu da tek bir script yap. Hatta şöyle olsun: `alp-kur.sh`, `alp-kontrol.sh` olsun."* — Sahada
kontrol için **iki ayrı betik** (`oc-teshis.sh` = uç teşhisi, `oc-dogrula.sh` = kurulum doğrulaması)
vardı; hangisinin ne yaptığı her seferinde yeniden anlatılıyordu.

**Ne değişti:**
- **Kullanıcıya görünen yüzey TAM 2 betik:**
  - **`alp-kur.sh`** (eski `kur.sh`) — tek kurulum/derleme girişi. Tüm bayraklar aynen çalışıyor
    (`--derle`/`--kaynak`, `--derleme-yok`, `--baglanti-yok`, `--baglanti-zorla`, `--tum-beceriler`,
    `--ikili-indir`, `-- <iç bayraklar>`).
  - **`alp-kontrol.sh`** (eski `oc-teshis.sh` + `oc-dogrula.sh`) — tek kontrol betiği.
    Varsayılan = kurum AI ucu teşhisi; **`--kurulum`** = kurulum doğrulaması (eski `oc-dogrula.sh`);
    **`--ayrintili`** = kırpmasız uzun rapor.
- **`alp-derle.sh`** (eski `alp.sh`) — iç detay/derleyici; `alp-kur.sh` çağırır, elle çalıştırılmaz.
- **Tek ekran sözleşmesi (Alp'in isteği: "tek bir ekranda tüm sorunu göstersin"):**
  `alp-kontrol.sh` raporu **≈16 satır**, **≤100 sütun** — uzun URL/gövde kırpılır, satır sarması yok.
  Sonda tek satırlık **`SORUN:`** bloğu kök nedeni kanıtıyla söyler: `uc erisilemiyor (TCP ...)` ·
  `MODEL_ID ucta yok — <id>` · `/chat/completions HTTP <kod> — <gövde>` · `stream calismiyor (...)` ·
  `uc tool_call kabul etmiyor (HTTP <kod>)` · `yok — uc saglikli, sorun opencode tarafinda; log: ...`.
  Anahtar **her zaman maskeli**. Çıkış kodu: `0` sorun yok, `1` sorun var.
- **Uç teşhisine eklenenler:** opencode log dizinindeki son `err_`/`ERROR`/`FATAL` satırı raporda
  (sağlıklı uçta "sorun opencode tarafında" derken elde kanıt olsun diye).
- **Kurulum moduna eklenenler:** `env` dosyası (varlık + 3 satır dolu mu + izin 600), kurulu
  `opencode.json` izni, kısayolun doğru hedefi gösterip göstermediği.
- **Düzeltilen yanlış pozitif:** kurulu `opencode.json` karşılaştırması model **sözlük anahtarını**
  (`kurum-model`) `MODEL_ID` ile kıyaslıyordu; kurulum doğruyken bile "model kimligi env ile ayni
  DEGIL" uyarısı basıyordu. Artık `models.<anahtar>.id` alanı karşılaştırılıyor.
- **Eski adlar:** `git mv` ile taşındı (geçmiş korundu). `kur.sh` / `oc-teshis.sh` / `oc-dogrula.sh`
  yerine 2-3 satırlık **yönlendirici** bırakıldı (uyarı basıp yeni betiği çalıştırır) — `al.sh`'ın
  rsync'i sahada eski kopyaları bırakabildiği için; istenirse silinebilirler.
- **Dokümanlar:** `ALP-README.md`, `NASIL-CALISTIRILIR.md` ("Sahada kullanıcıya görünen TAM 2 KOMUT"
  kutusu + "Saha kurulumu" + "Teşhis"), `MIMARI.md`, `docs/`, `knowledge/` → tek akış:
  **`al.sh` → `./alp-kur.sh` → `./alp-kontrol.sh`**.

**Doğrulama (gerçek koşum, izole `HOME`):**
- `alp-kur.sh --derleme-yok` → kurdu, sonda `alp-kontrol.sh --kurulum` çalıştı, "kurulum saglam", çıkış 0.
- `alp-kontrol.sh` sahte uca karşı 5 senaryoda koşuldu — **sağlıklı** (çıkış 0), **MODEL_ID uçta yok**,
  **chat HTTP 500**, **stream bozuk (SSE yok)**, **tool_call reddi** — hepsinde doğru `SORUN:` satırı.
- Erişilemez uç (DNS çözülmeyen host) ve kapalı TCP portu: çökmedi, doğru teşhis, çıkış 1.
- Her koşumda rapor **16-18 satır**, **en uzun satır 100 sütun**, anahtar sızıntısı **0**.
- `bash -n` temiz; `shellcheck -S warning alp-kur.sh alp-derle.sh alp-kontrol.sh kur.sh oc-teshis.sh
  oc-dogrula.sh` → **0 bulgu**.

**Kapanış koşumu (2026-09-22) — commit öncesi son doğrulama:**
- `bash -n` (6 betik + `script/safe-concurrency.sh`) temiz; `shellcheck -S warning *.sh script/*.sh`
  → **0 bulgu**. Ağır `turbo typecheck` bilerek **koşulmadı**.
- İzole `HOME` + izole `KISAYOL_DIZIN` ile **parametresiz `./alp-kur.sh`** uçtan uca: hazır
  `bin/opencode` kullanıldı (derleme yok) → ikili/ayar/10 beceri/plugin/rg/kısayol kuruldu → sonda
  `alp-kontrol.sh --kurulum` "kurulum saglam", **çıkış 0**.
- **Parametresiz `./alp-kontrol.sh`** (erişilemez uca karşı): **15 satırlık tek ekran**, doğru
  `SORUN: uc erisilemiyor (TCP ...)`, çıkış 1. `--ayrintili` kırpmasız rapor veriyor, anahtar
  `sk-****89 (uzunluk: 29)` diye **maskeli**. Üç yönlendirici (`kur.sh`, `oc-teshis.sh`,
  `oc-dogrula.sh`) uyarı basıp doğru hedefi çalıştırıyor.
- **Gözden kaçan eski ad referansları düzeltildi:** `env.example` (2 yer), `.gitignore` (2 yer) ve
  `engine/plugins/logrotate.d/ops-agent-audit` hâlâ `kur.sh` diyordu → `alp-kur.sh`. Kalan `kur.sh` /
  `alp.sh` / `oc-*.sh` geçişlerinin tamamı artık yalnız **tarihçe/"taşındı"** bağlamında.
- Bayraklar (`--derle`, `--derleme-yok`, `--baglanti-zorla`, …) bu koşumda **bilerek korundu** —
  parametresiz sadeleştirme ayrı bir iş.

## 2026-09-21 (ikinci tur) — `kur.sh` tek giriş noktası oldu; kısayol çakışması bitti

**Sorun (Alp):** *"Niye iki tane kurulum dosyası var?"* — `alp.sh` derleyip `/usr/local/bin/opencode`'u
**repo dist ikilisine**, `kur.sh` ise aynı kısayolu **`~/.opencode/bin/opencode`**'a bağlıyordu. İkisi de
aynı adı sahiplendiği için **son çalışan kazanıyor**, hangi ikilinin çalıştığı belirsiz kalıyordu
(sahadaki `NOT: onceki kisayol degistirildi` satırının sebebi).

**Ne değişti:**
- **`kur.sh` = tek giriş noktası.** `bin/opencode` yoksa ve kaynak ağacı varsa (`bun.lock` +
  `packages/opencode` + `alp.sh`) **kendisi derler** (`alp.sh --bin-kopyala`), sonra her zamanki
  kurulumu yapar (ayar + beceri + plugin + ripgrep + kısayol) ve `oc-dogrula.sh` ile doğrular.
  Güncel davranışta hazır ikili arşivi/indirmesi yoktur; ikili yoksa **kaynaktan derleme** yolu kullanılır.
- **Yeni bayraklar:** `--derle` / `--kaynak` (ikili olsa bile yeniden derle), `--derleme-yok`
  (derlemeyi hiç deneme), `-- <bayraklar>` (`--` sonrası her şey `alp.sh`'a aktarılır, ör.
  `./kur.sh --derle -- --ignore-scripts`). Çelişkili kombinasyon (`--derle --derleme-yok`) hata verir.
- **Tek sahip kuralı:** kısayolu (`opencode`, `oc`) yalnız `kur.sh` kurar → `~/.opencode/bin/opencode`.
  `alp.sh` varsayılan olarak **kısayol kurmaz** (gerekirse `./alp.sh --kisayol`, o da artık uyarı basıyor).
- **Sonda net özet:** `derlendi / kuruldu / doğrulandı` satırları + kısayol sahibi + çalıştırılacak komut.
- **Küçük düzeltme:** `--ikili-indir` ile `--baglanti-yok` artık çelişkili sayılmıyor — `--baglanti-yok`
  "kısayol kurma" demek, "ağ yok" demek değil; eskiden bu ikisi birlikte verilince indirme sessizce
  atlanıyordu.
- **Dokümanlar:** `ALP-README.md`, `NASIL-CALISTIRILIR.md` ("Saha kurulumu" artık `al.sh` → **`kur.sh`**),
  bu dosya. `alp.sh` her yerde "iç detay / derleyici" olarak geçiyor.

**Doğrulama (gerçek koşum, izole `HOME` ile — tahmin yok):**
- `bin/opencode` **yokken** `./kur.sh` → alp.sh ile derledi (135 MB), kurdu, `oc-dogrula.sh` "paket sağlam", çıkış 0.
- `bin/opencode` **varken** `./kur.sh --tum-beceriler` → derlemedi, 38 beceri kurdu, çıkış 0.
- `--derle -- --kurulum-yok` → zorla derledi, `bun install` atlandı (aktarım çalışıyor).
- `--derleme-yok` + ikili yok → net hata, çıkış 1. `--ikili-indir` (yerel `file://` asset ile) → indirdi, derlemedi.
- `--baglanti-yok` → kısayol kurulmadı; `./alp.sh --kisayol` → yalnız istendiğinde kısayol kurdu.
- Sistemin gerçek `/usr/local/bin/opencode` kısayolu testler boyunca **değişmedi**.
- `bash -n` temiz; `shellcheck -S warning kur.sh alp.sh oc-dogrula.sh` → **0 bulgu** (kalan bulgular
  info düzeyinde ve önceden de vardı: SC1091 `env` source, SC2012 `ls | wc -l`).

## 2026-09-21 — Offline (saha) derleme çalışır hâle getirildi: `alp.sh` + models.dev snapshot

**Sorun (Alp, <saha-makinesi>):** kaynaktan derleme iki yerde duruyordu — (1) `bun install`, npm **dışı** iki
bağımlılığı çekemiyordu (`pkg.pr.new/@solidjs/start`, `github:anomalyco/ghostty-web`), (2) `bun run build`
`https://models.dev/api.json`'a bağlanmaya çalışıp ECONNRESET ile ölüyordu.

**Ne değişti:**
- **`alp.sh` yeniden yazıldı** — artık **yalnız derler** (içindeki `git pull` kaldırıldı; senkron `al.sh`'ın
  işi, saha makinesinde git kaynağı yok). bun'ı PATH dışında da bulur, `bun install --filter="./packages/opencode"`
  ile **yalnız CLI workspace'ini** kurar (2708 → 1000 paket; web/console paketlerinin npm dışı bağımlılıkları
  hiç çözülmez), `build.ts --single --skip-embed-web-ui --skip-install` ile derler, `/usr/local/bin/opencode`
  (yazılamazsa `~/.local/bin`) symlink'ini kurar. Bayraklar: `--bin-kopyala`, `--kurulum-yok`, gerisi
  `bun install`'a aktarılır. Kurum registry'si/hostname'i **betiğe girmedi** — o, `~/.bunfig.toml`'da kalır.
- **`packages/opencode/script/generate.ts`**: sıra artık `MODELS_DEV_API_JSON` → canlı `fetch`
  (30 sn zaman aşımı + JSON doğrulaması) → **repodaki snapshot**. Online davranış aynı, ağsız makinede
  build artık durmuyor.
- **`packages/opencode/script/models-dev-api.json`** (4.7 MB, 222 sağlayıcı, 2026-09-21) repoya eklendi;
  tazelemek: `curl -sSf https://models.dev/api.json -o packages/opencode/script/models-dev-api.json`.
- **Dokümanlar:** `NASIL-CALISTIRILIR.md` → yeni "🛠️ Saha kurulumu (<saha-makinesi>, offline)" bölümü
  (adım adım `al.sh` → `alp.sh`, `~/.bunfig.toml` örneği, iki sorunun kök nedeni + çözümü, doğrulama
  çıktısı); `ALP-README.md` dosya tablosuna `alp.sh` eklendi.

**Doğrulama (tahmin yok):** boş bun önbelleği + `pkg.pr.new`/`api.github.com`/`github.com`/`models.dev`
karartılmış mount namespace'inde tam koşum — `1000 packages installed [20.65s]`, derleme+smoke test
geçti, 135 MB ikili; `bun.lock` değişmedi, `ghostty-web`/`@solidjs/start` hiç kurulmadı; ikili ağı
tamamen kapalı ortamda (`unshare -n`) model listesini bastı.

## 2026-09-16 — Paket sadeleştirmesi: bin/ git'ten çıkarıldı + beceri parkı (Alp kararları)

**Ne değişti (`faz0-yuzeye-getir` branch, `notlar/FAZ0-KARARLAR-RAPORU.md`):**
- **Hazır opencode ikilisi git izlemesinden çıkarıldı** (`git rm --cached`,
  `.gitignore`'da zaten `bin/` vardı) — dosya **diskte kaldı**, yalnız git geçmişine yeni commit
  girmiyor. `bin/ripgrep.tar.xz` ise saha `rg` kurulumu için izlenen paket olarak kaldı.
- **Beceriler sadeleştirildi:** `knowledge/skills/approved/` 38 → **10 çekirdek** (kur.sh `CORE_SKILLS`
  ile birebir); kalan 28 beceri **silinmeden** `knowledge/skills/parked/`'a taşındı (`git mv`, bkz.
  `parked/README.md`). `kur.sh --tum-beceriler` approved/+parked/ birlikte kurar (toplam hâlâ 38).
- **Gerçek kurum hostname'i genelleştirildi:** `engine/AGENTS.md`'deki gerçek iç bulut hostname'i →
  çalışan ağaçta `dahili-bulut.ornek.local` (geçmişte kalan blob'lar rewrite edilmedi — bilinçli
  karar, repo private tutulmalı; **bu changelog satırının kendisi eskiden gerçek adı tekrar yazıyordu
  — 2026-09-17 denetiminde (Patron) fark edildi, burada da genelleştirildi**).
- `bash` audit maskelemesi: boşlukla ayrılmış CLI bayrakları (`--apiKey sk-...`) artık maskeleniyor
  (`engine/plugins/audit-log.ts` `INLINE_SECRET_RE`).

## 2026-09-15 — Çekirdek becerilere Excel/PDF eklendi (9 → 10)

**Ne değişti:**
- **`kur.sh`**: `CORE_SKILLS` dizisine `rapor-excel-pdf` eklendi (varsayılan kurulum 9 → **10 çekirdek
  beceri**); `--tum-beceriler` yorumundaki eski "6-10" ifadesi gerçek sayıyla ("10") hizalandı.
- **`oc-dogrula.sh`**: kurulu beceri sayısı satırındaki "6-10" metni "10" olarak güncellendi (asıl sayım
  zaten dinamik, `find | wc -l` ile yapılıyor — bu yalnız etiket metniydi).
- **Dokümanlar**: `NASIL-CALISTIRILIR.md`, `README.md`, `docs/PROJE-YAPISI.md` içindeki varsayılan
  beceri sayısı referansları 9 → 10'a güncellendi.
- Gerekçe: Alp envanter/rapor işlerinde Excel (xlsx) ve PDF çıktısı istiyor; beceri kurulu olmayınca
  agent bunu bilmiyor ve devreye giremiyor. `rapor-excel-pdf` paket içinde zaten vardı, yalnız
  `CORE_SKILLS` listesinde eksikti.
- Rapor: `notlar/EXCEL-PDF-RAPOR.md`.

## 2026-09-15 — Aşama 2: "kur ve çalıştır" + kalıcı sertleştirme (A-J paketleri)

**Ne değişti:**
- **`kur.sh`**: `${KURUM_URL}/models`'ten bağlam penceresini otomatik tespit edip `limit.context` +
  `compaction` (prune/reserved/preserve_recent_tokens) yazıyor (env `KURUM_MAX_CONTEXT` yedek yol);
  varsayılan kurulum 38 → **9 çekirdek beceri** (`--tum-beceriler` ile hepsi); `bin/ripgrep.tar.xz`'den
  `~/.cache/opencode/bin/rg` kuruyor (opencode'un grep/glob araçlarının beklediği tam yol — kurum ağında
  ağdan indirilemediği için `ripgrep execution failed` hatasının kaynağıydı); kurulum sonunda çalışma
  dizini rehberliği içeren tek ekranlık özet basıyor.
- **`engine/opencode.json`**: `default_agent: build`; `agent.plan.permission` (`edit`/`bash`: `deny`,
  Plan artık gerçekten yalnızca planlıyor); `permission.bash`'e 37 salt-okunur allow kalıbı eklendi
  (`ls*`, `cat*`, `git status*`, `find*`, ... — resmi opencode dokümanındaki "last matching rule wins"
  kuralına göre `"*": "ask"` başta, spesifik kalıplar sonra). `agent.build.steps` **denendi ve
  kaldırıldı** — livelock hatasını durdurmadığı ölçüldü (bkz. aşağı).
- **`engine/AGENTS.md`**: mutlak "ssh/kubectl YOK" yasağı kaldırıldı, yerine hiyerarşi ("kullanıcı açıkça
  isterse serbest, aksi halde salt-okunur") + gerçek envanter yolları (`~/ansible/hosts-*.ini`,
  `KUBECONFIG`, dahili-bulut kısıtı) + "izinler burada tanımlanmaz, opencode.json'da" netleştirmesi +
  "tüm dosya sistemini tarama, @explore kullan" kuralı eklendi.
- **`oc-dogrula.sh`**: rg kontrolü, kurulu/toplam beceri sayısı ayrımı, `limit.context`/`compaction`/
  `default_agent`/`steps` özeti, tek ekranlık ÖZET bloğu eklendi (7 adım).
- Rapor: `notlar/ASAMA-2-RAPOR.md`.

**Ölçülen sonuçlar (gerçek istek gövdesi + `tiktoken cl100k_base` proxy tokenizer, 16384 pencere varsayımıyla):**
- Taban bağlam: 38 beceri **%89,3** → 9 çekirdek beceri **%63,6** (hedef olan "≤%40" bu pencerede
  **matematiksel olarak ulaşılamaz** — 0 beceriyle bile %53,7; asıl kaldıraç gerçek pencerenin
  16384'ten büyük olması, bu yüzden otomatik tespit kritik).
- `agent.build.steps` (1/5/steps yok, 3 ayrı test): **livelock'u durdurmuyor** — hepsinde 10 saniyede
  86-138 istek. Config'e eklenmedi.
- `opencode 1.18.31` (npm'den indirilip test edildi): **aynı hata var** (135 istek/10sn) — sürüm
  yükseltmesi çözmüyor.
- `OPENCODE_DISABLE_AUTOCOMPACT=1` + taban pencereyi aşıyor: backend isteği sessizce kabul ederse
  (200 OK) **hata vermeden livelock'a düşüyor** (Alp'in "hiç açılmadı" gözlemini açıklıyor); backend
  gerçekten reddederse (HTTP 400) opencode temiz `ContextOverflowError` ile 2 istekte çıkıyor.
- `compaction.prune`: izole ölçülemedi — test senaryosu compaction eşiğine ulaşmadan önce livelock
  hatasına düştü (0 compaction olayı). Zararsız varsayılan olarak bırakıldı, kanıtlanmış çözüm olarak
  sunulmuyor.

## 2026-09-15 — Compaction thrash düzeltmesi (Vaka 1 + Vaka 2)

**Ne değişti:**
- `engine/opencode.json`: `permission.webfetch/task/todowrite = "deny"` — baseline araç şeması
  21.1K → 13.1K karakter (ölçülen, ~%16 bağlam kazancı); `task` alt-agent'ların iç içe thrash riskini
  kapatır, `webfetch` zaten "dış ağa veri gönderme yok" kuralıyla çelişiyordu.
- `engine/AGENTS.md`: "Tek adım disiplini" (araç sonrası dur, plan metni üretme) ve "Çalışma dizini
  boşsa" (sessizce döngüye girme, açıkça söyle) kuralları eklendi.
- `NASIL-CALISTIRILIR.md`: kanıtlı kök neden (baseline ~%87 doluluk + araç-çağrısız yanıtta harness'in
  adım döngüsünü durdurmaması), canlıda denenebilecek teşhis adımları, context ölçüm adımı, dağıtım
  kontrolü (boş çalışma dizini ≠ kural yüklenmedi — global kurulum) eklendi.
- Rapor: `notlar/QWEN-COMPACTION-RAPOR.md`.

**Kök neden özet:** İki katmanlı. (1) 38 beceri listesi + yerleşik sistem promptu + araç şemaları,
boş bir dizinde bile ilk istekte 16k pencerenin ~%87'sini dolduruyor (gerçek istek gövdesi ölçülerek
doğrulandı). (2) Model araç çağırmayan bir yanıt döndürdüğünde opencode 1.18.30'un adım döngüsü
**durmuyor** — yerel bir mock LLM ile modelden bağımsız olarak yeniden üretildi (12 saniyede 178 adım,
üst sınır/bekleme yok). İkinci madde ikiliye gömülü bir harness hatası; repo düzeyinde düzeltilemez,
yalnız alanı büyütüp tetiklenme ihtimalini azaltabildik.

## 2026-09-14 — Faz -1 paketi

**Ne değişti:**
- **Motor/bilgi ayrımı:** kökteki `skills/` kaldırıldı. Yeni düzen:
  - `engine/` → **motor tarafı**: `AGENTS.md`, `opencode.json`, `plugins/` (opencode'un okuduğu çalışma ayarları)
  - `knowledge/` → **kurumsal hafıza**: `skills/approved/` (38 beceri), `runbooks/`, `incidents/`, `lessons-learned/`, `operations-notes/`, `architecture/`, `policy/`, `roadmap/`
  - Kural: **AI kendi kendine öğrenmez, öğrenme önerir** → yeni beceri `knowledge/skills/experimental/` (open **okumaz**) → insan onayı → `approved/` (open **okur**)
- **Yeni politika katmanı `knowledge/policy/`** (Faz -1 çıktısı):
  - `THREAT-MODEL.md` — varlıklar, aktörler, saldırı yüzeyleri, "v1 mutlak sınır: salt-okunur"
  - `PERMISSION-MATRIX.md` — 9 araç için allow/ask/deny önerisi + "kural atlanabilir / hook atlanamaz" tablosu
  - `AUDIT-FORMAT.md` — 17 alanlı JSONL (OTel GenAI adları), `prev_hash` zinciri, repo dışı konum
- **`knowledge/roadmap/PHASE0-ACCEPTANCE.md`** — Faz 0 kabul kriterleri (5 madde) + ölçüm + rapor şablonu
- **`knowledge/architecture/`** — ADR-0001 (`decisions/0001-v1-scope-and-guardrails.md`) + `consultations/` (2 tur çoklu-model danışma kaydı)
- `oc-dogrula.sh`: knowledge iskeleti artık **10 dizin** kontrol ediyor (`policy/` eklendi)

**Kurulum:** `tar xJf opencode-paket.tar.xz -C /root` → `env` doldur → `./kur.sh` → `opencode` (kısa ad `oc`)

**Sırada (Faz 0):** izin bloğunu `engine/opencode.json`'a uygula · audit hook plugin (`engine/plugins/`) · 3 gerçek salt-okunur görevle test → `PHASE0-ACCEPTANCE.md` şablonuyla rapor.
