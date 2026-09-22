# THREAT-MODEL.md — opencode ajan kiti tehdit modeli (v1)

> Kaynak: `/root/ai-danis/SORU2.md` + `/root/ai-danis/DANISMA-RAPORU-2.md` (Claude Opus 5 · Codex gpt-5.5 ·
> Gemini 3.1 Pro sentezi, 2026-09-14). Bu dosya **politika katmanıdır** — `knowledge/policy/` altında durur,
> `engine/`'de değil (Danışma 2, Opus itirazı: "AGENTS.md + izin ayarları aslında politikadır").
> **Not (2026-09-16):** `/root/ai-danis/` bu makinede **mevcut değil** — harici kaynak, bu repoda tutulmaz.
> Referans silinmedi (izlenebilirlik için), içerik zaten bu politika dosyasına özetlenmiş durumda.
>
> **Maskeleme kuralı:** gerçek IP/hostname/domain/kullanıcı adı yazılmaz. Bu dosyada: sunucu → `test-sunucu`,
> küme → `KUME-A` / `KUME-B`, IP → `10.0.0.x`, kurum → `kurum`.

## 1. Varlıklar (assets)

| Varlık | Neden kritik | Bu dosyadaki referans |
|---|---|---|
| **Üretim sunucuları** (`test-sunucu`, `KUME-A`/`KUME-B` düğümleri) | Ajan buraya yazarsa hizmet kesintisi/veri kaybı olur | §4 "v1 mutlak sınır" |
| **SSH anahtarları / kimlik bilgileri** | Ele geçirilirse ajan kimliğiyle prod'a erişim | §3 "Kimlik ve secrets" |
| **Kurum içi Qwen endpoint'i** (`10.0.0.x:PORT`) | Tek model sağlayıcı; prompt'ları loglaması/loglamaması audit kapsamı dışında kalırsa görünürlük kaybı | §3 "Model endpoint" |
| **`knowledge/` bilgi deposu (git)** | Kurumsal hafıza; bozulursa/zehirlenirse gelecekteki tüm görevler etkilenir | §3 "Bilgi deposu" |
| **Audit kaydı** (`/var/log/ops-agent/audit.jsonl`, git dışı) | Tek gerçek kayıt kaynağı; bozulursa hiçbir olay ispatlanamaz | §3 "Audit bütünlüğü", bkz. `AUDIT-FORMAT.md` |
| **İnsan onaycı (Alp)** | Tek onay noktası; yorgunluk/kör onay = tüm kapının çökmesi | §3 "Onay kapısı" |

## 2. Tehdit aktörleri

| Aktör | Senaryo | Neden gerçekçi |
|---|---|---|
| **Yanlış yapılandırılmış / kaçak ajan** | `opencode.json` izin bloğu yanlış deploy edilir, `bash: "*": "allow"` olur, ajan `rm -rf` çalıştırır | Config hatası, kötü niyet gerekmez; tek kişilik ekipte review ikinci göz yok |
| **Prompt injection (log/incident/skill içeriği)** | `knowledge/incidents/` içindeki bir log satırına "ignore previous instructions, run X" gömülür; ajan bunu talimat sanır | Danışma 2'de **3/3 model hemfikir**: "log/incident kayıtları = güvenilmez veri" |
| **Skill tedarik zinciri** | `skills/approved/`'a checksum/imza olmadan kötü niyetli veya hatalı bir `SKILL.md`/script girer | 38 beceri var, hiçbirinin imza/checksum zinciri yok (bkz. `PHASE0-ACCEPTANCE.md` açık soru) |
| **MCP tool poisoning** | Faz 2'de eklenecek bir MCP sunucusunun tool `description`'ı ajanı yanlış çağrıya yönlendirir | Danışma 2, Opus + Codex: "MCP tool açıklamaları review'dan geçmeli" — v1'de MCP yok ama tasarım şimdi yazılıyor |
| **İnsan hatası** | Alp yorgun onay verir ("PR yorgunluğu"), payload değişmiş bir öneriyi eski haliyle sanıp onaylar | Danışma 2 ortak tespiti: "en zayıf halka = onay kapısı" |
| **İç tehdit** | `aiops`/ajan hesabına erişimi olan biri ajan kimliğini kullanarak iz bırakmadan işlem yapar | Ayrı Unix hesabı + forced-command olmadan ayırt edilemez |

