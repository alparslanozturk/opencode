// dogrula-zincir.test.ts — script/dogrula-audit-zinciri.sh doğrulayıcısının testleri. Eskiden
// audit-log.test.ts'teydi; 1.x adaptörü 2026-10-28'de kaldırılınca buraya taşındı. Zinciri guvenlik-v2.ts'in
// kullandığı aynı yazıcı (lib/denetim.ts denetimYazici) üretir; script bozulan/koparılan zinciri yakalamalı.
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { denetimYazici, sha256 } from "./lib/denetim"

let dizin: string
let kayit: string
beforeEach(() => {
  dizin = mkdtempSync(join(tmpdir(), "zincir-test-"))
  kayit = join(dizin, "audit.jsonl")
  process.env.OPS_AGENT_AUDIT_LOG = kayit
})
afterEach(() => {
  rmSync(dizin, { recursive: true, force: true })
  delete process.env.OPS_AGENT_AUDIT_LOG
})

describe("zincir dogrulayici (C3, script/dogrula-audit-zinciri.sh)", () => {
  const { gzipSync } = require("zlib")
  const betik = join(import.meta.dir, "..", "..", "script", "dogrula-audit-zinciri.sh")
  const dogrula = (...dosyalar: string[]) => {
    const r = Bun.spawnSync(["bash", betik, ...dosyalar])
    return { kod: r.exitCode, cikti: r.stdout.toString() }
  }
  const satirlar = () => readFileSync(kayit, "utf8").split("\n").filter(Boolean)
  // 5 satır gerçek zincir yazar (her testte deterministik: dizin beforeEach'te yeniden kurulur).
  const zincirYaz = (adet = 5) => {
    const yaz = denetimYazici({ projeDizini: dizin, beceriler: () => [] })
    for (let i = 0; i < adet; i++)
      yaz({
        timestamp: new Date().toISOString(),
        sessionID: "s-zincir",
        tool: "bash",
        argsHash: sha256(`ls ${i}`),
        target: `ls dosya${i}`,
        resultStatus: "ok",
        policyDecision: "allow",
        latencyMs: 0,
        outputSha256: null,
      })
  }

  test("yazicinin urettigi gercek zincir saglam cikar", () => {
    zincirYaz()
    const r = dogrula(kayit)
    expect(r.cikti).toContain("SAGLAM")
    expect(r.kod).toBe(0)
  })

  test("degistirilen satir ve silinen satir KOPMA olarak yakalanir", () => {
    zincirYaz()
    const s = satirlar()
    const degisik = join(dizin, "degisik.jsonl")
    writeFileSync(degisik, [...s.slice(0, 2), s[2].replace('"tool":"', '"tool":"x'), ...s.slice(3)].join("\n") + "\n")
    const r1 = dogrula(degisik)
    expect(r1.kod).toBe(1)
    expect(r1.cikti).toContain(`${degisik}:4`)
    const eksik = join(dizin, "eksik.jsonl")
    writeFileSync(eksik, [...s.slice(0, 2), ...s.slice(3)].join("\n") + "\n")
    expect(dogrula(eksik).cikti).toMatch(/KOPMA .*eksik\.jsonl:3/)
  })

  test("dondurulmus (gz) dosya + sifirdan baslayan yeni dosya saglam; eksik ara dosya fark edilir", () => {
    zincirYaz()
    const s = satirlar()
    const eski = join(dizin, "audit-2026-09-24.jsonl.gz")
    writeFileSync(eski, gzipSync(s.join("\n") + "\n"))
    const yeni = join(dizin, "audit.jsonl")
    writeFileSync(yeni, s.slice(0, 3).join("\n") + "\n") // ilk satiri prev_hash=0…0
    expect(dogrula(eski, yeni).kod).toBe(0)
    const ortadan = join(dizin, "ortadan.jsonl")
    writeFileSync(ortadan, s.slice(3).join("\n") + "\n") // ilk satiri onceki dosyaya bagli, o dosya verilmedi
    expect(dogrula(ortadan).cikti).toMatch(/KOPMA .*:1: ilk satir/)
  })

  test("dosya yoksa 2 doner", () => {
    expect(dogrula(join(dizin, "yok.jsonl")).kod).toBe(1)
    const r = Bun.spawnSync(["bash", betik], { env: { ...process.env, OPS_AGENT_AUDIT_LOG: join(dizin, "bos", "a.jsonl") } })
    expect(r.exitCode).toBe(2)
  })
})
