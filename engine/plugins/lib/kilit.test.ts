// kilit.test.ts — çekirdeğin MOTORDAN BAĞIMSIZ olduğunu gösterir (ADR-0005): opencode kancası, eklenti
// yükleyicisi ya da audit dosyası yok; yalnız girdi → karar. 2.x adaptörü de aynı sözleşmeyi kullanacak.
// Davranışın geniş testi ../audit-log.test.ts'te (1.x adaptörü üzerinden).
import { describe, expect, test } from "bun:test"
import { aralikAc, kilitDenetle, yetkiAktif, yetkiSatirlariniOku, type Yetki } from "./kilit"

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

describe("G62: uzakta kabuk döngüsü/koşulu — sözdizimi serbest, gövde ayrıca incelenir", () => {
  test("for … openssl … done serbest", () =>
    expect(kilitDenetle("bash", { command: `ssh m1 'for f in /x/*.crt; do printf "%s " "$f"; openssl x509 -enddate -noout -in "$f"; done | sort'` }, workdir, undefined)).toBeNull())
  test("if … then cat … fi serbest", () =>
    expect(kilitDenetle("bash", { command: `ssh m1 'if [ -f x ]; then cat x; fi'` }, workdir, undefined)).toBeNull())
  test("while read … done serbest", () =>
    expect(kilitDenetle("bash", { command: `ssh m1 'while read l; do echo $l; done < /etc/hosts'` }, workdir, undefined)).toBeNull())
  test("döngü gövdesinde değişiklik → K1", () =>
    expect(kilitDenetle("bash", { command: `ssh m1 'for f in a b; do rm -f $f; done'` }, workdir, undefined)?.kilit).toBe("K1"))
})

describe("G67: okuma yanlış alarmları (beceri taraması) serbest, değiştirenler K1", () => {
  const okur = [
    `ssh m1 "/var/lib/rancher/rke2/bin/rke2 certificate check --output table"`,
    `ssh m1 "rke2 secrets-encrypt status"`,
    `ssh m1 "rke2 etcd-snapshot list"`,
    `ssh m1 "rke2 -v | head -1"`,
    `ssh sat "hammer --version"`,
    `ssh sat "hammer host list --search 'os = RedHat'"`,
    `ssh sat "hammer content-view version list --organization Kurum"`,
    `ssh sat "hammer host list --help"`,
    `ssh m1 "sshd -T | grep -i permitrootlogin"`,
    `ssh m1 "sshd -T -C user=root,host=x,addr=1.2.3.4"`,
    `ssh m1 "pidstat -u 1 3"`,
    `ssh m1 "fincore /var/log/messages"`,
    `ssh m1 "dnf check"`,
    `ssh m1 "dnf update --security --assumeno"`,
    `ssh m1 "docker system df"`,
    `ssh m1 "podman volume ls"`,
    `ssh m1 "subscription-manager repos --list-enabled"`,
    `ssh m1 "kubectl apply -f x.yaml --dry-run=server"`,
    `ssh m1 "perf report -i /tmp/perf.data --stdio"`,
    `ssh m1 "rtla --help"`,
    `ssh sat "command -v hammer && hammer --version"`,
    `ssh -G web01 | head -3`,
  ]
  for (const c of okur) test(`serbest: ${c}`, () => expect(kilitDenetle("bash", { command: c }, workdir, undefined)).toBeNull())
  const degistirir = [
    `ssh m1 "rke2 certificate rotate"`,
    `ssh m1 "rke2 etcd-snapshot save"`,
    `ssh m1 "rke2 etcd-snapshot prune --snapshot-retention 2"`,
    `ssh m1 "rke2 secrets-encrypt rotate-keys"`,
    `ssh m1 "rke2 token create"`,
    `ssh sat "hammer content-view publish --name x"`,
    `ssh sat "hammer host update --name x --lifecycle-environment Prod"`,
    `ssh sat "hammer repository synchronize --id 3"`,
    `ssh m1 "sshd"`,
    `ssh m1 "sshd -D"`,
    `ssh m1 "dnf update --security"`,
    `ssh m1 "dnf update --assumeno -y"`,
    `ssh m1 "docker system prune -f"`,
    `ssh m1 "podman volume rm x"`,
    `ssh m1 "subscription-manager repos --enable x"`,
    `ssh m1 "kubectl apply -f x.yaml"`,
    `ssh m1 "kubectl apply -f x.yaml --dry-run=none"`,
    `ssh m1 "perf record -o /tmp/p.data -a"`,
    `ssh m1 "ethtool -s eth0 speed 100"`,
    `ssh m1 "./kur.sh --help"`,
    `ssh m1 "shutdown -h"`,
    `ssh m1 "command rm -f /tmp/x"`,
    `ssh web01 'systemctl restart x'`,
  ]
  for (const c of degistirir) test(`K1: ${c}`, () => expect(kilitDenetle("bash", { command: c }, workdir, undefined)?.kilit).toBe("K1"))
})

