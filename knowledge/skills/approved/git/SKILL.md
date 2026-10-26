---
name: git
description: Kurum git depolarında çalışırken kullan — Azure DevOps Server (kurum içi, on-prem) depoları: ansible (playbook, iş envanteri), envanter, Kubernetes manifestleri, dokümanlar (MD). İlk klon (`git/<depo>`), kurum CA/TLS hatası, depodan bilgi okuma, mükerrer bilgiyi karşılaştırma (ENVANTER.md ↔ ansible envanteri, `envanter-fark.py`), playbook/doküman ekleyip main'e push, parola sorma hatası, Semaphore'un okuyacağı düzen. "git", "repo", "depo", "commit", "push", "pull", "main", "envanter deposu", "azure devops", "tfs", "manifest deposu", "dokümanı depoya koy" isteklerinde tetiklenir. Playbook yazımı ve çalıştırma `ansible`.
---

Doğrulandı: git 2.52, 2026-10-23 (yerel ölçüm; sahadaki sürüm `git --version`)

## 0. Ortam (Alp, 2026-10-23)

- Depolar **Azure DevOps Server, kurum içi (on-prem)** — bulut (`dev.azure.com`) değil. `az` CLI **kullanılmaz** (gerek yok).
- Bağlantı **https + Active Directory kullanıcı adı/parola**. SSH anahtarı yok.
- Akış: **doğrudan `main`**. Dal/PR/onay yok — depolar doküman ve yapılandırma deposu, geliştirici akışı değil.
- Depolar: ansible (playbook + iş envanteri), envanter, Kubernetes manifestleri (küme kurulunca otomatik kurulan uygulamalar —
  izleme vb.; bazılarında ortam başına dal var), dokümanlar (MD). Ansible playbook'ları **Semaphore** okur (`ansible` §9).
- Depo adresleri ve sahadaki klon yerleri **[SAHA]** — uydurma, `git remote -v` ile oku; bilinmiyorsa kullanıcıya sor.

## 1. Kimlik — parolaya ajan dokunmaz

Parolayı **isteme, yazma, komuta/URL'ye koyma**. `https://kullanici:parola@…`, `credential.helper store`, `~/.git-credentials`
yasak (düz metin diske yazar).

Terminal olmadığından git parola soramaz; takılmaz, hemen düşer (ölçüldü):

```
fatal: could not read Username for 'https://<tfs-sunucu>': No such device or address
```

Bu hatayı görürsen komutu tekrarlama — kullanıcıya şunu söyle: "Kendi terminalinde bir kez `git -C <depo> pull` çalıştırıp AD
kullanıcı adı/parolanı gir; sonra devam ederim." Önbellek ayarı yoksa önce bir kez:

```bash
git config --global credential.helper 'cache --timeout=28800'
```

`cache` parolayı **yalnız bellekte** 8 saat tutar, diske yazmaz; o süre boyunca ajanın git komutları çalışır (ölçüldü: önbellekten
`Authorization: Basic` gönderildi, diskte parola yok). Sunucu NTLM/Kerberos isterse davranış sahada doğrulanacak — farklıysa not düş.

## 1b. İlk klon (Alp, 2026-10-26: "bulunduğum klasörde bir dizin aç git diye, repoları orada clone yaparsın")

Depolar çalışma dizinindeki **`git/`** altına klonlanır: `git/<depo-adı>` (ör. `git/kubernetes`). Adres kullanıcıdan gelir
(Azure DevOps "Clone → HTTPS"); uydurma. İlk klonda parola gerekir ve ajan parola giremez (§1) → **ilk klonu kullanıcı kendi
terminalinde yapar**, sen komutu ver:

```bash
git config --global credential.helper 'cache --timeout=28800'   # bir kez; parola yalnız bellekte 8 saat
mkdir -p git && git -C git clone <https adresi>                 # AD kullanıcı adı/parola kullanıcı girer
```

Sonra `git -C git/<depo> pull --ff-only` / `log` / `grep` sen çalıştırırsın (önbellek süresince). Önbellek düşerse yine §1.

