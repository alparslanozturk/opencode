# 🖥️ Sunucu İsimlendirme / Varlık Tanımlama Kılavuzu

**Kaynak:** Alp'in 2026-09-25'te Telegram'dan gönderdiği 18 görsel (15'i kurum içi **Varlık Yönetimi** ekranı, 3'ü saha/opencode) + Alp'in sözlü açıklamaları
**Durum:** 🟢 V1 — kullanılabilir · bekleyen teyitler için §6
**Kural:** Bu doküman **yalnız alan adları ve seçenek taksonomisini** tutar. Gerçek sunucu adı, iç DNS (FQDN),
kişi adı, kuruma özel değerler **yazılmaz** — yerine `<...>` yer tutucu kullanılır.

---

## 1. Ekran Yapısı

Sayfa: **Varlık Yönetimi** → iki ana blok:

| Blok | İçerik |
|---|---|
| **Paydaş Bilgileri** | Varlığın sahibi/sorumlusu kişi ve birimleri |
| **Tanım Bilgileri** | Varlığın teknik ve sınıflandırma tanımı |

Sol menüdeki diğer modüller (görülenler): `Eğitim ve Kalite` · `Hizmetler ve Satın Alma` · `… Sistemler` · `… Finansal İşlemler`

---

## 2. Alan Sözlüğü

### 2.1 Paydaş Bilgileri

| Alan | Tip | Açıklama |
|---|---|---|
| **İlişkili Şirket** | dropdown | Varlığın bağlı olduğu şirket |
| **Varlık Sorumlusu** | kişi (dropdown) | Varlıktan sorumlu kişi |
| **Varlık Sahibi Birimi** | dropdown | Varlığı sahiplenen birim |
| **Varlık Sahibi** | kişi (dropdown) | Sahiplenen kişi |
| **Varlık Muhafızı Birimi** | dropdown | Varlığı "koruyan" birim |
| **Varlık Muhafızı** | kişi (dropdown) | Muhafız kişi |

### 2.2 Tanım Bilgileri

| Alan | Tip | Değerler / Açıklama | Durum |
|---|---|---|---|
| **Lokasyon** | dropdown | **Veri merkezi** → `KTBU Data Center` · `KT Cloud` · `KT Cloud DRC POC` · `DRC` · `Cloud` | ✅ (bkz. §3.1) |
| **Lokal/DMZ** | dropdown | **Ağ bölgesi** → `Local` (kurum iç ağı) / `DMZ` (dışa bakan bölge) | ✅ |
| **DMZ Numarası** | dropdown | `Lokal/DMZ = DMZ` seçilince devreye giren numara | ✅ |
| **Konum** | dropdown | Görülen değer: `Application` (varlık katmanı/türü olabilir) | 🟡 teyit |
| **Ortam** | dropdown | `Bugfix` · `Development` · `Prep` · `Test` · `Production` (+ `POC`) | ✅ |
| **Faz** | dropdown | Seçenekleri henüz görülmedi | 🟡 teyit |
| **Adı** | metin | Sunucu/varlık kısa adı (ör. `<kisa-ad>`) | ✅ |
| **DNS** | metin | FQDN → `<ad>.<kurum-alan-adi>.local` (birebir yazılmaz) | ✅ |
| **Yapısı** | dropdown | `Fiziksel` / `Sanal` | ✅ |
| **Uygulama Adı** | dropdown | İlgili uygulama | ✅ |
| **Başlangıç Tarihi** | tarih | Form varsayılanı: `25.09.2026` | ✅ |
| **Bitiş Tarihi** | tarih | Boş bırakılabilir | ✅ |
| **İzleme** | seçim | `POC` (izleme kapsamı) | ✅ |
| **Açıklama / Tanımı** | serbest metin | Varlık açıklaması | ✅ |
| **Güvenlik Seviyesi** | seçim (CIA) | `Gizlilik` · `Bütünlük` · `Erişilebilirlik` | ✅ |
| **Bilgi Varlığı Seviyesi** | dropdown | Seçenekleri henüz görülmedi | 🟡 teyit |
| **Network** | dropdown | Ağ alanı — seçenekleri henüz görülmedi | 🟡 teyit |
| **Toplumsal Sonuçlar** | dropdown | Etki sınıflandırması (toplumsal) | 🟡 teyit |
| **Sektörel Etki** | dropdown | Etki sınıflandırması (sektörel) | 🟡 teyit |

---

## 3. Lokasyon (Veri Merkezi) — detay

Veri merkezi seçenekleri:

| Seçenek | Not |
|---|---|
| `KTBU Data Center` | Kurumun kendi veri merkezi (en sık görülen) |
| `DRC` | Disaster Recovery Center (felaket kurtarma merkezi) |
| `Cloud` | Genel bulut |
| `KT Cloud DRC POC` | Bulut + DRC + POC kombinasyonu |
| `KT Cloud` | ⏳ **Alp açıklayacak** |

### 3.1 KT Cloud — sunucu isimlendirme kuralı

📌 Kaynak: Alp'in sözlü açıklaması, 2026-09-25 09:22.

KT Cloud tarafındaki sunucu adı şu bileşenlerden oluşuyor:

**1) Ön ek — 2 harf: proje / şirket kodu** (adın **başına** eklenir)

| Kod | Anlamı |
|---|---|
| `ym` | **Yatırım Menkul Değerler** |
| `sp` | **Sağlam Pay** projesi |
| `cc` | (Alp belirtmedi) |

