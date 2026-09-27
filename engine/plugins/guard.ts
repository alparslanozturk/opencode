// guard.ts — GOREV oc-T5 bulgu A / plan P1-1: bileşik komutla allowlist aşımı.
//
// Sorun: engine/opencode.json'daki `bash` izinleri (ör. "ls *": "allow") tüm komut DİZESİNE
// regex olarak uygulanıyor (packages/core/src/util/wildcard.ts) ve permission.ts `findLast` ile
// SON eşleşen kuralı kullanıyor. Bir "allow" kalıbı yalnız komutun BAŞINI tanır — geri kalanı `.*`
// olarak yutulur. Bu yüzden "ls foo; rm -rf /x" gibi bileşik komutlar "ls *" kalıbıyla tamamen
// ALLOW olabiliyor (doğrulandı: knowledge/'de kayıtlı değil, bkz. GOREV oc-T5 raporu). K1/K5/K6
// kilitleri (./lib/kilit.ts, audit-log.ts) farklı bir sorunu çözüyor (sistem köklerini/uzak
// değişiklikleri korumak) — hedefsiz "rm -rf <herhangi bir yol>" gibi salt fiil tabanlı bir
// deny-list'i KAPSAMAZ. guard.ts bu boşluğu dolduran, motordan bağımsız (ADR-0005 ruhuyla) AYRI
// bir kilittir: yalnız DARALTIR, var olan izinleri genişletmez.
//
// Kural (yalnız bash aracı, yalnız tool.execute.before'da):
//   - Komutta ; && || | $(...) `...` ya da yeni satır varsa (ayristir() ile ayrıştırıldığında
//     birden çok alt-komut ya da komut ikamesi çıkıyorsa) tüm-dize allowlist eşleşmesi GEÇERSİZDİR:
//       * herhangi bir alt-komut deny-list'li bir fiilse (rm -rf, systemctl stop, mkfs, dd,
//         shutdown, reboot) → DENY (araç hiç çalışmaz, before-hook throw eder)
//       * $(...)/`...` komut ikamesi varsa → ne çalışacağı derleme zamanında belli değil → ASK
//       * değilse: her alt-komut TEK TEK narrowed allow kalıplarına uyuyorsa → override yok
//         (mevcut motor kararına bırakılır), uymuyorsa → ASK (throw — bugün interaktif "ask"
//         motora bağlı değil, T7 kapsamı; şimdilik güvenli taraf: engelle, iş akışını YANLIŞ
//         allow ile açık bırakma).
//   - find: -exec/-execdir/-delete/-ok içeriyorsa → ASK (tek başına da olsa, bileşik olmasa da).
//   - ps kalıbı narrow'u burada DEĞİL, engine/opencode.json'da (bkz. commit).
//
// classify() saf/test edilebilir bir fonksiyondur; hook onu sarar ve override != "allow" olduğunda
// throw eder (bugünkü tek uygulanabilir mekanizma — bkz. test/tool/code-mode.test.ts:429 regresyonu:
// "before" hook'unda throw yalnız o çağrıyı iptal eder).
import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync } from "fs"
import { join } from "path"
import { ayristir, sarmalayiciSoy, taban } from "./lib/kilit"

export type Verdict = "allow" | "ask" | "deny"

// Fail-closed varsayılan: engine/opencode.json okunamazsa (yol yok, bozuk JSON) bu daraltılmış
// liste kullanılır — motorun asıl allow listesinden DAHA DAR olması güvenlidir, daha GENİŞ olması
// değil. Buradaki kalıplar packages/core/src/util/wildcard.ts ile aynı sözdizimini kullanır.
export const DEFAULT_BASH_ALLOW_PATTERNS = [
  "ls",
  "ls *",
  "wc",
  "wc *",
  "file",
  "file *",
  "stat",
  "stat *",
  "pwd",
  "pwd *",
  "whoami",
  "whoami *",
  "uname",
  "uname *",
  "uptime",
  "uptime *",
  "df",
  "df *",
  "du",
  "du *",
  "free",
  "free *",
  "ps",
  "ps aux*",
  "ps -ef*",
  "ps -o*",
  "git status",
  "git status *",
  "git log",
  "git log *",
  "git diff",
  "git diff *",
  "git show",
  "git show *",
]

export function loadBashAllowPatterns(projectDir: string | undefined): string[] {
  if (!projectDir) return DEFAULT_BASH_ALLOW_PATTERNS
  try {
    const raw = JSON.parse(readFileSync(join(projectDir, "engine", "opencode.json"), "utf8"))
    const bash = raw?.permission?.bash
    if (bash && typeof bash === "object") {
      const allow = Object.entries(bash as Record<string, unknown>)
        .filter(([, effect]) => effect === "allow")
        .map(([pattern]) => pattern)
      if (allow.length > 0) return allow
    }
  } catch {
    // okunamadı/bozuk — fail-closed: dar varsayılana düş
  }
  return DEFAULT_BASH_ALLOW_PATTERNS
}

