# opencode — Öneri listesi (sade)

> 2026-09-28'de sadeleştirildi. A1–A35, B1–B8, C1–C20'nin tam metni ve kanıtları:
> `arsiv/ONERI-LISTESI-2026-09-28.md`. Yeni madde tek satır eklenir: `ID · öneri · kaynak · durum`.

## Açık

| ID | Öneri | Kim | Not |
|---|---|---|---|
| A7 | TUI oturum adları okunabilir olsun (`ses_…` yerine konu) | Doktor | düşük öncelik; upstream'in başlık üretimi incelenecek |
| A34 | Envanterdeki düz metin root parolası vault'a taşınsın + parola değiştirilsin | **Alp (saha)** | redaksiyon kaldırıldı; asıl çözüm parolanın dosyada olmaması |
| C8 | `smoke-ikili.sh` sürüm/commit künyesini de doğrulasın | Doktor | küçük |
| S1 | Sahadaki kontrol raporunda `log ! son hata` (2026-09-28 04:59) — kök neden | Doktor | `./kur.sh kontrol --ayrintili` ekranı gerekli |
| M1 | opencode 2.x geçişi | Doktor | npm `latest` 2.x olunca (ADR-0003 m.4, ADR-0005) |

## Kapandı (özet)

- **Yapıldı:** A2–A6, A8–A30, A32, A33, A35 · B1, B2, B4, B5 · C1–C7, C9–C17, C20.
  Öne çıkanlar: K1 değişiklik kapısı (CN/KURULUM/KRİZ, ADR-0004) · fare kapalı/kopyalama (A22) ·
  tekrar tükenme mesajı (A23) · disk-ekleme + paket-uret becerileri · saha sabitleri dosyası (A8/A17) ·
  "işi bitir, eksikte durma" akışı (A18) · izin sınırı = açılış dizini, Claude Code gibi (A35).
- **Geri alındı / iptal (Alp, 2026-09-28 — kurum içi offline, gizleme yok):** A1, A31, C18, C19
  (maskeleme ve redaksiyon) · `topla.sh` (saha→dışarı veri gönderimi yasak) · B3, B6, B7 (süreç önerileri,
  bu sade liste biçimiyle gereksiz).
- **Kural (B8):** her `yapıldı` işi `SURUM-NOTLARI.md`'de tek satır.
