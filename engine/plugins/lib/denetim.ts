// denetim.ts — motordan bağımsız audit + yetki yardımcıları (ADR-0005). opencode 2.x adaptörü
// (../guvenlik-v2.ts) kullanır; davranış 1.x adaptörüyle (../audit-log.ts) aynıdır.
// Şema: ../../../knowledge/policy/AUDIT-FORMAT.md §2 (alanlar) + §3 (hash zinciri).
// Bağımlılık yok: yalnız Node/Bun çekirdek modülleri.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { createHash, randomUUID } from "crypto"
import { execFileSync } from "child_process"
import { hostname, userInfo } from "os"
import { dirname, join } from "path"
import { KRIZ_METNI_MIN, YETKI_OMRU_MS, buyuk, yetkiAktif, yetkiOzeti, yetkiSatirlariniOku } from "./kilit"
import { envanterOku, yetkiGenislet } from "./envanter"
import type { Yetki } from "./kilit"

export const ZERO_HASH = "0".repeat(64)
// Askıda kalan çağrı (before görüldü, after gelmedi) bu süreden sonra "error"/"deny" olarak kapatılır.
export const STALE_PENDING_MS = 5 * 60 * 1000

export const auditYolu = () => process.env.OPS_AGENT_AUDIT_LOG ?? "/var/log/ops-agent/audit.jsonl"
// G107 (Alp, 2026-10-26: "aynı session'dayım, niye yine change number soruyor? bu bir hata"): yetki yalnız bellekteydi →
// opencode yeniden başlayınca (güncelleme, TUI kapanıp açılma) aynı oturumda CN yeniden soruluyordu. Kök oturumun yetkisi
// audit dizininin yanında saklanır; bellekte yoksa buradan, ömrü (YETKI_OMRU_MS) dolmadıysa geri yüklenir.
const yetkiDosyasi = (sessionID: string) =>
  /^[A-Za-z0-9_-]{1,128}$/.test(sessionID) ? join(process.env.OPS_AGENT_YETKI_DIZINI ?? join(dirname(auditYolu()), "yetki"), `${sessionID}.json`) : null

export function yetkiSakla(yetkiler: Map<string, Yetki>, sessionID: string) {
  const yol = yetkiDosyasi(sessionID)
  if (!yol) return
  try {
    const y = yetkiler.get(sessionID)
    if (!y) return rmSync(yol, { force: true })
    mkdirSync(dirname(yol), { recursive: true, mode: 0o700 })
    writeFileSync(yol, JSON.stringify(y), { mode: 0o600 })
  } catch (err) {
    console.error(`[guvenlik] yetki saklanamadı (${yol}):`, (err as Error).message)
  }
}

export function yetkiYukle(yetkiler: Map<string, Yetki>, sessionID: string, now = Date.now()): Yetki | undefined {
  const bellek = yetkiler.get(sessionID)
  if (bellek) return bellek
  const yol = yetkiDosyasi(sessionID)
  if (!yol || !existsSync(yol)) return undefined
  try {
    const y = JSON.parse(readFileSync(yol, "utf8")) as Yetki
    if (typeof y?.zaman !== "number" || !Array.isArray(y.sunucular) || now - y.zaman > YETKI_OMRU_MS) return undefined
    yetkiler.set(sessionID, y)
    return y
  } catch {
    return undefined
  }
}

export const sha256 = (input: string | Buffer): string => createHash("sha256").update(input).digest("hex")

function safeExec(cmd: string, args: string[], cwd?: string): string | null {
  try {
    const out = execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    return out.trim() || null
  } catch {
    return null
  }
}

// Aynı ikili çalışıyor: process.execPath derlenmiş opencode'un yoludur (AUDIT-FORMAT.md §2 "engine.version").
export const motorSurumu = () => safeExec(process.execPath, ["--version"])

