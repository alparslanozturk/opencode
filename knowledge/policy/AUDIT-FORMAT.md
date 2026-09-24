# AUDIT-FORMAT.md — çalışma-zamanı audit kaydı formatı (v1)

> Kaynak: `/root/ai-danis/SORU2.md` + `/root/ai-danis/DANISMA-RAPORU-2.md`, 3/3 model konsensüsü:
> "git yetmez, çalışma-zamanı kaydı gerek." OTel GenAI semantik konvansiyonlarından **isim** alınır, SDK değil
> (Faz 2'de collector eklenmesi kolaylaşsın diye).
> **Not (2026-09-16):** `/root/ai-danis/` bu makinede **mevcut değil** — harici kaynak, bu repoda tutulmaz.
> Referans silinmedi (izlenebilirlik için), içerik zaten bu politika dosyasına özetlenmiş durumda.
>
> Maskeleme: sunucu → `test-sunucu`, küme → `KUME-A`/`KUME-B`, IP → `10.0.0.x`, kurum → `kurum`.

## 1. Konum

- **Dosya:** `/var/log/ops-agent/audit.jsonl` — **repoda DEĞİL**, git dışı. (`knowledge/` yalnız onaylı bilgiyi
  tutar; audit ham çalışma-zamanı verisidir, farklı yaşam döngüsü ve saklama süresi vardır.)
- **Rotasyon:** `logrotate`, günlük, `compress`, 12 ay saklama (Danışma 2 önerisi). Örnek `logrotate.d` girdisi
  (uygulama Faz 0 kapsamında, bu dosyada yalnız örnek):
  ```
  /var/log/ops-agent/audit.jsonl {
      daily
      rotate 365
      compress
      delaycompress
      missingok
      notifempty
      create 0640 aiops aiops
      postrotate
          # gün sonu manifestini imzala (bkz. §3), sonra döndür
      endscript
  }
  ```
- **Yazan taraf:** opencode plugin hook (`tool.execute.before`/`after`, `engine/plugins/` — Faz 0'ın ilk
  içeriği). Mümkünse **ikinci bağımsız kaynak**: SSH forced-command wrapper'ının kendi logu (ajan bu ikinciyi
  kurcalayamaz, çünkü sunucu tarafında ayrı bir hesaptadır).

## 2. JSONL şeması

OTel GenAI semantik konvansiyonuyla uyumlu isimler (`gen_ai.*`) + operasyona özgü alanlar:

| Alan | Tip | Açıklama |
|---|---|---|
| `event_id` | string (uuid) | Kayıt kimliği |
| `timestamp` | string (ISO 8601, UTC) | Olay zamanı |
| `session_id` | string | opencode oturum kimliği |
| `task_id` | string | Görev/istek kimliği (varsa) |
| `record_type` | string | `tool_call` (varsayılan) \| `redacted` (T13/A34 — bkz. §6) |
| `actor.agent` | string | Ajan kimliği, örn. `aiops@test-sunucu` |
| `actor.human` | string | İşlemi tetikleyen insan (varsa; zamanlanmış görevse `scheduler`) |
| `gen_ai.request.model` | string | Model kimliği, örn. `kurum/qwen3.6-35b-a3b` |
| `gen_ai.request.model_digest` | string | Model ağırlık hash'i (varsa) — `engine/lock.yaml` ile eşleşmeli (not, 2026-09-16: `engine/lock.yaml` **Faz 1'de açılacak** — bu koşumda bilinçli olarak yok) |
| `engine.version` | string | opencode sürümü (referans: 1.18.30) |
| `engine.config_hash` | string | `opencode.json` içerik hash'i |
| `policy.hash` | string | `knowledge/policy/` altındaki ilgili dosyanın commit/hash'i |
| `skills_loaded` | array[{name, commit}] | O görevde yüklenen beceriler |
| `tool` | string | Çağrılan araç adı (`bash`, `read`, `edit`, `skill`, …) |
| `args_hash` | string (sha256) | Araca verilen argümanların hash'i (ham argüman değil — bkz. §4) |
| `target` | string | Etkilenen dosya/host/kaynak (maskelenmiş: `test-sunucu`, `10.0.0.x`) |
| `result_status` | string | `ok` \| `error` \| `denied` \| `asked` |
| `policy_decision` | string | `allow` \| `ask` \| `deny` (bkz. `PERMISSION-MATRIX.md`) |
| `latency_ms` | number | Araç çağrısı süresi |
| `gen_ai.usage.input_tokens` | number | Girdi token sayısı |
| `gen_ai.usage.output_tokens` | number | Çıktı token sayısı |
| `output_sha256` | string | Araç çıktısının hash'i (tam içerik ayrı blob dizininde tutulur, bu dosyada yalnız hash + ilk satırlar) |
| `prev_hash` | string (sha256) | Bir önceki kayıt satırının hash'i (bkz. §3) |

