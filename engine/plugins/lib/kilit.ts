// kilit.ts — motordan BAĞIMSIZ çekirdek: güvenlik kilitleri K1/K5/K6 (ADR-0004) + yetki satırı okuma.
// ADR-0005: motor kancasına bağlı hiçbir şey yok — girdi (araç adı, argümanlar, çalışma dizini, yetki) alır,
// karar döndürür. 1.x adaptörü: ../audit-log.ts (tool.execute.before + chat.message); 2.x: tool "execute.before"
// + session "prompt" (+ istenirse permission "evaluate" ile "sor").
import { readFileSync } from "fs"
import { hostname, userInfo } from "os"
import { dirname, isAbsolute, join, resolve } from "path"
import { isInside } from "./maskele"
import { envanterAyristir, type Envanter } from "./envanter"

// Audit log yolu: ajanın kendi kaydı K6 ile korunur. Adaptörle aynı kaynaktan (ortam değişkeni) okunur.
export const auditLogYolu = () => process.env.OPS_AGENT_AUDIT_LOG ?? "/var/log/ops-agent/audit.jsonl"

// --- güvenlik kilitleri (K1-K7, ADR-0004, knowledge/policy/GUVENLIK-KILITLERI.md) ------------
// Neden izin bloğu değil de burası: opencode'da oturumda verilen tek bir "always" onayı (ör. `rm a.txt`
// → oturuma `rm *` allow kuralı) config'teki deny desenlerini EZER (permission/index.ts `evaluate` →
// `findLast`, onaylar ruleset'ten sonra gelir). Kilitler bu yüzden before-hook'ta sert red (throw)
// olarak durur: kullanıcının "always"ı da modelin isteği de bunları açamaz. K1'i yalnız kullanıcının
// KENDİ mesajındaki yetki satırı açar (chat.message — model bu kanala yazamaz); K5/K6 hiç açılmaz.
//
//   K1 değişiklik kilidi: sunucuda/sistemde değişiklik = CN + sunucu listesi (ya da KURULUM + liste,
//      ya da KRİZ + yapıştırılmış kriz maili/toplantı notu + liste). Hedef listede değilse red.
//   K5 yıkıcı komut kilidi: `rm -rf /`, mkfs, diske dd, force-push … yetkiyle bile açılmaz.
//   K6 öz-koruma: model kendi ayarını/eklentisini/audit log'unu değiştiremez, ayar dosyasındaki
//      anahtarı okuyamaz, kilitsiz ikinci bir opencode başlatamaz.
//   (K2 dizin dışı, K3 okuma, K4 izin listesi = engine/opencode.json `permission` bloğu.)

export type YetkiTur = "CN" | "KURULUM" | "KRIZ"
export interface Yetki {
  tur: YetkiTur | null
  cn: string | null
  krizMetni: boolean
  sunucular: string[]
  zaman: number
  uyari?: string
  // G74: yetki verildiği anda envanterden genişletilmiş liste (ad, kısa ad, ansible_host IP'si, grup üyeleri). Denetim
  // bununla yapılır; sonradan envanter dosyası değişse de verilmiş yetki genişlemez.
  esler?: string[]
  envanterNotu?: string
  // G98: kullanıcı kriz/CN beyanıyla ajanın önerisini onayladı ("evet, sadece onu restart et") ama ad yazmadı → bir sonraki
  // model isteğinde ajanın HEMEN ÖNCEKİ mesajındaki açık `sunucular:` satırı listeye alınır (denetim.ts oneriyleTamamla).
  oneriBekliyor?: number
  oneriden?: boolean
  // G100 (Alp, 2026-10-22: "bir cümlede hem sunucu listesi hem değişiklik numarası vermek zorunda mıyım? garabet"): beyandan
  // ÖNCE ayrı mesajla verilen yalın sunucu listesi — ardından gelen sunucusuz CN/KURULUM/KRİZ beyanı bu listeye uygulanır.
  aday?: { sunucular: string[]; zaman: number }
}
export const YETKI_OMRU_MS = 12 * 60 * 60 * 1000
// Kriz mesajında yetki satırları dışında en az bu kadar metin (yapıştırılmış mail/toplantı notu) olmalı.
export const KRIZ_METNI_MIN = 120

// Türkçe büyük harf: JS /i bayrağı İ/ı'yı I/i ile eşlemez — önce tek biçime çekilir.
export const buyuk = (s: string) => s.replace(/İ/g, "I").replace(/ı/g, "i").toUpperCase()

export interface YetkiSatiri {
  tur?: YetkiTur
  cn?: string
  sunucular?: string[]
  kapat?: boolean
  uyari?: string
  govde: number
  // G100: beyan (CN/KURULUM/KRİZ) OLMAYAN mesajdaki adlar — yetki değildir; denetim.ts yetkiIsle ayrı mesajlı beyanla birleştirir.
  adaylar?: string[] // mesajın tamamı yalın liste (alt alta / virgüllü; "sunucu listesi" başlığı olabilir)
  cumleAdlari?: string[] // "sunucu/host/node" geçen cümledeki sunucu biçimli adlar
}

