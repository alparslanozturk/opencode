# UZAK-ISLEM-ARAC-SECIMI.md — ssh / ansible ad-hoc / playbook seçim rehberi (A41)

> Kaynak: Alp, 2026-09-24 10:14–10:15 — *"anlık durumlarda uzaktan komut belki iyi olabilir...
> ansible adhoc var ssh var ve playbook seçenekleri var; doktor hangisinin nerede seçileceğini
> yazsın"* (A41). Bu politika A41'i **yumuşatır**: "her zaman playbook" değil, **doğru araç**
> ilkesi. İzin/onay mekaniği için `PERMISSION-MATRIX.md`, tehdit bağlamı için `THREAT-MODEL.md`.
>
> Maskeleme: sunucu → `test-sunucu`, küme → `KUME-A`/`KUME-B`, IP → `10.0.0.x`, kurum → `kurum`.

## 1. Karar tablosu

| Araç | Ne zaman | Notlar |
|---|---|---|
| **ssh (tek satır)** | Anlık / tek seferlik **okuma + teşhis** | Hızlı, idempotent değil, kalıcı kayıt yok; **yazma yok** |
| **ansible ad-hoc** (`-m ... -a ...`) | Birkaç uçta **tekrarlanan tek komut** (okuma/teşhis veya düşük riskli tek işlem) | İdempotent değil; kalıcı durum değişikliği için kullanılmaz |
| **playbook** | Kalıcı / tekrarlanabilir **durum** (paket, kurulum, config) | İdempotent + raporlanabilir; **onay kapısı şart** |
| **satellite/SEPM** | Yönetilen **toplu** iş | Kurumsal yönetilen envanter üzerinden |

## 2. Kurallar

1. **Varsayılan önce OKU.** Yazma/uygulama = **playbook + onay kapısı**.
2. **Kendi kafasına playbook yazmak yasak** → önce öneri metni → Alp onayı → sonra uygula.
3. **ad-hoc / ssh yalnız okuma-teşhis ve anlık iş içindir**; uçlarda kalıcı yazma yapılmaz.
4. **Her uygulama audit edilir:** araç + uç(lar) + kaç değişiklik — bkz. `AUDIT-FORMAT.md`.
5. Envanterde **AD hostname** kullanılır (bkz. `engine/AGENTS.md` "SSH ve Kubernetes erişimi"),
   IP değil.
6. **Kaynak yoksa uydurma yok** (bkz. `KAYNAK-ZORUNLULUGU.md`) → bilinmeyen `[SAHA]` işaretlenir
   ve Alp'e sorulur.

Bu tablo `engine/AGENTS.md`'deki "Envanter / rapor işleri" kural hiyerarşisiyle aynı ilkeye
dayanır: kullanıcı açık yetki vermediyse (`CN:`/`KURULUM`/`KRİZ`, bkz. `engine/AGENTS.md`
"Güvenlik kilitleri") kalıcı değişiklik hiçbir araçla yapılmaz — bu dosya yalnız "yetki varsa
hangi aracı seç" sorusunu yanıtlar.

## 3. Örnek senaryolar

1. **"X servisi ayakta mı?"** → **ssh** tek satır okuma.
   `ssh root@<hedef> "systemctl is-active <servis>"` — tek uç, tek okuma, kayıt gerekmez.
2. **"10 uçta disk doluluk yüzdesini topla"** → **ansible ad-hoc** (tek modül, çok uç).
   `ansible <grup> -m shell -a "df -h /"` — tekrarlanan aynı okuma komutu, çok hedef; hâlâ
   yazma yok.
3. **"Tüm uçlara şu paket kurulsun / config sabitlensin"** → **playbook** + onay.
   Önce playbook taslağı (`--check` ile doğrulanabilir) Alp'e önerilir; onay olmadan
   `ansible-playbook` **çalıştırılmaz** (bkz. `engine/opencode.json` → `ansible-playbook*: ask`,
   `PERMISSION-MATRIX.md` §2).

## Bu doküman neyi kapsamıyor

SSH forced-command tasarımı (`PERMISSION-MATRIX.md` §3), yetki/kriz akışı (`engine/AGENTS.md`
"Güvenlik kilitleri") — burada yalnız **araç seçimi** ele alınmıştır.
