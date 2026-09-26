# ADR-0005: Güvenlik/audit çekirdeği motordan bağımsız + opencode 2.x hazırlığı

- **Tarih:** 2026-09-26
- **Durum:** kabul edildi (Alp: "mimari ve diğer konulara odaklan")
- **Bağlam:** Upstream 2.x hattı (2026-09-11'den beri etiketli, 2.0.18; npm `latest` hâlâ 1.18.x) incelendi
  (`refs/upstream/v2.0.18`). Bulgular:
  1. **Eklenti API'si baştan yazılmış** (`@opencode/plugin`, `Plugin.define({ id, setup })`, Effect/Promise).
     Bizim kullandığımız 1.x kancaları — `tool.execute.before/after`, `chat.message`, `event`, `config` —
     **yok**; uyumluluk katmanı (`core/src/config/plugin/compatibility.ts`) yalnız `.claude/.agents` beceri
     klasörlerini taşıyor, 1.x eklentilerini değil. → `audit-log.ts` 2.x'te **yüklenmez**: kilitler ve audit
     sessizce kaybolur.
  2. Karşılıkları var, bazıları daha güçlü: `ctx.tool.hook("execute.before" | "execute.after")` (before
     `Tool.Error` ile reddedebilir) · `ctx.session.hook("prompt")` (kullanıcı mesajı → yetki satırı) ·
     `ctx.permission.hook("evaluate")` (`effect` değiştirilebilir → CN'siz değişikliği **"sor"**a düşürmek
     mümkün; 1.x'te `permission.ask` kancası tanımlı ama tetiklenmiyordu, C13) · `ctx.session.hook("retry")`
     (deneme sınırı → A23'ün doğal yeri).
  3. Diğer katmanlar büyük ölçüde taşınıyor: 1.x `opencode.json` (izin bloğu dahil) `ConfigMigrateV1`/
     `ConfigPermissionV1` ile normalize ediliyor; `AGENTS.md`, beceriler, `external_directory` destekli.
  4. Kırılanlar: derleme yolu `packages/opencode/script/build.ts` → `packages/cli/script/build.ts`
     (`kur.sh derle`), paket adları `@opencode-ai/*` → `@opencode/*`, bizim çekirdek yamalarımız (`session/
     prompt.ts` unknown-finish sınırı, `system.ts`, `reference.ts`, `httpapi/middleware/classify.ts`,
     `tui/clipboard.ts`) yeni dosya düzeninde yeniden değerlendirilmeli (bazıları upstream'de çözülmüş olabilir).
- **Karar:**
  1. **Şimdi:** güvenlik/audit mantığı **motordan bağımsız çekirdek** olarak ayrıldı:
     `engine/plugins/lib/kilit.ts` (K1/K5/K6 + yetki satırı + bash denylist) ve `engine/plugins/lib/maskele.ts`
     (gizli/PII maskeleme, denylist, kapsam). Bunlar yalnız girdi → karar/çıktı fonksiyonlarıdır; motor
     kancası bilmezler. `engine/plugins/audit-log.ts` artık **1.x adaptörü**: kancaları çekirdeğe bağlar,
     audit zincirini yazar. `lib/` alt dizindir: opencode `plugins/*.ts`'i tarar, alt dizini eklenti sanmaz.
  2. **Sessiz kayba karşı:** `kur.sh kontrol` yeni `kilit` satırı — eklenti ya da içe aktardığı `lib/`
     dosyası eksikse **hata** (eklenti yüklenemezse kilitler görünmeden kapanırdı); gözlem modu **uyarı**.
  3. **2.x geçişi hâlâ ADR-0003 m.4'e bağlı** (npm `latest` 2.x olunca). Geçiş işi = yeni adaptör
     `engine/plugins/guvenlik-v2.ts`: `tool "execute.before"` → `kilitDenetle`; `session "prompt"` →
     `yetkiSatirlariniOku`; `tool "execute.after"` → maskeleme + audit; isteğe bağlı `permission "evaluate"`
     → K1'i "sor"a düşür. Çekirdek ve 103+ davranış testi aynen kalır.
  4. Geçiş kontrol listesi (o gün): derleme yolu (`kur.sh derle`, `smoke-ikili.sh`), çekirdek yamalarının
     tek tek yeniden değerlendirilmesi, `opencode.json` göçünün `opencode debug config` ile doğrulanması,
     `script/upstream-kontrol.sh`'ın 2.x hattını takip edecek şekilde güncellenmesi.
- **Alternatifler:**
  1. *Şimdiden 2.x'e geçmek.* Reddedildi — npm `latest` değil, sürümler günlük akıyor (2.0.16→2.0.18 iki
     günde), paket yapısı oturmamış; sahada kararlılık öncelik.
  2. *Hiçbir şey yapmadan beklemek.* Reddedildi — geçiş günü güvenlik mantığını yeniden yazmak en riskli yol;
     tek dosyada 1400 satırlık iç içe kod taşınırken kilit davranışı değişebilirdi.
  3. *Çekirdeği ayrı npm paketi yapmak.* Reddedildi — npm eklentisi yasak (offline); yerel `lib/` yeterli.
- **Sonuç / gerekçe:** Davranış değişmedi: `audit-log.test.ts` 122/0, yeni `lib/kilit.test.ts` (çekirdeği
  kancasız çağırır) 4/0, derlenmiş 1.0.3 ikiliyle uçtan uca (K1 yetkisiz/CN'li, K5, salt-okunur) aynı sonuç,
  `duman-kontrol-rapor.sh` 23/0 (rapor 26/28 satır ≤ 29). 2.x geçiş maliyeti "güvenliği yeniden yaz"dan
  "ince adaptör yaz"a indi.
