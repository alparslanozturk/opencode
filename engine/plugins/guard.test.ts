// guard.test.ts — GOREV oc-T5 bulgu A: engine/opencode.json bileşik komutla allowlist aşımının
// guard'daki override kararı (classify) + narrowed ps allow kalıplarının wildcard davranışı.
// Hedefli çalıştırma: `bun test engine/plugins/guard.test.ts` (kökten tam `bun test` YASAK).
import { describe, expect, test } from "bun:test"
import { classify, DEFAULT_BASH_ALLOW_PATTERNS, loadBashAllowPatterns, wildcardMatch } from "./guard"

describe("classify — bileşik komut / find / tek komut", () => {
  test("ls; rm -rf /veri → deny (bileşik + yıkıcı fiil, hedefe bakmaksızın)", () => {
    expect(classify("ls; rm -rf /veri")).toBe("deny")
  })

  test("find . -exec sh -c 'x' \\; → ask (tek-dize allowlist ile güvenle değerlendirilemez)", () => {
    expect(classify("find . -exec sh -c 'x' \\;")).toBe("ask")
  })

  test("find . -delete / -execdir / -ok → ask", () => {
    expect(classify("find . -delete")).toBe("ask")
    expect(classify("find . -execdir rm {} \\;")).toBe("ask")
    expect(classify("find . -ok rm {} \\;")).toBe("ask")
  })

  test("ls && ls → allow (bileşik ama her alt komut narrow allowlist'e uyuyor → müdahale yok)", () => {
    expect(classify("ls && ls")).toBe("allow")
  })

  test("düz ls / ps aux → allow (tek komut, müdahale yok — motor kendi kararını verir)", () => {
    expect(classify("ls")).toBe("allow")
    expect(classify("ps aux")).toBe("allow")
  })

  test("bileşik komutta güvenli olmayan bir alt komut varsa (allowlist'te yok) → ask", () => {
    expect(classify("ls && curl http://x")).toBe("ask")
  })

  test("komut ikamesi $(...) / `...` → ask (çalışma zamanında ne olacağı belli değil)", () => {
    expect(classify("ls $(cat /etc/hostname)")).toBe("ask")
    expect(classify("echo `whoami`")).toBe("ask")
  })

  test("systemctl stop/mkfs/dd/shutdown/reboot bileşik içinde → deny", () => {
    expect(classify("ls && systemctl stop sshd")).toBe("deny")
    expect(classify("ls && mkfs.ext4 /dev/sdb1")).toBe("deny")
    expect(classify("ls && dd if=/dev/zero of=/dev/sda")).toBe("deny")
    expect(classify("ls && shutdown -h now")).toBe("deny")
    expect(classify("ls && reboot")).toBe("deny")
  })
})

describe("ps allowlist daraltması — psql artık ps* ile eşleşmiyor", () => {
  test("psql -c ... → hiçbir narrow ps kalıbına uymaz (allowlist'ten geçmez → motor 'ask'e düşer)", () => {
    const matched = DEFAULT_BASH_ALLOW_PATTERNS.some((p) => wildcardMatch("psql -c 'select 1'", p))
    expect(matched).toBe(false)
  })

  test("düz 'ps' ve 'ps aux' narrow kalıplara uyar", () => {
    expect(DEFAULT_BASH_ALLOW_PATTERNS.some((p) => wildcardMatch("ps", p))).toBe(true)
    expect(DEFAULT_BASH_ALLOW_PATTERNS.some((p) => wildcardMatch("ps aux", p))).toBe(true)
    expect(DEFAULT_BASH_ALLOW_PATTERNS.some((p) => wildcardMatch("ps -ef", p))).toBe(true)
    expect(DEFAULT_BASH_ALLOW_PATTERNS.some((p) => wildcardMatch("ps -o pid,cmd", p))).toBe(true)
  })

  test("gerçek engine/opencode.json'daki (kur.sh ile kurulan) ps kalıpları da psql'i açmıyor", () => {
    const projectDir = new URL("../..", import.meta.url).pathname
    const patterns = loadBashAllowPatterns(projectDir)
    expect(patterns.some((p) => wildcardMatch("psql -c 'select 1'", p))).toBe(false)
    expect(patterns.some((p) => wildcardMatch("ps aux", p))).toBe(true)
  })
})
