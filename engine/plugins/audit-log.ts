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
import { dirname, isAbsolute, join, relative, resolve } from "path"

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
// T15/A43-A44: kurum uç/hostname deseni — THREAT-MODEL.md §6'da tanımlı repo tarama deseniyle
// aynı aile (*.com.tr / *.net.tr / *.org.tr). Bir araç çıktısı (ör. `cat env`, `getent ahosts`,
// `curl -v`) çalışma zamanında gerçek uç adını modele/audit'e taşırsa T9/T12'nin repo taraması
// bunu göremez (değer dosyada değil, env'den geliyor) — bu kapı çalışma zamanı içindir.
const KURUM_HOSTNAME_RE = /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.(?:com|net|org)\.tr\b/gi
// Yalnız İÇ (private/loopback) IPv4 aralıkları — IPV4_RE (üstte) kasıtlı GENİŞ tutulur ve
// yalnız audit'in kendi target/args alanlarını maskeler (maskString), modele giden çıktıyı
// etkilemez. Çıktıya da karışan bu yeni kapıda ise sınır dar tutulur: genel/public bir IP
// (ör. 8.8.8.8, bir API'nin adresi) ajanın normal ağ hata ayıklama işini kör etmesin diye
// maskelenmez — yalnız gerçekten "iç ağ" sayılan RFC1918 + loopback aralığı maskelenir.
const INTERNAL_IPV4_RE =
  /\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|127(?:\.\d{1,3}){3})\b/g
// serbest metin içinde (örn. bash komutu: "curl -H 'Authorization: Bearer sk-...'") anahtar
// isimlerinin ardından gelen değeri de maskeler — SECRET_KEY_RE yalnız obje alan adlarını yakalar,
// `command` gibi tek bir string argümanın İÇİNDEKİ secret'ı yakalamaz.
// 3 ayraç biçimi desteklenir: "key: value" / "key=value" / "--key value" (CLI bayrağı, boşlukla
// ayrılmış — 2026-09-16 bulgusu, bkz. notlar/FAZ0-YUZEYE-GETIRME-RAPORU.md §2). Boşluk-ayraç yalnız
// `-`/`--` önekli bayraklarda eşleşir ("echo hi --apiKey sk-..." → maskelenir); önek yoksa serbest
// metindeki "token" gibi sözcükleri (örn. "token sayısı") yanlışlıkla maskelemez.
// T13/A34: "passwd" ve "private[_-]?key" etiketleri de eklendi — sahada bir SSH private key ve bir
// `passwd:` alanı maskelenmeden audit'e/yanıta sızmıştı (bkz. THREAT-MODEL.md "gizli sızıntısı").
const SECRET_LABELS = "api[_-]?key|apikey|private[_-]?key|token|secret|password|passwd|pwd"
const INLINE_SECRET_RE = new RegExp(
  `(authorization\\s*:\\s*bearer\\s+|-{1,2}(?:${SECRET_LABELS})\\s+['"]?|(?:${SECRET_LABELS})\\s*[:=]\\s*['"]?)([^\\s'";]+)`,
  "gi",
)
// SSH/TLS private key bloğu — başlık tek başına yakalanırsa gövde (asıl gizli veri) audit/yanıtta
// kalmaya devam eder; bu yüzden BEGIN..END arası TAMAMI eşleşip tek seferde değiştirilir.
const PRIVATE_KEY_BLOCK_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g
// Genel "KEY=değer" biçimi (T13/A34): `KURUM_KEY=...` gibi kurum-özel değişken adları yukarıdaki
// etiket listesinde yok ama "KEY" ile bitiyor/başlıyor — env dosyalarında en sık görülen kaçak yolu.
const ENV_KEY_ASSIGN_RE = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*(?:_?KEY|_?TOKEN|_?SECRET|_?PASSWORD))\s*=\s*(\S+)/g

function labelFromPrefix(prefix: string): string {
  const p = prefix.toLowerCase()
  if (p.includes("private")) return "private_key"
  if (p.includes("api")) return "api_key"
  if (p.includes("passwd") || p.includes("pwd") || p.includes("password")) return "password"
  if (p.includes("secret")) return "secret"
  return "token"
}

