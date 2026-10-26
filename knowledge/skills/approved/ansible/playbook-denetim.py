#!/usr/bin/env python3
# playbook-denetim.py — playbook'u ÇALIŞTIRMADAN okuyup bilinen hata kalıplarını satır numarasıyla listeler (ağ yok, ansible-lint
# gerektirmez; PyYAML ansible'ın kendi bağımlılığı). Kurallar sahada görülen hatalardan:
#   G26: shell'de `| tail` çıkış kodunu yutar, koşulsuz "complete" yankısı, --skip-broken
#   G43: curl -s (-f yok) HTTP hatasını dosyaya yazar, sessiz kalır
#   G93: hosts: all, play düzeyi ignore_errors, yorumdaki ön koşul, kaldır → sonra indir sırası, NOPASSWD, düz parola
# Yalnız okur; dosya değiştirmez. Bulgu ≠ hata: kullanıcıya liste olarak söylenir, düzeltme kararı onun.
import os
import re
import sys

KULLANIM = """kullanım: playbook-denetim.py <playbook.yml|dizin> [...]
  Dizin verilirse içindeki *.yml/*.yaml (alt dizine inmez). Çıkış: 0 bulgu yok · 1 UYARI var · 2 okunamadı/ayrıştırılamadı.
  Önem: ENGEL (çalışmaz/yanlış hedef) · UYARI (sessiz hata, tekrar çalıştırılamaz, güvenlik) · NOT (iyileştirme)."""

try:
    import yaml
except ImportError:  # ansible kurulu python'da vardır; başka python3 ile çağrıldıysa
    yaml = None

MODUL_KARSILIGI = [
    (r"\b(dnf|yum)\s+(-y\s+)?(install|remove|update|upgrade)\b", "ansible.builtin.dnf"),
    (r"\bsystemctl\s+(start|stop|restart|reload|enable|disable)\b", "ansible.builtin.systemd_service"),
    (r"\b(useradd|usermod|userdel)\b", "ansible.builtin.user (kurumda kullanıcı IdM'de — rhel-yonetim)"),
    (r"\bmkdir\s", "ansible.builtin.file state=directory"),
    (r"(^|[;&|]\s*)reboot\b|\bshutdown\s+-r\b", "ansible.builtin.reboot"),
    (r"\bsed\s+-i\b", "ansible.builtin.lineinfile / replace"),
    (r"\b(curl|wget)\s", "ansible.builtin.get_url (checksum: ile)"),
]
KOMUT_MODULLERI = {"shell", "command", "raw", "script"}
GIZLI_ANAHTAR = re.compile(r"(passw|parola|sifre|şifre|secret|token|api_?key)", re.I)
KALDIR_KOMUT = re.compile(r"\b(rpm\s+-e|(dnf|yum)\s+(-y\s+)?(remove|erase)|uninstall)\b", re.I)
INDIR_KOMUT = re.compile(r"\b(curl|wget)\s", re.I)
GOREV_LISTELERI = ("tasks", "pre_tasks", "post_tasks", "handlers")
BLOK = ("block", "rescue", "always")
OZEL_ANAHTAR = {"name", "when", "register", "become", "become_user", "tags", "notify", "loop", "with_items", "vars",
                "ignore_errors", "changed_when", "failed_when", "no_log", "delegate_to", "run_once", "args", "environment",
                "until", "retries", "delay", "check_mode", "diff", "listen", "loop_control", "timeout", "any_errors_fatal",
                "become_method", "connection", "throttle", "local_action", "async", "poll", "debugger", "module_defaults",
                "collections", "__satir__", "__handler__"}


def yukleyici():
    class SatirliYukleyici(yaml.SafeLoader):
        pass

    def esle(loader, node, deep=False):
        d = yaml.SafeLoader.construct_mapping(loader, node, deep=deep)
        d["__satir__"] = node.start_mark.line + 1
        return d

    SatirliYukleyici.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, esle)
    return SatirliYukleyici


def modul_ve_arg(gorev):
    for k, v in gorev.items():
        if k in OZEL_ANAHTAR or k in BLOK:
            continue
        return k.split(".")[-1], k, v
    return None, None, None


def komut_metni(arg, gorev):
    if isinstance(arg, str):
        return arg
    if isinstance(arg, dict):
        return str(arg.get("cmd") or arg.get("_raw_params") or arg.get("argv") or "")
    if isinstance(arg, list):
        return " ".join(str(x) for x in arg)
    return ""


def dict_degerleri(d):
    if isinstance(d, dict):
        for k, v in d.items():
            if k == "__satir__":
                continue
            yield k, v
            for x in dict_degerleri(v):
                yield x
    elif isinstance(d, list):
        for v in d:
            for x in dict_degerleri(v):
                yield x


