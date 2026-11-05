# Tek seferlik: kurumsal-bilgi.ini düzeltmesi (Doktor, 2026-11-05)

Yalnız aşağıdaki düzeltmeleri yap; dosyadaki başka hiçbir satıra dokunma.

1. Yedek al:
   `cp /root/ai/work/opencode/kurumsal-bilgi.ini /root/ai/work/opencode/kurumsal-bilgi.ini.$(date +%Y%m%d-%H%M)`
2. `/root/ai/work/opencode/kurumsal-bilgi.ini` dosyasında "9. Bilinen sorunlar" bölümünde bugün (2026-11-05) eklenen
   "RKE2/Rancher kümeleri — bilinen node davranışları" bloğunu bul ("K3s embedded containerd" geçen, tek bir node adıyla yazılmış satırlar).
   Bloğu şu tek genel satırla değiştir (node adı yok, K3s yok):
   `- RKE2 node'larında containerd, rke2-server/rke2-agent süreci altında çalışır; ayrı containerd.service kullanılmaz — systemctl'de inactive görünmesi normaldir, bulgu değildir. [Alp 2026-11-05]`
   Blokta force delete ile ilgili satır varsa onu da şu tek satırla değiştir:
   `- Takılı Terminating pod'da force delete yalnız API kaydını siler; node'da sandbox kalabilir (2026-11-05 olayı: node reboot gerekti) — önce k8s-sorun becerisi "Takılı Terminating" bölümü. [Alp 2026-11-05]`
3. Dosyada sunucu adının 3. harfinden sonraki harflere anlam veren bir ifade varsa (ör. "r=rancher") o ifadeyi sil — adın yalnız ilk 3 harfi
   anlam taşır.
4. Farkı göster: `diff <1. adımdaki yedek> /root/ai/work/opencode/kurumsal-bilgi.ini` — çıktıyı aynen göster, yorum ekleme.