// --- serbest biçim (Alp, 2026-10-17: "formatsız verdiğimde anlayabiliyor olması lazım — bu bir zeka göstergesi") ---
// CN satır başında olmak zorunda değil: CHG/CRQ/RFC numarası ya da "change / değişiklik numarası …" cümle içinde
// tanınır; birden çok numara olabilir. Sunucular: "sunucular: …" (eski biçim) + sunucu sözcüğü ya da CN geçen satırdaki
// sunucu BİÇİMLİ adlar (IP, FQDN, rakamlı ad) + bu satırların altındaki alt alta / maddeli liste. Güvenlik sınırları:
// "hariç / dışında / değil" geçen satır listeye eklenmez (uyarı); KRİZ mesajında yalnız açık "sunucular:" satırı geçerli
// (yapıştırılan mail kendiliğinden yetki açmaz — AGENTS kriz akışı).
const CN_KIMLIK = /(?:^|[^A-Z0-9])((?:CHG|CRQ|RFC|CR|DN)[-_]?\d{4,})(?![A-Z0-9])/g
const CN_CUMLE = /(?:^|[^A-Z0-9])(?:CN|CHANGE|DE[GĞ]I[SŞ]IKLIK)(?:\s+(?:NO|NR|ID|NUMBER|NUMARA[A-ZÇĞÖŞÜ]*|KAYD[A-ZÇĞÖŞÜ]*|KAYIT))*\s*[:#=]?\s*([A-Z]{0,4}[-_]?\d{4,})(?![A-Z0-9])/g
const SUNUCU_SOZ = /(?:^|[^a-zçğıöşü])(?:sunucu|hedef|makine|host|node|server)/i
const OLUMSUZ = /(?:^|[^A-Z])(?:HARI[CÇ]|DI[SŞ]INDA|EXCEPT|OLMADAN|DE[GĞ]IL)(?![A-Z])/
// KRİZ beyanı (Alp, 2026-10-20: "kriz var deyince ya da değişik bir cümlede geçince kabul etmesi lazım"): satır başında
// "KRİZ" ya da cümle içinde beyan biçimi — "kriz var", "kriz durumu(ndayız)", "krizdeyiz", "kriz yaşıyoruz", "acil kriz",
// cümle sonu "bu bir kriz." Sözün yalnız geçmesi beyan değil: "kriz raporunu incele", "kriz yok/değil/bitti", "kriz mi?".
const KRIZ_OLUMSUZ = /^\s*(?:YOK|DE[GĞ]IL|BITTI|KAPANDI|SONA|ATLATILDI|M[IUİÜ](?![A-ZÇĞÖŞÜ]))/
const KRIZ_BEYAN_SONRA = /^(?:\s*(?:[.,!:;)\-–—]|$)|\s+(?:VAR|DURUM|ILAN|MOD|AN[IİI](?![A-Z])|ANINDA|YA[SŞ]|[CÇ]IKTI|OLDU|BA[SŞ]LADI|S[UÜ]R[UÜ]YOR|HAL[IİI]NDE|ACIL))/
// Yazım hatası toleransı (saha G78: Alp "kiriz var" yazdı, tanınmadı): KIRIZ / KRİİZ → KRIZ.
function krizBeyani(ham: string): boolean {
  // yazım hatalı biçim ("kiriz", "kriiz") yalnız beyan sözcüğüyle birlikte sayılır — "bardakları kırız" (kırarız) beyan değil
  const b = ham.replace(/(^|[^A-Z0-9ÇĞÖŞÜ])(?:KIRI+Z|KRII+Z)(?=\s+(?:VAR|DURUM|ILAN|MOD|YA[SŞ]|BA[SŞ]LADI|OLDU|[CÇ]IKTI|S[UÜ]R[UÜ]YOR|HAL[IİI]NDE)|DEY)/g, "$1KRIZ")
  if (/(?:^|[^A-Z0-9ÇĞÖŞÜ])KRIZDEY[IİU]?[MZ](?![A-ZÇĞÖŞÜ])/.test(b)) return true
  for (const m of b.matchAll(/(?:^|[^A-Z0-9ÇĞÖŞÜ])KRIZ(?![A-Z0-9ÇĞÖŞÜ'’])/g)) {
    const sonra = b.slice((m.index ?? 0) + m[0].length)
    if (KRIZ_OLUMSUZ.test(sonra)) continue
    // satır başında "KRİZ" + sunucu adı ("KRİZ wor14 düştü") da beyan; "kriz yönetimi dokümanı" değil
    const basta = b.slice(0, (m.index ?? 0) + m[0].length).trim() === "KRIZ" && sunucuBicimli(temizTok(sonra.trim().split(/\s+/)[0] ?? ""))
    if (basta || KRIZ_BEYAN_SONRA.test(sonra) || /ACIL\s+KRIZ$/.test(b.slice(0, (m.index ?? 0) + m[0].length))) return true
  }
  return false
}
const DOLGU = new Set(["ve", "ile", "and", "veya", "ya", "da", "de", "ayrıca", "ayrica", "+", "&"])
// Rakam içeren ürün/teknoloji adları sunucu adı değildir (cümlede "rke2 sunucuları", "rhel9 makineleri" geçer).
const URUN_ADI = /^(?:rke2|k3s|k8s|rhel\d*|el\d+|centos\d*|alma\d*|rocky\d*|h[12]\d\d|b[12]\d\d|a100|l40s?|ipv[46]|x86(?:_64)?|amd64|arm64|aarch64|s3|tls1\d*|sha\d+|md5|utf-?8|vcf\d*|esxi?\d*|vsphere\d*|nsx\d*|anthos\d*|gke\d*|p2v|v2v|2fa|mfa\d*|cis\d*|scap\d*|fips\d*|ha\d*)$/
const DOSYA_UZANTI = /\.(ya?ml|sh|conf|cfg|json|txt|log|md|ini|py|ts|j2|repo|rpm|tar|gz|xz)$/
const temizTok = (t: string) => t.replace(/^[\s"'`*•(\[<-]+/, "").replace(/['’].*$/, "").replace(/[\s"'`*)\]>.,;:!?]+$/, "")
// Cümle içinden alınacak ad: IP, harfli FQDN ya da rakam içeren ad (stlrancherwor07, web01) — düz sözcük alınmaz.
function sunucuBicimli(ham: string): boolean {
  const t = ham.toLowerCase()
  if (/^\d{1,3}(?:\.\d{1,3}){3}-\d{1,3}$/.test(t)) return true // IP aralığı: 10.0.0.127-134
  // Yalın numara aralığı "07-14" (Alp: "07-14 arasında çalıştır", G78): yalnız envanterde TEK bir ad önekiyle (stlrancherwor07…14)
  // eksiksiz karşılanırsa yetkiye dönüşür (envanter.ts); karşılanmazsa listede kalır, hiçbir host'u açmaz.
  if (/^\d{2,3}-\d{2,3}$/.test(t)) return true
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(t)) return true
  if (/^v?\d+(?:\.\d+)+$/.test(t) || DOSYA_UZANTI.test(t) || /^(?:chg|crq|rfc|cr|cn)[-_]?\d+$/.test(t) || URUN_ADI.test(t)) return false
  if (/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+$/.test(t)) return /[a-z]/.test(t)
  return /^[a-z][a-z0-9-]*\d[a-z0-9-]*$/.test(t) || /^[a-z0-9-]*\*[a-z0-9-]*$/.test(t)
}
// Alt alta liste satırı: yalnız ad(lar)dan oluşur (madde imi, virgül, "ve" serbest); rakamsız ad (srvsatellite) da olur.
function listeSatiri(satir: string): string[] | null {
  const toks = satir.split(/[\s,;]+/).map(temizTok).filter((t) => t && !DOLGU.has(t.toLowerCase()))
  if (!toks.length) return null
  return toks.every((t) => /^[a-z0-9][a-z0-9._*-]*$/i.test(t) && !DOSYA_UZANTI.test(t.toLowerCase()) && !/^v?\d+(\.\d+)*$/.test(t)) ? toks : null
}

// Aralık yazımı (Alp serbest yazar): "wor07-14" → wor07 … wor14, "10.0.0.127-134" → son okteti aralık. Sıfır dolgusu ilk
// sayının genişliğiyle; en çok 64 ad; artmayan ya da biçimi tutmayan aralık olduğu gibi kalır.
export function aralikAc(t: string): string[] {
  const ip = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.)(\d{1,3})-(\d{1,3})$/.exec(t)
  const ad = /^([a-z][a-z0-9]*?[a-z-])(\d+)-(?:\1)?(\d+)$/i.exec(t)
  const m = ip ?? ad
  if (!m) return [t]
  const [bas, son] = [Number(m[2]), Number(m[3])]
  if (!(son > bas) || son - bas > 63 || (ip && son > 255)) return [t]
  const gen = ip ? 0 : m[2].length
  return Array.from({ length: son - bas + 1 }, (_, i) => m[1] + String(bas + i).padStart(gen, "0"))
}

// G100: mesajın tamamı sunucu listesi mi? Satırlar yalnız ad/IP (madde imi, numara "1." , virgül, "ve" serbest; envanter
// yapıştırması "web01 ansible_host=10.0.0.11" da olur); başlık satırı ("Sunucu listesi:", "hostlar") olabilir. En az bir öğe
// sunucu biçimli olmalı ("evet", "tamam" gibi tek sözcük liste sayılmaz); "hariç/dışında" geçen mesaj liste sayılmaz.
export function yalinListe(text: string): string[] | null {
  const out: string[] = []
  for (const ham of text.split("\n")) {
    const satir = ham
      .replace(/\*\*|__/g, "")
      .replace(/^[\s"'`*>#•-]+/, "")
      .replace(/^\d{1,3}[.)]\s+/, "")
      .replace(/\bansible_(?:ssh_)?host=/gi, "")
      .replace(/\s\S+=\S*/g, "")
      .replace(/["'`\s]+$/, "")
      .trim()
    if (!satir) continue
    if (OLUMSUZ.test(buyuk(satir))) return null
    if (/^[a-zçğıöşü ]{0,40}:?$/i.test(satir) && /sunucu|server|host|hedef|makine|node|liste/i.test(satir)) continue
    const toks = satir.split(/[\s,;]+/).map(temizTok).filter((t) => t && !DOLGU.has(t.toLowerCase()))
    // satırdaki her öğe sunucu biçimli (ad, IP, aralık) olmalı; rakamsız ad (srvsatellite) yalnız satırda tek başınaysa
    const tekAd = toks.length === 1 && /^[a-z][a-z0-9._-]*$/i.test(toks[0]) && !DOSYA_UZANTI.test(toks[0].toLowerCase())
    if (toks.length && (tekAd || toks.every(sunucuBicimli))) {
      out.push(...toks)
      continue
    }
    return null
  }
  return out.some(sunucuBicimli) ? out : null
}

export function yetkiSatirlariniOku(text: string): YetkiSatiri {
  const out: YetkiSatiri = { govde: 0 }
  const cnler: string[] = []
  const serbest: string[] = [] // cümle içinden / alt alta listeden — KRİZ değilse eklenir
  const acik: string[] = [] // "sunucular: …" satırları
  let krizVar = false
  const krizSerbest: string[] = [] // KRİZ beyan satırındaki ve altındaki listedeki adlar (mail satırlarındaki değil)
  let devamKriz = false
  let devam: "acik" | "serbest" | null = null // önceki satır sunucu başlığı / CN satırıydı → alt alta liste olabilir
  const uyar = (m: string) => (out.uyari = out.uyari ? `${out.uyari} · ${m}` : m)
  for (const hamSatir of text.split("\n")) {
    // "- CN: …", "**CN:** …", "> KRİZ", tırnaklı satır (opencode run mesajı tırnaklar) → çıplak satır
    const satir = hamSatir
      .replace(/\*\*|__/g, "")
      .replace(/^[\s"'`*>#•-]+/, "")
      .replace(/["'`\s]+$/, "")
    const b = buyuk(satir.trim())
    if (!b) continue
    let anahtar = false
    if (/^YETKI\s+(KAPAT|BITTI|IPTAL)\b/.test(b)) {
      out.kapat = true
      anahtar = true
    }
    const cnOnce = cnler.length
    const cn = /^CN\s*[:#=]?\s*([A-Z0-9][A-Z0-9_./-]*)/.exec(b)
    if (cn && /\d/.test(cn[1])) cnler.push(cn[1])
    for (const m of b.matchAll(CN_KIMLIK)) cnler.push(m[1])
    for (const m of b.matchAll(CN_CUMLE)) cnler.push(m[1])
    const cnSatiri = cnler.length > cnOnce
    if (cnSatiri) {
      out.tur = "CN"
      anahtar = true
    }
    // T30 (Alp, 2026-09-30): "büyük ya da küçük harf fark etmez, kurulum yapacağım dediği zaman anlaması lazım".
    // Kelime cümlenin herhangi bir yerinde, harf duyarsız (b zaten Türkçe-uyumlu büyük harf). Ekli biçimler
    // (kurulumu, kurulumda …) ve olumsuz cümle ("kurulum yapmayacağım") beyan sayılmaz. Sunucu listesi yine şart.
    if (/(^|[^A-Z0-9ÇĞÖŞÜ])KURULUM(?![A-Z0-9ÇĞÖŞÜ])(?!\s+YAPMA)/.test(b)) {
      out.tur = "KURULUM"
      anahtar = true
    }
    const krizSatiri = krizBeyani(b)
    if (krizSatiri) {
      krizVar = true
      anahtar = true
    }
    const olumsuz = OLUMSUZ.test(b)
    const olumsuzUyar = () =>
      uyar(`"${satir.trim().slice(0, 60)}" satırında hariç/dışında/değil var — bu satırdaki sunucular eklenmedi, listeyi açıkça yaz`)
    // anahtar sözcüklerde İ/ı yok → /i yeterli; değerler ham satırdan alınır
    const liste = /(?:^|\s)(?:sunucular|sunucu|hedefler|hedef)\s*[:=]\s*(.*)$/i.exec(satir.trim())
    if (liste) {
      anahtar = true
      devam = null
      if (olumsuz) olumsuzUyar()
      else {
        const toks = liste[1].split(/[\s,;]+/).map(temizTok).filter((t) => t && !DOLGU.has(t.toLowerCase()))
        acik.push(...toks)
        if (!toks.length) devam = "acik" // "sunucular:" tek başına → altındaki satırlar liste
      }
      continue
    }
    const sunucuSatiri = SUNUCU_SOZ.test(satir)
    if (sunucuSatiri || cnSatiri || krizSatiri) {
      if (olumsuz && sunucuSatiri) {
        olumsuzUyar()
        devam = null
      } else {
        const adlar = satir.split(/[\s,;]+/).map(temizTok).filter(sunucuBicimli)
        if (sunucuSatiri || cnSatiri) serbest.push(...adlar)
        if (krizSatiri) krizSerbest.push(...adlar)
        devam = "serbest"
      }
      devamKriz = krizSatiri
      // KRİZ cümlesi ("kriz var, …") içerik sayılır — tek başına "KRİZ" başlığı sayılmaz
      if (!anahtar || (krizSatiri && b.trim() !== "KRIZ")) out.govde += satir.trim().length
      continue
    }
    if (devam) {
      const toks = listeSatiri(satir)
      if (toks) {
        ;(devam === "acik" ? acik : serbest).push(...toks)
        if (devamKriz) krizSerbest.push(...toks)
        continue
      }
      devam = null
      devamKriz = false
    }
    if (!anahtar) out.govde += satir.trim().length
  }
  if (cnler.length) out.cn = [...new Set(cnler)].join(",")
  // KRİZ, aynı mesajda CN ya da KURULUM beyanı yoksa geçerlidir (CN daha güçlü yetki; mesajda "kriz" geçmesi onu ezmez).
  if (krizVar && !out.tur) out.tur = "KRIZ"
  // Serbest adlar yalnız AYNI mesajda CN/KURULUM/KRİZ beyanı varsa sayılır: yoksa sıradan bir soru ("web05 sunucusunda disk
  // dolu") açık yetkinin listesini sessizce değiştirirdi. KRİZ'de yalnız kriz cümlesindeki (ve altındaki listedeki) adlar ve
  // yalnız mesajda yapıştırılmış metin YOKSA (kullanıcının kısa cümlesi: "kriz var, wor14 ve wor07'de …"); mail/toplantı
  // notu yapıştırılan mesajda yalnız açık "sunucular:" satırı (yapıştırılan metin yetki açmaz).
  const hepsi =
    out.tur === "CN" || out.tur === "KURULUM"
      ? [...acik, ...serbest]
      : out.tur === "KRIZ" && out.govde < KRIZ_METNI_MIN
        ? [...acik, ...krizSerbest]
        : acik
  const norm = (l: string[]) => [...new Set(l.flatMap(aralikAc).map(normHost).filter((h) => h.length > 0))].slice(0, 200)
  const n = norm(hepsi)
  if (n.length) out.sunucular = n
  if (!out.tur && !out.sunucular) {
    const liste = yalinListe(text)
    if (liste) out.adaylar = norm(liste)
    else if (serbest.length) out.cumleAdlari = norm(serbest)
  }
  return out
}

export function normHost(h: string): string {
  const n = h
    .trim()
    .replace(/^.*@/, "")
    .replace(/\.$/, "")
    .toLowerCase()
  // `$h`, `{}`, `$(...)` gibi çalışma anında belli olan hedef denetlenemez → "?" (hedef belirsiz)
  return /[${}*]/.test(n) && !/^[a-z0-9._-]*\*[a-z0-9._-]*$/.test(n) ? "?" : n
}

export function yetkiAktif(y: Yetki | undefined, now: number): y is Yetki & { tur: YetkiTur } {
  if (!y || !y.tur || y.sunucular.length === 0) return false
  if (now - y.zaman > YETKI_OMRU_MS) return false
  if (y.tur === "CN") return Boolean(y.cn)
  // G74 (Alp, 2026-10-20: "kriz cümlesi yeterli olsun"): KRİZ için mail/toplantı notu şartı kalktı; krizMetni yalnız kayıt.
  return true
}

export function yetkiOzeti(y: Yetki): string {
  const bas = y.tur === "CN" ? `CN ${y.cn}` : y.tur === "KRIZ" ? "KRİZ" : "KURULUM"
  return `${bas}: ${y.sunucular.join(", ")}`
}

export const YERELLER = () => {
  const h = hostname().toLowerCase()
  return new Set(["localhost", "127.0.0.1", "::1", h, h.split(".")[0]])
}

export function hostListede(hedef: string, liste: string[]): boolean {
  const h = normHost(hedef)
  if (h === "localhost") {
    const yerel = YERELLER()
    return liste.some((l) => yerel.has(l))
  }
  const ip = /^[\d.:]+$/.test(h)
  return liste.some((l) => l === h || (!ip && !/^[\d.:]+$/.test(l) && l.split(".")[0] === h.split(".")[0]))
}

// --- kabuk komutu ayrıştırma (bağımlılıksız, "yeterince doğru") ---
// Amaç tam bir bash ayrıştırıcısı değil: alt komutları (; && || | & yeni satır), tırnakları,
// $(…)/`…` iç komutlarını, yönlendirme hedeflerini ve heredoc gövdelerini ayırmak. Şüphede kilit
// tarafında kalınır (bilinmeyen uzak komut = değişiklik sayılır).

export interface Komut {
  argv: string[]
  yazilan: string[] // > / >> / &> hedefleri
}

export function eslesenParantez(src: string, start: number): [string, number] {
  let derinlik = 1
  let caseAcik = 0 // $( case … in 0) …;; esac ): desen ")"si ikameyi kapatmaz (bash da böyle ayrıştırır)
  let i = start
  while (i < src.length) {
    const c = src[i]
    const kelimeBasi = i === start || /[\s;(|&]/.test(src[i - 1])
    if (kelimeBasi && /^case[\s]/.test(src.slice(i, i + 5))) caseAcik++
    if (kelimeBasi && caseAcik > 0 && /^esac(?![A-Za-z0-9_])/.test(src.slice(i, i + 5))) caseAcik--
    if (c === "\\") {
      i += 2
      continue
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1)
      i = j < 0 ? src.length : j + 1
      continue
    }
    if (c === '"') {
      i++
      while (i < src.length && src[i] !== '"') i += src[i] === "\\" ? 2 : 1
      i++
      continue
    }
    if (c === "(") derinlik++
    if (c === ")") {
      if (derinlik === 1 && caseAcik > 0) {
        i++ // case dal deseninin kapanışı
        continue
      }
      derinlik--
      if (derinlik === 0) return [src.slice(start, i), i + 1]
    }
    i++
  }
  return [src.slice(start), src.length]
}

// $(( … )) içindeki komut ikamelerini (iç içe aritmetik dahil) denetim listesine ekler.
export function aritmetikIkameleri(ifade: string, ic: string[]): void {
  let i = 0
  while (i < ifade.length) {
    if (ifade[i] === "$" && ifade[i + 1] === "(") {
      const [inner, j] = eslesenParantez(ifade, i + 2)
      if (inner.startsWith("(") && inner.endsWith(")")) aritmetikIkameleri(inner.slice(1, -1), ic)
      else ic.push(inner)
      i = j
      continue
    }
    if (ifade[i] === "`") {
      const j = ifade.indexOf("`", i + 1)
      ic.push(ifade.slice(i + 1, j < 0 ? ifade.length : j))
      i = j < 0 ? ifade.length : j + 1
      continue
    }
    i++
  }
}

export function ayristir(src: string, ic: string[]): Komut[] {
  const out: Komut[] = []
  let argv: string[] = []
  let yazilan: string[] = []
  let tok = ""
  let tokVar = false
  let hedef: "yok" | "yaz" | "oku" = "yok"
  const heredoc: { son: string; girinti: boolean }[] = []
  // case … esac: `case X in` başlığı ve dal desenleri (`0)`, `*)`) komut değildir — atlanır; dal gövdeleri normal denetlenir.
  // Desendeki $(…) ikamesi tokenlaştırmada zaten `ic`'ye eklenir (atlanmaz).
  let caseDerinlik = 0
  let desenBekleniyor = false

  const bitirTok = () => {
    if (!tokVar) return
    if (hedef === "yok" && argv.length === 0 && tok === "case") {
      caseDerinlik++
      desenBekleniyor = true
    } else if (hedef === "yok" && argv.length === 0 && tok === "esac" && caseDerinlik > 0) {
      caseDerinlik--
      desenBekleniyor = false
      tok = ""
      tokVar = false
      return
    }
    if (hedef === "yaz") yazilan.push(tok)
    else if (hedef === "yok") argv.push(tok)
    hedef = "yok"
    tok = ""
    tokVar = false
  }
  const bitirKomut = () => {
    bitirTok()
    if (argv.length || yazilan.length) out.push({ argv, yazilan })
    argv = []
    yazilan = []
    hedef = "yok"
  }

  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === "\\" && i + 1 < src.length) {
      if (src[i + 1] !== "\n") {
        tok += src[i + 1]
        tokVar = true
      }
      i += 2
      continue
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1)
      const son = j < 0 ? src.length : j
      tok += src.slice(i + 1, son)
      tokVar = true
      i = son + 1
      continue
    }
    if (c === '"') {
      i++
      tokVar = true
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < src.length) {
          tok += src[i + 1]
          i += 2
          continue
        }
        if (src[i] === "$" && src[i + 1] === "(") {
          const [inner, j] = eslesenParantez(src, i + 2)
          ic.push(inner)
          tok += "$(...)"
          i = j
          continue
        }
        if (src[i] === "`") {
          const j = src.indexOf("`", i + 1)
          const son = j < 0 ? src.length : j
          ic.push(src.slice(i + 1, son))
          tok += "$(...)"
          i = son + 1
          continue
        }
        tok += src[i]
        i++
      }
      i++
      continue
    }
    if ((c === "$" || c === "<" || c === ">") && src[i + 1] === "(") {
      // $(…) komut ikamesi, <(…)/>(…) süreç ikamesi
      const [inner, j] = eslesenParantez(src, i + 2)
      if (c === "$" && inner.startsWith("(") && inner.endsWith(")")) {
        // $(( … )) aritmetik genişletme — komut değil (Alp 2026-10-22: okuma çalışsın). İçindeki $(…)/`…` ikameleri
        // yine çalışır → onlar ayrıca denetlenir; aritmetiğin kendisi hiçbir şey çalıştırmaz.
        aritmetikIkameleri(inner.slice(1, -1), ic)
        tok += "0"
        tokVar = true
        i = j
        continue
      }
      ic.push(inner)
      tok += "$(...)"
      tokVar = true
      i = j
      continue
    }
    if (c === "`") {
      const j = src.indexOf("`", i + 1)
      const son = j < 0 ? src.length : j
      ic.push(src.slice(i + 1, son))
      tok += "$(...)"
      tokVar = true
      i = son + 1
      continue
    }
    if (c === "#" && !tokVar) {
      while (i < src.length && src[i] !== "\n") i++
      continue
    }
    if (c === " " || c === "\t") {
      bitirTok()
      i++
      continue
    }
    if (c === "\n") {
      bitirKomut()
      i++
      // heredoc gövdesi komut değildir — sınırlayıcı satırına kadar atla
      while (heredoc.length) {
        const h = heredoc.shift()!
        while (i < src.length) {
          const nl = src.indexOf("\n", i)
          const satir = src.slice(i, nl < 0 ? src.length : nl)
          i = nl < 0 ? src.length : nl + 1
          if ((h.girinti ? satir.trim() : satir) === h.son) break
        }
      }
      continue
    }
    if (c === ")" && caseDerinlik > 0 && desenBekleniyor) {
      // dal deseni bitti: `case X in PAT)` ya da `PAT)` — komut olarak kaydetme
      argv = []
      yazilan = []
      tok = ""
      tokVar = false
      hedef = "yok"
      desenBekleniyor = false
      i++
      continue
    }
    if (c === ";" && src[i + 1] === ";" && caseDerinlik > 0) {
      bitirKomut()
      desenBekleniyor = true
      i += src[i + 2] === "&" ? 3 : 2
      continue
    }
    if (c === "{" && src[i + 1] === "}" && !tokVar) {
      // find … -exec cmd {} \; / {} + yer tutucusu — blok parantezi değil (saha G97)
      tok = "{}"
      tokVar = true
      i += 2
      continue
    }
    if (c === ";" || c === "(" || c === ")" || c === "{" || c === "}") {
      if ((c === "{" || c === "}") && tokVar) {
        tok += c
        i++
        continue
      }
      bitirKomut()
      i++
      continue
    }
    if (c === "&") {
      if (src[i + 1] === ">") {
        bitirTok()
        hedef = "yaz"
        i += src[i + 2] === ">" ? 3 : 2
        continue
      }
      bitirKomut()
      i += src[i + 1] === "&" ? 2 : 1
      continue
    }
    if (c === "|") {
      bitirKomut()
      i += src[i + 1] === "|" || src[i + 1] === "&" ? 2 : 1
      continue
    }
    if (c === ">") {
      if (tokVar && /^\d+$/.test(tok)) {
        tok = ""
        tokVar = false
      } else bitirTok()
      let j = i + 1
      if (src[j] === ">" || src[j] === "|") j++
      if (src[j] === "&") {
        j++
        while (j < src.length && /[0-9-]/.test(src[j])) j++
        i = j
        continue
      }
      hedef = "yaz"
      i = j
      continue
    }
    if (c === "<") {
      if (tokVar && /^\d+$/.test(tok)) {
        tok = ""
        tokVar = false
      } else bitirTok()
      if (src[i + 1] === "<" && src[i + 2] !== "<") {
        // heredoc: <<EOF / <<-EOF / <<'EOF'
        let j = i + 2
        const girinti = src[j] === "-"
        if (girinti) j++
        while (src[j] === " ") j++
        const m = /^(['"]?)([A-Za-z0-9_]+)\1/.exec(src.slice(j))
        if (m) {
          heredoc.push({ son: m[2], girinti })
          i = j + m[0].length
        } else i = j
        continue
      }
      hedef = "oku"
      i += src[i + 1] === "<" ? 3 : 1
      continue
    }
    tok += c
    tokVar = true
    i++
  }
  bitirKomut()
  return out
}

export const taban = (p: string) => p.split("/").pop() ?? p

// sudo/env/timeout/nohup/xargs gibi sarmalayıcıları ve VAR=değer öneklerini soy.
export function sarmalayiciSoy(argv: string[]): { argv: string[]; xargs: boolean } {
  const a = [...argv]
  let xargs = false
  const secenekAt = (degerli: (o: string) => boolean) => {
    while (a.length && a[0].startsWith("-") && a[0] !== "-") {
      const o = a.shift()!
      if (o === "--") break
      if (degerli(o)) a.shift()
    }
  }
  while (a.length) {
    const p = taban(a[0])
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0])) {
      a.shift()
      continue
    }
    // `for h in …; do ssh $h …; done` → "do ssh …": anahtar sözcük komut adı değildir
    if (["do", "then", "else", "elif", "if", "while", "until", "!"].includes(a[0])) {
      a.shift()
      continue
    }
    if (p === "sshpass") {
      a.shift()
      secenekAt((o) => ["-p", "-f", "-d", "-P"].includes(o))
      continue
    }
    if (p === "sudo" || p === "doas") {
      a.shift()
      // `sudo -l [-U kullanıcı] [komut]` yalnız izinleri listeler/sınar, komutu çalıştırmaz (idm-erisim). -l komuttan ÖNCEKİ
      // seçeneklerde olmalı (`sudo systemctl -l …` sayılmaz).
      const onSecenek: string[] = []
      for (let i = 0; i < a.length && a[i].startsWith("-") && a[i] !== "--"; i++) {
        onSecenek.push(a[i])
        if (/^-[ugCDhpRrTtU]$/.test(a[i]) || ["--user", "--group", "--prompt", "--chdir", "--other-user"].includes(a[i])) i++
      }
      if (p === "sudo" && onSecenek.some((o) => o === "-l" || o === "-ll" || o === "--list")) {
        a.splice(0, a.length, "true")
        continue
      }
      secenekAt((o) => /^-[ugCDhpRrTt]$/.test(o) || ["--user", "--group", "--prompt", "--chdir"].includes(o))
      continue
    }
    if (p === "env") {
      a.shift()
      while (a.length && (a[0].startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0]))) {
        const o = a.shift()!
        if (["-u", "-C", "-S", "--unset", "--chdir"].includes(o)) a.shift()
      }
      continue
    }
    if (p === "nice" || p === "ionice") {
      a.shift()
      secenekAt((o) => ["-n", "-c", "-p", "--adjustment"].includes(o))
      continue
    }
    if (p === "timeout") {
      a.shift()
      secenekAt((o) => ["-s", "-k", "--signal", "--kill-after"].includes(o))
      a.shift() // süre
      continue
    }
    if (p === "command" && (a[1] === "-v" || a[1] === "-V")) break // `command -v x`: yalnız yol sorgusu (saltOkunur)
    if (["nohup", "time", "command", "exec", "builtin", "stdbuf", "setsid", "unbuffer"].includes(p)) {
      a.shift()
      secenekAt(() => false)
      continue
    }
    if (p === "xargs") {
      a.shift()
      xargs = true
      secenekAt((o) => /^-[IdEeLnPsa]$/.test(o))
      continue
    }
    break
  }
  return { argv: a, xargs }
}

export const SISTEM_KOKLERI = new Set([
  "/", "/bin", "/boot", "/dev", "/etc", "/home", "/lib", "/lib64", "/media", "/mnt", "/opt",
  "/proc", "/root", "/run", "/sbin", "/srv", "/sys", "/usr", "/var",
])
export const BLOK_AYGIT_RE = /^\/dev\/(sd|hd|vd|xvd|nvme|mmcblk|mapper\/|dm-|md|loop|disk\/)/

export interface Baglam {
  workdir: string
  cwd: string
  home: string
  uzak: string | null // null = bu makine
  derinlik: number
}

export function yolCoz(p: string, b: Baglam): string {
  let x = p
  if (x === "~" || x.startsWith("~/")) x = b.home + x.slice(1)
  return isAbsolute(x) ? resolve(x) : resolve(b.cwd, x)
}

// Uzakta yönlendirme hedefi olarak dosya OLMAYANLAR: bit kovası, standart akışlar ve bash'in /dev/tcp|udp soket yolları
// (saha G71: `echo >/dev/tcp/nfs/2049` ve `exec 3<>/dev/tcp/…` port testi uzakta "dosyaya yazma" sayılıyordu).
export const zararsizHedef = (y: string) =>
  ["/dev/null", "/dev/stdout", "/dev/stderr", "/dev/tty"].includes(y) || /^\/dev\/(fd|tcp|udp)\//.test(y)

export function serbestYazmaAlani(abs: string, b: Baglam): boolean {
  return (
    isInside(b.workdir, abs) ||
    isInside("/tmp", abs) ||
    isInside("/var/tmp", abs) ||
    ["/dev/null", "/dev/stdout", "/dev/stderr", "/dev/tty"].includes(abs) ||
    abs.startsWith("/dev/fd/") ||
    abs.startsWith("/dev/tcp/") || // bash port testi (`echo > /dev/tcp/host/22`), dosya değil
    abs.startsWith("/dev/udp/") ||
    abs.startsWith("/proc/self/")
  )
}

// Silme/izin değiştirme için "asla" kökler: /, sistem kökleri, ev dizinleri, çalışma dizininin kendisi/ataları.
export function tehlikeliKok(raw: string, b: Baglam, silme: boolean): boolean {
  if (/^\$/.test(raw) || raw.includes("$(...)")) return true // boş değişken → `rm -rf /` klasiği
  const yalin = raw.replace(/\/\*$/, "").replace(/\/+$/, "") || "/"
  if (silme && ["*", ".", "..", "./*", "../*"].includes(raw)) return true
  if (yalin === "~" || raw === "~/*") return true
  if (b.uzak !== null && !isAbsolute(yalin)) return false
  const abs = yolCoz(yalin, b)
  if (SISTEM_KOKLERI.has(abs)) return true
  if (/^\/(home|root)(\/[^/]+)?$/.test(abs)) return true
  if (b.uzak === null && (abs === b.home || isInside(abs, b.workdir))) return true
  return false
}

export interface Bulgu {
  tur: "sert" | "degisiklik" | "disk"
  neden: string
  hedefler: string[]
  // Saha G68 (Alp, 2026-10-17): kilidin hiç tanımadığı uzak komut "belirsiz" → engel yerine kullanıcıya sorulur.
  belirsiz?: boolean
}

export const sert = (neden: string): Bulgu => ({ tur: "sert", neden, hedefler: [] })
// Alp, 2026-10-22: diski biçimleyen/silen komut (mkfs, wipefs -a, blok aygıtına dd/yönlendirme, blkdiscard, sgdisk --zap, diske
// shred/mkswap) "asla açılmaz" değil; yetki (CN/KURULUM/KRİZ + hedef listede) VE her komutta ayrı onay ister ("her zaman izin
// ver" atlatamaz). Felaket sınıfı (rm -rf /, force-push, kill -1, kilit/audit) K5'te kalır.
export const diskBulgu = (neden: string, hedefler: string[]): Bulgu => ({ tur: "disk", neden, hedefler })
export const degisiklik = (neden: string, hedefler: string[], belirsiz = false): Bulgu =>
  belirsiz ? { tur: "degisiklik", neden, hedefler, belirsiz } : { tur: "degisiklik", neden, hedefler }

// Kilidin TANIDIĞI araçlar: okuma biçimi saltOkunur'da tanımlı olanlar + bilinen değiştiriciler. Bunlar uzakta okuma
// biçiminde değilse KESİN değişikliktir (engel). Listede olmayan araç (özel betik, kurum aracı, `./x`, `python3 x.py`)
// "belirsiz"dir: kullanıcıya sorulur, onaylarsa çalışır (G68). Şüphede tanıdık tarafta kal: değiştirebilen her
// bilinen araç buraya.
export const BILINEN_ARAC = new Set([
  // saltOkunur'da özel kuralı olanlar
  "date", "hostname", "hostnamectl", "timedatectl", "systemctl", "journalctl", "rpm", "dnf", "yum", "ip", "nmcli",
  "firewall-cmd", "iptables", "ip6tables", "nft", "sysctl", "mount", "swapon", "dmesg", "crontab", "sed", "find",
  "subscription-manager", "realm", "ipa", "kubectl", "oc", "helm", "docker", "podman", "nvidia-smi", "mdadm", "nvme",
  "cpupower", "crictl", "vmware-toolbox-cmd", "etcdctl", "ctr", "containerd", "tuned-adm", "authselect", "rke2",
  "hammer", "sshd", "perf", "command", "chronyc", "localectl", "awk", "gawk", "showmount", "rpcinfo", "nfsstat",
  "sssctl", "oscap", "dkms", "ipactl", "ipa-healthcheck", "nvidia-ctk", "ipa-cacert-manage", "umask", // IdM / CIS / GPU (2026-10-24)
  "getcert", "ipa-crlgen-manage", "leapp", "fips-mode-setup", // leapp: yalnız --version/--help okur (preupgrade dahil değişiklik); fips-mode-setup --check okur. // ipa-crlgen-manage: status okur; enable/disable değiştirir. certmonger: list / list-cas okur; request/resubmit/start-tracking/stop-tracking değiştirir (2026-10-25)
  // bilinen değiştiriciler
  "rm", "mv", "cp", "ln", "chmod", "chown", "chgrp", "mkdir", "rmdir", "touch", "tee", "dd", "truncate", "install",
  "shred", "unlink", "rsync", "scp", "tar", "unzip", "gzip", "gunzip", "xz", "bzip2", "zip", "patch",
  "reboot", "shutdown", "poweroff", "halt", "init", "telinit", "kill", "pkill", "killall", "service",
  "useradd", "usermod", "userdel", "groupadd", "groupmod", "groupdel", "passwd", "chpasswd", "chage", "gpasswd",
  "umount", "swapoff", "mkswap", "fsck", "e2fsck", "xfs_repair", "xfs_growfs", "resize2fs", "growpart", "parted",
  "fdisk", "sfdisk", "gdisk", "sgdisk", "wipefs", "partprobe", "lvcreate", "lvextend", "lvresize", "lvreduce",
  "lvremove", "lvchange", "vgcreate", "vgextend", "vgreduce", "vgremove", "vgchange", "pvcreate", "pvremove",
  "pvresize", "pvmove", "cryptsetup", "multipath", "iscsiadm", "exportfs", "modprobe", "rmmod", "insmod", "depmod",
  "setenforce", "setsebool", "semanage", "restorecon", "chcon", "chattr", "setfacl", "ethtool", "tc", "brctl",
  "ovs-vsctl", "ovs-ofctl", "ovs-appctl", "conntrack", "ipset", "update-crypto-policies", "update-alternatives",
  "alternatives", "update-ca-trust", "grubby", "grub2-mkconfig", "grub2-install", "dracut", "kexec", "localectl",
  "logrotate", "virsh", "git", "pip", "pip3", "npm", "make", "at", "batch", "wall", "systemd-run", "loginctl",
  "ausearch", "auditctl", "augenrules", "tuned", "kdumpctl", "needs-restarting", "ansible-galaxy", "certbot",
  "keytool", "update-motd", "vgimport", "vgexport", "lvconvert", "blockdev", "hdparm", "smartctl", "ntpdate",
  "chronyd", "sshd-keygen", "ssh-keygen", "htpasswd", "openssl", "curl", "wget",
  "ipa-server-install", "ipa-replica-install", "ipa-client-install", "ipa-adtrust-install", "ipa-server-certinstall",
  "ipa-ca-install", "ipa-dns-install", "ipa-server-upgrade", "ipa-restore", "ipa-backup", "ipa-certupdate", "autotailor",
])

export const secenekDegil = (x: string) => !x.startsWith("-")

// Uzak sunucuda (ssh içinde, ansible -a …) salt-okunur sayılan komutlar. Listede olmayan her şey
// uzakta DEĞİŞİKLİK sayılır — şüphede kilit.
export const SALT_OKUNUR = new Set([
  "ls", "cat", "head", "tail", "less", "more", "grep", "egrep", "fgrep", "zgrep", "rg", "wc", "file", "stat",
  "df", "du", "free", "uptime", "uname", "whoami", "id", "groups", "w", "who", "last", "lastlog", "ps", "pgrep",
  "pstree", "ss", "netstat", "lsof", "lsblk", "blkid", "pvs", "vgs", "lvs", "pvdisplay", "vgdisplay",
  "lvdisplay", "findmnt", "getent", "echo", "printf", "true", "false", "test", "[", "which", "type", "whereis",
  "printenv", "pwd", "sestatus", "getenforce", "getsebool", "klist", "md5sum", "sha1sum", "sha256sum", "diff",
  "cmp", "sort", "uniq", "cut", "tr", "column", "jq", "yq", "xxd", "od", "strings", "readlink", "realpath",
  "basename", "dirname", "lscpu", "lsmem", "lspci", "lsusb", "lsmod", "modinfo", "dmidecode", "ping",
  "traceroute", "tracepath", "dig", "nslookup", "host", "sleep", "tree", "getfacl", "lsattr", "atq",
  "systemd-analyze", "needs-restarting", "top", "vmstat", "iostat", "mpstat", "sar", "nproc", "arch",
  "locale", "ntpq", "nc", "curl", "wget", "openssl", "ansible", "cd", "xfs_info",
  "pidstat", "fincore", "sadf", "iotop", "slabtop", "numastat", "lsns", "lslocks", "lsipc",
  "mountpoint", "nfsiostat", "mountstats", // NFS/bağlama teşhisi (G71)
  "base64", "base32", // yalnız stdout'a kodlar/çözer — dosya yazmaz (G82: secret'tan sertifika okuma)
  // kabuk sözdizimi (saha G62): döngü/koşul kapanışları ve `read` kendi başına bir şey değiştirmez; gövdedeki
  // komutlar ayrı segment olarak ayrıca incelenir
  "done", "fi", "esac", "read", "{", "}",
])

// nvidia-smi: YALNIZ okuma biçimleri (izin listesi; listede olmayan bayrak/alt komut = değişiklik). Saha G57:
// gpu-kume-denetim'in `nvidia-smi --query-gpu=… --format=csv` / `topo -m` komutları uzakta K1'e düşüyordu.
// Değiştirenler (bilerek listede yok): -pm -pl -ac -rac -e -p -c -r/--gpu-reset -mig -lgc -rgc -am -caa -f
// (dosyaya yazar), drain, mig, nvlink -r/-sc, clocks, boost-slider, power-hint, conf-compute …
const NVSMI_DEGERLI = new Set(["-i", "--id", "-d", "--display", "-l", "--loop", "-lms", "--loop-ms"])
const NVSMI_BAYRAK = new Set(["-L", "--list-gpus", "-q", "--query", "-x", "--xml-format", "-h", "--help", "--version",
  "-B", "--list-excluded-gpus"])
const NVSMI_ESIT = /^--(query-(gpu|compute-apps|accounted-apps|supported-clocks|retired-pages|remapped-rows)|format|id|display|loop|loop-ms|help-query-[a-z-]+)=/
export function nvidiaSmiOkur(a: string[]): boolean {
  let i = 0
  for (; i < a.length && a[i].startsWith("-"); i++) {
    if (NVSMI_DEGERLI.has(a[i])) { i++; continue } // "-i 0", "-d PERFORMANCE"
    if (!NVSMI_BAYRAK.has(a[i]) && !NVSMI_ESIT.test(a[i])) return false
  }
  if (i >= a.length) return true // alt komut yok, yalnız okuma bayrakları
  const alt = a[i]
  const kalan = a.slice(i + 1)
  if (alt === "topo") return kalan.every((x) => ["-m", "--matrix", "-mp", "-p2p", "-i", "-c", "-n", "-p", "-h"].includes(x) || /^[0-9a-z,]+$/i.test(x))
  if (alt === "dmon" || alt === "pmon") return !kalan.some((x) => x === "-f" || x === "--filename" || x.startsWith("--filename="))
  if (alt === "nvlink") return kalan.length > 0 && kalan.every((x) => ["-s", "--status", "-c", "--capabilities", "-i", "-e", "--errorcounters", "-g"].includes(x) || /^[0-9,]+$/.test(x))
  return false
}

// Değer alan bayrakları atlayıp konumsal argümanları döndürür ("--endpoints x get k" → ["get","k"]).
function konumsal(a: string[], degerli: Set<string>): string[] {
  const out: string[] = []
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("-")) { if (degerli.has(a[i])) i++; continue }
    out.push(a[i])
  }
  return out
}
// Saha G58: gpu-prod incelemesinde etcdctl / ctr / containerd / `python3 -m json.tool` okumaları K1'e düştü.
const ETCDCTL_DEGERLI = new Set(["--endpoints", "--cacert", "--cert", "--key", "-w", "--write-out", "--command-timeout",
  "--dial-timeout", "--user", "--password", "--prefix-range"])
const CTR_DEGERLI = new Set(["-n", "--namespace", "-a", "--address", "--timeout", "--connect-timeout"])
export function etcdctlOkur(a: string[]): boolean {
  const [k1 = "", k2 = ""] = konumsal(a, ETCDCTL_DEGERLI)
  if (["get", "version"].includes(k1)) return true // kurum kapalı sistem: okuma kısıtı yok (Alp, 2026-10-15)
  if (k1 === "member" || k1 === "alarm") return k2 === "list"
  if (k1 === "endpoint") return ["health", "status", "hashkv"].includes(k2)
  return k1 === "" && a.some((x) => x === "--version" || x === "version")
}
export function ctrOkur(a: string[]): boolean {
  const [k1 = "", k2 = ""] = konumsal(a, CTR_DEGERLI)
  if (k1 === "version" || a.includes("--version") || a.includes("-v")) return k1 === "" || k1 === "version"
  return ["containers", "c", "container", "images", "i", "image", "tasks", "t", "task", "namespaces", "ns", "namespace",
    "snapshots", "snapshot", "content", "plugins", "plugin"].includes(k1) && ["list", "ls", "info"].includes(k2)
}

// Saha G67 (Alp, 2026-10-17: "read only komutları değişiklik sanıyor, sunucunun bazı değerleri okunamıyor"). Becerilerdeki
// 361 komutluk tarama (kilitDenetle) ile bulunan yanlış alarmlar: rke2/hammer/sshd -T/pidstat/fincore/dnf check/
// --assumeno/docker system df/subscription-manager repos --list/kubectl --dry-run/perf report + yalnız --help/--version.
const RKE2_DEGERLI = new Set(["--output", "-o", "--data-dir", "-d", "--config", "-c"])
export function rke2Okur(a: string[]): boolean {
  const [k1 = "", k2 = ""] = konumsal(a, RKE2_DEGERLI)
  if (k1 === "") return a.some((x) => x === "--version" || x === "-v")
  if (k1 === "certificate") return k2 === "check"
  if (k1 === "secrets-encrypt") return k2 === "status"
  if (k1 === "etcd-snapshot") return k2 === "list" || k2 === "ls"
  if (k1 === "token") return k2 === "list"
  return false
}
const HAMMER_OKUR = new Set(["list", "info", "ping", "status", "show"])
const HAMMER_YAZAR = /^(create|update|delete|remove|add|publish|promote|sync|synchronize|import|export|upload|set|assign|enable|disable|start|stop|restart|cancel|resume|run|execute|refresh|clear|reboot|rebuild|attach|detach|associate|disassociate|copy|clone|lock|unlock|apply|deploy|purge|reset|regenerate|rename|move|replace)(-|$)/
export function hammerOkur(a: string[]): boolean {
  if (a.length && a.every((x) => ["--help", "-h", "--version"].includes(x) || !x.startsWith("-") && !HAMMER_YAZAR.test(x)) && a.some((x) => ["--help", "-h", "--version"].includes(x))) return true
  const k = a.filter(secenekDegil)
  return k.some((x) => HAMMER_OKUR.has(x)) && !k.some((x) => HAMMER_YAZAR.test(x))
}
export function sshdOkur(a: string[]): boolean {
  // -T/-t test kipi: ayarı okur/denetler, sunucu başlatmaz. -C (bağlantı koşulu) ve -f (ayar dosyası) değer alır.
  let test = false
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "-T" || a[i] === "-t") test = true
    else if (a[i] === "-C" || a[i] === "-f") i++
    else if (!/^-[TtC]/.test(a[i])) return false
  }
  return test
}

