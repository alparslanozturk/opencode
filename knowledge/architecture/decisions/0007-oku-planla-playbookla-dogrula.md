# ADR-0007: Oku → planla → playbook'la değiştir → doğrula (mimari yeniden tasarım önerisi)

- **Tarih:** 2026-11-03
- **Durum:** kısmen kabul — §7: değişiklikte varsayılan ad-hoc SSH + adım başına onay; playbook isteğe bağlı
- **Bağlam:** Alp (2026-11-03): "Mimariyi genel olarak tekrar düşünüp tasarlayabilir misin?" — öncesinde: "böyle şeyler için Ansible
  playbook yazmak daha mantıklı … yakında playbook çalıştıran bir kontrol merkezi yapacağız."

## 1. Bugünkü durum — ölçülen

| Ölçü | Değer (2026-11-03, depo) |
|---|---|
| Onaylı beceri / betik | 41 / 24 (`knowledge/skills/approved/*/*.py`) |
| `engine/AGENTS.md` | 372 satır, 30+ bölüm |
| Kilit çekirdeği `engine/plugins/lib/kilit.ts` | 1983 satır; salt-okunur komutlar ve beceri betikleri **elle listelenir** |
| Saha gözlemi | Ekim–Kasım dosyasında 122 G kaydı |

Çalışan: geliştirme döngüsü (saha ekranı → G kaydı → beceri/betik/kilit → `git pull && ./kur.sh`), "ağır iş betikte" ilkesi
(disk-durum, filo-tablo, nfs-tani …), kilidin değişikliği onay ekranına düşürmesi.

Tekrarlayan sorunlar (kanıt):
1. **Değişikliği model her seferinde yeniden kuruyor.** G121: `/data` → `/` dört sunucuda; disk harfi sunucuya göre sda/sdb. İlkinde
   doğru gitti; diğerlerinde aynı komut dizisi sunucu başına yeniden üretiliyor — sapma riski modelde. G116: çift `-l` (son `-l` kazanır),
   compose yerine Redis araması.
2. **Uzun metin kural sahadaki 35B modelde tutmuyor.** G119/G120: CN alanına ekip adı yazıldı, yazılmamış "kayda geçti"; düstur
   metni olmasına rağmen çelişen DNS değerleri işaretlenmedi. Kural ekledikçe AGENTS.md büyüyor, uyum artmıyor.
3. **Kilit "izin listesi" büyüdükçe yanlış pozitif üretiyor.** G121: salt-okunur disk incelemesi önce K6'ya (kurulu beceri yolu), sonra
   onay ekranına (betik listede yok) takıldı. Her yeni okuyan betik bir `kilit.ts` değişikliği istiyor.
4. **Beceri yönlendirmesi kaçıyor.** G119: "Açık sistem 2. onay" isteğinde `rhel-teslim` yüklenmedi (tetik sözcüğü yoktu).
5. **Geriye dönük sınama yok.** Düzeltmenin aynı saha isteğinde işe yaradığını ancak bir sonraki saha ekranında görüyoruz.

## 2. Karar (öneri): dört düzlem

```
 kullanıcı isteği
   │
   ▼
 ① OKU (serbest, onaysız)      ajan + salt-okunur komut + deterministik betik → KV/tablo, her olgu kaynaklı
   │
   ▼
 ② PLANLA (ajan yazar, insan onaylar — TEK onay)
   │   çıktı: iş paketi = katalogdaki playbook adı + iş envanteri + host_vars (sunucu başına disk/VG/LV …) + --check çıktısı
   ▼
 ③ DEĞİŞTİR (yalnız gözden geçirilmiş playbook; bugün opencode'dan, yarın kontrol merkezinden — aynı paket)
   │   playbook içinde assert koruması: koşul tutmazsa o sunucuda durur (disk OS diski mi, /data boş mu, LV var mı …)
   ▼
 ④ DOĞRULA (ajan + betik)       hedefte ölç: filo-tablo --kv, postcondition — "yaptım" yalnız buradan
```

### ① Okuma — ajanın asıl gücü
- Keşif, teşhis, karşılaştırma ajan işidir; burada model esnekliği değerli. Kural: **ham çıktı → betik → karar** (bugünkü ilke korunur).
- **Kilit sadeleşir:** okuyan betikler `kilit.ts`'te elle listelenmez; betiğin ilk satırlarındaki işaret (`# kilit: okur`) okunur, işaretin
  doğruluğunu **test denetler** (betikte yazma `open(…'w')`, `subprocess`, `os.remove` … yok — bugün elle yaptığım denetimin otomatiği).
  Kurulu kopya (`~/.config/opencode/skills/…`) ve kit yolu aynı kabul edilir.

