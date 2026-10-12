# Saha gözlem günlüğü — 2026-10

Alp'in sahadan (srvsatellite, MobaXterm) gönderdiği ekran görüntülerinden çıkarılan gözlemler.
Amaç: toplu değerlendirme → AGENTS.md / beceri / plugin / kur.sh iyileştirmesi.
Her madde: ne görüldü (kaynak = ekran görüntüsü) · değerlendirme · aday aksiyon. Tahminler "tahmin:" ile işaretli.

## 2026-10-12

### G1 — kur.sh: 2.x derlemesi `@opencode-ai/*@workspace:* failed to resolve`
- Görülen: `git status` → 1.x'ten kalan untracked dosyalar (`specs/project.md`, `specs/tui-package.md`,
  `packages/ui/src/components/*.tsx` …); derleme başarısız, kur.sh eski `bin/opencode` ile devam etti.
- Değerlendirme: 2.0.23 geçişinde (`78839d283c`) paket kapsamı `@opencode-ai/*` → `@opencode/*` oldu;
  2.x'te silinen dizinler (`packages/opencode`, `llm`, `sdk-next`, `slack`, `effect-sqlite-node`, `docs`)
  sahada kalmış, `packages/*` workspace glob'u onları okuyor. tahmin: `al.sh` rsync'i `--delete` olmadan çalışıyor.
- Önerilen çözüm: `git clean -nd` → kontrol → `git clean -fd` → `./kur.sh`. Sonuç: bilinmiyor (Alp'ten bekleniyor).
- Aday aksiyon: kur.sh derleme öncesi `packages/*` altında git'te olmayan package.json varsa durup uyarsın.

### G2 — kur.sh: çıktı sınırı uçtan alınamadı → 4096 token varsayılanı
- Aday aksiyon: Qwen3.6 sunucusunun gerçek `max_tokens` değeri öğrenilip `KURUM_MAX_OUTPUT` yazılmalı (değer: bilinmiyor).

### G3 — Ajan ilk adımda çalışma dizini yerine dışarıya baktı
- İstek (cwd `/root/ai/work/opencode`): "test kümesinin sorunlarını incelemek istiyorum, sadece okuma… disk, cpu,
  ram, network darboğazı nasıl bakarız?"
- Görülen: ilk komut tek satırda `ls /etc/rancher/rke2/; ls ~/rke2-ansible*; …; ~/.kube/config; env | grep -i kube`
  + `~/ansible` altında Glob → `external_directory` izni istendi (`/etc/rancher/*`, `/root/*`, `/root/ansible/*`,
  `/root/.kube/*`). Alp **reddetti** — envanter zaten alt dizindeydi.
- Ret sonrası: ajan `ansible/inventories` içinde grep yaptı, 8 "test" kümesini satır numarasıyla listeleyip
  "hangisi?" diye sordu. ✅ Doğru davranış (kaynaklı, varsaymadı, sordu).
- Değerlendirme: `engine/AGENTS.md` "Çalışma dizini kapsamı" kuralı (önce cwd, dışarı çıkarken gerekçeyle tek tek
  izin) ilk adımda uygulanmadı; deterministik kapı (`external_directory: ask`) yakaladı. Yani prompt kuralı
  tutmadı, izin kapısı tuttu.
- Aday aksiyon: AGENTS.md'ye "envanter/küme sorusunda önce cwd'de `hosts*`/`inventories` ara" adımı; birden çok
  dış dizini tek komutta toplamama.