// mount: bağlama noktası/aygıt (konumsal argüman) yok ve yalnız listeleme bayrakları var
function mountListeler(a: string[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    if (x === "-t" || x === "--types") i++
    else if (!(x === "-l" || x === "--show-labels" || x.startsWith("--types=") || /^-t\S+$/.test(x))) return false
  }
  return true
}

// wipefs yalnız listeler: seçeneksiz, -n/--no-act (hiçbir şey silmez), -J/-p/-i/-O (çıktı biçimi). Silen: -a/--all, -o/--offset
// (kısa bayrak birleşimi dahil, ör. -af). -n varsa silen bayrak da yazmaz (man wipefs). Alp 2026-10-22: okuma çalışsın.
export function wipefsOkur(a: string[]): boolean {
  if (a.some((x) => x === "-n" || x === "--no-act" || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(x))) return true
  return !a.some((x) => x === "--all" || x === "--offset" || x.startsWith("--offset=") || x === "-o" || /^-[a-zA-Z]*[ao][a-zA-Z]*$/.test(x) || x === "--force" || x === "-f" || x === "--backup" || x === "-b")
}

export function saltOkunur(argv: string[]): boolean {
  const p = taban(argv[0] ?? "")
  const a = argv.slice(1)
  const has = (...x: string[]) => a.some((y) => x.includes(y))
  const ilk = a.find(secenekDegil) ?? ""
  // Yalnız yardım/sürüm: yoldan çağrılmayan (PATH'teki) araçta `--help` / `--version` bir şey değiştirmez.
  // `./betik --help` sayılmaz (yerel betik bayrağı yok sayıp çalışabilir); `-h` sayılmaz (`shutdown -h`).
  if (a.length > 0 && !(argv[0] ?? "").includes("/") && a.every((x) => x === "--help" || x === "--version")) return true
  switch (p) {
    case "date":
      return !has("-s", "--set") && !a.some((x) => x.startsWith("--set="))
    case "hostname":
      return a.every((x) => x.startsWith("-") && !["-F", "-b", "--file", "--boot"].includes(x))
    case "hostnamectl":
    case "timedatectl":
      return ilk === "" || ["status", "show", "list-timezones", "timesync-status", "show-timesync"].includes(ilk)
    case "systemctl":
      return ["status", "is-active", "is-enabled", "is-failed", "show", "cat", "get-default", "list-units",
        "list-unit-files", "list-timers", "list-dependencies", "list-sockets", "--version", ""].includes(ilk)
    case "journalctl":
      return !a.some((x) => /^--(vacuum|rotate|flush|relinquish|sync|setup-keys)/.test(x))
    case "rpm":
      return a.some((x) => /^-q|^--query|^-V|^--verify/.test(x)) && !a.some((x) => /^-[iUFe]|^--(install|upgrade|freshen|erase|import)/.test(x))
    case "dnf":
    case "yum":
      return ["list", "info", "repolist", "search", "check-update", "repoquery", "provides", "whatprovides",
        "updateinfo", "--version", "deplist", "check", "nvidia-plugin"].includes(ilk) || (ilk === "history" && ["", "list", "info"].includes(a.filter(secenekDegil)[1] ?? "")) ||
        (ilk === "module" && ["list", "info", "provides"].includes(a.filter(secenekDegil)[1] ?? "")) ||
        (ilk === "versionlock" && ["", "list"].includes(a.filter(secenekDegil)[1] ?? "")) ||
        // deneme kipi: --assumeno her soruya "hayır" der, işlem yapılmaz (-y/--assumeyes ile birlikteyse sayılmaz)
        (["update", "upgrade", "install", "remove", "erase", "downgrade", "distro-sync", "autoremove"].includes(ilk) && has("--assumeno") && !has("-y", "--assumeyes"))
    case "ip":
      return !a.some((x) => ["add", "del", "delete", "set", "flush", "change", "replace", "append", "save", "restore"].includes(x))
    case "nmcli":
      return !a.some((x) => ["mod", "modify", "add", "delete", "del", "up", "down", "reload", "edit", "connect",
        "disconnect", "on", "off", "radio", "reapply", "load", "import", "clone", "set", "rescan"].includes(x))
    case "firewall-cmd":
      return a.length === 0 || a.every((x) => /^--(list|state|get|query|info|zone=|permanent$)/.test(x) || x === "-q")
    case "iptables":
    case "ip6tables":
      return a.some((x) => ["-L", "-S", "--list", "--list-rules"].includes(x)) && !a.some((x) => /^-[AIDRFXZNPE]$|^--(append|insert|delete|replace|flush|zero|new|policy)/.test(x))
    case "nft":
      return ilk === "list"
    case "sysctl":
      return !has("-w", "--write", "-p", "--load", "--system") && !a.some((x) => x.includes("="))
    case "mount":
      // yalnız listeleme: `mount`, `mount -l`, `mount -t nfs4` (tür süzgeci). `mount -a` fstab'ı bağlar (eskiden açıktı).
      return mountListeler(a)
    case "showmount":
      return true // NFS sunucusunun export/istemci listesini sorar (G71)
    case "rpcinfo":
      return !has("-d", "--delete") // -d: portmap kaydını siler; -p/-s/-t/-u/-T okur
    case "nfsstat":
      return !a.some((x) => /^-[a-zA-Z]*z|^--zero|^--reset/.test(x)) // -z sayaçları sıfırlar
    case "exportfs":
      return a.length === 0 || a.every((x) => x === "-v" || x === "-s") // -a/-r/-u/-o export'u değiştirir
    case "swapon":
      return a.length === 0 || has("--show", "-s", "--summary")
    case "dmesg":
      return !has("-c", "-C", "-D", "-E", "--clear", "--read-clear")
    case "crontab":
      return a.length > 0 && a.every((x) => x === "-l" || x === "-u" || !x.startsWith("-")) && has("-l")
    case "sed":
      return !a.some((x) => /^-[a-zA-Z]*i|^--in-place/.test(x))
    case "find": {
      // -delete / -fprint* dosya yazar → değişiklik. -exec/-execdir/-ok/-okdir: çalıştırılan HER alt komut okumaysa
      // (find … -exec ls -lah {} \; — saha G97, etcd incelemesi) find de okumadır; alt komut ayrıca da denetlenir.
      if (a.some((x) => /^-(delete|fprint|fprint0|fprintf|fls)$/.test(x))) return false
      for (let i = 0; i < a.length; i++) {
        if (!/^-(exec|execdir|ok|okdir)$/.test(a[i])) continue
        let son = a.findIndex((x, j) => j > i && (x === ";" || x === "+"))
        if (son < 0) son = a.length
        const alt = a.slice(i + 1, son).map((x) => (x === "{}" ? "/x" : x))
        if (!alt.length || !saltOkunur(alt)) return false
        i = son
      }
      return true
    }
    case "subscription-manager":
      if (ilk === "repos") return a.every((x) => x === "repos" || /^--list(-enabled|-disabled)?$/.test(x)) && a.length > 1
      return ["status", "list", "identity", "facts", "version", "orgs", "release", "syspurpose"].includes(ilk) && !has("--set", "--unset")
    case "realm":
      return ilk === "list" || ilk === "discover"
    case "ipa":
      // hbactest: kuralı yalnız sınar · dns-update-system-records --dry-run: gereken DNS kayıtlarını yalnız listeler (IdM DNS'siz kurulum)
      return /-(show|find)$/.test(ilk) || ["ping", "env", "help", "--version", "hbactest"].includes(ilk) ||
        (ilk === "dns-update-system-records" && has("--dry-run") && !has("--out"))
    case "sssctl":
      // user-checks varsayılan PAM eylemi acct (HBAC/hesap denetimi; parola sormaz — SSSD sssctl_user_checks.c DEFAULT_ACTION)
      if (ilk === "user-checks") {
        const ey = secenekDegeri(a, "-a", "--action") ?? (a.find((x) => x.startsWith("--action="))?.slice(9) ?? "acct")
        return ey === "acct"
      }
      return ["domain-list", "domain-status", "user-show", "group-show", "netgroup-show", "config-check", "cert-show", "analyze"].includes(ilk)
    case "oscap": {
      // tarama/rehber/düzeltme betiği stdout'a — --remediate sistemi değiştirir, rapor/sonuç bayrakları dosya yazar
      const [k1 = "", k2 = ""] = a.filter(secenekDegil)
      if (k1 === "info") return true
      if (k1 !== "xccdf" && k1 !== "oval" && k1 !== "ds") return a.some((x) => x === "-V" || x === "--version")
      if (has("--remediate", "--report", "--results", "--results-arf", "--oval-results", "--stig-viewer", "--output", "-o") ||
        a.some((x) => /^--(report|results|results-arf|output)=/.test(x))) return false
      return ["eval", "generate", "validate"].includes(k2) || k1 === "ds" && ["sds-validate", "rds-validate"].includes(k2)
    }
    case "dkms":
      return ilk === "status"
    case "umask":
      // argümansız / -S yalnız gösterir (değer verilen umask yalnız o kabuğu etkiler ama okuma değildir)
      return a.length === 0 || a.length === 1 && a[0] === "-S"
    case "ipactl":
      return ilk === "status"
    case "ipa-healthcheck":
      return !has("--output-file") && !a.some((x) => x.startsWith("--output-file="))
    case "nvidia-ctk": {
      const [k1 = "", k2 = ""] = a.filter(secenekDegil)
      return k1 === "cdi" && k2 === "list" || a.some((x) => x === "--version" || x === "-v")
    }
    case "ipa-cacert-manage":
      return ilk === "list"
    case "getcert":
      return ilk === "list" || ilk === "list-cas"
    case "ipa-crlgen-manage":
      return ilk === "status"
    case "leapp":
      // preupgrade yapılandırmayı değiştirmez ama /var/lib/leapp'e ~4 GB yazar (RH) — üretimde planlı iş, kilitte değişiklik
      return a.length === 1 && ["--version", "--help", "-h"].includes(a[0])
    case "fips-mode-setup":
      return a.length === 1 && ["--check", "--help", "-h"].includes(a[0])
    case "kubectl":
    case "oc":
      // --dry-run=client|server: istek doğrulanır, kalıcı değişiklik yapılmaz (=none ya da yalın --dry-run=false değil)
      return KUBE_OKUR.has(kubeFiil(a)) || a.some((x) => /^--dry-run=(client|server)$/.test(x))
    case "helm":
      return ["list", "ls", "status", "get", "history", "show", "search", "version", "template", "lint", "env"].includes(ilk)
    case "docker":
    case "podman": {
      const [, k2 = ""] = a.filter(secenekDegil)
      if (ilk === "system") return k2 === "df" || k2 === "info"
      if (["volume", "network", "image", "container", "pod"].includes(ilk)) return ["ls", "list", "inspect"].includes(k2)
      return ["ps", "images", "inspect", "logs", "version", "info", "stats", "top", "port", "diff", "events"].includes(ilk)
    }
    case "for":
    case "select":
      // yalnız başlık: `for f in <liste>` — liste içinde komut ikamesi ayrı segment olarak incelenir
      return true
    case "nvidia-smi":
      return nvidiaSmiOkur(a)
    case "mdadm":
      return a.length > 0 && a.every((x) => ["--detail", "-D", "--examine", "-E", "--query", "-Q", "--brief", "-b", "--scan", "-s", "--verbose", "-v"].includes(x) || /^\/dev\//.test(x))
    case "nvme":
      return ["list", "list-subsys", "smart-log", "id-ctrl", "id-ns", "error-log", "fw-log", "show-regs", "version", "--version"].includes(ilk)
    case "cpupower":
      return ["frequency-info", "idle-info", "info", "monitor"].includes(ilk)
    case "crictl":
      return ["ps", "pods", "images", "info", "inspect", "inspectp", "inspecti", "logs", "stats", "statsp", "version", "imagefsinfo"].includes(ilk)
    case "vmware-toolbox-cmd":
      return ilk === "stat" || ilk === "-v" || ilk === "--version"
    case "etcdctl":
      return etcdctlOkur(a)
    case "localectl":
      return ["", "status", "list-locales", "list-keymaps", "list-x11-keymap-models", "list-x11-keymap-layouts",
        "list-x11-keymap-variants", "list-x11-keymap-options"].includes(ilk)
    case "chronyc":
      // makestep/burst/settime/add/delete/online/offline… saati ya da kaynağı değiştirir
      return ["", "tracking", "sources", "sourcestats", "activity", "ntpdata", "serverstats", "clients", "selectdata",
        "authdata", "waitsync", "rtcdata", "smoothing", "manual"].includes(ilk) && !(ilk === "manual" && a.length > 1)
    case "awk":
    case "gawk":
      // awk programı system(), komuta boru ya da dosyaya yönlendirme ile yazabilir
      return !a.some((x) => /system\s*\(|\|\s*"|>\s*"|\|&|print\s*>|printf[^;]*>\s*[a-zA-Z"]/.test(x)) && !has("-i", "--inplace")
    case "command":
      // `command -v x` yalnız yolu yazar; `command x …` ise x'i çalıştırır (sayılmaz)
      return a.length > 0 && (a[0] === "-v" || a[0] === "-V")
    case "rke2":
      return rke2Okur(a)
    case "hammer":
      return hammerOkur(a)
    case "sshd":
      return sshdOkur(a)
    case "perf":
      return ["report", "list", "annotate", "script", "version", "--version"].includes(ilk) && !has("-o", "--output")
    case "ctr":
      return ctrOkur(a)
    case "containerd":
      return a.length > 0 && a.every((x) => ["--version", "-v", "config", "dump"].includes(x)) && (a.includes("--version") || a.includes("-v") || (a[0] === "config" && a[1] === "dump"))
    case "wipefs":
      return wipefsOkur(a)
    case "python":
    case "python3":
      // yalnız stdin'den okuyup biçimleyen json.tool (çıktı dosyası argümanı yok) — gerisi kod çalıştırır
      return a[0] === "-m" && a[1] === "json.tool" && a.slice(2).filter(secenekDegil).length === 0
    case "tuned-adm":
      return ["active", "list", "recommend", "verify"].includes(ilk)
    case "authselect":
      return ["current", "list", "show", "check"].includes(ilk)
    case "ansible-inventory":
    case "ansible-doc":
    case "ansible-config":
      return true
  }
  return SALT_OKUNUR.has(p) && !(p === "curl" && curlYazar(a)) && !(p === "wget" && wgetYazar(a))
}

export const KUBE_DEGERLI = new Set(["-n", "--namespace", "--context", "--kubeconfig", "--cluster", "--user", "-s",
  "--server", "--token", "-l", "--selector", "-o", "--output", "-c", "--container", "--as", "--request-timeout"])
export const KUBE_OKUR = new Set(["get", "describe", "logs", "top", "version", "api-resources", "api-versions", "explain",
  "cluster-info", "auth", "config", "wait", "diff", "events", "port-forward", "proxy", "whoami", "status", "projects", ""])

export function kubeFiil(a: string[]): string {
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("-")) {
      if (KUBE_DEGERLI.has(a[i])) i++
      continue
    }
    return a[i]
  }
  return ""
}

export function secenekDegeri(a: string[], ...adlar: string[]): string | null {
  for (let i = 0; i < a.length; i++) {
    for (const ad of adlar) {
      if (a[i] === ad) return a[i + 1] ?? null
      if (ad.startsWith("--") && a[i].startsWith(ad + "=")) return a[i].slice(ad.length + 1)
      if (!ad.startsWith("--") && a[i].startsWith(ad) && a[i].length > ad.length) return a[i].slice(ad.length)
    }
  }
  return null
}

export function curlYazar(a: string[]): boolean {
  const yontem = (secenekDegeri(a, "-X", "--request") ?? "").toUpperCase()
  return (
    ["POST", "PUT", "DELETE", "PATCH"].includes(yontem) ||
    a.some((x) => /^(-d|--data.*|-F|--form.*|-T|--upload-file|--json)$/.test(x) || /^-d./.test(x))
  )
}

export function wgetYazar(a: string[]): boolean {
  return a.some((x) => /^--(post-data|post-file|body-data|body-file)|^--method=(POST|PUT|DELETE|PATCH)/i.test(x))
}

export function urlHost(a: string[]): string {
  for (const x of a) {
    const m = /^[a-z]+:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^/:?#]+)/i.exec(x)
    if (m) return m[1]
  }
  return "?"
}

export function kubeHedef(a: string[], p: string): string {
  const ctx = secenekDegeri(a, "--context", "--kube-context")
  if (ctx) return ctx
  const kc = secenekDegeri(a, "--kubeconfig")
  if (kc) return taban(kc).replace(/\.(ya?ml|conf)$/, "")
  return p === "oc" ? "openshift" : "kubernetes"
}

// Bu makinede (uzak değil) sistem değiştiren komutlar → hedef "localhost".
export function yerelDegisiklik(argv: string[], yazilan: string[], b: Baglam): string | null {
  const p = taban(argv[0] ?? "")
  const a = argv.slice(1)
  const ilk = a.find(secenekDegil) ?? ""
  const disari = (yollar: string[]) => yollar.some((y) => !serbestYazmaAlani(yolCoz(y, b), b))

  for (const y of yazilan) if (!serbestYazmaAlani(yolCoz(y, b), b)) return `sistem dosyasına yazma (${y})`

  switch (p) {
    case "systemctl":
      return saltOkunur(argv) ? null : `systemctl ${ilk}`
    case "service":
      return a.some((x) => ["start", "stop", "restart", "reload", "condrestart", "try-restart"].includes(x)) ? `service ${a.join(" ")}` : null
    case "dnf":
    case "yum":
    case "rpm":
    case "hostnamectl":
    case "timedatectl":
    case "nmcli":
    case "firewall-cmd":
    case "iptables":
    case "ip6tables":
    case "nft":
    case "sysctl":
    case "subscription-manager":
    case "realm":
    case "crontab":
    case "tuned-adm":
    case "authselect":
    case "swapon":
      return saltOkunur(argv) ? null : `${p} ${ilk}`.trim()
    case "ip":
      return saltOkunur(argv) ? null : `ip ${a.join(" ")}`
    case "date":
    case "hostname":
      return saltOkunur(argv) ? null : `${p} ${a.join(" ")}`
    case "mount":
      return saltOkunur(argv) ? null : "mount"
    case "useradd": case "userdel": case "usermod": case "groupadd": case "groupdel": case "groupmod":
    case "passwd": case "chpasswd": case "chage": case "gpasswd": case "reboot": case "shutdown":
    case "poweroff": case "halt": case "init": case "telinit": case "umount": case "swapoff": case "setenforce":
    case "setsebool": case "semanage": case "ipa-client-install": case "ipa-server-install": case "modprobe":
    case "ipa-replica-install": case "ipa-adtrust-install": case "ipa-server-certinstall": case "ipa-ca-install":
    case "ipa-dns-install": case "ipa-server-upgrade": case "ipa-restore":
    case "rmmod": case "insmod": case "grubby": case "grub2-mkconfig": case "dracut": case "update-crypto-policies":
    case "fdisk": case "parted": case "sgdisk": case "gdisk": case "sfdisk": case "pvcreate": case "pvremove":
    case "vgcreate": case "vgremove": case "vgextend": case "vgreduce": case "lvcreate": case "lvremove":
    case "lvextend": case "lvreduce": case "lvresize": case "resize2fs": case "xfs_growfs": case "alternatives":
    case "update-alternatives": case "at": case "certutil": case "update-ca-trust": case "restorecon": case "chcon":
      if ((p === "fdisk" || p === "sfdisk" || p === "parted") && has(a, "-l", "--list")) return null
      return `${p} ${a.join(" ")}`.trim()
    case "ipa":
    case "sssctl":
    case "oscap":
    case "dkms":
    case "ipactl":
    case "nvidia-ctk":
    case "ipa-cacert-manage":
    case "getcert":
    case "ipa-crlgen-manage":
    case "leapp":
    case "fips-mode-setup":
      return saltOkunur(argv) ? null : `${p} ${ilk}`
    case "docker":
    case "podman":
      return saltOkunur(argv) ? null : `${p} ${ilk}`
    case "rm": case "rmdir": case "unlink": case "shred": case "truncate": case "touch": case "mkdir":
    case "tee":
      return disari(a.filter(secenekDegil)) ? `${p} (çalışma dizini dışı)` : null
    case "chmod": case "chown": case "chgrp": case "chattr": case "setfacl":
      return disari(a.filter(secenekDegil).slice(p === "setfacl" ? 0 : 1)) ? `${p} (çalışma dizini dışı)` : null
    case "cp": case "install": case "ln": case "rsync": case "scp": {
      const son = a.filter(secenekDegil).pop()
      return son && !/^[^/]*:/.test(son) && disari([son]) ? `${p} → ${son}` : null
    }
    case "mv": {
      const yollar = a.filter(secenekDegil)
      return disari(yollar) ? `mv (çalışma dizini dışı)` : null
    }
    case "sed":
      return !saltOkunur(argv) && disari(a.filter(secenekDegil).slice(1)) ? "sed -i (çalışma dizini dışı)" : null
    case "dd": {
      const of = a.find((x) => x.startsWith("of="))
      return of && disari([of.slice(3)]) ? `dd ${of}` : null
    }
    case "curl":
    case "wget": {
      // `-so dosya` gibi birleşik kısa bayraklarda dosya adı bir sonraki argümandır
      const harf = p === "curl" ? "o" : "O"
      const birlesik = a.findIndex((x) => new RegExp(`^-[a-zA-Z]+${harf}$`).test(x))
      const cikti =
        birlesik >= 0 ? a[birlesik + 1] : secenekDegeri(a, ...(p === "curl" ? ["-o", "--output"] : ["-O", "--output-document"]))
      return cikti && cikti !== "-" && disari([cikti]) ? `${p} → ${cikti}` : null
    }
    case "tar": {
      const acar = a.some((x) => /^-?[a-zA-Z]*x/.test(x) && !x.startsWith("--") || x === "--extract" || x === "--get")
      const hedef = secenekDegeri(a, "-C", "--directory")
      return acar && hedef && disari([hedef]) ? `tar -x → ${hedef}` : null
    }
    case "unzip": {
      const hedef = secenekDegeri(a, "-d")
      return hedef && disari([hedef]) ? `unzip → ${hedef}` : null
    }
    case "git": {
      if (!a.includes("clone")) return null
      const yollar = a.slice(a.indexOf("clone") + 1).filter(secenekDegil)
      return yollar.length > 1 && disari([yollar[yollar.length - 1]]) ? `git clone → ${yollar[yollar.length - 1]}` : null
    }
  }
  return null
}

export const has = (a: string[], ...x: string[]) => a.some((y) => x.includes(y))

export function komutIncele(metin: string, b: Baglam): Bulgu[] {
  if (b.derinlik > 6) return [sert("iç içe komut çok derin")]
  const bulgular: Bulgu[] = []
  if (/:\s*\(\s*\)\s*\{[^}]*:\s*\|\s*:/.test(metin)) bulgular.push(sert("fork bombası"))
  const ic: string[] = []
  // G73: `for ip in 10.0.0.1 10.0.0.2; do ssh root@$ip "…"; done` — liste düz yazılmışsa ($, `, joker yok) gövde her öğe
  // için AYRI incelenir (hedef = öğe); yoksa `$ip` "?" (hedef belirsiz) kalır. while/until/select döngüleri genişletilmez.
  const donguler: { ad: string; ogeler: string[] }[] = []
  const tumDonguler: { ad: string; ogeler: string[] }[] = [] // $(…) içleri için (saha G92: result=$(ssh root@x.$ip …))
  for (const k of ayristir(metin, ic)) {
    const a = k.argv
    // G101: "cd ansible && ansible-playbook -i inventories/x.ini …" — sonraki komutların göreli yolları cd'nin dizininden
    // çözülür (envanter/playbook okunabilsin). Değişkenli/joker yol izlenmez; uzak komutta (ssh içi) yerel dizin değişmez.
    if (a[0] === "cd" && !b.uzak && a.length === 2 && !/[$`*?~]/.test(a[1]) && a[1] !== "-") b = { ...b, cwd: yolCoz(a[1], b) }
    if (["for", "while", "until", "select"].includes(a[0] ?? "")) {
      const ogeler = a[0] === "for" && a[2] === "in" && /^[A-Za-z_]\w*$/.test(a[1] ?? "") ? a.slice(3).filter((x) => x !== "do") : []
      const d = { ad: a[1] ?? "", ogeler: ogeler.length <= 200 && ogeler.every((x) => !/[$`*?(){}\[\]]/.test(x)) ? ogeler : [] }
      donguler.push(d)
      if (d.ogeler.length) tumDonguler.push(d)
    } else if (a[0] === "done") donguler.pop()
    let surumler: Komut[] = [k]
    for (const d of donguler) {
      if (!d.ogeler.length) continue
      const re = new RegExp(`\\$(?:\\{${d.ad}\\}|${d.ad}(?![A-Za-z0-9_]))`, "g")
      if (!surumler.some((x) => [...x.argv, ...x.yazilan].some((t) => t.match(re)))) continue
      surumler = surumler.flatMap((x) =>
        d.ogeler.map((o) => ({ argv: x.argv.map((t) => t.replace(re, o)), yazilan: x.yazilan.map((t) => t.replace(re, o)) })),
      )
    }
    for (const x of surumler) bulgular.push(...tekKomut(x, b))
  }
  for (const x of ic) {
    // döngü değişkeni komut ikamesinin içinde geçiyorsa her öğe için ayrı incele (düz liste); yoksa olduğu gibi
    let surumler = [x]
    for (const d of tumDonguler) {
      const re = new RegExp(`\\$(?:\\{${d.ad}\\}|${d.ad}(?![A-Za-z0-9_]))`, "g")
      if (surumler.some((y) => re.test(y))) surumler = surumler.flatMap((y) => d.ogeler.map((o) => y.replace(re, o)))
      re.lastIndex = 0
    }
    for (const y of surumler.slice(0, 400)) bulgular.push(...komutIncele(y, { ...b, derinlik: b.derinlik + 1 }))
  }
  return bulgular
}