describe("G67: yetki serbest biçimde de anlaşılır (Alp: 'formatsız verdiğimde anlayabiliyor olması lazım')", () => {
  const oku = (m: string) => yetkiSatirlariniOku(m)
  test("eski biçim aynen", () => {
    const s = oku("CN: CHG0012345\nsunucular: web01, web02")
    expect(s.tur).toBe("CN")
    expect(s.cn).toBe("CHG0012345")
    expect(s.sunucular).toEqual(["web01", "web02"])
  })
  test("tek cümle: change numarası + sunucular", () => {
    const s = oku("CHG0012345 numaralı change ile stlrancherwor07, stlrancherwor08 ve stlrancherwor09 sunucularında çalışacağım")
    expect(s.tur).toBe("CN")
    expect(s.cn).toBe("CHG0012345")
    expect(s.sunucular).toEqual(["stlrancherwor07", "stlrancherwor08", "stlrancherwor09"])
  })
  test("'değişiklik numarası' + boşluklu liste, IP", () => {
    const s = oku("değişiklik numarası 4471230, sunucular 10.14.9.70 10.14.9.108")
    expect(s.cn).toBe("4471230")
    expect(s.sunucular).toEqual(["10.14.9.70", "10.14.9.108"])
  })
  test("CN satırı + alt alta maddeli liste (rakamsız ad dahil)", () => {
    const s = oku("Change: CRQ000123456\nŞu sunucular:\n- srvsatellite\n- splsonatype01\n* web01.kurum.local\n\nlütfen önce kontrol et")
    expect(s.cn).toBe("CRQ000123456")
    expect(s.sunucular).toEqual(["srvsatellite", "splsonatype01", "web01.kurum.local"])
  })
  test("iki change, iki grup sunucu → birleşik yetki", () => {
    const s = oku("CHG0000001: wor01 wor02 sunucuları\nCHG0000002 için db01 sunucusu")
    expect(s.cn).toBe("CHG0000001,CHG0000002")
    expect(s.sunucular).toEqual(["wor01", "wor02", "db01"])
  })
  test("hariç/dışında geçen satır EKLENMEZ, uyarı verir", () => {
    const s = oku("CHG0012345 ile web01 hariç tüm web sunucuları\nsunucular: web02, web03")
    expect(s.sunucular).toEqual(["web02", "web03"])
    expect(s.uyari).toContain("hariç")
  })
  test("CN beyanı olmayan sıradan soru yetki listesini DEĞİŞTİRMEZ", () => {
    const s = oku("web05 sunucusunda disk doldu, bakar mısın?")
    expect(s.tur).toBeUndefined()
    expect(s.sunucular).toBeUndefined()
  })
  test("KRİZ: yapıştırılan maildeki sunucu adları yetki açmaz, yalnız açık liste", () => {
    const mail = "KRİZ\nKonu: web07 ve web08 sunucularında servis kesintisi yaşanıyor, db03 sunucusu da etkilenmiş olabilir. ".repeat(2)
    expect(oku(mail).sunucular).toBeUndefined()
    expect(oku(mail + "\nsunucular: web07").sunucular).toEqual(["web07"])
  })
  test("sürüm, dosya adı, CN numarası sunucu sayılmaz", () => {
    const s = oku("CHG0099999 kapsamında rke2 sunucuları v1.33.13 sürümünden config.yaml ile wor10 node'una")
    expect(s.sunucular).toEqual(["wor10"])
  })
  test("kurulum + serbest liste", () => {
    const s = oku("yeni kurulum yapacağım, stlrancherwor15 ve stlrancherwor16 makinelerine")
    expect(s.tur).toBe("KURULUM")
    expect(s.sunucular).toEqual(["stlrancherwor15", "stlrancherwor16"])
  })
  test("uyarı K1 mesajında görünür", () => {
    const y = yetkiVer("CHG0012345 ile web01 hariç tüm sunucular")
    y.uyari = yetkiSatirlariniOku("CHG0012345 ile web01 hariç tüm sunucular").uyari
    expect(kilitDenetle("bash", { command: "ssh web01 'systemctl restart x'" }, workdir, y)?.mesaj).toContain("hariç")
  })
})