export function configHash(projeDizini: string | undefined): string | null {
  const home = userInfo().homedir
  const adaylar = [
    process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "opencode", "opencode.json") : null,
    join(home, ".config", "opencode", "opencode.json"),
    projeDizini ? join(projeDizini, "engine", "opencode.json") : null,
  ].filter((p): p is string => Boolean(p))
  for (const yol of adaylar) {
    try {
      if (existsSync(yol)) return sha256(readFileSync(yol))
    } catch {
      // sıradaki adaya geç
    }
  }
  return null
}

export function politikaHash(projeDizini: string | undefined): string | null {
  if (!projeDizini) return null
  const dosya = join(projeDizini, "knowledge", "policy", "AUDIT-FORMAT.md")
  const git = safeExec("git", ["log", "-1", "--format=%H", "--", dosya], projeDizini)
  if (git) return git
  try {
    if (existsSync(dosya)) return sha256(readFileSync(dosya))
  } catch {
    // düşür
  }
  return null
}

export function beceriCommit(projeDizini: string | undefined, ad: string): string | null {
  if (!projeDizini) return null
  for (const kova of ["approved", "experimental", "generated"]) {
    const taban = join(projeDizini, "knowledge", "skills", kova, ad)
    const yol = existsSync(join(taban, "SKILL.md")) ? join(taban, "SKILL.md") : existsSync(`${taban}.md`) ? `${taban}.md` : null
    if (yol) return safeExec("git", ["log", "-1", "--format=%H", "--", yol], projeDizini)
  }
  return null
}

export interface Kayit {
  timestamp: string
  sessionID: string
  tool: string
  argsHash: string
  target: string
  resultStatus: "ok" | "error" | "denied" | "asked"
  policyDecision: "allow" | "ask" | "deny"
  latencyMs: number
  outputSha256: string | null
  model?: string
  yetki?: Yetki
}

// Audit yazıcısı: zincir bütünlüğü için prev_hash her yazımda diskten taze okunur (v1 tek-yazar varsayımı).
// Yazılamazsa fail-open + gürültülü hata (ajan durmaz, hata görünür kalır).
export function denetimYazici(sabit: { projeDizini: string | undefined; beceriler: () => unknown[] }) {
  const yol = auditYolu()
  const motor = { version: motorSurumu(), config_hash: configHash(sabit.projeDizini) }
  const politika = { hash: politikaHash(sabit.projeDizini) }
  const aktor = { agent: `aiops@${hostname()}`, human: userInfo().username }
  try {
    mkdirSync(dirname(yol), { recursive: true, mode: 0o750 })
  } catch (err) {
    console.error(`[guvenlik] audit dizini oluşturulamadı (${dirname(yol)}):`, (err as Error).message)
  }
  const sonHash = () => {
    try {
      if (!existsSync(yol)) return ZERO_HASH
      const satirlar = readFileSync(yol, "utf8").split("\n").filter((l) => l.length > 0)
      return satirlar.length ? sha256(satirlar[satirlar.length - 1]) : ZERO_HASH
    } catch {
      return ZERO_HASH
    }
  }
  return (k: Kayit) => {
    const satir = JSON.stringify({
      event_id: randomUUID(),
      timestamp: k.timestamp,
      session_id: k.sessionID,
      task_id: null,
      record_type: "tool_call",
      actor: aktor,
      gen_ai: { request: { model: k.model ?? "unknown", model_digest: null }, usage: { input_tokens: null, output_tokens: null } },
      engine: motor,
      policy: politika,
      skills_loaded: sabit.beceriler(),
      tool: k.tool,
      args_hash: k.argsHash,
      target: k.target,
      result_status: k.resultStatus,
      policy_decision: k.policyDecision,
      // T7: çağrı anında geçerli değişiklik yetkisi (CN numarası / KURULUM / KRIZ); yoksa null.
      cn: k.yetki?.tur ? (k.yetki.tur === "CN" ? k.yetki.cn : k.yetki.tur) : null,
      latency_ms: k.latencyMs,
      output_sha256: k.outputSha256,
      prev_hash: sonHash(),
    })
    try {
      appendFileSync(yol, satir + "\n", { mode: 0o640 })
    } catch (err) {
      console.error(`[guvenlik] audit satırı yazılamadı (${yol}):`, (err as Error).message)
    }
  }
}

