// kilit.ts — motordan BAĞIMSIZ çekirdek: güvenlik kilitleri K1/K5/K6 (ADR-0004) + yetki satırı okuma.
// ADR-0005: motor kancasına bağlı hiçbir şey yok — girdi (araç adı, argümanlar, çalışma dizini, yetki) alır,
// karar döndürür. 1.x adaptörü: ../audit-log.ts (tool.execute.before + chat.message); 2.x: tool "execute.before"
// + session "prompt" (+ istenirse permission "evaluate" ile "sor").
import { readFileSync } from "fs"
import { hostname, userInfo } from "os"
import { dirname, isAbsolute, join, resolve } from "path"
import { isInside } from "./maskele"

// Audit log yolu: ajanın kendi kaydı K6 ile korunur. Adaptörle aynı kaynaktan (ortam değişkeni) okunur.
export const auditLogYolu = () => process.env.OPS_AGENT_AUDIT_LOG ?? "/var/log/ops-agent/audit.jsonl"

// --- güvenlik kilitleri (K1-K7, ADR-0004, knowledge/policy/GUVENLIK-KILITLERI.md) ------------
// Neden izin bloğu değil de burası: opencode'da oturumda verilen tek bir "always" onayı (ör. `rm a.txt`
// → oturuma `rm *` allow kuralı) config'teki deny desenlerini EZER (permission/index.ts `evaluate` →
// `findLast`, onaylar ruleset'ten sonra gelir). Kilitler bu yüzden before-hook'ta sert red (throw)
// olarak durur: kullanıcının "always"ı da modelin isteği de bunları açamaz. K1'i yalnız kullanıcının
// KENDİ mesajındaki yetki satırı açar (chat.message — model bu kanala yazamaz); K5/K6 hiç açılmaz.
//
//   K1 değişiklik kilidi: sunucuda/sistemde değişiklik = CN + sunucu listesi (ya da KURULUM + liste,
//      ya da KRİZ + yapıştırılmış kriz maili/toplantı notu + liste). Hedef listede değilse red.
//   K5 yıkıcı komut kilidi: `rm -rf /`, mkfs, diske dd, force-push … yetkiyle bile açılmaz.
//   K6 öz-koruma: model kendi ayarını/eklentisini/audit log'unu değiştiremez, ayar dosyasındaki
//      anahtarı okuyamaz, kilitsiz ikinci bir opencode başlatamaz.
//   (K2 dizin dışı, K3 okuma, K4 izin listesi = engine/opencode.json `permission` bloğu.)

export type YetkiTur = "CN" | "KURULUM" | "KRIZ"
export interface Yetki {
  tur: YetkiTur | null
  cn: string | null
  krizMetni: boolean
  sunucular: string[]
  zaman: number
}
export const YETKI_OMRU_MS = 12 * 60 * 60 * 1000
// Kriz mesajında yetki satırları dışında en az bu kadar metin (yapıştırılmış mail/toplantı notu) olmalı.
export const KRIZ_METNI_MIN = 120

// Türkçe büyük harf: JS /i bayrağı İ/ı'yı I/i ile eşlemez — önce tek biçime çekilir.
export const buyuk = (s: string) => s.replace(/İ/g, "I").replace(/ı/g, "i").toUpperCase()

export interface YetkiSatiri {
  tur?: YetkiTur
  cn?: string
  sunucular?: string[]
  kapat?: boolean
  govde: number
}

