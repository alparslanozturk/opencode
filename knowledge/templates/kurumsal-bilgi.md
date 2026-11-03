# KURUMSAL BİLGİ — kalıcı kurum gerçekleri (sahada tutulur, bu depoya kurum verisi girmez)

> Yer: `~/ai/work/opencode/kurumsal-bilgi.ini` (adı tarihsel; içerik bu şablondaki bölümler). `/kaydet` günceller.
> **Girer:** her işte yeniden lazım olan, kanıtlı, uzun ömürlü bilgi. **Girmez:** tek seferlik iş adımları ve sonuçları
> (→ iş kaydı `~/ai/work/is-kayitlari/`), anlık değerler (sunucu sunucu kernel, disk yüzdesi), tahmin, ajanın yorumu, **sır**
> (parola, token, PAT, anahtar — yalnız "nerede durduğu" yazılır: `<sır — dosyada tutulmaz>`).
> Her satırın sonunda kaynak: `[Alp YYYY-MM-DD]` · `[komut: <kısa komut> YYYY-MM-DD]` · doğrulanmamışsa `[doğrula]`.
> Aynı bilgi tek yerde. Çelişki varsa iki satır `ÇELİŞKİ:` altında kalır, Alp karar verene kadar.

## 1. Ağ, DNS, NTP
- İç ağ (kurum.local) DNS sunucuları — ortama göre:
- NTP:

## 2. DMZ (kurum-dmz.local, kurum-dmz-test.local)
- DNS sunucuları:
- Çözümleme yolu (iç DNS DMZ adlarını çözmez):

## 3. Sunucu adlandırma (3 harf: lokasyon · ortam · yer)
- Kaynak tablo: opencode deposu `engine/AGENTS.md` "Sunucu adı → ortam" — burada yalnız kuruma özel ek/istisna.

## 4. Ağ blokları ↔ ortam ↔ envanter grubu
| Ansible grubu | IP bloğu | Ortam | Önek | Kaynak |
|---|---|---|---|---|

## 5. Erişim ve izin akışı (sunucuya ulaşılamıyorsa)
- Sıra:
- İzin/FW talebi: kime (rol/ekip adresi), biçim:

## 6. Kurum süreçleri
- CN: ne zaman gerekir / gerekmez:
- Kurulum (2. onay) playbook seti ve iç ağ/DMZ farkı:
- İş envanteri dosya adı biçimi:

## 7. Servis davranışı (OS işinde bilinmesi gereken — uygulama analizi değil)
| Sunucu grubu | Motor / compose yolu | Restart politikası (reboot sonrası) | Elle adım | Kaynak |
|---|---|---|---|---|

## 8. Erişim noktaları (sırsız)
- Azure DevOps / git: adres, proje, yerel klon yolu; kimlik bilgisi `<sır — dosyada tutulmaz>`

## 9. Bilinen sorunlar → kanıtlı çözüm
- Belirti · neden (kanıt) · çözüm (yapılan ve ölçülen) · kaynak

## ÇELİŞKİ / DOĞRULA
-
