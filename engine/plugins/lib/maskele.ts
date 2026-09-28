// maskele.ts — motordan BAĞIMSIZ çekirdek: gizli/PII maskeleme, hassas dosya denylist'i, arama kapsamı.
// ADR-0005: opencode 1.x kanca adaptörü (../audit-log.ts) ve ileride 2.x adaptörü bu modülü paylaşır.
// Bu dosya plugins/lib/ altındadır: opencode yalnız plugins/*.ts'i eklenti diye yükler, alt dizini değil.
import { readFileSync } from "fs"
import { isAbsolute, join, relative, resolve, dirname } from "path"

export const TARGET_MAX_LEN = 300

// --- secret / PII maskeleme (AUDIT-FORMAT.md §5) --------------------------

export const SECRET_KEY_RE = /(key|secret|token|password|passwd|pwd|pass$|apikey|authorization)/i
export const IPV4_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
export const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
export const TCKN_RE = /\b\d{11}\b/g
// T26 (2026-09-28, Alp — A48 KAPANDI): kapalı/kurum-içi sistem, iç ad/IP maskelemesi kaldırıldı.
// Bu iki desen artık redactSecrets() içinde UYGULANMIYOR (aşağıya bkz.) — yalnız tanım burada
// kalıyor, modül tamamen silinmedi. Eskiden (T15/A43-A44) `cat env`/`getent ahosts`/`curl -v` gibi
// çıktılarda gerçek kurum uç adı/iç IP modele/audit'e gitmeden maskeleniyordu.
export const KURUM_HOSTNAME_RE = /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.(?:com|net|org)\.tr\b/gi
export const INTERNAL_IPV4_RE =
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
export const SECRET_LABELS = "api[_-]?key|apikey|private[_-]?key|token|secret|password|passwd|pwd"
export const INLINE_SECRET_RE = new RegExp(
  `(authorization\\s*:\\s*bearer\\s+|-{1,2}(?:${SECRET_LABELS})\\s+['"]?|(?:${SECRET_LABELS})\\s*[:=]\\s*['"]?)([^\\s'";]+)`,
  "gi",
)
// SSH/TLS private key bloğu — başlık tek başına yakalanırsa gövde (asıl gizli veri) audit/yanıtta
// kalmaya devam eder; bu yüzden BEGIN..END arası TAMAMI eşleşip tek seferde değiştirilir.
export const PRIVATE_KEY_BLOCK_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g
// Genel "KEY=değer" biçimi (T13/A34): `KURUM_KEY=...` gibi kurum-özel değişken adları yukarıdaki
// etiket listesinde yok ama "KEY" ile bitiyor/başlıyor — env dosyalarında en sık görülen kaçak yolu.
export const ENV_KEY_ASSIGN_RE = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*(?:_?KEY|_?TOKEN|_?SECRET|_?PASSWORD))\s*=\s*(\S+)/g

export function labelFromPrefix(prefix: string): string {
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
export function redactSecrets(text: string): { masked: string; types: string[] } {
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
  return { masked, types: [...types] }
}

export function maskString(value: string): string {
  return redactSecrets(value).masked.replace(EMAIL_RE, "***@***").replace(TCKN_RE, "***********")
}

export function maskValue(value: unknown): unknown {
  if (typeof value === "string") return maskString(value)
  if (Array.isArray(value)) return value.map(maskValue)
  if (value && typeof value === "object") return maskObject(value as Record<string, unknown>)
  return value
}

export function maskObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SECRET_KEY_RE.test(k) ? "***MASKED***" : maskValue(v)
  }
  return out
}

export function maskArgs(args: unknown): unknown {
  if (args && typeof args === "object") return maskValue(args)
  return args
}

export function truncate(s: string, max = TARGET_MAX_LEN): string {
  return s.length > max ? s.slice(0, max) + "…" : s
}

// --- hassas dosya denylist'i (T13/A34+A35, PERMISSION-MATRIX.md "denylist") ---------------

// Fail-closed varsayılan: `engine/opencode.json`'daki `ops_agent.denylist.patterns` okunamazsa/boşsa
// (dosya yok, bozuk JSON, alan eksik) bu liste kullanılır — hiç koruma olmaması (fail-open) yerine
// bilinen envanter/credential kalıpları her zaman devrede kalır.
export const DEFAULT_DENYLIST_PATTERNS = [
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

// A81/A92: "bash" burada — filePath/path yerine args.command bashDenylistHit() ile taranır (bkz. aşağıda).
// A105 (Alp: "çalışma izni içerisindeki dosyalara erişimin kısıtlanması hiç uygun bir güvenlik kilidi
// değil"): read/list/glob/grep/bash için bu kapı artık YALNIZ çalışma dizini (projectDir) DIŞINA çıkan
// hedeflere uygulanır — bkz. çağrı sitesi (tool.execute.before) ve bashDenylistHit'teki isInside(cwd,…)
// muafiyeti. write/edit bu muafiyetin DIŞINDA tutulur: kapsam içinde de denylist'e takılırsa reddedilir.
export const DENYLIST_TOOLS = new Set(["read", "write", "edit", "list", "glob", "grep", "bash"])

export function loadDenylistPatterns(projectDir: string | undefined): string[] {
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
export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${escaped}$`, "i")
}

export function matchesDenylist(targetPath: string, patterns: string[]): string | null {
  const normalized = targetPath.replace(/\\/g, "/")
  const base = normalized.split("/").pop() ?? normalized
  for (const pattern of patterns) {
    const re = globToRegExp(pattern)
    if (re.test(normalized) || re.test(base)) return pattern
  }
  return null
}

// --- arama kapsamı (T13/A35, PERMISSION-MATRIX.md "arama kapsamı") -------------------------

export const SCOPE_TOOLS = new Set(["read", "glob", "grep", "list"])
export const SCOPE_BURST_WINDOW_MS = 2 * 60 * 1000
export const SCOPE_WIDE_DIR_THRESHOLD = 3

export function isInside(parentDir: string, candidate: string): boolean {
  const rel = relative(parentDir, candidate)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

export function resolveTargetDir(tool: string, args: Record<string, unknown>, baseDir: string): string | null {
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

export function deriveTarget(rawArgs: unknown): string {
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