export function yetkiSatirlariniOku(text: string): YetkiSatiri {
  const out: YetkiSatiri = { govde: 0 }
  for (const hamSatir of text.split("\n")) {
    // "- CN: …", "**CN:** …", "> KRİZ", tırnaklı satır (opencode run mesajı tırnaklar) → çıplak satır
    const satir = hamSatir
      .replace(/\*\*|__/g, "")
      .replace(/^[\s"'`*>#•-]+/, "")
      .replace(/["'`\s]+$/, "")
    const b = buyuk(satir.trim())
    if (!b) continue
    let anahtar = false
    if (/^YETKI\s+(KAPAT|BITTI|IPTAL)\b/.test(b)) {
      out.kapat = true
      anahtar = true
    }
    const cn = /^CN\s*[:#=]?\s*([A-Z0-9][A-Z0-9_./-]*)/.exec(b)
    if (cn && /\d/.test(cn[1])) {
      out.tur = "CN"
      out.cn = cn[1]
      anahtar = true
    }
    // T30 (Alp, 2026-09-30): "büyük ya da küçük harf fark etmez, kurulum yapacağım dediği zaman anlaması lazım".
    // Kelime cümlenin herhangi bir yerinde, harf duyarsız (b zaten Türkçe-uyumlu büyük harf). Ekli biçimler
    // (kurulumu, kurulumda …) ve olumsuz cümle ("kurulum yapmayacağım") beyan sayılmaz. Sunucu listesi yine şart.
    if (/(^|[^A-Z0-9ÇĞÖŞÜ])KURULUM(?![A-Z0-9ÇĞÖŞÜ])(?!\s+YAPMA)/.test(b)) {
      out.tur = "KURULUM"
      anahtar = true
    }
    if (/^KRIZ\b/.test(b)) {
      out.tur = "KRIZ"
      anahtar = true
    }
    // anahtar sözcüklerde İ/ı yok → /i yeterli; değerler ham satırdan alınır
    const liste = /(?:^|\s)(?:sunucular|sunucu|hedefler|hedef)\s*[:=]\s*(.+)$/i.exec(satir.trim())
    if (liste) {
      out.sunucular = liste[1]
        .split(/[\s,;]+/)
        .map(normHost)
        .filter((h) => h.length > 0)
        .slice(0, 200)
      anahtar = true
    }
    if (!anahtar) out.govde += satir.trim().length
  }
  return out
}

export function normHost(h: string): string {
  const n = h
    .trim()
    .replace(/^.*@/, "")
    .replace(/\.$/, "")
    .toLowerCase()
  // `$h`, `{}`, `$(...)` gibi çalışma anında belli olan hedef denetlenemez → "?" (hedef belirsiz)
  return /[${}*]/.test(n) && !/^[a-z0-9._-]*\*[a-z0-9._-]*$/.test(n) ? "?" : n
}

export function yetkiAktif(y: Yetki | undefined, now: number): y is Yetki & { tur: YetkiTur } {
  if (!y || !y.tur || y.sunucular.length === 0) return false
  if (now - y.zaman > YETKI_OMRU_MS) return false
  if (y.tur === "CN") return Boolean(y.cn)
  if (y.tur === "KRIZ") return y.krizMetni
  return true
}

export function yetkiOzeti(y: Yetki): string {
  const bas = y.tur === "CN" ? `CN ${y.cn}` : y.tur === "KRIZ" ? "KRİZ" : "KURULUM"
  return `${bas}: ${y.sunucular.join(", ")}`
}

export const YERELLER = () => {
  const h = hostname().toLowerCase()
  return new Set(["localhost", "127.0.0.1", "::1", h, h.split(".")[0]])
}

export function hostListede(hedef: string, liste: string[]): boolean {
  const h = normHost(hedef)
  if (h === "localhost") {
    const yerel = YERELLER()
    return liste.some((l) => yerel.has(l))
  }
  const ip = /^[\d.:]+$/.test(h)
  return liste.some((l) => l === h || (!ip && !/^[\d.:]+$/.test(l) && l.split(".")[0] === h.split(".")[0]))
}

// --- kabuk komutu ayrıştırma (bağımlılıksız, "yeterince doğru") ---
// Amaç tam bir bash ayrıştırıcısı değil: alt komutları (; && || | & yeni satır), tırnakları,
// $(…)/`…` iç komutlarını, yönlendirme hedeflerini ve heredoc gövdelerini ayırmak. Şüphede kilit
// tarafında kalınır (bilinmeyen uzak komut = değişiklik sayılır).

export interface Komut {
  argv: string[]
  yazilan: string[] // > / >> / &> hedefleri
}

export function eslesenParantez(src: string, start: number): [string, number] {
  let derinlik = 1
  let i = start
  while (i < src.length) {
    const c = src[i]
    if (c === "\\") {
      i += 2
      continue
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1)
      i = j < 0 ? src.length : j + 1
      continue
    }
    if (c === '"') {
      i++
      while (i < src.length && src[i] !== '"') i += src[i] === "\\" ? 2 : 1
      i++
      continue
    }
    if (c === "(") derinlik++
    if (c === ")") {
      derinlik--
      if (derinlik === 0) return [src.slice(start, i), i + 1]
    }
    i++
  }
  return [src.slice(start), src.length]
}

export function ayristir(src: string, ic: string[]): Komut[] {
  const out: Komut[] = []
  let argv: string[] = []
  let yazilan: string[] = []
  let tok = ""
  let tokVar = false
  let hedef: "yok" | "yaz" | "oku" = "yok"
  const heredoc: { son: string; girinti: boolean }[] = []

  const bitirTok = () => {
    if (!tokVar) return
    if (hedef === "yaz") yazilan.push(tok)
    else if (hedef === "yok") argv.push(tok)
    hedef = "yok"
    tok = ""
    tokVar = false
  }
  const bitirKomut = () => {
    bitirTok()
    if (argv.length || yazilan.length) out.push({ argv, yazilan })
    argv = []
    yazilan = []
    hedef = "yok"
  }

  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === "\\" && i + 1 < src.length) {
      if (src[i + 1] !== "\n") {
        tok += src[i + 1]
        tokVar = true
      }
      i += 2
      continue
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1)
      const son = j < 0 ? src.length : j
      tok += src.slice(i + 1, son)
      tokVar = true
      i = son + 1
      continue
    }
    if (c === '"') {
      i++
      tokVar = true
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < src.length) {
          tok += src[i + 1]
          i += 2
          continue
        }
        if (src[i] === "$" && src[i + 1] === "(") {
          const [inner, j] = eslesenParantez(src, i + 2)
          ic.push(inner)
          tok += "$(...)"
          i = j
          continue
        }
        if (src[i] === "`") {
          const j = src.indexOf("`", i + 1)
          const son = j < 0 ? src.length : j
          ic.push(src.slice(i + 1, son))
          tok += "$(...)"
          i = son + 1
          continue
        }
        tok += src[i]
        i++
      }
      i++
      continue
    }
    if ((c === "$" || c === "<" || c === ">") && src[i + 1] === "(") {
      // $(…) komut ikamesi, <(…)/>(…) süreç ikamesi
      const [inner, j] = eslesenParantez(src, i + 2)
      ic.push(inner)
      tok += "$(...)"
      tokVar = true
      i = j
      continue
    }
    if (c === "`") {
      const j = src.indexOf("`", i + 1)
      const son = j < 0 ? src.length : j
      ic.push(src.slice(i + 1, son))
      tok += "$(...)"
      tokVar = true
      i = son + 1
      continue
    }
    if (c === "#" && !tokVar) {
      while (i < src.length && src[i] !== "\n") i++
      continue
    }
    if (c === " " || c === "\t") {
      bitirTok()
      i++
      continue
    }
    if (c === "\n") {
      bitirKomut()
      i++
      // heredoc gövdesi komut değildir — sınırlayıcı satırına kadar atla
      while (heredoc.length) {
        const h = heredoc.shift()!
        while (i < src.length) {
          const nl = src.indexOf("\n", i)
          const satir = src.slice(i, nl < 0 ? src.length : nl)
          i = nl < 0 ? src.length : nl + 1
          if ((h.girinti ? satir.trim() : satir) === h.son) break
        }
      }
      continue
    }
    if (c === ";" || c === "(" || c === ")" || c === "{" || c === "}") {
      if ((c === "{" || c === "}") && tokVar) {
        tok += c
        i++
        continue
      }
      bitirKomut()
      i++
      continue
    }
    if (c === "&") {
      if (src[i + 1] === ">") {
        bitirTok()
        hedef = "yaz"
        i += src[i + 2] === ">" ? 3 : 2
        continue
      }
      bitirKomut()
      i += src[i + 1] === "&" ? 2 : 1
      continue
    }
    if (c === "|") {
      bitirKomut()
      i += src[i + 1] === "|" || src[i + 1] === "&" ? 2 : 1
      continue
    }
    if (c === ">") {
      if (tokVar && /^\d+$/.test(tok)) {
        tok = ""
        tokVar = false
      } else bitirTok()
      let j = i + 1
      if (src[j] === ">" || src[j] === "|") j++
      if (src[j] === "&") {
        j++
        while (j < src.length && /[0-9-]/.test(src[j])) j++
        i = j
        continue
      }
      hedef = "yaz"
      i = j
      continue
    }
    if (c === "<") {
      if (tokVar && /^\d+$/.test(tok)) {
        tok = ""
        tokVar = false
      } else bitirTok()
      if (src[i + 1] === "<" && src[i + 2] !== "<") {
        // heredoc: <<EOF / <<-EOF / <<'EOF'
        let j = i + 2
        const girinti = src[j] === "-"
        if (girinti) j++
        while (src[j] === " ") j++
        const m = /^(['"]?)([A-Za-z0-9_]+)\1/.exec(src.slice(j))
        if (m) {
          heredoc.push({ son: m[2], girinti })
          i = j + m[0].length
        } else i = j
        continue
      }
      hedef = "oku"
      i += src[i + 1] === "<" ? 3 : 1
      continue
    }
    tok += c
    tokVar = true
    i++
  }
  bitirKomut()
  return out
}

export const taban = (p: string) => p.split("/").pop() ?? p

// sudo/env/timeout/nohup/xargs gibi sarmalayıcıları ve VAR=değer öneklerini soy.
export function sarmalayiciSoy(argv: string[]): { argv: string[]; xargs: boolean } {
  const a = [...argv]
  let xargs = false
  const secenekAt = (degerli: (o: string) => boolean) => {
    while (a.length && a[0].startsWith("-") && a[0] !== "-") {
      const o = a.shift()!
      if (o === "--") break
      if (degerli(o)) a.shift()
    }
  }
  while (a.length) {
    const p = taban(a[0])
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0])) {
      a.shift()
      continue
    }
    // `for h in …; do ssh $h …; done` → "do ssh …": anahtar sözcük komut adı değildir
    if (["do", "then", "else", "elif", "if", "while", "until", "!"].includes(a[0])) {
      a.shift()
      continue
    }
    if (p === "sshpass") {
      a.shift()
      secenekAt((o) => ["-p", "-f", "-d", "-P"].includes(o))
      continue
    }
    if (p === "sudo" || p === "doas") {
      a.shift()
      secenekAt((o) => /^-[ugCDhpRrTt]$/.test(o) || ["--user", "--group", "--prompt", "--chdir"].includes(o))
      continue
    }
    if (p === "env") {
      a.shift()
      while (a.length && (a[0].startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0]))) {
        const o = a.shift()!
        if (["-u", "-C", "-S", "--unset", "--chdir"].includes(o)) a.shift()
      }
      continue
    }
    if (p === "nice" || p === "ionice") {
      a.shift()
      secenekAt((o) => ["-n", "-c", "-p", "--adjustment"].includes(o))
      continue
    }
    if (p === "timeout") {
      a.shift()
      secenekAt((o) => ["-s", "-k", "--signal", "--kill-after"].includes(o))
      a.shift() // süre
      continue
    }
    if (["nohup", "time", "command", "exec", "builtin", "stdbuf", "setsid", "unbuffer"].includes(p)) {
      a.shift()
      secenekAt(() => false)
      continue
    }
    if (p === "xargs") {
      a.shift()
      xargs = true
      secenekAt((o) => /^-[IdEeLnPsa]$/.test(o))
      continue
    }
    break
  }
  return { argv: a, xargs }
}

