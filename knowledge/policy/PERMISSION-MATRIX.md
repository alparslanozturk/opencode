# PERMISSION-MATRIX.md — araç izin matrisi (v1)

> Kaynak: `/root/ai-danis/SORU2.md` + `/root/ai-danis/DANISMA-RAPORU-2.md`. İlgili tehdit analizi için
> `THREAT-MODEL.md`. **Bu dosya bir öneridir** — `engine/opencode.json` içindeki gerçek `permission` bloğu
> **değiştirilmemiştir**; aşağıdaki JSON parçası yalnız belgeye yazılmıştır, insan onayı olmadan uygulanmaz.
> **Not (2026-09-16):** `/root/ai-danis/` bu makinede **mevcut değil** — harici kaynak, bu repoda tutulmaz.
> Referans silinmedi (izlenebilirlik için), içerik zaten bu politika dosyasına özetlenmiş durumda.
>
> Maskeleme: sunucu → `test-sunucu`, küme → `KUME-A`/`KUME-B`, IP → `10.0.0.x`, kurum → `kurum`.

> **Güncel durum (2026-09-24, ADR-0004):** Güvenlik kilitleri K1–K7 uygulandı — tek sayfalık özet
> `GUVENLIK-KILITLERI.md`. Bash izin listesi kelime sınırlı (K4), `audit-log.ts` varsayılan
> **kilitli** (K7). §5'teki "gözlem varsayılan" ve "ENFORCE'ta kapsam reddi" ifadeleri tarihseldir:
> kapsam kapısı artık yalnız kayıt tutar (K2 onayı motorda).
>
> **Güncel durum (2026-09-25, A104 — Alp: "Bulunduğum klasörün içerisindeki dosyaların
> kısıtlanması saçma… dışına çıkmak isterse izin istemesi lazım"):** K3 (`read`) ve `grep`
> 2026-09-24'te geçici olarak **ask**'a çekilmişti — bu **geri alındı**. İzin modeli artık
> **kapsam (cwd) tabanlı**: çalışma dizini (proje kökü) İÇİNDE `read`/`grep`/`glob`/`list`
> onaysız çalışır (`allow`); çalışma dizini DIŞINA çıkan her erişim `permission.external_directory:
> "ask"` ile sorulur (K2 — motor bunu `read`/`glob` için path çözümlemesinde otomatik tetikler).
>
> **Güncel durum (2026-09-25, A105 — Alp: "Çalışma izni içerisindeki dosyalara erişimin
> kısıtlanması hiç uygun bir güvenlik kilidi değil böyle bir şey varsa kaldıralım"):** A104'ün
> bıraktığı tek istisna da kaldırıldı — `hosts*`/`*.inventory`/`inventory/**`/sır dosyaları
> (`env`, `*.key`, `*.pem`, `*token*`, …) artık **kapsam İÇİNDE** `read`/`list`/`glob`/`grep`
> **ve** `bash` (dosyayı okuyan komutlar) için de sorulmadan serbesttir —
> `engine/plugins/audit-log.ts` denylist kapısı **yalnız kapsam DIŞINA** çıkan hedeflere uygulanır
> (bkz. §5). Kapsam dışı davranış **değişmedi**: aynı desenlere uyan kapsam-dışı bir dosya hâlâ
> `ENFORCE` modunda sorulmadan reddedilir. Yazma (`edit`/`write`) etkilenmedi — hem `ask` izni hem
> denylist kapısı kapsamdan bağımsız (kapsam içinde de) uygulanmaya devam eder. Ajanın kendi çalışan
> ayar/kimlik dosyası (`~/.config/opencode/opencode.json`, `~/.local/share/opencode/auth.json`) K6
> öz-koruma kilidiyle (plugin, `korunanYol`) hâlâ okunamaz — bu A105'in kaldırdığı şey değil, ayrı
> bir mekanizma.

## 1. Araç bazında matris

| Araç | v1 kararı | Gerekçe | Atlatma riski |
|---|---|---|---|
| `read` | **allow** (kapsam içi, A104/A105) | Salt-okunur, v1'in temel işlevi (envanter/log okuma); kapsam dışı `external_directory: "ask"` ile sorulur | Düşük — kapsam DIŞINDAKİ sır/envanter dosyaları (`hosts*`, `env`, `*.key`, …) `audit-log.ts` denylist'i tarafından reddedilir; kapsam İÇİNDEKİLER A105 ile artık serbest |
| `grep` | **allow** (kapsam içi, A104) | Salt-okunur arama; tool zaten yalnız aktif konum (proje kökü) altında çalışır, dışına çıkamaz | Düşük |
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
> `plugins/` dizini **boş** — yani `kur.sh` bu makinede tam çalıştırılmamış/güncellenmemiş.
> **`edit: "ask"` fiilen etkili olmadan önce `kur.sh` bu makinede (yeniden) çalıştırılıp audit
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

## 5. Hassas veri koruması (T13/A34+A35) — gizli desenler, denylist, arama kapsamı

> Kaynak: 2026-09-23 15:40 saha ekranı (A34 kritik + A35 yüksek) — model `~/ansible` ağacını
> **istenmeden** glob'ladı, envanteri özetledi ve **düz metin bir parolayı yanıt metnine yazdı**. Kapı
> `engine/plugins/audit-log.ts`'e eklendi (T7'nin ayrı `degisiklik-kapisi.ts`'i hiç kodlanmadı —
> §3'teki "ikinci bir kapı yazma" ilkesi gereği aynı `tool.execute.before`/`after` hook'u kullanıldı).

**Gizli desen redaksiyonu (A34).** `redactSecrets()` şu deseni yakalar: `password|passwd|pwd|secret|
token|api[_-]?key|private[_-]?key|BEGIN .* PRIVATE KEY` (etiket:değer / etiket=değer / `--etiket değer`
biçimleri) **ve** genel `KEY=değer` biçimi (`KURUM_KEY=...` gibi kurum-özel değişkenler için — yukarıdaki
etiket listesinde yok ama en sık kaçak yolu budur). Değer hiçbir zaman döndürülmez, yerine
`[REDACTED:<tür>]` yer tutucusu geçer. Redaksiyon **`tool.execute.after` içinde, `output.output` MUTASYONLA
değiştirilerek** uygulanır — yani tool çıktısı hem audit'e hem **modele/yanıta** maskelenmiş gider (tools.ts
aynı `output` objesini geri döndürür, bkz. `session/tools.ts:112-129`). Yeni audit kayıt türü
`record_type:"redacted"`: hangi araç, hangi hedef (maskelenmiş), hangi desen türü — **değer hiçbir alanda
yok**. Aynı `prev_hash` zincirine eklenir (bkz. `AUDIT-FORMAT.md` §3/§6).

