# 2026-09 — Saha topolojisi (saha-makinesi)

> Kaynak: Alp, 2026-09-19 (sohbet). **Maskeleme uygulandı** — gerçek domain adları bu dosyaya
> yazılmadı (bu repo **public** GitHub'da: `alparslanozturk/opencode`); `engine/AGENTS.md` "Güvenlik
> ve sınırlar" kuralına uyum. Gerçek değerler yalnız Alp'in git-dışı notlarında/hafızasında kalır.

## Ajan host'u

- **saha-makinesi** = opencode(`oc`)'un CC gibi çalışacağı asıl saha makinesi (bu repo/`skyup` yalnız
  geliştirme/derleme kutusu — `Doktor` buradan çalışıyor, saha dağıtımı Alp'in kendi akışıyla olur,
  bkz. `notlar/DURUM-2026-09-17.md` "al.sh" akışı).
- **Build ortamı çözülmüş durumda (2026-09-19, Alp doğruladı):** npm, Node.js, bun kurulu; Node
  header'ları **manuel** kuruldu (native modül derlemesi için); kurum içi **npm proxy** ayarlanmış.
  → `NASIL-CALISTIRILIR.md`'deki "saha makinesinde ayrıca doğrulanmadı" uyarısı **artık geçerli değil**
  bu makine için (aşağıda güncellendi).
- **Offline derleme engelleri kaldırıldı (2026-09-21):** sahada `bun install` npm **dışı** iki bağımlılıkta
  (pkg.pr.new/@solidjs/start, github:ghostty-web) ve `bun run build` `models.dev/api.json` fetch'inde
  duruyordu. Çözüm repoya girdi: `alp.sh` (git adımı yok, `--filter="./packages/opencode"` ile yalnız CLI
  workspace'i + repodaki models.dev snapshot). Adım adım: `NASIL-CALISTIRILIR.md` → "Saha kurulumu
  (saha-makinesi, offline)".
- **ara-makine** = git kaynağı, kod buradan çekiliyor (mevcut `al.sh` akışı).
- **ktbulut tarafında ayrı, farklı ad/IP'li bir merkezi satellite sunucu daha var** — orada da
  opencode çalıştırılacak ama **ayrı yönetilecek, ileride** (bu dosyanın kapsamı dışında).

## Erişim/izolasyon (kritik — envanter/ansible/ssh kapsamını belirliyor)

saha-makinesi'in gidebildiği ve **gidemediği** yerler net:

| Hedef | Erişim | Sonuç |
|---|---|---|
| **Kurum-yerel ağ (iki local domain)** | SSH (public-key auth zaten kurulu) + Ansible ile ulaşılıyor | **Asıl çalışma alanı** — envanter, ansible baseline, rke2/rancher teşhisi burada |
| **Kurumun bulut ortamı** | SSH/Ansible ile **erişilemiyor** (izolasyon kesin) | Buradan envanter/iş için SSH/Ansible **denenmemeli** — anlamsız/imkânsız. Bulut-native bir yol (API/CLI) gerekirse ayrı, ileride değerlendirilecek bir konu |
| **Anthos ortamları** | `kubectl get nodes` vb. ile teknik olarak erişilebilir | Otomatik worker autoscale nedeniyle **anlık envanter kararsız/temsili değil** — düzenli envanter kaynağı olarak KULLANILMAYACAK. (Not: bir olay/triage anında "şu an ne çalışıyor" sorusu için tek seferlik sorgu hâlâ değerli olabilir — bu ayrı bir kullanım, "baseline/envanter" değil) |

Bu tablo `knowledge/policy/THREAT-MODEL.md`'deki maskeli `test-sunucu`/`KUME-A`/`KUME-B`
örneklerinin **gerçek şeklini** temsil ediyor — oradaki genel ilke aynı kalıyor, burada yalnız
"hangi ağ segmentine ne zaman SSH/Ansible denenir" netleşiyor.

## Planlanan iş sırası (Alp, 2026-09-19)

0. **Çalışma kökü (Alp, 2026-09-19):** `/root/ai/work/opencode/` — her proje bunun **doğrudan
   altında** kendi klasöründe (`docs/PROJE-YAPISI.md`'deki `~/ansible/<proje-adi>/` kalıbının gerçek
   kökü budur, `projeler/` gibi bir ara katman **yok**). **İlk proje: `envanter`**
   (`/root/ai/work/opencode/envanter/`) — Faz 0'ın ilk görevi burada çalışılacak.
1. **Envanter → Excel/PDF.** Beceri zaten var ve onaylı: `knowledge/skills/approved/rapor-excel-pdf/`
   (AlmaLinux 10.2'de doğrulanmış, 2026-08-29). Çalışma dizini: `/root/ai/work/opencode/envanter/`.
   Ek geliştirme gerekmiyor gibi görünüyor — Faz 0'ın ilk gerçek görevi doğal adayı bu.
2. **Ansible görevler + baseline.** Beceri zaten var ve onaylı: `knowledge/skills/approved/ansible/`
   + `knowledge/skills/approved/filo-durum-kontrolu/`. **Ayrı klasör kararı** (Alp: "diğer
   ansiblelerden ayrı bir klasöre koyarız") zaten belgeli bir kalıba (`docs/PROJE-YAPISI.md`
   "Örnek proje iskeleti") uyuyor — kendi proje klasörü (ör. `/root/ai/work/opencode/<proje-adi>/`)
   içinde `ansible/` alt klasörü (`playbooks/`, `roles/`, `inventories/`, `group_vars/`), çıktı için
   `ansible/baseline/` (Alp'in kararı: ya bu ya da düz `baseline/` — ikisi de kabul, `ansible/baseline/`
   seçildi çünkü tüm ansible artefaktları tek klasörde toplanıyor).
3. **SSH ile uzaktan komut (rke2/rancher teşhisi dahil).** Mevcut pubkey auth üzerinden — beceri
   hazır: `knowledge/skills/approved/k8s-rancher/`. **Not (önceliklendirme):**
   `knowledge/runbooks/ssh-forced-command-kurulum.md`'de tarif edilen sunucu-taraflı forced-command
   kapısı, **onlarca hedef sunucuya tek tek kurulacak bir iş** — "kurumun BT işlerini yapmaya
   başlamadan önce şart" değil, mevcut kontroller (client-side `permission.bash: ask/deny`, ansible
   playbook'larının git'te review edilebilir olması) bugün için yeterli bir başlangıç. Forced-command
   kapısını **ilk önce en hassas/az sayıda hedefte** (ör. üretim kümesi giriş noktası) dener, genel
   filoya yaymayı ölçülü şekilde ilerletiriz — minimum efor ilkesiyle uyumlu sıralama.

## Kapsam dışı / ileride

- Kurum bulutu için envanter/otomasyon yolu (API-native) — henüz tanımsız, istenirse ayrı konu.
- ktbulut merkezi satellite sunucusu — ayrı, ileride.
