# Danışma 1 — mimari ve fork sorusu (2026-09-14)

Aynı brief'e üç modelin yanıtı: Doktor/Sonnet 5, Codex gpt-5.5, Gemini 3.6-flash. Ham metinler, değiştirilmedi.

---
## Claude (Doktor / Sonnet 5)

# Değerlendirme

## 1. Fork kararı
İlk aşamada fork yok, doğru — bakım yükünü büyütmeden başlamak mantıklı. Fork kaçınılmaz hale gelir:
- Upstream'in plugin/tool API'si sizin izin modelinizi (kapsam kapısı, yıkıcı komut engeli) desteklemiyorsa
- Model-agnostik prompt/tool-calling davranışını değiştirmeniz gerekiyorsa (örn. Qwen'e özgü tool-call formatı sorunları)
- Upstream breaking change getirip sizi geriye taşıyorsa

Fork eşiği net değil listede — "3 ay içinde upstream'e patch gönderip merge edilmezse fork'a geç" gibi somut bir tetikleyici eklemenizi öneririm, yoksa fork kararı hep ertelenir.

## 2. Katman ayrımı (engine/knowledge)
İlke sağlam ama şurada sızıyor:
- **`AGENTS.md`** engine altında ama içeriği (dil, kapsam, güvenlik kuralları) aslında **knowledge/policy** — model/engine değişse bile kalıcı olması gereken bir şey. Konumu yanlış.
- **`opencode.json` izin/policy ayarları** da aynı sorun — bunlar kurumsal risk kararları, engine implementasyon detayı değil.
- **`plugins/`** kod içerir ama "bu araç nasıl kullanılır" bilgisi çoğu zaman runbook'larla örtüşecek — plugin değişince runbook'un da değişmesi gerekebilir, senkron tutmak zor olacak.

Öneri: Engine = *sadece* çalıştırılabilir kod + sağlayıcı bağlantısı. Kural/politika/prosedür metinleri (AGENTS.md dahil) knowledge'a taşınmalı, engine onu okusun.

## 3. Bilgi sınıfları
6 klasör fazla ince taneli — özellikle `operations-notes` ile `lessons-learned` arasındaki fark ilk 2 ayda bulanıklaşacak (biri "günlük not", diğeri "görev sonu öneri" ama ikisi de serbest metin olma eğiliminde). Sadeleştirme önerisi:
- `skills` (approved/experimental) — kalsın, çekirdek mekanizma
- `runbooks` — kalsın, ayrı ihtiyaç
- `incidents` — kalsın ama **elle başlatılmalı, ajan sadece taslak doldursun**; insan onaylamadan incident kapanmamalı. Zorunlu alanlar: zaman damgası, etki/severity, tespit yöntemi, alınan aksiyon, kök neden, çözüm, ilişkili runbook/skill, takip aksiyonu.
- `lessons-learned` + `operations-notes` → tek klasörde birleştirilebilir, `type: note|suggestion` alanıyla ayrılabilir. İki ayrı klasör olarak kalmasının somut bir kazancı yok, sadece arama yükü artırıyor.

## 4. Onay kapısı
Tek onaycı/insan darboğazı en zayıf halka. Nerede tıkanır:
- Onaylayan kişi (muhtemelen tek kişi — siz/Alp) tatile çıkarsa `experimental/` yığılır, ajan "öğrenmiyor" gibi görünür
- SLA yok — öneri ne kadar sürede işlenmeli belirsiz
- Test mekanizması yok — approved'a geçmeden önce skill'in staging'de/kuru-çalıştırmada doğrulandığına dair adım yok, sadece "insan okudu, onayladı" var. Bu, insanın **kalite kapısı değil sadece gecikme kapısı** olması riski taşır.
- Geri alma yok — approved bir skill yanlış çıkarsa nasıl "approved"tan çıkarılıp incident'e dönüştürülecek, süreç tanımsız.

## 5. En büyük risk (ilk 3 ay)
Faz 2 (araç katmanı) boşken Faz 0'ın "3 gerçek görevle ölç" iddiası içi boş kalabilir — ajan SSH/Ansible/K8s olmadan gerçek operasyon yapamaz, sadece rapor/log analizi gibi salt-okunur işler yapabilir. En olası patlama: **experimental/ klasörü büyür, kimse zamanında bakmaz, "öneri → onay → davranış" döngüsü fiilen çalışmaz**, proje "AI kendi kendine öğrenmiyor, insan da onaylamıyor" durumuna düşer — yani ne otomasyon ne öğrenme, sadece arşivleme.

## 6. Eksik olanlar
- **Gözlemlenebilirlik:** Her ajan aksiyonunun (hangi komut, hangi skill, hangi sonuç) audit log'u — knowledge repo commit geçmişi yetmez, çalışma zamanı log'u lazım.
- **Gizli bilgi:** SSH anahtarı/DB parolası gibi sırların knowledge repo'ya (git!) veya model context'ine düz metin girmemesi için ayrı bir secrets katmanı — şu an hiç bahsedilmiyor, en riskli boşluk bu.
- **Yetki sınırları (RBAC):** Kim onaylayabilir, kim ajanı hangi sistemler için tetikleyebilir — "insan onayı" tekil bir rol gibi yazılmış, kurumsallaşınca yetersiz kalır.
- **Maliyet:** Token/model kullanım takibi yok.
- **Yedek/geri dönüş:** Knowledge tarafı git ile zaten versiyonlu ama **ortam** tarafında (ajan gerçek bir komut çalıştırdıysa) rollback planı yok — kapsam kapısı "yıkıcı komut engeli" diyor ama "yanlışlıkla yapılan geri alınabilir mi" sorusuna cevap yok.

## 7. Öncelik sırası
Faz 0 → 1 → 2 yönü doğru ama Faz 0'daki "3 gerçek görev" **salt-okunur** olmalı diye netleştirin (log analizi, envanter raporu, mevcut erişimle özet çıkarma) — yazma/SSH yetkisi açılmadan mekanizmayı (öneri→onay→approved) doğrulayın. Aksi halde Faz 2 gelmeden Faz 0 ölçümü zaten anlamsızlaşıyor, sırayı değiştirmenize gerek yok ama Faz 0'ın kapsamını netleştirin.

## 8. Ölçüm — ilk sürüm için 3 metrik
1. **Müdahalesiz tamamlanma oranı** — ajanın insan düzeltmesi olmadan doğru sonuç ürettiği görev yüzdesi
2. **Öneri onay oranı ve süresi** — experimental→approved dönüşüm hızı ve kabul oranı (öğrenme döngüsünün gerçekten çalıştığının kanıtı)
3. **Güvenlik olayı sayısı** — ajanın tetiklediği/neden olduğu incident sayısı (0 olması hedef, kapsam kapısının etkinliğinin ölçüsü)

---

**Tek cümlede en kritik başarı faktörü:** Onay kapısının gerçek bir kalite/gecikme darboğazı değil, hızlı ve tutarlı çalışan bir insan sürecine dönüşmesi — bu olmazsa "AI öğrenmiyor, öneriyor" mimarisinin tamamı kağıt üzerinde kalır.

---
## Codex (gpt-5.5)

Kısa cevap: tasarım yönü doğru; en zayıf nokta `knowledge` değil, **yetki ve eylem sınırı**.

1. **Fork kararı**
- Katılıyorum: ilk aşamada fork yok, upstream takip et.
- Fork kaçınılmaz olur:
  - izin/policy motoru yetersizse,
  - offline/audit gereksinimleri core değişiklik istiyorsa,
  - tool çağrılarını deterministik kaydetmek gerekiyorsa,
  - güvenlik sınırları eklentiyle garanti edilemiyorsa,
  - upstream değişiklikleri operasyonel istikrarı bozuyorsa.

2. **Katman ayrımı**
- `engine` / `knowledge` ayrımı sağlam ve doğru.
- Sızma noktaları:
  - `AGENTS.md` davranışı bilgi gibi etkiler,
  - tool izinleri fiilen policy bilgisidir,
  - generated/experimental içerik yanlışlıkla prompt’a girerse kapı delinir,
  - runbook içindeki komutlar davranışı yönlendirir,
  - model değişince aynı skill farklı yorumlanabilir.
- Bu yüzden sadece dizin ayrımı değil, **yükleme whitelist’i + içerik şeması + test** gerekir.

3. **Bilgi sınıfları**
- Genel ayrım iyi; ama `lessons-learned` ve `operations-notes` zamanla çöplüğe dönebilir.
- Önerim:
  - `skills`: kısa, atomik davranış kuralları
  - `runbooks`: prosedür
  - `incidents`: olay kaydı
  - `lessons-learned`: onaya aday iyileştirme
  - `operations-notes`: geçici not, düzenli arşiv/temizlik şart
- `incidents` hibrit beslenmeli:
  - ajan taslak oluşturur,
  - insan severity, root cause, closure onaylar.
- Alanlar: `id`, `time`, `service`, `owner`, `severity`, `impact`, `detection`, `timeline`, `commands/actions`, `evidence`, `root_cause`, `mitigation`, `followups`, `status`, `approver`.

4. **Onay kapısı**
- Bilgi değişimi için yeterli başlangıç.
- Operasyon eylemleri için yetmez.
- Ayrıca gerekir:
  - risk seviyesine göre onay,
  - yıkıcı komutlarda çift onay,
  - dry-run zorunluluğu,
  - tüm komut/output audit log,
  - skill promotion için diff inceleme.
- Kötüye gidiş: onay kuyruğu şişer, insanlar rubber-stamp yapar, ajan çok fazla küçük öneri üretir.

5. **En büyük risk**
- En olası başarısızlık: ajan “yardımcı” görünür ama güvenilmez kalır; insanlar çıktıyı tekrar elle doğruladığı için benimsenmez.
- İlk 3 ayda patlayacak şeyler:
  - skill sprawl,
  - tutarsız runbook formatları,
  - fazla izinli tool çağrıları,
  - incident kayıtlarının eksik/sonradan yazılması,
  - log analizinde özgüvenli ama yanlış yorumlar.

6. **Eksik**
- Mutlaka eklenmeli:
  - audit trail: kim, ne sordu, ajan ne yaptı, hangi komut çalıştı
  - RBAC ve servis hesabı ayrımı
  - secrets yönetimi
  - allowlist/denylist komut politikası
  - dry-run ve rollback standardı
  - backup/restore
  - bilgi kalite skoru ve periyodik temizlik
  - model/engine versiyon pinleme
  - eval seti: eski olaylar ve beklenen cevaplar
  - veri sınıflandırma: gizli, kişisel, kritik sistem bilgisi

7. **Öncelik**
- Sıra genel olarak doğru.
- Ben küçük bir Faz -1 eklerdim:
  - threat model,
  - izin matrisi,
  - audit formatı,
  - 3 gerçek görevün başarı kriteri.
- Sonra:
  - Faz 0: sadece oku/öner, gerçek görevlerle ölç
  - Faz 1: skill/runbook formatlarını sabitle
  - Faz 2: tool katmanı, önce read-only, sonra sınırlı write

8. **Ölçüm**
- İlk sürüm için 3 metrik:
  - **Doğruluk:** ajan önerilerinin insan tarafından düzeltme oranı
  - **Zaman kazancı:** görev başına manuel süreye göre azalma
  - **Güvenlik/uyum:** izinsiz, eksik loglu veya policy dışı aksiyon sayısı
- Ek olarak: incident sonrası follow-up kapanma oranı çok değerli olur.

**Tek cümle:** Bu projede en kritik başarı faktörü, ajanın ne bildiğinden çok **neyi hangi yetkiyle yapabileceğinin net, ölçülebilir ve denetlenebilir olmasıdır.**

---
## Gemini (3.6-flash)

Tasarım genel olarak **mantıklı, gerçekçi ve "güvenlik öncelikli"** bir yaklaşıma sahip. Ancak operasyonel gerçeklerle çakışan ve ilk 3 ayda patlama potansiyeli olan kritik noktalar var.

Sorularına madde madde, açık eleştirilerimle yanıt veriyorum:

---

### 1. Fork Kararı
*   **Doğru yaklaşım:** İlk aşamada fork yapmamak kesinlikle doğru. Upstream’den güncellemek bakım maliyetini düşürür.
*   **Ne zaman fork kaçınılmaz olur?**
    1.  Kurum içi (offline) ağda `opencode` bağımlılıkları veya paket güncellemeleri kırıldığında.
    2.  `opencode`’un yetki/policy/sandbox yapısı, kurum içi güvenlik standartlarına (ör. RBAC, komut engelleme) yetersiz kaldığında ve upstream bu kurumsal PR'ları kabul etmediğinde.

---

### 2. Katman Ayrımı (`engine` / `knowledge`)
*   **Sağlam mı?** Mantık doğru ama mimari **pratikte sızdırır**.
*   **Nerede sızar?** "Model değişse bilgi kalır" iddiası teoriktir. Qwen modeli için yazılmış bir beceri/prompt (knowledge), ileride Llama veya DeepSeek’e geçildiğinde aynı performansı vermez. Model-spesifik prompt teknikleri bilgi katmanına sızacaktır.

---

### 3. Bilgi Sınıfları ve Incidents
*   **Aşırı karmaşık (Katılmıyorum):** Faz 0 için bu dosya hiyerarşisi çok bürokratik. `operations-notes`, `lessons-learned` ve `experimental` alanları ilk etapta birbirini tekrar eder.
*   **Sadeleştirme önerisi:** İlk 3 ay için sadece `approved/`, `proposals/` (experimental + lessons) ve `runbooks/` yeterlidir.
*   **Incidents beslemesi:**
    *   *Nasıl olmalı?* **Ajan otomasyonu ile taslak üretilmeli, insan doldurmalı.**
    *   *Ajanın yazacağı alanlar:* Zaman, Etkilenen Sistem, Ham Loglar, İlgili Komut Geçmişi.
    *   *İnsanın yazacağı/onaylayacağı alanlar:* Kök Neden (Root Cause) ve Nihai Çözüm.

---

### 4. Onay Kapısı (Human-in-the-Loop)
*   **Yeterli mi?** Güvenlik için evet, sürdürülebilirlik için **HAYIR**.
*   **Nerede tıkanır?** **"PR Yorgunluğu" (PR Fatigue).** Operatörler ajanın ürettiği onlarca öneriyi incelemekten bıkacak.
*   **Nasıl kötüye gider?** İki yoldan biriyle patlar:
    1.  Mühendisler incelemeden "Approve" basacak (Güvenlik ihlali).
    2.  Mühendisler onay kutusunu biriktirecek, ajan yeni şey öğrenemeyip "donmuş" kalacak (Sistem ölümü).

---

### 5. En Büyük Risk (İlk 3 Ay)
*   **Bağlam Penceresi (Context Window) ve Unutma:**
    Ajan karmaşık bir operasyon yaparken context uzadıkça `AGENTS.md` içindeki güvenlik kurallarını unutup, **yıkıcı bir komut önermesi veya onay almadan bir parametreyi yanlış değiştirmesidir.**
    *(İkinci risk: Offline ortamda repo senkronizasyonunun ve Git conflict'lerinin manuel operasyonu kitlemesi).*

---

### 6. Eksikler (Mutlaka Olması Gerekenler)

1.  **Secrets Management (Gizli Bilgi Yönetimi):** Repoda kesinlikle şifre/SSH key tutulamaz. Ajan Vault/KeePass gibi bir sistemden anlık yetki almalı.
2.  **Audit Trail (İnkar Edilemezlik):** "Ajan arka planda hangi komutu koştu?" sorusunun Git dışında, değiştirilemez bir sys-log/audit log karşılığı olmalı.
3.  **Pre-Check / Post-Check (Durum Doğrulama):** Bir güncellemeyi yapmak yetmez. Ajan "güncelleme öncesi sistem durumu" ve "güncelleme sonrası servis sağlık kontrolü (healthcheck)" yapacak araçlara sahip olmalı.
4.  **Rollback (Geri Dönüş) Stratejisi:** Runbook'ların tamamında "İş başarısız olursa otomatik geri dönüş komutu nedir?" tanımı zorunlu olmalı.

---

### 7. Önceliklendirme (Sıralama Eleştirisi)
*   **Sıralamaya katılmıyorum.** "Araçsız" bir operasyon ajanı test edilemez; sadece sohbet eder.
*   **Yeni Öncelik Önerisi:**
    *   **Faz 0:** Kurulum + **Read-Only Araç Katmanı** (Salt okunur SSH, Log okuma, `kubectl get/describe`). *Ajan dokunabilmeli ama bozalamamalı.*
    *   **Faz 1:** Kural/Beceri ince ayarı + Öneri döngüsünün OTURTULMASI.
    *   **Faz 2:** Write/Execute Araç Katmanı (Ansible playbook tetikleme, yıkıcı olmayan güncellemeler).

---

### 8. Ölçüm (İlk Sürüm İçin 3 Metrik)

1.  **Görev Başarı Oranı (Task Success Rate):** Ajanın insan müdahalesi olmadan doğru tamamladığı "Read-Only" veya rutin görevlerin yüzdesi.
2.  **Öneri Onay Oranı (Skill Acceptance Rate):** Ajanın `experimental` altında önerdiği becerilerin yüzde kaçı insan tarafından kabul edilip `approved`a geçti? (Kalite göstergesi).
3.  **Ortalama Çözüm/Toplama Süresi (MTTR / Task Duration):** Manuel yapılan envanter/log toplama işinin ajanla kaç dakikaya düştüğü.

---

### Tek Cümlede Kritik Başarı Faktörü
> **Bu projedeki en kritik başarı faktörü; ajanı salt-okunur yetkilerle ilk günden canlı operasyonun içine sokup, insan üzerindeki "onay yükünü" (PR yorgunluğu) minimize edecek sade bir onay akışı kurabilmektir.**
