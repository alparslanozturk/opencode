# Tek seferlik: kurumsal-bilgi.ini düzeltmesi (Doktor, 2026-11-23 — Alp'in 2026-11-23 cevaplarıyla)

Dosya: `/root/ai/work/opencode/kurumsal-bilgi.ini`. Yalnız aşağıdaki maddeleri uygula. Her maddeden sonra "N. madde: yapıldı / bulunamadı"
yaz — bulamadığın satırı uydurma, "bulunamadı" de. Parola **değerini** hiçbir çıktıda gösterme.

1. Yedek al: `cp -p /root/ai/work/opencode/kurumsal-bilgi.ini /root/ai/work/opencode/kurumsal-bilgi.ini.$(date +%Y%m%d-%H%M)`

2. **DNS kuralı (bölüm 1, "Kural:" bloğu).** "Alt ortam (spl, stl, sxl, sdl) üst ortam DNS'lerini kullanır" satırını sil (spl production'dır,
   alt ortam değildir; alt ortam üst ortam DNS'ini kullanmaz). Bloğun başına şu satırı ekle:
   `- Üst ortam = production (spl) → DNS 10.13.x; alt ortamlar = test/prep/development (stl, sxl, sdl) → DNS 10.14.x. İki ortam arasında kesin izolasyon vardır; alt ortam üst ortam DNS'ine erişmez. Satellite iki tarafa da SSH ile erişir. [Alp 2026-11-23]`
   "AD/NS için:" ile başlayan satırın ("… çok yaygın, ikisi yeterlidir") sonuna ` (yalnız üst ortam; alt ortamda 10.14.x DNS'leri) [Alp 2026-11-23]` ekle.

3. **Adlandırma (bölüm 4).** "Tüm Olası Kombinasyonlar" tablosunu ve hemen altındaki "Örnekler" bloğunu sil, yerine şunu koy:
   ```
   Kural (Alp 2026-11-23): adın YALNIZ ilk 3 harfi anlam taşır; sonrası serbesttir.
     1. harf lokasyon : s = İstanbul ("sunucu" diye de okunur — ikisi aynı şeyi gösterir), d = DRC (Ankara)
     2. harf ortam    : p = production, x = prep, t = test, d = development, b = bugfix
     3. harf yer      : l = local (iç ağ, ana AD alanı), d = dmz (DMZ alanı)
     Aynı harf yerine göre farklı anlam taşır: 1. harf d = DRC, 2. harf d = development, 3. harf d = dmz.
   Bütün kodlar (20):
     spl prod·local   spd prod·dmz    | dpl DRC prod·local   dpd DRC prod·dmz
     sxl prep·local   sxd prep·dmz    | dxl DRC prep·local   dxd DRC prep·dmz
     stl test·local   std test·dmz    | dtl DRC test·local   dtd DRC test·dmz
     sdl dev·local    sdd dev·dmz     | ddl DRC dev·local    ddd DRC dev·dmz
     sbl bugfix·local sbd bugfix·dmz  | dbl DRC bugfix·local dbd DRC bugfix·dmz
   Bu kurala uymayan önekler (srv, drc, scl, vcf …) eski adlardır; anlamı bilinmiyorsa "bilinmiyor" kalır, tahmin yazılmaz.
   ```
   "Eski İsimlendirme" bloğundaki `dtl = Thirdparty …` satırını sil — dtl eski ad değildir, **DRC test local**'dir (Alp 2026-11-23: "Third
   party diye bir şey yok"). "Prefix" sütunlu envanter tablosuna dokunma.

4. **İş envanteri biçimi (bölüm 4 sonu, "Is Envanteri Dosya Formatı" bloğu).** Bloğun tamamını şu satırlarla değiştir (eski biçim artık
   kullanılmıyor; envanteri betik yazar):
   ```
   İş envanteri: elle yazılmaz — ansible becerisindeki is-envanter.py üretir.
     - Değişiklik numarası (CN) varsa: dn/<numara>/hosts.ini (işin playbook'ları ve logları da o dizinde)
     - CN yoksa (kurulum / kriz / bulgu / is): ansible/inventories/hosts-<YYYYMMDD>-<etiket>.ini
     - Kullanıcı "ad  IP" satırları verdiyse host satırına ansible_host=IP yazılır; yalnız ad verildiyse IP ana envanterden/DNS'ten gelir.
   ```

5. **Redis parolaları (bölüm "Redis Sentinel").** `PASSWORD` geçen her satırda `=` işaretinden sonraki değeri sil, yerine şunu yaz:
   `<sunucudaki /usr/local/assistbox/<hostname>/*.env dosyasında — buraya yazılmaz> [Alp 2026-11-23]`. Dosyanın başka yerinde Redis,
   veritabanı ya da servis parolası varsa aynı biçimde değeri kaldır. **PAT satırına dokunma** (Alp: kalabilir).

6. **5 Kasım talimatı (uygulanmamış).** "Bilinen sorunlar" bölümündeki "RKE2/Rancher kümeleri — bilinen node davranışları" bloğunu (tek bir
   node adıyla yazılmış, "K3s embedded containerd" geçen satırlar) şu iki satırla değiştir:
   `- RKE2 node'larında containerd, rke2-server/rke2-agent süreci altında çalışır; ayrı containerd.service kullanılmaz — systemctl'de inactive görünmesi normaldir, bulgu değildir. [Alp 2026-11-05]`
   `- Takılı Terminating pod'da force delete yalnız API kaydını siler; node'da sandbox kalabilir (2026-11-05 olayı: node reboot gerekti) — önce k8s-sorun becerisi "Takılı Terminating" bölümü. [Alp 2026-11-05]`

7. **Bölüm numaraları.** Başlık numaraları tekrar ediyor (iki "6.", iki "9."). Bölüm başlıklarını dosyadaki sırayla 1'den yeniden numarala;
   başlık metnine ve içeriğe dokunma.

8. **Fark** — değerleri maskeleyerek göster (çıktıyı aynen ver, yorum ekleme):
   `diff <1. adımdaki yedek> /root/ai/work/opencode/kurumsal-bilgi.ini | sed -E 's/(PASSWORD[^=]*=[[:space:]]*)[^<[:space:]]+/\1****/I'`
   Doğrula ve sonucu yaz: `grep -ciE 'thirdparty|üst ortam DNS.lerini kullanır|K3s embedded' /root/ai/work/opencode/kurumsal-bilgi.ini`
   → 0 olmalı.

9. **Mantıksal inceleme — DEĞİŞTİRME, yalnız listele.** Düzeltilmiş dosyayı baştan sona oku ve numaralı liste ver (satır numarasıyla):
   (a) birbiriyle çelişen satırlar, (b) aynı bilginin tekrarı, (c) `[doğrula]` işaretli satırlar, (d) genel kural olmayan, tek olaya ait
   ayrıntı (iş geçmişine taşınabilecek), (e) kaynağı yazmayan sayı/ad. Her madde için "öneri: sil / iş geçmişine taşı / Alp'e sor".
   Alp seçince ayrı turda uygulanır.

10. **group_vars raporu — DEĞİŞTİRME.** Kurum ansible dizinindeki `ansible/group_vars/all.yml` dosyasının değişkenlerinden her birinin hangi
    playbook'ta kullanıldığını listele: `grep -rnw -e base_dns_servers -e base_search_domain -e ntp_servers -e sep_package_name -e sep_service_name -e xdr_package_name -e xdr_service_name -e satellite_server -e critical_services -e cis_package_name -e hostname_required_suffix ansible/ --include='*.y*ml' | grep -v group_vars`
    Çıktıyı aynen ver. (Doktor'un notu: dosyadaki değerler ölçülenle uyuşmuyor — SEP birimi `sisamdagent` değil `sep-service` yazıyor,
    `critical_services` içinde kapalı olan firewalld var, Satellite adı `srvsatellite` değil. Kullanılmıyorsa Alp silmeyi seçebilir.)
