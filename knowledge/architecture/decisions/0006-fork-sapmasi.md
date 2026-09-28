# ADR-0006: Fork sapmasi — "fork yok" iddiasi yanlisti, gercek sapma olculdu

- **Tarih:** 2026-09-27
- **Durum:** kabul edildi (Alp onayi, gorev oc-T5b)
- **Baglam:** `ALP-README.md` "Motor (Engine) ve fork kararı" bolumu `https://github.com/alparslanozturk/opencode`
  icin "birebir kopya (0 commit, sapma yok)" diyordu. Bu artik dogru degil: `packages/` altinda upstream'e
  gore fark var ve buyuyecek (ADR-0001 zaten "cekirdege kucuk dokunus" diyordu, "sifir dokunus" degil).
  Yanlis iddia riski: birisi "sifir sapma" varsayimiyla upstream'e kor guncelleme yapar, yamalarimiz
  sessizce kaybolur.
- **Olcum (yontem):** Son vendor senkron commit'i `git log --oneline -- packages/ | grep 'vendor: opencode'`
  ile bulunur (su an `47a024456c`, "vendor: opencode 1.18.30 -> 1.18.32", 2026-09-24). Sapma:
  `git diff 47a024456c..HEAD -- packages/`.
- **Sonuc (2026-09-27 olcumu):**
  - **2 commit:** `445b1f228c` (A22/C15 — TUI pano kopyalama sonucunun durustce bildirilmesi: OSC 52
    "gonderildi" ile gercekten kopyalanma arasindaki farki ayirir) ve `ff1f289160` (A23 — session islemcisi
    otomatik tekrar denemeler tukendiginde kullaniciya "tekrar denemeler bitti, mesaji yeniden gonder" diyor).
  - **14 dosya, +162/-26 satir** (`git diff --shortstat 47a024456c HEAD -- packages/`).
  - Ikisi de commit mesajinda **"upstream-uygun"** isaretli: kucuk, davranis-nötr degil ama upstream'in
    kendi hata/eksiklik siniflandirmasina uyan, PR olarak yukari gonderilebilecek buyuklukte yamalar
    (fork'u "asla yukari cikaramayacagimiz ozel dallanma" degil, "gecici olarak tasidigimiz duzeltme"
    yapan secim — ADR-0003 madde 5'teki "yamayi tasidigimiz surece izlenir" ilkesiyle ayni cizgide).
  - `engine/`, `knowledge/`, `kur.sh` degisiklikleri bu olcumun DISINDA — onlar zaten "kurum katmani",
    upstream'le hic kesismiyor, fork sapmasi sayilmaz.
- **Karar:**
  1. `ALP-README.md`'deki "0 commit, sapma yok" iddiasi kaldirildi; yerine olculebilir sayi + olcum komutu
     yazildi (bkz. `ALP-README.md` → "Motor (Engine) ve fork kararı").
  2. Sapma sayisi **donuk deger olarak degil, komutla** dogrulanir — bu ADR'de "guncel sayi X" yazmiyoruz,
     "olcum komutu Y" yaziyoruz (rakam her yama ile eskir, komut eskimez).
  3. **`upstream` git remote'u eklendi** (`https://github.com/anomalyco/opencode.git`, push URL bilerek
     `DISABLED` — kazayla upstream'e push riski sifirlanir). Bu, `script/upstream-kontrol.sh`'in kendi
     `UPSTREAM_URL` degiskenini degistirmez (ADR-0003'teki "tam remote+merge" reddi hala gecerli); remote
     yalniz `git remote -v` / `git ls-remote upstream` ile elle bakma kolayligi icin.
  4. Surum yukseltme adimlari **zaten var** (`knowledge/runbooks/upstream-guncelleme.md`, ADR-0003) —
     burada tekrar yazilmiyor, yalniz baglanti veriliyor.
  5. Her yeni fork commit'i ya "upstream-uygun" (PR'lanabilir) ya da "kurum-ozel" (asla yukari gitmez)
     olarak commit mesajinda etiketlenir; bu ADR'nin "Sonuc" bolumu her buyuk sapma olcumunde guncellenir.
- **Alternatifler:**
  1. *ALP-README'yi "kucuk fork var" diye belirsiz birakmak.* Reddedildi — belirsiz iddia yanlis iddiadan
     az daha iyi, olculebilir olmali.
  2. *Sapmayi sifirlamak icin yamalari upstream'e PR gonderip geri almak.* Reddedildi (simdilik) — upstream
     PR sureci bu sunucudan (api.github.com kapali) yurutulemiyor; ADR-0003'teki ag kisitini miras aliyor.
  3. *Tam `git remote add upstream` + `git merge` akisina gecmek.* Reddedildi — ADR-0003'te zaten
     degerlendirilip reddedildi (ortak gecmis yok, offline saha akisinda gereksiz agirlik); bu ADR yalniz
     remote'u referans olarak ekliyor, is akisini degistirmiyor.
- **Geri alma:** `git remote remove upstream` (remote'u kaldirir, kod degisikligi yok). Fork commit'lerini
  geri almak icin `git revert 445b1f228c ff1f289160` (ayri ayri; ikisi bagimsiz).

## Güncelleme (2026-09-28) — ölçüm yöntemi düzeltildi + envanter

- **Yöntem hatası:** "son vendor commit'inden bu yana diff" yamaları göstermez — vendor commit'i upstream
  farkını yamalarımızın ÜSTÜNE uygular, fark 0 çıkar. **Doğru ölçüm upstream etiketine karşı:**
  ```
  git fetch --no-tags upstream "refs/tags/v<sürüm>:refs/upstream-tags/v<sürüm>"
  git diff --stat refs/upstream-tags/v<sürüm> HEAD -- packages/opencode/src packages/core/src packages/tui/src
  ```
- **Ölçüm (v1.18.33'e karşı):** kaynakta 20 dosya, +573/−31. Her upstream güncellemesinde bu yamalar
  runbook testleriyle doğrulanır (`knowledge/runbooks/upstream-guncelleme.md`).

| Yama | Dosyalar | Etiket | Neden |
|---|---|---|---|
| Sağlayıcı hataları tipli döner | `server/.../middleware/classify.ts`, `error.ts` | upstream-uygun | generic 500 yerine anlamlı hata |
| Bozuk reference girdisi çökertmesin | `core/src/reference.ts`, `core/.../plugin/reference.ts`, `agent/agent.ts`, `session/system.ts`, `session/prompt.ts` | upstream-uygun | saha `err_1fe00c62` |
| Tekrarlar tükenince açık mesaj (A23) | `session/retry.ts`, `session/processor.ts` | upstream-uygun | kullanıcı ne olduğunu bilsin |
| Pano sonucu dürüst bildirilir (A22) | `tui/src/clipboard.ts` + 6 TUI dosyası | upstream-uygun | "kopyalandı" yalanı |
| İzin sınırı = açılış dizini, okuma komutları denetlenir | `project/instance-context.ts`, `tool/external-directory.ts`, `tool/shell.ts` | kurum-özel | Claude Code davranışı (Alp, 2026-09-28) |
| models.dev offline yedek, `splitting:false` | `packages/opencode/script/*`, `build.ts` | kurum-özel | offline derleme, ikili çökmesi |
