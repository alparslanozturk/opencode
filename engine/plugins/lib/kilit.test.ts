// kilit.test.ts — çekirdeğin MOTORDAN BAĞIMSIZ olduğunu gösterir (ADR-0005): opencode kancası, eklenti
// yükleyicisi ya da audit dosyası yok; yalnız girdi → karar. 2.x adaptörü de aynı sözleşmeyi kullanacak.
// Davranışın geniş testi ../audit-log.test.ts'te (1.x adaptörü üzerinden).
import { describe, expect, test } from "bun:test"
import { kilitDenetle, yetkiAktif, yetkiSatirlariniOku, type Yetki } from "./kilit"

const workdir = "/tmp/kilit-cekirdek-proje"
const yetkiVer = (metin: string): Yetki => {
  const s = yetkiSatirlariniOku(metin)
  return { tur: s.tur ?? null, cn: s.cn ?? null, krizMetni: false, sunucular: s.sunucular ?? [], zaman: Date.now() }
}

describe("kilit çekirdeği (motordan bağımsız sözleşme)", () => {
  test("salt-okunur komut → karar yok", () => {
    expect(kilitDenetle("bash", { command: "ssh web01 uptime" }, workdir, undefined)).toBeNull()
  })
  test("yetkisiz değişiklik → K1, yetkiyle → serbest, listede olmayan → K1", () => {
    const k = kilitDenetle("bash", { command: "ssh web01 'systemctl restart x'" }, workdir, undefined)
    expect(k?.kilit).toBe("K1")
    const y = yetkiVer("CN: CHG0000100\nsunucular: web01")
    expect(yetkiAktif(y, Date.now())).toBe(true)
    expect(kilitDenetle("bash", { command: "ssh web01 'systemctl restart x'" }, workdir, y)).toBeNull()
    expect(kilitDenetle("bash", { command: "ssh web02 'systemctl restart x'" }, workdir, y)?.mesaj).toContain("web02")
  })
  test("yıkıcı komut yetkiyle de K5, öz-koruma K6", () => {
    const y = yetkiVer("CN: CHG0000101\nsunucular: localhost")
    expect(kilitDenetle("bash", { command: "rm -rf /" }, workdir, y)?.kilit).toBe("K5")
    expect(kilitDenetle("bash", { command: "cat ~/.config/opencode/opencode.json" }, workdir, y)?.kilit).toBe("K6")
  })
  test("bilinmeyen araç → karar yok (adaptör yalnız tanıdığı araçları sorar)", () => {
    expect(kilitDenetle("webfetch", { url: "https://x" }, workdir, undefined)).toBeNull()
  })
})
