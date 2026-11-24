# Tek seferlik talimat — GPU kümesi ortam özeti (Kubernetes + Run:ai + vLLM), 1 sayfa

Amaç: Doktor'a (kiti geliştiren taraf) ortamı tanıtmak. **Yalnız okuma.** Hiçbir şeyi değiştirme, yeniden başlatma,
ölçeklendirme, `port-forward`, `kubectl proxy`, `exec`, `curl` ile pod'a istek YOK (salt-okunur = iz yok).

## 1. Önce sor (tek mesajda)
- Hangi küme(ler)? Alp'in yazdığı adı `kume-bul` ile bul; bulamazsan sor, tahmin etme. Hedef teyidi kuralı geçerli
  (komutu çalıştırdığın master'ın `hostname`'i küme adıyla uyuşmalı).

## 2. Topla (her küme için, mevcut betiklerle)
1. `k8s-sorun` becerisindeki `k8s-ozet.py` → node'lar, roller, Ready/NotReady, etcd çoğunluğu, sürüm.
2. `rke2-gpu` becerisindeki `gpu-dagilim.py` (tek `get nodes,pods -A -o json` çıktısı) → node başına GPU modeli/sayısı,
   GPU kullanan pod'lar, Run:ai kesirleri, vLLM parametreleri, shm, restart.
3. Sürümler: GPU Operator, NVIDIA sürücüsü, Run:ai, vLLM imaj etiketleri — `kubectl get` çıktısından (imaj etiketleri, Helm
   release'leri `get secret -l owner=helm` ADLARI yeterli, içerik okuma). Uyum için `surum-uyum/uyum.py`; veri yoksa
   "hesaplanamadı (veri yok)".
4. Run:ai: project / department / nodepool listesi ve kotalar — yalnız `kubectl get` ile okunabilenler (CRD adlarını önce
   `kubectl api-resources | grep -i run.ai` ile bul). Okunamayan alanı "okunamadı" yaz.

## 3. Çıktı — tek sayfa (en fazla ~60 satır), ekrana bas ve iş README'sine kaydet
Başlıklar sırasıyla:
1. **Kümeler** — ad · master'lar · node sayısı · K8s/RKE2 sürümü · durum
2. **GPU node'ları** — node · GPU modeli × adet · ayrılabilir · kullanılan
3. **Yazılım katmanı** — GPU Operator · sürücü · Run:ai · vLLM imaj(lar)ı (sürüm + kaynak komut)
4. **vLLM / model pod'ları** — pod · model · GPU (tam/kesir) · `--max-model-len` · tp · parser'lar · prefix caching · restart
5. **Run:ai** — project/nodepool/kota (okunduğu kadar)
6. **Dikkat çekenler** — en fazla 5 madde, her biri kanıtıyla (komut + satır). Öneri değil, gözlem.
7. **Bilinmeyenler** — okunamayan/doğrulanamayan her şey ve nedeni (yetki, CRD yok, komut hata verdi).

Kurallar: Her sayı bir komut çıktısından gelir; çıkarımı "tahmin:" diye ayır. Bilmediğin alanı boş bırakma, "bilinmiyor" yaz.
Sırları (token, parola, anahtar) yazma. Bitince yalnız "özet hazır: <dosya>" de.