export function tekKomut(k: Komut, b: Baglam): Bulgu[] {
  const { argv, xargs } = sarmalayiciSoy(k.argv)
  const out: Bulgu[] = []
  for (const y of k.yazilan) {
    if (BLOK_AYGIT_RE.test(y)) out.push(diskBulgu(`diske doğrudan yazma (> ${y})`, [b.uzak ?? "localhost"]))
  }
  if (argv.length === 0) {
    if (b.uzak && k.yazilan.some((y) => !zararsizHedef(y)))
      out.push(degisiklik("dosyaya yazma", [b.uzak]))
    else if (!b.uzak) {
      const r = yerelDegisiklik(["true"], k.yazilan, b)
      if (r) out.push(degisiklik(r, ["localhost"]))
    }
    return out
  }
  const p = taban(argv[0])
  const a = argv.slice(1)

  // iç kabuk: bash -c "…", su -c "…", eval …
  if (["bash", "sh", "zsh", "dash", "ksh", "su", "runuser"].includes(p)) {
    const c = secenekDegeri(a, "-c", "--command")
    if (c !== null) {
      out.push(...komutIncele(c, { ...b, derinlik: b.derinlik + 1 }))
      return out
    }
    if (["bash", "sh", "zsh", "dash", "ksh"].includes(p) && a.filter(secenekDegil).length === 0 && !b.uzak) return out
  }
  if (p === "eval") return [...out, ...komutIncele(a.join(" "), { ...b, derinlik: b.derinlik + 1 })]

  // Yerel kabuk betiği: modelin yazıp çalıştırdığı `x.sh` içindeki komutlar da aynı kilitten geçer.
  // (Python/Perl vb. betikler ayrıştırılmaz — onları motor zaten sorar: `"*": "ask"`.)
  if (!b.uzak) {
    const betik =
      ["bash", "sh", "zsh", "dash", "ksh", "source", "."].includes(p) ? a.find(secenekDegil) : /^\.{0,2}\//.test(argv[0]) ? argv[0] : undefined
    const icerik = betik ? betikOku(yolCoz(betik, b)) : null
    if (icerik !== null) out.push(...komutIncele(icerik, { ...b, derinlik: b.derinlik + 1 }))
  }

  // K6: kilitsiz ikinci bir opencode başlatma
  if (p === "opencode" && !a.every((x) => ["--version", "-v", "--help", "-h"].includes(x)))
    out.push(sert("opencode'u komut içinden başlatma (kilitsiz ikinci ajan)"))

  // K5: yıkıcı komutlar (yerel ya da uzak, yetkiyle bile açılmaz)
  if (a.includes("--no-preserve-root")) out.push(sert("--no-preserve-root"))
  if (p === "rm") {
    const ozyineli = a.some((x) => x === "--recursive" || /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(x))
    const hedefler = a.filter(secenekDegil)
    if (ozyineli && xargs) out.push(sert("xargs ile özyinelemeli silme (hedef görünmüyor)"))
    for (const h of hedefler) if (ozyineli && tehlikeliKok(h, b, true)) out.push(sert(`rm -r ${h}`))
  }
  if (["chmod", "chown", "chgrp"].includes(p)) {
    const ozyineli = a.some((x) => x === "--recursive" || /^-[a-zA-Z]*R[a-zA-Z]*$/.test(x))
    for (const h of a.filter(secenekDegil).slice(1)) {
      const yalin = h.replace(/\/\*?$/, "") || "/"
      if ((ozyineli && tehlikeliKok(h, b, false)) || yalin === "/") out.push(sert(`${p} ${ozyineli ? "-R " : ""}${h}`))
    }
  }
  if (p === "mv") for (const h of a.filter(secenekDegil).slice(0, -1)) if (tehlikeliKok(h, b, false)) out.push(sert(`mv ${h}`))
  const diskHedef = [b.uzak ?? "localhost"]
  const diskAygit = a.filter((x) => BLOK_AYGIT_RE.test(x)).join(" ")
  if (/^mkfs(\..*)?$/.test(p) || p === "mke2fs" || (p === "wipefs" && !wipefsOkur(a)) || p === "blkdiscard")
    out.push(diskBulgu(`${p}${diskAygit ? " " + diskAygit : ""}`, diskHedef))
  if (p === "mkswap" && a.some((x) => BLOK_AYGIT_RE.test(x))) out.push(diskBulgu(`mkswap ${diskAygit}`, diskHedef))
  if (p === "sgdisk" && a.some((x) => /^(--zap|--zap-all|-Z|-z)$/.test(x))) out.push(diskBulgu(`sgdisk --zap ${diskAygit}`, diskHedef))
  if (p === "dd") {
    const of = a.find((x) => x.startsWith("of="))
    if (of && BLOK_AYGIT_RE.test(of.slice(3))) out.push(diskBulgu(`dd ${of}`, [b.uzak ?? "localhost"]))
  }
  if (p === "shred" && a.some((x) => BLOK_AYGIT_RE.test(x))) out.push(diskBulgu(`shred ${a.filter((x) => BLOK_AYGIT_RE.test(x)).join(" ")}`, [b.uzak ?? "localhost"]))
  if (p === "kill" && /(^|\s)(-\d+|-[A-Z]+|-s\s+\S+|--)\s+-1(\s|$)/.test(a.join(" "))) out.push(sert("kill … -1 (tüm süreçler)"))
  if (p === "git" && a.includes("push") && a.some((x) => /^(-f|--force|--force-with-lease.*|--force-if-includes|--mirror)$/.test(x) || /^\+/.test(x)))
    out.push(sert("git push --force"))
  if (p === "find") {
    const ilkIfade = a.findIndex((x) => x.startsWith("-") || x === "(" || x === "!")
    const kokler = ilkIfade < 0 ? a : a.slice(0, ilkIfade)
    const ekIdx = a.findIndex((x) => /^-(exec|execdir|ok|okdir)$/.test(x))
    const siler = a.includes("-delete") || (ekIdx >= 0 && ["rm", "shred", "unlink"].includes(taban(a[ekIdx + 1] ?? "")))
    if (siler) {
      for (const r of kokler.length ? kokler : ["."]) {
        const yalin = r.replace(/\/+$/, "") || "/"
        const abs = b.uzak && !isAbsolute(yalin) ? yalin : yolCoz(yalin, b)
        if (SISTEM_KOKLERI.has(abs) || /^\/(home|root)(\/[^/]+)?$/.test(abs) || r.startsWith("$"))
          out.push(sert(`find ${r} -delete/-exec rm`))
      }
    }
    if (ekIdx >= 0) {
      // -exec'in çalıştırdığı komutu ayrıca incele ({} → find kökü)
      let son = a.findIndex((x, i) => i > ekIdx && (x === ";" || x === "+"))
      if (son < 0) son = a.length
      const kok = (kokler[0] ?? ".").replace(/\/+$/, "") || "/"
      const alt = a.slice(ekIdx + 1, son).map((x) => (x === "{}" ? kok : x))
      if (alt.length) out.push(...tekKomut({ argv: alt, yazilan: [] }, { ...b, derinlik: b.derinlik + 1 }))
    }
  }

  // K1: uzak erişim araçları
  if (p === "ssh") {
    if (a.includes("-G")) return out // `ssh -G host`: yalnız çözülmüş ayarı yazar, bağlanmaz (saha G67)
    const hedef = sshHedef(a)
    if (!hedef.host) return [...out, degisiklik("ssh (hedef çözülemedi)", ["?"])]
    if (!hedef.komut) return [...out, degisiklik("etkileşimli ssh oturumu", [hedef.host])]
    const ic = komutIncele(hedef.komut, { ...b, uzak: hedef.host, derinlik: b.derinlik + 1 })
    return [...out, ...ic]
  }
  if (p === "ssh-copy-id") {
    const h = a.filter(secenekDegil).pop()
    return [...out, degisiklik("ssh-copy-id (uzak authorized_keys)", [h ? normHost(h) : "?"])]
  }
  if (p === "scp" || p === "rsync" || p === "sftp") {
    const yollar = a.filter(secenekDegil)
    const son = yollar[yollar.length - 1] ?? ""
    const m = /^(?:[^@/\s]+@)?(\[[^\]]+\]|[A-Za-z0-9._-]+):/.exec(son)
    if (p === "sftp") out.push(degisiklik("sftp oturumu", [normHost((yollar[0] ?? "?").split(":")[0])]))
    else if (m) out.push(degisiklik(`${p} → ${son}`, [m[1]]))
    else if (!b.uzak) {
      const r = yerelDegisiklik(argv, k.yazilan, b)
      if (r) out.push(degisiklik(r, ["localhost"]))
    }
    if (b.uzak) out.push(degisiklik(`${p} (uzaktan)`, [b.uzak]))
    return out
  }
  if (p === "ansible-playbook") {
    if (has(a, "--check", "-C", "--syntax-check", "--list-hosts", "--list-tasks", "--list-tags")) return out
    // T28 (Alp, 2026-09-30): yalnız okuyan playbook (ör. 01-ping.yaml) değişiklik değildir → yetki sorulmaz.
    // Karar dosyanın İÇERİĞİNE göre verilir; okunamayan/anlaşılamayan her durumda kilit devrede kalır.
    if (!b.uzak) {
      const kitaplar = playbookDosyalari(a)
      // K5 playbook içindeki komutlara da uygulanır (önceden içerik hiç okunmuyordu)
      const icler = kitaplar.flatMap((k) => playbookKomutlari(yolCoz(k, b)).flatMap((c) =>
        komutIncele(c, { ...b, uzak: "__ansible__", derinlik: b.derinlik + 1 })))
      out.push(...icler.filter((x) => x.tur === "sert"))
      if (out.some((x) => x.tur === "sert")) return out
      const diskIc = icler.filter((x) => x.tur === "disk")
      if (diskIc.length) {
        const lim = secenekDegeri(a, "-l", "--limit")
        out.push(diskBulgu(`ansible-playbook içinde: ${[...new Set(diskIc.map((x) => x.neden))].join("; ")}`, lim ? limitHedefleri(lim) : envanterHedefleri(a, b)))
      } else if (kitaplar.length > 0 && kitaplar.every((k) => playbookSaltOkunur(yolCoz(k, b), b))) return out
    }
    const limit = secenekDegeri(a, "-l", "--limit")
    const hedefler = limit ? limitHedefleri(limit) : envanterHedefleri(a, b)
    return [...out, degisiklik(`ansible-playbook ${a.filter(secenekDegil).find((x) => /\.ya?ml$/.test(x)) ?? ""} (--check yok)`.trim(), hedefler)]
  }
  if (p === "ansible") {
    if (a.length === 0 || has(a, "--version", "--list-hosts", "--check", "-C")) return out
    const oruntu = ansibleOruntu(a)
    const modul = secenekDegeri(a, "-m", "--module-name") ?? "command"
    const arg = secenekDegeri(a, "-a", "--args") ?? ""
    const okur = ["ping", "setup", "gather_facts", "stat", "find", "slurp", "service_facts", "package_facts", "debug", "getent", "command", "shell", "raw"]
    let degistirir = !okur.includes(taban(modul).replace(/^ansible\.(builtin|legacy)\./, ""))
    if (!degistirir && ["command", "shell", "raw"].includes(taban(modul).replace(/^ansible\.(builtin|legacy)\./, ""))) {
      const ic = komutIncele(arg, { ...b, uzak: "__ansible__", derinlik: b.derinlik + 1 })
      out.push(...ic.filter((x) => x.tur === "sert"))
      const diskIc = ic.filter((x) => x.tur === "disk")
      if (diskIc.length)
        out.push(diskBulgu([...new Set(diskIc.map((x) => x.neden))].join("; "), limitHedefleri(secenekDegeri(a, "-l", "--limit") ?? oruntu)))
      degistirir = ic.some((x) => x.tur === "degisiklik" || x.tur === "disk")
    }
    const limit = secenekDegeri(a, "-l", "--limit")
    if (degistirir) out.push(degisiklik(`ansible -m ${modul}`, limitHedefleri(limit ?? oruntu)))
    return out
  }
  if (["ansible-pull", "ansible-console", "pssh", "parallel-ssh", "pdsh", "clush", "prsync", "pscp"].includes(p))
    return [...out, degisiklik(`${p} (toplu uzak komut — hedef tek tek belirtilmeli)`, ["?"])]
  if ((p === "kubectl" || p === "oc") && !saltOkunur(argv))
    return [...out, degisiklik(`${p} ${kubeFiil(a)}`, [kubeHedef(a, p)])]
  if (p === "helm" && !saltOkunur(argv) && !["repo", "dependency", "plugin", "completion", "help"].includes(a.find(secenekDegil) ?? ""))
    return [...out, degisiklik(`helm ${a.find(secenekDegil) ?? ""}`, [kubeHedef(a, "helm")])]
  if (p === "curl" && curlYazar(a)) return [...out, degisiklik("curl (POST/PUT/DELETE)", [urlHost(a)])]
  if (p === "wget" && wgetYazar(a)) return [...out, degisiklik("wget (POST)", [urlHost(a)])]
  if (p === "ipa" && !saltOkunur(argv)) return [...out, degisiklik(`ipa ${a.find(secenekDegil) ?? ""}`, [b.uzak ?? "ipa"])]

  if (b.uzak) {
    if (!saltOkunur(argv)) {
      const tanimsiz = !BILINEN_ARAC.has(p) && !p.startsWith("mkfs")
      out.push(degisiklik(tanimsiz ? `${p} (uzakta — kilit bu komutu tanımıyor)` : `${p} (uzakta)`, [b.uzak], tanimsiz))
    }
    else if (k.yazilan.some((y) => !zararsizHedef(y)))
      out.push(degisiklik(`${p} > dosya (uzakta)`, [b.uzak]))
    return out
  }
  const r = yerelDegisiklik(argv, k.yazilan, b)
  if (r) out.push(degisiklik(r, ["localhost"]))
  return out
}

