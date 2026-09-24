# BT İşlerinin Otomasyonu CLI

*opencode tabanlı, kurum içi/offline çalışan bir BT otomasyon ajanı*

---

## 1. Proje adı ve özet

**BT İşlerinin Otomasyonu CLI**, BT çalışanlarının rutin, tekrarlayan işlerini komut satırından
yürütmesine yardımcı olan bir yapay zekâ ajanı kitidir. Açık kaynak **opencode** projesi çekirdek
alınarak; kurum kuralları, güvenlik kilitleri ve kurum içi bilgi birikimiyle genişletilmiştir.
Hedef, insan hatasını azaltmak ve rutin işleri tekrarlanabilir/denetlenebilir hâle getirmektir;
karar verme süreçleri her zaman insanda kalır, araç yalnızca uygular.

## 2. Amaç ve hedefler

Amaç, BT işlerinin yapılması için komut satırından çalışan; ileride MCP (Model Context Protocol)
üzerinden çeşitli araçlarla birlikte çalışabilecek bir CLI üretmektir. Temel yaklaşım Claude Code
benzeri bir "ajan + beceri + kural" modelidir. Alternatif araçlar (Codex, aider vb.) denenmiş,
kurum ihtiyaçlarına en uygun sonucun **opencode** temelinde alınabildiği saptanmıştır.

Hedefler:
- Rutin BT işlerini (envanter çıkarma, durum kontrolü, raporlama, kurulum/bakım desteği) insan
  hatası olmadan, tutarlı biçimde yapmak.
- Aynı işi her seferinde aynı kalitede tekrarlamak; sonucu denetlenebilir kılmak.
- Kapalı/offline ağ ortamlarında da çalışabilmek.

## 3. Hedef kitle

Aracın doğrudan kullanıcısı **BT çalışanlarıdır** — kurum rutin işlerini yürüten bir asistan olarak
tasarlanmıştır. Kapalı/offline ağ ortamlarındaki BT altyapı birimlerinde çalışacak şekilde
kurgulanmıştır. Amaçlar arasında karar verme süreçleri yoktur; bu süreç her zaman insan tarafından
yürütülür, araç yalnızca hazırlık/uygulama/raporlama katmanında yer alır.

## 4. Temel prensipler

1. **Temel yaklaşım Claude Code benzeridir.** Alternatif kodlama/otomasyon ajanları (Codex, aider
   vb.) kurum ortamında denenmiş; en iyi sonuç **opencode** temeliyle alınmıştır. Bu nedenle geliştirme
   buradan devam ettirilmektedir.
2. **Kurum bilgisi ve güvenlik kilitleri vardır.** Araç, canlı sunucularda **değişiklik numarası
   (onay kaydı) olmadan değişiklik yapmaz.** Yıkıcı komutlar (ör. `rm -rf`, `mkfs`, zorla push) ve
   yazma/silme gerektiren işlemler varsayılan olarak reddedilir ya da insan onayına bağlanır;
   salt-okunur teşhis/envanter komutları serbest bırakılır.
3. **Aktarılabilirdir.** Üretilen bilgi ve yapılandırma, gelecekte kullanılacak her ortama
   taşınabilecek şekilde **iyi dokümante edilmiştir** — motor (güncellenebilir yazılım) ile bilgi
   (kalıcı kurumsal birikim) katmanları ayrıdır.
4. **Kapalı sistem güvenlik çerçevesi ve AI kısıtları göz önüne alınmıştır.** Kurum içi modellerin
   daha sınırlı bir bağlam penceresine (ör. 16 bin birim mertebesinde) sahip olabileceği baştan
   tasarıma katılmış; araç şeması ve kural seti bu sınırlara göre sadeleştirilmiştir.
5. **Tamamen offline / kapalı bir sistemdir.** Çalışma anında dış internet veya paket kaynağı
   gerektirmez; kurum içi model ucuna bağlanır.

## 5. Nasıl çalışır (mimari)

Sistem dört katmandan oluşur:

