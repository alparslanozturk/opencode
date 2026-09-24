// audit-log.test.ts — T13/A34 birim testleri (gizli desen redaksiyonu + hassas dosya denylist'i).
// Hedefli çalıştırma: `bun test engine/plugins/audit-log.test.ts` (kökten tam `bun test`/`bun turbo
// typecheck` YASAK — bkz. AGENTS.md "Root'tan tam typecheck/build ÇALIŞTIRMA").
// Gerçek IP/host/parola yok — hepsi uydurma test verisi (THREAT-MODEL.md maskeleme kuralı testte de geçerli).
import { afterAll, describe, expect, test } from "bun:test"
import { createHash } from "crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const workDir = mkdtempSync(join(tmpdir(), "audit-log-test-"))
const auditPath = join(workDir, "audit.jsonl")
process.env.OPS_AGENT_AUDIT_LOG = auditPath

// Modül üst-seviye AUDIT_LOG_PATH sabiti import anında donuyor — bu yüzden env değişkeni import'tan
// ÖNCE ayarlanmalı (dynamic import, ESM hoisting'i atlamak için).
const { AuditLogPlugin } = await import("./audit-log")

afterAll(() => rmSync(workDir, { recursive: true, force: true }))

function readAllLines(): any[] {
  if (!existsSync(auditPath)) return []
  return readFileSync(auditPath, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l))
}

function assertChainIntact() {
  const raw = readFileSync(auditPath, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
  for (let i = 1; i < raw.length; i++) {
    const prevHash = JSON.parse(raw[i]).prev_hash
    expect(prevHash).toBe(createHash("sha256").update(raw[i - 1]).digest("hex"))
  }
}

async function freshPlugin(opts: { enforce?: boolean; projectDir?: string } = {}) {
  if (opts.enforce) process.env.OPS_AGENT_KAPI = "ENFORCE"
  else delete process.env.OPS_AGENT_KAPI
  const dir = opts.projectDir ?? workDir
  return AuditLogPlugin({ directory: dir, project: { worktree: dir } } as any)
}

describe("gizli desen redaksiyonu (A34)", () => {
  test("env icindeki parola hem tool ciktisinda hem audit'te maskelenir, zincir bozulmaz", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin()
    const args = { command: "cat env" }
    const beforeOut = { args }
    await hooks["tool.execute.before"]!({ tool: "bash", sessionID: "s-env", callID: "c-env" }, beforeOut)
    const afterOut = { title: "env", output: "DB_PASSWORD=Sifre!2026\nOK=1", metadata: {} }
    await hooks["tool.execute.after"]!(
      { tool: "bash", sessionID: "s-env", callID: "c-env", args },
      afterOut,
    )

    expect(afterOut.output).not.toContain("Sifre!2026")
    expect(afterOut.output).toContain("[REDACTED:password]")

    const lines = readAllLines().slice(before)
    expect(JSON.stringify(lines)).not.toContain("Sifre!2026")
    expect(lines.some((l) => l.record_type === "redacted" && l.tool === "bash")).toBe(true)
    assertChainIntact()
  })

  test("hosts envanteri icindeki parola satiri maskelenir", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin()
    const args = { filePath: "notes.txt" }
    await hooks["tool.execute.before"]!({ tool: "read", sessionID: "s-hosts", callID: "c-hosts" }, { args })
    const afterOut = {
      title: "notes.txt",
      output: "web01 ansible_user=root ansible_password=GercekSifre123",
      metadata: {},
    }
    await hooks["tool.execute.after"]!(
      { tool: "read", sessionID: "s-hosts", callID: "c-hosts", args },
      afterOut,
    )

    expect(afterOut.output).not.toContain("GercekSifre123")
    expect(afterOut.output).toContain("[REDACTED:password]")
    const lines = readAllLines().slice(before)
    expect(JSON.stringify(lines)).not.toContain("GercekSifre123")
    assertChainIntact()
  })

  test("SSH private key basligi (ve govdesi) redakte edilir", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin()
    const args = { filePath: "id_rsa" }
    await hooks["tool.execute.before"]!({ tool: "read", sessionID: "s-key", callID: "c-key" }, { args })
    const keyBody = "-----BEGIN OPENSSH PRIVATE KEY-----\nuydurma-govde-tabanindanAAAA\n-----END OPENSSH PRIVATE KEY-----"
    const afterOut = { title: "id_rsa", output: keyBody, metadata: {} }
    await hooks["tool.execute.after"]!({ tool: "read", sessionID: "s-key", callID: "c-key", args }, afterOut)

    expect(afterOut.output).toBe("[REDACTED:private_key]")
    expect(afterOut.output).not.toContain("uydurma-govde-tabanindanAAAA")
    const lines = readAllLines().slice(before)
    expect(JSON.stringify(lines)).not.toContain("uydurma-govde-tabanindanAAAA")
    assertChainIntact()
  })

  test("KURUM_KEY=deger bicimi (genel KEY= ayraci) maskelenir", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin()
    const args = { command: "env | grep KURUM_KEY" }
    await hooks["tool.execute.before"]!({ tool: "bash", sessionID: "s-key2", callID: "c-key2" }, { args })
    const afterOut = { title: "bash", output: "KURUM_KEY=uydurma-anahtar-degeri-123", metadata: {} }
    await hooks["tool.execute.after"]!({ tool: "bash", sessionID: "s-key2", callID: "c-key2", args }, afterOut)

    expect(afterOut.output).not.toContain("uydurma-anahtar-degeri-123")
    expect(afterOut.output).toBe("KURUM_KEY=[REDACTED:key]")
    assertChainIntact()
  })
})

