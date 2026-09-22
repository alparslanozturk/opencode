# Aider tecrübesi → opencode karşılığı

Aider fork'unda 15 fazda öğrendiğimiz her şeyin opencode'daki durumu.

## Doğrudan aktarıldı (bu pakette var)
| Aider'daki çalışma | opencode'da karşılığı | Durum |
|---|---|---|
| 38 beceri (`aider/beceriler/*/SKILL.md`) | `knowledge/skills/approved/*/SKILL.md` (**10 çekirdek**) + `knowledge/skills/parked/*/SKILL.md` (**28 park**, 2026-09-16 sadeleştirmesi) — **aynı frontmatter (`name`+`description`)**; kurulum yalnız approved/'daki 10'u kurar (bağlam tasarrufu, Aşama 2 + 2026-09-15 rapor-excel-pdf eklemesi); park edilmiş beceri gerekirse approved/'a taşınır | ✅ birebir kopya (havuz), seçici kurulum (varsayılan) |
| Proje kuralları / davranış rehberi | `~/.config/opencode/AGENTS.md` (CLAUDE.md de okunuyor) | ✅ |
| Envanter işinde "araç çalıştırma, sadece oku" dersi (Canlı Test #3 / T-04) | AGENTS.md kural **hiyerarşisi** (Aşama 2: mutlak yasak yerine "açıkça istenirse serbest") + `permission.bash` (salt-okunur komutlar allow, gerisi ask) | ✅ |
| Beceri tetikleme disiplini (B-20/T-03: "envanter" kelimesini tetikleyiciden çıkarma) | Beceriler artık **talep üzerine** yükleniyor; description'lar aynen taşındı | ✅ (daha iyi: otomatik tetikleme yok) |
| Uzun yanıt/endpoint yavaşlığı (T-01/T-02: 180 sn bekleme, erken pes etme) | `provider.options.timeout=900000`, `headerTimeout=300000`, `chunkTimeout=180000` | ✅ ayarlandı |
| Bağlam penceresi bilgisi | `models.<m>.limit.context` — Aşama 2'den beri `02-kur.sh` tarafından `${KURUM_URL}/models`'ten **otomatik tespit** ediliyor (uydurma `16384` yalnız tespit başarısız olursa kalıyor) | ✅ ölçülüyor, varsayılmıyor |
| Yıkıcı komut koruması | `permission.bash`: `rm -rf *` / `mkfs*` / force push = **deny**; 37 salt-okunur kalıp (`ls*`, `git log*`, ...) = **allow**; gerisi **ask** | ✅ |

## Çevirici (cc'deki `cevirici/`) — **GEREKMİYOR**
opencode zaten OpenAI uyumlu konuşuyor; kurum ucu da OpenAI uyumlu → aradan çevirici katmanı yok.
(Bu, cc paketindeki en kırılgan parçayı gereksiz kılıyor.)

## Aktarılamayan / açık kalanlar
| Aider'daki özellik | Neden yok | Ne zaman gerekir |
|---|---|---|
| Elle 16k token bütçesi + araç şeması kırpma | Kısmen gerekti — bkz. **2026-09-15 compaction thrash** aşağıda: `task/todowrite/webfetch` araçları `opencode.json`'da deny edilerek şema küçültüldü. Kalanı (skill listesi, yerleşik sistem promptu) opencode'un kendi mekanizması/ikilisi, repo'dan kırpılamıyor. | TS plugin ile daha fazla kırpma gerekirse (ör. skill description'larını kısaltma) → `notlar/QWEN-COMPACTION-RAPOR.md`'deki açık kalanlara bak |
| ~~Türkçe arayüz / çevirisi~~ | **KAPSAM DIŞI** — Alp (16:44): "türkçeleştirme derdim yok, aynı dilde devam edebiliriz" | ❌ kapandı, iş yok |
| Glif/ASCII güvenliği (`guvenli()`) | opencode'un TUI'ı kendi glif setini kullanıyor | Tofu görülürse → tema/fork |
| Yapıştırma (paste) kısayolu + CR düzeltmesi | Farklı TUI motoru | Kullanınca rahatsız ederse → bildir |
| `/beceri-uret` gibi komutlar | opencode'da plugin/command ile yapılır | İhtiyaç doğarsa → plugin |
| Onay ekranı numaralandırması (CC paritesi) | TUI içinde | UI işi sırasında |

## Sıradaki adım
1. hedef makinede `./02-kur.sh && opencode` → aynı 3 görevi koştur, **fork ile kıyasla**: doğru cevap · süre · token · gereksiz araç çağrısı.
2. Sonuç iyiyse: yukarıdaki "açık kalanlar" listesinden hangisi canımızı yakıyorsa **plugin** yazarız.
3. Plugin de yetmezse (UI paritesi) → fork'a kod. **Not: çeviri/Türkçeleştirme iş kalemi DEĞİL (Alp, 16:44).**

## 2026-09-14 — Bilgi katmanı ayrıldı (`knowledge/`)

Motor ile bilgi ayrıldı: `engine/` = opencode ayarı/kuralı (güncellenebilir), `knowledge/` = git tabanlı bilgi deposu (kalıcı).
Aider'daki "beceri kütüphanesi" fikri genişletildi:

| Aider'da | opencode'da (bu depo) |
|---|---|
| `aider/beceriler/*/SKILL.md` | `knowledge/skills/approved/*/SKILL.md` |
| (yoktu) | `knowledge/runbooks/` · `incidents/` · `lessons-learned/` · `operations-notes/` |
| (yoktu) | `knowledge/architecture/decisions/` (ADR) · `roadmap/` |
| (yoktu) | onay kapısı: `generated/` → `experimental/` → `approved/` |

## 2026-09-15 — Compaction thrash: aider'da görülmemiş yeni bir ders

Aider'ın 15 fazında görülmeyen, opencode'a özgü bir bulgu: **araç çağırmayan bir model yanıtı, opencode
1.18.30'un adım döngüsünü durdurmuyor** (yerel mock ile modelden bağımsız doğrulandı — bkz.
`notlar/QWEN-COMPACTION-RAPOR.md`). Aider'da bu sınıfta bir sorun yaşanmamıştı çünkü aider'ın döngü
kontrolü farklı. Ders: opencode'a geçerken "aider'da çalışıyordu" güvencesi harness-seviyesi hatalar
için geçerli değil — her ikisi de ayrı ayrı test edilmeli.

**Aşama 2 eki (2026-09-15):** Bu hatayı config'ten "düzeltmeye" çalışan iki makul-görünen çözüm de
**test edildi ve işe yaramadığı ölçüldü**: `agent.build.steps` (1/5/yok — hiçbiri durdurmuyor) ve
`opencode 1.18.31`'e yükseltme (npm'den indirilip aynı imzayla yeniden üretildi). Ders: bir opencode
harness hatasına karşı "mantıklı görünen ayarı dene, işe yarasın" varsaymak yeterli değil — her ayarı
**aynı reprodüksiyon senaryosuyla ölçüp** kanıtlamak gerekiyor; ölçülmeden config'e eklenen bir ayar,
kullanıcıya yanlış güvenlik hissi verir.
