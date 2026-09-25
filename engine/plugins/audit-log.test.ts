// audit-log.test.ts — T13/A34+A35 birim testleri.
// Hedefli çalıştırma: `bun test engine/plugins/audit-log.test.ts` (kökten tam `bun test`/`bun turbo
// typecheck` YASAK — bkz. AGENTS.md "Root'tan tam typecheck/build ÇALIŞTIRMA").
// Gerçek IP/host/parola yok — hepsi uydurma test verisi (THREAT-MODEL.md maskeleme kuralı testte de geçerli).
import { afterAll, describe, expect, test } from "bun:test"
import { createHash } from "crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const kokDir = mkdtempSync(join(tmpdir(), "audit-log-test-"))
// Proje dizini ile audit dizini AYRI: audit dizini K6 ile korunur (model okuyamaz/yazamaz) —
// aynı dizin olsaydı projedeki her dosya "korunan" sayılırdı.
const workDir = join(kokDir, "proje")
mkdirSync(workDir, { recursive: true })
const auditPath = join(kokDir, "audit", "audit.jsonl")
process.env.OPS_AGENT_AUDIT_LOG = auditPath

// Modül üst-seviye AUDIT_LOG_PATH sabiti import anında donuyor — bu yüzden env değişkeni import'tan
// ÖNCE ayarlanmalı (dynamic import, ESM hoisting'i atlamak için).
const { AuditLogPlugin } = await import("./audit-log")

afterAll(() => rmSync(kokDir, { recursive: true, force: true }))

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
  // K7: varsayılan KİLİTLİ; gözlem modu yalnız açıkça OPS_AGENT_KAPI=GOZLEM ile
  if (opts.enforce === false) process.env.OPS_AGENT_KAPI = "GOZLEM"
  else delete process.env.OPS_AGENT_KAPI
  const dir = opts.projectDir ?? workDir
  return AuditLogPlugin({ directory: dir, project: { worktree: dir } } as any)
}

