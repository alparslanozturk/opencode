#!/usr/bin/env bash
# =============================================================================
#  test-baglam-tespiti.sh — kur.sh içindeki uc_alanlari() uçta BİRDEN ÇOK model
#  varken doğru MODEL_ID'yi seçiyor mu (GOREV oc-T5 bulgu B / plan P1-2).
#
#  Kanıt: eskiden kayıtlar yalnız MODEL_ID eşleşenini ÖNE alacak şekilde
#  sıralanıyordu (sort) — eşleşen kayıtta ilgili alan yoksa bul() sıradaki
#  (BAŞKA modelin) değerini sessizce ödünç alıyordu. Şimdi birden çok model
#  kaydı varsa yalnız id (yoksa name) MODEL_ID'ye eşit olanlar kalır.
#
#  Ağ/HTTP gerekmez: uc_alanlari() /v1/models gövdesini doğrudan argüman
#  olarak alır, sahte-uc.py'ye ihtiyaç yok.
#
#  Kullanim:  ./script/test-baglam-tespiti.sh
#  Cikis:     0 = hepsi gecti · 1 = en az bir durum kaldi
# =============================================================================
set -uo pipefail

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GECEN=0
KALAN=0

gecti() { printf '  GECTI  %s\n' "$*"; GECEN=$((GECEN + 1)); }
kaldi() { printf '  KALDI  %s\n' "$*"; KALAN=$((KALAN + 1)); }

# kur.sh kendi "set -euo pipefail"iyle geliyor — alt kabukta kaynaklanır ki bu betiği etkilemesin.
baglam_al() {
  local model="$1" govde="$2"
  (
    # shellcheck disable=SC1090
    source "$KOK/kur.sh" > /dev/null 2>&1
    uc_alanlari "$model" "$govde"
  ) 2> /dev/null | sed -n 's/^baglam\t//p' | head -1
}

echo "== uc_alanlari — çoklu model MODEL_ID eşleştirmesi (P1-2)"

COKLU='{"data":[{"id":"baska-model","max_model_len":8192},{"id":"dogru-model","max_model_len":65536}]}'
baglam="$(baglam_al "dogru-model" "$COKLU")"
if [ "$baglam" = "65536" ]; then
  gecti "çoklu model: MODEL_ID eşleşeni (65536) seçildi, ilk kayıt (8192) değil"
else
  kaldi "çoklu model: beklenen 65536, alınan '${baglam:-boş}'"
fi

baglam="$(baglam_al "olmayan-model" "$COKLU")"
if [ -z "$baglam" ]; then
  gecti "çoklu model + eşleşme yok: değer uydurulmadı (boş → 'tespit edilemedi')"
else
  kaldi "çoklu model + eşleşme yok: beklenen boş, alınan '$baglam'"
fi

TEK='{"data":[{"id":"tek-model","max_model_len":16384}]}'
baglam="$(baglam_al "hic-alakasiz-id" "$TEK")"
if [ "$baglam" = "16384" ]; then
  gecti "tek modelli yanıt: MODEL_ID uyuşmasa da mevcut tek kayıt kullanılır (eski davranış korunur)"
else
  kaldi "tek modelli yanıt: beklenen 16384, alınan '${baglam:-boş}'"
fi

DUZ='{"id":"x","max_model_len":4096}'
baglam="$(baglam_al "x" "$DUZ")"
if [ "$baglam" = "4096" ]; then
  gecti "sarmalayıcısız düz nesne yanıtı hâlâ okunuyor"
else
  kaldi "sarmalayıcısız düz nesne: beklenen 4096, alınan '${baglam:-boş}'"
fi

AD_ILE='{"data":[{"name":"a","max_model_len":1000},{"name":"b","max_model_len":20000}]}'
baglam="$(baglam_al "b" "$AD_ILE")"
if [ "$baglam" = "20000" ]; then
  gecti "id yoksa name alanıyla eşleştirme çalışıyor"
else
  kaldi "name eşleştirme: beklenen 20000, alınan '${baglam:-boş}'"
fi

echo
echo "$GECEN gecti, $KALAN kaldi"
[ "$KALAN" -eq 0 ]
