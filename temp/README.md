# temp/ — tek seferlik sahaya talimatlar

Doktor'un sahadaki modele tek seferlik yaptırmak istediği işler. Kullanım (sahada, `git pull` sonrası, opencode içinde):

    /root/ai/opencode/temp/<dosya>.md dosyasındaki talimatı uygula

İş bitince dosyayı sahada silme (git kirlenir) — Doktor bir sonraki committe repodan kaldırır. `kur.sh` bu dizini kurmaz.

Betik olan işler (`*.py`) modele verilmez — Alp doğrudan çalıştırır, ör.:

    python3 /root/ai/opencode/temp/kurumsal-bilgi-duzelt.py          # yedek alır, düzeltir, farkı gösterir
    python3 /root/ai/opencode/temp/kurumsal-bilgi-duzelt.py --kuru   # yalnız gösterir