export const SISTEM_KOKLERI = new Set([
  "/", "/bin", "/boot", "/dev", "/etc", "/home", "/lib", "/lib64", "/media", "/mnt", "/opt",
  "/proc", "/root", "/run", "/sbin", "/srv", "/sys", "/usr", "/var",
])
export const BLOK_AYGIT_RE = /^\/dev\/(sd|hd|vd|xvd|nvme|mmcblk|mapper\/|dm-|md|loop|disk\/)/

export interface Baglam {
  workdir: string
  cwd: string
  home: string
  uzak: string | null // null = bu makine
  derinlik: number
}

export function yolCoz(p: string, b: Baglam): string {
  let x = p
  if (x === "~" || x.startsWith("~/")) x = b.home + x.slice(1)
  return isAbsolute(x) ? resolve(x) : resolve(b.cwd, x)
}

export function serbestYazmaAlani(abs: string, b: Baglam): boolean {
  return (
    isInside(b.workdir, abs) ||
    isInside("/tmp", abs) ||
    isInside("/var/tmp", abs) ||
    ["/dev/null", "/dev/stdout", "/dev/stderr", "/dev/tty"].includes(abs) ||
    abs.startsWith("/dev/fd/") ||
    abs.startsWith("/dev/tcp/") || // bash port testi (`echo > /dev/tcp/host/22`), dosya değil
    abs.startsWith("/dev/udp/") ||
    abs.startsWith("/proc/self/")
  )
}

// Silme/izin değiştirme için "asla" kökler: /, sistem kökleri, ev dizinleri, çalışma dizininin kendisi/ataları.
export function tehlikeliKok(raw: string, b: Baglam, silme: boolean): boolean {
  if (/^\$/.test(raw) || raw.includes("$(...)")) return true // boş değişken → `rm -rf /` klasiği
  const yalin = raw.replace(/\/\*$/, "").replace(/\/+$/, "") || "/"
  if (silme && ["*", ".", "..", "./*", "../*"].includes(raw)) return true
  if (yalin === "~" || raw === "~/*") return true
  if (b.uzak !== null && !isAbsolute(yalin)) return false
  const abs = yolCoz(yalin, b)
  if (SISTEM_KOKLERI.has(abs)) return true
  if (/^\/(home|root)(\/[^/]+)?$/.test(abs)) return true
  if (b.uzak === null && (abs === b.home || isInside(abs, b.workdir))) return true
  return false
}

export interface Bulgu {
  tur: "sert" | "degisiklik"
  neden: string
  hedefler: string[]
}

export const sert = (neden: string): Bulgu => ({ tur: "sert", neden, hedefler: [] })
export const degisiklik = (neden: string, hedefler: string[]): Bulgu => ({ tur: "degisiklik", neden, hedefler })

export const secenekDegil = (x: string) => !x.startsWith("-")

// Uzak sunucuda (ssh içinde, ansible -a …) salt-okunur sayılan komutlar. Listede olmayan her şey
// uzakta DEĞİŞİKLİK sayılır — şüphede kilit.
export const SALT_OKUNUR = new Set([
  "ls", "cat", "head", "tail", "less", "more", "grep", "egrep", "fgrep", "zgrep", "rg", "wc", "file", "stat",
  "df", "du", "free", "uptime", "uname", "whoami", "id", "groups", "w", "who", "last", "lastlog", "ps", "pgrep",
  "pstree", "ss", "netstat", "lsof", "lsblk", "blkid", "pvs", "vgs", "lvs", "pvdisplay", "vgdisplay",
  "lvdisplay", "findmnt", "getent", "echo", "printf", "true", "false", "test", "[", "which", "type", "whereis",
  "printenv", "pwd", "sestatus", "getenforce", "getsebool", "klist", "md5sum", "sha1sum", "sha256sum", "diff",
  "cmp", "sort", "uniq", "cut", "tr", "column", "jq", "yq", "xxd", "od", "strings", "readlink", "realpath",
  "basename", "dirname", "lscpu", "lsmem", "lspci", "lsusb", "lsmod", "modinfo", "dmidecode", "ping",
  "traceroute", "tracepath", "dig", "nslookup", "host", "sleep", "tree", "getfacl", "lsattr", "atq",
  "systemd-analyze", "needs-restarting", "awk", "top", "vmstat", "iostat", "mpstat", "sar", "nproc", "arch",
  "locale", "localectl", "ntpq", "chronyc", "nc", "curl", "wget", "openssl", "ansible", "cd",
])

export function saltOkunur(argv: string[]): boolean {
  const p = taban(argv[0] ?? "")
  const a = argv.slice(1)
  const has = (...x: string[]) => a.some((y) => x.includes(y))
  const ilk = a.find(secenekDegil) ?? ""
  switch (p) {
    case "date":
      return !has("-s", "--set") && !a.some((x) => x.startsWith("--set="))
    case "hostname":
      return a.every((x) => x.startsWith("-") && !["-F", "-b", "--file", "--boot"].includes(x))
    case "hostnamectl":
    case "timedatectl":
      return ilk === "" || ["status", "show", "list-timezones", "timesync-status", "show-timesync"].includes(ilk)
    case "systemctl":
      return ["status", "is-active", "is-enabled", "is-failed", "show", "cat", "get-default", "list-units",
        "list-unit-files", "list-timers", "list-dependencies", "list-sockets", "--version", ""].includes(ilk)
    case "journalctl":
      return !a.some((x) => /^--(vacuum|rotate|flush|relinquish|sync|setup-keys)/.test(x))
    case "rpm":
      return a.some((x) => /^-q|^--query|^-V|^--verify/.test(x)) && !a.some((x) => /^-[iUFe]|^--(install|upgrade|freshen|erase|import)/.test(x))
    case "dnf":
    case "yum":
      return ["list", "info", "repolist", "search", "check-update", "repoquery", "provides", "whatprovides",
        "updateinfo", "--version", "deplist"].includes(ilk) || (ilk === "history" && ["", "list", "info"].includes(a.filter(secenekDegil)[1] ?? ""))
    case "ip":
      return !a.some((x) => ["add", "del", "delete", "set", "flush", "change", "replace", "append", "save", "restore"].includes(x))
    case "nmcli":
      return !a.some((x) => ["mod", "modify", "add", "delete", "del", "up", "down", "reload", "edit", "connect",
        "disconnect", "on", "off", "radio", "reapply", "load", "import", "clone", "set", "rescan"].includes(x))
    case "firewall-cmd":
      return a.length === 0 || a.every((x) => /^--(list|state|get|query|info|zone=|permanent$)/.test(x) || x === "-q")
    case "iptables":
    case "ip6tables":
      return a.some((x) => ["-L", "-S", "--list", "--list-rules"].includes(x)) && !a.some((x) => /^-[AIDRFXZNPE]$|^--(append|insert|delete|replace|flush|zero|new|policy)/.test(x))
    case "nft":
      return ilk === "list"
    case "sysctl":
      return !has("-w", "--write", "-p", "--load", "--system") && !a.some((x) => x.includes("="))
    case "mount":
      return a.filter(secenekDegil).length === 0
    case "swapon":
      return a.length === 0 || has("--show", "-s", "--summary")
    case "dmesg":
      return !has("-c", "-C", "-D", "-E", "--clear", "--read-clear")
    case "crontab":
      return a.length > 0 && a.every((x) => x === "-l" || x === "-u" || !x.startsWith("-")) && has("-l")
    case "sed":
      return !a.some((x) => /^-[a-zA-Z]*i|^--in-place/.test(x))
    case "find":
      return !a.some((x) => /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/.test(x))
    case "subscription-manager":
      return ["status", "list", "identity", "facts", "version", "orgs", "release", "syspurpose"].includes(ilk) && !has("--set", "--unset")
    case "realm":
      return ilk === "list" || ilk === "discover"
    case "ipa":
      return /-(show|find)$/.test(ilk) || ["ping", "env", "help", "--version"].includes(ilk)
    case "kubectl":
    case "oc":
      return KUBE_OKUR.has(kubeFiil(a))
    case "helm":
      return ["list", "ls", "status", "get", "history", "show", "search", "version", "template", "lint", "env"].includes(ilk)
    case "docker":
    case "podman":
      return ["ps", "images", "inspect", "logs", "version", "info", "stats", "top", "port", "diff", "events"].includes(ilk)
    case "tuned-adm":
      return ["active", "list", "recommend", "verify"].includes(ilk)
    case "authselect":
      return ["current", "list", "show", "check"].includes(ilk)
    case "ansible-inventory":
    case "ansible-doc":
    case "ansible-config":
      return true
  }
  return SALT_OKUNUR.has(p) && !(p === "curl" && curlYazar(a)) && !(p === "wget" && wgetYazar(a))
}

