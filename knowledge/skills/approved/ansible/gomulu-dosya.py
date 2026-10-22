#!/usr/bin/env python3
# gomulu-dosya.py — bir dosyayı (sertifika, ayar, repo dosyası …) sunuculara dağıtan playbook'u, içerik playbook'a METİN
# olarak gömülü (ansible.builtin.copy content: |) üretir. İçeriği model yazmaz: betik dosyayı bayt bayt okur, YAML blok
# metnine çevirir, sha256'yı başlığa ve doğrulama görevine yazar → base64/PEM tek karakter bozulamaz.
# Saha G101 (Alp, 2026-10-22): "sertifikayı Ansible'ın içine text olarak gömdük, dosya olarak eklemedik, copy kullandık — o daha iyi".
import datetime
import hashlib
import os
import re
import subprocess
import sys

KULLANIM = """kullanım:
  gomulu-dosya.py --kaynak <dosya|-> --hedef <uzak yol> --hosts <grup|ad,ad> --cikti <playbook.yml>
                  [--mod 0644] [--sahip root] [--grup root] [--sonra "<komut>"] [--ad "<görev adı>"] [--anahtar] [--yedek]
  Uzaktaki dosyadan: ssh root@<kaynak-sunucu> cat <yol> | gomulu-dosya.py --kaynak - …
--sonra: içerik DEĞİŞTİYSE çalışacak komut (handler), ör. "update-ca-trust extract", "systemctl reload nginx".
--yedek: eski dosyayı yanına <ad>.<tarih>~ olarak saklar — /etc/pki/ca-trust/source/anchors gibi dizindeki HER dosyanın okunduğu
yerlerde VERME (eski sertifika da güvenilir kalır).
Sertifika (.crt/.pem/.cer) openssl ile denetlenir; özel anahtar yalnız --anahtar ile (mod 0600, no_log).
Var olan --cikti dosyasının üzerine yazmaz."""


def arg(argv, ad, vars_=None):
    if ad in argv:
        i = argv.index(ad)
        if i + 1 < len(argv):
            return argv[i + 1]
    return vars_


def yaml_dize(s):
    return "'" + s.replace("'", "''") + "'"


