// guvenlik-v2.test.ts — 2.x adaptörünün kancaları sahte bir 2.x bağlamıyla sınanır (motor gerekmez).
// Uçtan uca (derlenmiş 2.x ikilisiyle) doğrulama ayrıca yapılır; bkz. SURUM-NOTLARI.md.
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { arac1x, guvenlikKur } from "./guvenlik-v2"
import { sha256 } from "./lib/denetim"

type Kanca = (e: any) => Promise<void> | void

function sahteBaglam(oturumlar: Record<string, { parentID?: string }> = {}) {
  const kancalar: Record<string, Kanca> = {}
  const ctx = {
    location: { directory: "/tmp/guvenlik-v2-proje", project: { directory: "/tmp/guvenlik-v2-proje" } },
    tool: { hook: async (ad: string, cb: Kanca) => void (kancalar[`tool.${ad}`] = cb) },
    permission: { hook: async (ad: string, cb: Kanca) => void (kancalar[`permission.${ad}`] = cb) },
    session: {
      hook: async (ad: string, cb: Kanca) => void (kancalar[`session.${ad}`] = cb),
      get: async ({ sessionID }: { sessionID: string }) => oturumlar[sessionID] ?? {},
    },
  }
  return { ctx: ctx as any, kancalar }
}

let dizin: string
let kayit: string
beforeEach(() => {
  dizin = mkdtempSync(join(tmpdir(), "guvenlik-v2-"))
  kayit = join(dizin, "audit.jsonl")
  process.env.OPS_AGENT_AUDIT_LOG = kayit
  delete process.env.OPS_AGENT_KAPI
})
afterEach(() => {
  rmSync(dizin, { recursive: true, force: true })
  delete process.env.OPS_AGENT_AUDIT_LOG
})
const satirlar = () => readFileSync(kayit, "utf8").trim().split("\n").map((l) => JSON.parse(l))

async function kur(oturumlar?: Record<string, { parentID?: string }>) {
  const s = sahteBaglam(oturumlar)
  await guvenlikKur(s.ctx)
  const k = s.kancalar
  return {
    kullanici: (sessionID: string, text: string) => k["session.prompt"]({ sessionID, prompt: { text } }),
    // Motorun sırası: execute.before → (izin soran araçta) permission.assert → evaluate kancası. Red ya
    // before'daki throw ya da evaluate'te effect=deny olur; ikisi de "Error(mesaj)" olarak döndürülür.
    once: async (sessionID: string, tool: string, input: unknown, id = "c1") => {
      await k["tool.execute.before"]({ tool, sessionID, id, agent: "build", messageID: "m1", input })
      if (!["shell", "edit", "write", "patch"].includes(tool)) return
      const olay = { sessionID, action: tool, resources: ["x"], source: { type: "tool", messageID: "m1", id }, effect: "ask" as string, message: undefined as string | undefined }
      await k["permission.evaluate"](olay)
      if (olay.effect === "deny") throw new Error(olay.message)
    },
    sonra: (sessionID: string, tool: string, input: unknown, id = "c1") =>
      k["tool.execute.after"]({ tool, sessionID, id, agent: "build", messageID: "m1", input, status: "completed", result: { content: "tamam" } }),
  }
}

describe("arac1x: 2.x araç adları çekirdeğin beklediği biçime çevrilir", () => {
  test("shell → bash", () => expect(arac1x("shell", { command: "ls", workdir: "/x" })).toEqual({ tool: "bash", args: { command: "ls", workdir: "/x" } }))
  test("write/edit path → filePath", () => expect(arac1x("write", { path: "a.txt", content: "x" }).args.filePath).toBe("a.txt"))
  test("read path → filePath", () => expect(arac1x("read", { path: "/etc/hosts" })).toEqual({ tool: "read", args: { filePath: "/etc/hosts" } }))
  test("patch aynen (patchText)", () => expect(arac1x("patch", { patchText: "p" })).toEqual({ tool: "patch", args: { patchText: "p" } }))
})

