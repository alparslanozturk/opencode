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
import { DENYLIST_TOOLS, SCOPE_BURST_WINDOW_MS, SCOPE_TOOLS, SCOPE_WIDE_DIR_THRESHOLD, deriveTarget, isInside, loadDenylistPatterns, maskArgs, maskString, matchesDenylist, redactSecrets, resolveTargetDir, truncate } from "./lib/maskele"
import { KRIZ_METNI_MIN, YETKI_OMRU_MS, bashDenylistHit, has, kilitDenetle, yetkiAktif, yetkiOzeti, yetkiSatirlariniOku } from "./lib/kilit"
import type { Yetki } from "./lib/kilit"

const AUDIT_LOG_PATH = process.env.OPS_AGENT_AUDIT_LOG ?? "/var/log/ops-agent/audit.jsonl"
const ZERO_HASH = "0".repeat(64)
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