export function betikOku(abs: string): string | null {
  try {
    const icerik = readFileSync(abs, "utf8")
    if (icerik.length > 256 * 1024 || icerik.includes("\u0000")) return null
    const ilk = icerik.split("\n", 1)[0]
    if (ilk.startsWith("#!") && !/\b(ba|z|da|k)?sh\b/.test(ilk)) return null
    return icerik
  } catch {
    return null
  }
}

export const SSH_DEGERLI = new Set("bcDEeFIiJLlmOopQRSWw".split(""))

export function sshHedef(a: string[]): { host: string | null; komut: string } {
  let i = 0
  while (i < a.length) {
    const x = a[i]
    if (x === "--") {
      i++
      break
    }
    if (x.startsWith("-") && x.length > 1) {
      for (let j = 1; j < x.length; j++) {
        if (SSH_DEGERLI.has(x[j])) {
          if (j === x.length - 1) i++
          break
        }
      }
      i++
      continue
    }
    break
  }
  const hedef = a[i]
  if (!hedef) return { host: null, komut: "" }
  const m = /^ssh:\/\/(?:[^@]*@)?([^:/]+)/.exec(hedef)
  return { host: normHost(m ? m[1] : hedef), komut: a.slice(i + 1).join(" ") }
}

// --- salt-okunur playbook tespiti (T28) ---------------------------------------------------
// Tüm görevleri yalnız okuyan modüllerden oluşan playbook değişiklik sayılmaz. Muhafazakâr: rol, include/import,
// bilinmeyen modül, vault/tanınmayan YAML etiketi, Jinja'lı komut, 256 KB üstü dosya → "değişiklik" (kilit devrede).