// Tool çıktısı ve audit hedefi/argümanları için TEK maskeleme kapısı (AUDIT-FORMAT.md §5,
// PERMISSION-MATRIX.md "gizli desenler"). Değer asla döndürülmez — yalnız `[REDACTED:<tür>]` yer
// tutucusu; `types` alanı `redacted` audit kaydı için (bkz. writeRedactedRecord) tür listesini taşır.
function redactSecrets(text: string): { masked: string; types: string[] } {
  const types = new Set<string>()
  const masked = text
    .replace(PRIVATE_KEY_BLOCK_RE, () => {
      types.add("private_key")
      return "[REDACTED:private_key]"
    })
    .replace(INLINE_SECRET_RE, (_m, prefix: string) => {
      const type = labelFromPrefix(prefix)
      types.add(type)
      return `${prefix}[REDACTED:${type}]`
    })
    .replace(ENV_KEY_ASSIGN_RE, (m: string, varName: string, value: string) => {
      if (value.startsWith("[REDACTED")) return m
      types.add("key")
      return `${varName}=[REDACTED:key]`
    })
    // T15/A43-A44: uç/hostname + iç IP artık modele giden ÇIKTIDA da maskeleniyor (öncesinde
    // yalnız aşağıdaki maskString() ile audit'in target/args alanları maskeleniyordu, tool
    // çıktısının kendisi değil — bkz. tool.execute.after, redactSecrets rawOutput'u mutasyonlar).
    .replace(KURUM_HOSTNAME_RE, () => {
      types.add("hostname")
      return "<kurum-host>"
    })
    .replace(INTERNAL_IPV4_RE, () => {
      types.add("internal_ip")
      return "10.0.0.x"
    })
  return { masked, types: [...types] }
}

