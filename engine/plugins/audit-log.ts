// audit-log.ts — Faz 0 audit hook plugin.
// Şema: ../../knowledge/policy/AUDIT-FORMAT.md §2 (alanlar) + §3 (hash zinciri) + §4 (örnek).
// Bağımlılık yok: sadece Node/Bun çekirdek modülleri (fs, crypto, child_process, os, path).
// "@opencode-ai/plugin" içe aktarımı `import type` olduğundan derleme zamanında silinir,
// çalışma zamanında paket kurulu olmasına gerek yoktur (npm plugin YASAK kuralını bozmaz).
import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs"
import { createHash, randomUUID } from "crypto"
import { execFileSync } from "child_process"
import { hostname, userInfo } from "os"
import { dirname, join } from "path"

const AUDIT_LOG_PATH = process.env.OPS_AGENT_AUDIT_LOG ?? "/var/log/ops-agent/audit.jsonl"
const ZERO_HASH = "0".repeat(64)
const TARGET_MAX_LEN = 300
// AUDIT-FORMAT.md §3: bir kayıt "askıda" (before görüldü, after/hata hiç gelmedi) kalırsa
// oturum boşta kaldığında (session.idle) bu eşikten sonra "error"/"deny" olarak kapatılır —
// aksi halde izin reddi gibi durumlarda hiç satır yazılmadan sessizce kaybolabilir.
const STALE_PENDING_MS = 5 * 60 * 1000

const sha256 = (input: string | Buffer): string => createHash("sha256").update(input).digest("hex")

function safeExec(cmd: string, args: string[], cwd?: string): string | null {
  try {
    const out = execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    return out.trim() || null
  } catch {
    return null
  }
}

// --- secret / PII maskeleme (AUDIT-FORMAT.md §5) --------------------------

const SECRET_KEY_RE = /(key|secret|token|password|passwd|pwd|pass$|apikey|authorization)/i
const IPV4_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const TCKN_RE = /\b\d{11}\b/g
// serbest metin içinde (örn. bash komutu: "curl -H 'Authorization: Bearer sk-...'") anahtar
// isimlerinin ardından gelen değeri de maskeler — SECRET_KEY_RE yalnız obje alan adlarını yakalar,
// `command` gibi tek bir string argümanın İÇİNDEKİ secret'ı yakalamaz.
// 3 ayraç biçimi desteklenir: "key: value" / "key=value" / "--key value" (CLI bayrağı, boşlukla
// ayrılmış — 2026-09-16 bulgusu, bkz. notlar/FAZ0-YUZEYE-GETIRME-RAPORU.md §2). Boşluk-ayraç yalnız
// `-`/`--` önekli bayraklarda eşleşir ("echo hi --apiKey sk-..." → maskelenir); önek yoksa serbest
// metindeki "token" gibi sözcükleri (örn. "token sayısı") yanlışlıkla maskelemez.
const INLINE_SECRET_RE =
  /(authorization\s*:\s*bearer\s+|-{1,2}(?:api[_-]?key|apikey|token|secret|password|pwd)\s+['"]?|(?:api[_-]?key|apikey|token|secret|password|pwd)\s*[:=]\s*['"]?)([^\s'";]+)/gi

function maskString(value: string): string {
  return value
    .replace(INLINE_SECRET_RE, (_m, prefix: string) => `${prefix}***MASKED***`)
    .replace(IPV4_RE, "10.0.0.x")
    .replace(EMAIL_RE, "***@***")
    .replace(TCKN_RE, "***********")
}

function maskValue(value: unknown): unknown {
  if (typeof value === "string") return maskString(value)
  if (Array.isArray(value)) return value.map(maskValue)
  if (value && typeof value === "object") return maskObject(value as Record<string, unknown>)
  return value
}

function maskObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SECRET_KEY_RE.test(k) ? "***MASKED***" : maskValue(v)
  }
  return out
}

function maskArgs(args: unknown): unknown {
  if (args && typeof args === "object") return maskValue(args)
  return args
}