describe("G68: kilidin tanımadığı uzak komut engellenmez, kullanıcıya SORULUR", () => {
  const karar = (c: string, y?: Yetki) => kilitDenetle("bash", { command: c }, workdir, y)
  test("tanınmayan kurum aracı → sor", () => {
    const r = karar(`ssh m1 "seplpkg --platform rhel ls"`)
    expect(r?.kilit).toBe("K1")
    expect(r?.sor).toBe(true)
  })
  test("yerel betik / python betiği uzakta → sor", () => {
    expect(karar(`ssh m1 "/opt/kurum/bin/durum.sh"`)?.sor).toBe(true)
    expect(karar(`ssh m1 "python3 /opt/x/rapor.py"`)?.sor).toBe(true)
  })
  test("bilinen değiştirici → sorulmaz, engellenir", () => {
    for (const c of [`ssh m1 "systemctl restart x"`, `ssh m1 "rm -f /etc/x"`, `ssh m1 "dnf -y install x"`, `ssh m1 "kubectl delete pod x"`,
      `ssh m1 "chronyc makestep"`, `ssh m1 "localectl set-locale LANG=C"`, `ssh m1 "mkfs.xfs /dev/sdb"`])
      expect(karar(c)?.sor).toBeUndefined()
  })
  test("belirsiz + bilinen değişiklik aynı komutta → engel (sorulmaz)", () => {
    const r = karar(`ssh m1 "durum-araci --x; systemctl restart y"`)
    expect(r?.kilit).toBe("K1")
    expect(r?.sor).toBeUndefined()
  })
  test("yetki var ve hedef listede → belirsiz de serbest", () => {
    const y = yetkiVer("CN: CHG0000777\nsunucular: m1")
    expect(karar(`ssh m1 "durum-araci --x"`, y)).toBeNull()
  })
  test("yetki var ama hedef listede yok → sor", () => {
    const y = yetkiVer("CN: CHG0000777\nsunucular: m1")
    expect(karar(`ssh m2 "durum-araci --x"`, y)?.sor).toBe(true)
  })
  test("K5 yıkıcı ve awk system() sorulmaz", () => {
    expect(karar("rm -rf /")?.kilit).toBe("K5")
    expect(karar(`ssh m1 "awk 'BEGIN{system(\\"id\\")}'"`)?.sor).toBeUndefined()
    expect(karar(`ssh m1 "awk 'BEGIN{system(\\"id\\")}'"`)?.kilit).toBe("K1")
  })
  test("okuma biçimleri hâlâ serbest: awk yazdırma, chronyc tracking, localectl status", () => {
    for (const c of [`ssh m1 "df -h | awk '{print \\$5}'"`, `ssh m1 "chronyc tracking"`, `ssh m1 "localectl status"`])
      expect(karar(c)).toBeNull()
  })
})

describe("G71: NFS/port teşhisi uzakta okuma — /dev/tcp soket yolu dosya değil", () => {
  const karar = (c: string) => kilitDenetle("bash", { command: c }, workdir, undefined)
  test("bash /dev/tcp port testi ve NFS sorguları serbest", () => {
    for (const c of [
      `ssh m1 "timeout 3 bash -c 'echo >/dev/tcp/nfs01/2049' && echo open || echo closed"`,
      `ssh m1 "timeout 3 bash -c 'exec 3<>/dev/tcp/nfs01/2049 && echo open && exec 3>&-'"`,
      `ssh m1 "echo x > /dev/udp/10.0.0.1/514"`,
      `ssh m1 "showmount -e nfs01; rpcinfo -p nfs01; rpcinfo -s nfs01"`,
      `ssh m1 "mount; mount -l; mount -t nfs,nfs4; findmnt -t nfs,nfs4; nfsstat -m; mountpoint /data; exportfs -v"`,
    ])
      expect(karar(c)).toBeNull()
  })
  test("gerçek bağlama/değişiklik hâlâ K1", () => {
    for (const c of [
      `ssh m1 "mount -t nfs nfs01:/x /mnt"`,
      `ssh m1 "mount -a"`,
      `ssh m1 "mount -o remount,rw /"`,
      `ssh m1 "rpcinfo -d 100003 3"`,
      `ssh m1 "nfsstat -z"`,
      `ssh m1 "exportfs -ra"`,
      `ssh m1 "echo x > /etc/hosts"`,
      `ssh m1 "exec 3<>/var/tmp/x"`,
    ]) {
      const r = karar(c)
      expect(r?.kilit).toBe("K1")
      expect(r?.sor).toBeUndefined()
    }
  })
})

