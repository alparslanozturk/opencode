# ADR-0008: Claude Code düzeyi — ölç, ince çekirdek, kademeli beceri, upstream'e yakın

- **Tarih:** 2026-11-28
- **Durum:** kabul edildi (Alp, 2026-11-28: "5 ilke güzel, çalışmalara başlayalım"); Faz 0 uygulandı
- **Bağlam:** Alp (2026-11-28): "amaç genel anlamda opencode ve modelinin kanıta dayalı çalışması, en optimum çalışma,
  upstream ile ilerleyebilmesi, becerilerin güzel olması ve en önemlisi Claude Code kadar kaliteli ve yetenekli olması …
  bu eksikleri bir mimari ile oluşturmak". Saha-özel işlere takılmadan genel çözüm.

## Teşhis (ölçüldü, 2026-11-28)

| Ölçüm | Değer | Kaynak |
|---|---|---|
| `engine/AGENTS.md` (her istekte bağlamda) | 60 bin karakter, 36 saha-olayı atfı | `script/beceri-yazim-denetim.py` BÜTÇE satırı |
| Beceri açıklamaları (her istekte bağlamda) | 29 bin karakter; 46 becerinin 42'si > 400 karakter | aynı |
| Gövdesi > 20 bin karakter beceri | 5 (rke2-edr 27, ansible 25, rhel-guncelleme 22 …) | aynı |
| Oturum açılışında bağlam | ~33,7K token (%13), iş başlamadan | saha ekranı 2026-11-27 |
| Modelin davranışını ölçen test | **yok** — testler betik (490) + kilit (386) | `script/` |

Gözlem: aynı gün iki kural ihlali, ikisinin kuralı da AGENTS.md'de yazılıydı ("for … ssh döngüsü yazma", "tahmini olgu gibi
sunma" → "Not allowed at this time" için "firewall" dedi). Sahadaki model MoE (35B, adım başına ~3B etkin); uzun kural metni
uyumu düşürür. **Daha çok metin yazmak çözüm değil.** Claude Code'un yaklaşımı: kısa sistem istemi + araç/hook ile zorlama +
gerektiğinde yüklenen beceri.

## Karar — beş ilke

1. **Ölç, sonra değiştir (davranış testi).** `script/davranis-test/` senaryo seti: kullanıcı cümlesi → beklenen davranış
   (ilk araç çağrısı, yasak kalıp, yasak söz). `opencode run --standalone --format json` ile koşar, araç çağrılarını denetler.
   Burada sahte uçla (`script/sahte-uc.py`, yalnız akış), sahada gerçek modelle `./kur.sh davranis` — çıktı yalnız
   geçti/kaldı sayısı (saha verisi dışarı çıkmaz). Her AGENTS/beceri/upstream değişikliği bu sayıyla kabul edilir.
2. **Kural koda (zorlama) > kural metne.** Modelin uyması gereken ama kodla denetlenebilen her kural eklentiye
   (`engine/plugins/guvenlik-v2.ts` kancaları) taşınır; metinde tek satır kalır. Adaylar: çok sunuculu `for … ssh/nc`
   döngüsü → onay ekranı yerine "ansible ile tek komut" ipucuyla geri çevir; iş envanteri olmadan çok sunuculu ansible
   → ipucu. Claude Code'daki hook modelinin karşılığı.
3. **İnce çekirdek AGENTS.md (≤ 25 bin karakter).** İçerik: kimlik, kaynak zorunluluğu, güvenlik/onay, iş haritası
   (istek → beceri). Saha olay geçmişi (G-numaraları) ve konu ayrıntısı ilgili becerinin ek dosyasına ya da
   `knowledge/operations-notes/`'a taşınır. Sadeleştirme ilke 1'in sayısı düşmeden yapılır.