// Kullanıcı mesajından yetkiyi günceller (K1 — ADR-0004). Yalnız insanın yazdığı metin verilmeli:
// alt ajan oturumunun ilk mesajını model yazar, oradan yetki OKUNMAZ (çağıran taraf ayırır).
// Dönüş: audit'e yazılacak özet; yetki satırı yoksa null.
// G74: yetki listesini verildiği anda envanterle genişlet (ad ↔ kısa ad ↔ IP ↔ grup). Envanter yoksa liste olduğu gibi.
export function envanterEsle(y: Yetki, workdir?: string, coz: (x: string) => string[] = getentHosts): void {
  y.esler = undefined
  y.envanterNotu = undefined
  const not: string[] = []
  const esler = new Set<string>(y.sunucular)
  const env = workdir ? envanterOku(workdir) : undefined
  if (env?.hostlar.size) {
    const g = yetkiGenislet(y.sunucular, env)
    g.esler.forEach((e) => esler.add(e))
    if (g.belirsiz.length) not.push(`birden çok host'a uyuyor (tam adı yaz): ${g.belirsiz.join("; ")}`)
    if (g.cozulen.length) not.push(`aralık: ${g.cozulen.join("; ")}`)
    if (g.bulunamayan.length) not.push(`envanterde yok: ${g.bulunamayan.join(", ")}`)
  }
  // Saha G98 (2026-10-22): ad envanterde yok ya da IP'siz → ajan komutta IP kullanınca "listede yok". Yetki VERİLDİĞİ ANDA
  // sistemin ad çözümlemesi (getent: /etc/hosts + DNS) ile ad → IP, IP → ad eklenir; sonradan değişmez (envanter gibi donar).
  const dns: string[] = []
  for (const s of y.sunucular.slice(0, 20)) {
    if (s === "localhost") continue
    const kayit = env?.hostlar.get(s.toLowerCase())
    if (kayit && [...kayit].some((e) => /^[0-9.]+$/.test(e))) continue // envanter IP'sini zaten verdi
    const bulunan = coz(s).filter((x) => !esler.has(x))
    if (bulunan.length) {
      bulunan.forEach((x) => esler.add(x))
      dns.push(`${s} → ${bulunan.join(" ")}`)
    }
  }
  if (dns.length) not.push(`ad çözümleme: ${dns.join("; ")}`)
  if (esler.size > y.sunucular.length) y.esler = [...esler]
  if (not.length) y.envanterNotu = not.join(" · ")
}

// `getent hosts <ad|ip>` → [ip, ad, takma adlar…] (kısa adlar da eklenir). Çözülemezse [].
export function getentHosts(x: string): string[] {
  if (!/^[A-Za-z0-9._:-]+$/.test(x)) return []
  try {
    const out = execFileSync("getent", ["hosts", x], { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] })
    const s = new Set<string>()
    for (const satir of out.split("\n")) for (const p of satir.trim().split(/\s+/).filter(Boolean)) {
      s.add(p.toLowerCase())
      if (!/^[0-9.:]+$/.test(p)) s.add(p.split(".")[0].toLowerCase())
    }
    return [...s]
  } catch {
    return []
  }
}

