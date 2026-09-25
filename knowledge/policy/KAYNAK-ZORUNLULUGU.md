# KAYNAK ZORUNLULUĞU — uydurma yasak (v1)

> Kaynak: Alp, 2026-09-25 — "Onaylıyorum uydurma yasak olsun" / "bilmediği şeyi sorması gerekiyor".
> Kök neden (A89/A91/A93): saha AI (Kurum Qwen) `sunucu-isimlendirme.md`'deki isimlendirme kuralını
> **kendisi türetti** (`spl/stl/sxl/sdl/...`, `v/r = legacy`, `f = fix`) ve dosyaya gerçek veri gibi
> yazdı. Şef'in v1'deki *örnek* tablosu bu davranışı besledi; v0.2'de o tablo çıkarıldı.

## Kural

- **Kaynak zorunluluğu:** yazdığın her değer bir kaynaktan gelmeli — okuduğun dosya + satır,
  çalıştırdığın komutun çıktısı ya da kullanıcının mesajı. Kaynak istenirse göster: `dosya:satır` /
  komut / mesaj.
- **Bilinmeyen → `[SAHA]` / `bilinmiyor` / `ölçülmedi` + kullanıcıya sor.** Boş bırakmak ve sormak
  serbesttir; kesin bir değer icat etmek değildir.

## Yasaklar

- Örnek/hipotez tablosunu gerçek veri gibi yazmak.
- Bir ad/kod parçasından anlam türetmek (ör. `spl`, `stl`, `std` → lokasyon/ortam eşlemesi).
- "Muhtemelen / büyük olasılıkla" bilgisini kesinmiş gibi sunmak.
- Sayı uydurmak.
- Doğrulanmamış bir kuralı dosyaya yazmak — önce doğrula; doğrulayamıyorsan yazma, boş bırak.

## Uygulama noktaları

- `engine/AGENTS.md` → "Kaynak zorunluluğu — uydurma yasak" bölümü (sahada
  `~/.config/opencode/AGENTS.md` olarak kurulur).
- Beceri çıktıları (skill runs).
- Dokümanlar (ör. `knowledge/sunucu-isimlendirme.md` §0).

## Çapraz referans

- [`GUVENLIK-KILITLERI.md`](GUVENLIK-KILITLERI.md) (K1–K7)
- [`AUDIT-FORMAT.md`](AUDIT-FORMAT.md)
- [`THREAT-MODEL.md`](THREAT-MODEL.md)

## Maskeleme notu

Bu dosyada ve türevlerinde gerçek sunucu adı / IP yazılmaz — yerine `kurum`, `test-sunucu`,
`10.0.0.x` gibi yer tutucular kullanılır.