describe("hassas dosya denylist'i (A34+A35)", () => {
  test("gozlem modu: envanter dosyasi uyari + tam redaksiyon, sert blok yok", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin({ enforce: false })
    const args = { filePath: "/kapsam-disi/ansible/hosts-k8s-master.ini" }
    await hooks["tool.execute.before"]!({ tool: "read", sessionID: "s-deny1", callID: "c-deny1" }, { args })
    const afterOut = { title: "hosts", output: "web01 ansible_host=<IP-yer-tutucu>", metadata: {} }
    await hooks["tool.execute.after"]!(
      { tool: "read", sessionID: "s-deny1", callID: "c-deny1", args },
      afterOut,
    )

    expect(afterOut.output).toContain("[REDACTED: hassas dosya")
    expect(afterOut.output).not.toContain("ansible_host")
    const lines = readAllLines().slice(before)
    expect(lines.some((l) => l.record_type === "redacted" && l.tool === "read")).toBe(true)
    expect(lines.every((l) => l.result_status !== "denied")).toBe(true)
    assertChainIntact()
  })

  test("ENFORCE modu: envanter dosyasi calisilmadan reddedilir", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin({ enforce: true })
    const args = { filePath: "/kapsam-disi/ansible/hosts-k8s-master.ini" }
    await expect(
      hooks["tool.execute.before"]!({ tool: "read", sessionID: "s-deny2", callID: "c-deny2" }, { args }),
    ).rejects.toThrow(/denylist/)

    const lines = readAllLines().slice(before)
    expect(lines.length).toBe(1)
    expect(lines[0].result_status).toBe("denied")
    expect(lines[0].policy_decision).toBe("deny")
    assertChainIntact()
  })

  test("desen bos/okunamaz config'te varsayilan denylist'e duser (fail-closed)", async () => {
    // projectDir workDir'de engine/opencode.json yok -> loadDenylistPatterns() varsayilana duser.
    const before = readAllLines().length
    const hooks = await freshPlugin({ enforce: true, projectDir: workDir })
    const args = { filePath: "sirket.vault" }
    await expect(
      hooks["tool.execute.before"]!({ tool: "read", sessionID: "s-deny3", callID: "c-deny3" }, { args }),
    ).rejects.toThrow(/denylist/)
    const lines = readAllLines().slice(before)
    expect(lines[0].result_status).toBe("denied")
  })
})