const PLAYBOOK_DEGERLI = new Set(["-i", "--inventory", "--inventory-file", "-e", "--extra-vars", "-l", "--limit",
  "-u", "--user", "-t", "--tags", "--skip-tags", "-f", "--forks", "-M", "--module-path", "--private-key", "--key-file",
  "--vault-id", "--vault-password-file", "-c", "--connection", "-T", "--timeout", "--ssh-common-args",
  "--ssh-extra-args", "--sftp-extra-args", "--scp-extra-args", "--become-method", "--become-user", "--start-at-task"])

export function playbookDosyalari(a: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("-")) {
      if (PLAYBOOK_DEGERLI.has(a[i])) i++
      continue
    }
    out.push(a[i])
  }
  return out
}

const OKUR_MODULLER = new Set(["ping", "setup", "gather_facts", "debug", "stat", "assert", "fail", "set_fact",
  "wait_for_connection", "service_facts", "package_facts", "getent", "find", "slurp", "meta", "include_vars"])
const KOMUT_MODULLERI = new Set(["command", "shell", "raw"])
const GOREV_ANAHTARLARI = new Set(["name", "when", "register", "loop", "loop_control", "with_items", "with_dict",
  "with_list", "with_fileglob", "with_sequence", "tags", "ignore_errors", "ignore_unreachable", "changed_when",
  "failed_when", "delegate_to", "delegate_facts", "run_once", "become", "become_user", "become_method", "vars",
  "environment", "args", "no_log", "check_mode", "diff", "retries", "until", "delay", "notify", "listen", "timeout",
  "throttle", "any_errors_fatal", "module_defaults", "collections", "connection", "remote_user", "debugger"])