export const KUBE_DEGERLI = new Set(["-n", "--namespace", "--context", "--kubeconfig", "--cluster", "--user", "-s",
  "--server", "--token", "-l", "--selector", "-o", "--output", "-c", "--container", "--as", "--request-timeout"])
export const KUBE_OKUR = new Set(["get", "describe", "logs", "top", "version", "api-resources", "api-versions", "explain",
  "cluster-info", "auth", "config", "wait", "diff", "events", "port-forward", "proxy", "whoami", "status", "projects", ""])

export function kubeFiil(a: string[]): string {
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("-")) {
      if (KUBE_DEGERLI.has(a[i])) i++
      continue
    }
    return a[i]
  }
  return ""
}

export function secenekDegeri(a: string[], ...adlar: string[]): string | null {
  for (let i = 0; i < a.length; i++) {
    for (const ad of adlar) {
      if (a[i] === ad) return a[i + 1] ?? null
      if (ad.startsWith("--") && a[i].startsWith(ad + "=")) return a[i].slice(ad.length + 1)
      if (!ad.startsWith("--") && a[i].startsWith(ad) && a[i].length > ad.length) return a[i].slice(ad.length)
    }
  }
  return null
}

export function curlYazar(a: string[]): boolean {
  const yontem = (secenekDegeri(a, "-X", "--request") ?? "").toUpperCase()
  return (
    ["POST", "PUT", "DELETE", "PATCH"].includes(yontem) ||
    a.some((x) => /^(-d|--data.*|-F|--form.*|-T|--upload-file|--json)$/.test(x) || /^-d./.test(x))
  )
}

export function wgetYazar(a: string[]): boolean {
  return a.some((x) => /^--(post-data|post-file|body-data|body-file)|^--method=(POST|PUT|DELETE|PATCH)/i.test(x))
}

export function urlHost(a: string[]): string {
  for (const x of a) {
    const m = /^[a-z]+:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^/:?#]+)/i.exec(x)
    if (m) return m[1]
  }
  return "?"
}

export function kubeHedef(a: string[], p: string): string {
  const ctx = secenekDegeri(a, "--context", "--kube-context")
  if (ctx) return ctx
  const kc = secenekDegeri(a, "--kubeconfig")
  if (kc) return taban(kc).replace(/\.(ya?ml|conf)$/, "")
  return p === "oc" ? "openshift" : "kubernetes"
}

// Bu makinede (uzak değil) sistem değiştiren komutlar → hedef "localhost".
export function yerelDegisiklik(argv: string[], yazilan: string[], b: Baglam): string | null {
  const p = taban(argv[0] ?? "")
  const a = argv.slice(1)
  const ilk = a.find(secenekDegil) ?? ""
  const disari = (yollar: string[]) => yollar.some((y) => !serbestYazmaAlani(yolCoz(y, b), b))

  for (const y of yazilan) if (!serbestYazmaAlani(yolCoz(y, b), b)) return `sistem dosyasına yazma (${y})`

  switch (p) {
    case "systemctl":
      return saltOkunur(argv) ? null : `systemctl ${ilk}`
    case "service":
      return a.some((x) => ["start", "stop", "restart", "reload", "condrestart", "try-restart"].includes(x)) ? `service ${a.join(" ")}` : null
    case "dnf":
    case "yum":
    case "rpm":
    case "hostnamectl":
    case "timedatectl":
    case "nmcli":
    case "firewall-cmd":
    case "iptables":
    case "ip6tables":
    case "nft":
    case "sysctl":
    case "subscription-manager":
    case "realm":
    case "crontab":
    case "tuned-adm":
    case "authselect":
    case "swapon":
      return saltOkunur(argv) ? null : `${p} ${ilk}`.trim()
    case "ip":
      return saltOkunur(argv) ? null : `ip ${a.join(" ")}`
    case "date":
    case "hostname":
      return saltOkunur(argv) ? null : `${p} ${a.join(" ")}`
    case "mount":
      return saltOkunur(argv) ? null : "mount"
    case "useradd": case "userdel": case "usermod": case "groupadd": case "groupdel": case "groupmod":
    case "passwd": case "chpasswd": case "chage": case "gpasswd": case "reboot": case "shutdown":
    case "poweroff": case "halt": case "init": case "telinit": case "umount": case "swapoff": case "setenforce":
    case "setsebool": case "semanage": case "ipa-client-install": case "ipa-server-install": case "modprobe":
    case "rmmod": case "insmod": case "grubby": case "grub2-mkconfig": case "dracut": case "update-crypto-policies":
    case "fdisk": case "parted": case "sgdisk": case "gdisk": case "sfdisk": case "pvcreate": case "pvremove":
    case "vgcreate": case "vgremove": case "vgextend": case "vgreduce": case "lvcreate": case "lvremove":
    case "lvextend": case "lvreduce": case "lvresize": case "resize2fs": case "xfs_growfs": case "alternatives":
    case "update-alternatives": case "at": case "certutil": case "update-ca-trust": case "restorecon": case "chcon":
      if ((p === "fdisk" || p === "sfdisk" || p === "parted") && has(a, "-l", "--list")) return null
      return `${p} ${a.join(" ")}`.trim()
    case "ipa":
      return saltOkunur(argv) ? null : `ipa ${ilk}`
    case "docker":
    case "podman":
      return saltOkunur(argv) ? null : `${p} ${ilk}`
    case "rm": case "rmdir": case "unlink": case "shred": case "truncate": case "touch": case "mkdir":
    case "tee":
      return disari(a.filter(secenekDegil)) ? `${p} (çalışma dizini dışı)` : null
    case "chmod": case "chown": case "chgrp": case "chattr": case "setfacl":
      return disari(a.filter(secenekDegil).slice(p === "setfacl" ? 0 : 1)) ? `${p} (çalışma dizini dışı)` : null
    case "cp": case "install": case "ln": case "rsync": case "scp": {
      const son = a.filter(secenekDegil).pop()
      return son && !/^[^/]*:/.test(son) && disari([son]) ? `${p} → ${son}` : null
    }
    case "mv": {
      const yollar = a.filter(secenekDegil)
      return disari(yollar) ? `mv (çalışma dizini dışı)` : null
    }
    case "sed":
      return !saltOkunur(argv) && disari(a.filter(secenekDegil).slice(1)) ? "sed -i (çalışma dizini dışı)" : null
    case "dd": {
      const of = a.find((x) => x.startsWith("of="))
      return of && disari([of.slice(3)]) ? `dd ${of}` : null
    }
    case "curl":
    case "wget": {
      // `-so dosya` gibi birleşik kısa bayraklarda dosya adı bir sonraki argümandır
      const harf = p === "curl" ? "o" : "O"
      const birlesik = a.findIndex((x) => new RegExp(`^-[a-zA-Z]+${harf}$`).test(x))
      const cikti =
        birlesik >= 0 ? a[birlesik + 1] : secenekDegeri(a, ...(p === "curl" ? ["-o", "--output"] : ["-O", "--output-document"]))
      return cikti && cikti !== "-" && disari([cikti]) ? `${p} → ${cikti}` : null
    }
    case "tar": {
      const acar = a.some((x) => /^-?[a-zA-Z]*x/.test(x) && !x.startsWith("--") || x === "--extract" || x === "--get")
      const hedef = secenekDegeri(a, "-C", "--directory")
      return acar && hedef && disari([hedef]) ? `tar -x → ${hedef}` : null
    }
    case "unzip": {
      const hedef = secenekDegeri(a, "-d")
      return hedef && disari([hedef]) ? `unzip → ${hedef}` : null
    }
    case "git": {
      if (!a.includes("clone")) return null
      const yollar = a.slice(a.indexOf("clone") + 1).filter(secenekDegil)
      return yollar.length > 1 && disari([yollar[yollar.length - 1]]) ? `git clone → ${yollar[yollar.length - 1]}` : null
    }
  }
  return null
}