// packages/core/src/util/wildcard.ts ile BİLEREK aynı mantığın küçük bir kopyası: bu dizin
// (audit-log.ts/kilit.ts gibi) çalışma zamanı workspace paketi bağımlılığı taşımaz — yalnız
// Node/Bun çekirdeği (bkz. README.md "npm plugin KULLANMA").
export function wildcardMatch(input: string, pattern: string): boolean {
  const normalized = input.replaceAll("\\", "/")
  let escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"
  return new RegExp("^" + escaped + "$", "s").test(normalized)
}

const DENY_VERBS: Array<{ test: (p: string) => boolean; hit: (argv: string[]) => boolean }> = [
  {
    test: (p) => p === "rm",
    hit: (argv) =>
      argv
        .slice(1)
        .some((x) => /^-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*$/i.test(x) || /^-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*$/i.test(x)),
  },
  { test: (p) => p === "systemctl", hit: (argv) => argv[1] === "stop" },
  { test: (p) => /^mkfs(\..+)?$/.test(p), hit: () => true },
  { test: (p) => p === "dd", hit: () => true },
  { test: (p) => p === "shutdown", hit: () => true },
  { test: (p) => p === "reboot", hit: () => true },
]

function isDenyVerb(argv: string[]): boolean {
  if (argv.length === 0) return false
  const p = taban(argv[0]!)
  return DENY_VERBS.some((v) => v.test(p) && v.hit(argv))
}

function isFindWithExec(argv: string[]): boolean {
  if (taban(argv[0] ?? "") !== "find") return false
  return argv.slice(1).some((x) => ["-exec", "-execdir", "-delete", "-ok"].includes(x))
}

function matchesAnyAllow(argv: string[], patterns: string[]): boolean {
  const commandString = argv.join(" ")
  return patterns.some((p) => wildcardMatch(commandString, p))
}

// classify: guard'ın override kararı. "allow" = müdahale yok (motorun kendi kararına bırakılır),
// "ask"/"deny" = before-hook throw eder (bkz. hook aşağıda).
export function classify(command: string, allowPatterns: string[] = DEFAULT_BASH_ALLOW_PATTERNS): Verdict {
  const ic: string[] = []
  let parsed: ReturnType<typeof ayristir>
  try {
    parsed = ayristir(command, ic)
  } catch {
    return "ask" // ayrıştırılamadı — güvenli tarafta kal
  }

  if (ic.length > 0) return "ask" // $(...) / `...` komut ikamesi — çalışma zamanında ne olacağı belli değil

  if (parsed.length > 1) {
    // bileşik komut: tüm-dize allowlist eşleşmesi geçersiz, alt komut alt komut değerlendirilir
    for (const k of parsed) {
      const { argv } = sarmalayiciSoy(k.argv)
      if (isDenyVerb(argv)) return "deny"
    }
    const hepsiUyuyor = parsed.every((k) => {
      const { argv } = sarmalayiciSoy(k.argv)
      return argv.length > 0 && matchesAnyAllow(argv, allowPatterns)
    })
    return hepsiUyuyor ? "allow" : "ask"
  }

  const only = parsed[0]
  if (!only) return "allow"
  const { argv } = sarmalayiciSoy(only.argv)
  if (isDenyVerb(argv)) return "deny"
  if (isFindWithExec(argv)) return "ask"
  return "allow"
}

export const GuardPlugin: Plugin = async ({ directory, project, worktree }) => {
  const wt = worktree ?? (project as { worktree?: string } | undefined)?.worktree
  const projectDir = wt && wt !== "/" ? wt : directory
  const allowPatterns = loadBashAllowPatterns(projectDir)

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return
      const args = (output as { args?: { command?: unknown } }).args
      const command = args && typeof args.command === "string" ? args.command : undefined
      if (!command) return
      const verdict = classify(command, allowPatterns)
      if (verdict === "deny")
        throw new Error(
          "[guard] Bileşik komutta yıkıcı bir fiil bulundu — allowlist bileşik komutları kapsamaz, bu çağrı reddedildi. Gerekiyorsa alt komutları ayrı ayrı çalıştır.",
        )
      if (verdict === "ask")
        throw new Error(
          "[guard] Bu komut (bileşik/komut-ikameli/find -exec|-execdir|-delete|-ok) tek-dize allowlist ile güvenle değerlendirilemiyor — reddedildi. Gerekiyorsa alt komutları ayrı ayrı, tek satır bash çağrılarıyla çalıştır.",
        )
    },
  }
}

export default GuardPlugin
