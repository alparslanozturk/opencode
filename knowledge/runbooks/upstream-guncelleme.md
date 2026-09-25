# Runbook: upstream opencode surum guncellemesi

- **Amaç:** Upstream opencode'un yeni surumunu (ayni ana surum hattinda) bizim yamalarimizi bozmadan almak.
- **Ne zaman çalıştırılır:** Her Doktor oturumunun basinda `script/upstream-kontrol.sh`; cikis kodu 10/20 ise
  ve 2'den fazla surum gerideysek hemen, degilse bir sonraki saha surumunden once (ADR-0003).
- **Süre / risk:** 15-30 dk. Risk dusuk — ayri dalda yapilir, main'e ancak testler gectikten sonra girer.
- **Ön koşullar:** Temiz calisma agaci; `git` ile github.com'a erisim (api.github.com gerekmez).
- **Geri dönüş (rollback):** Dal main'e alinmadiysa `git switch main && git branch -D upstream-<surum>`.
  Alindiysa `git revert <vendor commit>` + `bun install --frozen-lockfile`.

## Adımlar
1. `script/upstream-kontrol.sh` — rapor: kac surum geride, motor tarafinda ne degisti, bizim yamali
   dosyalarla ortak dosya var mi, kuru birlestirme temiz mi.
2. `script/upstream-kontrol.sh uygula` — `upstream-<surum>` dalini acar, farki `git apply --3way` ile uygular
   (commit atmaz).
3. Cakisma varsa (`git status` → `UU`): coz, `git add`. Kural: **upstream'in degisikligi + bizim yamamiz
   ikisi de kalir**; bizim yama upstream'de artik gereksizse (hata orada duzeltilmisse) yamayi kaldir ve
   bunu commit mesajina yaz.
4. `bun install --frozen-lockfile` (bagimlilik surumleri degismis olabilir).
5. `git commit -m "vendor: opencode <eski> -> <yeni>"` — mesajda: cakisan dosyalar, yamalarin durumu,
   dogrulama sonuclari.

## Doğrulama
- Yamali alanlarin testleri:
  `cd packages/opencode && bun test test/server/httpapi-error-middleware.test.ts test/server/httpapi-defect-classify.test.ts test/session/prompt.test.ts test/session/system.test.ts`
  ve `cd packages/core && bun test test/reference.test.ts`
- `cd packages/opencode && bun run typecheck` (tek paket; kok typecheck de guvenli — ADR-0002)
- `./kur.sh derle` **sonra** `bash script/smoke-ikili.sh packages/opencode/dist/opencode-linux-x64/bin/opencode`
  → `GECTI`. DIKKAT: argumansiz `smoke-ikili.sh` **eski** `bin/opencode`'u test eder (derlemez) — 2026-09-24'te
  1.18.32 gecisi bu yuzden yanlislikla 1.18.30 ikilisiyle "dogrulandi"; 2026-09-26'da duzeltildi.
- Sonra main'e al; `MIMARI.md` "Referans sürüm" satirini guncelle.

## Bilinen tuzaklar
- `api.github.com` / `codeload.github.com` bu sunucuda `/etc/hosts` ile 127.0.0.1'e yonlu: `gh`, GitHub
  tarball ve API calismaz. Betik bilerek yalniz `git` kullanir.
- Vendor commit'i upstream'den 5 dosya eksik (`.opencode/.gitignore`, `.vscode/*.example.json`,
  `packages/opencode/script/build-node.ts` …) — bilerek; `git apply` bunlara dokunan bir fark gelirse
  "does not exist" diyebilir, o dosyayi atla.
- 2.x hatti **bu runbook'un kapsami disinda** (paket yapisi farkli) — ADR-0003 madde 4.
- Kuru birlestirmede cakisma cogunlukla testlerde olur (iki taraf ayni dosyanin sonuna test ekler) — iki
  testi de tut.

## Kaynak / tarih
- 2026-09-24 — 1.18.30 → 1.18.32 gecisi bu adimlarla yapildi (Doktor). ADR-0003.
