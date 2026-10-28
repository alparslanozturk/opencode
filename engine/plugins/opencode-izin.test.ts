// opencode-izin.test.ts — engine/opencode.json izin bloğunun (K2/K3/K4/K5) motorun wildcard eşlemesiyle
// tutarlılığını doğrular. Bu testler eskiden audit-log.test.ts'teydi; 1.x adaptörü 2026-10-28'de kaldırılınca
// buraya taşındı. Config sahaya kurulur — yanlış bir kalıp "sorusuz çalışan" yıkıcı komut üretir.
import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"

describe("izin blogu (engine/opencode.json) — K3/K4", async () => {
  const { match } = await import("../../packages/core/src/util/wildcard")
  const cfg = JSON.parse(readFileSync(join(import.meta.dir, "..", "opencode.json"), "utf8")).permission
  // motorun kendi kuralı: permission.ts evaluate → findLast
  const karar = (izin: string, desen: string) => {
    const v = cfg[izin]
    if (typeof v === "string") return v
    return (Object.entries(v) as [string, string][]).findLast(([p]) => match(desen, p))?.[1] ?? "ask"
  }
  test("K4: onceki acik kalan komutlar artik sorulmadan calismaz", () => {
    for (const k of ["ssh web01 'rm -rf /data'", "psql -c 'drop table x'", "find . -delete", "hostname yeniad",
      "date -s '2020-01-01'", "ip addr del 10.0.0.1/24 dev eth0", "ip route del default", "journalctl --vacuum-time=1d",
      "sshpass -p x ssh h", "dfx", "lsof"])
      expect([k, karar("bash", k)]).not.toEqual([k, "allow"])
  })
  test("K4: salt-okunur gunluk komutlar hala sorusuz", () => {
    for (const k of ["ls -la", "ss -tlnp", "ps aux", "df -h", "hostname", "hostname -f", "date", "date +%F",
      "ip a", "ip route", "systemctl status sshd", "git status", "journalctl -u sshd -n 50", "uptime"])
      expect([k, karar("bash", k)]).toEqual([k, "allow"])
  })
  test("K5: rm -rf yazimlari reddedilir", () => {
    for (const k of ["rm -rf x", "rm -fr x", "rm -Rf x", "rm -r -f x", "rm -f -r x", "git push --force", "git push -f origin main"])
      expect([k, karar("bash", k)]).toEqual([k, "deny"])
  })
  test("K3 (A105): okuma kapsam ici/disi ayrimi olmadan tamamen serbest", () => {
    expect(karar("read", "knowledge/x.md")).toBe("allow")
    expect(karar("read", "notlar/x.md")).toBe("allow")
    expect(karar("read", "playbooks/site.yml")).toBe("allow")
    expect(karar("read", "AGENTS.md")).toBe("allow")
    // A105: engine/opencode.json'daki read denylist'i (*opencode.json*/*auth.json) kaldirildi —
    // canli ayar dosyasi hala korunur ama K6 (plugin, korunanYol) uzerinden, bkz. guvenlik-v2.test.ts "K6".
    expect(karar("read", "opencode.json")).toBe("allow")
    expect(karar("read", "auth.json")).toBe("allow")
    expect(karar("bash", "cat /etc/passwd")).toBe("ask")
    expect(karar("bash", "cat hosts.ini")).toBe("ask")
    expect(karar("bash", "grep -r pass .")).toBe("ask")
    expect(karar("grep", "*")).toBe("allow")
    expect(karar("glob", "*")).toBe("allow")
    expect(karar("list", ".")).toBe("allow")
  })
  test("K2: dizin disi sorulur; K6: ayar dosyasi duzenlenemez", () => {
    expect(cfg.external_directory).toBe("ask")
    expect(karar("edit", "opencode.json")).toBe("deny")
    expect(karar("edit", ".opencode/plugins/x.ts")).toBe("deny")
    expect(karar("edit", "playbooks/x.yml")).toBe("ask")
  })
})
