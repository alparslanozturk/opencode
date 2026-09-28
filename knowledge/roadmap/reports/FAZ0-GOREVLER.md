# Faz 0 — 3 salt-okunur saha görevi (tanım)

Koşu Alp'in (sahada, offline). Her görev için sonuç `FAZ0-GOREV-SABLONU.md` ile yazılır; kabul
`PHASE0-ACCEPTANCE.md` §2'ye göre Alp'indir. Hepsi salt-okunurdur — K1 kilidi değişiklik gerektiren
hiçbir komutu çalıştırmaz, bu yüzden CN gerekmez. Kapsam: opencode'u envanterin olduğu dizinde aç.

## G1 — Disk doluluk raporu
- **İstem:** "Envanterdeki `<grup>` sunucularında disk doluluğunu çıkar; %80 üstü bölümleri tablo yap."
- **Beklenen komut:** `ansible <grup> -i <envanter> -m command -a "df -hP"` (ya da sunucu başına `ssh <h> df -hP`)
- **Beklenen çıktı:** tablo `sunucu · bağlama noktası · boyut · kullanılan · %` + sonda eşik üstü sayısı.
- **Baseline:** Alp aynı grupta `df -hP`'yi elle koşar; sayılar birebir eşleşmeli.

## G2 — Başarısız servis raporu
- **İstem:** "`<grup>` sunucularında başarısız systemd servislerini listele, her biri için son 5 log satırını ver."
- **Beklenen komut:** `systemctl --failed --no-legend` + `journalctl -u <servis> -n 5 --no-pager`
- **Beklenen çıktı:** `sunucu · servis · durum · son hata satırı`; başarısız yoksa "yok" (uydurma yok).
- **Baseline:** Alp'in `systemctl --failed` çıktısı.

## G3 — Saat senkronu (NTP/chrony)
- **İstem:** "`<grup>` sunucularında saat senkronunu kontrol et; kaynağı ve sapmayı raporla."
- **Beklenen komut:** `chronyc tracking` + `chronyc sources -n`
- **Beklenen çıktı:** `sunucu · referans kaynak · sapma (ms) · senkron mu`; `saha-sabitleri.md`'deki NTP
  kaynağıyla uyuşmayanlar ayrıca işaretlenir.
- **Baseline:** Alp'in `chronyc tracking` çıktısı.

## Her görevden sonra
- `bash script/dogrula-audit-zinciri.sh` → çıkış 0 (zincir sağlam); audit satır sayısını şablona yaz.
- Kapsam dışı deneme var mı: audit'te `result_status: denied` / `asked` satırlarına bak.
