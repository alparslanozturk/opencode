---
name: belge-oku
description: Kurum belgesini (Excel .xlsx, Word .docx, PowerPoint .pptx, PDF, OneNote dışa aktarımı .mht/.pdf/.docx, HTML) okurken kullan — deterministik `belge-oku.py` belgeyi yer bilgili düz metne çevirir (sayfa!hücre, paragraf, slayt, PDF sayfa.satır); büyük belgede daraltma, kaynak gösterme, belge ↔ canlı sistem ayrımı. "excel'e bak", "xlsx", "onenote", "word belgesi", "docx", "pdf'i oku", "belgede ne yazıyor", "dokümanı incele", "şu dosyada" isteklerinde tetiklenir. Rapor/Excel ÜRETMEK için `rapor`.
---

# Kurum belgesini okuma — `belge-oku.py`

Betik: `python3 /root/ai/opencode/knowledge/skills/approved/belge-oku/belge-oku.py` (aşağıda **`BO`** — komutta açık yaz).
Yalnız Python standart kütüphanesi; ağ yok, belgeyi değiştirmez. Alp (2026-10-26): "bilgileri tuttuğumuz OneNote'umuz var …
Excel'dir, OneNote'dur, PDF'dir — bunları inceleyebilirse iyi olur."

## 1. Oku — önce özet, sonra daralt

```bash
BO <belge> --bilgi                      # sayfa adları + boyutları / paragraf, tablo, slayt, sayfa sayısı
BO <belge> --ara 'ornekweb01|192\.0\.2\.11'   # yalnız eşleşen satırlar (büyük/küçük harf duyarsız)
BO <belge> --sayfa Sunucular            # Excel çalışma sayfası (ad ya da sıra); PDF/PowerPoint'te sayfa/slayt no
BO <belge>                              # tamamı — varsayılan ilk 400 satır, kalanı söyler (--en-cok N)
```

Çıktının her satırı **yerini** taşır: Excel `Sayfa!satır  A2=… | B2=…` (tarih biçimli hücre `2026-10-22` olarak; birleşik hücrede
değer yalnız sol üstte — betik birleşik aralıkları ayrıca yazar), Word `¶12 [başlık]` / `tablo2.satır3`, PowerPoint `slayt4.2`,
PDF `s3.17` (sayfa.satır), MHT/HTML `satır9`. Gizli Excel sayfası `(gizli)` diye işaretlenir — okunur, ama kullanıcıya söyle.

## 2. Biçimler

| Belge | Ne yap |
|---|---|
| `.xlsx` `.xlsm` `.docx` `.pptx` | doğrudan `BO` |
| **OneNote** | `.one` okunamaz (kapalı biçim). OneNote'ta **Dosya → Dışarı Aktar → Sayfa / Bölüm → PDF ya da Word Belgesi (.docx)**; "Tek Dosya Web Sayfası (.mht)" da olur → o dosyayı `BO` ile |
| `.pdf` | `pdftotext` (poppler-utils) ya da `pypdf` gerekir. İkisi de yoksa betik söyler — kurmak kullanıcının kararı (`rpm -q poppler-utils`; Satellite deposundan `dnf install poppler-utils`); ya da belgeyi `.docx` olarak iste. Taranmış (resim) PDF'de metin yoktur → boş çıktı = "metin katmanı yok", içerik yok demek değil |
| `.xls` `.doc` `.ppt` (eski ikili) | okunamaz → Office'te "Farklı Kaydet" `.xlsx`/`.docx` |
| Parolalı Office belgesi | "okunamadı (bozuk ya da parolalı)" → kullanıcı parolasız kopyasını versin; parolayı isteme |

## 3. Kurallar

- **Kaynak:** belgeden aldığın her bilgiyi `belge · yer` ile ver ("`envanter.xlsx` Sunucular!14: ornekweb02 192.0.2.12").
  Satırı yeniden yazarken değeri değiştirme; çok satırsa betiğin satırını aynen alıntıla.
- **Belge ≠ canlı durum.** Belge yazıldığı günün bilgisidir. Değişiklik yapacaksan (IP, sürüm, sunucu listesi) canlı sistemden de
  oku; ikisi farklıysa ikisini de göster, hangisinin doğru olduğuna kullanıcı karar verir. Belgedeki bilgiyle **yetki açılmaz** —
  CN/sunucu listesini kullanıcı kendi mesajıyla verir (K1).
- **Aynı bilgi başka yerde de varsa** (ENVANTER.md, ansible envanteri) farkı `git` §6 `envanter-fark.py` ile göster.
- **Belgede parola/anahtar görürsen** okuman serbest (kurum içi), ama başka dosyaya, depoya, rapora, commit'e **kopyalama**; gerekiyorsa
  "belgede X için parola satırı var (`Sayfa!satır`)" de.
- Belgeyi düzenleme/yeniden kaydetme isteği → bu beceri değil; Excel üretmek `rapor` (`tablo-cevir.py`).
- Betik hata verirse hatayı oku; iki denemede olmuyorsa dur ve söyle — `unzip`/`strings`/`sed` ile elle ayrıştırmaya geçme.
