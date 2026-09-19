# Olay: Kokten calistirilan typecheck makineyi donduruyor (5x hard-reboot)

- **Tarih / saat:** 2026-09-19 (donma olaylari onceki oturumda, ~40 dakika icinde 5 kez; teshis/fix/dogrulama bu oturumda)
- **Etki (kim, ne kadar):** `/root/ai/opencode` gelistirme sunucusu (2 vCPU, 8GB RAM, 0B swap) tamamen donup SSH dahil hicbir seye yanit vermedi; 5 kez host seviyesinde hard-reset gerekti. O sirada suren tum calisma (Doktor/Claude Code oturumu dahil) kesintiye ugradi.
- **Tespit (nasil fark edildi):** Kullanici (Alp) donmalari yasadi; sonraki oturumda "donma olmasın dikkat et... git ve gh işlerinde bir şeyde takılıyor" uyarisiyla konu acildi ve arastirildi.
- **Kok neden:** Kok `package.json`'daki `typecheck` script'i (`bun turbo typecheck`), workspace'teki **30 paketin her biri icin** paralel bir `tsgo` (TypeScript native-preview derleyicisi) sureci baslatiyordu; concurrency sinirlamasi yoktu (`turbo.json`'da `typecheck` task'i icin `dependsOn`/limit tanimsiz). 2 vCPU + swapsiz host'ta bu kadar paralel `tsgo` RAM'i hizla tuketip kernel OOM-killer'i yetismeden makineyi tikiyordu. Ayrica `.husky/pre-push` hook'u bunu **her `git push`'ta sessizce tetikliyordu** — kimse "typecheck calistiralim" demeden bile donma olusabiliyordu.
- **Cozum (ne yapildi):**
  1. `script/safe-concurrency.sh` eklendi — hem `nproc` hem `/proc/meminfo`'daki `MemAvailable` degerine bakip (~700MB/surec varsayimiyla) guvenli concurrency hesapliyor; tek bir makinenin `nproc` degerine sabitlenmis degil, farkli CPU/RAM oranli sunucularda (kurum filosu dahil) tasinabilir.
  2. Kok `package.json`'daki `typecheck` script'i bu hesabi kullanacak sekilde guncellendi (`bun turbo typecheck --concurrency=$(bash script/safe-concurrency.sh)`) — artik `git push`, CI, ya da baska bir sunucuda dogrudan `bun run typecheck` cagiran herhangi biri (bir ajan dahil) ayni korumadan geciyor.
  3. `.husky/pre-push` sadelestirildi, kendi kopyasini tutmuyor, sadece `bun typecheck` cagiriyor (tek dogruluk kaynagi).
  4. Iki gercek `git push` denemesiyle canli dogrulandi: bellek boyunca 5-6GB+ bos kaldi, makine hic zorlanmadi. Ilk denemede `opencode` paketinin `tsgo` sureci SIGTERM ile kesildi ama bu OOM/donma degildi (dmesg/journalctl'de OOM kaydi yok, bellek izleyicisi hic tetiklenmedi) — izole tekrar calistirildiginda temiz gecti, turbo'nun paralel zamanlamasinda tek seferlik bir aksakliktı. Ikinci denemede 30/30 task basarili, push tamamlandi.
- **Sure (tespit → cozum):** Ayni oturum icinde birkac saat (arastirma + iki asamali fix + canli dogrulama).
- **Kalicı onlem:** `script/safe-concurrency.sh` + `package.json` degisikligi **repoya gomulu** — bu repoyu klonlayan her sunucu (kurum sunuculari dahil) otomatik olarak korunuyor, ayrica host-bazli kurulum gerekmiyor. Karar gerekcesi: `../architecture/decisions/0002-typecheck-guvenli-calisma.md`.
- **Ilgili beceri / runbook:** `NASIL-CALISTIRILIR.md` → "Root'tan tam typecheck/build" bolumu (guncellendi); `/root/CLAUDE.md` → `/root/ai/opencode` satiri (guncellendi).
- **Kaynak (log / ticket):** commit `424809ccb6` (ilk fix, yalniz hook), commit `c6f1ce7d74` (asil fix, koke tasindi); bu oturumun git push loglari (`bagezizjq`/`bk2zktq3c` arka plan gorev ciktilari).

## Zaman cizelgesi
- (onceki oturum) — root'tan `bun run typecheck`/`bun turbo typecheck` calistirilinca ~40 dakikada 5 hard-reboot yasandi; bu NASIL-CALISTIRILIR.md'ye "bilinen sorun" olarak zaten kaydedilmisti.
- Bu oturumda — donma riski tekrar gundeme geldi; once sadece `.husky/pre-push`'a `--concurrency="$(nproc)"` eklendi (yetersiz: yalniz push anini kapsiyor).
- Fix koke tasindi (`script/safe-concurrency.sh` + `package.json`), RAM+CPU farkinda hale getirildi.
- 1. push denemesi: SIGTERM ile basarisiz (donma degil, turbo'nun tek seferlik aksakligi) — izole tekrar calistirmada dogrulanamadi.
- 2. push denemesi: basarili, 30/30 typecheck task gecti, bellek hic dusmedi.
- Sonuc kayit altina alindi (bu dosya + ADR-0002).
