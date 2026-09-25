# 🖥️ Sunucu İsimlendirme / Varlık Tanımlama — ÖNERİ TASLAĞI

**Tür:** 🟡 **ÖNERİ (iskelet + taslak)** — bitmiş doküman **değil**
**Kaynak:** Alp'in 2026-09-25'te gönderdiği 18 görsel (15'i kurum içi **Varlık Yönetimi** ekranı, 3'ü saha/opencode) + Alp'in sözlü notları
**Sürüm:** v0.2 (öneri) · önceki: v1 = Şef taslağı, commit `ffb3404639`

---

## 0. Bu dosya nasıl kullanılır? (iş bölümü)

| Kim | Ne yapar |
|---|---|
| **Şef (bulut)** | **İskelet + öneri**: ekran yapısı, alan listesi, kural **önerileri** — boşluklar açık bırakılır |
| **Saha AI (opencode + envanter)** | Boşlukları **gerçek envanterden** doldurur: değer havuzları, **gerçek örnek adlar**, kuralın doğrulanması |
| **Alp** | Onaylar / düzeltir, kullanır |

**Kural:** Şef **uydurma örnek yazmaz** — örnekler ve gerçek değerler **sahadan** gelir.
**Gizlilik:** gerçek sunucu adı · iç FQDN · kişi adı **yazılmaz**; yerine `<...>` yer tutucu kullanılır.

> 🧭 Saha AI için tek cümle: *"Bu dosya bir öneri iskeletidir. Envanterdeki gerçek verilerle
> `[SAHA]` işaretli yerleri doldur, `🟡 öneri` maddelerini doğrula ya da düzelt, sonucu geri gönder."*

---

## 1. Ekran Yapısı ✅ (gözlem)

Sayfa: **Varlık Yönetimi** → iki ana blok:

| Blok | İçerik |
|---|---|
| **Paydaş Bilgileri** | Varlığın sahibi/sorumlusu kişi ve birimleri |
| **Tanım Bilgileri** | Varlığın teknik ve sınıflandırma tanımı |

Sol menüde görülen diğer modüller: `Eğitim ve Kalite` · `Hizmetler ve Satın Alma` · `… Sistemler` · `… Finansal İşlemler`

---

## 2. Alan Sözlüğü (iskelet)

### 2.1 Paydaş Bilgileri

| Alan | Tip | Açıklama |
|---|---|---|
| **İlişkili Şirket** | dropdown | Varlığın bağlı olduğu şirket |
| **Varlık Sorumlusu** | kişi (dropdown) | Varlıktan sorumlu kişi |
| **Varlık Sahibi Birimi** | dropdown | Varlığı sahiplenen birim |
| **Varlık Sahibi** | kişi (dropdown) | Sahiplenen kişi |
| **Varlık Muhafızı Birimi** | dropdown | Varlığı "koruyan" birim |
| **Varlık Muhafızı** | kişi (dropdown) | Muhafız kişi |
| **Değer havuzları** | — | `[SAHA]` girilecek (gerçek birim/şirket listesi) |

### 2.2 Tanım Bilgileri

| Alan | Tip | Görülen değer / açıklama | Durum |
|---|---|---|---|
| **Lokasyon** | dropdown | `KTBU Data Center` · `KT Cloud` · `KT Cloud DRC POC` · `DRC` · `Cloud` | ✅ gözlem |
| **Lokal/DMZ** | dropdown | `Local` / `DMZ` | ✅ gözlem |
| **DMZ Numarası** | dropdown | `Lokal/DMZ = DMZ` seçilince devreye girer | ✅ gözlem |
| **Konum** | dropdown | `Application` görüldü | 🟡 öneri: varlık katmanı/türü olabilir → doğrula |
| **Ortam** | dropdown | `Bugfix` · `Development` · `Prep` · `Test` · `Production` (+`POC`) | ✅ gözlem |
| **Faz** | dropdown | — | `[SAHA]` seçenekler |
| **Adı** | metin | Sunucu/varlık kısa adı → `<kisa-ad>` | ✅ gözlem |
| **DNS** | metin | FQDN → `<ad>.<kurum-alani>.local` | ✅ gözlem |
| **Yapısı** | dropdown | `Fiziksel` / `Sanal` | ✅ gözlem |
| **Uygulama Adı** | dropdown | İlgili uygulama | `[SAHA]` havuz |
| **Başlangıç Tarihi** | tarih | Form varsayılanı `25.09.2026` | ✅ gözlem |
| **Bitiş Tarihi** | tarih | Boş bırakılabilir | ✅ gözlem |
| **İzleme** | seçim | `POC` | ✅ gözlem |
| **Açıklama / Tanımı** | serbest metin | Varlık açıklaması | ✅ gözlem |
| **Güvenlik Seviyesi** | seçim (CIA) | `Gizlilik` · `Bütünlük` · `Erişilebilirlik` | ✅ gözlem |
| **Bilgi Varlığı Seviyesi** | dropdown | — | `[SAHA]` seçenekler |
| **Network** | dropdown | — | `[SAHA]` seçenekler |
| **Toplumsal Sonuçlar** | dropdown | — | `[SAHA]` seçenekler |
| **Sektörel Etki** | dropdown | — | `[SAHA]` seçenekler |

---

## 3. Lokasyon (Veri Merkezi)

| Seçenek | Not |
|---|---|
| `KTBU Data Center` | Kurumun kendi veri merkezi (en sık görülen) |
| `DRC` | Disaster Recovery Center (felaket kurtarma) |
| `Cloud` | Genel bulut |
| `KT Cloud DRC POC` | Bulut + DRC + POC kombinasyonu |
| `KT Cloud` | ✅ Alp anlattı → bkz. §4 |