4. **Kademeli beceri (agentskills.io biçimi).**
   - `description` ≤ 400 karakter: **ne zaman** + tetikleyici sözcükler (ne yaptığının uzun anlatımı gövdeye).
   - `SKILL.md` ≤ ~12 bin karakter: Önce sor → akış → sınır. Tablolar, sürüm notları, olay geçmişi aynı dizinde
     `<konu>.md` ek dosyaya (SKILL.md'de "ne zaman okunacağı" ile anılır — denetim zaten zorunlu kılıyor).
   - Ölçüm/sayma/eşleme işi betikte (deterministik, test edilir); yorum ve karar modelde. "Betik ölçer, model yorumlar."
   - Yeni teknoloji = aynı iskelet (`knowledge/templates/` beceri şablonu) + davranış testine en az 2 senaryo.
5. **Upstream'e yakın kal.** Değişiklik sırası aynı kalır (ayar → AGENTS → beceri → eklenti → en son fork). Fork
   yamaları ADR-0006 tablosunda; her yama için "upstream bunu yapıyor mu?" güncellemede yeniden sorulur. Upstream'de
   olan özellik bizim çözümümüzü emekliye ayırır. Hedef: güncelleme = `upstream-kontrol.sh` + davranış testi yeşil.

## UI — fare ile kaydırma (A22 yeniden değerlendirme)

A22 (2026-09-26) fareyi kapattı çünkü TUI fareyi yakalayınca MobaXterm'in seçip-kopyalaması çalışmıyordu. Motor 2.3.2'de
TUI'nin **kendi** seçimi ve kopyalaması var: `terminal.copy` varsayılanı Linux'ta `"select"` (bırakınca kopyalar),
`ctrl+y` seçimi kopyalar; pano yazımı sistem panosu ya da terminal üzerinden (`createHostClipboard` + `createRendererClipboardAdapter`) (`packages/tui/src/app.tsx:585`, `packages/tui/src/clipboard.ts`).
MobaXterm'in bu terminal pano isteğini (OSC 52) destekleyip desteklemediği **ölçülmedi**. Saha testi (fork kodu yok):
`ALP_TUI_FARE=1 ./kur.sh` → tekerlekle kaydır, metni sürükleyip seç → Not Defteri'ne yapıştır; olmazsa Shift+sürükle
(çoğu terminalde uygulamanın fare yakalamasını aşar — MobaXterm'de ölçülmedi). Biri çalışırsa A22 kaldırılır, fare açık gelir.

## Yol haritası

| Faz | İş | Kabul ölçütü |
|---|---|---|
| 0 ✅ | BÜTÇE satırı · `script/davranis-test.py` + `davranis-senaryo.json` (15 genel senaryo) · eklentide kuru kip (`OPS_DAVRANIS_KURU=1`) · `./kur.sh davranis` | öz-test (kuru kip engelliyor; ters deneme kalıyor) + denetim birim testi 21/21 burada; **sahada ilk sayı alınacak** |
| 1 | Beceri standardı: şablon + denetimde açıklama ≤ 400 uyarısı; 5 büyük beceri ek dosyalara bölünür | açıklama toplamı < 18 bin; davranış sayısı düşmez |
| 2 | AGENTS.md sadeleştirme (60 → ≤ 25 bin) | davranış sayısı düşmez, açılış bağlamı ölçülür |
| 3 | Kuralları eklentiye taşı (döngü, envanter ipucu) | ilgili senaryolar metinden bağımsız geçer |
| 4 | Upstream 2.4.x + fare testi sonucu | davranış testi yeşil; ADR-0006 tablosu güncel |

## Alternatifler

- **Kural eklemeye devam:** her saha olayında AGENTS'a satır — bugünkü yol; ölçülü olarak uyum düşüyor, reddedildi.
- **Daha büyük model:** kurumun kararı; mimari modelden bağımsız kalmalı (ince çekirdek her modelde kazandırır).
- **Derin fork (TUI/çekirdek):** upstream takibini zorlaştırır (ADR-0003/0006); yalnız eklentinin yapamadığı işte.
