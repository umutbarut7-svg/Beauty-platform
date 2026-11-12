# Korumalı anahtar aktarımı — offline kripto bileşeni

Bu değişiklik telefonda duran kurtarma anahtarının yeni bir kurtarma host'una
şifreli taşınması için düşük seviyeli bir bileşen hazırlar. Gerçek anahtar
okunmadı; CloudShell, CI, üretim veya yeni bir endpoint'e teslim edilmedi.
CLI varsayılanı `OFFLINE_NO_ACTION`; özel anahtar/paket alan CLI yoktur.

## Hazırlanan sınır

`recovery-key-handoff.py` yalnız bağımsız onaylanmış bağlam ve alıcı sertifikası
ile, aktif/belirsiz swap reddi ve core 0 kontrolünden sonra process içinde
geçici RSA-3072 anahtarı oluşturur. Public challenge; rastgele handoff kimliği,
on dakikalık geçerlilik, wrapping public key, signer/alıcı/kaynak/cipher/schema
SHA256 bağları, backup kimliği, snapshot sınırı ve onaylı yedek zaman aralığını
içerir. Anahtar disk dosyasına yazılmaz. Challenge SHA256'sı **ayrı,
kimliği doğrulanmış bir owner kanalı** üzerinden telefona doğrulatılmalıdır;
paketin/challenge dosyasının kendi hash'ini güven pini kabul etmek güven sağlamaz.

`wrap-recovery-handoff.mjs`, dosya/ağ/DOM/storage erişimi olmayan Web Crypto
fonksiyonudur. Bağımsız hash pini ve challenge bağlamı/geçerliliği denetlenmeden
özel girdinin kopyasını işlemez. Anahtar PEM'i ve isteğe bağlı parolası,
yeni AES-256-GCM anahtarı ve 96-bit nonce ile şifrelenir; tam challenge AAD'dir,
tag 128 bittir. AES anahtarı RSA-OAEP/SHA256 ile sarılır; OAEP label challenge
hash'idir. Çıktı yalnız sürümlenmiş şifreli JSON kapsülüdür. Bu kapsül yeni bir
uygulama protokolüdür; formal incelemesi yapılmış standart bir handoff sistemi
olduğu iddia edilmez. Mevcut PostgreSQL yedek formatı CMS olarak kalır.

Host her unwrap denemesinde oturumu tüketir; başarısız/bozuk girdi veya süre
sonu da yeniden denemeye izin vermez. Şifre doğrulanmadan açık FD verilmez.
Alınan PEM/parola, bağımsız sertifikanın gerçek public key'iyle eşleştirilir.
Pahalı özel anahtar doğrulaması core 0, dar ortam, yalnız mühürlü FD'ler ve
on saniyelik sonlandırılıp toplanan alt süreç sınırıyla çalışır; stdout yalnız
32 bayt public-key digest'idir. Başarıda yalnız 0600, kernel mühürlü ve context
sonunda kapanan anahtar/parola FD'leri elde edilir. Hata çıktıları özel değer,
PEM, parola veya ham kripto hatası içermez.

`verified_dump` köprüsü sabit üyeli, boyutu sınırlı paketi ve public signer'ı
mühürlü kopyalara alır. İmza, onaylı yedek/kaynak/alıcı/zaman bağları ve bağımsız
cipher SHA256'sı **anahtar unwrap edilmeden önce** doğrulanır. Aynı immutable
paket, signer, sertifika ve elde edilen FD'lerle mevcut `verified_dump` tüketicisine
gider; mühürlü PGDMP FD ve bağımsız onaylı schema digest'i döner. Paket üst sınırı
16 MiB, açık dump üst sınırı 128 MiB'dir; daha büyük girdiler sessizce kabul edilmez.
Bu köprü DB restore, SQL çalıştırma veya uygulama açma işlemi yapmaz.

## Yeni doğrulamalar

Yalnız yeni üretilen yapay RSA/sertifika/PEM/parola kullanılır. Node 24'ün gerçek
Web Crypto API'si Python alıcısıyla birlikte sınanır. Şifreli PKCS8 ve parolasız
PEM, yanlış bağımsız pin/değiştirilmiş challenge, expiry/future/uzun TTL,
AES-GCM tag ve RSA ciphertext bozulması, oturumlar arası karışma, yanlış gerçek
anahtar/parola, replay, explicit close, JSON/alan/boyut sınırları, parse deadline,
FD izin/mühür/kapanışı ve host kontrolünün erken reddi sınanır.

Yeni signed CMS entegrasyonu tarayıcı kripto sarmalaması → alınan mühürlü anahtar
FD'si → mevcut manifest/CMS doğrulaması → mühürlü PGDMP zincirini çalıştırır.
Bağımsız cipher hash'i uymayan, imzası geçse bile farklı pakette anahtar açılmaz.
Bu, önceki PostgreSQL restore/prova testlerini tekrar çalıştırmak değildir.
CI host kontrolü yalnız yapay fixture için taklit edilir; gerçek API'de swap
bypass yoktur. CI başarısı gerçek host güven kabulü sayılmaz.

## Açık kalan gerçek teslim

Bu PR bir upload endpoint'i, telefon file-picker sayfası, public port veya
session logging değişikliği eklemez. Gerçek iPhone/Safari kabulü, immutable ve
bağımsız hash'i doğrulanmış istemci dağıtımı, kimliği doğrulanmış challenge
kanalı, onaylı gerçek host ve paket aktarımı hâlâ gerekir. Gerçek anahtarın
bu bileşene teslimi için bunlar ve bağımsız güvenlik incelemesi kapanmalıdır.
Eski SyntheticOnly kurulum aracı gerçek veri almaya uygun hale getirilmedi.
Yeni host/rol/izin oluşturulmadı; önceki temizlenmiş host yeniden başlatılmadı.

Bir host'un yöneticisi/same-UID/root tehdidi çözülmez. Python/JS/kripto runtime
kopyalarında RAM zeroization veya ani crash sonrası kalıntısızlık kanıtı yoktur.
Süre sonu kullanımı reddeder; otomatik bir background RAM silme zamanlayıcısı
değildir. Caller context'i kapatmalıdır. Tek kullanım yalnız bu process-local
oturum için geçerlidir; host restart'ları arasında durable replay deposu yoktur.
Bütün hostun ağdan ayrılması ve logging incelemesi bu modülle sağlanmaz.
Yedek alıcısının public anahtarıyla eşleşme, sonraki veri silme/izin geri çekme
uzlaşmasının ve JWT/secret yenileme incelemesinin yerine geçmez.

Gerçek üretim restore, gerçek RTO/RPO ve bağımsız yeniden-açma kabulü henüz yok.
`protectedHandoffVerified` ve `realRecoveryReady` gerçek işletim için false kalır;
AŞAMA 33 **NOT PASS**.

## Birincil kaynaklar

- [W3C Web Crypto: RSA-OAEP ve AES-GCM](https://www.w3.org/TR/webcrypto/)
- [Cryptography anahtar yükleme ve doğrulama](https://cryptography.io/en/latest/hazmat/primitives/asymmetric/serialization/)
- [Node Web Crypto API](https://nodejs.org/api/webcrypto.html)
