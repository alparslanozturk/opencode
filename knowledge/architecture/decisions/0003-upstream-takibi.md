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
  tek cakisma bir test dosyasinda, yamali cekirdek dosyalarimiza upstream dokunmamis, testler/typecheck
  gecti. Ayni ADR-0001 cizgisi korunuyor: cekirdege dokunusu kucuk tutmak guncellemeyi ucuz tutuyor.
  **Duzeltme (2026-09-26):** o gunku duman testi derlemeden eski `bin/opencode` (1.18.30) ile kosmustu;
  1.18.32 motorlu ikili ilk kez 2026-09-26'da (urun 1.0.3) derlendi; duman testi + kilit senaryolari gecti.

## Güncelleme (2026-10-05) — felsefe: yeniyi uygula, karşılaştır, uyarla, haber ver

- **Alp kararı:** upstream'deki yeni değişimler uygulanır; her yeni sürümde bizim çalışmalarımız (ADR-0006
  yama tablosu, `engine/plugins`, beceriler, `kur.sh`) yeni sürümle **karşılaştırılır**; upstream aynı işi
  yapan bir kod/düzenleme getirdiyse **bizimki ona uyarlanır** (yama düşürülür, upstream yolu kullanılır) ve
  Alp'e haber verilir. "2 sürümden fazla geride kalma" kuralı alt sınır olarak geçerli.
- **m.4 için gözlem (2026-10-05, `npm view`):** `opencode-ai` paketinin `latest` etiketi hâlâ **1.18.34**;
  2.x ayrı paket olarak yayımlanıyor: `@opencode/cli` `latest` = **2.0.23**. Yani m.4'teki "npm `latest` 2.x"
  koşulu tek pakete bakılarak sağlanmış sayılmaz; 2.x geçiş kararı Alp'te (ADR-0005 adaptör planı hazır).
