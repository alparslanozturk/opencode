// guvenlik-v2.ts — opencode 2.x güvenlik + audit adaptörü (ADR-0005). 1.x karşılığı: audit-log.ts.
// Çekirdek değişmedi: kilitler ./lib/kilit.ts (K1/K5/K6), audit/yetki ./lib/denetim.ts.
//
// 2.x kancaları (2026-10-05, opencode 2.0.23 ile deneyle doğrulandı):
//   session "prompt"       → K1 yetki satırı (CN/KURULUM/KRİZ). YALNIZ kök oturum: alt ajan oturumunun ilk
//                            mesajını model yazar (core tool/plugin/subagent.ts), oradan yetki okunmaz;
//                            alt oturum kök oturumun yetkisini kullanır.
//   tool "execute.before"  → kilit kararı. İzin soran araçlarda (shell/edit/write/patch) karar saklanır ve
//   permission "evaluate"  → aynı çağrının (source.id) izin değerlendirmesinde effect=deny + mesaj olur:
//                            izin sorulmadan önce, kullanıcının "her zaman izin ver" onayı açamaz; model çağrı
//                            başına doğru mesajı görür. (execute.before'da throw da engelliyor ama paralel
//                            çağrılarda 2.0.23 hatayı karıştırıyor: K1 çağrısına K5 mesajı gitti — deney.)
//                            İzin sormayan araçlarda (read/grep/glob) throw kullanılır.
//   tool "execute.after"   → audit satırı.
// 1.x'teki guard.ts 2.x'te YOK: 2.x shell iznini alt komut başına değerlendiriyor ("ls; cp a b" → cp "sor";
// $(...) içi de ayrı komut) — guard'ın kapattığı allowlist açığı upstream'de kapalı (2026-10-05 deneyi).
//
// Çalışma zamanı bağımlılığı yok: tipler yerel (aşağıda), içe aktarımlar yalnız Node çekirdeği + ./lib.
import { readFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { deriveTarget, truncate } from "./lib/maskele"
import { kilitDenetle } from "./lib/kilit"
import type { Yetki } from "./lib/kilit"
import { STALE_PENDING_MS, beceriCommit, denetimYazici, sha256, yetkiIsle } from "./lib/denetim"

// --- 2.x eklenti bağlamının kullandığımız kadarı (@opencode/plugin promise API) ---
interface AracOncesi {
  tool: string
  readonly sessionID: string
  readonly id: string
  input: unknown
}
type AracSonrasi = { readonly tool: string; readonly sessionID: string; readonly id: string; readonly input: unknown } & (
  | { readonly status: "completed"; result: { content?: unknown } }
  | { readonly status: "error"; error: { message?: string } }
)
interface IzinDegerlendirme {
  readonly sessionID: string
  readonly action: string
  readonly source?: { readonly type: string; readonly id: string }
  effect: string
  message?: string
}
interface Baglam {
  readonly location: { readonly directory: string; readonly project?: { readonly directory?: string } }
  readonly tool: {
    hook(ad: "execute.before", cb: (e: AracOncesi) => Promise<void> | void): Promise<unknown>
    hook(ad: "execute.after", cb: (e: AracSonrasi) => Promise<void> | void): Promise<unknown>
  }
  readonly permission: { hook(ad: "evaluate", cb: (e: IzinDegerlendirme) => Promise<void> | void): Promise<unknown> }
  readonly session: {
    hook(ad: "prompt", cb: (e: { readonly sessionID: string; prompt: { text: string } }) => Promise<void> | void): Promise<unknown>
    get(input: { sessionID: string }): Promise<{ parentID?: string; model?: unknown } | undefined>
  }
}

// 2.x araç adı/girdisi → çekirdeğin (1.x adları) beklediği biçim. Çekirdek tek kaynak kalsın diye burada çevrilir.
export function arac1x(tool: string, input: unknown): { tool: string; args: Record<string, unknown> } {
  const g = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>
  if (tool === "shell") return { tool: "bash", args: { command: g.command, workdir: g.workdir } }
  if (tool === "edit" || tool === "write") return { tool, args: { ...g, filePath: g.path } }
  if (tool === "read") return { tool, args: { filePath: g.path } }
  return { tool, args: g }
}

// Bu araçlar çalışmadan önce permission.assert çağırır (core tool/plugin/{shell,edit,write,patch}.ts).
const IZIN_SORAN = new Set(["shell", "edit", "write", "patch"])

const modelAdi = (m: unknown) => {
  if (typeof m !== "object" || m === null) return undefined
  const r = m as { providerID?: unknown; modelID?: unknown; id?: unknown }
  const id = r.modelID ?? r.id
  return typeof r.providerID === "string" && typeof id === "string" ? `${r.providerID}/${id}` : undefined
}

// Oturum modeli açıkça seçilmemişse session.get model alanını boş döndürür (2.0.23) — audit için config'teki
// varsayılan model kullanılır (1.x adaptörü de config'ten alıyordu).
function varsayilanModel(): string | undefined {
  try {
    const dizin = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
    const m = JSON.parse(readFileSync(join(dizin, "opencode", "opencode.json"), "utf8")).model
    return typeof m === "string" ? m : undefined
  } catch {
    return undefined
  }
}

export function guvenlikKur(ctx: Baglam) {
  const calismaDizini = ctx.location.directory
  const projeDizini = ctx.location.project?.directory
  // Varsayılan KİLİTLİ (K7). Gözlem modu yalnız insan bilerek OPS_AGENT_KAPI=GOZLEM ile başlatırsa.
  const ENFORCE = process.env.OPS_AGENT_KAPI !== "GOZLEM"
  const yetkiler = new Map<string, Yetki>() // kök sessionID -> yetki
  const kokler = new Map<string, string>() // sessionID -> kök sessionID
  const modeller = new Map<string, string>() // sessionID -> provider/model
  const varsayilan = varsayilanModel()
  const model = (sessionID: string) => modeller.get(sessionID) ?? varsayilan
  const beceriler = new Map<string, { name: string; commit: string | null }>()
  const kararlar = new Map<string, { kilit: string; mesaj: string }>() // sessionID:callID -> kilit kararı
  const bekleyen = new Map<string, { tool: string; sessionID: string; timestamp: string; startedAt: number; argsHash: string; target: string }>()
  const yaz = denetimYazici({ projeDizini, beceriler: () => [...beceriler.values()] })

  async function oturum(sessionID: string) {
    try {
      return await ctx.session.get({ sessionID })
    } catch {
      return undefined
    }
  }

  // parentID zincirini köke kadar izler. Okunamazsa güvenli taraf: oturumun kendisi (kendi yetkisi yoksa yetkisiz).
  async function kok(sessionID: string): Promise<string> {
    const bilinen = kokler.get(sessionID)
    if (bilinen) return bilinen
    let simdiki = sessionID
    for (let i = 0; i < 16; i++) {
      const bilgi = await oturum(simdiki)
      const m = modelAdi(bilgi?.model)
      if (m && !modeller.has(simdiki)) modeller.set(simdiki, m)
      if (!bilgi?.parentID) break
      simdiki = bilgi.parentID
    }
    kokler.set(sessionID, simdiki)
    return simdiki
  }

  const yetkiKaydi = (sessionID: string, ozet: string, yetki?: Yetki) =>
    yaz({
      timestamp: new Date().toISOString(),
      sessionID,
      tool: "yetki",
      argsHash: sha256(ozet),
      target: truncate(ozet),
      resultStatus: "ok",
      policyDecision: "allow",
      latencyMs: 0,
      outputSha256: null,
      yetki,
    })

  return Promise.all([
    ctx.session.hook("prompt", async (e) => {
      const k = await kok(e.sessionID)
      if (k !== e.sessionID) return // alt ajan oturumu: metni model yazdı, yetki sayılmaz
      const ozet = yetkiIsle(yetkiler, k, e.prompt.text ?? "")
      if (ozet) yetkiKaydi(e.sessionID, ozet, yetkiler.get(k))
    }),

    ctx.tool.hook("execute.before", async (e) => {
      const { tool, args } = arac1x(e.tool, e.input)
      const target = deriveTarget(args)
      const argsHash = sha256(JSON.stringify(e.input ?? {}))
      const k = await kok(e.sessionID)
      const yetki = yetkiler.get(k)
      // K1/K5/K6 (ADR-0004). Code Mode ("execute") iç araçları da bu kancadan geçer.
      const kilit = kilitDenetle(tool, args, calismaDizini, yetki)
      kararlar.delete(`${e.sessionID}:${e.id}`) // aynı kimlik yeniden gelirse eski karar taşınmasın
      if (kilit) {
        yaz({
          timestamp: new Date().toISOString(),
          sessionID: e.sessionID,
          tool: e.tool,
          argsHash,
          target: truncate(`${kilit.kilit}${ENFORCE ? "" : " [GOZLEM]"} :: ${target}`),
          resultStatus: ENFORCE ? "denied" : "asked",
          policyDecision: "deny",
          latencyMs: 0,
          outputSha256: null,
          model: model(e.sessionID),
          yetki,
        })
        if (ENFORCE) {
          if (!IZIN_SORAN.has(e.tool)) throw new Error(kilit.mesaj)
          kararlar.set(`${e.sessionID}:${e.id}`, kilit)
        }
      }
      bekleyen.set(`${e.sessionID}:${e.id}`, {
        tool: e.tool,
        sessionID: e.sessionID,
        timestamp: new Date().toISOString(),
        startedAt: Date.now(),
        argsHash,
        target,
      })
    }),

    ctx.permission.hook("evaluate", (e) => {
      if (e.source?.type !== "tool") return
      const karar = kararlar.get(`${e.sessionID}:${e.source.id}`)
      if (!karar) return
      e.effect = "deny"
      e.message = karar.mesaj
    }),

    ctx.tool.hook("execute.after", async (e) => {
      const anahtar = `${e.sessionID}:${e.id}`
      const cagri = bekleyen.get(anahtar)
      bekleyen.delete(anahtar)
      const karar = kararlar.get(anahtar)
      kararlar.delete(anahtar)
      // Emniyet kemeri: kilitli çağrı yine de tamamlandıysa (izin değerlendirmesi atlandı — motor değişmiş olabilir)
      // bunu gizleme: audit'e ihlal yaz, stderr'e bas.
      if (karar && e.status === "completed") {
        console.error(`[guvenlik] KİLİT UYGULANAMADI (${karar.kilit}) — araç çalıştı: ${e.tool}`)
        yaz({
          timestamp: new Date().toISOString(),
          sessionID: e.sessionID,
          tool: e.tool,
          argsHash: sha256(JSON.stringify(e.input ?? {})),
          target: truncate(`IHLAL ${karar.kilit} :: ${deriveTarget(arac1x(e.tool, e.input).args)}`),
          resultStatus: "error",
          policyDecision: "deny",
          latencyMs: 0,
          outputSha256: null,
        })
        return
      }
      if (karar) return // reddedildi; denied satırı before'da yazıldı
      if (e.tool === "skill") {
        const ad = (e.input as { id?: unknown } | undefined)?.id
        if (typeof ad === "string" && !beceriler.has(ad)) beceriler.set(ad, { name: ad, commit: beceriCommit(projeDizini, ad) })
      }
      const icerik = e.status === "completed" ? e.result?.content : undefined
      const outputSha256 =
        e.status !== "completed" ? null : typeof icerik === "string" ? sha256(icerik) : sha256(JSON.stringify(e.result ?? null))
      const yetki = yetkiler.get(kokler.get(e.sessionID) ?? e.sessionID)
      yaz({
        timestamp: cagri?.timestamp ?? new Date().toISOString(),
        sessionID: e.sessionID,
        tool: e.tool,
        argsHash: cagri?.argsHash ?? sha256(JSON.stringify(e.input ?? {})),
        target: cagri?.target ?? deriveTarget(arac1x(e.tool, e.input).args),
        resultStatus: e.status === "completed" ? "ok" : "error",
        policyDecision: "allow",
        latencyMs: cagri ? Date.now() - cagri.startedAt : 0,
        outputSha256,
        model: model(e.sessionID),
        yetki,
      })
      // after hiç gelmeyen (izin reddi vb.) askıdaki çağrıları kapat — audit zincirinde kaybolmasın.
      const simdi = Date.now()
      for (const [a, c] of bekleyen) {
        if (simdi - c.startedAt < STALE_PENDING_MS) continue
        bekleyen.delete(a)
        yaz({ ...c, resultStatus: "error", policyDecision: "deny", latencyMs: simdi - c.startedAt, outputSha256: null })
      }
    }),
  ])
}

export default {
  id: "kurum.guvenlik",
  setup: async (ctx: Baglam) => {
    await guvenlikKur(ctx)
  },
}