def gorevler(liste, yol=""):
    for g in liste or []:
        if not isinstance(g, dict):
            continue
        yield g
        for b in BLOK:
            if isinstance(g.get(b), list):
                for x in gorevler(g[b], b):
                    yield x


def denetle(dosya):
    bulgular = []
    ekle = lambda satir, onem, kod, mesaj: bulgular.append((satir or 0, onem, kod, mesaj))
    try:
        ham = open(dosya, encoding="utf-8", errors="replace").read()
    except OSError as e:
        return None, "okunamadı: %s" % e
    try:
        belge = yaml.load(ham, Loader=yukleyici())
    except yaml.YAMLError as e:
        return None, "YAML ayrıştırılamadı: %s" % str(e).replace("\n", " ")
    if not isinstance(belge, list):
        return None, "playbook değil (en üstte play listesi yok)"

    yorumlar = [(i + 1, s) for i, s in enumerate(ham.split("\n")) if s.strip().startswith("#")]
    etkin_yollar = set()  # etkin görevlerin ürettiği dosyalar (dest/path/creates)

    tum = []
    for play in belge:
        if not isinstance(play, dict):
            continue
        if "import_playbook" in play:
            continue
        ps = play.get("__satir__")
        hosts = str(play.get("hosts", ""))
        if hosts.strip() in ("all", "*"):
            ekle(ps, "UYARI", "hosts-all", "hosts: %s → --limit ya da iş envanteri (-i hosts-<CN>-….ini) olmadan TÜM envantere "
                 "çalışır; önce --list-hosts (§7)" % hosts)
        if play.get("ignore_errors") in (True, "yes", "true"):
            ekle(ps, "UYARI", "play-ignore", "play düzeyinde ignore_errors → hiçbir hata durdurmaz, PLAY RECAP 'ok' der ama iş "
                 "yapılmamış olabilir (G93); hatayı yalnız beklenen görevde yut, sonucu ayrı doğrula")
        for anahtar in GOREV_LISTELERI:
            for g in gorevler(play.get(anahtar)):
                if anahtar == "handlers":
                    g = dict(g, __handler__=True)
                tum.append(g)
                for k, v in dict_degerleri(g):
                    if k in ("dest", "path", "creates") and isinstance(v, str):
                        etkin_yollar.add(v)

    kaldirildi = None  # ilk kaldırma görevinin satırı
    for g in tum:
        s = g.get("__satir__")
        kisa, tam, arg = modul_ve_arg(g)
        if kisa is None:
            continue  # yalnız block
        ad = g.get("name")
        if not ad:
            ekle(s, "NOT", "ad-yok", "görevin name: satırı yok → çıktıda ve raporda neyin düştüğü okunmaz")
        metin = komut_metni(arg, g) if kisa in KOMUT_MODULLERI else ""
        argd = arg if isinstance(arg, dict) else {}
        if kisa in KOMUT_MODULLERI:
            # handler yalnız bir görev 'changed' olunca çalışır — zaten koşullu
            if not g.get("__handler__") and not (g.get("changed_when") is not None or argd.get("creates") or argd.get("removes")
                    or (isinstance(g.get("args"), dict) and (g["args"].get("creates") or g["args"].get("removes")))):
                ekle(s, "UYARI", "tekrar", "%s: creates/removes/changed_when yok → her koşuda 'changed', ikinci çalıştırmada "
                     "yine yapar; okuma görevi ise changed_when: false" % kisa)
            if kisa != "command" and "|" in re.sub(r"\|\|", "", metin) and "pipefail" not in metin:
                ekle(s, "UYARI", "pipefail", "boru (|) var, set -o pipefail yok → ilk komut düşse de görev başarılı görünür "
                     "(G26: `dnf … | tail`)")
            if kisa == "command" and re.search(r"[|><;&]|\$\(", metin):
                ekle(s, "ENGEL", "command-kabuk", "command modülü kabuk işlemi (| > ; && $()) yapmaz → shell gerekir")
            if re.search(r"\becho\b[^\n|;&]*\b(complete|completed|done|success|tamam|başarılı|basarili|bitti|ok)\b", metin, re.I):
                ekle(s, "UYARI", "sahte-basari", "komut içinde başarı yankısı → sonuçtan bağımsız basılır (G26); başarıyı "
                     "çıkış kodu / register ile göster")
            if re.search(r"\bcurl\b", metin) and not re.search(r"(\s-[a-zA-Z]*f|--fail)", metin):
                ekle(s, "UYARI", "curl-fail", "curl -f/--fail yok → HTTP 404/500'de hata sayfası dosyaya yazılır, görev başarılı "
                     "(G43); get_url + checksum daha iyi")
            if re.search(r"--skip-broken", metin):
                ekle(s, "UYARI", "skip-broken", "--skip-broken bağımlılığı bozuk paketi sessizce atlar (G26)")
            for desen, modul in MODUL_KARSILIGI:
                if re.search(desen, metin):
                    ekle(s, "NOT", "modul-var", "%s ile yapılabilir (tekrar çalıştırılabilir, --check destekli)" % modul)
                    break
            for y in re.findall(r"(/tmp/[A-Za-z0-9_./-]+)", metin):
                yorumda = [n for n, l in yorumlar if y in l]
                if yorumda and y not in etkin_yollar:
                    ekle(s, "UYARI", "yorumdaki-onkosul", "%s kullanılıyor; onu üreten satır yorumda (satır %s) → dosya sunucuda "
                         "yoksa görev düşer (G93)" % (y, ",".join(str(n) for n in yorumda[:3])))
        if g.get("ignore_errors") in (True, "yes", "true"):
            ekle(s, "NOT", "ignore", "ignore_errors → hata sessiz geçer; register + sonraki görevde kontrol et")
        if isinstance(argd, dict) and argd.get("state") == "latest":
            ekle(s, "UYARI", "latest", "state: latest → her koşuda farklı sürüm kurabilir; beklenen sürümü sabitle ya da present")
        # yıkıcı adım sırası (G93): kaldırma, indirme/doğrulamadan ÖNCE mi
        kaldirma = (isinstance(argd, dict) and argd.get("state") in ("absent", "removed") and kisa in ("dnf", "yum", "package")) \
            or bool(KALDIR_KOMUT.search(metin))
        indirme = kisa in ("get_url", "uri", "unarchive") or bool(INDIR_KOMUT.search(metin))
        if kaldirma and kaldirildi is None:
            kaldirildi = s
        elif indirme and kaldirildi is not None:
            ekle(s, "UYARI", "yikici-sira", "indirme kaldırmadan SONRA (kaldırma satır %s) → indirme bozulursa sunucu yazılımsız "
                 "kalır (G93); sıra: indir → doğrula → kaldır → kur" % kaldirildi)
            kaldirildi = -1  # bir kez söyle
        # düz parola
        for k, v in dict_degerleri(g):
            if isinstance(k, str) and GIZLI_ANAHTAR.search(k) and isinstance(v, str) and v and "{{" not in v \
                    and not v.startswith("$"):
                ekle(s, "UYARI", "duz-parola", "%s düz metin → Key Store / vault değişkeni; değeri buraya yazma" % k)
                break
        if any(isinstance(k, str) and GIZLI_ANAHTAR.search(k) for k, _ in dict_degerleri(g)) and not g.get("no_log"):
            ekle(s, "NOT", "no-log", "gizli alan var, no_log: true yok → değer çıktıya/loga düşebilir")

    for i, l in enumerate(ham.split("\n"), 1):
        if re.search(r"NOPASSWD:\s*ALL", l) and not l.strip().startswith("#"):
            ekle(i, "UYARI", "nopasswd", "sudo NOPASSWD: ALL → sınırsız parolasız root (G93); kurumda kullanıcı/sudo IdM'de")
    return sorted(set(bulgular)), None


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(KULLANIM)
        return 0
    if yaml is None:
        print("PyYAML yok: bu python3'te 'import yaml' başarısız. ansible'ın python'u ile çalıştır: "
              "$(head -1 $(command -v ansible-playbook) | sed 's/^#!//') %s …" % os.path.basename(sys.argv[0]))
        return 2
    dosyalar = []
    for a in argv:
        if os.path.isdir(a):
            dosyalar += sorted(os.path.join(a, f) for f in os.listdir(a) if f.endswith((".yml", ".yaml")))
        else:
            dosyalar.append(a)
    cikis, toplam = 0, {"ENGEL": 0, "UYARI": 0, "NOT": 0}
    for d in dosyalar:
        bulgular, hata = denetle(d)
        if hata:
            print("== %s\n  ENGEL  %s" % (d, hata))
            toplam["ENGEL"] += 1
            cikis = 2
            continue
        if not bulgular:
            print("== %s: bulgu yok" % d)
            continue
        print("== %s" % d)
        for satir, onem, kod, mesaj in sorted(bulgular, key=lambda b: ({"ENGEL": 0, "UYARI": 1, "NOT": 2}[b[1]], b[0])):
            print("  %-5s  satır %-4s %-18s %s" % (onem, satir, kod, mesaj))
            toplam[onem] += 1
        if (toplam["ENGEL"] or toplam["UYARI"]) and cikis == 0:
            cikis = 1
    if len(dosyalar) > 1:
        print("\nToplam: %d dosya · ENGEL %d · UYARI %d · NOT %d" % (len(dosyalar), toplam["ENGEL"], toplam["UYARI"], toplam["NOT"]))
    return cikis


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
