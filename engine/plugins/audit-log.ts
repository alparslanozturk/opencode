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

// A81/A92: "bash" burada — filePath/path yerine args.command bashDenylistHit() ile taranır (bkz. aşağıda).
// A105 (Alp: "çalışma izni içerisindeki dosyalara erişimin kısıtlanması hiç uygun bir güvenlik kilidi
// değil"): read/list/glob/grep/bash için bu kapı artık YALNIZ çalışma dizini (projectDir) DIŞINA çıkan
// hedeflere uygulanır — bkz. çağrı sitesi (tool.execute.before) ve bashDenylistHit'teki isInside(cwd,…)
// muafiyeti. write/edit bu muafiyetin DIŞINDA tutulur: kapsam içinde de denylist'e takılırsa reddedilir.
const DENYLIST_TOOLS = new Set(["read", "write", "edit", "list", "glob", "grep", "bash"])

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

type YetkiTur = "CN" | "KURULUM" | "KRIZ"
interface Yetki {
  tur: YetkiTur | null
  cn: string | null
  krizMetni: boolean
  sunucular: string[]
  zaman: number
}
const YETKI_OMRU_MS = 12 * 60 * 60 * 1000
// Kriz mesajında yetki satırları dışında en az bu kadar metin (yapıştırılmış mail/toplantı notu) olmalı.
const KRIZ_METNI_MIN = 120

// Türkçe büyük harf: JS /i bayrağı İ/ı'yı I/i ile eşlemez — önce tek biçime çekilir.
const buyuk = (s: string) => s.replace(/İ/g, "I").replace(/ı/g, "i").toUpperCase()

interface YetkiSatiri {
  tur?: YetkiTur
  cn?: string
  sunucular?: string[]
  kapat?: boolean
  govde: number
}

function yetkiSatirlariniOku(text: string): YetkiSatiri {
  const out: YetkiSatiri = { govde: 0 }
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
    const cn = /^CN\s*[:#=]?\s*([A-Z0-9][A-Z0-9_./-]*)/.exec(b)
    if (cn && /\d/.test(cn[1])) {
      out.tur = "CN"
      out.cn = cn[1]
      anahtar = true
    }
    if (/^KURULUM\b/.test(b)) {
      out.tur = "KURULUM"
      anahtar = true
    }
    if (/^KRIZ\b/.test(b)) {
      out.tur = "KRIZ"
      anahtar = true
    }
    // anahtar sözcüklerde İ/ı yok → /i yeterli; değerler ham satırdan alınır
    const liste = /(?:^|\s)(?:sunucular|sunucu|hedefler|hedef)\s*[:=]\s*(.+)$/i.exec(satir.trim())
    if (liste) {
      out.sunucular = liste[1]
        .split(/[\s,;]+/)
        .map(normHost)
        .filter((h) => h.length > 0)
        .slice(0, 200)
      anahtar = true
    }
    if (!anahtar) out.govde += satir.trim().length
  }
  return out
}

function normHost(h: string): string {
  const n = h
    .trim()
    .replace(/^.*@/, "")
    .replace(/\.$/, "")
    .toLowerCase()
  // `$h`, `{}`, `$(...)` gibi çalışma anında belli olan hedef denetlenemez → "?" (hedef belirsiz)
  return /[${}*]/.test(n) && !/^[a-z0-9._-]*\*[a-z0-9._-]*$/.test(n) ? "?" : n
}

function yetkiAktif(y: Yetki | undefined, now: number): y is Yetki & { tur: YetkiTur } {
  if (!y || !y.tur || y.sunucular.length === 0) return false
  if (now - y.zaman > YETKI_OMRU_MS) return false
  if (y.tur === "CN") return Boolean(y.cn)
  if (y.tur === "KRIZ") return y.krizMetni
  return true
}

function yetkiOzeti(y: Yetki): string {
  const bas = y.tur === "CN" ? `CN ${y.cn}` : y.tur === "KRIZ" ? "KRİZ" : "KURULUM"
  return `${bas}: ${y.sunucular.join(", ")}`
}

const YERELLER = () => {
  const h = hostname().toLowerCase()
  return new Set(["localhost", "127.0.0.1", "::1", h, h.split(".")[0]])
}

