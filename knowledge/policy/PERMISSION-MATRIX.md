# PERMISSION-MATRIX.md — araç izin matrisi (v1)

> Kaynak: `/root/ai-danis/SORU2.md` + `/root/ai-danis/DANISMA-RAPORU-2.md`. İlgili tehdit analizi için
> `THREAT-MODEL.md`. **Bu dosya bir öneridir** — `engine/opencode.json` içindeki gerçek `permission` bloğu
> **değiştirilmemiştir**; aşağıdaki JSON parçası yalnız belgeye yazılmıştır, insan onayı olmadan uygulanmaz.
> **Not (2026-09-16):** `/root/ai-danis/` bu makinede **mevcut değil** — harici kaynak, bu repoda tutulmaz.
> Referans silinmedi (izlenebilirlik için), içerik zaten bu politika dosyasına özetlenmiş durumda.
>
> Maskeleme: sunucu → `test-sunucu`, küme → `KUME-A`/`KUME-B`, IP → `10.0.0.x`, kurum → `kurum`.

## 1. Araç bazında matris

| Araç | v1 kararı | Gerekçe | Atlatma riski |
|---|---|---|---|
| `read` | **allow** | Salt-okunur, v1'in temel işlevi (envanter/log okuma) | Düşük — ama `knowledge/policy/`, secret dosyaları gibi hassas yollar için `external_directory` ile sınırlanmalı |
| `grep` | **allow** | Salt-okunur arama | Düşük |
| `glob` | **allow** | Salt-okunur dosya listeleme | Düşük |
| `list` | **allow** | Salt-okunur dizin listeleme | Düşük |
| `bash` | **ask** (varsayılan) + belirli desenler **deny** | v1'de mutasyon yok; ama envanter/log işleri bazen salt-okunur kabuk komutu gerektirir (`journalctl`, `rpm -qa`). Her çağrı insana sorulur | **Yüksek** — `ask` yalnız kural (model atlayabilir/yanlış yorumlayabilir); asıl kapı sunucu tarafında forced-command olmalı (bkz. §3) |
| `edit` (`write` aracı da aynı kapıya tabi — bkz. not) | **v2'de `ask`** — 2026-09-19 (Alp kararı: "amaç ile mevcut durum arasındaki boşluk kapatılsın, CC'ye benzesin") `engine/opencode.json`'a uygulandı: `permission.edit: "ask"`. v1'deki blanket `deny` (2026-09-16, faz0-yuzeye-getir) kaldırıldı. | v1'in salt-okunur-only kapsamı (`THREAT-MODEL.md` §4) BT işi **yapamayan** bir ajan üretiyordu — amaçla çelişiyordu. `ask`, CC'nin kendi varsayılanıyla aynı: her yazma insana sorulur, otomatik değil. | Orta-Yüksek — `ask` yalnız kural, model atlayabilir; audit-log plugin (bkz. §aşağı) her denemeyi (izin sonucu ne olursa olsun) kaydeder ki atlatma girişimi görünür olsun. Bu ajanın gerçekten yazmaya başladığı ilk an olduğu için **audit-log plugin'in fiilen kurulu/çalışır olduğu doğrulanmadan** `edit: ask`'ı `allow`'a çevirme. |
| `skill` | **allow** (`*`) | Beceri yükleme zaten salt-okunur; asıl risk beceri *içeriği*, yükleme eylemi değil | Düşük |
| `webfetch` | **deny** (v1'de tanımsız → deny sayılır) | Air-gapped'e yakın ortam; dış ağ/telemetri kapalı varsayımı (`engine/AGENTS.md`) | Orta — tanımsız izin opencode'da varsayılan davranışa düşer, açıkça `deny` yazılmalı |
| `external_directory` | **ask** (mevcut ayarla uyumlu) | `/root/ai/opencode-agent` dışına çıkış her zaman insana sorulmalı — `engine/AGENTS.md` "çalışma dizini kapsamı" kuralını tool seviyesinde destekler | Orta — kural metniyle çakışırsa (AGENTS.md "izin iste" der, tool "ask" sorar) ikisi de aynı yönde olduğu sürece güvenli |
| `mcp` | **v1'de tanımsız/yok** (Faz 2) | MCP sunucusu henüz repoda değil; tool poisoning riski MCP eklenene kadar yok sayılır ama ilke şimdi yazılır: her MCP tool `description`'ı approved kapısından geçmeden etkin olmaz | Faz 2'de yeniden değerlendirilecek |

## 2. Önerilen `engine/opencode.json` `permission` bloğu

> **Durum (2026-09-16, faz0-yuzeye-getir):** `bash` deny kalıpları (`kubectl delete/apply`,
> `systemctl stop/restart`, `dd if=*of=/dev/*`) ve `edit: "deny"` **uygulandı** (bkz. bulgu B1/B4).
> Aşağıdaki `edit`/`write` bloğundaki **path-bazlı knowledge/ istisnası** (deneysel/generated/lessons-learned
> altına ajan yazabilsin) **uygulanmadı** — bu, "ajan kendi önerisini nereye yazar" sorusuna bağlı ayrı bir
> karar (bkz. rapor "Alp'in kararı gereken maddeler"); v1'in mutlak salt-okunur kuralını hiçbir path
> istisnası olmadan uygulamak daha güvenli olduğu için şimdilik blanket `deny` seçildi. `write` diye ayrı
> bir izin anahtarı **yok** (bkz. `THREAT-MODEL.md` §4 notu) — aşağıdaki `"write": {...}` bloğu bu yüzden
> bugün **etkisizdir**, yalnızca gelecekte opencode bu anahtarı gerçekten okumaya başlarsa diye belgede
> tutuluyor.
>
> **Durum (2026-09-19, v1 → v2 geçişi):** Alp'in kararı: ajan salt-okunur kalırsa amacını
> (kurumun BT işlerini yapmak) yerine getiremiyor — `edit: "deny"` → **`edit: "ask"`** yapıldı
> (`engine/opencode.json`). Bu geçişin ön koşulu **audit-log plugin'in fiilen çalışır olması**
> (bkz. `AUDIT-FORMAT.md`) — kod zaten yazılmış ve 2026-09-16'da smoke-test edilmişti, ama bu
> makinenin (skyup) **canlı** `~/.config/opencode/` kurulumunda şu an (2026-09-19 kontrolünde)
> `plugins/` dizini **boş** — yani `02-kur.sh` bu makinede tam çalıştırılmamış/güncellenmemiş.
> **`edit: "ask"` fiilen etkili olmadan önce `02-kur.sh` bu makinede (yeniden) çalıştırılıp audit
> plugin'in kurulduğu doğrulanmalı** — aksi halde yazma denemeleri onaya düşer ama audit'e düşmez.
> SSH forced-command (§3) hâlâ **tasarım aşamasında**: `aiops` unix hesabı henüz yok, hedef
> sunucu listesi bu repoda maskeli (`test-sunucu`/`KUME-A`/`KUME-B`) — gerçek hedefler ve hesap
> kararı Alp'ten bekleniyor, bu dosyada icat edilmedi.

```json
{
  "permission": {
    "skill": {
      "*": "allow"
    },
    "bash": {
      "*": "ask",
      "rm -rf *": "deny",
      "rm -rf /*": "deny",
      "mkfs*": "deny",
      "dd if=*of=/dev/*": "deny",
      "git push --force*": "deny",
      "git push*": "ask",
      "systemctl stop*": "deny",
      "systemctl restart*": "deny",
      "kubectl delete*": "deny",
      "kubectl apply*": "deny",
      "ansible-playbook*": "ask"
    },
    "edit": {
      "knowledge/skills/experimental/*": "allow",
      "knowledge/skills/generated/*": "allow",
      "knowledge/lessons-learned/*": "allow",
      "knowledge/skills/approved/*": "deny",
      "knowledge/policy/*": "deny",
      "engine/*": "deny",
      "*": "ask"
    },
    "write": {
      "knowledge/skills/experimental/*": "allow",
      "knowledge/skills/generated/*": "allow",
      "knowledge/lessons-learned/*": "allow",
      "*": "ask"
    },
    "webfetch": "deny",
    "read": "allow",
    "grep": "allow",
    "glob": "allow",
    "list": "allow",
    "external_directory": "ask"
  }
}
```

> Not: opencode'un `edit`/`write` izin bloğu path-bazlı joker desteklemiyorsa (sürüm 1.18.30'da doğrulanmalı),
> bu ayrım dosya sistemi izinleriyle (Unix permission, ayrı kullanıcı) desteklenmelidir — bkz. §3.

