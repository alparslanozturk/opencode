# Saha sabitleri (bu makineye özel — her oturumda modele verilir)

> Bu dosya `~/.config/opencode/saha-sabitleri.md` olarak kurulur ve `./kur.sh` onu **bir daha ezmez**.
> `[SAHA]` yazan yerleri gerçek değerle doldur; bilinmeyeni `[SAHA]` bırak (model uydurmaz, sorar).
> Kısa tut: her satır her isteğe girer.

## Altyapı
- AD / DNS sunucuları: [SAHA]
- NTP kaynağı: [SAHA]
- Satellite sunucusu ve `pub` yolu: [SAHA]
- Paket deposu / proxy: [SAHA]

## Envanter ve düzen
- Ansible envanter dizini: [SAHA]   (ör. `~/ansible/inventories/`)
- Ek disk bağlama kuralı: ek diskler `[SAHA]` altına bağlanır; VG/LV adı mevcut sunucudaki düzenden türetilir
- Sunucu adlandırma: bkz. `knowledge/sunucu-isimlendirme.md` · kurum kuralı: [SAHA]

## Süreç
- Değişiklik: mevcut sunucuda CN zorunlu; yeni kurulum `KURULUM`; acil durum `KRİZ` (yalnız kullanıcı verir)
- CN numarası biçimi: [SAHA]   (ör. `CHG0001234`)