### ② Planlama — iş paketi
- Ajan değişikliği komut komut çalıştırmaz; **iş paketi** üretir: `is/<CN|is>-<YYYYMMDD-HHMM>/` → `hosts.ini`, `host_vars/<sunucu>.yml`
  (okuma aşamasının betik çıktısından — model elle değer yazmaz), `plan.md` (ne, neden, risk, geri dönüş), `check.txt` (`--check --diff`).
- Kullanıcı **paketi bir kez** onaylar; bugünkü "her komutta onay ekranı" değişiklik için de geçerli kalır ama tek komuta iner
  (`ansible-playbook … -l <sunucu>`).

### ③ Değişiklik — playbook kataloğu
- Tekrarlanan her değişiklik bir playbook: kurumun numaralı seti (01-ping … 12-captcha) + eksikler (ör. `/data` → `/`, SEP istisna, compose
  durdur/başlat). Her playbook: `assert` ön koşulları, idempotent, `--check` destekli, sonda postcondition `assert`.
- **Ad-hoc değişiklik istisna olur:** katalogda karşılığı yoksa bugünkü yol (K1 onay ekranı) sürer, ama iş bitince "bu tekrar ederse
  playbook'a çevir" önerisi G kaydına yazılır.
- `playbook-denetim.py` (var) katalog için zorunlu kapı: bilinen hata kalıpları + "assert'siz yıkıcı görev" kuralı eklenir.
- **Kontrol merkezi:** paket biçimi (envanter + host_vars + playbook adı) doğrudan iş şablonuna taşınır; ajan o zaman paketi oraya
  gönderir ya da kullanıcı yükler. Hangi ürün olacağı açık soru — biçim ürünsüz tutulur.

### ④ Doğrulama
- Her playbook'un sonucu ajan tarafından **hedefte** okunur (`filo-tablo.py --kv`); özet yalnız ölçülenlerden (G120 dersi), verilmeyen alan
  "verilmedi".

### Bilgi katmanı — kısaltma
- **AGENTS.md** ≤ ~120 satır: kimlik, dört düzlem, düstur (önce sor + kanıt), yönlendirme tablosu. Konu kuralları becerilere iner.
- **Yönlendirme:** `görev sözcükleri → beceri` tek tablo (AGENTS.md başında) + test: G kayıtlarındaki gerçek saha cümleleri doğru beceriye
  eşleniyor mu (betikle, modelsiz — sözcük eşleşmesi).
- **Saha geri sınaması (eval):** her G kaydından bir vaka: istek + kaydedilmiş sunucu çıktısı (ssh yerine dosya) + beklenen karar. Betik/kilit
  vakaları modelsiz koşar (bugün 196 + 343 test bunun parçası); model vakaları sahada isteğe bağlı koşar.

## 3. Geçiş — kırmadan, adım adım

| Adım | İş | Ölçüt |
|---|---|---|
| 1 | Kilitte betik işareti + statik denetim testi (elle liste kalkar) | 343 test + yeni denetim yeşil |
| 2 | İş paketi biçimi + `is-paket.py` (okuma çıktısından host_vars üretir) — ilk örnek `/data` → `/` | G121 çıktısıyla paket üretilir |
| 3 | İlk katalog playbook'u: `disks-data-to-root` (assert'li) + `playbook-denetim` kuralı | `--check` sahada temiz |
| 4 | AGENTS.md kısaltma + yönlendirme tablosu + yönlendirme testi | G119 cümlesi `rhel-teslim`'e eşlenir |
| 5 | Saha geri sınaması iskeleti (`knowledge/eval/`), G116–G121'den ilk vakalar | vakalar CI'da koşar |
| 6 | Kontrol merkezi seçilince paket → iş şablonu köprüsü | ürüne göre |

## 4. Alternatifler

- **Bugünkü gibi devam (ajan komut komut değiştirir):** esnek ama sapma modelde; kilit listesi büyümeye devam eder. Reddedildi önerisi.
- **Her şey playbook, ajan yalnız tetikler:** keşif/teşhis gücü kaybolur; katalogda olmayan iş yapılamaz. Okuma ajanda kalmalı.
- **Daha büyük model:** sapmayı azaltır ama kanıt/kural sorununu çözmez ve saha altyapısı Alp'in kararı; mimari modelden bağımsız kalmalı.