function maskString(value: string): string {
  return redactSecrets(value).masked.replace(EMAIL_RE, "***@***").replace(TCKN_RE, "***********")
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

// --- hassas dosya denylist'i (T13/A34+A35, PERMISSION-MATRIX.md "denylist") ---------------

// Fail-closed varsayılan: `engine/opencode.json`'daki `ops_agent.denylist.patterns` okunamazsa/boşsa
// (dosya yok, bozuk JSON, alan eksik) bu liste kullanılır — hiç koruma olmaması (fail-open) yerine
// bilinen envanter/credential kalıpları her zaman devrede kalır.
const DEFAULT_DENYLIST_PATTERNS = [
  "hosts*",
  "*.inventory",
  "inventory/**",
  "*.vault",
  "*credential*",
  "*secret*",
  "env",
  "env.local",
  "*.key",
  "*.pem",
  "*token*",
  "*.kdbx",
]

const DENYLIST_TOOLS = new Set(["read", "write", "edit", "list", "glob", "grep"])

function loadDenylistPatterns(projectDir: string | undefined): string[] {
  if (!projectDir) return DEFAULT_DENYLIST_PATTERNS
  try {
    const raw = JSON.parse(readFileSync(join(projectDir, "engine", "opencode.json"), "utf8"))
    const patterns = raw?.ops_agent?.denylist?.patterns
    if (Array.isArray(patterns) && patterns.length > 0 && patterns.every((p) => typeof p === "string")) {
      return patterns
    }
  } catch {
    // okunamadı/bozuk — fail-closed: varsayılana düş
  }
  return DEFAULT_DENYLIST_PATTERNS
}

// Basit glob → regex (yalnız `*`/`**`/`?`, bağımlılık eklememek için `Wildcard`/`minimatch` yerine
// elle yazıldı). `*` bir path segmenti içinde kalır, `**` segment sınırını da yutar.
function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${escaped}$`, "i")
}

function matchesDenylist(targetPath: string, patterns: string[]): string | null {
  const normalized = targetPath.replace(/\\/g, "/")
  const base = normalized.split("/").pop() ?? normalized
  for (const pattern of patterns) {
    const re = globToRegExp(pattern)
    if (re.test(normalized) || re.test(base)) return pattern
  }
  return null
}

// --- arama kapsamı (T13/A35, PERMISSION-MATRIX.md "arama kapsamı") -------------------------

const SCOPE_TOOLS = new Set(["read", "glob", "grep", "list"])
const SCOPE_BURST_WINDOW_MS = 2 * 60 * 1000
const SCOPE_WIDE_DIR_THRESHOLD = 3

function isInside(parentDir: string, candidate: string): boolean {
  const rel = relative(parentDir, candidate)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

function resolveTargetDir(tool: string, args: Record<string, unknown>, baseDir: string): string | null {
  const raw =
    tool === "read" && typeof args.filePath === "string"
      ? dirname(args.filePath)
      : typeof args.path === "string"
        ? args.path
        : tool === "glob" || tool === "grep" || tool === "list"
          ? baseDir
          : null
  if (!raw) return null
  return isAbsolute(raw) ? raw : resolve(baseDir, raw)
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

  // T13/A34+A35: tek kapı — `OPS_AGENT_KAPI=ENFORCE` olmadıkça gözlem modu (uyarı + redaksiyon,
  // sert blok yok). ENFORCE'ta denylist/kapsam ihlali `tool.execute.before` içinde reddedilir
  // (bkz. PERMISSION-MATRIX.md "Zorunlu kapı" — before-hook throw = araç hiç çalışmaz).
  const ENFORCE = process.env.OPS_AGENT_KAPI === "ENFORCE"
  const denylistPatterns = loadDenylistPatterns(projectDir)
  const pendingDenylistHit = new Map<string, string>() // callID -> eşleşen desen
  const pendingScopeFlag = new Map<string, { dir: string; outOfScope: boolean }>() // callID -> kapsam bilgisi
  const scopeState = new Map<string, { dirs: Map<string, number>; burstStart: number; burstFlagged: boolean }>()

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
    recordType?: "tool_call" | "redacted"
  }) {
    // Zincir bütünlüğü için prev_hash her yazımda diskten taze okunur (bkz. FAZ0-RAPOR.md
    // "açık kalanlar" — çok-oturumlu eşzamanlı yazımda tam kilitleme yok, v1 tek-yazar varsayımı).
    const prevHash = readLastLineHash()
    const record = {
      event_id: randomUUID(),
      timestamp: fields.timestamp,
      session_id: fields.sessionID,
      task_id: null,
      record_type: fields.recordType ?? "tool_call",
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

  // T13/A34: "redacted" kaydı — hangi araç, hangi hedef (dosya/komut, maskelenmiş) ve hangi desen
  // türü maskelendiğini taşır; değerin kendisi hiçbir alanda yer almaz. Aynı `prev_hash` zincirine
  // normal `tool_call` kayıtlarıyla birlikte eklenir (bkz. AUDIT-FORMAT.md §3/§5).
  function writeRedactedRecord(sessionID: string, tool: string, target: string, patterns: string[]) {
    writeRecord({
      timestamp: new Date().toISOString(),
      sessionID,
      tool,
      argsHash: sha256(patterns.join(",")),
      target: `${target} :: ${patterns.join(",")}`,
      resultStatus: "ok",
      policyDecision: "allow",
      latencyMs: 0,
      outputSha256: null,
      recordType: "redacted",
    })
  }

  return {
    config: (cfg) => {
      const model = (cfg as { model?: unknown } | undefined)?.model
      if (typeof model === "string") requestModel = model
    },
    "tool.execute.before": async (input, output) => {
      const args = ((output as { args?: unknown }).args ?? {}) as Record<string, unknown>
      const target = deriveTarget(args)
      const argsHash = sha256(JSON.stringify(maskArgs(args) ?? {}))

      if (DENYLIST_TOOLS.has(input.tool)) {
        const pathArg =
          typeof args.filePath === "string" ? args.filePath : typeof args.path === "string" ? args.path : null
        const hit = pathArg ? matchesDenylist(pathArg, denylistPatterns) : null
        if (hit) {
          if (ENFORCE) {
            writeRecord({
              timestamp: new Date().toISOString(),
              sessionID: input.sessionID,
              tool: input.tool,
              argsHash,
              target,
              resultStatus: "denied",
              policyDecision: "deny",
              latencyMs: 0,
              outputSha256: null,
            })
            throw new Error(
              `[ops-agent] hassas dosya erişimi reddedildi (denylist: ${hit}) — OPS_AGENT_KAPI=ENFORCE`,
            )
          }
          pendingDenylistHit.set(input.callID, hit)
        }
      }

      if (SCOPE_TOOLS.has(input.tool) && projectDir) {
        const dir = resolveTargetDir(input.tool, args, projectDir)
        if (dir) {
          const now = Date.now()
          let st = scopeState.get(input.sessionID)
          if (!st || now - st.burstStart > SCOPE_BURST_WINDOW_MS) {
            st = { dirs: new Map(), burstStart: now, burstFlagged: false }
            scopeState.set(input.sessionID, st)
          }
          st.dirs.set(dir, (st.dirs.get(dir) ?? 0) + 1)
          const outOfScope = !isInside(projectDir, dir)
          const wide = st.dirs.size > SCOPE_WIDE_DIR_THRESHOLD
          if ((outOfScope || wide) && !st.burstFlagged) {
            st.burstFlagged = true
            if (ENFORCE) {
              writeRecord({
                timestamp: new Date().toISOString(),
                sessionID: input.sessionID,
                tool: input.tool,
                argsHash,
                target: maskString(dir),
                resultStatus: "denied",
                policyDecision: "deny",
                latencyMs: 0,
                outputSha256: null,
              })
              throw new Error(
                `[ops-agent] arama kapsamı onay gerektiriyor (${outOfScope ? "dizin dışı" : "geniş tarama: " + st.dirs.size + " dizin"}) — OPS_AGENT_KAPI=ENFORCE, kapsam genişletmek için OPS_AGENT_KAPSAM_EK=<izinli-dizin>`,
              )
            }
            pendingScopeFlag.set(input.callID, { dir, outOfScope })
          }
        }
      }

      pending.set(input.callID, {
        tool: input.tool,
        sessionID: input.sessionID,
        timestamp: new Date().toISOString(),
        startedAt: Date.now(),
        argsHash,
        target,
      })
    },
    "tool.execute.after": async (input, output) => {
      const call = pending.get(input.callID)
      pending.delete(input.callID)
      const denylistHit = pendingDenylistHit.get(input.callID)
      pendingDenylistHit.delete(input.callID)
      const scopeFlag = pendingScopeFlag.get(input.callID)
      pendingScopeFlag.delete(input.callID)

      const args = (input as { args?: unknown }).args
      const argsHash = call?.argsHash ?? sha256(JSON.stringify(maskArgs(args) ?? {}))
      const target = call?.target ?? deriveTarget(args)
      const timestamp = call?.timestamp ?? new Date().toISOString()
      const startedAt = call?.startedAt ?? Date.now()

      if (input.tool === "skill" && args && typeof (args as { name?: unknown }).name === "string") {
        const name = (args as { name: string }).name
        if (!skillsLoaded.has(name)) skillsLoaded.set(name, { name, commit: findSkillCommit(projectDir, name) })
      }

      const meta = (output as { metadata?: { error?: unknown; count?: unknown } } | undefined)?.metadata
      const hasError = Boolean(meta?.error)
      const outRef = output as { output?: unknown } | undefined
      const rawOutput = typeof outRef?.output === "string" ? outRef.output : null

      // T13/A34: tool çıktısı, modele/yanıta gitmeden ÖNCE tek kapıdan geçer — `output.output` bu
      // hook'ta mutasyona uğrar (tools.ts aynı objeyi geri döndürür), yani model artık maskelenmiş
      // metni görür. Denylist eşleşmesinde gözlem modu bile İÇERİĞİ döndürmez (yalnız etiket) —
      // hassas dosyanın tamamı olası secret'tır, desen taramasına güvenilmez.
      let redactedPatterns: string[] = []
      if (rawOutput !== null && denylistHit) {
        redactedPatterns = [`denylist:${denylistHit}`]
        if (outRef) outRef.output = `[REDACTED: hassas dosya, desen "${denylistHit}" — gözlem modu, OPS_AGENT_KAPI=ENFORCE ile reddedilir]`
      } else if (rawOutput !== null) {
        const { masked, types } = redactSecrets(rawOutput)
        if (types.length > 0) {
          redactedPatterns = types
          if (outRef) outRef.output = masked
        }
      }

      const finalOutput = (output as { output?: unknown } | undefined)?.output
      const outputSha256 =
        typeof finalOutput === "string" ? sha256(finalOutput) : output ? sha256(JSON.stringify(output)) : null

      if (redactedPatterns.length > 0) writeRedactedRecord(input.sessionID, input.tool, target, redactedPatterns)

      if (scopeFlag) {
        const count =
          typeof meta?.count === "number"
            ? meta.count
            : ((finalOutput as string | undefined)?.split("\n").filter(Boolean).length ?? 0)
        writeRecord({
          timestamp,
          sessionID: input.sessionID,
          tool: input.tool,
          argsHash,
          target: `${maskString(scopeFlag.dir)} (${count} dosya)`,
          resultStatus: "asked",
          policyDecision: "ask",
          latencyMs: Date.now() - startedAt,
          outputSha256,
        })
        return
      }

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