**Sertifika hatası** (genel — git'in https hatası; sahada ilk klonda görülürse not düş):
`SSL certificate problem: unable to get local issuer certificate` ya da `server certificate verification failed` → sunucunun
sertifikasını veren kurum CA'sı bu makinenin güven deposunda yok.
- `http.sslVerify=false` / `GIT_SSL_NO_VERIFY` **yasak** (araya giren her sunucuya parola gider).
- Doğru yol: kurum CA'sını güven deposuna eklemek (`/etc/pki/ca-trust/source/anchors/` + `update-ca-trust extract`) — makinede
  değişiklik, kullanıcının kararı; CA dosyasını kullanıcı verir. Yalnız bu depo için geçici: `git -c http.sslCAInfo=<ca.pem> clone …`.
- Hangi CA? `echo | openssl s_client -connect <sunucu>:443 -showcerts 2>/dev/null | openssl x509 -noout -issuer -subject -enddate`
  (salt-okunur) → issuer satırını kullanıcıya göster.

## 2. Önce nerede olduğunu bil

```bash
git -C <depo> status --short --branch     # dal, önde/geride, değişmiş dosyalar
git -C <depo> remote -v                   # hangi depo (Azure DevOps adresi)
git -C <depo> log --oneline -5
```

`git -C <depo>` kullan — `cd` gerekmez, hangi depoda çalıştığın komutta görünür. Kullanıcının commit'lenmemiş değişikliği varsa
**dokunma**, söyle.

## 3. Depodan bilgi okuma (envanter, manifest, doküman)

```bash
git -C <depo> pull --ff-only              # güncel hâli al (yerelde iş yoksa)
git -C <depo> log --oneline -10 -- <yol>  # bu dosya ne zaman, kimin commit'iyle değişti
git -C <depo> show <commit> -- <yol>      # o değişiklik
git -C <depo> grep -n '<ad|IP>'           # depoda ara (izlenen dosyalarda)
```

`pull --ff-only` düşerse (yerel commit var, dallar ayrıldı) zorlama — durumu kullanıcıya söyle. Sunucu/IP → küme eşlemesi için
`kume-bul` (envanter dosyalarını okur). **Envanter deposunu** yalnız kullanıcı isterse değiştir; işe özel envanter ansible
deposuna yazılır (`ansible` — iş envanteri).

## 4. Ekleme ve main'e gönderme

Yalnız **bu işte senin yazdığın** dosyalar:

```bash
git -C <depo> pull --rebase                         # önce güncelle (başkası push etmiş olabilir)
git -C <depo> add <dosya1> <dosya2>                 # tek tek; 'add -A' / 'add .' yok
git -C <depo> diff --staged --stat                  # ne gidiyor — kullanıcıya bu listeyi göster
git -C <depo> commit -m "<alan>: <ne ve neden>"     # deponun mevcut diline uy: git log -10
git -C <depo> push origin main
```

- Push'tan önce gidecek dosya listesini söyle; push her seferinde onay ister (izin ayarı).
- `pull --rebase` çakışırsa **dur**: `git -C <depo> rebase --abort` ile geri dön ve kullanıcıya hangi dosyada çakıştığını söyle.
  İki tarafı da okumadan çözme.
- Parola/anahtar/token **depoya girmez** — Semaphore'da Key Store'a, playbook'ta değişken adı olarak (`ansible` §9).
- Rapor: commit hash'i + "main'e push edildi" ya da "push edilmedi" — kullanıcı işin uzakta olduğunu sanmasın.

## 6. Mükerrer bilgi — aynı sunucu birden çok yerde (Alp, 2026-10-26)

Aynı bilgi birden çok depoda/dosyada tutulur: dokümandaki `ENVANTER.md`, ansible deposundaki INI envanteri, ayrı envanter
çalışması. Pipeline/otomatik eşitleme **yok** (yalnız git) → zamanla ayrışır. Kural:

- **Karşılaştır, karar verme.** Hangisinin doğru olduğunu betik de sen de bilmezsin — farkı göster, kullanıcı söyler:

  ```bash
  python3 /root/ai/opencode/knowledge/skills/approved/git/envanter-fark.py <ansible-depo>/inventories/hosts.ini \
    --karsi <dokuman-depo>/ENVANTER.md --karsi <envanter-depo>/<dosya>.ini
  ```

  Çıktı: `ip-farkli` (aynı ad, farklı IP — `dosya:satır` iki taraf), `yalnız-kaynakta`, `yalnız-karşıda`. MD biçimi varsayılmaz
  (INI'deki ad/IP metinde aranır); MD'de IP'siz yazılmış ve INI'de olmayan ad yakalanmaz — o satırları kullanıcı okur. İş envanterleri
  (`hosts-<CN>-<tarih>.ini`) kaynak verme — bir işin kaydıdır, envanter değil (`ansible`).
- Önce her depoda `pull --ff-only` (§3) — eski klonla karşılaştırma yanlış fark üretir.
- Düzeltme ayrı iş: kullanıcı "şu doğru" deyince yalnız o dosyayı düzelt, §4 ile push et; commit mesajında karşı dosyayı an
  ("ENVANTER.md: ornekweb02 IP'si ansible hosts.ini ile eşitlendi"). Bir taraftan ötekine **toplu kopyalama** yapma.
- Bir sunucu eklendi/kaldırıldıysa (kurulum, iade) işi bitirirken kullanıcıya hangi yerlerin güncellenmesi gerektiğini tek satırla
  hatırlat — kendiliğinden doküman deposuna yazma.

## 5. Yapma

- `git push --force` (kilit K5 — paylaşılan main'i siler), `git reset --hard`, `git clean -fdx`, `git checkout -- <dosya>`:
  kullanıcının ve ekibin işini geri dönüşsüz siler. Commit edilmemiş iş varken başka şey gerekiyorsa `git stash`.
- Dal açma / PR akışı kurma — kurumda yok (§0).
- Manifest deposunda ortam dallarını birleştirme / taşıma — kullanıcı açıkça istemedikçe.