describe("gizli desen redaksiyonu (A34)", () => {
  test("bash ciktisindaki parola hem tool ciktisinda hem audit'te maskelenir, zincir bozulmaz", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin()
    // "env" dosya adi artik A81/A92 denylist'ine takilir (bkz. asagida) — bu test redaksiyonu
    // denylist'ten BAGIMSIZ sinamak icin denylist'e uymayan bir dosya adi kullanir.
    const args = { command: "cat notlar.txt" }
    const beforeOut = { args }
    await hooks["tool.execute.before"]!({ tool: "bash", sessionID: "s-env", callID: "c-env" }, beforeOut)
    const afterOut = { title: "notlar.txt", output: "DB_PASSWORD=Sifre!2026\nOK=1", metadata: {} }
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

describe("uc/hostname/ic IP redaksiyonu (T15/A43-A44)", () => {
  test("kurum alan adi (*.com.tr) tool ciktisinda maskelenir", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin()
    // "env" dosya adi artik A81/A92 denylist'ine takilir — bkz. yukaridaki not.
    const args = { command: "cat notlar.txt" }
    await hooks["tool.execute.before"]!({ tool: "bash", sessionID: "s-host", callID: "c-host" }, { args })
    const afterOut = {
      title: "notlar.txt",
      output: "KURUM_URL=https://ai.sahte-kurum.com.tr:8443/v1",
      metadata: {},
    }
    await hooks["tool.execute.after"]!({ tool: "bash", sessionID: "s-host", callID: "c-host", args }, afterOut)

    expect(afterOut.output).not.toContain("sahte-kurum.com.tr")
    expect(afterOut.output).toContain("<kurum-host>")
    const lines = readAllLines().slice(before)
    expect(JSON.stringify(lines)).not.toContain("sahte-kurum.com.tr")
    expect(lines.some((l) => l.record_type === "redacted" && l.target.includes("hostname"))).toBe(true)
    assertChainIntact()
  })

  test("ic (RFC1918) IP tool ciktisinda maskelenir, genel/public IP dokunulmaz", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin()
    const args = { command: "getent ahosts ai-uc" }
    await hooks["tool.execute.before"]!({ tool: "bash", sessionID: "s-ip", callID: "c-ip" }, { args })
    const afterOut = { title: "bash", output: "DNS ai-uc -> 10.42.7.19 · genel: 8.8.8.8", metadata: {} }
    await hooks["tool.execute.after"]!({ tool: "bash", sessionID: "s-ip", callID: "c-ip", args }, afterOut)

    expect(afterOut.output).not.toContain("10.42.7.19")
    expect(afterOut.output).toContain("10.0.0.x")
    expect(afterOut.output).toContain("8.8.8.8")
    const lines = readAllLines().slice(before)
    expect(JSON.stringify(lines)).not.toContain("10.42.7.19")
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

describe("bash denylist taramasi (A81/A92 — kilit bash'e de uygulanir)", () => {
  const denylistliKomutlar = [
    "cat hosts.ini",
    "cp ansible/inventories/hosts.ini /tmp/x",
    "grep -c x hosts.ini",
    "ansible-inventory -i hosts.ini --list",
  ]
  for (const komut of denylistliKomutlar) {
    test(`ENFORCE modu: reddedilir — ${komut}`, async () => {
      const before = readAllLines().length
      const hooks = await freshPlugin({ enforce: true })
      const args = { command: komut }
      await expect(
        hooks["tool.execute.before"]!({ tool: "bash", sessionID: "s-bash-deny", callID: `c-bd-${komut}` }, { args }),
      ).rejects.toThrow(/denylist/)
      const lines = readAllLines().slice(before)
      expect(lines[0].result_status).toBe("denied")
      expect(lines[0].tool).toBe("bash")
      assertChainIntact()
    })
  }

  test("asiri bloklama yok: denylist desenine uymayan bash komutu eskisi gibi calisir", async () => {
    const hooks = await freshPlugin({ enforce: true })
    const args = { command: "cat README.md" }
    await hooks["tool.execute.before"]!(
      { tool: "bash", sessionID: "s-bash-serbest", callID: "c-bd-serbest" },
      { args },
    )
    const afterOut = { title: "README.md", output: "merhaba", metadata: {} }
    await hooks["tool.execute.after"]!(
      { tool: "bash", sessionID: "s-bash-serbest", callID: "c-bd-serbest", args },
      afterOut,
    )
    expect(afterOut.output).toBe("merhaba")
    assertChainIntact()
  })

  test("GOZLEM modu: denylistli bash komutu engellenmez ama ciktisi tam redakte edilir", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin({ enforce: false })
    const args = { command: "cat hosts.ini" }
    await hooks["tool.execute.before"]!(
      { tool: "bash", sessionID: "s-bash-gozlem", callID: "c-bd-gozlem" },
      { args },
    )
    const afterOut = { title: "hosts.ini", output: "web01 ansible_host=<IP-yer-tutucu>", metadata: {} }
    await hooks["tool.execute.after"]!(
      { tool: "bash", sessionID: "s-bash-gozlem", callID: "c-bd-gozlem", args },
      afterOut,
    )

    expect(afterOut.output).toContain("[REDACTED: hassas dosya")
    expect(afterOut.output).not.toContain("ansible_host")
    const lines = readAllLines().slice(before)
    expect(lines.some((l) => l.record_type === "redacted" && l.tool === "bash")).toBe(true)
    expect(lines.every((l) => l.result_status !== "denied")).toBe(true)
    assertChainIntact()
  })

  test("modelin yazdigi yerel betik icindeki denylistli okuma da yakalanir (bypass kapatildi)", async () => {
    const { writeFileSync } = require("fs")
    writeFileSync(join(workDir, "envanter-oku.sh"), "#!/bin/bash\ncat hosts.ini\n")
    const before = readAllLines().length
    const hooks = await freshPlugin({ enforce: true, projectDir: workDir })
    const args = { command: "bash envanter-oku.sh" }
    await expect(
      hooks["tool.execute.before"]!({ tool: "bash", sessionID: "s-bash-betik", callID: "c-bd-betik" }, { args }),
    ).rejects.toThrow(/denylist/)
    const lines = readAllLines().slice(before)
    expect(lines[0].result_status).toBe("denied")
    assertChainIntact()
  })
})

describe("arama kapsami (A35)", () => {
  test("proje disina ardisik tarama tek onaya baglanir, sonuc sayiyla loglanir", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin({ enforce: false, projectDir: workDir })
    const outsideDir = "/kapsam-disi/ansible"
    for (let i = 0; i < 3; i++) {
      const args = { pattern: "*.ini", path: outsideDir }
      await hooks["tool.execute.before"]!({ tool: "glob", sessionID: "s-scope", callID: `g${i}` }, { args })
      const afterOut = { title: outsideDir, output: "a.ini\nb.ini\nc.ini", metadata: { count: 3, truncated: false } }
      await hooks["tool.execute.after"]!(
        { tool: "glob", sessionID: "s-scope", callID: `g${i}`, args },
        afterOut,
      )
    }

    const lines = readAllLines().slice(before)
    const asked = lines.filter((l) => l.policy_decision === "ask")
    expect(asked.length).toBe(1)
    expect(asked[0].result_status).toBe("asked")
    expect(asked[0].target).toContain("3 dosya")
    // içerik (dosya adları) audit'e yazılmadı — yalnız sayı
    expect(JSON.stringify(asked[0])).not.toContain("a.ini")
    assertChainIntact()
  })

  test("proje ici arama onay gerektirmez", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin({ enforce: false, projectDir: workDir })
    const args = { pattern: "*.md" }
    await hooks["tool.execute.before"]!({ tool: "glob", sessionID: "s-scope2", callID: "g-in" }, { args })
    const afterOut = { title: workDir, output: "README.md", metadata: { count: 1, truncated: false } }
    await hooks["tool.execute.after"]!({ tool: "glob", sessionID: "s-scope2", callID: "g-in", args }, afterOut)

    const lines = readAllLines().slice(before)
    expect(lines.some((l) => l.policy_decision === "ask")).toBe(false)
    assertChainIntact()
  })

  test("kilitli modda da kapsam disi tarama plugin'de reddedilmez (K2 onayi motorda), yalniz kaydedilir", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin({ projectDir: workDir })
    const args = { pattern: "*.ini", path: "/kapsam-disi/ansible" }
    await hooks["tool.execute.before"]!({ tool: "glob", sessionID: "s-scope3", callID: "g-enf" }, { args })
    await hooks["tool.execute.after"]!(
      { tool: "glob", sessionID: "s-scope3", callID: "g-enf", args },
      { title: "x", output: "a.ini", metadata: { count: 1 } },
    )
    const lines = readAllLines().slice(before)
    expect(lines.some((l) => l.result_status === "asked")).toBe(true)
    expect(lines.some((l) => l.result_status === "denied")).toBe(false)
    assertChainIntact()
  })
})

// --- güvenlik kilitleri (K1-K7, ADR-0004) ---------------------------------------------------------

let cagri = 0
async function bash(hooks: any, sessionID: string, command: string) {
  const callID = `k${++cagri}`
  const args = { command, description: "test" }
  await hooks["tool.execute.before"]!({ tool: "bash", sessionID, callID }, { args })
}
async function kullanici(hooks: any, sessionID: string, text: string, synthetic = false) {
  await hooks["chat.message"]!({ sessionID }, { message: {}, parts: [{ type: "text", text, synthetic }] })
}
const KRIZ_MAILI = [
  "Konu: ACİL - ödeme servisi yanıt vermiyor",
  "Merhaba, 09:40'tan beri ödeme servisinde zaman aşımı alıyoruz, müşteri işlemleri başarısız.",
  "Kriz toplantısında db01 üzerindeki bağlantı havuzunun dolduğu görüldü, servisin yeniden başlatılması kararlaştırıldı.",
].join("\n")

describe("K5 yikici komut kilidi — yetkiyle bile acilmaz", () => {
  const yikicilar = [
    "rm -rf /",
    "rm -fr ~",
    "rm -r -f /etc",
    "sudo rm -rf /var/*",
    "rm -rf $DIZIN/",
    "rm -rf .",
    "ls; rm -rf /",
    "echo x && bash -c 'rm -rf /usr'",
    "ssh web01 'rm -rf /'",
    "mkfs.ext4 /dev/sdb",
    "dd if=/dev/zero of=/dev/sda bs=1M",
    "echo x > /dev/sda",
    "git push --force origin main",
    "git push origin +main",
    "find / -name '*.log' -delete",
    "chmod -R 777 /",
    "find . -type f | xargs rm -rf",
    "rm --no-preserve-root -r /tmp/x",
    "kill -9 -1",
  ]
  for (const k of yikicilar) {
    test(`reddedilir: ${k}`, async () => {
      const hooks = await freshPlugin()
      await kullanici(hooks, "s-k5", "CN: CHG0000001\nsunucular: web01, localhost")
      await expect(bash(hooks, "s-k5", k)).rejects.toThrow(/K5/)
    })
  }
})

describe("K1 degisiklik kilidi", () => {
  const degisiklikler = [
    "ansible-playbook 03-ipa.yml -i hosts.ini -l web01",
    "ssh web01 'systemctl restart sshd'",
    "ssh -o StrictHostKeyChecking=accept-new root@web01 dnf -y update",
    "sudo systemctl restart chronyd",
    "echo 'server ntp1' >> /etc/chrony.conf",
    "kubectl --context KUME-A apply -f x.yaml",
    "scp app.conf web01:/etc/app/",
    "ansible web01 -m shell -a 'systemctl restart x'",
    "ansible web01 -m dnf -a 'name=x state=latest'",
    "curl -X POST https://satellite.ornek.local/api/hosts",
    "cat <<EOF | ssh web01 'cat > /etc/motd'\nmerhaba\nEOF",
    "useradd deneme",
    "curl -so /etc/yum.repos.d/x.repo https://repo.ornek.local/x.repo",
    "tar -xzf paket.tgz -C /opt",
    "git clone https://git.ornek.local/x.git /opt/x",
  ]
  for (const k of degisiklikler) {
    test(`yetkisiz reddedilir: ${k.split("\n")[0]}`, async () => {
      const hooks = await freshPlugin()
      await expect(bash(hooks, "s-k1-yok", k)).rejects.toThrow(/K1/)
    })
  }

  const serbestler = [
    "ls -la",
    "rm -rf build",
    "rm -rf ./cikti/tmp",
    "find . -name '*.pyc' -delete",
    "cat x > rapor.txt",
    "git push origin main",
    "ssh web01 'df -h; systemctl status sshd; journalctl -u sshd -n 50'",
    "ssh web01 uptime",
    "ssh web01 'rpm -qa | grep openssl'",
    "ansible-playbook site.yml --check -l web01",
    "ansible web -m ping",
    "ansible web -m shell -a 'uptime'",
    "kubectl get pods -A",
    "curl -s https://satellite.ornek.local/api/status",
    "cat <<EOF > notlar.md\nrm -rf /\nsystemctl restart x\nEOF",
    "echo 'rm -rf / yazma'",
    "opencode --version",
    "curl -so cikti/x.json https://api.ornek.local/x",
    "tar -czf yedek.tgz -C /etc chrony.conf",
    "git clone https://git.ornek.local/x.git",
    "journalctl -u chronyd --since today",
    "timeout 5 bash -c 'echo > /dev/tcp/10.0.0.5/22' && echo acik",
    "ssh web01 'sudo -n needs-restarting -r'",
    "kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes -o wide",
  ]
  for (const k of serbestler) {
    test(`yetkisiz serbest (salt-okunur/proje ici): ${k.split("\n")[0]}`, async () => {
      const hooks = await freshPlugin()
      await bash(hooks, "s-k1-serbest", k)
    })
  }

  test("ansible-playbook --limit'siz: hedef belirsiz, CN olsa bile reddedilir", async () => {
    const hooks = await freshPlugin()
    await kullanici(hooks, "s-lim", "CN: CHG0000002\nsunucular: web01")
    await expect(bash(hooks, "s-lim", "ansible-playbook site.yml")).rejects.toThrow(/--limit/)
  })

  test("CN + sunucu listesi: listedeki hedef calisir, listede olmayan reddedilir", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin()
    await expect(bash(hooks, "s-cn", "ansible-playbook 03-ipa.yml -l web01")).rejects.toThrow(/yetki yok/)
    await kullanici(hooks, "s-cn", "CN: CHG0012345\nsunucular: web01, web02")
    await bash(hooks, "s-cn", "ansible-playbook 03-ipa.yml -l web01,web02")
    await bash(hooks, "s-cn", "ssh web02.ornek.local 'systemctl restart sshd'") // kısa ad eşleşir
    await expect(bash(hooks, "s-cn", "ansible-playbook 03-ipa.yml -l web03")).rejects.toThrow(/listesinde yok: web03/)
    await expect(bash(hooks, "s-cn", "sudo systemctl restart chronyd")).rejects.toThrow(/localhost/)
    const lines = readAllLines().slice(before)
    expect(lines.some((l) => l.tool === "yetki" && l.target.includes("CN CHG0012345"))).toBe(true)
    expect(lines.filter((l) => l.result_status === "denied" && l.target.startsWith("K1")).length).toBe(3)
    assertChainIntact()
  })

  test("yetki satiri tirnak/madde isareti/kalin yazi ile de taninir", async () => {
    for (const metin of ['"CN: CHG0000009\nsunucular: web01"', "- **CN:** CHG0000009\n- sunucular: web01", "> cn chg0000009 sunucular: web01"]) {
      const hooks = await freshPlugin()
      await kullanici(hooks, "s-bicim", metin)
      await bash(hooks, "s-bicim", "ssh web01 'systemctl restart x'")
    }
  })

  test("sunucu listesi olmadan CN yetmez; CN olmadan liste yetmez", async () => {
    const hooks = await freshPlugin()
    await kullanici(hooks, "s-eksik", "CN: CHG0000003")
    await expect(bash(hooks, "s-eksik", "ssh web01 'systemctl restart x'")).rejects.toThrow(/sunucu listesi yok/)
    const hooks2 = await freshPlugin()
    await kullanici(hooks2, "s-eksik2", "sunucular: web01")
    await expect(bash(hooks2, "s-eksik2", "ssh web01 'systemctl restart x'")).rejects.toThrow(/K1/)
  })

  test("KURULUM + sunucular: CN gerekmez", async () => {
    const hooks = await freshPlugin()
    await kullanici(hooks, "s-kur", "KURULUM\nsunucular: yeni01, yeni02")
    await bash(hooks, "s-kur", "ssh yeni01 'dnf -y install chrony && systemctl enable --now chronyd'")
    await bash(hooks, "s-kur", "ansible-playbook kurulum.yml -l yeni01,yeni02")
    await expect(bash(hooks, "s-kur", "ssh eski01 'dnf -y update'")).rejects.toThrow(/listesinde yok/)
  })

  test("KRIZ: mail/toplanti notu yapistirilmadan acilmaz; yapistirilinca acilir", async () => {
    const hooks = await freshPlugin()
    await kullanici(hooks, "s-kriz", "KRİZ\nsunucular: db01")
    await expect(bash(hooks, "s-kriz", "ssh db01 'systemctl restart odeme'")).rejects.toThrow(/kriz maili/)
    await kullanici(hooks, "s-kriz", KRIZ_MAILI) // mail ayrı mesajla
    await bash(hooks, "s-kriz", "ssh db01 'systemctl restart odeme'")
  })

  test("KRIZ: mail ve sunucular ayni mesajda", async () => {
    const hooks = await freshPlugin()
    await kullanici(hooks, "s-kriz2", `kriz\n${KRIZ_MAILI}\nsunucular: db01`)
    await bash(hooks, "s-kriz2", "ssh db01 'systemctl restart odeme'")
  })

  test("yetki satiri dosyadan/eklerden (synthetic) gelemez, baska oturuma gecmez", async () => {
    const hooks = await freshPlugin()
    await kullanici(hooks, "s-sahte", "CN: CHG0000004\nsunucular: web01", true)
    await expect(bash(hooks, "s-sahte", "ssh web01 'systemctl restart x'")).rejects.toThrow(/K1/)
    await kullanici(hooks, "s-gercek", "CN: CHG0000004\nsunucular: web01")
    await expect(bash(hooks, "s-sahte", "ssh web01 'systemctl restart x'")).rejects.toThrow(/K1/)
  })

  test("YETKİ KAPAT sonrasi tekrar kilitli", async () => {
    const hooks = await freshPlugin()
    await kullanici(hooks, "s-kapat", "CN: CHG0000005\nsunucular: web01")
    await bash(hooks, "s-kapat", "ssh web01 'systemctl restart x'")
    await kullanici(hooks, "s-kapat", "yetki kapat")
    await expect(bash(hooks, "s-kapat", "ssh web01 'systemctl restart x'")).rejects.toThrow(/K1/)
  })

  test("bu makine: listede localhost varsa yerel sistem degisikligi calisir", async () => {
    const hooks = await freshPlugin()
    await kullanici(hooks, "s-yerel", "CN: CHG0000006\nsunucular: localhost")
    await bash(hooks, "s-yerel", "sudo systemctl restart chronyd")
    await bash(hooks, "s-yerel", "echo 'server ntp1' >> /etc/chrony.conf")
  })

  test("edit araci: sistem dosyasi = degisiklik, proje dosyasi serbest", async () => {
    const hooks = await freshPlugin()
    await expect(
      hooks["tool.execute.before"]!({ tool: "edit", sessionID: "s-edit", callID: "e1" }, { args: { filePath: "/etc/chrony.conf" } }),
    ).rejects.toThrow(/K1/)
    await hooks["tool.execute.before"]!({ tool: "edit", sessionID: "s-edit", callID: "e2" }, { args: { filePath: "playbooks/x.yml" } })
  })
})