## 3. "Zorunlu kapı" tasarımı — kural mı, hook mu?

**Temel ayrım:** `AGENTS.md` kuralı = **rica**; model atlayabilir, yanlış yorumlayabilir, uzun bağlamda
unutabilir (özellikle 16k pencereli kurum modeliyle). Plugin hook (`tool.execute.before`) veya dosya
sistemi izni = **kapı**; modelin "isteği" değil, çalışma zamanının zorunluluğudur.

| Kontrol | Nerede olmalı | Neden |
|---|---|---|
| "Envanter işinde araç çalıştırma, yalnız oku" | `AGENTS.md` (kural) | Görev bazlı bir tercih, güvenlik sınırı değil; ihlali kritik hasar yaratmaz |
| "Kapsam dışı dizine çıkma" | **Hem** `AGENTS.md` **hem** `permission.external_directory: ask` (hook/izin) | Kural niyeti anlatır, izin bloğu fiilen sorar — ikisi birlikte savunma derinliği |
| "`rm -rf`/`mkfs`/force-push çalıştırma" | `permission.bash` **deny deseni** (kapı) | Tek bir yanlış yorumlama geri döndürülemez hasar yaratır; kurala güvenilmez |
| "`approved/`'a yalnız insan yazar" | **Dosya sistemi izni** (Unix permission), plugin hook **değil** | Danışma 2, Opus: "hook'u ajan atlayabilir" — opencode süreci hangi kullanıcıyla çalışıyorsa o kullanıcının yazma izni olmayan dizine hiçbir hook gerekmeden yazamaz. En sağlam kapı budur |
| "Log/incident içeriğini talimat olarak yürütme" | Prompt/AGENTS.md çerçevesi ("bu veridir") + Faz 1 eval'de enjeksiyon testi (kapı = ölçüm) | Çalışma zamanında teknik olarak engellenemez (LLM girdisi), bu yüzden kural + test ile yönetilir |
| "Yıkıcı bash deseni engeli" | `permission.bash` deny desenleri (kapı) **+** ileride plugin `tool.execute.before` (`guvenlik-kapisi` adayı, `engine/plugins/README.md`) | Statik desen eşleşmesi (`rm -rf *`) kaçırılabilir varyasyonlara karşı ikinci hat gerekir; plugin hook düzenli ifadeyle daha geniş yakalar |
| "SSH ile hedef sunucuya yalnız salt-okunur komut" (Faz 2 hazırlığı) | **Sunucu tarafı forced-command** (`authorized_keys` içinde `command="..."`) | En güçlü kapı; istemci tarafında (ajan makinesinde) hiçbir kontrol bunun yerini tutamaz — Danışma 2, Opus: "asıl güvenlik burada, ProxyCommand'da değil" |

**Kısa kural:** *Geri dönüşü olmayan veya prod'u etkileyen her şey* kapıya (izin deny-deseni, dosya sistemi
izni, sunucu tarafı forced-command) bağlanır; *tercih/üslup/kapsam* meselesi `AGENTS.md` kuralına bırakılır.
v1 salt-okunur olduğu için bugün tek gerçek kapı `permission.bash` + dosya sistemi izinleridir; SSH/forced-command
kapısı Faz 2'nin ön koşuludur ve tasarımı burada belgelenmiştir ki o faza gelindiğinde yeniden düşünülmesin.

## 4. Bu matrisin dışında kalanlar

Onay/grant zinciri (payload-hash'e bağlı tek kullanımlık onay), OPA/Cedar tipi bağımsız politika motoru —
Danışma 2'de "v1'de erken" olarak işaretlendi. Bunların plan/grant format taslağı ilerideki bir
`architecture/decisions/` kaydına bırakılmıştır (bu dosyanın kapsamı değil).