export function yetkiIsle(
  yetkiler: Map<string, Yetki>,
  sessionID: string,
  metin: string,
  now = Date.now(),
  workdir?: string,
): string | null {
  const s = yetkiSatirlariniOku(metin)
  let y = yetkiler.get(sessionID)
  if (s.kapat) {
    yetkiler.delete(sessionID)
    return "yetki kapatıldı"
  }
  if (!s.tur && !s.cn && !s.sunucular && !s.uyari) {
    // KRİZ verildiyse mail/toplantı notu ayrı bir mesajla da yapıştırılabilir
    if (y?.tur === "KRIZ" && !y.krizMetni && s.govde >= KRIZ_METNI_MIN) {
      y.krizMetni = true
      y.zaman = now
      return `KRİZ metni alındı (${s.govde} karakter)`
    }
    // G100: beyan önceki mesajdaydı, sunucular bu mesajda (yalın liste ya da "şu sunucularda" cümlesi). Yalın liste beyanın
    // ömrü boyunca, cümledeki adlar yalnız beyandan sonraki AYRI_MESAJ_MS içinde — sonraki sıradan soru listeyi açmasın.
    if (y?.tur && !y.sunucular.length && now - y.zaman <= YETKI_OMRU_MS) {
      const adlar = s.adaylar ?? (now - y.zaman <= AYRI_MESAJ_MS ? s.cumleAdlari : undefined)
      if (adlar?.length) {
        y.sunucular = adlar
        envanterEsle(y, workdir)
        y.zaman = now
        y.oneriBekliyor = undefined
        return `${yetkiDurumu(y, now)} (sunucular ayrı mesajda verildi)`
      }
    }
    // Beyandan ÖNCE gelen yalın liste: aday olarak tutulur, yetki değildir; sunucusuz beyan gelirse ona uygulanır.
    if (s.adaylar?.length) {
      const yeni = y ?? { tur: null, cn: null, krizMetni: false, sunucular: [], zaman: now }
      yeni.aday = { sunucular: s.adaylar, zaman: now }
      yetkiler.set(sessionID, yeni)
      return `aday sunucu listesi (${s.adaylar.length}) — CN/kurulum/kriz beyanı gelirse uygulanır`
    }
    return null
  }
  // Ayrı mesajla önceden verilmiş liste: aday ya da beyansız "sunucular:" satırı (tur yok) — AYRI_MESAJ_MS içinde
  const aday =
    y?.aday && now - y.aday.zaman <= AYRI_MESAJ_MS
      ? y.aday.sunucular
      : y && !y.tur && y.sunucular.length && now - y.zaman <= AYRI_MESAJ_MS
        ? y.sunucular
        : undefined
  if (!y || now - y.zaman > YETKI_OMRU_MS || (s.tur && s.tur !== y.tur))
    y = { tur: s.tur ?? null, cn: null, krizMetni: false, sunucular: [], zaman: now }
  y.aday = undefined
  if (s.cn) {
    y.tur = "CN"
    y.cn = s.cn
  }
  if (y.tur === "KRIZ" && s.govde >= KRIZ_METNI_MIN) y.krizMetni = true
  let ayriMesaj = false
  if (s.sunucular) {
    y.sunucular = s.sunucular
    envanterEsle(y, workdir)
  } else if (aday && y.tur && !y.sunucular.length && !onayIfadesi(metin)) {
    y.sunucular = aday
    envanterEsle(y, workdir)
    ayriMesaj = true
  }
  y.uyari = s.uyari
  y.zaman = now
  y.oneriBekliyor = undefined
  if ((s.tur || s.cn) && !s.sunucular && y.sunucular.length === 0 && onayIfadesi(metin)) y.oneriBekliyor = now
  yetkiler.set(sessionID, y)
  if (y.oneriBekliyor)
    return `yetki bekliyor: ${y.tur} beyanı + onay ("evet/onu/bunu") — sunucu listesi ajanın önceki mesajındaki "sunucular:" satırından alınacak`
  return `${yetkiDurumu(y, now)}${ayriMesaj ? " (sunucular önceki mesajda verildi)" : ""}`
}

// G100: beyan ve sunucu listesi ayrı mesajlarda gelebilir; aradaki en çok süre (cümle içi adlar ve beyandan önceki liste için)
export const AYRI_MESAJ_MS = 30 * 60 * 1000