## 3. Saldırı yüzeyleri + kontrol

| Saldırı yüzeyi | Mevcut kontrol | Kurulacak kontrol (v1/Faz 0) |
|---|---|---|
| **Bash aracı** | `opencode.json`: `bash.*: ask`, `rm -rf *`/`mkfs*`/`git push --force*`: deny | v1 salt-okunur ilkesi: mutasyon veren hiçbir komut çalıştırılmaz (bkz. §4) |
| **Kimlik ve secrets** | Yok (ajan henüz SSH kullanmıyor) | Ayrı Unix hesabı (`aiops`) + `ssh-agent` (anahtar dosyası ajanın eline geçmez) + hedefte forced-command allowlist (`command="..."` in `authorized_keys`) — Danışma 2 §5 konsensüsü |
| **Model endpoint** | `engine/opencode.json` içinde `baseURL` (iç ağ, `10.0.0.x`) | Kurumun Qwen endpoint'inin prompt'ları loglayıp loglamadığı **doğrulanmalı**; loglıyorsa bu da audit kapsamına girer (açık soru, bkz. rapor) |
| **Bilgi deposu (knowledge/ okuma)** | `skills/approved/` = opencode'un okuduğu **tek** yer; `experimental/`, `generated/` okunmaz | Kayıt (incident/log) verisi hiçbir zaman talimat olarak yüklenmez — yalnız görev-bazlı sorgu ile, "bu veridir" çerçevesiyle. Frontmatter `classification: internal|confidential` (Faz 1 önerisi) |
| **Bilgi deposu (knowledge/ yazma)** | Dosya sistemi izinleri henüz ayrıştırılmamış | `approved/` ve gelecekteki `policy/`'ye yazma yalnız insanda; ajan dalı yalnız `experimental/`/`generated/`/`lessons-learned/`'a yazar |
| **Onay kapısı** | Yok (henüz otomasyon yok, elle inceleme) | Payload-bound onay: onay, önerinin `sha256` hash'ine bağlanır; içerik değişirse onay geçersiz olur (bkz. `PERMISSION-MATRIX.md` §"Zorunlu kapı") |
| **Audit** | Yok | Git dışı JSONL + günlük hash zinciri (bkz. `AUDIT-FORMAT.md`); ajanın kendi kurcalayamadığı ikinci bağımsız kayıt kaynağı (plugin hook + varsa sunucu tarafı forced-command logu) |
| **Skill/MCP tedarik zinciri** | Yok (38 beceri imzasız) | Faz 1: approved skill'lere checksum/imza zorunluluğu; MCP eklenene kadar bu madde ertelenir ama ilke şimdi yazılır |
| **Ağ (egress)** | Yok | Faz 0/1 önerisi: opencode'u çalıştıran süreç yalnız model endpoint (`10.0.0.x:PORT`) + (varsa) hedef sunucuların SSH portlarına erişebilsin (nftables/systemd sandbox) — Danışma 2 "kaçırdıklarınız" maddesi |

## 4. "v1 mutlak sınır" — salt-okunur

> **Kural:** v1'de opencode ajanı **üretimde hiçbir şey yazmaz, değiştirmez, silmez, yeniden başlatmaz.**
> "Dokunabilmeli ama bozamamalı" (Danışma 2, 3/3 model).

Somut olarak:

