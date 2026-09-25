# DÖNGÜ GÜNLÜĞÜ — Doktor otonom bakım turları

> Alp'in isteği (2026-09-25): "bir loop koyup geliştirme, bug fix, kontrol vb. işler yap … mimari
> geliştirme de ekleyebilirsin." Kurallar: işler yerel `dongu` dalında, **push yok** (Alp "bas" der),
> `notlar/` ve öneri listesinin Alp/Patron satırlarına dokunulmaz, davranış değiştiren karar →
> "Alp kararı gerekli". Her tur 3-5 satır.

## 2026-09-25 · tur 1
- **Kontroller:** upstream GÜNCEL (1.18.32; 2.0.16 yalnız bilgi) · `audit-log.test.ts` 103/0 ·
  `duman-kontrol-rapor.sh` 22/0 · `bash -n kur.sh` · shellcheck (uyarı) temiz · maskeleme taraması temiz.
- **A16 yapıldı:** kurulumda anahtar 3 yerde dış komut argv'sine gidiyordu (`ps`'te görünür): `/models`
  ve probe `curl -H` → `printf | curl -K -`; config yazan python → ortam değişkeni. Duman testine statik
  A16 kontrolü eklendi (sahte sızıntı satırını yakaladığı doğrulandı) → 23/0.
- **Alp kararı gerekli:** A14 (CI) — fork'ta upstream'in `.github/workflows` dosyaları da duruyor; bizim
  CI'yı eklemeden önce upstream workflow'ları kapatılsın mı? (api.github.com kapalı, durumlarını göremiyorum.)

## 2026-09-26 · tur 2 (Alp: "geliştirme bugfix devam")
- **Kontroller:** upstream GÜNCEL (1.18.32; 2.0.17 yalnız bilgi) · `dongu` main'e rebase edildi ·
  `duman-kontrol-rapor.sh` 23/0 · `audit-log.test.ts` 122/0 · tui `bun test` 196/0 + typecheck temiz.
- **A16 ek düzeltme:** curl config kaçışı — `ab"c\d` anahtarı sessizce `ab`'ye kırpılıyordu (yankı sunucusuyla kanıt).
- **C3 yapıldı:** `script/dogrula-audit-zinciri.sh` + eklentinin gerçek zinciriyle testler.
- **A22 yapıldı (kaynak düzeltmesi):** `write()` sonucu dürüst; `upstream-uygun`. Ürün 1.0.3.
- **C4 kapatıldı:** risk teorik, beceri adı kayıttan önce doğrulanıyor.
- **Alp kararı gerekli:** A22 sahada tam çözüm = `tui.json` `"mouse": false` (fareyle kaydırma gider);
  A14 (CI) sorusu hâlâ açık.