def main(argv):
    if not argv or "-h" in argv or "--help" in argv:
        print(KULLANIM)
        return 0
    kaynak, hedef, hosts, cikti = (arg(argv, "--kaynak"), arg(argv, "--hedef"), arg(argv, "--hosts"), arg(argv, "--cikti"))
    if not (kaynak and hedef and hosts and cikti):
        print(KULLANIM)
        return 1
    if not hedef.startswith("/") or hedef.endswith("/"):
        print("--hedef tam dosya yolu olmalı (/etc/pki/ca-trust/source/anchors/x.crt gibi), dizin değil")
        return 1
    if os.path.exists(cikti):
        print("var olan dosya: %s — üzerine yazılmadı (yeni ad ver)" % cikti)
        return 1
    ham = sys.stdin.buffer.read() if kaynak == "-" else open(kaynak, "rb").read()
    if not ham.strip():
        print("kaynak boş")
        return 1
    try:
        metin = ham.decode("utf-8")
    except UnicodeDecodeError:
        print("kaynak metin değil (ikili dosya) — gömülmez; ansible.builtin.copy src: ile dosya olarak dağıt")
        return 1
    if "\t" in metin or "\r" in metin:
        print("kaynakta TAB/CR var — YAML blok içinde bozulabilir; dosyayı düzelt ya da src: ile dağıt")
        return 1
    anahtar = "PRIVATE KEY" in metin
    if anahtar and "--anahtar" not in argv:
        print("kaynakta özel anahtar var — bilerek gömmek için --anahtar ver (mod 0600, no_log). Git'e commit'lenen dizine koyma.")
        return 1
    if not metin.endswith("\n"):
        metin += "\n"
    sha = hashlib.sha256(metin.encode("utf-8")).hexdigest()

    ozet = []
    sertifika = "BEGIN CERTIFICATE" in metin
    if sertifika:
        try:
            r = subprocess.run(["openssl", "x509", "-noout", "-subject", "-issuer", "-enddate", "-fingerprint", "-sha256"],
                               input=metin.encode(), capture_output=True, timeout=10)
            if r.returncode != 0:
                print("openssl sertifikayı okuyamadı — içerik bozuk olabilir, gömülmedi:\n" + r.stderr.decode(errors="replace"))
                return 1
            ozet = [s.strip() for s in r.stdout.decode(errors="replace").splitlines() if s.strip()]
            ozet.append("sertifika sayısı: %d" % metin.count("BEGIN CERTIFICATE"))
        except FileNotFoundError:
            ozet = ["openssl yok — sertifika denetlenmedi"]

    mod = arg(argv, "--mod", "0600" if anahtar else "0644")
    if not re.fullmatch(r"0[0-7]{3}", mod):
        print("--mod 4 haneli sekizli olmalı (0644)")
        return 1
    sahip, grup = arg(argv, "--sahip", "root"), arg(argv, "--grup", "root")
    sonra = arg(argv, "--sonra")
    gorev = arg(argv, "--ad", "%s dağıt" % os.path.basename(hedef))
    simdi = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    y = [
        "---",
        "# Üreten: gomulu-dosya.py — %s" % simdi,
        "# İçerik gömülü (copy content) — elle düzenleme; değişecekse betikle yeniden üret.",
        "# Kaynak: %s · sha256: %s" % ("stdin" if kaynak == "-" else kaynak, sha),
    ]
    y += ["# " + s for s in ozet]
    y += [
        "- name: %s" % gorev,
        "  hosts: %s" % hosts,
        "  gather_facts: false",
        "  tasks:",
        "    - name: %s" % gorev,
        "      ansible.builtin.copy:",
        "        dest: %s" % yaml_dize(hedef),
        "        owner: %s" % sahip,
        "        group: %s" % grup,
        "        mode: '%s'" % mod,
    ]
    if "--yedek" in argv:
        y.append("        backup: true")
    if sertifika:
        y.append("        validate: openssl x509 -noout -in %s")
    y.append("        content: |")
    y += [("          " + s) if s else "" for s in metin.rstrip("\n").split("\n")]
    if anahtar:
        y.append("      no_log: true")
    if sonra:
        y.append("      notify: sonraki adim")
    y += [
        "",
        "    - name: sha256 doğrula (%s)" % sha[:12],
        "      ansible.builtin.stat:",
        "        path: %s" % yaml_dize(hedef),
        "        checksum_algorithm: sha256",
        "      register: gomulu_stat",
        "    - name: içerik betiğin ürettiğiyle aynı mı",
        "      ansible.builtin.assert:",
        "        that: gomulu_stat.stat.checksum == '%s'" % sha,
        "        quiet: true",
        "      when: not ansible_check_mode",
    ]
    if sonra:
        y += [
            "",
            "  handlers:",
            "    - name: sonraki adim",
            "      ansible.builtin.command: %s" % yaml_dize(sonra),
        ]
    os.makedirs(os.path.dirname(os.path.abspath(cikti)), exist_ok=True)
    with open(cikti, "w", encoding="utf-8") as f:
        f.write("\n".join(y) + "\n")

    print("yazıldı: %s" % cikti)
    print("  hedef: %s (%s %s:%s)%s" % (hedef, mod, sahip, grup, " · sonra: " + sonra if sonra else ""))
    print("  sha256: %s · %d satır" % (sha, metin.count("\n")))
    for s in ozet:
        print("  " + s)
    if anahtar:
        print("⚠️ özel anahtar gömüldü (no_log, 0600) — dosyayı git'e commit'leme")
    print("sözdizimi: ansible-playbook --syntax-check %s" % cikti)
    print("kuru:      ansible-playbook -i <iş envanteri> --limit <liste> %s --check --diff" % cikti)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