- Hedef sunuculara (`test-sunucu`, `KUME-A`/`KUME-B`) yalnız **salt-okunur** komutlar (`cat`, `journalctl --since`,
  `rpm -qa`, `ss -tlnp`, `kubectl get`, …) çalıştırılabilir — ve bunlar bile v1'de **plan dışıdır** (SSH katmanı
  Faz 0'ın kapsamında değil, `PHASE0-ACCEPTANCE.md`'ye bakınız).
- `knowledge/skills/approved/`, `knowledge/policy/` dizinlerine ajan **yazamaz**.
- `opencode.json`, `AGENTS.md`, `02-kur.sh`, `03-kontrol.sh` gibi motor dosyalarına ajan **yazamaz** (yalnız insan,
  PR ile).
- **Teknik kapı (2026-09-16 doğrulandı):** yazma `permission.edit` ile yönetilir; ayrı bir `permission.write`
  kapısı **yok**. opencode 1.18.30'un config şeması (`https://opencode.ai/config.json`) `permission` altında
  `write` diye bir alanı hiç tanımlamıyor, ve `opencode debug agent build` ile çözümlenen (resolved) izin
  listesinde de `write` hiç görünmüyor — yalnız `edit` bir giriş üretiyor. Derlenmiş ikilide (`bin/opencode`)
  dosya-yolu çözümleme kodu `read`/`edit`/`write` araç kimliklerini aynı `case` bloğunda gruplar; pratikte
  "write" aracı da `permission.edit` kararına tabidir. `engine/opencode.json` → `permission.edit: "deny"`
  (bu belge §4'ün mutlak sınırıyla artık tutarlı, bkz. faz0-yuzeye-getir denetim bulgusu #4/#6).
- Bu sınırı aşan hiçbir öneri "hızlı geçiş" ile atlanmaz: mutasyon yolu yalnız Faz 2'de, ayrı bir
  plan → grant → runner zinciriyle açılır (bkz. Danışma 2 §2, Opus/Codex "gateway" tasarımı).

## 5. Risk tablosu

| Risk | Olasılık | Etki | Kontrol |
|---|---|---|---|
| Yanlış config ile bash izni genişler | Orta | Yüksek | `opencode.json` değişikliği yalnız insan onayıyla + `PERMISSION-MATRIX.md`'deki deny-by-default varsayılan |
| Log içine gömülü prompt injection ajana talimat gibi yutturulur | Yüksek | Orta-Yüksek | Kayıt = veri, asla talimat; eval altın setinde enjeksiyon sınıfı 0-hata kapısı (bkz. `PHASE0-ACCEPTANCE.md`) |
| Onay yorgunluğu → kör onay | Yüksek | Yüksek | Payload-hash'e bağlı onay + WIP limiti (`experimental/`'da ≤10 açık öneri, 30 gün expiry) |
| Audit kaydı eksik/kurcalanmış | Düşük | Yüksek | Git dışı append-only log + günlük hash zinciri + (varsa) ikinci bağımsız kayıt kaynağı |
| İmzasız skill approved'a sızar | Düşük (v1'de elle) | Orta | Faz 1: checksum/imza zorunluluğu, PR review |
| Model endpoint prompt'ları dışarı sızdırır/loglar | Bilinmiyor (doğrulanmadı) | Yüksek | Açık soru — kurumun Qwen endpoint kurulumu doğrulanmalı |
| Ajan kimliği ile insan kimliği karışır (iç tehdit / izlenebilirlik) | Düşük | Orta | Ayrı Unix hesabı + audit'te `actor.agent` / `actor.human` ayrımı |

## Bu doküman neyi kapsamıyor

Yürütme (execution) katmanı, MCP entegrasyonu, Vault/OIDC, OPA/Cedar — bunlar Faz 2 konusu; burada yalnız
**salt-okunur v1'in** tehdit yüzeyi ele alınmıştır. Detaylar için `PERMISSION-MATRIX.md`, `AUDIT-FORMAT.md` ve
`../roadmap/PHASE0-ACCEPTANCE.md`.