function yetkiDurumu(y: Yetki, now: number): string {
  return yetkiAktif(y, now)
    ? `yetki: ${yetkiOzeti(y)}${y.esler && y.esler.length > y.sunucular.length ? ` (envanterle ${y.esler.length} ad/IP)` : ""}${y.uyari ? ` (not: ${y.uyari})` : ""}${y.envanterNotu ? ` (envanter: ${y.envanterNotu})` : ""}`
    : `yetki eksik: tur=${y.tur ?? "-"} cn=${y.cn ?? "-"} kriz_metni=${y.krizMetni} sunucu=${y.sunucular.length}`
}

// G98 (Alp, 2026-10-22: "hâlâ format istiyor, çok garip"): kullanıcı ajanın açıkça önerdiği hedefi kriz/CN beyanıyla onaylıyorsa
// ("kriz durumu evet sadece onu restart et") adı yeniden yazdırma. Onay ifadesi + beyan + mesajda sunucu adı yok → öneri beklenir.
export const ONAY_IFADESI = /(^|[^A-ZÇĞİÖŞÜ])(EVET|ONU|BUNU|ŞUNU|ONLARI|BUNLARI|AYNI SUNUCU|O SUNUCU|BU SUNUCU|ONAYLIYORUM|ONAYLA|ONAY|TAMAM|OLUR)([^A-ZÇĞİÖŞÜ]|$)/

export function onayIfadesi(metin: string): boolean {
  return ONAY_IFADESI.test(buyuk(metin))
}

type MesajParca = { type?: string; text?: string }
type Mesaj = { role?: string; content?: string | ReadonlyArray<MesajParca> }

// Son kullanıcı mesajından (onay) HEMEN ÖNCEKİ asistan mesajının metni. Araç çağrısı/sonucu mesajları atlanmaz: ajanın
// kullanıcıya gösterdiği son metin, son kullanıcı mesajından önceki son asistan mesajıdır.
export function sonAsistanMetni(mesajlar: ReadonlyArray<Mesaj>): string {
  let i = mesajlar.length - 1
  while (i >= 0 && mesajlar[i].role !== "user") i--
  for (let j = i - 1; j >= 0; j--) {
    const m = mesajlar[j]
    if (m.role === "user") return ""
    if (m.role !== "assistant") continue
    const metin = typeof m.content === "string" ? m.content
      : (m.content ?? []).filter((p) => p.type === "text" && p.text).map((p) => p.text).join("\n")
    if (metin.trim()) return metin
  }
  return ""
}

export function oneriyleTamamla(
  yetkiler: Map<string, Yetki>,
  sessionID: string,
  asistanMetni: string,
  now = Date.now(),
  workdir?: string,
): string | null {
  const y = yetkiler.get(sessionID)
  if (!y?.oneriBekliyor) return null
  if (now - y.oneriBekliyor > 10 * 60 * 1000) {
    y.oneriBekliyor = undefined
    return null
  }
  y.oneriBekliyor = undefined
  // YALNIZ açık "sunucular:" satırı — metnin başka yerinde geçen ad yetki açmaz
  const satirlar = asistanMetni.split("\n").filter((l) => /SUNUCULAR\s*\**\s*:/.test(buyuk(l).replace(/[`*_]/g, "")))
  const liste = satirlar.length ? yetkiSatirlariniOku(satirlar.join("\n").replace(/[`*_]/g, "")).sunucular : undefined
  if (!liste?.length) return `yetki eksik: onay verildi ama ajanın önceki mesajında "sunucular:" satırı yok`
  y.sunucular = liste
  y.oneriden = true
  envanterEsle(y, workdir)
  y.zaman = now
  return `yetki (ajanın önerisi kullanıcı onayıyla): ${yetkiOzeti(y)}${y.envanterNotu ? ` (envanter: ${y.envanterNotu})` : ""}`
}