## 5. Açık sorular (Alp)

1. Katalog playbook'ları nerede yaşar: sahadaki `ansible/playbooks/` (kurum deposu) mu, bu depoda şablon olarak mı? (Saha → dışarı veri
   yasağı: kurum değerleri bu depoya girmez; bu depo yalnız değersiz iskelet + assert kalıbı taşıyabilir.)
2. Kontrol merkezi: AWX / AAP / başka? Ne zaman?
3. Baseline projesiyle ilişki: o proje de aynı katalog mu, ayrı mı kalacak?
4. Onay modeli: "paket başına tek onay + playbook komutunda onay ekranı" yeterli mi, yoksa production'da ikinci kişi onayı mı?
5. Geçiş sırası: tablodaki 1→6 mı, yoksa önce 2–3 (paket + ilk playbook) mu?

## 6. Alp'in cevapları (2026-11-03) ve düzeltilmiş karar

- **Kontrol merkezi:** kuruldu ama aktif değil → bu ADR'de **iş yok** (adım 6 rafta). **Baseline:** ilgisiz → kapsam dışı.
- **İş paketi = kurum iş kaydı:** geçici işlerin planı/çıktısı/sonucu ayrı bir dizinde birikir, zamanla kurumun bilgi tabanı olur
  ("database gibi"). Saha tarafında, normal projelerden ayrı: önerilen `~/ai/work/is-kayitlari/<YYYYMMDD-HHMM>-<etiket>/`
  (`plan.md`, `hosts.ini`, `host_vars/`, `okuma/`, `sonuc.md`) — dizin adı Alp onayı bekliyor. Kurum verisi bu depoya gelmez; bu depo
  yalnız biçimi ve üreten betiği taşır.
- **Onay modeli — "tek onay" kalktı.** Alp her değişiklik komutunu tek tek görüp onaylıyor ve bunu değerli buluyor. Karar:
  - **Ad-hoc yol (seyrek iş):** her değişiklik adımı **ayrı komut** — `&&` zinciriyle birden çok yıkıcı adım tek onaya sığdırılmaz
    (2026-11-03 ekranı: `umount && vgremove -f && pvremove && vgextend && lvextend -r && sed -i fstab` tek satır, fstab yedeği yok).
    Okuma komutları zincirlenebilir.
  - **Playbook yolu (tekrarlanan iş — aynı adımlar ≥2 sunucuda ya da ikinci kez):** görünürlük üç yerden: (1) playbook dosyası ilk
    kullanımda sohbette gösterilir ve bir kez gözden geçirilir; (2) `--list-tasks` + `--check --diff` çıktısı; (3) her sunucu ayrı `-l`
    ile çalışır, görev görev çıktı ekranda. `--step` etkileşimli olduğu için ajan kabuğunda kullanılamaz (stdin yok).
  - Seçim ajanın değil: ajan iki yolu önerir, Alp seçer. Varsayılan: tek sunucu/tek seferlik → ad-hoc adım adım; çok sunucu → playbook.

## 7. Sonuç (Alp, 2026-11-03 — G121 dört sunucu bitti)

"SSH ile bilgileri toplamak ya da bazı ufak komutlara girmek daha mantıklı olabiliyor." → **Varsayılan yol ad-hoc SSH, değişiklik adımı
başına onay** (bugünkü akış). Playbook yalnız kurumun mevcut seti için ya da Alp istediğinde; ajan playbook'a çevirmeyi kendiliğinden
dayatmaz, en fazla bir satırla önerir. ADR'nin geri kalanından geçerli olanlar: okuma → betik → karar, iş kaydı dizini (ad onayı
bekliyor), kilitte betik işareti + statik denetim, AGENTS.md kısaltma + yönlendirme testi, saha geri sınaması.

## 8. Uygulandı (2026-11-03, Alp onayı)

- Kurumsal bilgi (sahada `kurumsal-bilgi.ini`) her oturumda otomatik yüklenir (`kur.sh` → `instructions`); `/kaydet` (parametresiz)
  oturumdan günceller ve düzenler; iş kaydı `rapor/is-kaydi.py`; süzgeç `rapor/oturum-ozet.py`.
- İş haritası `engine/AGENTS.md` başında; gerçek saha cümleleriyle test edilir. Kilitte iz bırakan "okuma" biçimleri kapandı (G122).
- Rafta: kontrol merkezi, playbook kataloğu (§7 — isteğe bağlı), betik işaretiyle kilit listesinin otomatik denetimi.
