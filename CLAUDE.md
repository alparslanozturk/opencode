# opencode fork'u — Doktor (Claude Code) için proje kuralları

Kurum içi kodlama ajanı kiti: upstream opencode + `engine/` (ayar, AGENTS.md, plugin) + `knowledge/`
(beceri, runbook, politika). Mimari ve katman sırası: `MIMARI.md`. Çalıştırma/sorun giderme:
`NASIL-CALISTIRILIR.md`. Saha kurulumu: `ALP-README.md` (`./kur.sh`).

> Kökteki `AGENTS.md` **upstream'in** dosyasıdır (kod stili için geçerli). Oradaki "varsayılan dal `dev`"
> bilgisi bu fork için geçerli değil — bizim dalımız **`main`**.

## Kaynak zorunluluğu — uydurma yasak

Global kural (`~/.claude/CLAUDE.md`) burada da geçerli. Projeye özel ekler:

- Politika metni: `knowledge/policy/KAYNAK-ZORUNLULUGU.md`. Sahadaki model için karşılığı `engine/AGENTS.md`
  "Kaynak zorunluluğu" bölümü. Beceri/doküman yazarken bu kurala uymayan içerik ekleme.
- **Sürüm/uyumluluk (Rancher, RKE2/Kubernetes, Antrea, RHEL) tahmin edilmez:** yalnız
  `knowledge/skills/approved/rke2-ansible/` içindeki çevrimdışı veri tablosundan ya da bir aracın çıktısından.
  Veri yoksa "hesaplanamadı (veri yok)".
- Saha bilgisi (sunucu adı, uç, ağ) bilinmiyorsa `[SAHA]` işaretle ve Alp'e sor.

## Çalışma

- **Oturum başı:** `script/upstream-kontrol.sh` çalıştır, sonucu tek satırla söyle
  (runbook: `knowledge/runbooks/upstream-guncelleme.md`; 2.x geçişi ayrı karar, ADR-0003).
- **Upstream felsefesi (Alp, 2026-10-05):** yeniyi uygula → bizim işlerimizi (ADR-0006 yama tablosu,
  `engine/plugins`, beceriler, `kur.sh`) yeni sürümle karşılaştır → upstream aynı işi yapıyorsa bizimkini
  ona uyarla/yamayı düşür → Alp'e haber ver. Mimari önerin varsa çekinmeden söyle.
- **Typecheck:** kökten `bun run typecheck` güvenli (`script/safe-concurrency.sh` concurrency'yi sınırlar).
  Elle `bun turbo typecheck` çağırıyorsan aynı sınırı kullan — sınırsız çalıştırma makineyi donduruyordu.
- **Değişiklik sırası:** önce `engine/opencode.json` → `engine/AGENTS.md` → `knowledge/skills/` →
  `engine/plugins/` → en son fork kodu (`MIMARI.md`).
- **Beceriler:** `knowledge/skills/approved/` sahada okunan tek yer; `parked/` varsayılan kurulumda yok.
- Commit: yazar `alpozturklive`, `tip(alan): özet` biçimi, AI atıf satırı yok.