describe("K6 oz-koruma — ajan kendi kilidini acamaz", () => {
  const home = process.env.HOME ?? "/root"
  const bashlar = [
    "cat ~/.config/opencode/opencode.json",
    "sed -i 's/ask/allow/' ~/.config/opencode/opencode.json",
    "rm ~/.config/opencode/plugins/audit-log.ts",
    `cp x.ts ${home}/.config/opencode/plugins/`,
    "OPS_AGENT_KAPI=GOZLEM opencode run 'merhaba'",
    "opencode run 'rm -rf /'",
    "export OPENCODE_CONFIG_CONTENT='{}'",
    "mkdir -p .opencode/plugins",
    `truncate -s0 ${"$"}{XDG_CONFIG_HOME}/opencode/opencode.json`,
  ]
  for (const k of bashlar) {
    test(`reddedilir: ${k}`, async () => {
      const hooks = await freshPlugin()
      await kullanici(hooks, "s-k6", "CN: CHG0000007\nsunucular: localhost")
      await expect(bash(hooks, "s-k6", k)).rejects.toThrow(/K6|K5/)
    })
  }
  test("audit log dosyasina dokunma reddedilir", async () => {
    const hooks = await freshPlugin()
    await expect(bash(hooks, "s-k6b", `rm ${auditPath}`)).rejects.toThrow(/K6/)
  })
  test("edit/write/okuma araclari: ayar, eklenti, anahtar dosyasi", async () => {
    const hooks = await freshPlugin()
    const dene = (tool: string, filePath: string) =>
      hooks["tool.execute.before"]!({ tool, sessionID: "s-k6c", callID: `${tool}-${filePath}` }, { args: { filePath } })
    await expect(dene("edit", `${home}/.config/opencode/opencode.json`)).rejects.toThrow(/K6/)
    await expect(dene("write", `${home}/.config/opencode/plugins/kapat.ts`)).rejects.toThrow(/K6/)
    await expect(dene("write", ".opencode/plugins/kapat.ts")).rejects.toThrow(/K6/)
    await expect(dene("write", "opencode.json")).rejects.toThrow(/K6/)
    await expect(dene("read", `${home}/.config/opencode/opencode.json`)).rejects.toThrow(/K6/)
    await expect(dene("read", `${home}/.local/share/opencode/auth.json`)).rejects.toThrow(/K6/)
    await dene("read", "README.md")
  })
  test("apply_patch icindeki yol da denetlenir", async () => {
    const hooks = await freshPlugin()
    const patchText = "*** Begin Patch\n*** Add File: .opencode/plugins/x.ts\n+export {}\n*** End Patch"
    await expect(
      hooks["tool.execute.before"]!({ tool: "apply_patch", sessionID: "s-k6d", callID: "p1" }, { args: { patchText } }),
    ).rejects.toThrow(/K6/)
  })
})

