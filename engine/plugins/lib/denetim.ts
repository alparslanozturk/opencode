// denetim.ts — motordan bağımsız audit + yetki yardımcıları (ADR-0005). opencode 2.x adaptörü
// (../guvenlik-v2.ts) kullanır; davranış 1.x adaptörüyle (../audit-log.ts) aynıdır.
// Şema: ../../../knowledge/policy/AUDIT-FORMAT.md §2 (alanlar) + §3 (hash zinciri).
// Bağımlılık yok: yalnız Node/Bun çekirdek modülleri.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs"
import { createHash, randomUUID } from "crypto"
import { execFileSync } from "child_process"
import { hostname, userInfo } from "os"
import { dirname, join } from "path"
import { KRIZ_METNI_MIN, YETKI_OMRU_MS, yetkiAktif, yetkiOzeti, yetkiSatirlariniOku } from "./kilit"
import type { Yetki } from "./kilit"

export const ZERO_HASH = "0".repeat(64)
// Askıda kalan çağrı (before görüldü, after gelmedi) bu süreden sonra "error"/"deny" olarak kapatılır.
export const STALE_PENDING_MS = 5 * 60 * 1000

export const auditYolu = () => process.env.OPS_AGENT_AUDIT_LOG ?? "/var/log/ops-agent/audit.jsonl"
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
export function yetkiIsle(yetkiler: Map<string, Yetki>, sessionID: string, metin: string, now = Date.now()): string | null {
  const s = yetkiSatirlariniOku(metin)
  let y = yetkiler.get(sessionID)
  if (s.kapat) {
    yetkiler.delete(sessionID)
    return "yetki kapatıldı"
  }
  if (!s.tur && !s.cn && !s.sunucular) {
    // KRİZ verildiyse mail/toplantı notu ayrı bir mesajla da yapıştırılabilir
    if (y?.tur === "KRIZ" && !y.krizMetni && s.govde >= KRIZ_METNI_MIN) {
      y.krizMetni = true
      y.zaman = now
      return `KRİZ metni alındı (${s.govde} karakter)`
    }
    return null
  }
  if (!y || now - y.zaman > YETKI_OMRU_MS || (s.tur && s.tur !== y.tur))
    y = { tur: s.tur ?? null, cn: null, krizMetni: false, sunucular: [], zaman: now }
  if (s.cn) {
    y.tur = "CN"
    y.cn = s.cn
  }
  if (y.tur === "KRIZ" && s.govde >= KRIZ_METNI_MIN) y.krizMetni = true
  if (s.sunucular) y.sunucular = s.sunucular
  y.zaman = now
  yetkiler.set(sessionID, y)
  return yetkiAktif(y, now)
    ? `yetki: ${yetkiOzeti(y)}`
    : `yetki eksik: tur=${y.tur ?? "-"} cn=${y.cn ?? "-"} kriz_metni=${y.krizMetni} sunucu=${y.sunucular.length}`
}