export const has = (a: string[], ...x: string[]) => a.some((y) => x.includes(y))

export function komutIncele(metin: string, b: Baglam): Bulgu[] {
  if (b.derinlik > 6) return [sert("iç içe komut çok derin")]
  const bulgular: Bulgu[] = []
  if (/:\s*\(\s*\)\s*\{[^}]*:\s*\|\s*:/.test(metin)) bulgular.push(sert("fork bombası"))
  const ic: string[] = []
  for (const k of ayristir(metin, ic)) bulgular.push(...tekKomut(k, b))
  for (const x of ic) bulgular.push(...komutIncele(x, { ...b, derinlik: b.derinlik + 1 }))
  return bulgular
}

export function tekKomut(k: Komut, b: Baglam): Bulgu[] {
  const { argv, xargs } = sarmalayiciSoy(k.argv)
  const out: Bulgu[] = []
  for (const y of k.yazilan) {
    if (BLOK_AYGIT_RE.test(y)) out.push(sert(`diske doğrudan yazma (> ${y})`))
  }
  if (argv.length === 0) {
    if (b.uzak && k.yazilan.some((y) => !["/dev/null", "/dev/stderr", "/dev/stdout"].includes(y)))
      out.push(degisiklik("dosyaya yazma", [b.uzak]))
    else if (!b.uzak) {
      const r = yerelDegisiklik(["true"], k.yazilan, b)
      if (r) out.push(degisiklik(r, ["localhost"]))
    }
    return out
  }
  const p = taban(argv[0])
  const a = argv.slice(1)

  // iç kabuk: bash -c "…", su -c "…", eval …
  if (["bash", "sh", "zsh", "dash", "ksh", "su", "runuser"].includes(p)) {
    const c = secenekDegeri(a, "-c", "--command")
    if (c !== null) {
      out.push(...komutIncele(c, { ...b, derinlik: b.derinlik + 1 }))
      return out
    }
    if (["bash", "sh", "zsh", "dash", "ksh"].includes(p) && a.filter(secenekDegil).length === 0 && !b.uzak) return out
  }
  if (p === "eval") return [...out, ...komutIncele(a.join(" "), { ...b, derinlik: b.derinlik + 1 })]

  // Yerel kabuk betiği: modelin yazıp çalıştırdığı `x.sh` içindeki komutlar da aynı kilitten geçer.
  // (Python/Perl vb. betikler ayrıştırılmaz — onları motor zaten sorar: `"*": "ask"`.)
  if (!b.uzak) {
    const betik =
      ["bash", "sh", "zsh", "dash", "ksh", "source", "."].includes(p) ? a.find(secenekDegil) : /^\.{0,2}\//.test(argv[0]) ? argv[0] : undefined
    const icerik = betik ? betikOku(yolCoz(betik, b)) : null
    if (icerik !== null) out.push(...komutIncele(icerik, { ...b, derinlik: b.derinlik + 1 }))
  }

  // K6: kilitsiz ikinci bir opencode başlatma
  if (p === "opencode" && !a.every((x) => ["--version", "-v", "--help", "-h"].includes(x)))
    out.push(sert("opencode'u komut içinden başlatma (kilitsiz ikinci ajan)"))

  // K5: yıkıcı komutlar (yerel ya da uzak, yetkiyle bile açılmaz)
  if (a.includes("--no-preserve-root")) out.push(sert("--no-preserve-root"))
  if (p === "rm") {
    const ozyineli = a.some((x) => x === "--recursive" || /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(x))
    const hedefler = a.filter(secenekDegil)
    if (ozyineli && xargs) out.push(sert("xargs ile özyinelemeli silme (hedef görünmüyor)"))
    for (const h of hedefler) if (ozyineli && tehlikeliKok(h, b, true)) out.push(sert(`rm -r ${h}`))
  }
  if (["chmod", "chown", "chgrp"].includes(p)) {
    const ozyineli = a.some((x) => x === "--recursive" || /^-[a-zA-Z]*R[a-zA-Z]*$/.test(x))
    for (const h of a.filter(secenekDegil).slice(1)) {
      const yalin = h.replace(/\/\*?$/, "") || "/"
      if ((ozyineli && tehlikeliKok(h, b, false)) || yalin === "/") out.push(sert(`${p} ${ozyineli ? "-R " : ""}${h}`))
    }
  }
  if (p === "mv") for (const h of a.filter(secenekDegil).slice(0, -1)) if (tehlikeliKok(h, b, false)) out.push(sert(`mv ${h}`))
  if (/^mkfs(\..*)?$/.test(p) || p === "mke2fs" || p === "wipefs" || p === "blkdiscard") out.push(sert(p))
  if (p === "mkswap" && a.some((x) => BLOK_AYGIT_RE.test(x))) out.push(sert("mkswap (disk)"))
  if (p === "sgdisk" && a.some((x) => /^(--zap|--zap-all|-Z|-z)$/.test(x))) out.push(sert("sgdisk --zap"))
  if (p === "dd") {
    const of = a.find((x) => x.startsWith("of="))
    if (of && BLOK_AYGIT_RE.test(of.slice(3))) out.push(sert(`dd ${of}`))
  }
  if (p === "shred" && a.some((x) => BLOK_AYGIT_RE.test(x))) out.push(sert("shred (disk)"))
  if (p === "kill" && /(^|\s)(-\d+|-[A-Z]+|-s\s+\S+|--)\s+-1(\s|$)/.test(a.join(" "))) out.push(sert("kill … -1 (tüm süreçler)"))
  if (p === "git" && a.includes("push") && a.some((x) => /^(-f|--force|--force-with-lease.*|--force-if-includes|--mirror)$/.test(x) || /^\+/.test(x)))
    out.push(sert("git push --force"))
  if (p === "find") {
    const ilkIfade = a.findIndex((x) => x.startsWith("-") || x === "(" || x === "!")
    const kokler = ilkIfade < 0 ? a : a.slice(0, ilkIfade)
    const ekIdx = a.findIndex((x) => /^-(exec|execdir|ok|okdir)$/.test(x))
    const siler = a.includes("-delete") || (ekIdx >= 0 && ["rm", "shred", "unlink"].includes(taban(a[ekIdx + 1] ?? "")))
    if (siler) {
      for (const r of kokler.length ? kokler : ["."]) {
        const yalin = r.replace(/\/+$/, "") || "/"
        const abs = b.uzak && !isAbsolute(yalin) ? yalin : yolCoz(yalin, b)
        if (SISTEM_KOKLERI.has(abs) || /^\/(home|root)(\/[^/]+)?$/.test(abs) || r.startsWith("$"))
          out.push(sert(`find ${r} -delete/-exec rm`))
      }
    }
    if (ekIdx >= 0) {
      // -exec'in çalıştırdığı komutu ayrıca incele ({} → find kökü)
      let son = a.findIndex((x, i) => i > ekIdx && (x === ";" || x === "+"))
      if (son < 0) son = a.length
      const kok = (kokler[0] ?? ".").replace(/\/+$/, "") || "/"
      const alt = a.slice(ekIdx + 1, son).map((x) => (x === "{}" ? kok : x))
      if (alt.length) out.push(...tekKomut({ argv: alt, yazilan: [] }, { ...b, derinlik: b.derinlik + 1 }))
    }
  }

  // K1: uzak erişim araçları
  if (p === "ssh") {
    const hedef = sshHedef(a)
    if (!hedef.host) return [...out, degisiklik("ssh (hedef çözülemedi)", ["?"])]
    if (!hedef.komut) return [...out, degisiklik("etkileşimli ssh oturumu", [hedef.host])]
    const ic = komutIncele(hedef.komut, { ...b, uzak: hedef.host, derinlik: b.derinlik + 1 })
    return [...out, ...ic]
  }
  if (p === "ssh-copy-id") {
    const h = a.filter(secenekDegil).pop()
    return [...out, degisiklik("ssh-copy-id (uzak authorized_keys)", [h ? normHost(h) : "?"])]
  }
  if (p === "scp" || p === "rsync" || p === "sftp") {
    const yollar = a.filter(secenekDegil)
    const son = yollar[yollar.length - 1] ?? ""
    const m = /^(?:[^@/\s]+@)?(\[[^\]]+\]|[A-Za-z0-9._-]+):/.exec(son)
    if (p === "sftp") out.push(degisiklik("sftp oturumu", [normHost((yollar[0] ?? "?").split(":")[0])]))
    else if (m) out.push(degisiklik(`${p} → ${son}`, [m[1]]))
    else if (!b.uzak) {
      const r = yerelDegisiklik(argv, k.yazilan, b)
      if (r) out.push(degisiklik(r, ["localhost"]))
    }
    if (b.uzak) out.push(degisiklik(`${p} (uzaktan)`, [b.uzak]))
    return out
  }
  if (p === "ansible-playbook") {
    if (has(a, "--check", "-C", "--syntax-check", "--list-hosts", "--list-tasks", "--list-tags")) return out
    // T28 (Alp, 2026-09-30): yalnız okuyan playbook (ör. 01-ping.yaml) değişiklik değildir → yetki sorulmaz.
    // Karar dosyanın İÇERİĞİNE göre verilir; okunamayan/anlaşılamayan her durumda kilit devrede kalır.
    if (!b.uzak) {
      const kitaplar = playbookDosyalari(a)
      // K5 playbook içindeki komutlara da uygulanır (önceden içerik hiç okunmuyordu)
      for (const k of kitaplar) out.push(...playbookKomutlari(yolCoz(k, b)).flatMap((c) =>
        komutIncele(c, { ...b, uzak: "__ansible__", derinlik: b.derinlik + 1 }).filter((x) => x.tur === "sert")))
      if (out.some((x) => x.tur === "sert")) return out
      if (kitaplar.length > 0 && kitaplar.every((k) => playbookSaltOkunur(yolCoz(k, b), b))) return out
    }
    const limit = secenekDegeri(a, "-l", "--limit")
    const hedefler = limit ? limitHedefleri(limit) : ["?"]
    return [...out, degisiklik(`ansible-playbook ${a.filter(secenekDegil).find((x) => /\.ya?ml$/.test(x)) ?? ""} (--check yok)`.trim(), hedefler)]
  }
  if (p === "ansible") {
    if (a.length === 0 || has(a, "--version", "--list-hosts", "--check", "-C")) return out
    const oruntu = ansibleOruntu(a)
    const modul = secenekDegeri(a, "-m", "--module-name") ?? "command"
    const arg = secenekDegeri(a, "-a", "--args") ?? ""
    const okur = ["ping", "setup", "gather_facts", "stat", "find", "slurp", "service_facts", "package_facts", "debug", "getent", "command", "shell", "raw"]
    let degistirir = !okur.includes(taban(modul).replace(/^ansible\.(builtin|legacy)\./, ""))
    if (!degistirir && ["command", "shell", "raw"].includes(taban(modul).replace(/^ansible\.(builtin|legacy)\./, ""))) {
      const ic = komutIncele(arg, { ...b, uzak: "__ansible__", derinlik: b.derinlik + 1 })
      out.push(...ic.filter((x) => x.tur === "sert"))
      degistirir = ic.some((x) => x.tur === "degisiklik")
    }
    const limit = secenekDegeri(a, "-l", "--limit")
    if (degistirir) out.push(degisiklik(`ansible -m ${modul}`, limitHedefleri(limit ?? oruntu)))
    return out
  }
  if (["ansible-pull", "ansible-console", "pssh", "parallel-ssh", "pdsh", "clush", "prsync", "pscp"].includes(p))
    return [...out, degisiklik(`${p} (toplu uzak komut — hedef tek tek belirtilmeli)`, ["?"])]
  if ((p === "kubectl" || p === "oc") && !KUBE_OKUR.has(kubeFiil(a)))
    return [...out, degisiklik(`${p} ${kubeFiil(a)}`, [kubeHedef(a, p)])]
  if (p === "helm" && !saltOkunur(argv) && !["repo", "dependency", "plugin", "completion", "help"].includes(a.find(secenekDegil) ?? ""))
    return [...out, degisiklik(`helm ${a.find(secenekDegil) ?? ""}`, [kubeHedef(a, "helm")])]
  if (p === "curl" && curlYazar(a)) return [...out, degisiklik("curl (POST/PUT/DELETE)", [urlHost(a)])]
  if (p === "wget" && wgetYazar(a)) return [...out, degisiklik("wget (POST)", [urlHost(a)])]
  if (p === "ipa" && !saltOkunur(argv)) return [...out, degisiklik(`ipa ${a.find(secenekDegil) ?? ""}`, [b.uzak ?? "ipa"])]

  if (b.uzak) {
    if (!saltOkunur(argv)) out.push(degisiklik(`${p} (uzakta)`, [b.uzak]))
    else if (k.yazilan.some((y) => !["/dev/null", "/dev/stderr", "/dev/stdout"].includes(y)))
      out.push(degisiklik(`${p} > dosya (uzakta)`, [b.uzak]))
    return out
  }
  const r = yerelDegisiklik(argv, k.yazilan, b)
  if (r) out.push(degisiklik(r, ["localhost"]))
  return out
}