describe("K7 varsayilan kilitli; gozlem modu yalniz bilerek", () => {
  test("OPS_AGENT_KAPI=GOZLEM: engellemez ama kaydeder", async () => {
    const before = readAllLines().length
    const hooks = await freshPlugin({ enforce: false })
    await bash(hooks, "s-gozlem", "rm -rf /")
    const lines = readAllLines().slice(before)
    expect(lines.some((l) => l.result_status === "asked" && l.target.startsWith("K5 [GOZLEM]"))).toBe(true)
    assertChainIntact()
  })
  test("ortam degiskeni yoksa kilitli", async () => {
    const hooks = await freshPlugin()
    await expect(bash(hooks, "s-varsayilan", "rm -rf /")).rejects.toThrow(/K5/)
  })
})

describe("izin blogu (engine/opencode.json) — K3/K4", async () => {
  const { match } = await import("../../packages/core/src/util/wildcard")
  const cfg = JSON.parse(readFileSync(join(import.meta.dir, "..", "opencode.json"), "utf8")).permission
  // motorun kendi kuralı: permission/index.ts evaluate → findLast
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
  test("K3: icerik okuma sorulur, kendi dosyalari serbest", () => {
    expect(karar("read", "hosts.ini")).toBe("ask")
    expect(karar("read", "playbooks/site.yml")).toBe("ask")
    expect(karar("read", "AGENTS.md")).toBe("allow")
    expect(karar("bash", "cat hosts.ini")).toBe("ask")
    expect(karar("bash", "grep -r pass .")).toBe("ask")
    expect(karar("grep", "*")).toBe("ask")
    expect(karar("glob", "*")).toBe("allow")
  })
  test("K2: dizin disi sorulur; K6: ayar dosyasi duzenlenemez", () => {
    expect(cfg.external_directory).toBe("ask")
    expect(karar("edit", "opencode.json")).toBe("deny")
    expect(karar("edit", ".opencode/plugins/x.ts")).toBe("deny")
    expect(karar("edit", "playbooks/x.yml")).toBe("ask")
  })
})