---

## 4. İsimlendirme kalıbı — 🟡 ÖNERİ (Alp'in anlatımından)

📌 Kaynak: Alp'in sözlü notları, 2026-09-25 (09:22 / 09:25 / 09:30).

### 4.1 Bileşenler

| # | Bileşen | Uzunluk | Durum |
|---|---|---|---|
| 1 | **Proje / şirket kodu** | 2 harf (`ym` · `sp` · `cc` örnekleri Alp'ten) | ⚠️ Alp: *"orası karışık, şimdilik ilgilenmeyelim"* → **kapsam dışı** |
| 2 | **Ortam kodu** | 2 harf — `pl`=prod · `xl`=prep · `dl`=development · `tl`=test | ✅ Alp'ten |
| 3 | **Sayısal kod** | **il plaka kodu** — `06`=Ankara · `41`=Kocaeli | ✅ Alp'ten |
| 4 | **Değişken 3 harf** | **lokasyon + Lokal/DMZ + ortam** | 🟡 öneri → §4.2 |

### 4.2 ⭐ "Üç harf yer değiştiriyor"

📌 **Alp:** *"İsimlendirmede sadece **lokasyon** ve **lokal/DMZ** etkili olmaktadır; ayrıca **ortam** da önemlidir.
Böylece üç harf yer değiştiriyor."*

**Şef'in önerisi:** sunucu adındaki değişken kısım **3 harf**; üç harf şu üç alana karşılık gelir:

| # | Belirleyici alan | Harf (öneri) | Kaynak |
|---|---|---|---|
| 1 | **Lokasyon** | `?` | `[SAHA]` |
| 2 | **Ortam** (prod/prep/dev/test/bugfix) | `?` | `[SAHA]` |
| 3 | **Lokal/DMZ** | `?` (`l`/`d`?) | `[SAHA]` |

**Saha AI'ının dolduracağı doğrulama tablosu** (gerçek envanterden — uydurma örnek yok):

| Gerçek sunucu adı (`<...>`) | Harf 1 | Harf 2 | Harf 3 | Lokasyon | Ortam | Lokal/DMZ |
|---|---|---|---|---|---|---|
| `[SAHA]` | | | | | | |
| `[SAHA]` | | | | | | |
| `[SAHA]` | | | | | | |

> 🟡 **Doğrulanacak:** üç harfin sırası · her harfin hangi alana karşılık geldiği · proje kodunun yeri · plaka kodunun yeri.
> 🧭 Sahadaki 3-4 gerçek ad bu tabloyu doldurunca kural kesinleşir.

---

## 5. Lokal/DMZ Ayrımı (ana kavram)

| Değer | Anlam |
|---|---|
| **`Local`** | Kurum iç ağı (iç ağ / LAN). Dışarıdan doğrudan erişilemez. |
| **`DMZ`** | DMZ (Demilitarized Zone) — iç ve dış ağ arasındaki yönetilen bölge; dışa bakan servisler burada. |

- `DMZ` seçilince yanındaki **`DMZ Numarası`** doldurulur; `Local` seçilince boş kalır.
- Bu ayrım, varlığın **erişilebilirlik / güvenlik profili** için belirleyicidir.

---

## 6. Değer Havuzları (gözlem — eksikler `[SAHA]`)

- **Ortam:** `Bugfix` · `Development` · `Prep` · `Test` · `Production` (+`POC`)
- **Yapısı:** `Fiziksel` · `Sanal`
- **Güvenlik Seviyesi:** `Gizlilik` · `Bütünlük` · `Erişilebilirlik`
- **Lokasyon:** `KTBU Data Center` · `KT Cloud` · `KT Cloud DRC POC` · `DRC` · `Cloud`
- **Lokal/DMZ:** `Local` · `DMZ`
- **İzleme:** `POC`

---

## 7. Saha AI'ı için doldurulacak boşluklar (kontrol listesi)

1. `Faz` · `Network` · `Bilgi Varlığı Seviyesi` · `Toplumsal Sonuçlar` · `Sektörel Etki` · `Konum` seçenekleri
2. `İlişkili Şirket` · `Uygulama Adı` · birim/kişi havuzları (gerçek liste envanterden)
3. §4.2 **doğrulama tablosu** — 3-4 gerçek sunucu adıyla harf eşlemesi
4. İsimlendirme kalıbının **resmî dayanağı** varsa (kurum standardı/şablon dosyası) referansı
5. `DMZ Numarası` mantığı (numara neyi ifade ediyor?)

---

## 8. Açık Sorular / Teyit Bekleyenler

1. **`Konum`** alanı tam olarak ne? (`Application` görüldü)
2. **`Faz`** seçenekleri neler?
3. **`Network`** seçenekleri neler?
4. **`Bilgi Varlığı Seviyesi`** seçenekleri neler?
5. **`Toplumsal Sonuçlar` / `Sektörel Etki`** seçenekleri neler?
6. **`xl` = prep** yazımı doğru mu? **Plaka kodu** adın neresinde duruyor?
7. Proje/şirket kodu havuzu (`ym`/`sp`/`cc`) — şimdilik **kapsam dışı** (Alp).

---

## 9. Kayıt

18 görsel işlendi (2026-09-25 09:11–09:27). Görsel-görsel kayıt: `memory/REF-sunucu-tanimlama.md`
