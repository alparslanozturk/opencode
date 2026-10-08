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

## Doğrulama (2.x — motor `packages/cli` + `packages/core`; 2026-10-08, 2.0.23 → 2.0.24 gecisinde uygulandi)
- Kokten `bun run typecheck` (CLI agaci, `script/safe-concurrency.sh` ile sinirli — ADR-0002) → 19/19.
- `engine/plugins` testleri → 0 basarisiz.
- `cd packages/core && bun test` → yalniz bilinen 3 basarisizlik kabul: "fails on unwritable lock roots" (2, root
  ortami) + "isolates global home and XDG roots". Baska basarisizlik varsa main'e alma.
- `./kur.sh derle` **sonra** `bash script/smoke-ikili.sh packages/cli/dist/cli-linux-x64/bin/opencode` → `GECTI`.
- Kilit testi `opencode run --standalone` ile (`rm -rf /` reddedilmeli, `uname -r` calismali); **`OPS_AGENT_AUDIT_LOG`'u
  gecici dosyaya ver**, yoksa test kaydi gercek `/var/log/ops-agent/audit.jsonl`'a yazilir.
- Test sonunda `script/sahte-uc.py` sureclerini kapat (2026-10-05'ten kalan biri 2026-10-08'de bulundu).
- 1.x hatti (tarihsel): `packages/opencode` testleri + `smoke-ikili.sh packages/opencode/dist/opencode-linux-x64/bin/opencode`. DIKKAT: argumansiz `smoke-ikili.sh` **eski** `bin/opencode`'u test eder (derlemez) — 2026-09-24'te
  1.18.32 gecisi bu yuzden yanlislikla 1.18.30 ikilisiyle "dogrulandi"; 2026-09-26'da duzeltildi.
- Sonra main'e al; `MIMARI.md` "Referans sürüm" satirini guncelle.

## Bilinen tuzaklar
- Betik bilerek yalniz `git` kullanir (`gh`/GitHub API'ye bagimli degil — saha makinesinde API
  kapali olabilir). Not: bu sunucudaki `/etc/hosts` karartmasi (2026-09-21 offline test kalintisi)
  2026-10-05'te kaldirildi; offline simulasyonu `unshare -m` + sahte hosts ile yapilir.
- Vendor commit'i upstream'den 5 dosya eksik (`.opencode/.gitignore`, `.vscode/*.example.json`,
  `packages/opencode/script/build-node.ts` …) — bilerek; `git apply` bunlara dokunan bir fark gelirse
  "does not exist" diyebilir, o dosyayi atla.
- **Ana surum gecisi** (1.x → 2.x gibi; paket yapisi degisir) bu runbook'un kapsami disinda — ADR-0003 madde 4. Ayni hat icindeki 2.x yamalari bu runbook'la yapilir.
- Kuru birlestirmede cakisma cogunlukla testlerde olur (iki taraf ayni dosyanin sonuna test ekler) — iki
  testi de tut.

## Kaynak / tarih
- 2026-09-24 — 1.18.30 → 1.18.32 gecisi bu adimlarla yapildi (Doktor). ADR-0003.
