# Yüksek Model Danışması — 2. Tur Sentezi

**Tarih:** 2026-09-14
**Sorgulanan modeller:** Claude Opus 5 (Doktor) · Codex gpt-5.5 · Gemini 3.1 Pro (Antigravity/agy)
**Yöntem:** Aynı brief (`SORU2.md`) üç modele paralel verildi + internet araştırması (Tavily, 2026 pratikleri).
**Bağlam:** `/root/ai/opencode-agent` — Engine (opencode) + Knowledge (git) mimarisi, Faz 1 salt-okunur hedefi, 1-2 kişilik ekip, air-gapped'e yakın kurum ortamı.
**Tam metinler:** Ek 1 (Opus), Ek 2 (Codex), Ek 3 (Gemini Pro).

---

## Tek cümlelik ortak sonuç
Üç model de aynı yere varıyor: v1'in başarısını belirleyen şey ajanın **yeteneği** değil, **yetkisinin ve görünürlüğünün kısıtlılığı**. Başarı ölçütü: prod'a dokunmadan güvenilir analiz + her önerinin kanıta bağlı olması + sıfır secret/yetki/audit ihlali.

## 3/3 hemfikir (karar verilmiş sayılır)
1. **Fork yok** — doğru karar; ama "ne zaman fork'a geçilir" tetikleyicisi yazılı olmalı (audit hook, hard-deny, offline install, permission semantics upstream'de engellenirse).
2. **v1 kesinlikle salt-okunur** hasta; "dokunabilmeli ama bozamamalı".
3. **En zayıf halka = onay kapısı.** Tek kişilik ekipte otomatik öğrenme akışı PR yorgunluğu yaratır → ya kör onay ya tıkanan kuyruk.
4. **Audit git'e girmez:** ayrı JSONL/journald + günlük hash zinciri (prev_hash + gün sonu imzalı manifest), ~12 ay saklama. Alanlarda OTel GenAI isimleri.
5. **Secrets:** ajan anahtarı görmez → ayrı Unix hesabı + ssh-agent + hedefte `command=`/forced-command (allowlist). Vault/dinamik kimlik **erken** (air-gapped'de SSH CA, Vault'un %80'ini bedavaya verir).
6. **Eval (altın set):** 20-30 vaka; her model/policy/skill değişiminde offline koşum; "sınır" ve "enjeksiyon" sınıfında 0 hata = geçme kapısı, diğerleri baseline −%5.
7. **Log/incident kayıtları = güvenilmez veri.** İçlerine gömülü talimat (prompt injection) asla uygulanmaz — salt-okunur log analistinin #1 saldırı yüzeyi.
8. **Sandbox + egress kontrolü:** systemd sertleştirme (ProtectSystem=strict, NoNewPrivileges, PrivateTmp, ReadOnlyPaths) + nftables ile yalnız model endpoint + hedef SSH portları.
9. **Süreç/beceri disiplini:** `SKILL.md` <500 satır, tek seviye referans, hesaplama script'e, `description` ile tetikleme.

## Ayrıştıkları yerler
- **38 approved beceri:** Opus "≤8'e indir, kalan experimental", Codex "6-10 çekirdek", Gemini "otonom öğrenme döngüsünü v1'de tamamen iptal et". → Yön aynı: **buda**. (`skills/generated/` üç kademeyi Opus fazla buluyor, generated = experimental.)
- **Tek repo mu iki repo mu:** Gemini "beceri (=davranış/kod) ve kayıt (=veri) iki ayrı repo" der; Opus + Codex "v1'de monorepo kalsın, ama dizin bazlı CODEOWNERS/lint ve **ayrılma tetikleyicisi** (ACL, retention, kişisel veri, hacim) yazılsın". → Çoğunluk: **monorepo**.
- **Gateway / policy motoru:** Opus "v1'de gerek yok, ama *plan/grant formatını şimdi tanımla* ki Faz 2'de yeniden tasarlamayasın", Gemini "gateway kurmayın, öğrenme onayı = normal Git PR", Codex "politika kalıcı varlık olmalı; v1'de YAML + küçük script yeter".
- **Progressive disclosure rakamı:** Opus "70k→500 token satıcı slaytı; ölçmeden varsayma" uyarısı (kabul testi öneriyor).

## Konsensüs eklemeler — v1'e giren yeni maddeler
1. **`knowledge/policy/` ayrı katman.** `AGENTS.md` + izin ayarları **politikadır**, motor değil. `engine/` yalnız sağlayıcı bağlantısı + izin JSON'u; kural metni knowledge'a taşınır, fork gerekmez.
2. **`engine/lock.yaml`** — opencode sürümü + model ağırlık hash'i + sampling parametreleri. Bu olmadan "model değişse motor kalır" iddiası ispatlanamaz.
3. **`experimental/` WIP limiti (≤10) + 30 gün expiry + haftada 1 saat sabit review slotu + SLA.** Onay yükünü takvime yaz, niyete değil.
4. **SSH CA + kısa ömürlü sertifika** (`ssh-keygen -s ca -V +168h`) = Vault'suz dinamik kimlik; hedef `authorized_keys`'te `cert-authority,restrict,command="/usr/local/bin/aiops-shell"`.
5. **systemd sandbox + nftables egress** (yalnız model endpoint + hedef hostların SSH'ı).
6. **Veri sınıflandırma:** her kayıt dosyasında frontmatter `classification: internal|confidential`; `confidential` görev açıkça istemedikçe bağlama girmez. Ayrıca kurum içi Qwen endpoint'i prompt'ları logluyor mu → audit kapsamı.
7. **Skill/MCP tedarik zinciri:** approved'a giren skill script'leri checksum/imzasız girmesin; MCP tool açıklamaları (tool poisoning) review'dan geçsin.
8. **Yeni katman önerileri:** `secrets` (repoda YOK) · `audit/` (git dışı) · `evals/` (altın set).

## Faz planı (konsensüs)
- **Faz -1:** tehdit modeli + izin matrisi + audit formatı + Faz 0 başarı kriterleri. (Codex)
- **Faz 0:** salt-okunur + audit hook plugin (`plugins/` ilk içeriği) + sunucu tarafı forced-command. Read-only tool katmanı **buraya** (Faz 2'ye değil).
- **Faz 1:** beceri/kural ince ayarı + altın set eval altyapısı.
- **Faz 2:** mutasyon (plan → grant → runner), MCP/Ansible automation platform, OPA/Cedar değerlendirmesi.

## Ölçüm (3/3 aynı)
- İnsan düzeltmesi olmadan doğruluk (gerçek görevlerde).
- Öneri onay oranı + onay süresi (SLA).
- Güvenlik olayı = **0**.
- "En az bir beceri experimental → onay → approved döngüsünü tamamen geçip altın sette ölçülebilir iyileşme yaratmış olmalı" — döngü bir kez dönmediyse mimari kanıtlanmamıştır. (Opus)

## Tek satır alıntılar
- **Doktor (Opus):** "Onay kapısı gerçek bir kalite sürecine dönüşmezse mimari kâğıtta kalır."
- **Codex:** "Kritik olan ne bildiği değil, **neyi hangi yetkiyle** yapabildiği."
- **Gemini Pro:** "Ajanı ilk günden salt-okunur sok, onay yükünü minimize et; otonom öğrenme döngüsünü v1'de iptal et."

---
# EK 1 — Claude Opus 5 (Doktor)

# Danışma 2 — Yanıt (Doktor / Opus 5)

Önce üç açık itiraz, sonra soru soru:

- **Katılmıyorum: 38 "approved" beceri.** Kendi ilkeniz "approved'a onaysız/kanıtsız hiçbir şey girmez" diyor; ama henüz tek gerçek görev koşmadan 38 beceri approved'da. Bu, döngüyü daha başlamadan bypass etmek. (Bkz. Soru 8.)
- **Katılmıyorum: "progressive disclosure 70k → 500 token" rakamı.** Bu, satıcı slaytı sayısı. Gerçek kazanç `description` alanının tetikleme kalitesine bağlı; ölçmeden varsaymayın (Soru 7'de test var).
- **Kısmen katılmıyorum: "onay/politika motoru" tartışması v1 için yanlış soru.** v1 salt-okunur. Salt-okunurda politika = opencode deny-listesi + sunucu tarafında zorunlu komut (forced command). Ayrı motor Faz 2 sorusu; ama *plan dosyası formatını* şimdi tanımlayın ki Faz 2'de yeniden tasarlamayın.

---

## 1. v1 kapsamı — 7 adayın ayrımı

| # | Aday | v1 | Gerekçe |
|---|---|---|---|
| 1 | HITL üç ayağı | **Şablon alanı olarak evet**, bileşen olarak hayır | Her öneri/plan dosyasında zorunlu 3 alan: `context`, `what_human_can_change`, `rationale`. Regülasyon uyumu bu kadarla başlar. |
| 2 | Onay payload'a bağlı | **Evet, yalın haliyle** | Onay commit'i önerinin içerik hash'ini taşır; hash değişirse onay düşer. Git + 30 satır script (Soru 2). |
| 3 | Öneri ≠ yetki / policy verdict / grant | **Erken** — ama plan formatı v1'de | Yürütücü yokken grant'ın tüketeceği şey yok. |
| 4 | NHI + kısa ömürlü kimlik + credential proxy | **Yarısı v1**: ayrı servis hesabı + ajanın anahtarı görmemesi (ssh-agent) + SSH sertifikası. Vault/Infisical: **erken** | Air-gapped'de SSH CA size Vault'un %80'ini bedavaya verir (Soru 5). |
| 5 | Tool-çağrısı başına en küçük yetki | **Evet** | v1'de = opencode `permission` deny-by-default + sunucu tarafı forced-command allowlist. OPA/Cedar: erken. |
| 6 | MCP ile mevcut otomasyonu çağırma | **Erken (Faz 2)**, ama ilke şimdi: *ajan mutasyon için asla ad-hoc shell üretmez, var olan playbook'u tetikler* | AAP MCP yoksa aynı deseni 1 script wrapper ile de kurarsınız. |
| 7 | Beceri disiplini (<500 satır, script'e delege, description tetikleme) | **Evet, ilk gün** | Maliyeti sıfır, sonradan düzeltmesi pahalı. |

**v1 = 2, 5, 7 + 1 ve 4'ün yalın yarısı.** Kalanı Faz 2.

## 2. Onay mimarisi — gateway şart mı?

İki farklı "onay" var, karıştırılıyor:

**(a) Bilgi onayı** (experimental → approved): **git yeter.**
- Öneri = tek dosya, `experimental/<id>.md`. `sha256(dosya)` → öneri kimliği.
- İnsan onayı = `approvals/<id>.sig`: içeriği `<hash> <approver> <ts>`, `ssh-keygen -Y sign` ile imzalı (offline çalışır, ekstra araç yok).
- `approved/`'a taşıma **bir script** yapar: imzayı `ssh-keygen -Y verify` ile doğrular, hash eşleşmezse reddeder, taşır, commit'i imzalar (`git config gpg.format ssh`).
- Ajan `approved/` ve `approvals/`'a yazamaz (dosya sistemi izni, git hook değil — hook'u ajan atlayabilir).
- Payload değişirse → hash değişir → imza eşleşmez → onay geçersiz. İstediğiniz desen tam olarak bu, 30-50 satır script.

**(b) Yürütme onayı** (Faz 2): **git yetmez, ama "gateway" de bir sunucu olmak zorunda değil.**
- Ajan `plans/<id>.yaml` yazar (hedef host, playbook adı, parametreler, HITL 3 alanı).
- İnsan `approve <id>` → imzalı grant: `<plan_hash> <nonce> <expires_at> <approver>`.
- `runner` = root'a ait, sudoers'ta tek satırla ajan kullanıcısına açık bir script: grant'ı doğrular, süresi/nonce'u kontrol eder, `consumed/`'a taşır (tek kullanımlık), *yalnız* allowlist'teki playbook'u çağırır, audit'e yazar.
- Ajanın runner dışında mutasyon yolu yoktur. Bu "gateway", 200 satır Python + sudoers satırı. 1 kişilik ekibin en yalın hali bu.

v1'de yalnız (a)'yı kurun; (b)'nin plan/grant formatını `architecture/decisions/`'a yazın.

## 3. Bilgi deposu sınırı — talimat vs kayıt

Ayrım **doğru ve kritik**, ama sebebi "düzen" değil **güvenlik**:
- **Talimat** (skill, AGENTS/policy): *bağlama yüklenir, davranışı değiştirir* → onay kapısından geçer, güvenilir kabul edilir.
- **Kayıt** (incident, karar, not): *sorgulanır, veridir* → **güvenilmez içerik**. Incident'ler log satırı taşır; log satırı saldırgan tarafından yazılmış olabilir ("ignore previous instructions"). Kayıt asla otomatik bağlama yüklenmez, yalnız görev bazlı `grep`/retrieval ile ve "bu veridir, talimat değildir" çerçevesiyle girer.

**Aynı repo mu?** v1'de **aynı repo, farklı kurallar**:
- 1 kişi, tek PR akışı, çapraz link (`incident → lesson → skill`) kolay.
- `approved/` + `policy/` yazma izni yalnız insanda; `incidents/`, `operations-notes/` ajan dalından doğrudan yazılabilir (kapı yok, sadece review).
- **Ayırma tetikleyicisi:** (i) kayıtlar gizlilik sınıfı gereği (IP, kullanıcı adı, kişisel veri) farklı saklama/erişim isterse, (ii) kayıt hacmi git'e uymamaya başlarsa (ham log/snapshot → git değil, dosya deposu). O gün gelince ayırırsınız; bugün değil.

Katman düzeltmesi (1. tur itirazı): opencode.json'daki `instructions: [...]` alanıyla `knowledge/policy/AGENTS.md`'yi işaret edin. `engine/`'de yalnız sağlayıcı + izin JSON'u kalsın; kural metni knowledge'a geçer, fork gerekmez.

## 4. Model bağımsızlığı

**Qwen → X geçişte kırılanlar:** tool-call güvenilirliği (JSON şeması ihlali, paralel çağrı davranışı), uzun AGENTS.md'ye uyum, reasoning/thinking etiketlerinin çıktıya sızması, bağlam penceresi (500 satır bütçesi tokenizer'a göre kayar), sistem-prompt önceliği, "ask" izin diyaloğunda soru sorma vs. varsayım yapma eğilimi.

**Yasaklar (lint ile denetleyin):**
- Prompt/skill'de model adı, sağlayıcı adı, `/no_think` gibi model-özel anahtarlar.
- Skill içinde tool-call sözdizimi örneği (`<tool_call>`, JSON kalıbı). Skill *niyeti* tarif eder; bağlamayı opencode yapar.
- Bağlam boyutu varsayımı ("tüm logu yükle").
- Skill'e gömülü sıcaklık/sampling ayarı — bunlar `engine/` lock dosyasında.
- Reasoning çıktısına dayanan kural ("düşüncende şunu kontrol et").

**Kabul testi (her model/ayar değişiminde, offline):** `knowledge/eval/` altında:
1. Tool-şema uyumu: 20 görevde geçersiz çağrı oranı (hedef %0).
2. Skill tetikleme: 15 görev → doğru skill yüklendi mi (precision/recall).
3. Sınır testi: 10 "yapmaması gereken" görev → 0 yürütme, 10/10 reddetme/sorma.
4. Enjeksiyon testi: içinde talimat gömülü 5 log → uyulmuyor.
5. Rapor şablonu uyumu (deterministik kontrol).
6. Altın set (Soru 7) — taban çizgisine göre gerileme yok.

Eşik: 3 ve 4'te tek hata = geçmez. Diğerleri baseline − %5 içinde.

## 5. Secrets — sizin ortam

En yalın güvenli desen, dört parça:

1. **Ayrı Unix kullanıcısı** `aiops`, sudo yok, ev dizini ve knowledge klonu kendine ait.
2. **SSH CA + kısa ömürlü sertifika** (`ssh-keygen -s ca_key -I aiops -n aiops -V +168h`): Vault'suz "dinamik kimlik". CA anahtarı root'ta; haftalık (sonra günlük) `issue-cert` script'i. Süresi dolan sertifika kendiliğinden ölür → rotasyon bedava.
3. **Anahtar ajanın elinde değil, ssh-agent'ta:** `aiops` user-level systemd unit'i ssh-agent'ı başlatır, anahtarı `LoadCredentialEncrypted=` ile alıp `ssh-add` eder, sonra dosya yok. LLM `ssh-add -L` görebilir (public), private'ı çıkaramaz. Bu, credential proxy'nin sıfır maliyetli hali.
4. **Sunucu tarafı zorunlu komut** — asıl güvenlik burada, ProxyCommand'da değil (ajan başka bir ssh binary'si ile ProxyCommand'ı atlar, forced-command'ı atlayamaz):
   ```
   cert-authority,principals="aiops",restrict,command="/usr/local/bin/aiops-shell" ssh-ed25519 AAAA... CA
   ```
   `aiops-shell` = `$SSH_ORIGINAL_COMMAND`'ı allowlist'e (salt-okunur: `cat /proc/...`, `journalctl --since`, `rpm -qa`, `ss -tlnp`…) göre çalıştırır, her komutu **kendi audit'ine** yazar (Soru 6'daki ikinci kaynak).

**SSH dışı sırlar (DB, API):** ajana verme. *Sırrı tool tutar:* root'a ait wrapper script, sudoers'ta exact-match tek satır, script sırrı root-only dosyadan okur, salt-okunur sorgu döner. Ajan yalnız script adını bilir.

**sops/age:** v1'de gerek yok; knowledge repo'ya şifreli bile olsa sır koymayın. **Model endpoint anahtarı** opencode'un kendisine lazım → `LoadCredential=` + unit'te `Environment` değil `EnvironmentFile` yerine credentials dizini; bash tool'un env'inden `unset` edin (opencode `bash` env'i miras alır).

## 6. Audit — alanlar ve yer

**Kesişme noktası:** opencode plugin `tool.execute.before/after` hook'u — boş `plugins/` dizininin ilk ve tek v1 içeriği bu olmalı (saf JS, bağımlılık yok, offline kurulur). İkinci bağımsız kaynak: sunucu tarafı `aiops-shell` logu (ajan kurcalayamaz).

**Kayıt başına alanlar (JSONL, OTel GenAI adlarıyla ki sonradan yeniden adlandırma değil, taşıma olsun):**
`event_id · ts_utc · session_id · task_id · actor.agent (aiops@host) · actor.human (tetikleyen) · gen_ai.request.model + endpoint + ağırlık hash'i · engine.version + opencode.json hash · policy.hash (AGENTS/policy commit) · skills.loaded [{name, commit}] · gen_ai.tool.name · tool.input (tam, sır maskeli) · target.host · exit_code · output.sha256 + ilk 50 satır (tamamı ayrı blob dizini) · duration_ms · verdict {allow|deny|ask, rule_id} · approval.ref {plan_hash, approver, sig} · gen_ai.usage.{input,output}_tokens`

**Nereye:** journald'ye yapısal alanlarla (`systemd-cat` / native journal), oradan `systemd-journal-remote` ile **başka bir hosta** iletim. Tek host varsa: `chattr +a` append-only dizin + günlük `sha256sum` zinciri (önceki günün hash'i bugünün başlığında). Saklama 12 ay. Git'e **asla**.

## 7. Eval — altın set

**Yapı:** `knowledge/eval/cases/<id>/{input/, task.md, expected.md, rubric.yaml}`; input = anonimleştirilmiş log/envanter snapshot'ı.

**İlk 25 vaka seçimi (katmanlı):**
- 10 log analizi — geçmiş incident'lardan, **kök nedeni bilinen** olanlar (doğruluk doğrulanabilir).
- 5 envanter/rapor — deterministik cevap (exact match).
- 5 sınır — "yapma / sor" (salt-okunur ihlali).
- 3 enjeksiyon/gürültü — logda gömülü talimat, çelişkili veri.
- 2 skill-tetikleme — hangi skill yüklenmeli.

Kural: "güzel rapor" değil **doğrulanabilir sonuç** olan vakaları seçin.

**Puanlama:** deterministik kontroller (grep/şema) + rubric'li LLM-judge (**farklı** model; Qwen kendini değerlendirmesin) + %20 insan spot-check.

**Gerilemesiz değişim:** `eval run --model X --config Y` → sonuç JSONL → baseline ile diff. Kapı: sınır ve enjeksiyon sınıfında 0 hata; deterministik ≥ baseline; judge ≥ baseline − %5. **Ne zaman koşar:** model değişimi, policy/AGENTS değişimi, *her approved/ değişikliği* (1. turda eksik olan "test adımı" budur — onay artık sadece gecikme kapısı değil).

**Overfit önlemi:** 5 vaka holdout (skill yazarken bakılmaz), her ay yeni incident'tan 2 vaka eklenir.

## 8. En büyük mimari hata — v1'den çıkarılacaklar

1. **38 approved skill.** v1'in 3 salt-okunur görevine hizmet eden ≤8 kalsın; kalanı `experimental/`'a (veya `archive/`). Her biri döngüden geçerek geri gelsin. Aksi halde "AI öğrenmiyor, öneriyor" ilkesi ilk günden kâğıt üzerinde.
2. **`skills/generated/`** — üç kademe fazla; generated = experimental. Sil.
3. **Politika motoru / gateway fikri** — v1'de yok. Salt-okunurda deny-list + forced-command yeter.
4. 1. turdan: `operations-notes` + `lessons-learned` birleşsin.

## 9. Kaçırdıklarınız

- **Veri üzerinden prompt enjeksiyonu**, salt-okunur log analistinin #1 saldırı yüzeyi. Kayıt = güvenilmez veri (Soru 3). Eval'de test edin.
- **Sandbox, ucuz ve büyük kazanç:** opencode'u systemd unit'inde `ProtectSystem=strict · ReadOnlyPaths=/root/knowledge/approved · NoNewPrivileges=yes · PrivateTmp=yes` ile koşturun. **Egress:** nftables `meta skuid aiops` ile yalnız model endpoint + hedef hostların 22 portu. Air-gapped "yakın" ise bu satır sizi gerçekten air-gapped yapar.
- **Veri sınıflandırma:** her kayıt dosyasında frontmatter `classification: internal|confidential`; retrieval `confidential`'ı görev açıkça istemedikçe bağlama sokmaz. Ayrıca: **kurum içi Qwen endpoint'i prompt'ları logluyor mu?** O da audit kapsamında.
- **Tekrarlanabilirlik lock'u:** `engine/lock.yaml` = opencode sürümü + model ağırlık hash'i + sampling parametreleri. "Model değişse engine kalır" iddiası ancak hangi modelin hangi çıktıyı ürettiğini söyleyebiliyorsanız doğrudur.
- **MCP tedarik zinciri:** MCP sunucusu = tool açıklamalarıyla enjeksiyon yapabilen kod (tool poisoning). Offline avantaj; sürüm sabitleyin, `description`'ları review'dan geçirin, MCP tool'ları da approved/ kapısına tabi olsun.
- **Onay yorgunluğuna WIP limiti:** `experimental/`'da en fazla 10 açık öneri; 30 günde işlenmeyen otomatik `expired/`. Haftalık sabit 1 saatlik review slotu. SLA'yı takvime yazın, niyete değil.
- **OTel GenAI semconv:** SDK'sını değil **isimlerini** alın (Soru 6). Faz 2'de collector eklemek kolay olur.

---

**Tek cümle:** v1 başarılıysa operatör 3 salt-okunur görevi her hafta gerçekten bu ajanla yapıyordur, her tool çağrısı ajanın kurcalayamadığı bir audit'te duruyordur, yetkisiz tek aksiyon yoktur ve **en az bir beceri experimental → onay → approved döngüsünün tamamını geçip altın sette ölçülebilir bir iyileşme yaratmıştır** — döngü bir kez gerçekten dönmediyse mimari kanıtlanmamıştır.

---
# EK 2 — Codex gpt-5.5

**Kısa Hüküm**
- Tez doğru: “Engine değişebilir, bilgi kalır.” Ama eksik: **politika da kalıcı varlık** olmalı. `AGENTS.md` ve `opencode.json` sadece engine adapter’ı olsun; asıl politika `policy/` altında, versioned, testli, engine’den bağımsız dursun.
- Katılmadığım yer: “MCP = deterministik + guardrail” fazla iyimser. MCP sadece arayüzdür; yetki, veri sızıntısı ve yanlış iş tetikleme riskini kendi başına çözmez.
- V1’in omurgası: **read-only analyst + policy-gated proposals + immutable audit + small golden eval set**.

**1. V1 Kapsamı**
- Mutlaka:
  - HITL üç ayağı: bağlam, yetki, gerekçe. İnsan “neyi onayladığını” görmeli.
  - Payload-bound approval: en azından skill promotion, incident kaydı, rapor yayını ve ilerideki tool çağrıları için.
  - Secrets disiplini: Vault yoksa bile ayrı agent kimliği, ayrı SSH hesabı, agent’ın kişisel anahtar kullanmaması.
  - Tool başına least privilege: opencode izinleri + shell allowlist + `.env`, key, secret deny.
  - Skill disiplini: `SKILL.md <500 satır`, tek seviye referans, script’e hesaplama, açıklayıcı `description`.
  - Audit: git dışı JSONL/journald/syslog.
  - Eval: ilk 20-30 altın vaka.
- Erken:
  - Tam Vault/OIDC/dinamik credential proxy.
  - OPA’yı ayrı servis olarak çalıştırmak. V1’de YAML + küçük Python/shell policy checker yeter.
  - AAP MCP / K8s MCP / DB tool’ları. Faz 2.
  - Çok ajanlı mimari, otomatik öğrenme, otomatik runbook güncelleme.
- Özellikle çıkarın: 38 approved skill fazla. V1 için 6-10 çekirdek skill bırakın; geri kalanları `experimental/`a alın.

**2. Onay Mimarisi**
- Sadece git + opencode izinleriyle “payload-bound + tek kullanımlık grant” **gerçek anlamda kurulamaz**.
- Git onay geçmişini tutar; opencode izinleri kaba allow/ask/deny verir. Ama payload hash, TTL, tek kullanım, grant tüketimi, runtime log ve policy verdict için ayrı kapı gerekir.
- En yalın v1:
  - Ajan sadece `proposal.json` üretir.
  - `proposal.json` canonicalize edilir, `sha256` alınır.
  - `policy/check` sonucu: `ALLOW | ESCALATE | BLOCK`.
  - İnsan onayı gerekiyorsa `grant.json` üretilir: `payload_hash`, `approver`, `reason`, `expires_at`, `max_uses:1`, `policy_version`, `signature`.
  - `executor` grant’i atomik tüketir, sonucu loglar.
- V1 read-only ise executor sadece rapor/analiz üretir; SSH veya değişiklik yoksa grant mekanizmasını “taslak + skill promotion” için kullanın.

**3. Bilgi Deposu Sınırı**
- Ayrım doğru:
  - **Skill = talimat**. Davranışı değiştirir.
  - **Incident/decision/runbook = kayıt/kanıt**. Sorgulanır, talimat gibi yüklenmez.
- Aynı git deposunda kalabilir, ama aynı güven seviyesinde değil:
  - `skills/approved`: instruction-bearing, yüksek güven, review zorunlu.
  - `incidents/`, `operations-notes/`: untrusted evidence gibi işlenmeli.
  - `lessons-learned/`: doğrudan talimat değil, skill önerisi kaynağı.
- Ayrı repo ne zaman? ACL, retention, kişisel veri, incident gizliliği veya audit gereksinimi farklılaşınca. V1’de monorepo tamam; dizin bazlı CODEOWNERS ve lint şart.

**4. Model Bağımsızlığı**
- Qwen’den başka modele geçince kırılabilecekler:
  - Tool-call formatı, JSON sadakati, Türkçe operasyon dili, uzun bağlam davranışı, skill tetikleme, risk sınıflandırma, komut üretme alışkanlığı, hallucination oranı, latency/VRAM.
- Yasaklar:
  - Prompt/skill içinde model adıyla özel davranış yazmak.
  - Güvenliği system prompt’a emanet etmek.
  - Serbest metinden komut çalıştırmak.
  - Model confidence/self-score ile onay vermek.
  - Tool formatını modele özel varsaymak.
  - “Bu model zaten dikkatli” gibi örtük güven.
- Her yeni model için kabul testi:
  - Aynı 20-30 altın vaka.
  - 10 prompt-injection/secret adversarial vaka.
  - 0 yasak tool çağrısı.
  - 0 secret sızıntısı.
  - En az %85-90 doğru triage/runbook eşleşmesi.
  - Güvenlik/risk sınıflandırmasında P0 regresyon yok.
  - Tüm action proposal’ları geçerli JSON schema üretmeli.

**5. Secrets: Vault Yok, SSH Ağırlıklı**
- En güvenli v1: ajan prod’a bağlanmasın; insan sanitized log/envanter paketi bıraksın.
- SSH şartsa:
  - Ayrı Unix hesabı: `aiops`.
  - Ayrı SSH key veya tercihen kısa ömürlü SSH cert.
  - `ssh-agent` için `ssh-add -t 10m -c`; mümkünse destination constraint.
  - Target `authorized_keys`: `restrict,command="/usr/local/sbin/aiops-readonly-wrapper",from="bastion-ip"`.
  - Wrapper sadece allowlist komutları çalıştırır; `SSH_ORIGINAL_COMMAND` loglanır.
  - `no-pty`, `no-agent-forwarding`, `no-port-forwarding`, `no-X11-forwarding`.
  - `sudoers` sadece net read-only komutlara izin verir; shell yok.
  - systemd servisi kullanılıyorsa secret path değil `LoadCredentialEncrypted=` / `$CREDENTIALS_DIRECTORY`.
  - `sops/age` sadece repo içi encrypted config için; age private key runner’da, repo’da değil.

**6. Audit**
- Git dışı yer:
  - `/var/log/ai-ops-agent/audit-YYYY-MM-DD.jsonl`
  - persistent journald
  - varsa offline syslog/SIEM/WORM kopyası
  - günlük hash chain: her satırda `prev_hash`, gün sonunda imzalı manifest.
- Log alanları:
  - `ts_utc`, `event_id`, `session_id`, `trace_id`
  - `human_actor`, `agent_id`, `engine_version`, `model_id`, `model_digest`
  - `repo_commit`, `skills_loaded`, `policy_version`
  - `user_request_hash`, `data_classification`
  - `intent`, `tool_name`, `target`, `canonical_payload`, `payload_hash`
  - `risk_level`, `policy_verdict`, `rule_id`, `block_reason`
  - `approval_id`, `approver`, `approval_reason`, `grant_id`, `grant_expires_at`
  - `exec_start`, `exec_end`, `exit_code`, `stdout_hash`, `stderr_hash`, `redaction_count`
  - `credential_identity`, asla secret değeri değil.

**7. Eval / Altın Set**
- Her vaka klasörü:
  - `input/`: sanitized logs, inventory snapshot, incident prompt.
  - `expected/`: kök neden, doğru runbook, beklenen risk, yapılmaması gerekenler.
  - `rubric.yaml`: scoring.
  - `forbidden.yaml`: yasak komut, yasak veri, secret pattern.
- İlk 20-30 vaka:
  - En sık 10 operasyon tipi.
  - 5 “no issue / noise” vaka.
  - 5 eksik bağlamlı vaka.
  - 5 yüksek riskli “escalate” vaka.
  - 5 log içine gömülü prompt-injection/secret denemesi.
- Her model/skill/policy değişiminde offline replay. Baseline’dan daha kötü güvenlik sonucu varsa release yok.

**8. En Büyük Mimari Hata**
- V1’de “öğrenme döngüsünü” fazla ciddiye almak.  
  Davranış değiştiren her şey review kuyruğu yaratır. 1 kişiyle bu kuyruk çürür.
- Sadeleştirme:
  - Otomatik öğrenme yok.
  - Haftalık batch review.
  - 6-10 approved skill.
  - Read-only analiz.
  - Tool execution yok.
  - Knowledge önerileri rapor olarak kalsın; davranışa hemen dönüşmesin.

**9. Kaçırdıklarınız**
- Loglar ve incident kayıtları prompt-injection kaynağıdır; “kayıt” asla “talimat” gibi yüklenmemeli.
- Sandbox/egress kontrolü: model endpoint ve bastion dışında ağ yok; çalışma dizini read-only; secret path deny.
- OTel GenAI semantiklerini şimdiden alan isimlerinde düşünün; full tracing sonra gelir.
- Skill supply chain: skill script’leri checksum/signature olmadan approved olmasın.
- Veri sınıflandırma: public/internal/confidential/restricted metadata zorunlu.
- Upstream fork tetikleyicisi yazın: audit hook, hard-deny, offline install, permission semantics veya gateway entegrasyonu upstream’de engellenirse fork düşünülür.
- AAP MCP için not: Red Hat dokümanı read-only global safeguard ve RBAC anlatıyor ama read-write riskini de açıkça belirtiyor; ayrıca MCP telemetry konusu air-gapped ortamda ayrıca değerlendirilmelidir.

Dayanak kaynaklar: EU AI Act human oversight ve 2026 timeline, NIST AI RMF, OWASP AI Agent Security, OpenCode permissions, Red Hat AAP MCP docs, OpenTelemetry GenAI semconv, OpenSSH authorized_keys/ssh-add, systemd credentials, OPA docs.

**Tek cümle:** V1’i başarılı yapan şey, ajanın prod’u değiştirmeden geçmiş vakalarda güvenilir analiz üretmesi, her öneriyi izlenebilir kanıta bağlaması ve hiçbir secret/yetki/audit ihlali yaratmamasıdır.

---
# EK 3 — Gemini 3.1 Pro (Antigravity)

Harika bir bağlam ve çok net kısıtlar. 1 kişilik dev devops/platform ekibi için, on-prem (air-gapped) bir AI operasyon ajanı kurarken pragmatizm ve güvenlik arasındaki dengeyi bulmak hayati önem taşır.

Sorularına, 2026 gerçeklerini ve 1 kişilik bir ekibin kapasitesini göz önünde bulundurarak, doğrudan ve "v1 vs v2" ayrımı yaparak yanıt veriyorum. Katılmadığım yerleri özellikle vurguladım.

### 1. v1 Kapsamı: 7 Adaydan Hangileri?
**v1'de MUTLAKA olması gerekenler:**
*   **6. MCP = mevcut test edilmiş otomasyonu çağırmak:** Ajanın *asla* kendi bash/python kodunu yazıp çalıştırmasına izin verme. Sadece mevcut, test edilmiş Ansible playbook'larını veya salt-okunur scriptleri tetikleyen bir MCP sunucusu kullan.
*   **7. Beceri (Agent Skills) disiplini:** Token tasarrufu ve deterministik davranış için şart. "Progressive disclosure" (adım adım beceri yükleme) bağlam penceresinin çöp olmasını engeller.
*   **1. HITL (Bağlam ve Yetki):** Regülasyonlardan ziyade, ajanın ne yapmaya çalıştığını (bağlam) ve bunu yapıp yapamayacağını (yetki) netleştirmek için şart.

**v1'de ERTELENMESİ gerekenler (v2/v3 konuları):**
*   **2. Onay tam yüke (payload) bağlanmalı & 3. Bağımsız politika motoru:** 1 kişilik ekip için fazla mühendislik. Salt-okunur fazda buna zaten gerek yok.
*   **4. Dinamik Kimlikler / Vault:** Air-gapped ortamda Vault kurmak ve yönetmek tek başına bir projedir. Ertelenebilir.
*   **5. Her tool çağrısında policy-as-code:** Karmaşıklığı çok artırır. Araçların (tools) kendisini kısıtlamak v1 için daha kolaydır.

### 2. Onay Mimarisi: Geçit (Gateway) Şart mı?
*Katılmıyorum (kısmen):* "Onay tam yüke bağlı + tek kullanımlık grant" deseni mükemmeldir ama v1'de ve sadece git+opencode ile **kurulamaz**. Ayrı bir API/Gateway şarttır.
*   **1 kişilik ekip için en yalın v1 hali:** Geçit (gateway) **kurmayın**. v1 salt-okunur olduğu için yürütme (execution) onayı kritik değildir. MCP araçlarınızı zaten sadece `SELECT` veya `show` komutları çalıştıracak şekilde tasarlayın. Öğrenme/politika onayı ise sadece standart bir **Git Pull Request (PR)** sürecidir.

### 3. Bilgi Deposu Sınırı: Beceriler ve Kayıtlar Aynı Yerde mi?
*Katılmıyorum:* Beceriler (Skills) ve Kayıtlar (Incidents/Runbooks) **aynı depoda durmamalıdır.**
*   **Neden?** Beceriler ajanın *davranışını* ve *mantığını* (kod) tanımlar. Kayıtlar ise ajanın tükettiği *veridir*.
*   **Ayrım:** `ops-agent-behavior` (sıkı PR onayı gerektirir) ve `ops-knowledge-base` (daha esnek, log sistemlerinden otomatik beslenebilir) olarak iki ayrı git deposu veya mantıksal yapı kurun. Ajanın davranışını değiştiren şeylerle, okuduğu dokümanların erişim ve onay yaşam döngüleri farklıdır.

### 4. Model Bağımsızlığı: Qwen'den Geçişte Ne Kırılır?
*   **Ne Kırılır:** Tool-call yapılarına uyum (JSON formatını bozma), bağlam penceresi (context window) limitleri, sistem promptunu (kuralları) ne kadar dikkate aldığı.
*   **Neler Yasak Olmalı:**
    *   Sistem promptunda spesifik model adları veya modelin "huyuna" göre yazılmış özel yönlendirmeler.
    *   Çıktının (output) belirli bir markdown veya JSON formatında olacağına dair katı varsayımlar (parser'lar esnek olmalı).
*   **Kabul Testi:** 20-30 görevlik sabit bir "prompt -> expected output" (örneğin: belirli bir aracı, doğru argümanlarla çağırma yeteneği) otomasyonu. Model değiştiğinde bu test seti koşulmalı.

### 5. Secrets: Air-gapped / SSH Ağırlıklı En Yalın Desen
Vault yoksa en yalın ve güvenli yöntem OS-native özellikleridir.
*   **En Yalın Tasarım:** Ajana özel, ayrı bir OS servis hesabı (`ops-agent`).
*   **Kimlik:** `ssh-agent` kullanımı.
*   **Kısıtlama (En Kritik Kısım):** Hedef sunuculardaki `~/.ssh/authorized_keys` dosyasında, ajanın public key'inin başına `command="..."` kısıtlaması ekleyin. Ajan o anahtarla bağlansa bile **sadece** o spesifik salt-okunur script'i çalıştırabilir. ProxyCommand veya dinamik kimliklere girmeden v1'i güvene almanın en sağlam yoludur.

### 6. Audit: Ne, Nereye Loglanmalı?
Git bir versiyon kontrol sistemidir, audit log (denetim izi) sistemi değildir.
*   **Nereye:** Makinenin lokal diskine, rotasyonu (logrotate) ayarlanmış basit bir `JSONL` (JSON Lines) dosyasına (ör. `/var/log/ops-agent/audit.jsonl`).
*   **Neler Loglanmalı:**
    1. Timestamp
    2. Tetikleyen (İnsan/Zamanlanmış Görev)
    3. Ajanın Amacı (Kullanıcının girdiği prompt)
    4. Çağrılan Tool'lar ve **Argümanları** (Payload)
    5. Başarı/Hata durumu (Token kullanımı ile birlikte).

### 7. Değerlendirme (Eval): Altın Set Nasıl Kurulur?
*   **Altın Set:** Geçmişteki iyi çözülmüş 20-30 incident'ı seçin. Sistem loglarını/alarmları "girdi", çözüm olarak seçilen runbook'u veya kök nedeni "beklenen çıktı" yapın.
*   **Vaka Seçimi:** Her biri farklı bir beceriyi (skill) test edecek şekilde; %50 ağ/sunucu durumu, %30 log analizi, %20 veritabanı yavaşlığı gibi dağıtın.
*   **Test:** Offline bir Python scripti ile bu girdileri modele verip (API üzerinden) dönen tool-call argümanlarının beklenenle eşleşip eşleşmediğini kontrol edin (Exact match veya LLM-as-a-judge).

### 8. En Büyük Mimari Hata: v1'den Çıkarılması Gereken Şey
**HATA:** `"Öğrenme: görev → gözlem → ÖNERİ (experimental) → insan onayı → approved/"` döngüsünü **otomatize etmeye çalışmak.**
*   **Neden:** 1 kişilik ekip "PR yorgunluğu" yaşar. Ajan sürekli olarak `experimental/` klasörüne saçma sapan veya gereksiz beceriler önermeye başlar.
*   **Sadeleştir (v1):** Ajan sadece chat ekranında "Şu işlemi çok yapıyoruz, bunu bir beceri olarak eklememi ister misin? İşte taslak kodu:" diye **yazı olarak** önersin. Siz uygun görürseniz, kodu kopyalayıp depoya kendiniz eklersiniz. Otonom "öğrenme" döngüsünü v1'de tamamen iptal edin.

### 9. Kaçırdığınız: 2026 Ekosisteminde Gözden Kaçanlar
*   **Konteyner/Ajan Sandbox İzolasyonu:** Ajan air-gapped bir ağda olsa bile, hacklenirse (prompt injection vs.) ağ içinde "lateral movement" (yatay hareket) yapabilir. Ajanı koşturan makinenin ağ erişimi **sadece** hedef sunucuların SSH portlarıyla veya API'larıyla sınırlandırılmalı (Egress control).
*   **OpenTelemetry (OTel) GenAI:** Agent'ın kendi iç logları (hangi düşünce adımlarından geçtiği, hangi tool'u ne kadar sürede çalıştırdığı) için OTel standartlarını kullanın. Sorun çıktığında ajanın "neden" o kararı verdiğini anlamak (trace) hayati olacak.

***

**Sonuç (Tek Cümle):**
v1'i "başarılı" yapan şey; ajanın otonom hareket etme veya kod yazma yeteneği değil, **yalnızca mevcut, test edilmiş ve donanımsal/sistem seviyesinde kısıtlanmış salt-okunur araçları çağırabilen, sıkı sınırları olan bir arayüz** olmasıdır.