**Hassas dosya denylist'i (A34+A35, A81/A92, A105).** `read`/`write`/`edit`/`list`/`glob`/`grep`/`bash`
araçlarının hedef yolu (bash'te: komutun okuduğu/kopyaladığı dosya argümanları, `bashDenylistHit` —
alt kabuk, `eval`, model betikleri dahil) şu kalıplara eşleşirse: `hosts*`, `*.inventory`,
`inventory/**`, `*.vault`, `*credential*`, `*secret*`, `env`, `env.local`, `*.key`, `*.pem`, `*token*`,
`*.kdbx`. **A105 kapsam istisnası:** bu kapı `read`/`list`/`glob`/`grep` ve `bash` için **yalnız
çalışma dizini (kapsam) DIŞINA** çıkan hedeflere uygulanır — kapsam içinde bu desenlere uyan bir
dosya (ör. proje içi `ansible/inventories/hosts.ini`, kök dizindeki `env`) artık sorulmadan okunur.
`write`/`edit` bu istisnadan **muaf değil** — kapsam içinde de denylist'e takılırsa reddedilir.
**Gözlem modu (varsayılan):** sert blok yok — dosya içeriği **tamamen** redakte edilir (desen
taramasına güvenilmez; envanter dosyası baştan sona hassas olabilir) ve `redacted` kaydı düşer.
**`OPS_AGENT_KAPI=ENFORCE`:** `tool.execute.before` içinde araç hiç çalıştırılmadan reddedilir
(throw → catchable hata, `packages/opencode/test/tool/code-mode.test.ts` "a failing before hook
fails only that child call" testiyle doğrulanan mekanizma) ve `result_status:"denied"`/
`policy_decision:"deny"` kaydı düşer. Desen kaynağı `engine/opencode.json` →
`ops_agent.denylist.patterns` (opencode'un kendi config şeması bu alanı sessizce yok sayar — plugin dosyayı
kendi okur, motor davranışını etkilemez). **Fail-closed:** liste boş/okunamazsa sabit bir varsayılan
listeye (yukarıdaki kalıplar) düşülür — hiç koruma olmaması yerine.

**Arama kapsamı (A35).** `read`/`glob`/`grep`/`list` için varsayılan kapsam **çalışma dizini**
(`projectDir`). Bir çağrı bu ağacın **dışına** çıkarsa veya aynı oturumda 2 dakikalık bir "burst"
penceresinde **4'ten fazla farklı dizin** dokunulursa (geniş/çok-dizinli tarama), **burst'teki ilk çağrı**
işaretlenir — sonraki çağrılar aynı pencerede tekrar işaretlenmez (**tek onaya bağlama**, modelin kendi
kendine ardışık glob turunu spam'e çevirmemesi için). Gerçek engine `permission.ask` hook'u hiç
tetiklenmediğinden (bkz. `AUDIT-FORMAT.md` "v1 sınırı") kapı aynı gözlem/ENFORCE ikilisini kullanır: gözlem
modunda `result_status:"asked"`/`policy_decision:"ask"` kaydı düşer, hedef **yalnız dizin adı + eşleşen
dosya sayısı** (`"<dizin> (N dosya)"`) — dosya adları/içerik audit'e **yazılmaz**. `OPS_AGENT_KAPI=ENFORCE`
modunda burst'ün ilk çağrısı reddedilir; kapsamı genişletmek isteyen insan `OPS_AGENT_KAPSAM_EK=<izinli-dizin>`
kaçış yolunu kullanır (T7 analizindeki `OPS_AGENT_CN` kaçış deseniyle aynı aile). **A18 ile çelişmez:** bu
kapı bilgi eksikse sormayı kısıtlamaz, yalnız **taramayı** kısıtlar.

**Ortak mod anahtarı:** `OPS_AGENT_KAPI=ENFORCE` hem denylist hem arama-kapsamı kapısını aynı anda sert
moda alır — iki ayrı ortam değişkeni yerine tek anahtar, T7'nin "kapı çoğalmasın" ilkesiyle tutarlı.
**(2026-09-24 güncellemesi, K7):** varsayılan artık kilitli; anahtar tersine döndü → gözlem modu yalnız
`OPS_AGENT_KAPI=GOZLEM`. Kapsam kapısı hiçbir modda reddetmez (yalnız kayıt) — dizin dışı onayını
`permission.external_directory: "ask"` sorar (K2).

## 6. Güvenlik kilitleri (K1–K7)

Bkz. `GUVENLIK-KILITLERI.md` (kullanım + sınırlar) ve `../architecture/decisions/0004-guvenlik-kilitleri.md`
(karar). K1 değişiklik kilidi, K5 yıkıcı komut ve K6 öz-koruma `audit-log.ts`'te sert red; K2/K3/K4
`engine/opencode.json` izin bloğunda (onaylanabilir).
