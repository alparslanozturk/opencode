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