> ⚠️ **Bu ön ek alanı karışık** → Alp: *"orası karışık olduğu için orayla şimdilik ilgilenmeyelim."*
> Yani proje/şirket kodu havuzu **şimdilik kapsam dışı**; tekrar konuşulacak.

**2) Ortam kodu — 2 harf: sunucunun çalışma ortamı**

| Kod | Ortam |
|---|---|
| `pl` | **prod** (production) |
| `xl` | **prep** (prod öncesi) 🟡 harfleri teyit edilecek |
| `dl` | **development** |
| `tl` | **test** |

**3) Sayısal kod = il plaka kodu** (Türkiye il plaka kodları)

| Kod | İl |
|---|---|
| `06` | **Ankara** |
| `41` | **Kocaeli** |

> 🟡 Bu sunucuları sonra görünce netleşecek — Alp: *"…o sunucuları sonra görünce anlarsın."*

---

### ⭐ 3.1.1 Belirleyici üç alan — "üç harf yer değiştiriyor"

📌 **Alp, 2026-09-25 09:25:** *"İsimlendirmede sadece **lokasyon** ve **lokal/DMZ** etkili olmaktadır; ayrıca **ortam** da önemlidir. Böylece üç harf yer değiştiriyor."*

Yani sunucu adındaki **değişken kısım = 3 harf**; bu üç harf şu üç alana göre belirlenir:

| # | Belirleyici alan |
|---|---|
| 1 | **Lokasyon** (veri merkezi) |
| 2 | **Lokal/DMZ** (ağ bölgesi) |
| 3 | **Ortam** (prod / prep / dev / test / bugfix) |

> Sabit kalan kısım: **proje/şirket kodu (2 harf: `cc`/`ym`/`sp`)** ve **sayısal kod (il plaka kodu)**.

**Gözlenen örnek adlardan çıkan desen (🟡 hipotez):**

| Örnek | Okunuşu | Yorum |
|---|---|---|
| `spl` | `s`+`p`+`l` | **lok./prod/Local** |
| `sdl` | `s`+`d`+`l` | lok./dev/Local |
| `stl` | `s`+`t`+`l` | lok./test/Local |
| `sxl` | `s`+`x`+`l` | lok./prep/Local |
| `spd` | `s`+`p`+`d` | lok./prod/**DMZ** |
| `std` | `s`+`t`+`d` | lok./test/DMZ |
| `sbl` | `s`+`b`+`l` | lok./bugfix/Local |

→ Orta harf = **ortam** (`p`=prod · `d`=dev · `t`=test · `x`=prep · `b`=bugfix) · son harf = **Lokal/DMZ** (`l`=Local · `d`=DMZ) 🟡

**Anlaşılan kalıp:** `<proje kodu: 2 harf><değişken: 3 harf — lokasyon+lokalDMZ+ortam>`

> 🟡 **Teyit gereken:** üç harfin **sırası** · her harfin hangi alana karşılık geldiği · proje kodunun yeri · plaka kodunun yeri.

---

## 4. Lokal/DMZ Ayrımı (ana kavram)

Sunucunun/varlığın **hangi ağ bölgesinde** durduğunu belirtir:

| Değer | Anlam |
|---|---|
| **`Local`** | Kurum iç ağı (iç ağ / LAN). Dışarıdan doğrudan erişilemez. |
| **`DMZ`** | DMZ (Demilitarized Zone) — iç ve dış ağ arasındaki yönetilen bölge. Dışa bakan servisler burada bulunur. |

- `DMZ` seçildiğinde, hemen yanındaki **`DMZ Numarası`** alanı doldurulur.
- `Local` seçildiğinde `DMZ Numarası` boş kalır.
- 📌 Bu ayrım, sunucunun **erişilebilirlik / güvenlik profili** için belirleyicidir.

---

## 5. Örnek Değer Havuzları (özet)

- **Ortam:** `Bugfix` · `Development` · `Prep` · `Test` · `Production` (+`POC`)
- **Yapısı:** `Fiziksel` · `Sanal`
- **Güvenlik Seviyesi:** `Gizlilik` · `Bütünlük` · `Erişilebilirlik`
- **Lokasyon:** `KTBU Data Center` · `KT Cloud` · `KT Cloud DRC POC` · `DRC` · `Cloud`
- **Lokal/DMZ:** `Local` · `DMZ`
- **İzleme:** `POC`

---

## 6. Açık Sorular / Teyit Bekleyenler

1. **`Konum`** alanı tam olarak ne? (değeri `Application` görünüyor — varlık türü/katmanı mı?)
2. **`Faz`** alanının seçenekleri neler?
3. **`Network`** alanının seçenekleri neler?
4. **`Bilgi Varlığı Seviyesi`** seçenekleri neler?
5. **`Toplumsal Sonuçlar` / `Sektörel Etki`** seçenekleri neler?
6. ~~**KT Cloud** bölümü~~ → ✅ anlatıldı (bkz. §3.1).
7. **Sunucu adı kuralı** → ✅ değişken kısım **3 harf** (lokasyon + Lokal/DMZ + ortam); sıra/harf eşlemesi ve plaka kodunun yeri teyit bekliyor (§3.1.1).

---

## 7. Ekran Görüntüsü Kaydı

18 görsel işlendi (2026-09-25 09:11–09:27). Ayrıntılı görsel-görsel kayıt:
`memory/REF-sunucu-tanimlama.md`