describe("kilitler 2.x kancalarında", () => {
  test("K5: yıkıcı komut reddedilir, audit'e denied yazılır", async () => {
    const h = await kur()
    await expect(h.once("s1", "shell", { command: "rm -rf /" })).rejects.toThrow("K5")
    const [r] = satirlar()
    expect(r.result_status).toBe("denied")
    expect(r.policy_decision).toBe("deny")
    expect(r.target).toStartWith("K5")
  })

  test("K1: yetkisiz uzak değişiklik reddedilir; kullanıcı CN+sunucular verince geçer", async () => {
    const h = await kur()
    const komut = { command: "ssh web01 'systemctl restart chronyd'" }
    await expect(h.once("s1", "shell", komut)).rejects.toThrow("K1")
    await h.kullanici("s1", "CN: CHG0000100\nsunucular: web01")
    await h.once("s1", "shell", komut)
    await expect(h.once("s1", "shell", { command: "ssh web02 'systemctl restart chronyd'" })).rejects.toThrow("web02")
    expect(satirlar().some((r) => r.tool === "yetki" && r.cn === "CHG0000100")).toBe(true)
  })

  test("alt ajan oturumu: modelin yazdığı mesaj yetki sayılmaz, kökün yetkisi kullanılır", async () => {
    const h = await kur({ cocuk: { parentID: "kok" }, torun: { parentID: "cocuk" } })
    const komut = { command: "ssh web01 'systemctl restart chronyd'" }
    await h.kullanici("cocuk", "CN: CHG0000999\nsunucular: web01")
    await expect(h.once("cocuk", "shell", komut)).rejects.toThrow("K1")
    await h.kullanici("kok", "CN: CHG0000100\nsunucular: web01")
    await h.once("torun", "shell", komut)
  })

  test("K6: ajanın kendi ayarına yazma ve audit kaydını okuma kapalı", async () => {
    const h = await kur()
    await expect(h.once("s1", "write", { path: `${process.env.HOME}/.config/opencode/opencode.json`, content: "{}" })).rejects.toThrow("K6")
    await expect(h.once("s1", "shell", { command: "sed -i s/a/b/ ~/.config/opencode/opencode.json" })).rejects.toThrow("K6")
  })

  test("salt-okunur komut serbest; after audit satırı zincirlenir", async () => {
    const h = await kur()
    await h.once("s1", "shell", { command: "ssh web01 uptime" })
    await h.sonra("s1", "shell", { command: "ssh web01 uptime" })
    await h.once("s1", "read", { path: "README.md" }, "c2")
    await h.sonra("s1", "read", { path: "README.md" }, "c2")
    const r = satirlar()
    expect(r.map((x) => x.result_status)).toEqual(["ok", "ok"])
    expect(r[0].output_sha256).toBe(sha256("tamam"))
    expect(r[1].prev_hash).toBe(sha256(readFileSync(kayit, "utf8").split("\n")[0]))
  })

  test("paralel çağrılar: her çağrı kendi kilit mesajını alır (2.0.23'te throw ile karışıyordu)", async () => {
    const h = await kur()
    await expect(h.once("s1", "shell", { command: "rm -rf /" }, "a")).rejects.toThrow("K5")
    await expect(h.once("s1", "shell", { command: "ssh web01 'systemctl restart x'" }, "b")).rejects.toThrow("K1")
  })

  test("emniyet kemeri: kilitli çağrı yine de tamamlanırsa audit'e IHLAL yazılır", async () => {
    const s = sahteBaglam()
    await guvenlikKur(s.ctx)
    await s.kancalar["tool.execute.before"]({ tool: "shell", sessionID: "s1", id: "z", input: { command: "rm -rf /" } })
    await s.kancalar["tool.execute.after"]({ tool: "shell", sessionID: "s1", id: "z", input: { command: "rm -rf /" }, status: "completed", result: { content: "" } })
    expect(satirlar().map((r) => r.target.slice(0, 8))).toEqual(["K5 :: rm", "IHLAL K5"])
  })

  test("okuma serbest (Alp, 2026-09-28): audit kaydını ve ayarı okumak kilitlenmez", async () => {
    const h = await kur()
    await h.once("s1", "read", { path: process.env.OPS_AGENT_AUDIT_LOG })
    await h.once("s1", "read", { path: `${process.env.HOME}/.config/opencode/opencode.json` })
  })

  test("gözlem modu (OPS_AGENT_KAPI=GOZLEM): reddetmez, 'asked' yazar", async () => {
    process.env.OPS_AGENT_KAPI = "GOZLEM"
    const h = await kur()
    await h.once("s1", "shell", { command: "rm -rf /" })
    expect(satirlar()[0].result_status).toBe("asked")
  })

  test("yetki kapatılınca tekrar K1", async () => {
    const h = await kur()
    const komut = { command: "ssh web01 'systemctl restart chronyd'" }
    await h.kullanici("s1", "CN: CHG0000100\nsunucular: web01")
    await h.once("s1", "shell", komut)
    await h.kullanici("s1", "yetki kapat")
    await expect(h.once("s1", "shell", komut)).rejects.toThrow("K1")
  })
})