## 3. Hash zinciri

Her satır, kendinden önceki satırın hash'ini taşır (`prev_hash`); ilk kayıt `prev_hash: "0"*64`. Böylece
tek bir satırın silinmesi/değiştirilmesi zincirin geri kalanını bozar ve fark edilir.

Gün sonunda:
1. O günün tüm `audit-YYYY-MM-DD.jsonl` satırlarının birleşik hash'i alınır.
2. Bir **manifest** dosyası (`audit-YYYY-MM-DD.manifest`) yazılır: `{date, line_count, final_hash, prev_manifest_hash}`.
3. Manifest, ajanın erişemediği bir anahtarla imzalanır (`ssh-keygen -Y sign`, offline, ekstra araç gerektirmez —
   Danışma 2, Opus önerisi).

Örnek manifest:
```json
{"date": "2026-09-14", "line_count": 214, "final_hash": "e3b0c4...", "prev_manifest_hash": "9f86d0..."}
```

## 4. Örnek kayıtlar (gerçekçi, maskelenmiş)

```json
{"event_id":"a1b2c3d4-0001","timestamp":"2026-09-14T09:12:03Z","session_id":"ses_7f2a","task_id":"tsk_001","actor":{"agent":"aiops@test-sunucu","human":"alp"},"gen_ai":{"request":{"model":"kurum/qwen3.6-35b-a3b","model_digest":"sha256:7c9e..."},"usage":{"input_tokens":4210,"output_tokens":312}},"engine":{"version":"1.18.30","config_hash":"sha256:1a2b..."},"policy":{"hash":"sha256:5d6e..."},"skills_loaded":[{"name":"filo-durum-kontrolu","commit":"091f7ee"}],"tool":"read","args_hash":"sha256:aa11...","target":"knowledge/operations-notes/envanter-kaynaklari.md","result_status":"ok","policy_decision":"allow","latency_ms":42,"output_sha256":"sha256:bb22...","prev_hash":"0000000000000000000000000000000000000000000000000000000000000000"}
{"event_id":"a1b2c3d4-0002","timestamp":"2026-09-14T09:12:08Z","session_id":"ses_7f2a","task_id":"tsk_001","actor":{"agent":"aiops@test-sunucu","human":"alp"},"gen_ai":{"request":{"model":"kurum/qwen3.6-35b-a3b","model_digest":"sha256:7c9e..."},"usage":{"input_tokens":1180,"output_tokens":95}},"engine":{"version":"1.18.30","config_hash":"sha256:1a2b..."},"policy":{"hash":"sha256:5d6e..."},"skills_loaded":[{"name":"filo-durum-kontrolu","commit":"091f7ee"}],"tool":"bash","args_hash":"sha256:cc33...","target":"KUME-A (journalctl --since -1h)","result_status":"denied","policy_decision":"ask","latency_ms":3,"output_sha256":null,"prev_hash":"e8f9a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d"}
{"event_id":"a1b2c3d4-0003","timestamp":"2026-09-14T09:15:41Z","session_id":"ses_7f2a","task_id":"tsk_002","actor":{"agent":"aiops@test-sunucu","human":"alp"},"gen_ai":{"request":{"model":"kurum/qwen3.6-35b-a3b","model_digest":"sha256:7c9e..."},"usage":{"input_tokens":2044,"output_tokens":410}},"engine":{"version":"1.18.30","config_hash":"sha256:1a2b..."},"policy":{"hash":"sha256:5d6e..."},"skills_loaded":[],"tool":"write","args_hash":"sha256:dd44...","target":"knowledge/lessons-learned/2026-09-14-envanter-tutarsizligi.yaml","result_status":"ok","policy_decision":"allow","latency_ms":18,"output_sha256":"sha256:ee55...","prev_hash":"f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8"}
```

