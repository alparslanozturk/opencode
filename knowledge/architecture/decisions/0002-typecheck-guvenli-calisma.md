# ADR-0002: Typecheck donma sorunu — cozum repo seviyesinde, sunucu izolasyonunda degil

- **Tarih:** 2026-09-19
- **Durum:** kabul edildi (Alp onayı)
- **Bağlam:** `/root/ai/opencode` gelistirme sunucusunda root'tan `bun run typecheck`/`bun turbo typecheck`
  calistirmak, workspace'teki 30 paketin her biri icin paralel `tsgo` sureci acip RAM'i tuketerek makineyi
  tamamen donduruyordu (bkz. `../../incidents/2026-09-19-typecheck-donma.md` — 5x hard-reboot). Alp bunu
  "kurum sunucularinda da sorun olur" diye genisletip kesin bir cozum istedi. Once bir **sunucu izolasyonu**
  yaklasimi detaylandirildi: ayri, sudo'suz, SSH'i tamamen kapali bir `opencode` Unix hesabi + systemd
  cgroup kaynak tavani (`MemoryMax`/`CPUQuota`/`TasksMax`) + proje bu hesabin home dizinine tasinip chown
  edilecekti. Somut komutlar hazirlandi ama Alp onaylamadan **vazgecti** ("vazgeçtim").
- **Karar:** Kok neden fix'i **repoya gomulu koda** tasindi, host'a ozel bir kuruluma degil:
  `script/safe-concurrency.sh` (CPU cekirdek sayisi + kullanilabilir RAM'e gore guvenli concurrency
  hesaplar) → kok `package.json`'daki `typecheck` script'i bunu kullaniyor → `.husky/pre-push` yalniz
  bunu cagiriyor (tek dogruluk kaynagi). Boylece bu repoyu klonlayan **her** sunucu (bu VM, CI, kurumdaki
  diger makineler) otomatik olarak korunuyor — host bazinda tekrar kurulum gerekmiyor.
- **Alternatifler:**
  1. *Sunucu izolasyonu (ayri `opencode` kullanicisi + cgroup limiti + SSH kapali + proje home'a tasi).*
     Somut plan hazir, ama **reddedildi**: (a) her hedef sunucuda ayri ayri kurulmasi gerekiyor, kurum
     filosuna yayilmasi ek operasyonel yuk; (b) asil kok nedeni (sinirsiz paralel `tsgo`) cozmuyor, sadece
     etkisini sinirliyor — kod hala her calistirmada makineyi zorlayabilirdi, sadece host'un geri kalani
     korunurdu; (c) Alp acikca vazgecti.
  2. *Yalniz `.husky/pre-push` hook'una concurrency siniri eklemek* (ilk deneme, commit `ef94abc938`).
     **Yetersiz bulundu**: yalniz `git push` anini kapsiyor — CI'da veya baska bir sunucuda/ajanda
     dogrudan `bun run typecheck` cagrilirsa korumasiz kaliyordu.
  3. *Swap ekleme (2-4GB).* Donma yerine yavaslama + OOM-killer'in araya girmesini saglardi ama **root
     nedeni cozmuyor** (paralellik hala sinirsiz kalirdi) ve host'a ozel bir islem. Acik oneri olarak
     `NASIL-CALISTIRILIR.md`'de durmaya devam ediyor, zorunlu degil.
- **Sonuç / gerekçe:** Repo-seviye fix (`script/safe-concurrency.sh`), organizasyon olceginde host-seviye
  izolasyondan daha guvenli kabul edildi cunku **tasinabilir** — kurulum gerektirmeden her klonlanan
  yerde calisir, unutulma/drift riski yok. 2026-09-19'da iki gercek `git push` ile canli dogrulandi:
  bellek boyunca GB'larca bos kaldi, makine hic zorlanmadi, 30/30 typecheck task basarili oldu. Sunucu
  izolasyonu (alternatif 1) ileride kurum uretim sunuculari icin **ek savunma katmani** (defense-in-depth)
  olarak yeniden degerlendirilebilir, ama su an zorunlu degil — kok neden zaten kod seviyesinde kapatildi.
