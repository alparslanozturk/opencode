#!/usr/bin/env bash
# script/veri-guncelle.sh — sahanın çevrimdışı sürüm/uyum verisini beceriye gömer (T33).
#
# Saha internete çıkamaz (yalnız GitHub, o da kesintili) → model sürüm/uyum sorularında TAHMİN etmesin diye
# veri, `rke2-ansible` becerisinin içine (SKILL.md, VERİ işaretleri arası) gömülür; beceri yüklenince model
# tabloyu doğrudan görür (dosya okuma / izin / internet gerekmez).
#
# Tek kaynak: kurum rke2-ansible reposu (github.com/alparslanozturk/rke2-ansible):
#   araclar/matris/rancher-v2-*.txt  (SUSE Rancher destek matrisi)   araclar/matris/antrea-uyum.txt
# Kullanım (internetli makinede, rke2-ansible güncelken):
#   script/veri-guncelle.sh [rke2-ansible-dizini]   (varsayılan /root/rke2-ansible)
#   → SKILL.md güncellenir → commit/push → sahada al.sh → ./kur.sh
# İnternet yoksa RKE2 "en son yama" sütunu "?" olur (gerisi repodaki dosyalardan).
set -euo pipefail

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RKE2="${1:-/root/rke2-ansible}"
BECERI="$KOK/knowledge/skills/approved/rke2-ansible/SKILL.md"
[ -f "$RKE2/araclar/rancher_matris.py" ] || { echo "!! rke2-ansible bulunamadı: $RKE2" >&2; exit 2; }
[ -f "$RKE2/araclar/matris/antrea-uyum.txt" ] || { echo "!! $RKE2/araclar/matris/antrea-uyum.txt yok" >&2; exit 2; }

python3 - "$RKE2" "$BECERI" <<'PY'
import datetime, re, subprocess, sys
from pathlib import Path

rke2, beceri = Path(sys.argv[1]), Path(sys.argv[2])
sys.path.insert(0, str(rke2 / "araclar"))
import rancher_matris as rm  # noqa: E402

def sayi(v):
    return [int(x) for x in re.findall(r"\d+", v)]

surumler = rm.sorted_surumler()
satirlar, hatlar = [], set()
for r in surumler:
    s = rm.satirlar(r)
    alt, ust = rm.yerel_kume(s)
    ds = [h for h, _, _ in rm.downstream(s)]
    hatlar.update(ds)
    rhel = [v for v, c in rm.rhel(s) if c.startswith("Yes")]
    satirlar.append(f"| {r} | {alt} … {ust} | {' · '.join(ds)} | {', '.join(rhel) or '—'} | `{rm.dosya_adi(r).name}` |")

def son_yama(hat):
    try:
        out = subprocess.run(["git", "ls-remote", "--tags", "--refs", "https://github.com/rancher/rke2.git",
                              f"refs/tags/v{hat}.*"], capture_output=True, text=True, timeout=30, check=True).stdout
    except Exception:
        return "?"
    et = [l.rsplit("/", 1)[-1] for l in out.splitlines()]
    et = [e for e in et if re.fullmatch(rf"v{re.escape(hat)}\.\d+\+rke2r\d+", e)]
    return max(et, key=sayi) if et else "?"

yama = [f"{'v' + h}: {son_yama(h)}" for h in sorted(hatlar, key=sayi)]

antrea, uretim_a = [], ""
for no, l in enumerate((rke2 / "araclar/matris/antrea-uyum.txt").read_text(encoding="utf-8").splitlines(), 1):
    if l.startswith("# Üretim:"):
        uretim_a = l[2:].split(" · ")[0]
    if l.strip() and not l.startswith("#"):
        a, y, t, alt, ust = l.split()
        antrea.append(f"| {a} | {y} | {t} | {alt} – {ust} | `antrea-uyum.txt:{no}` |")

bugun = datetime.date.today().isoformat()
blok = f"""<!-- VERI:BASLA — script/veri-guncelle.sh üretir, ELLE DÜZENLEME -->
## Çevrimdışı veri (üretim {bugun}; kaynak: kurum rke2-ansible `araclar/matris/`)

Bu tablolar internetsiz doğrudur — sürüm/uyum sorusunda **önce buraya bak, tahmin etme**. Sorulan sürüm burada
yoksa "bu veride yok — hesaplanamadı" de; rke2-ansible varsa aracı çalıştır, yoksa kullanıcıdan güncel veriyi iste.

**SUSE Rancher destek matrisi** (upstream = Rancher'ın kendi `local` kümesi · downstream = yönettiği kümeler):

| Rancher | Upstream (local) RKE2 | Downstream RKE2 hatları | RKE2 için RHEL | Kaynak (`araclar/matris/`) |
|---|---|---|---|---|
{chr(10).join(satirlar)}

RKE2 hatlarının en son kararlı yaması (üretim anında, github.com/rancher/rke2): {' · '.join(yama)}

**Antrea → desteklenen Kubernetes** (kural: her Antrea sürümü çıktığı gün desteklenen son 4 K8s sürümü; {uretim_a or 'üretim tarihi yok'}):

| Antrea | En son yama | Çıkış | Kubernetes | Kaynak (`araclar/matris/`) |
|---|---|---|---|---|
{chr(10).join(antrea)}
<!-- VERI:BITIS -->"""

metin = beceri.read_text(encoding="utf-8")
if "<!-- VERI:BASLA" not in metin:
    sys.exit("!! SKILL.md içinde <!-- VERI:BASLA --> … <!-- VERI:BITIS --> işaretleri yok")
yeni = re.sub(r"<!-- VERI:BASLA.*?<!-- VERI:BITIS -->", lambda _: blok, metin, flags=re.S)
if yeni != metin:
    beceri.write_text(yeni, encoding="utf-8")
    print(f"güncellendi: {beceri.relative_to(beceri.parents[4])} — Rancher {len(satirlar)} sürüm, Antrea {len(antrea)} satır")
else:
    print("değişiklik yok (veri güncel)")
PY
