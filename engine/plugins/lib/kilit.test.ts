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

describe("T30: kurulum beyanı harf duyarsız, doğal cümlede de tanınır", () => {
  const beyanlar = [
    "KURULUM",
    "kurulum",
    "Kurulum",
    "kurulum yapacağım",
    "Kurulum yapacağım",
    "KURULUM YAPACAĞIM",
    "bu makinelere kurulum yapacağım",
    "yeni kurulum",
    "Yeni Kurulum",
    "YENİ KURULUM",
    "- **Kurulum** yapıyorum",
    "tamam, kurulum.",
  ]
  for (const m of beyanlar)
    test(`beyan: "${m}"`, () => {
      expect(yetkiSatirlariniOku(`${m}\nsunucular: yeni01`).tur).toBe("KURULUM")
    })
  const degil = ["kurulumu kontrol et", "kurulumda hata var", "kurulum yapmayacağım", "Kurulum yapma", "kurulumcu", "ön-kurulumlar"]
  for (const m of degil)
    test(`beyan DEĞİL: "${m}"`, () => {
      expect(yetkiSatirlariniOku(m).tur).toBeUndefined()
    })
  test("CN ve sunucular satırı da harf duyarsız", () => {
    const s = yetkiSatirlariniOku("cn: chg0012345\nSUNUCULAR: Yeni01, YENI02")
    expect(s.tur).toBe("CN")
    expect(s.cn).toBe("CHG0012345")
    expect(s.sunucular).toEqual(["yeni01", "yeni02"])
  })
  test("kilit kalır: beyan var ama sunucu listesi yoksa değişiklik yine K1", () => {
    const y = yetkiVer("kurulum yapacağım")
    expect(yetkiAktif(y, Date.now())).toBe(false)
    expect(kilitDenetle("bash", { command: "ssh yeni01 'dnf -y install chrony'" }, workdir, y)?.kilit).toBe("K1")
    const y2 = yetkiVer("kurulum yapacağım\nsunucular: yeni01")
    expect(kilitDenetle("bash", { command: "ssh yeni01 'dnf -y install chrony'" }, workdir, y2)).toBeNull()
  })
})

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
    expect(kilitDenetle("bash", { command: "sed -i s/a/b/ ~/.config/opencode/opencode.json" }, workdir, y)?.kilit).toBe("K6")
    expect(kilitDenetle("bash", { command: "cat ~/.config/opencode/opencode.json" }, workdir, y)).toBeNull()
  })
  test("bilinmeyen araç → karar yok (adaptör yalnız tanıdığı araçları sorar)", () => {
    expect(kilitDenetle("webfetch", { url: "https://x" }, workdir, undefined)).toBeNull()
  })
})

describe("G57: GPU/depolama denetim komutları uzakta salt-okunur, değiştirenler K1", () => {
  const okur = [
    `ssh h200 "nvidia-smi --query-gpu=index,name,power.draw --format=csv"`,
    `ssh h200 "nvidia-smi topo -m"`,
    `ssh h200 "nvidia-smi -q -d PERFORMANCE"`,
    `ssh h200 "nvidia-smi -q | grep -i -A3 fabric"`,
    `ssh h200 "nvidia-smi -i 0 --query-gpu=pci.bus_id --format=csv"`,
    `ssh h200 "nvidia-smi dmon -s pucm -c 10"`,
    `ssh h200 "mdadm --detail /dev/md0"`,
    `ssh h200 "nvme smart-log /dev/nvme0"`,
    `ssh h200 "xfs_info /models"`,
    `ssh h200 "cpupower frequency-info -p"`,
    `ssh w3 "/var/lib/rancher/rke2/bin/crictl ps"`,
    `ssh w3 "vmware-toolbox-cmd stat balloon"`,
  ]
  for (const c of okur) test(`serbest: ${c}`, () => expect(kilitDenetle("bash", { command: c }, workdir, undefined)).toBeNull())
  const degistirir = [
    `ssh h200 "nvidia-smi -pm 1"`,
    `ssh h200 "nvidia-smi -pl 500"`,
    `ssh h200 "nvidia-smi -i 0 -r"`,
    `ssh h200 "nvidia-smi --gpu-reset -i 0"`,
    `ssh h200 "nvidia-smi -mig 1"`,
    `ssh h200 "nvidia-smi -q -f /tmp/x"`,
    `ssh h200 "nvidia-smi mig -cgi 9"`,
    `ssh h200 "nvidia-smi nvlink -r"`,
    `ssh h200 "mdadm --fail /dev/md0 /dev/nvme1n1"`,
    `ssh h200 "nvme format /dev/nvme0"`,
    `ssh h200 "cpupower frequency-set -g performance"`,
    `ssh w3 "crictl rm abc"`,
  ]
  for (const c of degistirir) test(`K1: ${c}`, () => expect(kilitDenetle("bash", { command: c }, workdir, undefined)?.kilit).toBe("K1"))
})

describe("G58: etcdctl / ctr / containerd / json.tool okumaları serbest, değiştirenler K1", () => {
  const okur = [
    `ssh m1 "curl -sk https://r/v3/clusters | python3 -m json.tool | head -50"`,
    `ssh m1 "etcdctl --endpoints https://127.0.0.1:2379 --cacert /a --cert /b --key /c member list -w table"`,
    `ssh m1 "etcdctl endpoint status --cluster -w table"`,
    `ssh m1 "etcdctl get /registry/ --prefix --keys-only"`,
    `ssh m1 "etcdctl get /registry/secrets/default/x"`,
    `ssh m1 "ctr -n k8s.io containers ls"`,
    `ssh m1 "/var/lib/rancher/rke2/bin/containerd --version"`,
  ]
  for (const c of okur) test(`serbest: ${c}`, () => expect(kilitDenetle("bash", { command: c }, workdir, undefined)).toBeNull())
  const degistirir = [
    `ssh m1 "python3 -c 'import os'"`,
    `ssh m1 "python3 -m json.tool in.json out.json"`,
    `ssh m1 "etcdctl put a b"`,
    `ssh m1 "etcdctl defrag"`,
    `ssh m1 "etcdctl snapshot save /tmp/s"`,
    `ssh m1 "etcdctl member remove 123"`,
    `ssh m1 "ctr -n k8s.io images rm x"`,
    `ssh m1 "ctr -n k8s.io tasks kill x"`,
  ]
  for (const c of degistirir) test(`K1: ${c}`, () => expect(kilitDenetle("bash", { command: c }, workdir, undefined)?.kilit).toBe("K1"))
})