describe("G73: KRİZ cümle içinde anlaşılır (Alp: 'kriz var deyince … kabul etmesi lazım, illa bir formatta değil')", () => {
  const oku = yetkiSatirlariniOku
  const beyan = ["kriz var", "Kriz var, hemen bakmamız lazım", "şu an KRİZ VAR", "krizdeyiz", "kriz durumundayız",
    "prod'da kriz yaşıyoruz", "acil kriz", "bu bir kriz.", "KRİZ", "kriz: wor14 düşüyor", "Kriz başladı"]
  for (const m of beyan) test(`beyan: "${m}"`, () => expect(oku(m).tur).toBe("KRIZ"))
  const degil = ["kriz yok", "kriz değil bu", "kriz bitti", "kriz mi var?", "geçen haftaki kriz raporunu incele",
    "krizi anlat", "kriz yönetimi dokümanı nerede", "krizin sebebi ne"]
  for (const m of degil) test(`beyan DEĞİL: "${m}"`, () => expect(oku(m).tur).toBeUndefined())
  test("CN aynı mesajdaysa CN geçerli (kriz sözü CN'yi ezmez)", () => {
    expect(oku("kriz var, CHG0012345 ile web01 sunucusunda").tur).toBe("CN")
  })
  test("kısa kriz cümlesindeki sunucular alınır", () => {
    const s = oku("kriz var, stlrancherwor07 ve stlrancherwor14'te xdr kapatılacak")
    expect(s.tur).toBe("KRIZ")
    expect(s.sunucular).toEqual(["stlrancherwor07", "stlrancherwor14"])
  })
  test("kriz cümlesinin altındaki alt alta liste alınır", () => {
    expect(oku("kriz var, şu makinelerde:\nwor07\nwor14").sunucular).toEqual(["wor07", "wor14"])
  })
  test("mail yapıştırılan mesajda serbest adlar alınmaz, kriz metni sayılır", () => {
    const mail = "kriz var\nKonu: web07 ve web08 sunucularında ödeme servisi kesintisi yaşanıyor; db03 sunucusu da etkilenmiş olabilir, toplantıda kararlaştırıldı."
    const s = oku(mail)
    expect(s.tur).toBe("KRIZ")
    expect(s.sunucular).toBeUndefined()
    expect(s.govde).toBeGreaterThanOrEqual(120)
  })
})

describe("G73: düz listeli for döngüsünde hedefler tek tek denetlenir", () => {
  const karar = (c: string, y?: Yetki) => kilitDenetle("bash", { command: c }, workdir, y)
  const dongu = `for ip in 10.0.0.7 10.0.0.8; do echo "=== $ip ==="; timeout 10 ssh -o ConnectTimeout=5 root@$ip "systemctl disable traps_pmd.service 2>&1; systemctl is-enabled traps_pmd.service"; done`
  test("yetki yok → K1, hedefler adıyla (belirsiz değil)", () => {
    const r = karar(dongu)
    expect(r?.kilit).toBe("K1")
    expect(r?.mesaj).toContain("10.0.0.7")
    expect(r?.mesaj).toContain("10.0.0.8")
    expect(r?.mesaj).not.toContain("hedefi belirlenemedi")
  })
  test("yetki listesi döngüdeki tüm hedefleri kapsıyorsa geçer, biri eksikse yalnız o söylenir", () => {
    expect(karar(dongu, yetkiVer("CN: CHG0000777\nsunucular: 10.0.0.7, 10.0.0.8"))).toBeNull()
    const r = karar(dongu, yetkiVer("CN: CHG0000777\nsunucular: 10.0.0.7"))
    expect(r?.mesaj).toContain("listesinde yok: 10.0.0.8")
  })
  test("okuma döngüsü serbest; liste değişken/komut ikamesiyse hedef belirsiz kalır", () => {
    expect(karar(`for h in m1 m2; do ssh $h "uptime"; done`)).toBeNull()
    expect(karar(`for h in $(cat liste); do ssh $h "systemctl restart x"; done`)?.mesaj).toContain("hedefi belirlenemedi")
    expect(karar(`for h in $HOSTS; do ssh $h "systemctl restart x"; done`)?.mesaj).toContain("hedefi belirlenemedi")
  })
})

