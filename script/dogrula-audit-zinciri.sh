#!/usr/bin/env bash
# Audit kayit zincirini dogrular (AUDIT-FORMAT.md §3) — C3.
#
# Her satirin prev_hash'i bir onceki satirin sha256'si olmali. Bir satirin silinmesi/degistirilmesi
# ya da araya satir sokulmasi zinciri koparir; bu betik kopmayi dosya:satir olarak gosterir.
# Salt-okunur: hicbir dosyaya yazmaz. Sahada ve gelistiricide calisir (python3 yeterli).
#
#   script/dogrula-audit-zinciri.sh                 # $OPS_AGENT_AUDIT_LOG ya da /var/log/ops-agent/audit.jsonl + dondurulmusler
#   script/dogrula-audit-zinciri.sh a.jsonl b.gz    # verilen dosyalar (verildigi sirayla)
#
# Dondurme (logrotate, engine/plugins/logrotate.d): gunluk audit-YYYY-MM-DD.jsonl[.gz]; yeni dosya bos
# baslar, eklenti ilk satira prev_hash = "0"*64 yazar → her dosya kendi zinciridir. Dosyanin ILK satiri
# ya sifir ya da bir onceki dosyanin son satirinin hash'i olmali; dosya ORTASINDA sifir = zincir
# sifirlanmis (eklenti son satiri okuyamamis ya da dosya kesilip yeniden yazilmis) → uyari.
#
# Cikis: 0 = saglam · 1 = kopma/bozuk satir var · 2 = dosya yok/okunamadi
set -euo pipefail

if [ "$#" -gt 0 ]; then
  dosyalar=("$@")
else
  ana="${OPS_AGENT_AUDIT_LOG:-/var/log/ops-agent/audit.jsonl}"
  dizin="$(dirname "$ana")"
  taban="$(basename "$ana" .jsonl)"
  mapfile -t dosyalar < <(
    # tarihli (logrotate dateext) eskiden yeniye, sonra eski numarali bicim (.N) buyukten kucuge, en son canli dosya
    find "$dizin" -maxdepth 1 -type f -name "${taban}-*.jsonl*" 2>/dev/null | sort
    find "$dizin" -maxdepth 1 -type f -regex ".*/${taban}\.jsonl\.[0-9]+\(\.gz\)?" 2>/dev/null |
      awk -F'.jsonl.' '{split($2,a,"."); print a[1] "\t" $0}' | sort -rn | cut -f2
    [ -f "$ana" ] && echo "$ana"
  )
fi

if [ "${#dosyalar[@]}" -eq 0 ]; then
  echo "HATA: audit dosyasi bulunamadi (${OPS_AGENT_AUDIT_LOG:-/var/log/ops-agent/audit.jsonl})" >&2
  exit 2
fi

exec python3 - "${dosyalar[@]}" <<'PY'
import gzip, hashlib, json, sys

SIFIR = "0" * 64
kopma = uyari = toplam = 0
onceki_son = None  # bir onceki dosyanin son satirinin hash'i

for yol in sys.argv[1:]:
    try:
        ac = gzip.open if yol.endswith(".gz") else open
        with ac(yol, "rb") as f:
            satirlar = [s.rstrip(b"\n") for s in f.read().split(b"\n") if s.strip()]
    except OSError as e:
        print(f"HATA  {yol}: okunamadi ({e.strerror})")
        kopma += 1
        continue
    onceki = None
    dosya_kopma = 0
    for no, satir in enumerate(satirlar, 1):
        toplam += 1
        try:
            prev = json.loads(satir).get("prev_hash")
        except (ValueError, AttributeError):
            print(f"BOZUK {yol}:{no}: JSON degil")
            kopma += 1
            dosya_kopma += 1
            onceki = hashlib.sha256(satir).hexdigest()
            continue
        if no == 1:
            if prev != SIFIR and prev != onceki_son:
                print(f"KOPMA {yol}:1: ilk satir ne sifir ne de onceki dosyanin sonu — arada dosya/satir eksik olabilir")
                kopma += 1
                dosya_kopma += 1
        elif prev == SIFIR:
            print(f"UYARI {yol}:{no}: zincir dosya ortasinda sifirdan basladi (onceki satirlar dogrulanamaz)")
            uyari += 1
        elif prev != onceki:
            print(f"KOPMA {yol}:{no}: prev_hash onceki satirla uyusmuyor — satir silinmis/degistirilmis/araya girilmis")
            kopma += 1
            dosya_kopma += 1
        onceki = hashlib.sha256(satir).hexdigest()
    onceki_son = onceki
    durum = "SAGLAM" if dosya_kopma == 0 else f"{dosya_kopma} KOPMA"
    print(f"{durum:<8} {yol} ({len(satirlar)} satir)")

print(f"sonuc: {len(sys.argv) - 1} dosya, {toplam} satir, {kopma} kopma, {uyari} uyari")
sys.exit(1 if kopma else 0)
PY