function modulAdi(m: string): string {
  return m.replace(/^ansible\.(builtin|legacy)\./, "")
}

function playbookOku(abs: string): unknown[] | null {
  try {
    const icerik = readFileSync(abs, "utf8")
    if (icerik.length > 256 * 1024) return null
    const yaml = (globalThis as { Bun?: { YAML?: { parse: (s: string) => unknown } } }).Bun?.YAML
    if (!yaml) return null
    const veri = yaml.parse(icerik)
    return Array.isArray(veri) && veri.length > 0 ? veri : null
  } catch {
    return null
  }
}

function gorevKomutu(t: Record<string, unknown>, modul: string): string | null {
  const deger = t[modul]
  const argsCmd = t.args && typeof t.args === "object" ? (t.args as Record<string, unknown>).cmd : undefined
  if (typeof deger === "string") return deger
  if (deger && typeof deger === "object" && typeof (deger as Record<string, unknown>).cmd === "string")
    return (deger as Record<string, unknown>).cmd as string
  return typeof argsCmd === "string" ? argsCmd : null
}

function gorevler(oyunlar: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const gez = (l: unknown) => {
    if (!Array.isArray(l)) return
    for (const g of l) {
      if (!g || typeof g !== "object" || Array.isArray(g)) continue
      const t = g as Record<string, unknown>
      if ("block" in t) for (const k of ["block", "rescue", "always"]) gez(t[k])
      else out.push(t)
    }
  }
  for (const o of oyunlar)
    if (o && typeof o === "object") for (const k of ["pre_tasks", "tasks", "post_tasks", "handlers"]) gez((o as Record<string, unknown>)[k])
  return out
}

// Playbook'taki command/shell/raw komutları (K5 taraması için) — okunamazsa boş.
export function playbookKomutlari(abs: string): string[] {
  const oyunlar = playbookOku(abs)
  if (!oyunlar) return []
  const out: string[] = []
  for (const t of gorevler(oyunlar)) {
    const m = Object.keys(t).find((k) => !GOREV_ANAHTARLARI.has(k))
    if (m && KOMUT_MODULLERI.has(modulAdi(m))) {
      const c = gorevKomutu(t, m)
      if (c) out.push(c)
    }
  }
  return out
}