describe("G73: aralık yazımı açılır (wor07-14, 10.0.0.127-134)", () => {
  test("ad ve IP aralığı", () => {
    expect(aralikAc("wor07-14")).toEqual(["wor07", "wor08", "wor09", "wor10", "wor11", "wor12", "wor13", "wor14"])
    expect(aralikAc("stlrancherwor07-stlrancherwor09")).toEqual(["stlrancherwor07", "stlrancherwor08", "stlrancherwor09"])
    expect(aralikAc("10.0.0.127-129")).toEqual(["10.0.0.127", "10.0.0.128", "10.0.0.129"])
  })
  test("aralık olmayanlar olduğu gibi", () => {
    for (const t of ["web-01", "wor14-10", "wor01-99999", "rke2-1", "10.0.0.1-300"]) expect(aralikAc(t)).toEqual([t])
  })
  test("kriz cümlesinde aralık", () => {
    expect(yetkiSatirlariniOku("kriz var, wor07-09 arası xdr kapatılacak").sunucular).toEqual(["wor07", "wor08", "wor09"])
    expect(yetkiSatirlariniOku("CHG0012345\nsunucular: 10.0.0.127-128").sunucular).toEqual(["10.0.0.127", "10.0.0.128"])
  })
})

describe("G74: envanter eşlemesi — ad, kısa ad, IP, grup (yetki verildiği anda)", () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = require("fs") as typeof import("fs")
  const { tmpdir } = require("os") as typeof import("os")
  const { join } = require("path") as typeof import("path")
  const { yetkiIsle } = require("./denetim") as typeof import("./denetim")
  const dizin = mkdtempSync(join(tmpdir(), "envanter-"))
  mkdirSync(join(dizin, "ansible", "inventories"), { recursive: true })
  writeFileSync(join(dizin, "ansible", "inventories", "hosts-rke2.ini"), [
    "[rke-nonprod-test-workers]",
    "stlrancherwor07 ansible_host=10.0.9.127",
    "stlrancherwor08 ansible_host=10.0.9.128   # yorum",
    "stlrancherwor14 ansible_host=10.0.9.134",
    "[gpu-workers]",
    "sdlgpuh200w[1:2]",
    "gpuwor07 ansible_host=10.0.8.7",
    "[rke-nonprod-test:children]",
    "rke-nonprod-test-workers",
    "[rke-nonprod-test:vars]",
    "ansible_user=root",
  ].join("\n"))
  const ver = (metin: string) => {
    const m = new Map<string, Yetki>()
    yetkiIsle(m, "s", metin, Date.now(), dizin)
    return m.get("s")!
  }
  const karar = (c: string, y: Yetki) => kilitDenetle("bash", { command: c }, dizin, y)
  test("adla yetki → IP ile komut geçer", () => {
    const y = ver("kriz var, stlrancherwor07 ve stlrancherwor14'te xdr kapatılacak")
    expect(karar(`ssh root@10.0.9.127 "systemctl disable traps_pmd"`, y)).toBeNull()
    expect(karar(`ssh root@10.0.9.134 "systemctl disable traps_pmd"`, y)).toBeNull()
    expect(karar(`ssh root@10.0.9.128 "systemctl disable traps_pmd"`, y)?.mesaj).toContain("10.0.9.128")
  })
  test("IP ile yetki → adla komut geçer", () => {
    const y = ver("CHG0012345 ile 10.0.9.128 sunucusunda")
    expect(karar(`ssh stlrancherwor08 "systemctl restart x"`, y)).toBeNull()
  })
  test("kısa ad + aralık: wor07-08 → stlrancherwor07/08 (gpuwor07 değil — tek eşleşme şartı)", () => {
    const y = ver("kriz var, wor13-14 ve wor08 makinelerinde")
    expect(karar(`ssh 10.0.9.134 "systemctl restart x"`, y)).toBeNull()
    expect(karar(`ssh stlrancherwor08 "systemctl restart x"`, y)).toBeNull()
    expect(y.envanterNotu).toContain("wor13")
    const y2 = ver("kriz var, wor07 sunucusunda")
    expect(y2.envanterNotu).toContain("birden çok")
    expect(karar(`ssh 10.0.9.127 "systemctl restart x"`, y2)?.kilit).toBe("K1")
  })
  test("grup adı → üyeler (children dahil); for döngüsüyle IP'ler", () => {
    const y = ver("CHG0012345 sunucular: rke-nonprod-test")
    expect(karar(`for ip in 10.0.9.127 10.0.9.128 10.0.9.134; do ssh root@$ip "systemctl disable traps_pmd"; done`, y)).toBeNull()
    expect(karar(`ssh 10.0.8.7 "systemctl restart x"`, y)?.kilit).toBe("K1")
  })
  test("ansible aralık deseni açılır", () => {
    const y = ver("CHG0012345 sunucular: gpu-workers")
    expect(karar(`ssh sdlgpuh200w2 "systemctl restart x"`, y)).toBeNull()
  })
  test("yetkiden SONRA envanter değişirse verilmiş yetki genişlemez", () => {
    const y = ver("CHG0012345 sunucular: stlrancherwor07")
    writeFileSync(join(dizin, "ansible", "inventories", "ek.ini"), "stlrancherwor07 ansible_host=10.0.9.99\n")
    expect(karar(`ssh 10.0.9.99 "systemctl restart x"`, y)?.kilit).toBe("K1")
  })
})