> **v1 sınırı (2026-09-16, T13'te kısmen kapandı — 2026-09-23):** ikinci örnek kayıt (`result_status:"denied"`,
> `policy_decision:"ask"`) **hedef tasarımı** gösterir, ikisi de gerçek engine `permission.ask` (izin
> sorulduğunda) / `permission.replied` hook'undan geliyor gibi okunabilir — ama bu hook'lar opencode plugin
> API'sinde tanımlı olsa da motor tarafından **hâlâ hiç tetiklenmiyor** (bkz. `ONERI-LISTESI.md` C13). T13
> bunu farklı bir yoldan kapattı: `engine/plugins/audit-log.ts`'in KENDİ `tool.execute.before`/`after` kapısı
> artık `result_status:"asked"`/`policy_decision:"ask"` (arama kapsamı, §6) ve `result_status:"denied"`/
> `policy_decision:"deny"` (`OPS_AGENT_KAPI=ENFORCE`, denylist+arama kapsamı) üretiyor — engine hook'undan
> değil, plugin'in kendi throw/gözlem mekanizmasından. Gerçek engine `permission.ask`/`permission.replied`
> bağlanması hâlâ Faz 1 adayı (bkz. `PHASE0-ACCEPTANCE.md`).

## 5. Neyin loglanmayacağı

- **Secret değerleri** (API anahtarı, SSH private key, parola) — `args_hash` her zaman argümanın kendisi değil
  hash'idir; eğer argüman secret içeriyorsa hash alınmadan önce maskelenir. **T13/A34 (2026-09-23) —
  kodlandı:** aynı maskeleme artık `target`/`args_hash`'in yanı sıra **tool çıktısının kendisine** de
  uygulanıyor (`redactSecrets()`, §6), değer `[REDACTED:<tür>]` ile değiştirilir, asla ham hâliyle
  yazılmaz/dönmez.
- **Kişisel veri** (kullanıcı adı, e-posta, kişi adı içeren log satırları) — audit'e girmeden önce görev
  çıktısındaki PII deseni (regex: e-posta, TC kimlik benzeri sayı dizisi, IP) `***` ile kırpılır.
- **Gerçek IP/hostname/domain** — bu depo dışına (loga) da maskelenerek yazılır; aynı kural (`test-sunucu`,
  `10.0.0.x`) audit'te de geçerlidir, aksi halde repoya girmeyen ama diskte duran bir dosyada gerçek envanter
  detayları birikir.
- **Model çıktısının tamamı** — **hedef tasarım:** yalnız `output_sha256` + ilk N satır (örn. 50) audit'e
  yazılır; tam çıktı ayrı, audit'ten daha kısa saklama süreli bir blob dizininde tutulur (audit satırı şişmesin,
  ama izlenebilirlik kaybolmasın). **v1 sınırı (2026-09-16):** `engine/plugins/audit-log.ts` bu tasarımı henüz
  kodlamıyor — bugün yalnız `output_sha256` yazılıyor (satır yok, blob dizini yok). Faz 1/2'ye ertelendi;
  blob dizini konumu/saklama süresi ve "ilk N satır" seçimi ayrı bir karar gerektiriyor (Alp onayı).
- **Model endpoint'in kendi logları** — kurumun Qwen endpoint'i prompt'ları ayrıca loglayabilir; bu, bu dosyanın
  kapsamı dışıdır ama `THREAT-MODEL.md`'de açık soru olarak işaretlenmiştir.

## 6. `redacted` kaydı ve arama-kapsamı `asked` kaydı (T13/A34+A35)

Kaynak: 2026-09-23 15:40 saha ekranı (A34+A35) — bkz. `PERMISSION-MATRIX.md` §5 (tam kural). Bu bölüm
yalnız audit **şemasını** belgeler.

**`record_type:"redacted"`** — `redactSecrets()` (gizli desen) veya denylist tam-redaksiyonu tetiklendiğinde
normal `tool_call` kaydına **ek olarak** yazılır, aynı `prev_hash` zincirine girer:

```json
{"event_id":"...","record_type":"redacted","tool":"read","target":"notes.txt :: password","result_status":"ok","policy_decision":"allow","output_sha256":null, "...": "diğer alanlar §2 ile aynı"}
```

