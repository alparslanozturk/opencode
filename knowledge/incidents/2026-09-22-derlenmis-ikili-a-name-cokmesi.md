# Olay: derlenmiş ikili `a.name` çökmesi (ilk prompt'ta `Failed to send prompt`)

- **Tarih / saat:** 2026-09-22
- **Etki (kim, ne kadar):** saha (`<saha-makinesi>`, `/root/ai/work/opencode`, `version=1.0.0`,
  `model=kurum/qwen3.6-35b-a3b`) — `oc` hiçbir prompt gönderemiyordu, TUI ilk mesajda çöküyordu.
- **Tespit (nasıl fark edildi):** Alp saha kullanımında TUI'de `Failed to send prompt` /
  `Unexpected server error (ref: err_…)` gördü (refs: `err_67fe64b4`, `err_1fe00c62`, `err_2d6b9e19`).
  Log'da `TypeError: undefined is not an object (evaluating 'a.name')`, stack `SystemPrompt.environment`
  üzerinden geliyordu, `Context 0 tokens` (istek modele hiç gitmemiş).
- **Kök neden:** `packages/opencode/script/build.ts`'deki `Bun.build(...)` çağrısı `splitting: true`
  kullanıyordu. Bu ayar tarayıcı paketlerinde gecikmeli (lazy) chunk yüklemesi içindir — tek dosyalık
  `compile` çıktısında faydası yok, ama dairesel import'ları ayrı chunk'lara bölüp değerlendirme
  sırasını bozuyordu: `core/src/location-services.ts`'deki `locationServices` dizisindeki bir
  `LayerNode` (ör. `Reference.node`), kendi modülü henüz tam başlatılmadan okunduğu için `undefined`
  kalıyordu. `LayerNode.hoist`'in `resolve: (a) => replacementMap.get(a.name) ?? a` fonksiyonu bu
  `undefined` düğümle çağrılınca `a.name` patlıyordu. Kaynak TS sağlamdı — kanıt: `bun run
  packages/opencode/src/index.ts run …` hiç çökmüyordu, istek modele gidiyordu; yalnız derlenmiş
  `bin/opencode` (tek-dosya ikili) çöküyordu.
- **Yerel repro (birebir, ~2 sn):**
  ```bash
  B=<repo>/packages/opencode/dist/opencode-linux-x64/bin/opencode
  rm -rf /tmp/oc-repro; mkdir -p /tmp/oc-repro/home/.config/opencode /tmp/oc-repro/work
  cat > /tmp/oc-repro/home/.config/opencode/opencode.json <<'EOF'
  { "$schema":"https://opencode.ai/config.json", "autoupdate":false, "model":"sahte/sahte-model",
    "provider": { "sahte": { "npm":"@ai-sdk/openai-compatible", "name":"Sahte",
      "options": { "baseURL":"http://127.0.0.1:9/v1", "apiKey":"***" },
      "models": { "sahte-model": { "id":"sahte", "name":"Sahte", "tool_call":true } } } } }
  EOF
  cd /tmp/oc-repro/work && HOME=/tmp/oc-repro/home XDG_CONFIG_HOME=/tmp/oc-repro/home/.config \
    XDG_DATA_HOME=/tmp/oc-repro/home/.local/share OPENCODE_PRINT_LOGS=1 "$B" run "sadece OK yaz" 2>&1 | tail -12
  ```
  İzole `HOME`, boş çalışma dizini, git deposu bile değil, config'te `references` yok — yine de
  tetikleniyor; sahaya özel bir ayar sorunu değildi.
- **Çözüm (ne yapıldı):** `splitting: true` → `splitting: false` (`packages/opencode/script/build.ts`,
  commit `cca807db28`), ürün sürümü **1.0.1**. Kod değişmedi, yalnız derleme bayrağı; `kur.sh`'ın
  derleme adımı zaten bu dosyayı çağırıyor, başka bir değişiklik gerekmedi. Ek savunma katmanı
  (commit `9ad34675c6`, aynı sürüm): bozuk/eski config'teki `reference` girdisi ya da plugin
  dönüşümünden gelen tanımsız düğüm artık `SystemPrompt.environment`/`Agent` tarafından uyarı
  loguyla elenip atlanıyor — aynı çökmeyi başka bir yoldan da imkânsız kılıyor.
- **Süre (tespit → çözüm):** aynı gün içinde (2026-09-22) — repro'dan düzeltmeye ~birkaç saat.
- **Kalıcı önlem:** tek-dosya `bun build --compile` çıktısında `splitting` bir daha açılmayacak;
  gerekçe hem `build.ts` yorumunda hem bu kayıtta duruyor. Geliştirici duman testi eklendi:
  `script/smoke-ikili.sh` (bkz. aşağı) — ikili her derlemeden sonra bu regresyonu saniyeler içinde
  yakalar.
- **İlgili beceri / runbook:** `knowledge/lessons-learned/2026-09-22-derleme-ve-kosu-dersleri.md`,
  `NASIL-CALISTIRILIR.md` → "Sorun giderme" tablosu, `SURUM-NOTLARI.md` → "derlenmiş ikili çöküyordu".
- **Kaynak (log / ticket):** saha toast ref'leri `err_67fe64b4` / `err_1fe00c62` / `err_2d6b9e19`;
  doğrulama koşumu Alp 19:07 → `dizini listele` → `$ ls -la` + cevap, Context 10.1K (%4).

## Zaman çizelgesi
- Saha — Alp ilk prompt'ta `Failed to send prompt` bildirdi, log'da `a.name` `TypeError`'ı görüldü.
- Yerel — izole `HOME` + sahte sağlayıcı ile ~2 saniyede birebir tekrarlandı.
- Kaynaktan (`bun run src/index.ts`) çalıştırılınca çökme **yoktu** → sorun ikili derlemesinde
  izole edildi, kaynak kodda değil.
- Kök neden bulundu: `build.ts` → `splitting: true` → dairesel import sırası bozuluyor.
- Düzeltme: `splitting: false`, sürüm 1.0.1 (commit `cca807db28`); ek guard (commit `9ad34675c6`).
- Doğrulama: 1.0.1 ikilisi aynı repro'da `a.name` **vermiyor**, istek sağlayıcıya gidiyor (sahte
  uçta `AI_APICallError: Cannot connect`, beklenen); saha testinde Context 10.1K (%4) ile normal
  akış.