describe("G78: 'kiriz' yazım hatası ve yalın '07-14' aralığı (Alp: 'kiriz var şu 2 komudu 07-14 arasında çalıştır')", () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = require("fs") as typeof import("fs")
  const { tmpdir } = require("os") as typeof import("os")
  const { join } = require("path") as typeof import("path")
  const { yetkiIsle } = require("./denetim") as typeof import("./denetim")
  test("kiriz / krıız / kirizdeyiz beyan; 'kırız' gibi başka sözcük değil", () => {
    for (const m of ["kiriz var şu 2 komudu 07-14 arasında çalıştır", "KİRİZ VAR", "kirizdeyiz", "kriiz var"])
      expect(yetkiSatirlariniOku(m).tur).toBe("KRIZ")
    for (const m of ["bardakları kırız", "kiriz yok", "kiriz."]) expect(yetkiSatirlariniOku(m).tur).toBeUndefined()
  })
  const dizin = mkdtempSync(join(tmpdir(), "envanter-g78-"))
  mkdirSync(join(dizin, "ansible", "inventories"), { recursive: true })
  writeFileSync(join(dizin, "ansible", "inventories", "hosts-rke2.ini"), [
    "[test]", ...Array.from({ length: 14 }, (_, i) => `stlrancherwor${String(i + 1).padStart(2, "0")} ansible_host=10.0.9.${121 + i}`),
    "stlranchermas01", "stlranchermas02", "[gpu]", "sdlgpuworker1", "sdlgpuworker2",
  ].join("\n"))
  const ver = (metin: string) => {
    const m = new Map<string, Yetki>()
    yetkiIsle(m, "s", metin, Date.now(), dizin)
    return m.get("s")!
  }
  const karar = (c: string, y: Yetki) => kilitDenetle("bash", { command: c }, dizin, y)
  test("'07-14' → tek önek stlrancherwor07…14; adla ve IP ile geçer, 06 ve mas01 geçmez", () => {
    const y = ver("kiriz var şu 2 komudu 07-14 arasında çalıştır. /usr/lib/symantec/stop.sh\nsystemctl stop traps_pmd.service")
    expect(y.tur).toBe("KRIZ")
    expect(y.envanterNotu).toContain("stlrancherwor07…stlrancherwor14")
    expect(karar(`ssh stlrancherwor07 "systemctl stop traps_pmd.service"`, y)).toBeNull()
    expect(karar(`ssh root@10.0.9.134 "systemctl stop traps_pmd.service"`, y)).toBeNull()
    expect(karar(`ssh stlrancherwor06 "systemctl stop traps_pmd.service"`, y)?.kilit).toBe("K1")
    expect(karar(`ssh stlranchermas01 "systemctl stop traps_pmd.service"`, y)?.kilit).toBe("K1")
  })
  test("aralığı eksiksiz karşılayan önek yoksa hiçbir host açılmaz", () => {
    const y = ver("kriz var 01-02 arasında")
    // stlrancherwor01-02 ve stlranchermas01-02 ikisi de tutar → belirsiz, genişletilmez
    expect(y.envanterNotu).toContain("birden çok")
    expect(karar(`ssh stlrancherwor01 "systemctl stop x"`, y)?.kilit).toBe("K1")
    const y2 = ver("kriz var 13-16 arasında")
    expect(y2.envanterNotu).toContain("envanterde yok")
  })
  test("K1 mesajı ajana atlatma denemesini yasaklar", () => {
    const y = ver("kriz var 07-08 arasında")
    expect(karar(`ssh stlrancherwor09 "systemctl stop x"`, y)?.mesaj).toContain("kilit YALNIZ kullanıcının mesajını okur")
  })
})
