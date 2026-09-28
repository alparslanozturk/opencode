// Kurum fork'u (2026-09-28): araç izin sınırı Claude Code'daki gibi yalnız açılış dizini.
import { describe, expect, test } from "bun:test"
import { containsPath, insideWorkingDirectory, type InstanceContext } from "../../src/project/instance-context"

const ctx = { directory: "/root/ansible/nisa", worktree: "/root/ansible", project: {} } as unknown as InstanceContext

describe("insideWorkingDirectory", () => {
  test("açılış dizini ve altı içeride", () => {
    expect(insideWorkingDirectory("/root/ansible/nisa", ctx)).toBe(true)
    expect(insideWorkingDirectory("/root/ansible/nisa/hosts.ini", ctx)).toBe(true)
  })
  test("git kökünün geri kalanı dışarıda (izin sorulur)", () => {
    expect(insideWorkingDirectory("/root/ansible/diger/hosts.ini", ctx)).toBe(false)
    expect(insideWorkingDirectory("/root/ansible", ctx)).toBe(false)
    expect(insideWorkingDirectory("/etc/passwd", ctx)).toBe(false)
  })
  test("containsPath (config/lsp proje sınırı) değişmedi", () => {
    expect(containsPath("/root/ansible/diger/hosts.ini", ctx)).toBe(true)
  })
})