function truncate(s: string, max = TARGET_MAX_LEN): string {
  return s.length > max ? s.slice(0, max) + "…" : s
}

function deriveTarget(rawArgs: unknown): string {
  const args = (rawArgs ?? {}) as Record<string, unknown>
  const candidate =
    (typeof args.filePath === "string" && args.filePath) ||
    (typeof args.path === "string" && args.path) ||
    (typeof args.command === "string" && args.command) ||
    (typeof args.pattern === "string" && args.pattern) ||
    (typeof args.url === "string" && args.url) ||
    (typeof args.name === "string" && args.name) ||
    null
  if (candidate) return truncate(maskString(String(candidate)))
  // Bilinen alan adlarından hiçbiri yoksa (ör. secret içerebilecek özel bir tool
  // argümanı): önce maskObject/SECRET_KEY_RE ile alan bazlı maskeleme uygulanır,
  // ancak JSON.stringify sonrası da maskString çalıştırılır — çünkü
  // maskObject yalnız değerleri maskeler, "apiKey":"..." gibi anahtar+değer
  // çiftini INLINE_SECRET_RE serbest-metin taramasından geçirmek ikinci bir
  // güvenlik hattı sağlar (bkz. AUDIT-FORMAT.md §5, denetim bulgusu #7).
  return truncate(maskString(JSON.stringify(maskObject(args))))
}

// --- statik bağlam (bir kez tespit edilir, oturum boyunca sabit kalır) ---

function detectEngineVersion(): string | null {
  // Aynı ikilinin kendisi çalışıyor: process.execPath, Bun --compile ile üretilen
  // opencode binary'sinin tam yoludur (bkz. AUDIT-FORMAT.md §2 "engine.version").
  return safeExec(process.execPath, ["--version"])
}

function detectConfigHash(projectDir: string | undefined): string | null {
  const home = userInfo().homedir
  const candidates = [
    process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "opencode", "opencode.json") : null,
    join(home, ".config", "opencode", "opencode.json"),
    projectDir ? join(projectDir, "engine", "opencode.json") : null,
  ].filter((p): p is string => Boolean(p))
  for (const path of candidates) {
    try {
      if (existsSync(path)) return sha256(readFileSync(path))
    } catch {
      // sıradaki adaya geç
    }
  }
  return null
}

function detectPolicyHash(projectDir: string | undefined): string | null {
  if (!projectDir) return null
  const policyFile = join(projectDir, "knowledge", "policy", "AUDIT-FORMAT.md")
  const gitHash = safeExec("git", ["log", "-1", "--format=%H", "--", policyFile], projectDir)
  if (gitHash) return gitHash
  try {
    if (existsSync(policyFile)) return sha256(readFileSync(policyFile))
  } catch {
    // düşür
  }
  return null
}

function findSkillPath(projectDir: string, name: string): string | null {
  for (const bucket of ["approved", "experimental", "generated"]) {
    const base = join(projectDir, "knowledge", "skills", bucket, name)
    if (existsSync(join(base, "SKILL.md"))) return join(base, "SKILL.md")
    if (existsSync(`${base}.md`)) return `${base}.md`
  }
  return null
}

function findSkillCommit(projectDir: string | undefined, name: string): string | null {
  if (!projectDir) return null
  const path = findSkillPath(projectDir, name)
  if (!path) return null
  return safeExec("git", ["log", "-1", "--format=%H", "--", path], projectDir)
}

interface PendingCall {
  tool: string
  sessionID: string
  timestamp: string
  startedAt: number
  argsHash: string
  target: string
}

