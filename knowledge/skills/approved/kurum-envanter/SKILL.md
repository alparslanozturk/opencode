---
name: kurum-envanter
description: Kurum sunucu envanteri ve ağ haritası çıkarırken kullan — adın ilk 3 harfi (lokasyon · ortam · alan) → sunucu sayısı, domain, IP blokları; DMZ/DRC ayrımı; deterministik `envanter-harita.py` + kullanıcıya soru listesi. "envanter çıkar", "sunucu envanteri", "ip blokları", "hangi domain", "dmz envanteri", "drc", "ağ haritası", "kaç domain", "sunucu listesi ip" isteklerinde tetiklenir.
---

# Kurum envanteri ve ağ haritası

## İlke (Alp, 2026-11-03)

- **Yalnız adın ilk 3 harfi anlam taşır:** `<lokasyon><ortam><alan>` — `s` İstanbul / `d` Ankara-DRC · `p` prod, `d` dev, `t` test,
  `x` prep, `b` bugfix · `l` local / `d` DMZ (`engine/AGENTS.md` "Sunucu adı → ortam"). **Adın geri kalanını yorumlama.**
- Tabloya uymayan kod (eski `srv`, `dtl` …) için anlam **türetme** — betik "SOR" listesine koyar, kullanıcı söyler.
- Bilinen yapı (doğrulanacak, `[doğrula]`): iç ağ ve DMZ **ayrı domain**; DRC'de de local ve DMZ var; her biri ayrı IP blokları.
  Sayılar ve bloklar **ölçümden** gelir (DNS), ezberden değil. Kurum bu kuralın yazılı metnini envanter çalışmasında çıkaracak.

## 0. Önce sor (tek mesajda; cevabı olanı sorma)

1. Kapsam: hangi envanter dosyası/grup — hepsi mi, bir ortam mı?
2. Domain'ler: iç ağ domain'i, DMZ domain'i (DRC'de ayrı domain var mı?) — kurumsal bilgide yazıyorsa sorma, oradan al.
3. DMZ adları iç DNS'te çözülmüyorsa: hangi DMZ DNS sunucusu ve ona hangi makineden sorulur (atlama sunucusu)?
4. Çıktı: tablo mı, CSV/Excel mi (`rapor` becerisi)?

## 1. Kanıt → harita (salt-okunur)

```bash
B=/root/ai/opencode/knowledge/skills/approved/kurum-envanter
for h in $(ansible all -i <envanter> --list-hosts | tail -n +2); do getent hosts $h || echo "- $h"; done | python3 $B/envanter-harita.py -
```

Betik her 3 harfli kod için basar: lokasyon · ortam · alan · sunucu sayısı · domain (adet) · IP /16 blokları (adet), sonra **SOR** listesi
(tabloya uymayan kod, DMZ kodu ama DMZ olmayan domain, local kod ama DMZ domain'i, bir kodda birden çok /16 blok, çözülemeyen adlar).
Tabloyu kendin kurma, betiğin satırlarını aynen aktar; SOR maddelerini kullanıcıya tek mesajda sor.

- Çözülemeyen DMZ adları: kurumsal bilgideki DMZ DNS'ine, kullanıcının verdiği makineden sor (`ssh root@<atlama> "nslookup <ad> <dmz-dns>"`),
  çıktıyı aynı biçimde (`<IP> <ad>`) betiğe ekle. Envantere IP **yazılmaz** (kurum kuralı) — IP yalnız haritada.
- Cevaplar kalıcı bilgiyse (domain, DNS, blok ↔ ortam) oturum sonunda `/kaydet` kurumsal bilgiye işler.

## Yapmayacakların

- Adın 4. harfinden sonrasına anlam vermek; tabloda olmayan harf için kural uydurmak (G-isimlendirme tartışması, 2026-11-03).
- Ağ tarama (nmap, ping süpürme) — envanter DNS ve envanter dosyasından çıkar.