- **Ajan çekirdeği** — komutları yorumlayan, araç çağıran ve adım adım ilerleyen model tabanlı
  motor (opencode). Bu katman güncellenebilir; kurumsal değer bu katmanda birikmez.
- **Beceri (bilgi) katmanı** — tekrar kullanılabilir usül bilgisi (ör. envanter üretimi, durum
  kontrolü, rapor biçimlendirme). Bu katman **kalıcıdır** ve git tabanlı bir depoda tutulur; motor
  değişse bile bilgi korunur.
- **Politika / izin katmanı** — hangi komutların serbest, hangilerinin onay gerektirdiğini, hangilerinin
  tamamen yasak olduğunu tanımlayan kural seti. Yıkıcı/geri alınamaz işlemler bu katmanda engellenir.
- **Kurulum & öz-teşhis akışı** — tek bir kurulum betiği ile araç sahaya taşınır, kurulur ve
  kendi sağlığını (bağlantı, sürüm, izinler) raporlayabilir; sorun tanısı için insan müdahalesi
  gerektiren adımları açıkça işaretler.

Ayrıca her araç çağrısı **denetim kaydına (audit log)** düşer: hangi komutun ne zaman çalıştığı
izlenebilir durumda tutulur. Yeni bir beceri veya kural önerisi önce taslak aşamasında kalır ve
**insan onayı** ile canlıya alınır — sistem kendi kendine öğrenip canlıya geçmez, yalnızca öğrenmeyi
önerir.

## 6. Yetkinlikler ve örnek kullanım

Araç, aşağıdaki gibi jenerik BT işlerinde kullanılabilir:

- **Envanter ve raporlama** — sunucu/servis listelerinden özet rapor üretme.
- **Salt-okunur teşhis** — sistem durumu, disk/servis/ağ kontrolü gibi bilgi toplama işleri.
- **Tekrarlayan iş akışları (playbook tipi)** — standart bakım/kontrol adımlarının tutarlı biçimde
  uygulanması.
- **Kurulum ve bakım desteği** — yeni bir ortama kurulum, doğrulama ve sorun teşhisi.

Tüm bu kullanımlarda karar (ör. "bu değişikliği uygula" onayı) insan tarafından verilir; araç
hazırlık, uygulama ve raporlama adımlarını üstlenir.

## 7. Mevcut durum ve yol haritası

Çalışma, aşama aşama ilerleyen bir plan izlemektedir:

- **Temel katman:** Politika/izin çerçevesi ve denetim kaydı tanımlandı; salt-okunur işlemler
  serbest bırakıldı, riskli komutlar kilitlendi.
- **Sahaya uyarlama:** Kurum kuralları, sadeleştirilmiş beceri seti ve kurulum/öz-teşhis akışı
  kapalı ağ ortamına göre ayarlandı.
- **Sonraki adım:** Sahada tekrar eden görevlerin ölçülmesi (doğruluk, süre, gereksiz adım) ve
  beceri setinin bu ölçümlere göre inceltilmesi.
- **İleri adım (opsiyonel):** Onaylı görevler için kontrollü bir uygulama/değişiklik zincirinin
  (plan → onay → uygulama) ve MCP tabanlı ek araç entegrasyonunun açılması — yine insan onayı
  kapısı korunarak.

## 8. Kazanım

- **İnsan hatasının azalması** — rutin işler standart bir akıştan geçtiği için elle yapılan
  işlemlerdeki tutarsızlık azalır.
- **Tekrarlanabilirlik** — aynı iş, aynı yöntemle, farklı kişiler tarafından da aynı kalitede
  yürütülebilir.
- **Denetlenebilirlik** — her adım kayıt altına alınır, sonradan incelenebilir.
- **Offline çalışabilme** — kapalı ağ/güvenlik gereksinimi olan ortamlarda da kullanılabilir.
- **Onay kapıları** — riskli/geri alınamaz işlemler insan onayına bağlı kaldığı için kontrol
  kurum tarafında kalır.
