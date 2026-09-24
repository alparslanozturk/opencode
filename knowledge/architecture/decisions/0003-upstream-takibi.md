# ADR-0003: Upstream takibi — niyet degil, calisan adim

- **Tarih:** 2026-09-24
- **Durum:** kabul edildi (Alp onayı)
- **Bağlam:** ADR-0001 "fork yok" ve danisma kayitlari (`../consultations/CONSULTATION-1-ARCHITECTURE.md`)
  "upstream'i takip et" diyordu, ama bu hic bir mekanizmaya donusmedi: vendor 1.18.30 tek bir kopya commit'i
  olarak alindi, upstream remote/ref tanimlanmadi, `MIMARI.md` surumu "sabit" diye yazdi, runbook/betik yoktu.
  Sonuc: 2026-09-24'te iki surum geride (1.18.32) oldugumuz ancak soru sorulunca fark edildi. Ayrica bu
  sunucuda `api.github.com`/`codeload.github.com` `/etc/hosts` ile kapali — `gh` ve tarball indirme calismaz,
  yalniz `git` protokolu calisir.
- **Karar:**
  1. Takip **betikle** yapilir: `script/upstream-kontrol.sh` (rapor; `uygula` ile ayri dala uygular).
     Yalniz `git` kullanir, upstream surumlerini `refs/upstream/v*` altina indirir (dallar/etiketler kirlenmez).
  2. **Kural:** Her Doktor calisma oturumunun basinda ve her saha surumu (`kur.sh` SURUM artisi) oncesinde
     betik calistirilir. Ayni ana surum hattinda **en fazla 2 surum geride** kalinir; asilirsa guncelleme
     is listesinin en ustune alinir.
  3. Guncelleme her zaman ayri dalda (`upstream-<surum>`), tek `vendor:` commit'i olarak yapilir; adimlar
     `../../runbooks/upstream-guncelleme.md`.
  4. **Ana surum atlamasi (1.x → 2.x) otomatik degildir.** 2.0 hatti (2026-09-11'den beri etiketli, npm
     `latest` hala 1.18.x) paket yapisini degistiriyor (`packages/opencode` yok → `packages/cli`, `@opencode/*`
     kapsami). Gecis ayri bir ADR ile, npm `latest` 2.x olduktan sonra degerlendirilir; betik yalniz BILGI
     satiri basar.
  5. Upstream'e bildirdigimiz hatalar yamasini tasidigimiz surece izlenir (su an: #49414 — unknown-finish
     dongusu, `local: cap unknown-finish retries`).
- **Alternatifler:**
  1. *Tam git gecmisiyle upstream remote (`git remote add upstream` + merge).* Reddedildi: vendor tek commit
     oldugu icin ortak gecmis yok; tam gecmis indirmek buyuk ve saha (offline) akisinda anlamsiz. Tag bazli
     sig fetch + `git diff | git apply --3way` ayni isi goruyor.
  2. *Yalniz belgeye "takip et" yazmak.* Reddedildi — zaten boyleydi ve calismadi.
- **Sonuç / gerekçe:** 1.18.30 → 1.18.32 gecisi bu sekilde yapildi (commit `vendor: opencode 1.18.30 -> 1.18.32`):
  tek cakisma bir test dosyasinda, yamali cekirdek dosyalarimiza upstream dokunmamis, testler/typecheck/duman
  testi gecti. Ayni ADR-0001 cizgisi korunuyor: cekirdege dokunusu kucuk tutmak guncellemeyi ucuz tutuyor.