function gorevSaltOkunur(g: unknown, b: Baglam): boolean {
  if (!g || typeof g !== "object" || Array.isArray(g)) return false
  const t = g as Record<string, unknown>
  if ("block" in t)
    return (["block", "rescue", "always"] as const).every(
      (k) => t[k] === undefined || (Array.isArray(t[k]) && (t[k] as unknown[]).every((x) => gorevSaltOkunur(x, b))),
    )
  const moduller = Object.keys(t).filter((k) => !GOREV_ANAHTARLARI.has(k))
  if (moduller.length !== 1) return false
  const m = modulAdi(moduller[0])
  if (OKUR_MODULLER.has(m)) return true
  if (!KOMUT_MODULLERI.has(m)) return false
  const komut = gorevKomutu(t, moduller[0])
  if (!komut || /\{\{|\{%/.test(komut)) return false // Jinja: çalışma anında ne olacağı belli değil
  return komutIncele(komut, { ...b, uzak: "__ansible__", derinlik: b.derinlik + 1 }).length === 0
}

export function playbookSaltOkunur(abs: string, b: Baglam): boolean {
  const veri = playbookOku(abs)
  if (!veri) return false
  return veri.every((oyun) => {
    if (!oyun || typeof oyun !== "object") return false
    const o = oyun as Record<string, unknown>
    if ("import_playbook" in o || "roles" in o) return false
    const listeler = ["pre_tasks", "tasks", "post_tasks", "handlers"].map((k) => o[k]).filter((x) => x !== undefined)
    return listeler.every((l) => Array.isArray(l) && l.every((g) => gorevSaltOkunur(g, b)))
  })
}

export function ansibleOruntu(a: string[]): string {
  const degerli = new Set(["-i", "--inventory", "-m", "--module-name", "-a", "--args", "-u", "--user", "-e",
    "--extra-vars", "-f", "--forks", "-l", "--limit", "-M", "--module-path", "-T", "--timeout", "--become-user",
    "--become-method", "-c", "--connection", "--private-key", "--vault-password-file", "--vault-id", "-t", "--tree",
    "-B", "--background", "-P", "--poll"])
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("-")) {
      if (degerli.has(a[i])) i++
      continue
    }
    return a[i]
  }
  return "?"
}

// G101 (Alp, 2026-10-22: "limit yok, çünkü yeni dosyada sadece değişiklik yapılan sunucular var"): --limit yoksa hedef, -i ile
// verilen envanter DOSYA(LAR)ının host'larıdır — iş envanteri (hosts-<CN>-<tarih>.ini) tam bunun için. Her host'un adı VE
// ansible_host IP'si ayrı hedef olur (ikisi de yetkide olmalı: yetkili ada başka IP yazılarak hedef kaydırılamaz). -i yok
// (ansible.cfg'deki envanter), dizin, betik, YAML, okunamayan ya da boş envanter → "?" (hedef belirsiz, --limit gerekir).
// "-i a,b," satır içi host listesi → o adlar.
export function envanterHedefleri(a: string[], b: Baglam): string[] {
  const iler: string[] = []
  for (let i = 0; i < a.length; i++) {
    const m = /^(?:-i|--inventory|--inventory-file)(?:=(.+))?$/.exec(a[i])
    if (m) iler.push(m[1] ?? a[++i] ?? "")
    else if (/^-i./.test(a[i])) iler.push(a[i].slice(2))
  }
  if (!iler.length) return ["?"]
  const out = new Set<string>()
  for (const inv of iler) {
    if (inv.includes(",")) {
      inv.split(",").map((x) => x.trim()).filter(Boolean).forEach((x) => out.add(normHost(x)))
      continue
    }
    if (!/\.ini$/i.test(inv) && !/(^|\/)hosts[^/]*$/i.test(inv)) return ["?"]
    let metin: string
    try {
      metin = readFileSync(yolCoz(inv, b), "utf8")
    } catch {
      return ["?"]
    }
    if (metin.length > 2 * 1024 * 1024) return ["?"]
    // [grup:vars] altında ansible_host → grubun tüm host'larını başka adrese yönlendirir; host başına denetlenemez
    if (/^\s*ansible_(?:ssh_)?host\s*=/im.test(metin)) return ["?"]
    const env: Envanter = { hostlar: new Map(), gruplar: new Map(), altGruplar: new Map(), dosyalar: [] }
    envanterAyristir(metin, env)
    // eş adlar = ad, kısa ad (addan türetilir — ayrı hedef değil), ansible_host değeri (IP ya da FQDN — ayrı hedef)
    for (const [h, esler] of env.hostlar) {
      out.add(normHost(h))
      for (const e of esler) if (e !== h && e !== h.split(".")[0]) out.add(normHost(e))
    }
  }
  return out.size ? [...out] : ["?"]
}

export function limitHedefleri(limit: string): string[] {
  const h = limit
    .split(/[,:]/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith("!"))
    .map((x) => normHost(x.replace(/^&/, "")))
  return h.length ? h : ["?"]
}

// K6: korunan yollar — ajanın kendi ayarı/eklentisi/oturum verisi/audit log'u.
export function korunanYollar(): { yazma: string[]; okuma: string[] } {
  const home = userInfo().homedir
  const cfg = process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "opencode") : join(home, ".config", "opencode")
  const data = process.env.XDG_DATA_HOME ? join(process.env.XDG_DATA_HOME, "opencode") : join(home, ".local", "share", "opencode")
  const yazma = [cfg, data, dirname(auditLogYolu())]
  if (process.env.OPENCODE_CONFIG_DIR) yazma.push(process.env.OPENCODE_CONFIG_DIR)
  if (process.env.OPENCODE_CONFIG) yazma.push(process.env.OPENCODE_CONFIG)
  // Okuma kısıtı yok (Alp, 2026-09-28): kurum içi offline sistem, gizlenecek bir şey yok.
  return { yazma, okuma: [] }
}

export function korunanYol(abs: string, yazma: boolean): boolean {
  const k = korunanYollar()
  if ((yazma ? k.yazma : k.okuma).some((d) => isInside(d, abs))) return true
  const parcalar = abs.split("/")
  if (parcalar.includes(".opencode") && yazma) return true
  const ad = parcalar[parcalar.length - 1]
  if (/^opencode\.jsonc?$/.test(ad) && yazma) return true // izinleri ezer (yazma); okuma serbest
  return false
}

export function korunanMetin(metin: string): string | null {
  const k = korunanYollar()
  const home = userInfo().homedir
  const adaylar = [
    ...k.yazma.map((d) => d.replace(home, "~")),
    ...k.yazma,
    ".config/opencode",
    ".local/share/opencode",
    "ops-agent/audit",
  ]
  for (const a of adaylar) if (metin.includes(a)) return a
  if (/(^|[\s/'"=])\.opencode([\s/'"]|$)/.test(metin)) return ".opencode/"
  if (/opencode\.jsonc?\b/.test(metin)) return "opencode.json"
  if (/\bOPS_AGENT_[A-Z_]*/.test(metin)) return "OPS_AGENT_*"
  if (/\b(export\s+)?OPENCODE_[A-Z_]*\s*=/.test(metin)) return "OPENCODE_*="
  if (/\$\{?XDG_(CONFIG|DATA)_HOME/.test(metin)) return "XDG_*_HOME"
  return null
}

export function yamaYollari(patch: string): string[] {
  const out: string[] = []
  for (const m of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm)) out.push((m[1] ?? m[2]).trim())
  return out
}

export interface KilitKarari {
  kilit: "K1" | "K5" | "K6"
  mesaj: string
  // G68: true → engelleme, kullanıcıya SOR (yalnız K1 ve yalnız tüm değişiklik bulguları "belirsiz"se). Onayı yalnız
  // kullanıcı verir; "her zaman izin ver" kuralı bunu atlatamaz (adaptör evaluate'te effect'i yine "ask" yapar).
  sor?: boolean
}

export const YETKI_NASIL =
  'Yetkiyi YALNIZ kullanıcı kendi mesajıyla verir (sen yazamazsın). YENİ KURULUM (yeni makineler) için numara ' +
  'GEREKMEZ: kullanıcı "kurulum yapacağım" (harf fark etmez) + "sunucular: <ad>, <ad>" (ya da --limit grubunun adı) ' +
  'yazar — yeni kurulumda CN ' +
  'önerme. Mevcut (çalışan) sunucuda değişiklik: CN numarası + sunucular — BİÇİM DAYATMA: kullanıcı aynı mesajda ' +
  'serbest yazabilir ("CHG0012345 ile web01, web02 sunucularında", alt alta liste, birden çok CN, wor07-14 aralığı). Kriz: ' +
  'cümle içinde de olur, kriz cümlesi yeter ("kriz var, wor14 ve wor07\'de …"). Ad, kısa ad, IP ya da grup adı envanterden ' +
  'eşlenir. Bu makine için listeye localhost yazılır. Salt-okunur işlerle ' +
  "devam edebilirsin; kullanıcıya yalnız EKSİK olanı (numara mı, sunucu mu) tek cümleyle söyle."

export function kilitDenetle(
  tool: string,
  args: Record<string, unknown>,
  workdir: string,
  yetki: Yetki | undefined,
): KilitKarari | null {
  const home = userInfo().homedir
  const b: Baglam = {
    workdir,
    cwd: typeof args.workdir === "string" ? (isAbsolute(args.workdir) ? args.workdir : resolve(workdir, args.workdir)) : workdir,
    home,
    uzak: null,
    derinlik: 0,
  }
  let bulgular: Bulgu[] = []

  if (tool === "bash" && typeof args.command === "string") {
    // K6 yalnız yazma/değiştirmeye uygulanır: `cat engine/opencode.json` gibi salt-okunur komutlar serbest.
    const ic: string[] = []
    let yalnizOkur = false
    try {
      const komutlar = ayristir(args.command, ic)
      yalnizOkur =
        ic.length === 0 &&
        komutlar.every((k) => k.yazilan.length === 0 && saltOkunur(sarmalayiciSoy(k.argv).argv))
    } catch {
      yalnizOkur = false
    }
    const k6 = yalnizOkur ? null : korunanMetin(args.command)
    if (k6)
      return {
        kilit: "K6",
        mesaj: `[güvenlik kilidi K6] Komut ajanın kendi ayar/eklenti/kayıt alanına dokunuyor (${k6}) — bu alan ajana kapalı, yetkiyle de açılmaz. Gerekiyorsa kullanıcı kendisi yapar.`,
      }
    bulgular = komutIncele(args.command, b)
  } else if (["edit", "write", "apply_patch", "multiedit", "patch"].includes(tool)) {
    const yollar = [
      ...(typeof args.filePath === "string" ? [args.filePath] : []),
      ...(typeof args.patchText === "string" ? yamaYollari(args.patchText) : []),
    ]
    for (const y of yollar) {
      const abs = yolCoz(y, b)
      if (korunanYol(abs, true))
        return { kilit: "K6", mesaj: `[güvenlik kilidi K6] ${y}: ajanın kendi ayar/eklenti/kayıt alanı — yazma kapalı, yetkiyle de açılmaz.` }
      if (!serbestYazmaAlani(abs, b)) bulgular.push(degisiklik(`dosya düzenleme: ${y}`, ["localhost"]))
    }
  } else if (["read", "grep", "glob", "list"].includes(tool)) {
    const y = typeof args.filePath === "string" ? args.filePath : typeof args.path === "string" ? args.path : null
    if (y && korunanYol(yolCoz(y, b), false))
      return { kilit: "K6", mesaj: `[güvenlik kilidi K6] ${y}: erişim anahtarı/audit kaydı içerir — okuma kapalı.` }
    return null
  } else return null

  const sertler = bulgular.filter((x) => x.tur === "sert")
  if (sertler.length)
    return {
      kilit: "K5",
      mesaj: `[güvenlik kilidi K5] Yıkıcı komut engellendi: ${[...new Set(sertler.map((x) => x.neden))].join("; ")}. Bu kilit CN/KURULUM/KRİZ yetkisiyle de açılmaz — gerçekten gerekiyorsa kullanıcı komutu kendisi çalıştırır.`,
    }

  const degisenler = bulgular.filter((x) => x.tur === "degisiklik" || x.tur === "disk")
  const diskler = bulgular.filter((x) => x.tur === "disk")
  const diskNotu = diskler.length
    ? ` YIKICI DİSK KOMUTU (${[...new Set(diskler.map((x) => x.neden))].join("; ")}): yetkiden sonra her komut ayrıca onay ekranına düşer.`
    : ""
  if (!degisenler.length) return null
  const hedefler = [...new Set(degisenler.flatMap((x) => x.hedefler))]
  const nedenler = [...new Set(degisenler.map((x) => x.neden))].join("; ")
  if (hedefler.includes("?") || hedefler.includes("__ansible__"))
    return {
      kilit: "K1",
      mesaj: `[güvenlik kilidi K1] Değişiklik yapan komutun hedefi belirlenemedi (${nedenler}). ansible-playbook için hedefi --limit <sunucu,…> ile ya da -i ile yalnız işin sunucularını içeren iş envanteri (hosts-<CN>-<tarih>.ini) ile ver; toplu araç yerine sunucu başına komut kullan. ${YETKI_NASIL}`,
    }
  // G68: tüm değişiklik bulguları "belirsiz" (kilidin tanımadığı uzak komut) ise engel yerine kullanıcıya sor.
  const hepsiBelirsiz = degisenler.every((x) => x.belirsiz)
  const sorKarari = (durum: string): KilitKarari => ({
    kilit: "K1",
    sor: true,
    mesaj: `[kilit — ONAY] Kilit bu uzak komutu tanımıyor: ${nedenler} → hedef: ${hedefler.join(", ")} (${durum}). Salt-okunur olduğundan eminsen onayla, değilse reddet. (Ajan için: reddedilirse başka yazımla deneme.)`,
  })
  if (!yetkiAktif(yetki, Date.now())) {
    if (hepsiBelirsiz) return sorKarari("bu oturumda geçerli yetki yok")
    const eksik = !yetki || !yetki.tur
      ? "bu oturumda yetki yok"
      : yetki.sunucular.length === 0
        ? `${yetki.tur} verildi ama sunucu listesi yok — ajan hedefi bir önceki mesajında tek satır "sunucular: <ad>" ile önerip kullanıcıdan yalnız onay istemeli ("kriz var, evet" yeter; cümle dikte etme)`
        : yetki.tur === "CN" && !yetki.cn
          ? "CN numarası yok"
          : "yetkinin süresi doldu (12 saat)"
    return {
      kilit: "K1",
      mesaj: `[güvenlik kilidi K1] Bu komut değişiklik yapıyor (${nedenler}) → hedef: ${hedefler.join(", ")}. Çalıştırılmadı: ${eksik}.${yetki?.uyari ? ` Not: ${yetki.uyari}.` : ""}${diskNotu} ${YETKI_NASIL}`,
    }
  }
  const disarida = hedefler.filter((h) => !hostListede(h, yetki.esler ?? yetki.sunucular))
  if (disarida.length && hepsiBelirsiz) return sorKarari(`hedef yetki listesinde yok: ${disarida.join(", ")}`)
  if (disarida.length)
    return {
      kilit: "K1",
      mesaj: `[güvenlik kilidi K1] Hedef yetki listesinde yok: ${disarida.join(", ")} (geçerli yetki — ${yetkiOzeti(yetki)}).${yetki.uyari ? ` Not: ${yetki.uyari}.` : ""} Komut: ${nedenler}. Kullanıcı listeyi güncellemeli (serbest yazabilir; envanterdeki ad, kısa ad, IP, grup adı ve "07-14" aralığı eşleşir).${yetki.envanterNotu ? ` Envanter: ${yetki.envanterNotu}.` : ""} (Ajan için: kilit YALNIZ kullanıcının mesajını okur — komuta "kriz" yazmak ya da başka yazımla denemek yetki vermez; geçerli listeyi kullanıcıya aynen göster, eksik olanı sor. "Kilit çalışmıyor" deme.)${diskNotu}`,
    }
  if (diskler.length)
    return {
      kilit: "K5",
      sor: true,
      mesaj: `[kilit — ONAY: YIKICI DİSK KOMUTU] ${[...new Set(diskler.map((x) => x.neden))].join("; ")} → hedef: ${[...new Set(diskler.flatMap((x) => x.hedefler))].join(", ")} (yetki: ${yetkiOzeti(yetki)}). Diskteki veri GERİ GELMEZ. Onaylamadan önce bu aygıtın o sunucuda "BOŞ ADAY" olduğunu gör (rhel-depolama disk-durum.py — reboot sonrası harfler değişebilir). Emin değilsen reddet. (Ajan için: reddedilirse başka yazımla deneme.)`,
    }
  return null
}
