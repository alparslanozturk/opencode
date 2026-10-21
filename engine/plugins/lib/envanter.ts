// envanter.ts — motordan BAĞIMSIZ (ADR-0005): ansible INI envanterinden ad ↔ IP ↔ grup eşlemesi (saha G74).
// Alp (2026-10-20): "IP ya da isim verdiğinde envanterden bunu anlayabilmesi önemli." Kullanıcı yetkide `wor07`,
// `stlrancherwor07`, `10.0.9.127` ya da grup adı yazabilir; ajan komutta başka birini kullanabilir. Kilit, yetki
// VERİLDİĞİ ANDA envanteri okuyup listeyi tüm eş adlarla genişletir (Yetki.esler) — sonradan çalışma dizinindeki
// envanter dosyası (ajan yazabilir) değişse de verilmiş yetki genişlemez.
import { readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"

export interface Envanter {
  hostlar: Map<string, Set<string>> // envanter adı → eş adlar (ad, kısa ad, ansible_host)
  gruplar: Map<string, Set<string>> // grup → doğrudan host adları
  altGruplar: Map<string, Set<string>> // grup → :children grupları
  dosyalar: string[]
}

const BUYUK_DOSYA = 2 * 1024 * 1024

// Ansible host aralığı: web[01:05], 10.0.0.[1:5], db-[a:c] — birden çok köşeli parantez de açılır (en çok 512 ad).
export function ansibleAralik(desen: string): string[] {
  const m = /\[([0-9a-z]+):([0-9a-z]+)(?::(\d+))?\]/i.exec(desen)
  if (!m) return [desen]
  const [bas, son, adim] = [m[1], m[2], Number(m[3] ?? 1) || 1]
  const once = desen.slice(0, m.index)
  const sonra = desen.slice(m.index + m[0].length)
  let ogeler: string[] = []
  if (/^\d+$/.test(bas) && /^\d+$/.test(son)) {
    const gen = bas.length > 1 && bas.startsWith("0") ? bas.length : 0
    for (let i = Number(bas); i <= Number(son) && ogeler.length < 512; i += adim) ogeler.push(String(i).padStart(gen, "0"))
  } else if (/^[a-z]$/i.test(bas) && /^[a-z]$/i.test(son)) {
    for (let c = bas.charCodeAt(0); c <= son.charCodeAt(0); c += adim) ogeler.push(String.fromCharCode(c))
  } else return [desen]
  return ogeler.flatMap((o) => ansibleAralik(once + o + sonra)).slice(0, 512)
}

export function envanterAyristir(metin: string, env: Envanter): void {
  let grup = "ungrouped"
  let tur: "host" | "children" | "vars" = "host"
  for (const ham of metin.split("\n")) {
    const satir = ham.replace(/\s[#;].*$/, "").trim()
    if (!satir || satir.startsWith("#") || satir.startsWith(";")) continue
    const baslik = /^\[([^\]:]+)(?::(children|vars))?\]$/.exec(satir)
    if (baslik) {
      grup = baslik[1].trim().toLowerCase()
      tur = (baslik[2] as "children" | "vars" | undefined) ?? "host"
      continue
    }
    if (tur === "vars") continue
    const [ad, ...degerler] = satir.split(/\s+/)
    if (tur === "children") {
      if (!env.altGruplar.has(grup)) env.altGruplar.set(grup, new Set())
      env.altGruplar.get(grup)!.add(ad.toLowerCase())
      continue
    }
    const ip = degerler.map((d) => /^ansible_(?:ssh_)?host=["']?([^"'\s]+)/.exec(d)?.[1]).find(Boolean)
    for (const h of ansibleAralik(ad.toLowerCase())) {
      if (!env.hostlar.has(h)) env.hostlar.set(h, new Set([h, h.split(".")[0]]))
      // ansible_host yalnız tek host satırında anlamlı (aralıklı satırda hepsine aynı IP yazılmaz)
      if (ip && !ad.includes("[")) env.hostlar.get(h)!.add(ip.toLowerCase())
      if (!env.gruplar.has(grup)) env.gruplar.set(grup, new Set())
      env.gruplar.get(grup)!.add(h)
    }
  }
}

// Çalışma dizinindeki envanterler: ansible/ ve inventories/ altında (3 düzey) *.ini ya da hosts* dosyaları.
// OPS_AGENT_ENVANTER (":" ayrılmış yol listesi) verilirse yalnız onlar okunur.
export function envanterDosyalari(workdir: string): string[] {
  const ortam = process.env.OPS_AGENT_ENVANTER
  if (ortam) return ortam.split(":").filter(Boolean)
  const out: string[] = []
  const gez = (dizin: string, derinlik: number) => {
    let girdiler: string[] = []
    try {
      girdiler = readdirSync(dizin)
    } catch {
      return
    }
    for (const g of girdiler.sort()) {
      if (g.startsWith(".") || g === "node_modules" || g === "roles" || g === "group_vars" || g === "host_vars") continue
      const yol = join(dizin, g)
      let st
      try {
        st = statSync(yol)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (derinlik < 3) gez(yol, derinlik + 1)
      } else if (st.size <= BUYUK_DOSYA && (/\.ini$/i.test(g) || /^hosts/i.test(g)) && !/\.(ya?ml|json|j2|bak|orig)$/i.test(g))
        out.push(yol)
    }
  }
  for (const kok of ["ansible", "inventories", "inventory"]) gez(join(workdir, kok), 1)
  return out.slice(0, 50)
}

export function envanterOku(workdir: string): Envanter {
  const env: Envanter = { hostlar: new Map(), gruplar: new Map(), altGruplar: new Map(), dosyalar: [] }
  for (const d of envanterDosyalari(workdir)) {
    try {
      envanterAyristir(readFileSync(d, "utf8"), env)
      env.dosyalar.push(d)
    } catch {
      /* okunamayan dosya atlanır */
    }
  }
  return env
}

function grupHostlari(env: Envanter, grup: string, gorulen = new Set<string>()): string[] {
  if (gorulen.has(grup)) return []
  gorulen.add(grup)
  return [
    ...(env.gruplar.get(grup) ?? []),
    ...[...(env.altGruplar.get(grup) ?? [])].flatMap((a) => grupHostlari(env, a, gorulen)),
  ]
}

export interface Genisleme {
  esler: string[] // yetki listesi + envanterdeki tüm eş adlar/IP'ler
  bulunamayan: string[] // envanterde karşılığı olmayan (yine de listede kalır)
  belirsiz: string[] // kısa ad birden çok host'a uyuyor — genişletilmedi
  cozulen: string[] // "07-14 → stlrancherwor07…stlrancherwor14" (yetki özetinde görünsün)
}

// Yetki listesindeki her öğe için: grup adı → üye host'lar; envanter adı / kısa adı / IP'si → o host'un tüm eş adları;
// kısa yazım ("wor07") → envanterde adı bununla BİTEN tek host varsa o host (birden çoksa genişletilmez, belirsiz).
export function yetkiGenislet(liste: string[], env: Envanter): Genisleme {
  const esler = new Set(liste)
  const bulunamayan: string[] = []
  const belirsiz: string[] = []
  const cozulen: string[] = []
  if (!env.hostlar.size) return { esler: [...esler], bulunamayan, belirsiz, cozulen }
  const ekle = (h: string) => env.hostlar.get(h)?.forEach((e) => esler.add(e))
  for (const l of liste) {
    if (l === "localhost") continue
    // Yalın numara aralığı "07-14": aralıktaki HER numarayı (yazıldığı genişlikte) karşılayan TEK ad öneki varsa o host'lar.
    const ar = /^(\d{2,3})-(\d{2,3})$/.exec(l)
    if (ar) {
      const [a, z, gen] = [Number(ar[1]), Number(ar[2]), ar[1].length]
      const nolar = z > a && z - a <= 63 ? Array.from({ length: z - a + 1 }, (_, i) => String(a + i).padStart(gen, "0")) : []
      const kisalar = [...env.hostlar.keys()].map((h) => [h, h.split(".")[0]] as const)
      const onekler = new Set(kisalar.filter(([, k]) => k.endsWith(nolar[0] ?? "\0")).map(([, k]) => k.slice(0, -nolar[0].length))
        .filter((o) => /[a-z]$/.test(o)))
      const tutan = [...onekler].filter((o) => nolar.every((n) => kisalar.some(([, k]) => k === o + n)))
      if (nolar.length && tutan.length === 1) {
        kisalar.filter(([, k]) => nolar.some((n) => k === tutan[0] + n)).forEach(([h]) => ekle(h))
        cozulen.push(`${l} → ${tutan[0]}${nolar[0]}…${tutan[0]}${nolar[nolar.length - 1]}`)
      } else if (tutan.length > 1) belirsiz.push(`${l} (${tutan.slice(0, 4).map((o) => o + nolar[0] + "…").join(", ")})`)
      else bulunamayan.push(l)
      continue
    }
    if (env.gruplar.has(l) || env.altGruplar.has(l)) {
      grupHostlari(env, l).forEach(ekle)
      continue
    }
    const tam = [...env.hostlar].filter(([, e]) => e.has(l)).map(([h]) => h)
    if (tam.length) {
      tam.forEach(ekle)
      continue
    }
    const sonek = /\d/.test(l) && l.length >= 3 && !/^[\d.:]+$/.test(l)
      ? [...env.hostlar.keys()].filter((h) => h.split(".")[0].endsWith(l))
      : []
    if (sonek.length === 1) ekle(sonek[0])
    else if (sonek.length > 1) belirsiz.push(`${l} (${sonek.slice(0, 4).join(", ")}${sonek.length > 4 ? " …" : ""})`)
    else bulunamayan.push(l)
  }
  return { esler: [...esler], bulunamayan, belirsiz, cozulen }
}