function hostListede(hedef: string, liste: string[]): boolean {
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

interface Komut {
  argv: string[]
  yazilan: string[] // > / >> / &> hedefleri
}

function eslesenParantez(src: string, start: number): [string, number] {
  let derinlik = 1
  let i = start
  while (i < src.length) {
    const c = src[i]
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
      derinlik--
      if (derinlik === 0) return [src.slice(start, i), i + 1]
    }
    i++
  }
  return [src.slice(start), src.length]
}

function ayristir(src: string, ic: string[]): Komut[] {
  const out: Komut[] = []
  let argv: string[] = []
  let yazilan: string[] = []
  let tok = ""
  let tokVar = false
  let hedef: "yok" | "yaz" | "oku" = "yok"
  const heredoc: { son: string; girinti: boolean }[] = []

  const bitirTok = () => {
    if (!tokVar) return
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

const taban = (p: string) => p.split("/").pop() ?? p

// sudo/env/timeout/nohup/xargs gibi sarmalayıcıları ve VAR=değer öneklerini soy.
function sarmalayiciSoy(argv: string[]): { argv: string[]; xargs: boolean } {
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

const SISTEM_KOKLERI = new Set([
  "/", "/bin", "/boot", "/dev", "/etc", "/home", "/lib", "/lib64", "/media", "/mnt", "/opt",
  "/proc", "/root", "/run", "/sbin", "/srv", "/sys", "/usr", "/var",
])
const BLOK_AYGIT_RE = /^\/dev\/(sd|hd|vd|xvd|nvme|mmcblk|mapper\/|dm-|md|loop|disk\/)/

interface Baglam {
  workdir: string
  cwd: string
  home: string
  uzak: string | null // null = bu makine
  derinlik: number
}

function yolCoz(p: string, b: Baglam): string {
  let x = p
  if (x === "~" || x.startsWith("~/")) x = b.home + x.slice(1)
  return isAbsolute(x) ? resolve(x) : resolve(b.cwd, x)
}

function serbestYazmaAlani(abs: string, b: Baglam): boolean {
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
function tehlikeliKok(raw: string, b: Baglam, silme: boolean): boolean {
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

interface Bulgu {
  tur: "sert" | "degisiklik"
  neden: string
  hedefler: string[]
}

const sert = (neden: string): Bulgu => ({ tur: "sert", neden, hedefler: [] })
const degisiklik = (neden: string, hedefler: string[]): Bulgu => ({ tur: "degisiklik", neden, hedefler })

const secenekDegil = (x: string) => !x.startsWith("-")

// Uzak sunucuda (ssh içinde, ansible -a …) salt-okunur sayılan komutlar. Listede olmayan her şey
// uzakta DEĞİŞİKLİK sayılır — şüphede kilit.
const SALT_OKUNUR = new Set([
  "ls", "cat", "head", "tail", "less", "more", "grep", "egrep", "fgrep", "zgrep", "rg", "wc", "file", "stat",
  "df", "du", "free", "uptime", "uname", "whoami", "id", "groups", "w", "who", "last", "lastlog", "ps", "pgrep",
  "pstree", "ss", "netstat", "lsof", "lsblk", "blkid", "pvs", "vgs", "lvs", "pvdisplay", "vgdisplay",
  "lvdisplay", "findmnt", "getent", "echo", "printf", "true", "false", "test", "[", "which", "type", "whereis",
  "printenv", "pwd", "sestatus", "getenforce", "getsebool", "klist", "md5sum", "sha1sum", "sha256sum", "diff",
  "cmp", "sort", "uniq", "cut", "tr", "column", "jq", "yq", "xxd", "od", "strings", "readlink", "realpath",
  "basename", "dirname", "lscpu", "lsmem", "lspci", "lsusb", "lsmod", "modinfo", "dmidecode", "ping",
  "traceroute", "tracepath", "dig", "nslookup", "host", "sleep", "tree", "getfacl", "lsattr", "atq",
  "systemd-analyze", "needs-restarting", "awk", "top", "vmstat", "iostat", "mpstat", "sar", "nproc", "arch",
  "locale", "localectl", "ntpq", "chronyc", "nc", "curl", "wget", "openssl", "ansible", "cd",
])

function saltOkunur(argv: string[]): boolean {
  const p = taban(argv[0] ?? "")
  const a = argv.slice(1)
  const has = (...x: string[]) => a.some((y) => x.includes(y))
  const ilk = a.find(secenekDegil) ?? ""
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
        "updateinfo", "--version", "deplist"].includes(ilk) || (ilk === "history" && ["", "list", "info"].includes(a.filter(secenekDegil)[1] ?? ""))
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
      return a.filter(secenekDegil).length === 0
    case "swapon":
      return a.length === 0 || has("--show", "-s", "--summary")
    case "dmesg":
      return !has("-c", "-C", "-D", "-E", "--clear", "--read-clear")
    case "crontab":
      return a.length > 0 && a.every((x) => x === "-l" || x === "-u" || !x.startsWith("-")) && has("-l")
    case "sed":
      return !a.some((x) => /^-[a-zA-Z]*i|^--in-place/.test(x))
    case "find":
      return !a.some((x) => /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/.test(x))
    case "subscription-manager":
      return ["status", "list", "identity", "facts", "version", "orgs", "release", "syspurpose"].includes(ilk) && !has("--set", "--unset")
    case "realm":
      return ilk === "list" || ilk === "discover"
    case "ipa":
      return /-(show|find)$/.test(ilk) || ["ping", "env", "help", "--version"].includes(ilk)
    case "kubectl":
    case "oc":
      return KUBE_OKUR.has(kubeFiil(a))
    case "helm":
      return ["list", "ls", "status", "get", "history", "show", "search", "version", "template", "lint", "env"].includes(ilk)
    case "docker":
    case "podman":
      return ["ps", "images", "inspect", "logs", "version", "info", "stats", "top", "port", "diff", "events"].includes(ilk)
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

const KUBE_DEGERLI = new Set(["-n", "--namespace", "--context", "--kubeconfig", "--cluster", "--user", "-s",
  "--server", "--token", "-l", "--selector", "-o", "--output", "-c", "--container", "--as", "--request-timeout"])
const KUBE_OKUR = new Set(["get", "describe", "logs", "top", "version", "api-resources", "api-versions", "explain",
  "cluster-info", "auth", "config", "wait", "diff", "events", "port-forward", "proxy", "whoami", "status", "projects", ""])

function kubeFiil(a: string[]): string {
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("-")) {
      if (KUBE_DEGERLI.has(a[i])) i++
      continue
    }
    return a[i]
  }
  return ""
}

function secenekDegeri(a: string[], ...adlar: string[]): string | null {
  for (let i = 0; i < a.length; i++) {
    for (const ad of adlar) {
      if (a[i] === ad) return a[i + 1] ?? null
      if (ad.startsWith("--") && a[i].startsWith(ad + "=")) return a[i].slice(ad.length + 1)
      if (!ad.startsWith("--") && a[i].startsWith(ad) && a[i].length > ad.length) return a[i].slice(ad.length)
    }
  }
  return null
}

function curlYazar(a: string[]): boolean {
  const yontem = (secenekDegeri(a, "-X", "--request") ?? "").toUpperCase()
  return (
    ["POST", "PUT", "DELETE", "PATCH"].includes(yontem) ||
    a.some((x) => /^(-d|--data.*|-F|--form.*|-T|--upload-file|--json)$/.test(x) || /^-d./.test(x))
  )
}

function wgetYazar(a: string[]): boolean {
  return a.some((x) => /^--(post-data|post-file|body-data|body-file)|^--method=(POST|PUT|DELETE|PATCH)/i.test(x))
}

function urlHost(a: string[]): string {
  for (const x of a) {
    const m = /^[a-z]+:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^/:?#]+)/i.exec(x)
    if (m) return m[1]
  }
  return "?"
}

function kubeHedef(a: string[], p: string): string {
  const ctx = secenekDegeri(a, "--context", "--kube-context")
  if (ctx) return ctx
  const kc = secenekDegeri(a, "--kubeconfig")
  if (kc) return taban(kc).replace(/\.(ya?ml|conf)$/, "")
  return p === "oc" ? "openshift" : "kubernetes"
}

// Bu makinede (uzak değil) sistem değiştiren komutlar → hedef "localhost".
function yerelDegisiklik(argv: string[], yazilan: string[], b: Baglam): string | null {
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
    case "rmmod": case "insmod": case "grubby": case "grub2-mkconfig": case "dracut": case "update-crypto-policies":
    case "fdisk": case "parted": case "sgdisk": case "gdisk": case "sfdisk": case "pvcreate": case "pvremove":
    case "vgcreate": case "vgremove": case "vgextend": case "vgreduce": case "lvcreate": case "lvremove":
    case "lvextend": case "lvreduce": case "lvresize": case "resize2fs": case "xfs_growfs": case "alternatives":
    case "update-alternatives": case "at": case "certutil": case "update-ca-trust": case "restorecon": case "chcon":
      if ((p === "fdisk" || p === "sfdisk" || p === "parted") && has(a, "-l", "--list")) return null
      return `${p} ${a.join(" ")}`.trim()
    case "ipa":
      return saltOkunur(argv) ? null : `ipa ${ilk}`
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

const has = (a: string[], ...x: string[]) => a.some((y) => x.includes(y))

function komutIncele(metin: string, b: Baglam): Bulgu[] {
  if (b.derinlik > 6) return [sert("iç içe komut çok derin")]
  const bulgular: Bulgu[] = []
  if (/:\s*\(\s*\)\s*\{[^}]*:\s*\|\s*:/.test(metin)) bulgular.push(sert("fork bombası"))
  const ic: string[] = []
  for (const k of ayristir(metin, ic)) bulgular.push(...tekKomut(k, b))
  for (const x of ic) bulgular.push(...komutIncele(x, { ...b, derinlik: b.derinlik + 1 }))
  return bulgular
}

function tekKomut(k: Komut, b: Baglam): Bulgu[] {
  const { argv, xargs } = sarmalayiciSoy(k.argv)
  const out: Bulgu[] = []
  for (const y of k.yazilan) {
    if (BLOK_AYGIT_RE.test(y)) out.push(sert(`diske doğrudan yazma (> ${y})`))
  }
  if (argv.length === 0) {
    if (b.uzak && k.yazilan.some((y) => !["/dev/null", "/dev/stderr", "/dev/stdout"].includes(y)))
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
  if (/^mkfs(\..*)?$/.test(p) || p === "mke2fs" || p === "wipefs" || p === "blkdiscard") out.push(sert(p))
  if (p === "mkswap" && a.some((x) => BLOK_AYGIT_RE.test(x))) out.push(sert("mkswap (disk)"))
  if (p === "sgdisk" && a.some((x) => /^(--zap|--zap-all|-Z|-z)$/.test(x))) out.push(sert("sgdisk --zap"))
  if (p === "dd") {
    const of = a.find((x) => x.startsWith("of="))
    if (of && BLOK_AYGIT_RE.test(of.slice(3))) out.push(sert(`dd ${of}`))
  }
  if (p === "shred" && a.some((x) => BLOK_AYGIT_RE.test(x))) out.push(sert("shred (disk)"))
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
    const limit = secenekDegeri(a, "-l", "--limit")
    const hedefler = limit ? limitHedefleri(limit) : ["?"]
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
      degistirir = ic.some((x) => x.tur === "degisiklik")
    }
    const limit = secenekDegeri(a, "-l", "--limit")
    if (degistirir) out.push(degisiklik(`ansible -m ${modul}`, limitHedefleri(limit ?? oruntu)))
    return out
  }
  if (["ansible-pull", "ansible-console", "pssh", "parallel-ssh", "pdsh", "clush", "prsync", "pscp"].includes(p))
    return [...out, degisiklik(`${p} (toplu uzak komut — hedef tek tek belirtilmeli)`, ["?"])]
  if ((p === "kubectl" || p === "oc") && !KUBE_OKUR.has(kubeFiil(a)))
    return [...out, degisiklik(`${p} ${kubeFiil(a)}`, [kubeHedef(a, p)])]
  if (p === "helm" && !saltOkunur(argv) && !["repo", "dependency", "plugin", "completion", "help"].includes(a.find(secenekDegil) ?? ""))
    return [...out, degisiklik(`helm ${a.find(secenekDegil) ?? ""}`, [kubeHedef(a, "helm")])]
  if (p === "curl" && curlYazar(a)) return [...out, degisiklik("curl (POST/PUT/DELETE)", [urlHost(a)])]
  if (p === "wget" && wgetYazar(a)) return [...out, degisiklik("wget (POST)", [urlHost(a)])]
  if (p === "ipa" && !saltOkunur(argv)) return [...out, degisiklik(`ipa ${a.find(secenekDegil) ?? ""}`, [b.uzak ?? "ipa"])]

  if (b.uzak) {
    if (!saltOkunur(argv)) out.push(degisiklik(`${p} (uzakta)`, [b.uzak]))
    else if (k.yazilan.some((y) => !["/dev/null", "/dev/stderr", "/dev/stdout"].includes(y)))
      out.push(degisiklik(`${p} > dosya (uzakta)`, [b.uzak]))
    return out
  }
  const r = yerelDegisiklik(argv, k.yazilan, b)
  if (r) out.push(degisiklik(r, ["localhost"]))
  return out
}

function betikOku(abs: string): string | null {
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

// --- bash icindeki denylist taramasi (A81/A92) --------------------------------------------
// Ustteki denylist kapisi (DENYLIST_TOOLS) yalniz read/write/edit/list/glob/grep araclarinin
// filePath/path alanina bakiyordu — `bash` uzerinden "cat hosts.ini" ya da "cp hosts.ini /tmp/x;
// cat /tmp/x" ile ayni icerik dolayli okunup kilit asilabiliyordu (saha bulgusu #18/#22, ops-agent
// kendisi bu yolu alternatif olarak onerdi). Bu tarama var olan kabuk ayristiricisini
// (ayristir/sarmalayiciSoy/betikOku, K1-K7'nin de kullandigi) yeniden kullanir: her alt komutun
// argumanlarini (bayrak degerleri, yazma hedefleri dahil) ve `bash -c`/`eval`/modelin yazdigi yerel
// betik dosyasinin ICERIGINI de denylist desenlerine karsi test eder. Komut adinin kendisi
// (argv[0]) denetlenmez — okunan/kopyalanan dosya her zaman bir sonraki konumdadir.
function bashDenylistHit(metin: string, patterns: string[], cwd: string, derinlik = 0): string | null {
  if (derinlik > 6) return null
  const ic: string[] = []
  for (const k of ayristir(metin, ic)) {
    const { argv } = sarmalayiciSoy(k.argv)
    for (const tok of [...argv.slice(1), ...k.yazilan]) {
      if (!tok || tok.startsWith("-")) continue
      // A105: çalışma dizini İÇİNDEKİ hedefler denylist'ten muaf — kısıt yalnız cwd DIŞINA uygulanır
      // (bkz. matchesDenylist çağrı sitesindeki aynı muafiyet, tool.execute.before).
      const abs = isAbsolute(tok) ? resolve(tok) : resolve(cwd, tok)
      if (isInside(cwd, abs)) continue
      const hit = matchesDenylist(tok, patterns)
      if (hit) return hit
    }
    if (argv.length === 0) continue
    const p = taban(argv[0])
    const a = argv.slice(1)
    if (["bash", "sh", "zsh", "dash", "ksh", "su", "runuser"].includes(p)) {
      const c = secenekDegeri(a, "-c", "--command")
      if (c !== null) {
        const hit = bashDenylistHit(c, patterns, cwd, derinlik + 1)
        if (hit) return hit
        continue
      }
    }
    if (p === "eval") {
      const hit = bashDenylistHit(a.join(" "), patterns, cwd, derinlik + 1)
      if (hit) return hit
      continue
    }
    const betik =
      ["bash", "sh", "zsh", "dash", "ksh", "source", "."].includes(p)
        ? a.find(secenekDegil)
        : /^\.{0,2}\//.test(argv[0])
          ? argv[0]
          : undefined
    if (betik) {
      const abs = isAbsolute(betik) ? betik : resolve(cwd, betik)
      const icerik = betikOku(abs)
      if (icerik !== null) {
        const hit = bashDenylistHit(icerik, patterns, cwd, derinlik + 1)
        if (hit) return hit
      }
    }
  }
  for (const inner of ic) {
    const hit = bashDenylistHit(inner, patterns, cwd, derinlik + 1)
    if (hit) return hit
  }
  return null
}

const SSH_DEGERLI = new Set("bcDEeFIiJLlmOopQRSWw".split(""))

function sshHedef(a: string[]): { host: string | null; komut: string } {
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

function ansibleOruntu(a: string[]): string {
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

function limitHedefleri(limit: string): string[] {
  const h = limit
    .split(/[,:]/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith("!"))
    .map((x) => normHost(x.replace(/^&/, "")))
  return h.length ? h : ["?"]
}

// K6: korunan yollar — ajanın kendi ayarı/eklentisi/oturum verisi/audit log'u.
function korunanYollar(): { yazma: string[]; okuma: string[] } {
  const home = userInfo().homedir
  const cfg = process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "opencode") : join(home, ".config", "opencode")
  const data = process.env.XDG_DATA_HOME ? join(process.env.XDG_DATA_HOME, "opencode") : join(home, ".local", "share", "opencode")
  const yazma = [cfg, data, dirname(AUDIT_LOG_PATH)]
  if (process.env.OPENCODE_CONFIG_DIR) yazma.push(process.env.OPENCODE_CONFIG_DIR)
  if (process.env.OPENCODE_CONFIG) yazma.push(process.env.OPENCODE_CONFIG)
  return { yazma, okuma: [join(data, "auth.json"), dirname(AUDIT_LOG_PATH)] }
}

function korunanYol(abs: string, yazma: boolean): boolean {
  const k = korunanYollar()
  if ((yazma ? k.yazma : k.okuma).some((d) => isInside(d, abs))) return true
  const parcalar = abs.split("/")
  if (parcalar.includes(".opencode") && yazma) return true
  const ad = parcalar[parcalar.length - 1]
  if (/^opencode\.jsonc?$/.test(ad)) return true // anahtar içerir (okuma) / izinleri ezer (yazma)
  return false
}

function korunanMetin(metin: string): string | null {
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

function yamaYollari(patch: string): string[] {
  const out: string[] = []
  for (const m of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm)) out.push((m[1] ?? m[2]).trim())
  return out
}

interface KilitKarari {
  kilit: "K1" | "K5" | "K6"
  mesaj: string
}

const YETKI_NASIL =
  'Yetkiyi YALNIZ kullanıcı kendi mesajıyla verir (sen yazamazsın): "CN: <numara>" + "sunucular: <ad>, <ad>" · ' +
  'yeni kurulumsa "KURULUM" + "sunucular: …" · kriz ise "KRİZ" + kriz maili/toplantı notu + "sunucular: …". ' +
  "Bu makine için listeye localhost yazılır. Salt-okunur işlerle devam edebilirsin; kullanıcıya neyin neden gerektiğini söyle."

function kilitDenetle(
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
    const k6 = korunanMetin(args.command)
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

  const degisenler = bulgular.filter((x) => x.tur === "degisiklik")
  if (!degisenler.length) return null
  const hedefler = [...new Set(degisenler.flatMap((x) => x.hedefler))]
  const nedenler = [...new Set(degisenler.map((x) => x.neden))].join("; ")
  if (hedefler.includes("?") || hedefler.includes("__ansible__"))
    return {
      kilit: "K1",
      mesaj: `[güvenlik kilidi K1] Değişiklik yapan komutun hedefi belirlenemedi (${nedenler}). ansible-playbook için hedefi --limit <sunucu,…> ile açıkça ver; toplu araç yerine sunucu başına komut kullan. ${YETKI_NASIL}`,
    }
  if (!yetkiAktif(yetki, Date.now())) {
    const eksik = !yetki || !yetki.tur
      ? "bu oturumda yetki yok"
      : yetki.sunucular.length === 0
        ? `${yetki.tur} verildi ama sunucu listesi yok`
        : yetki.tur === "CN" && !yetki.cn
          ? "CN numarası yok"
          : yetki.tur === "KRIZ" && !yetki.krizMetni
            ? "KRİZ için kriz maili/toplantı notu yapıştırılmadı"
            : "yetkinin süresi doldu (12 saat)"
    return {
      kilit: "K1",
      mesaj: `[güvenlik kilidi K1] Bu komut değişiklik yapıyor (${nedenler}) → hedef: ${hedefler.join(", ")}. Çalıştırılmadı: ${eksik}. ${YETKI_NASIL}`,
    }
  }
  const disarida = hedefler.filter((h) => !hostListede(h, yetki.sunucular))
  if (disarida.length)
    return {
      kilit: "K1",
      mesaj: `[güvenlik kilidi K1] Hedef yetki listesinde yok: ${disarida.join(", ")} (geçerli yetki — ${yetkiOzeti(yetki)}). Komut: ${nedenler}. Kullanıcı listeyi "sunucular: …" satırıyla güncellemeli (IP ile bağlanıyorsan IP de listede olmalı).`,
    }
  return null
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

export const AuditLogPlugin: Plugin = async ({ directory, project, worktree }) => {
  // git'siz dizinde opencode worktree'yi "/" yapar (project.ts) — o zaman "proje içi" her yer olurdu;
  // motor da bu durumda worktree'yi yok sayar (instance-context.ts containsPath). Aynısı burada.
  const wt = worktree ?? (project as { worktree?: string } | undefined)?.worktree
  const projectDir = wt && wt !== "/" ? wt : directory
  const engineVersion = detectEngineVersion()
  const configHash = detectConfigHash(projectDir)
  const policyHash = detectPolicyHash(projectDir)
  const actorAgent = `aiops@${hostname()}`
  const actorHuman = userInfo().username
  let requestModel = "unknown"

  const pending = new Map<string, PendingCall>()
  const skillsLoaded = new Map<string, { name: string; commit: string | null }>()

  // T13/A34+A35 + K7 (ADR-0004): tek kapı, VARSAYILAN KİLİTLİ. Denylist ihlali ve güvenlik kilitleri
  // (K1/K5/K6) `tool.execute.before` içinde reddedilir (before-hook throw = araç hiç çalışmaz). Gözlem
  // modu yalnız insan bilerek `OPS_AGENT_KAPI=GOZLEM` ile başlatırsa: sert blok yok, uyarı + kayıt.
  const ENFORCE = process.env.OPS_AGENT_KAPI !== "GOZLEM"
  const yetkiler = new Map<string, Yetki>() // sessionID -> kullanıcının verdiği değişiklik yetkisi
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

  function writeYetkiRecord(sessionID: string, ozet: string) {
    writeRecord({
      timestamp: new Date().toISOString(),
      sessionID,
      tool: "yetki",
      argsHash: sha256(ozet),
      target: truncate(maskString(ozet)),
      resultStatus: "ok",
      policyDecision: "allow",
      latencyMs: 0,
      outputSha256: null,
    })
  }

  return {
    config: async (cfg) => {
      const model = (cfg as { model?: unknown } | undefined)?.model
      if (typeof model === "string") requestModel = model
    },
    "tool.execute.before": async (input, output) => {
      const args = ((output as { args?: unknown }).args ?? {}) as Record<string, unknown>
      const target = deriveTarget(args)
      const argsHash = sha256(JSON.stringify(maskArgs(args) ?? {}))

      // K1/K5/K6 — güvenlik kilitleri (ADR-0004). Kullanıcının "always" onayı bunları açamaz.
      const kilit = kilitDenetle(input.tool, args, projectDir, yetkiler.get(input.sessionID))
      if (kilit) {
        writeRecord({
          timestamp: new Date().toISOString(),
          sessionID: input.sessionID,
          tool: input.tool,
          argsHash,
          target: truncate(`${kilit.kilit}${ENFORCE ? "" : " [GOZLEM]"} :: ${target}`),
          resultStatus: ENFORCE ? "denied" : "asked",
          policyDecision: "deny",
          latencyMs: 0,
          outputSha256: null,
        })
        if (ENFORCE) throw new Error(kilit.mesaj)
      }

      if (DENYLIST_TOOLS.has(input.tool)) {
        let hit: string | null = null
        if (input.tool === "bash" && typeof args.command === "string") {
          const baseDir = projectDir ?? process.cwd()
          const cwd =
            typeof args.workdir === "string"
              ? isAbsolute(args.workdir)
                ? args.workdir
                : resolve(baseDir, args.workdir)
              : baseDir
          hit = bashDenylistHit(args.command, denylistPatterns, cwd)
        } else {
          const pathArg =
            typeof args.filePath === "string" ? args.filePath : typeof args.path === "string" ? args.path : null
          // A105 (Alp: "çalışma izni içerisindeki dosyalara erişimin kısıtlanması hiç uygun bir
          // güvenlik kilidi değil"): salt-okunur araçlarda (write/edit hariç) çalışma dizini İÇİNDEKİ
          // hedefler denylist'ten muaf — kısıt yalnız cwd DIŞINA uygulanır. write/edit'te değişmedi:
          // hassas dosyaya yazma/düzenleme kapsam içinde olsa da reddedilir.
          const inScope =
            pathArg !== null &&
            SCOPE_TOOLS.has(input.tool) &&
            projectDir !== undefined &&
            isInside(projectDir, isAbsolute(pathArg) ? resolve(pathArg) : resolve(projectDir, pathArg))
          hit = pathArg && !inScope ? matchesDenylist(pathArg, denylistPatterns) : null
        }
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
              `[ops-agent] hassas dosya erişimi reddedildi (denylist: ${hit}) — içerik gerekiyorsa kullanıcı kendisi paylaşır`,
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
          // K2 (ADR-0004): dizin dışına çıkışta ONAYI motor sorar (`permission.external_directory: "ask"`,
          // kullanıcı onaylayabilir). Burada sert red olsaydı kullanıcının onayı da işe yaramazdı — bu
          // yüzden kapsam kapısı artık yalnız kayıt tutar (audit'te "asked" + dizin + dosya sayısı).
          if ((outOfScope || wide) && !st.burstFlagged) {
            st.burstFlagged = true
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
    // K1 yetkisi YALNIZ buradan gelir: kullanıcının kendi mesajı (motor bu hook'u kullanıcı istemi için
    // tetikler; modelin yanıtı/araç çıktısı buraya düşmez). synthetic parçalar (ör. @dosya eki) sayılmaz —
    // yetki satırı bir dosyanın içinden gelemez.
    "chat.message": async (input, output) => {
      const metin = (output.parts as Array<{ type?: string; text?: string; synthetic?: boolean }>)
        .filter((x) => x.type === "text" && !x.synthetic && typeof x.text === "string")
        .map((x) => x.text as string)
        .join("\n")
      if (!metin) return
      const s = yetkiSatirlariniOku(metin)
      const now = Date.now()
      let y = yetkiler.get(input.sessionID)
      if (s.kapat) {
        if (y) yetkiler.delete(input.sessionID)
        writeYetkiRecord(input.sessionID, "yetki kapatıldı")
        return
      }
      if (!s.tur && !s.cn && !s.sunucular) {
        // KRİZ verildiyse mail/toplantı notu ayrı bir mesajla da yapıştırılabilir
        if (y?.tur === "KRIZ" && !y.krizMetni && s.govde >= KRIZ_METNI_MIN) {
          y.krizMetni = true
          y.zaman = now
          writeYetkiRecord(input.sessionID, `KRİZ metni alındı (${s.govde} karakter)`)
        }
        return
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
      yetkiler.set(input.sessionID, y)
      writeYetkiRecord(
        input.sessionID,
        yetkiAktif(y, now) ? `yetki: ${yetkiOzeti(y)}` : `yetki eksik: tur=${y.tur ?? "-"} cn=${y.cn ?? "-"} kriz_metni=${y.krizMetni} sunucu=${y.sunucular.length}`,
      )
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
        if (outRef) outRef.output = `[REDACTED: hassas dosya, desen "${denylistHit}" — gözlem modu; varsayılan kilitli modda reddedilir]`
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
