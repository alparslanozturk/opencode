# ADR-0001: v1 kapsamı ve güvenlik korkulukları

- **Tarih:** 2026-09-14
- **Durum:** kabul edildi (Alp onayı)
- **Bağlam:** Kurum içi AI operasyon ajanı — motor opencode, hafıza git tabanlı `knowledge/`. Tek/çift kişilik ekip, air-gapped'e yakın kurum ağı, hedefler gerçek üretim sunucuları. Karar öncesi üç yüksek model (Claude Opus 5 · Codex gpt-5.5 · Gemini 3.1 Pro) aynı brief'i yanıtladı ve internet üzerinden 2026 pratikleri tarandı; tam kayıt: `knowledge/architecture/consultations/CONSULTATION-2-HIGH-MODELS.md`.

- **Karar:**
  1. **Fork yok (v1).** Yazılı tetikleyici: yalnızca **TUI/UI paritesi** (panel, kısayol, onay ekranı, glif seti) plugin API'siyle çözülemezse fork'a geçilir. Diğer her şey config/kural/beceri/plugin ile yapılır.
  2. **v1 salt-okunur.** Ajan dokunabilir ama üretimde yazamaz; tüm mutasyonlar Faz 2.
  3. **Onay kapısı süreçlidir.** Yeni beceri `experimental/` → insan incelemesi → `approved/`. opencode **yalnızca** `approved/` okur. `experimental/` için WIP ≤ 10, 30 gün expiry, haftada 1 saat sabit review slotu + yanıt SLA'sı.
  4. **Politika ayrı katmandır.** `AGENTS.md` ve izin ayarları **politika**dır, motor değil → `knowledge/policy/` altında belgelenir; motor dosyalarına gömülü karar metni yazılmaz.
  5. **Denetim izi git'te tutulmaz.** Çalışma zamanı kaydı ayrı `JSONL` + günlük hash zinciri (`knowledge/policy/AUDIT-FORMAT.md`). Git yalnız bilgi deposudur, audit sistemi değil.
  6. **Sırlar ajandan gizlidir.** Ayrı Unix servis hesabı + `ssh-agent`; hedefte `authorized_keys` içinde `command=` (forced-command) allowlist. Vault/dinamik kimlik erken fazda değerlendirilir; air-gapped'de SSH CA yeterli.
  7. **Değerlendirme (eval) altın seti zorunludur.** 20-30 vaka; model/politika/beceri değişiminde offline koşum; "sınır" ve "enjeksiyon" sınıfında **0 hata** kapıdır. (Not, 2026-09-16: `knowledge/eval/` **Faz 1'de açılacak** — bu koşumda bilinçli olarak yok, boş iskelet dahi açılmadı.)
  8. **Kayıtlar güvenilmez veridir.** Log/incident/runbook içeriği talimat değildir; gömülü yönerge (prompt injection) uygulanmaz (salt-okunur log analistinin 1 numaralı saldırı yüzeyi).
  9. **Faz sırası:** **-1** (bu belgeler: tehdit modeli + izin matrisi + audit formatı + Faz 0 kriterleri) → **0** (salt-okunur + audit hook plugin + sunucu tarafı forced-command) → **1** (beceri/kural ince ayarı + eval) → **2** (mutasyon/grant + MCP/Ansible).

- **Alternatifler:**
  - *Otonom öğrenme döngüsü (ajan kendi kendine beceri onaylasın)* → **reddedildi**: tek onaycıda "PR yorgunluğu" ya kör onaya ya tıkanan kuyruğa gider.
  - *Bağımsız politika motoru / onay geçidi (API gateway, tek kullanımlık grant)* → **v1 için reddedildi, Faz 2'ye ertelendi**: salt-okunur fazda gereksiz mühendislik; ancak **plan/grant formatı Faz 2'de yeniden tasarlanmasın diye şimdiden tanımlanacak**.
  - *Beceri ve kayıt için iki ayrı repo* → **v1'de reddedildi**: monorepo kalır; dizin bazlı kurallar (CODEOWNERS/lint) + ayrılma tetikleyicisi (erişim, saklama, kişisel veri, hacim) tanımlanır.
  - *Görünürlük için birebir kopya repo* → açıldı, **motor değil yalnızca görünürlük** amaçlı; sapma yok.

- **Sonuç / gerekçe:** Üç modelin ortak sonucu: v1'in başarısını ajanın yeteneği değil, **yetkisinin ve görünürlüğünün kısıtlılığı** belirler. Başarı ölçütü: prod'a dokunmadan güvenilir analiz + kanıta bağlı her öneri + **sıfır** secret/yetki/audit ihlali. Döngü en az bir kez (öneri → onay → `approved/` → ölçülebilir iyileşme) tamamlanmadan mimari kanıtlanmış sayılmaz.