export const AuditLogPlugin: Plugin = async ({ directory, project }) => {
  const projectDir = (project as { worktree?: string } | undefined)?.worktree ?? directory
  const engineVersion = detectEngineVersion()
  const configHash = detectConfigHash(projectDir)
  const policyHash = detectPolicyHash(projectDir)
  const actorAgent = `aiops@${hostname()}`
  const actorHuman = userInfo().username
  let requestModel = "unknown"

  const pending = new Map<string, PendingCall>()
  const skillsLoaded = new Map<string, { name: string; commit: string | null }>()

  try {
    mkdirSync(dirname(AUDIT_LOG_PATH), { recursive: true, mode: 0o750 })
  } catch (err) {
    // Denetim bulgusu #12: önceden burada sessizce yutuluyordu — audit dizini
    // hiç oluşturulamazsa appendFileSync de aynı nedenle başarısız olur ve
    // ajan bunu fark etmeden çalışmaya devam ederdi. v1'de "tool.execute.after"
    // aracı zaten çalıştıktan SONRA tetiklenir; plugin hook'un bu noktada aracı
    // geri alacak/engelleyecek bir yolu yok (fail-closed teknik olarak mümkün
    // değil) — bu yüzden bilinçli tercih **fail-open + gürültülü hata**:
    // audit kaybolabilir ama ajan/görev durmaz; hatayı görünür kılmak izleme
    // (monitoring/log toplama) katmanının yakalaması içindir.
    console.error(`[audit-log] audit dizini oluşturulamadı (${dirname(AUDIT_LOG_PATH)}):`, (err as Error).message)
  }

  function readLastLineHash(): string {
    try {
      if (!existsSync(AUDIT_LOG_PATH)) return ZERO_HASH
      const content = readFileSync(AUDIT_LOG_PATH, "utf8")
      const lines = content.split("\n").filter((l) => l.length > 0)
      return lines.length ? sha256(lines[lines.length - 1]) : ZERO_HASH
    } catch {
      return ZERO_HASH
    }
  }

  function writeRecord(fields: {
    timestamp: string
    sessionID: string
    tool: string
    argsHash: string
    target: string
    resultStatus: "ok" | "error" | "denied" | "asked"
    policyDecision: "allow" | "ask" | "deny"
    latencyMs: number
    outputSha256: string | null
  }) {
    // Zincir bütünlüğü için prev_hash her yazımda diskten taze okunur (bkz. FAZ0-RAPOR.md
    // "açık kalanlar" — çok-oturumlu eşzamanlı yazımda tam kilitleme yok, v1 tek-yazar varsayımı).
    const prevHash = readLastLineHash()
    const record = {
      event_id: randomUUID(),
      timestamp: fields.timestamp,
      session_id: fields.sessionID,
      task_id: null,
      actor: { agent: actorAgent, human: actorHuman },
      gen_ai: {
        request: { model: requestModel, model_digest: null },
        usage: { input_tokens: null, output_tokens: null },
      },
      engine: { version: engineVersion, config_hash: configHash },
      policy: { hash: policyHash },
      skills_loaded: [...skillsLoaded.values()],
      tool: fields.tool,
      args_hash: fields.argsHash,
      target: fields.target,
      result_status: fields.resultStatus,
      policy_decision: fields.policyDecision,
      latency_ms: fields.latencyMs,
      output_sha256: fields.outputSha256,
      prev_hash: prevHash,
    }
    const line = JSON.stringify(record)
    try {
      appendFileSync(AUDIT_LOG_PATH, line + "\n", { mode: 0o640 })
    } catch (err) {
      console.error(`[audit-log] audit satırı yazılamadı (${AUDIT_LOG_PATH}):`, (err as Error).message)
    }
  }

  return {
    config: (cfg) => {
      const model = (cfg as { model?: unknown } | undefined)?.model
      if (typeof model === "string") requestModel = model
    },
    "tool.execute.before": async (input, output) => {
      const args = (output as { args?: unknown }).args
      pending.set(input.callID, {
        tool: input.tool,
        sessionID: input.sessionID,
        timestamp: new Date().toISOString(),
        startedAt: Date.now(),
        argsHash: sha256(JSON.stringify(maskArgs(args) ?? {})),
        target: deriveTarget(args),
      })
    },
    "tool.execute.after": async (input, output) => {
      const call = pending.get(input.callID)
      pending.delete(input.callID)

      const args = (input as { args?: unknown }).args
      const argsHash = call?.argsHash ?? sha256(JSON.stringify(maskArgs(args) ?? {}))
      const target = call?.target ?? deriveTarget(args)
      const timestamp = call?.timestamp ?? new Date().toISOString()
      const startedAt = call?.startedAt ?? Date.now()

      if (input.tool === "skill" && args && typeof (args as { name?: unknown }).name === "string") {
        const name = (args as { name: string }).name
        if (!skillsLoaded.has(name)) skillsLoaded.set(name, { name, commit: findSkillCommit(projectDir, name) })
      }

      const meta = (output as { metadata?: { error?: unknown } } | undefined)?.metadata
      const hasError = Boolean(meta?.error)
      const outputText = (output as { output?: unknown } | undefined)?.output
      const outputSha256 =
        typeof outputText === "string" ? sha256(outputText) : output ? sha256(JSON.stringify(output)) : null

      writeRecord({
        timestamp,
        sessionID: input.sessionID,
        tool: input.tool,
        argsHash,
        target,
        resultStatus: hasError ? "error" : "ok",
        policyDecision: "allow",
        latencyMs: Date.now() - startedAt,
        outputSha256,
      })
    },
    // Denetim bulgusu (2026-09-16, faz0-yuzeye-getir sırasında bizzat tespit edildi):
    // "session.idle" @opencode-ai/plugin'in Hooks arayüzünde TANIMLI DEĞİL — bu isim
    // yalnızca genel `event` hook'una gelen bir Event.type değeridir (bkz.
    // @opencode-ai/sdk EventSessionIdle). Önceki kod burada üst seviye bir
    // `"session.idle"` anahtarı kaydediyordu; bu anahtar hiçbir zaman çağrılmaz
    // (derlenmiş opencode ikilisinde `trigger("...")` ile tetiklenen hook adları
    // grep edilerek doğrulandı — "session.idle" ya da "event" bu listede yok,
    // ikisi de ayrı bir event-bus yoluyla yürütülüyor). Sonuç: STALE_PENDING_MS
    // temizliği hiçbir zaman çalışmıyordu — izin reddi/hata gibi "after" hiç
    // tetiklenmeyen çağrılar audit zincirinde sessizce kayboluyordu (bulgu #11'in
    // düşündüğünden daha geniş bir versiyonu: yalnız süreç çökmesinde değil, HER
    // zaman). Düzeltme: doğru hook adı `event`, olay ise `event.type` ile süzülüyor.
    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      const { sessionID } = event.properties
      const now = Date.now()
      for (const [callID, call] of pending) {
        if (call.sessionID !== sessionID) continue
        if (now - call.startedAt < STALE_PENDING_MS) continue
        pending.delete(callID)
        writeRecord({
          timestamp: call.timestamp,
          sessionID: call.sessionID,
          tool: call.tool,
          argsHash: call.argsHash,
          target: call.target,
          resultStatus: "error",
          policyDecision: "deny",
          latencyMs: now - call.startedAt,
          outputSha256: null,
        })
      }
      // Bulgu #9: skillsLoaded hiç sıfırlanmıyordu, oturum boyunca kümülatif
      // büyüyordu. opencode plugin API'sinde ayrı bir "görev bitti" hook'u yok
      // (task_id bu yüzden yukarıda hep null) — en yakın yaklaşık sınır budur:
      // ajan bir isteği bitirip session boşa düşer, kullanıcı bir sonrakini
      // yazana kadar bekler. AUDIT-FORMAT.md §4 örneğindeki tsk_001→tsk_002
      // geçişinde skills_loaded:[]'e dönme varsayımı bu yaklaşıklıkla karşılanır.
      // Bilinen sınır: arka arkaya kuyruklanan çoklu-görev otomasyonunda (batch)
      // session hiç idle olmazsa reset gecikir/olmaz.
      skillsLoaded.clear()
    },
  }
}

export default AuditLogPlugin
