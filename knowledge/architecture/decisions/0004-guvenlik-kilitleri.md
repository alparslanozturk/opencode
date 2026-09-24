# ADR-0004: Güvenlik kilitleri (K1–K7) — kural değil kapı

- **Tarih:** 2026-09-24
- **Durum:** kabul edildi (Alp onayı: "hepsi güzel görünüyor … başla yap")
- **Bağlam:** Sahada model **CN olmadan** gerçek bir değişiklik playbook'u (`03-ipa`, IPA enroll) çalıştırdı
  (A20). CN kuralı yalnız belgedeydi. 2026-09-24 incelemesinde ek açıklar bulundu: (1) izin listesindeki
  `ss*` deseni `ssh`'i, `ps*` deseni `psql`'i kapsıyordu → `ssh sunucu 'rm -rf /data'` **sorusuz**
  çalışıyordu; `find -delete`, `hostname yeniad`, `date -s`, `ip route del` de öyle. (2) opencode'da bir kez
  verilen "always" onayı config'teki deny desenlerini **ezer** (`permission/index.ts` `evaluate` →
  `findLast`, oturum onayları ruleset'ten sonra gelir): `rm a.txt`'e "always" → `rm -rf …` serbest.
  (3) `audit-log.ts` gözlem modunda başlıyordu (`OPS_AGENT_KAPI=ENFORCE` gerekiyordu). (4) git'siz dizinde
  worktree `/` olduğundan eklentinin kapsam denetimi her yolu "proje içi" sayıyordu. (5) `kur.sh`
  `engine/plugins/*.ts` kopyalarken test dosyasını da kopyalıyordu (opencode onu eklenti diye yüklerdi).
- **Karar:**
  1. **K1/K5/K6 eklentide sert red** (`tool.execute.before` throw) — onay ekranı ve "always" açamaz.
     `PERMISSION-MATRIX.md` §5'teki "tek kapı" ilkesi gereği `audit-log.ts` içinde (ayrı eklenti dosyası
     yok; ayrıca opencode eklenti dosyasındaki her fonksiyon export'unu eklenti sanar, yardımcı modül
     ayrılamaz).
  2. **K1 yetkisi yalnız kullanıcı mesajından** (`chat.message`, synthetic parçalar hariç): `CN:` +
     `sunucular:` / `KURULUM` + `sunucular:` / `KRİZ` + kriz metni (≥120 karakter) + `sunucular:`.
     Model bu kanala yazamaz. Oturuma bağlı, 12 saat ömürlü, `YETKİ KAPAT` ile kapanır.
  3. **K2/K3/K4 motorun izin bloğunda** (`engine/opencode.json`) — bunlar "sor" kilitleridir, kullanıcı
     onaylayabilmeli. Eklentideki kapsam kapısı bu yüzden **yalnız kayıt** tutar (sert red onayı imkânsız
     kılardı).
  4. **K7:** varsayılan kilitli; `OPS_AGENT_KAPI=GOZLEM` yalnız insan tarafından, bilerek.
  5. Ürün sürümü 1.0.2 (motor 1.18.32 + kilitler).
- **Alternatifler:**
  1. *Yalnız izin bloğu (deny desenleri).* Reddedildi — "always" ezmesi (bağlam 2) ve `Wildcard`'ın
     olumsuzlama ifade edememesi (`--check` *yokken*) yüzünden kilit olamaz.
  2. *`permission.ask` hook'u ile "sor"a düşürmek.* Bugün mümkün değil: hook plugin API'sinde tanımlı ama
     motor tetiklemiyor (`ONERI-LISTESI.md` C13). Motor yaması gerektirir → ileride `upstream-uygun` aday.
  3. *CN'yi ortam değişkeniyle vermek (`OPS_AGENT_CN=…`, C13 önerisi).* Reddedildi — opencode'u yeniden
     başlatmak gerekir ve kriz akışına (mail yapıştır → sunucuları belirle) uymaz; sohbet satırı hem
     daha doğal hem audit'e aynı zincirle düşüyor.
  4. *Ayrı bir `degisiklik-kapisi.ts` eklentisi.* Reddedildi — §5 "tek kapı" ilkesi; ayrıca red kaydı
     aynı hash zincirine yazılmalı.
- **Sonuç / gerekçe:** Kilitler birim testlerle (`audit-log.test.ts`, 97 test) ve derlenmiş ikiliyle uçtan uca
  (yetkisiz red, CN ile çalışma, listede olmayan hedef, KRİZ maili, K5, K6) doğrulandı. Bilinen sınırlar
  `../../policy/GUVENLIK-KILITLERI.md` "Kilitlerin sınırları"nda; asıl son kapı sunucu tarafı forced-command
  olarak kalır (`PERMISSION-MATRIX.md` §3).
