# knowledge/skills/parked/ — park edilmiş beceriler

**Karar kaynağı:** Alp, 2026-09-16 ("becerileri sadeleştir" — `faz0-yuzeye-getir` branch, K3/K4).

## Neden park

`knowledge/skills/approved/` 38 beceriden **çekirdek 10**'a indirildi (`alp-kur.sh` `CORE_SKILLS`
dizisiyle birebir aynı). Kalan 28 beceri **silinmedi** — içerikleri korunarak bu dizine
(`git mv` ile, geçmiş korunarak) taşındı. Amaç: varsayılan kurulumda taban bağlamı (sistem
promptu + AGENTS.md + beceri listesi + araç şemaları) küçük tutmak — küçük pencereli kurumsal
modelde (bkz. `NASIL-CALISTIRILIR.md` → "Compaction thrash") her ek beceri adı+description
taban bağlamı büyütüyor.

Bu bir **içerik birleştirme/temizlik** değil, yalnız **konum** değişikliği — hiçbir `SKILL.md`
içeriği değiştirilmedi.

## Nasıl geri alınır

Bir beceri tekrar çekirdeğe girecekse:

```bash
git mv knowledge/skills/parked/<ad> knowledge/skills/approved/<ad>
```

sonra `alp-kur.sh` içindeki `CORE_SKILLS` dizisine `<ad>`'ı ekle (`alp-kur.sh` başındaki dizi satırı).
`alp-kontrol.sh --kurulum`'un raporladığı çekirdek sayısı bu diziden **türetilir** (sabit sayı yok) — ayrıca dokunmaya
gerek yok.

## Tüm becerileri kurmak (park dahil)

Park edilmiş beceriler **silinmedi**, yalnız varsayılan kurulumdan çıkarıldı:

```bash
./alp-kur.sh --tum-beceriler   # approved/ (10) + parked/ (28) = 38 beceri kurulur
```

## "Yetim" işaretli beceriler (2026-09-16 itibarıyla)

Aşağıdaki 10 beceri, önceki denetimde (`notlar/FAZ0-YUZEYE-GETIRME-RAPORU.md` §7.4) repo içinde
hiçbir yerden (başka `SKILL.md`, doc, script) statik olarak referans verilmediği için **"yetim"**
işaretlendi. Bu, opencode'un onları keşfedemeyeceği anlamına **gelmez** (beceriler ad+description
ile keşfedilir, statik referans şart değil) — yalnız "hiç kullanılmıyor mu" sorusunun bu koşumda
**yeniden doğrulanmadığını** belirtir:

`git-azuredevops, guvenlik-ajani, guvenlik-incelemesi, idm-yonetim, mcp-ekle, rhel-surumleri,
sadelestir, sssd-adtrust, test-yaz, yerel-ai`

**`mcp-ekle` özel not:** MCP entegrasyonu opencode v1'de henüz yok (bkz. `MIMARI.md` Faz 2) —
bu beceri şu an fiilen kullanılamaz durumda, MCP entegrasyonu gelene kadar park'ta kalmalı.

## Faz 1 önerisi — içerik birleştirme adayları (uygulanmadı, öneri)

Önceki denetimden (`notlar/FAZ0-YUZEYE-GETIRME-RAPORU.md` §7.3) taşınan, bu koşumda
**dokunulmayan** birleştirme adayları:

- `servis-teshis` + `web-sunucu` + `podman-docker`: üçü de "servis konteynerde mi?" teşhisini
  tekrarlıyor → tek bir temel "container-teshis" bölümü + servise özgü ekler.
- `kod-inceleme` + `guvenlik-incelemesi`: güvenlik bölümü tekrarı.

(`ansible` ↔ `filo-durum-kontrolu` adayı — ikisi de çekirdekte kaldığı için burada değil, ayrıca
değerlendirilmeli.)

## Tam liste (28)

```
ag-teshis, beceri-gelistir, beceri-yaz, belge-yaz, disk-ekleme, git-azuredevops, guvenlik-ajani,
guvenlik-incelemesi, idm-yonetim, kod-inceleme, mcp-ekle, nexus-registry, nfs-mount,
podman-docker, rhel-surumleri, sadelestir, satellite-yonetim, selinux, sertifika-tls,
servis-teshis, solaris-ldom, splunk-forwarder, sssd-adtrust, sunucu-teslim, test-yaz,
upstream-birlestir, web-sunucu, yerel-ai
```
