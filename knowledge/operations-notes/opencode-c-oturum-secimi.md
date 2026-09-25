# `opencode -c` oturum seçimi incelemesi (A84 / T21)

**Karar: bizim paketteki bir hata (kod bug'ı), kullanım hatası değil.** Aşağıda üretilebilir
kanıt var; düzeltme bu turun kapsamında değil — **ayrı iş (T22) olarak açılmalı**.

## Gözlem
Kurulu binary (`/root/.opencode/bin/opencode`, paket 1.18.32) ile `opencode -c` en az 2 farklı
dizinde (boş proje ve `/root/ai/opencode`, ikisinde de sıfır kayıtlı oturum) çalıştırıldığında
TUI birkaç saniye içinde çöküyor, `Error: Unexpected server error... (ref: err_xxxx)` yazıp
**shell'e geri düşüyor** — sahadaki "komut shell'e düştü" bulgusuyla birebir örtüşüyor.
Log (`~/.local/share/opencode/log/opencode.log`) kök nedeni gösteriyor:
`Error: Expected a string starting with "ses", got "dummy"`.

## Kök neden (kaynak: dosya:satır)
- `packages/tui/src/app.tsx:283-294` — `--continue` verildiğinde `RouteProvider`'a **gerçek
  oturum ID'si beklenmeden** placeholder `{type:"session", sessionID:"dummy"}` veriliyor
  (yorum: "so we can navigate at partial" hızlı render için).
- `packages/tui/src/app.tsx:503-524` — ayrı bir `createEffect`, sync tamamlanınca en son
  güncellenen kök oturumu bulup (`match`) gerçek route'a geçiyor. **Ama** bu efekt async;
  arada session ekranı `sessionID="dummy"` ile veri çekmeye çalışıyor ve SDK şema doğrulaması
  (`SessionID` — "ses" ön eki zorunlu) bunu reddediyor → kontrolsüz hata → TUI çöküyor.
- `packages/opencode/src/cli/tui/validate-session.ts` — `--session/-s` için CLI, TUI'yi
  **başlatmadan önce** `session.get` ile doğrulama yapıyor (`tui.ts:252-263`). `--continue`
  için böyle bir ön-doğrulama **yok** — asıl fark bu.

## Yeniden üretim (tmux, ~4 deneme)
1. `tmux new-session -d -s oc-c-test -c <boş-dizin>` → `opencode -c` → 3-5 sn içinde
   `Error: Unexpected server error...` + shell'e dönüş. Log'da `ref=err_c7873d7e` /
   `err_e912b781`: *"Expected a string starting with \"ses\", got \"dummy\""*.
2. Aynı sonuç `/root/ai/opencode` içinde (orada da kayıtlı oturum yok) — dizinden bağımsız.
3. `opencode -s ses_faketest1234567890` → **temiz** `Error: Session not found: ...`, exit 1,
   çökme yok. Yani `-s <id>` yolu kendi başına sağlam; sorun yalnız `-c`'nin dummy-placeholder
   mekanizmasında.
4. Gerçek/geçerli `ses_<id>` ile `-s` testi bu turda **yapılmadı** (API sağlayıcı kurulumu
   gerektirirdi, kapsam dışı) — **[DOĞRULANMADI]**: uçtan uca çalıştığı doğrudan gözlemlenmedi.

## Geçici çözüm (saha için)
`opencode -c` yerine `opencode -s <oturum-id>` kullanılmalı. `-c`, ≥1 kayıtlı oturumda da aynı
kod yolundan geçtiği için aynı yarışa teorik olarak açık — bu tur yalnız 0-oturumlu durumda
test edildi, ≥1 oturumlu senaryo **doğrudan gözlemlenmedi** [DOĞRULANMADI].

## Sonraki adım
Düzeltme (`app.tsx`'te dummy placeholder yerine ya `-s` gibi ön-doğrulama ya da session
ekranının "dummy" ID'de veri çekmeyi ertelemesi) **T22** olarak ayrı işte ele alınmalı — bu tur
kod değişikliği yapılmadı.