export function betikOku(abs: string): string | null {
  try {
    const icerik = readFileSync(abs, "utf8")
    if (icerik.length > 256 * 1024 || icerik.includes("\u0000")) return null
    const ilk = icerik.split("\n", 1)[0]
    if (ilk.startsWith("#!") && !/\b(ba|z|da|k)?sh\b/.test(ilk)) return null
    return icerik
  } catch {
    return null
  }
}

export const SSH_DEGERLI = new Set("bcDEeFIiJLlmOopQRSWw".split(""))

export function sshHedef(a: string[]): { host: string | null; komut: string } {
  let i = 0
  while (i < a.length) {
    const x = a[i]
    if (x === "--") {
      i++
      break
    }
    if (x.startsWith("-") && x.length > 1) {
      for (let j = 1; j < x.length; j++) {
        if (SSH_DEGERLI.has(x[j])) {
          if (j === x.length - 1) i++
          break
        }
      }
      i++
      continue
    }
    break
  }
  const hedef = a[i]
  if (!hedef) return { host: null, komut: "" }
  const m = /^ssh:\/\/(?:[^@]*@)?([^:/]+)/.exec(hedef)
  return { host: normHost(m ? m[1] : hedef), komut: a.slice(i + 1).join(" ") }
}

// --- salt-okunur playbook tespiti (T28) ---------------------------------------------------
// Tüm görevleri yalnız okuyan modüllerden oluşan playbook değişiklik sayılmaz. Muhafazakâr: rol, include/import,
// bilinmeyen modül, vault/tanınmayan YAML etiketi, Jinja'lı komut, 256 KB üstü dosya → "değişiklik" (kilit devrede).

