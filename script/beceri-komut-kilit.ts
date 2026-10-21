// beceri-komut-kilit.ts — becerilerdeki SABİT okuma komutlarının (deterministik betiğe borulanan ya da `ansible … -t cikti/…`
// ile tree yazan satırlar) güvenlik kilidinden geçtiğini doğrular. Saha G67/G68'de becerideki okuma komutları kilide takılıyordu;
// 2026-10-21'de `case … esac` içeren bir satır ve `wipefs -n` K1/K5'e düştü — bu test o sınıfı yakalar.
// Kullanım: bun script/beceri-komut-kilit.ts   (çıkış 0 = hepsi geçti)
import { readdirSync, readFileSync } from "fs"
import { join } from "path"
import { kilitDenetle } from "../engine/plugins/lib/kilit"

const KOK = join(import.meta.dir, "..")
const BECERI = join(KOK, "knowledge/skills/approved")
const ISARET = [/python3 \/root\/ai\/opencode\/knowledge\/skills\/approved\//, /-t cikti\//]
// yer tutucular: <master>, <grup>, <ad1,ad2,|grup>, <sertifika-dizini> … → sahte değer (küçük harfli, boşluksuz)
const yerTutucu = (s: string) => s.replace(/<[a-zçğıöşü0-9_|,.\-]+>/g, "ornek01")

let gecen = 0
let kalan = 0
let sablon = 0
for (const ad of readdirSync(BECERI).sort()) {
  let metin: string
  try {
    metin = readFileSync(join(BECERI, ad, "SKILL.md"), "utf8")
  } catch {
    continue
  }
  const satirlar: string[] = []
  // kod blokları + satır içi `…` parçaları
  for (const m of metin.matchAll(/```bash\n([\s\S]*?)```/g)) satirlar.push(...m[1].split("\n"))
  for (const m of metin.matchAll(/`([^`\n]{20,})`/g)) satirlar.push(m[1])
  for (const ham of satirlar) {
    const s = ham.replace(/\s+#\s.*$/, "").trim()
    if (!/^(ssh |ansible |kubectl |python3 )/.test(s) || !ISARET.some((r) => r.test(s))) continue
    if (/-a '(<[^']*>|…)'/.test(s)) {
      sablon++ // çalıştırılacak komutu kullanıcı/ajan yazar — kilit o komutu ayrıca görür
      continue
    }
    const komut = yerTutucu(s)
    const karar = kilitDenetle("bash", { command: komut }, "/root/ai/work/opencode", undefined)
    if (karar === null) gecen++
    else {
      kalan++
      console.log(`  KALDI  ${ad}: ${karar.kilit} — ${s.slice(0, 110)}`)
    }
  }
}
console.log(`  sabit beceri komutu: ${gecen} kilitten geçti · ${kalan} takıldı · ${sablon} şablon satırı atlandı`)
process.exit(kalan === 0 && gecen > 0 ? 0 : 1)