describe("K1/K5 atlatma denemeleri", () => {
  const { writeFileSync } = require("fs")
  test("for dongusu icindeki ssh denetlenir", async () => {
    const hooks = await freshPlugin()
    await kullanici(hooks, "s-for", "CN: CHG0000008\nsunucular: web01, web02")
    await expect(bash(hooks, "s-for", "for h in web01 web02; do ssh $h 'systemctl restart x'; done")).rejects.toThrow(/belirlenemedi/)
    await bash(hooks, "s-for", "for h in web01 web02; do ssh $h uptime; done")
  })
  test("sshpass / ssh-copy-id / git -C push --force", async () => {
    const hooks = await freshPlugin()
    await expect(bash(hooks, "s-atl", "sshpass -p gizli ssh web01 'reboot'")).rejects.toThrow(/K1/)
    await expect(bash(hooks, "s-atl", "ssh-copy-id root@web01")).rejects.toThrow(/K1/)
    await expect(bash(hooks, "s-atl", "git -C repo push --force")).rejects.toThrow(/K5/)
  })
  test("modelin yazdigi betik icindeki komutlar da denetlenir", async () => {
    writeFileSync(join(workDir, "yeniden-baslat.sh"), "#!/bin/bash\nset -e\nssh web01 'systemctl restart odeme'\n")
    writeFileSync(join(workDir, "temizle.sh"), "rm -rf /var/*\n")
    writeFileSync(join(workDir, "rapor.sh"), "#!/usr/bin/env bash\nssh web01 'df -h'\n")
    const hooks = await freshPlugin({ projectDir: workDir })
    await expect(bash(hooks, "s-betik", "bash yeniden-baslat.sh")).rejects.toThrow(/K1/)
    await expect(bash(hooks, "s-betik", "./yeniden-baslat.sh")).rejects.toThrow(/K1/)
    await expect(bash(hooks, "s-betik", "sh temizle.sh")).rejects.toThrow(/K5/)
    await bash(hooks, "s-betik", "bash rapor.sh")
  })
})