`target` alanı `"<maskelenmiş hedef> :: <desen türleri, virgülle>"` biçimindedir (örn.
`"notes.txt :: password"`, `"/<envanter-dosyası> :: denylist:hosts*"`) — **değer hiçbir yerde yok**.

**Arama kapsamı `asked` kaydı** — `read`/`glob`/`grep`/`list` proje dizini dışına çıkarsa ya da 2 dakikalık
pencerede 4'ten fazla farklı dizine dokunulursa (burst'teki **ilk** çağrı), normal `tool_call` kaydı YERİNE
şu satır yazılır:

```json
{"event_id":"...","record_type":"tool_call","tool":"glob","target":"<dizin-yer-tutucu> (3 dosya)","result_status":"asked","policy_decision":"ask","output_sha256":"sha256:...", "...": "diğer alanlar §2 ile aynı"}
```

`target` yalnız dizin + eşleşen dosya **sayısı** taşır — dosya adları/içerik hiçbir zaman audit'e yazılmaz.
Aynı burst penceresindeki sonraki çağrılar bu kaydı **tekrar üretmez** (tek onaya bağlama, bkz.
`PERMISSION-MATRIX.md` §5).

## Bilinen sınırlar (v1, 2026-09-16 — kodla karşılaştırılarak doğrulandı)

- **`before` olayı kalıcı değil:** `tool.execute.before` yalnız bellek-içi bir `pending` Map'e yazar, diske
  hiçbir şey yazılmaz. Süreç `before`↔`after` arasında çökerse (ör. OOM kill, `kill -9`) o araç çağrısı için
  **hiçbir audit satırı oluşmaz** — zincirde sessiz bir boşluk, ama kopukluk da değil (bir sonraki satırın
  `prev_hash`'i hâlâ tutarlı okunur, kayıp fark edilmez). `session.idle` olayı (aşağıya bak) yalnız süreç
  **çökmeyen** ama yanıtsız kalan çağrıları (ör. izin isteği kullanıcıya iletilip session boşa düşen durumlar)
  yakalar; çökme senaryosunu yakalamaz. Kalıcı `before` yazımı (iki satır: `before`+`after`, ya da satır içi
  güncelleme) hash-zinciri tasarımını değiştirir (bugün "bir tamamlanmış çağrı = bir satır" varsayımı var) —
  bilinçli olarak Faz 1'e ertelendi, burada dokümante edildi.
- **`session.idle` görev sınırı değil, yaklaşıklığıdır:** opencode plugin API'sinde ayrı bir "görev bitti" hook'u
  yok (`task_id` bu yüzden kodda hep `null`). `skills_loaded` sıfırlaması ve stale-pending temizliği
  `session.idle` olayına bağlandı (tek oturumlu etkileşimli akışta pratik bir görev-sınırı yaklaşıklığı); arka
  arkaya kuyruklanan otomasyon/batch akışlarında session hiç idle olmayabilir, bu durumda reset gecikir.
- **Audit yazımı fail-open:** `tool.execute.after` hook'u araç zaten çalıştıktan SONRA tetiklenir; plugin'in
  aracı geri alacak/engelleyecek bir yolu yok, dolayısıyla "fail-closed" teknik olarak mümkün değil. Yazım/dizin
  hatası şimdi **görünür** (`console.error`, önceden dizin hatası sessizce yutuluyordu) ama ajan/görev durmaz.
- **`event`/`session.idle` düzeltmesi canlı doğrulanmadı:** üst seviye `"session.idle"` hook adının hiç
  çağrılmadığı, doğru yolun genel `event` hook'u + `event.type === "session.idle"` filtresi olduğu **statik
  analiz + mock smoke-test** ile kanıtlandı (derlenmiş ikilideki `trigger("...")` string tablosu + elle
  tetiklenen `PluginInput` mock'u) — gerçek bir opencode oturumunda `session.idle` olayının bu şekilde
  geldiği (ve olayın gerçekten üretildiği/sıklığı) **canlı olarak test edilmedi**. Kurum ucu erişilebilir
  olduğunda ilk gerçek görevde doğrulanmalı.

## Bu doküman neyi kapsamıyor

journald/systemd-journal-remote entegrasyonu, WORM/SIEM kopyası, OTel collector kurulumu — Faz 2 konusu.
v1'de tek makine + append-only dizin (`chattr +a`) + günlük hash zinciri yeterlidir.
