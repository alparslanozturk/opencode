# Dersler — 2026-09-22 (derlenmiş ikili `a.name` çökmesi)

Olay: [[2026-09-22-derlenmis-ikili-a-name-cokmesi]] (`knowledge/incidents/`). Bu görev sonucunda
çıkan kısa dersler — onay bekleyen öneri değil, tekrar aynı hataya düşmemek için kayıt.

- **Tek-dosya `bun build --compile` + `splitting: true` = döngüsel import sırası bozulur.**
  `splitting` tarayıcı paketleri için lazy-chunk özelliğidir; tek dosyalık `compile` çıktısında
  faydası yok ama dairesel import'ları ayrı chunk'lara bölüp değerlendirme sırasını bozabiliyor.
  Tek-dosya derleme hedefleyen her `Bun.build({ compile: true, ... })` çağrısında `splitting: false`
  varsayılan olmalı.
- **Aynı repoya iki kod ajanını aynı anda verme.** Bugün yaşandı: dosya çakışması + geri alma —
  paralel ajanlar aynı dosyaları düzenleyince biri diğerinin değişikliğini eziyor, kim neyi ne zaman
  yazdığı belirsizleşiyor. Aynı depoda eşzamanlı iki ajan çalıştırılacaksa ayrı worktree/branch
  kullanılmalı.
- **"Sahaya özel mi?" sorusunu yerel repro ile kapat.** İzole `HOME` + boş çalışma dizini + sahte
  sağlayıcı config'i ile ~2 saniyede birebir tekrarlanabildi — saha ile yerel arasında "acaba
  ortama mı özel" tartışmasına gerek kalmadı, kök neden doğrudan koda indirgendi.
- **Kaynaktan koşmak (`bun run src/index.ts`) ikili-vs-kaynak ayrımını saniyeler içinde verir.**
  Aynı komut kaynaktan çökmüyor, derlenmiş ikiliden çöküyorsa sorun kesinlikle derleme/paketleme
  adımındadır — kod tarafında zaman kaybetmeden doğrudan `build.ts`'e bakılmalı.