const PLAYBOOK_DEGERLI = new Set(["-i", "--inventory", "--inventory-file", "-e", "--extra-vars", "-l", "--limit",
  "-u", "--user", "-t", "--tags", "--skip-tags", "-f", "--forks", "-M", "--module-path", "--private-key", "--key-file",
  "--vault-id", "--vault-password-file", "-c", "--connection", "-T", "--timeout", "--ssh-common-args",
  "--ssh-extra-args", "--sftp-extra-args", "--scp-extra-args", "--become-method", "--become-user", "--start-at-task"])

export function playbookDosyalari(a: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("-")) {
      if (PLAYBOOK_DEGERLI.has(a[i])) i++
      continue
    }
    out.push(a[i])
  }
  return out
}

const OKUR_MODULLER = new Set(["ping", "setup", "gather_facts", "debug", "stat", "assert", "fail", "set_fact",
  "wait_for_connection", "service_facts", "package_facts", "getent", "find", "slurp", "meta", "include_vars"])
const KOMUT_MODULLERI = new Set(["command", "shell", "raw"])
const GOREV_ANAHTARLARI = new Set(["name", "when", "register", "loop", "loop_control", "with_items", "with_dict",
  "with_list", "with_fileglob", "with_sequence", "tags", "ignore_errors", "ignore_unreachable", "changed_when",
  "failed_when", "delegate_to", "delegate_facts", "run_once", "become", "become_user", "become_method", "vars",
  "environment", "args", "no_log", "check_mode", "diff", "retries", "until", "delay", "notify", "listen", "timeout",
  "throttle", "any_errors_fatal", "module_defaults", "collections", "connection", "remote_user", "debugger"])

function modulAdi(m: string): string {
  return m.replace(/^ansible\.(builtin|legacy)\./, "")
}

function playbookOku(abs: string): unknown[] | null {
  try {
    const icerik = readFileSync(abs, "utf8")
    if (icerik.length > 256 * 1024) return null
    const yaml = (globalThis as { Bun?: { YAML?: { parse: (s: string) => unknown } } }).Bun?.YAML
    if (!yaml) return null
    const veri = yaml.parse(icerik)
    return Array.isArray(veri) && veri.length > 0 ? veri : null
  } catch {
    return null
  }
}

function gorevKomutu(t: Record<string, unknown>, modul: string): string | null {
  const deger = t[modul]
  const argsCmd = t.args && typeof t.args === "object" ? (t.args as Record<string, unknown>).cmd : undefined
  if (typeof deger === "string") return deger
  if (deger && typeof deger === "object" && typeof (deger as Record<string, unknown>).cmd === "string")
    return (deger as Record<string, unknown>).cmd as string
  return typeof argsCmd === "string" ? argsCmd : null
}

function gorevler(oyunlar: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const gez = (l: unknown) => {
    if (!Array.isArray(l)) return
    for (const g of l) {
      if (!g || typeof g !== "object" || Array.isArray(g)) continue
      const t = g as Record<string, unknown>
      if ("block" in t) for (const k of ["block", "rescue", "always"]) gez(t[k])
      else out.push(t)
    }
  }
  for (const o of oyunlar)
    if (o && typeof o === "object") for (const k of ["pre_tasks", "tasks", "post_tasks", "handlers"]) gez((o as Record<string, unknown>)[k])
  return out
}

// Playbook'taki command/shell/raw komutları (K5 taraması için) — okunamazsa boş.
export function playbookKomutlari(abs: string): string[] {
  const oyunlar = playbookOku(abs)
  if (!oyunlar) return []
  const out: string[] = []
  for (const t of gorevler(oyunlar)) {
    const m = Object.keys(t).find((k) => !GOREV_ANAHTARLARI.has(k))
    if (m && KOMUT_MODULLERI.has(modulAdi(m))) {
      const c = gorevKomutu(t, m)
      if (c) out.push(c)
    }
  }
  return out
}

function gorevSaltOkunur(g: unknown, b: Baglam): boolean {
  if (!g || typeof g !== "object" || Array.isArray(g)) return false
  const t = g as Record<string, unknown>
  if ("block" in t)
    return (["block", "rescue", "always"] as const).every(
      (k) => t[k] === undefined || (Array.isArray(t[k]) && (t[k] as unknown[]).every((x) => gorevSaltOkunur(x, b))),
    )
  const moduller = Object.keys(t).filter((k) => !GOREV_ANAHTARLARI.has(k))
  if (moduller.length !== 1) return false
  const m = modulAdi(moduller[0])
  if (OKUR_MODULLER.has(m)) return true
  if (!KOMUT_MODULLERI.has(m)) return false
  const komut = gorevKomutu(t, moduller[0])
  if (!komut || /\{\{|\{%/.test(komut)) return false // Jinja: çalışma anında ne olacağı belli değil
  return komutIncele(komut, { ...b, uzak: "__ansible__", derinlik: b.derinlik + 1 }).length === 0
}

export function playbookSaltOkunur(abs: string, b: Baglam): boolean {
  const veri = playbookOku(abs)
  if (!veri) return false
  return veri.every((oyun) => {
    if (!oyun || typeof oyun !== "object") return false
    const o = oyun as Record<string, unknown>
    if ("import_playbook" in o || "roles" in o) return false
    const listeler = ["pre_tasks", "tasks", "post_tasks", "handlers"].map((k) => o[k]).filter((x) => x !== undefined)
    return listeler.every((l) => Array.isArray(l) && l.every((g) => gorevSaltOkunur(g, b)))
  })
}

export function ansibleOruntu(a: string[]): string {
  const degerli = new Set(["-i", "--inventory", "-m", "--module-name", "-a", "--args", "-u", "--user", "-e",
    "--extra-vars", "-f", "--forks", "-l", "--limit", "-M", "--module-path", "-T", "--timeout", "--become-user",
    "--become-method", "-c", "--connection", "--private-key", "--vault-password-file", "--vault-id", "-t", "--tree",
    "-B", "--background", "-P", "--poll"])
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("-")) {
      if (degerli.has(a[i])) i++
      continue
    }
    return a[i]
  }
  return "?"
}

export function limitHedefleri(limit: string): string[] {
  const h = limit
    .split(/[,:]/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith("!"))
    .map((x) => normHost(x.replace(/^&/, "")))
  return h.length ? h : ["?"]
}

// K6: korunan yollar — ajanın kendi ayarı/eklentisi/oturum verisi/audit log'u.
export function korunanYollar(): { yazma: string[]; okuma: string[] } {
  const home = userInfo().homedir
  const cfg = process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "opencode") : join(home, ".config", "opencode")
  const data = process.env.XDG_DATA_HOME ? join(process.env.XDG_DATA_HOME, "opencode") : join(home, ".local", "share", "opencode")
  const yazma = [cfg, data, dirname(auditLogYolu())]
  if (process.env.OPENCODE_CONFIG_DIR) yazma.push(process.env.OPENCODE_CONFIG_DIR)
  if (process.env.OPENCODE_CONFIG) yazma.push(process.env.OPENCODE_CONFIG)
  // Okuma kısıtı yok (Alp, 2026-09-28): kurum içi offline sistem, gizlenecek bir şey yok.
  return { yazma, okuma: [] }
}

export function korunanYol(abs: string, yazma: boolean): boolean {
  const k = korunanYollar()
  if ((yazma ? k.yazma : k.okuma).some((d) => isInside(d, abs))) return true
  const parcalar = abs.split("/")
  if (parcalar.includes(".opencode") && yazma) return true
  const ad = parcalar[parcalar.length - 1]
  if (/^opencode\.jsonc?$/.test(ad) && yazma) return true // izinleri ezer (yazma); okuma serbest
  return false
}

export function korunanMetin(metin: string): string | null {
  const k = korunanYollar()
  const home = userInfo().homedir
  const adaylar = [
    ...k.yazma.map((d) => d.replace(home, "~")),
    ...k.yazma,
    ".config/opencode",
    ".local/share/opencode",
    "ops-agent/audit",
  ]
  for (const a of adaylar) if (metin.includes(a)) return a
  if (/(^|[\s/'"=])\.opencode([\s/'"]|$)/.test(metin)) return ".opencode/"
  if (/opencode\.jsonc?\b/.test(metin)) return "opencode.json"
  if (/\bOPS_AGENT_[A-Z_]*/.test(metin)) return "OPS_AGENT_*"
  if (/\b(export\s+)?OPENCODE_[A-Z_]*\s*=/.test(metin)) return "OPENCODE_*="
  if (/\$\{?XDG_(CONFIG|DATA)_HOME/.test(metin)) return "XDG_*_HOME"
  return null
}

export function yamaYollari(patch: string): string[] {
  const out: string[] = []
  for (const m of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm)) out.push((m[1] ?? m[2]).trim())
  return out
}

export interface KilitKarari {
  kilit: "K1" | "K5" | "K6"
  mesaj: string
}

export const YETKI_NASIL =
  'Yetkiyi YALNIZ kullanıcı kendi mesajıyla verir (sen yazamazsın). YENİ KURULUM (yeni makineler) için numara ' +
  'GEREKMEZ: kullanıcı "kurulum yapacağım" (harf fark etmez) + "sunucular: <ad>, <ad>" (ya da --limit grubunun adı) ' +
  'yazar — yeni kurulumda CN ' +
  'önerme. Mevcut (çalışan) sunucuda değişiklik: "CN: <numara>" + "sunucular: …" · kriz: "KRİZ" + kriz maili/toplantı ' +
  'notu + "sunucular: …". Bu makine için listeye localhost yazılır. Salt-okunur işlerle devam edebilirsin; kullanıcıya ' +
  "neyin neden gerektiğini tek cümleyle söyle."

export function kilitDenetle(
  tool: string,
  args: Record<string, unknown>,
  workdir: string,
  yetki: Yetki | undefined,
): KilitKarari | null {
  const home = userInfo().homedir
  const b: Baglam = {
    workdir,
    cwd: typeof args.workdir === "string" ? (isAbsolute(args.workdir) ? args.workdir : resolve(workdir, args.workdir)) : workdir,
    home,
    uzak: null,
    derinlik: 0,
  }
  let bulgular: Bulgu[] = []

  if (tool === "bash" && typeof args.command === "string") {
    // K6 yalnız yazma/değiştirmeye uygulanır: `cat engine/opencode.json` gibi salt-okunur komutlar serbest.
    const ic: string[] = []
    let yalnizOkur = false
    try {
      const komutlar = ayristir(args.command, ic)
      yalnizOkur =
        ic.length === 0 &&
        komutlar.every((k) => k.yazilan.length === 0 && saltOkunur(sarmalayiciSoy(k.argv).argv))
    } catch {
      yalnizOkur = false
    }
    const k6 = yalnizOkur ? null : korunanMetin(args.command)
    if (k6)
      return {
        kilit: "K6",
        mesaj: `[güvenlik kilidi K6] Komut ajanın kendi ayar/eklenti/kayıt alanına dokunuyor (${k6}) — bu alan ajana kapalı, yetkiyle de açılmaz. Gerekiyorsa kullanıcı kendisi yapar.`,
      }
    bulgular = komutIncele(args.command, b)
  } else if (["edit", "write", "apply_patch", "multiedit", "patch"].includes(tool)) {
    const yollar = [
      ...(typeof args.filePath === "string" ? [args.filePath] : []),
      ...(typeof args.patchText === "string" ? yamaYollari(args.patchText) : []),
    ]
    for (const y of yollar) {
      const abs = yolCoz(y, b)
      if (korunanYol(abs, true))
        return { kilit: "K6", mesaj: `[güvenlik kilidi K6] ${y}: ajanın kendi ayar/eklenti/kayıt alanı — yazma kapalı, yetkiyle de açılmaz.` }
      if (!serbestYazmaAlani(abs, b)) bulgular.push(degisiklik(`dosya düzenleme: ${y}`, ["localhost"]))
    }
  } else if (["read", "grep", "glob", "list"].includes(tool)) {
    const y = typeof args.filePath === "string" ? args.filePath : typeof args.path === "string" ? args.path : null
    if (y && korunanYol(yolCoz(y, b), false))
      return { kilit: "K6", mesaj: `[güvenlik kilidi K6] ${y}: erişim anahtarı/audit kaydı içerir — okuma kapalı.` }
    return null
  } else return null

  const sertler = bulgular.filter((x) => x.tur === "sert")
  if (sertler.length)
    return {
      kilit: "K5",
      mesaj: `[güvenlik kilidi K5] Yıkıcı komut engellendi: ${[...new Set(sertler.map((x) => x.neden))].join("; ")}. Bu kilit CN/KURULUM/KRİZ yetkisiyle de açılmaz — gerçekten gerekiyorsa kullanıcı komutu kendisi çalıştırır.`,
    }

  const degisenler = bulgular.filter((x) => x.tur === "degisiklik")
  if (!degisenler.length) return null
  const hedefler = [...new Set(degisenler.flatMap((x) => x.hedefler))]
  const nedenler = [...new Set(degisenler.map((x) => x.neden))].join("; ")
  if (hedefler.includes("?") || hedefler.includes("__ansible__"))
    return {
      kilit: "K1",
      mesaj: `[güvenlik kilidi K1] Değişiklik yapan komutun hedefi belirlenemedi (${nedenler}). ansible-playbook için hedefi --limit <sunucu,…> ile açıkça ver; toplu araç yerine sunucu başına komut kullan. ${YETKI_NASIL}`,
    }
  if (!yetkiAktif(yetki, Date.now())) {
    const eksik = !yetki || !yetki.tur
      ? "bu oturumda yetki yok"
      : yetki.sunucular.length === 0
        ? `${yetki.tur} verildi ama sunucu listesi yok`
        : yetki.tur === "CN" && !yetki.cn
          ? "CN numarası yok"
          : yetki.tur === "KRIZ" && !yetki.krizMetni
            ? "KRİZ için kriz maili/toplantı notu yapıştırılmadı"
            : "yetkinin süresi doldu (12 saat)"
    return {
      kilit: "K1",
      mesaj: `[güvenlik kilidi K1] Bu komut değişiklik yapıyor (${nedenler}) → hedef: ${hedefler.join(", ")}. Çalıştırılmadı: ${eksik}. ${YETKI_NASIL}`,
    }
  }
  const disarida = hedefler.filter((h) => !hostListede(h, yetki.sunucular))
  if (disarida.length)
    return {
      kilit: "K1",
      mesaj: `[güvenlik kilidi K1] Hedef yetki listesinde yok: ${disarida.join(", ")} (geçerli yetki — ${yetkiOzeti(yetki)}). Komut: ${nedenler}. Kullanıcı listeyi "sunucular: …" satırıyla güncellemeli (IP ile bağlanıyorsan IP de listede olmalı).`,
    }
  return null
}
