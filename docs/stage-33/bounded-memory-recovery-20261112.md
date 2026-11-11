# Bellek üzerinde sınırlı yedek çözme

`infra/operations/recover-backup-memory.py`, gerçek kurtarma denetleyicisinin
eksik olan bir kütüphane parçasını ekler. Doğrudan çalıştırıldığında
`OFFLINE_NO_ACTION` döner; komut satırından anahtar, paket veya üretim verisi
kabul etmez. AWS kaynakları, oturum ayarları ve mevcut zamanlayıcı değişmez.

## Uygulanan sınırlar

- `verified_dump(...)` paket ve CMS boyutlarını mevcut paket tüketicisinin
  sabit ZIP üyeleri ve mühürlü girdi kopyalarıyla sınırlar. İmza, bağımsız signer
  pini, alıcı, kaynak uygulama, yedek kimliği ve zaman aralığı doğrulanmadan özel
  anahtarı açmaz. Kabul değerleri paketin kendisinden türetilemez.
- Açık çıktı yalnız Linux `memfd` nesnesine yazılır; adlandırılmış dump veya
  geçici açık çıktı dosyası oluşturulmaz. Çıktı üst sınırı zorunludur ve en fazla
  256 MiB olabilir. Yeni API, mevcut dosyaya yazan tüketiciyi değiştirmez.
- OpenSSL çözme işlemi için 1–120 saniye arası zorunlu süre sınırı uygulanır.
  Bekleyen veya aşırı çıktı üreten süreç sonlandırılır ve beklenerek toplanır.
  Bu süre **girdi kopyalama, imza doğrulama veya ilerideki DB restore süresinin
  toplam sınırı değildir**; denetleyici bunları ayrıca sınırlandırmalıdır.
- GCM doğrulaması ve başarılı süreç çıkışı tamamlanmadan çıktı çağırana
  verilmez. Boş veya `PGDMP` başlığı olmayan içerik reddedilir. Bu başlık
  kontrolü tam PostgreSQL arşiv doğrulaması değildir.
- Başarılı çıktı değiştirme, büyütme ve kesmeye karşı kernel seviyesinde
  mühürlenir. Bağlam kapanırken veya çağıran hata verdiğinde tanıtıcı kapanır.
  Hata durumundaki kısmi açık içerik için de tanıtıcı kapatılır.
- API aktif veya belirsiz host swap durumunda girdileri açmadan durur;
  süreç core limitini sıfırlar. OpenSSL çözme alt sürecine bulut kimliği, kullanıcı
  OpenSSL ayarı veya özel anahtar/parola içeriği ortam/argüman olarak aktarılmaz.

## Doğrulama ve açık kalan işler

Yeni sınır testleri gerçek RSA-PSS imzalı CMS/GCM yapay paketleri kullanır.
Yanlış signer/kaynak/alıcı/anahtar, yeniden imzalanmış bozuk ciphertext,
parolalı anahtar, dosya izinleri, gerçek bayt sınırı, iki farklı süre aşımı,
hatalı/boş alt süreç çıkışı, kapanış ve değiştirilemezlik kontrol edilir.
Testlerdeki anahtarlar yalnız bu çalışmada üretilen yapay anahtarlardır.
CI ortamı güvenilir kurtarma hedefi sayılmaz; kripto fixture testleri host
kontrolünü taklit eder, host kapısı ayrıca test edilir. Swap kapatma yapılmaz.

Bu kütüphane tek başına korumalı telefon aktarımı, host yöneticisinden yalıtım,
RAM sayfalarının güvenli sıfırlanması veya ani host kaybında kalıntısızlık
garantisi vermez. `memfd` içeriği aynı kullanıcı/root tarafından okunabilir;
swap ve core kontrolleri bu güven modelinin yerine geçmez.

Umut'un mevcut özel anahtarı henüz bu araca verilmedi. Telefon üzerinde korumalı
giriş/şifreli aktarım, güncel başarı makbuzuna bağlı paket teslimi, sınırlı ağsız
DB restore denetleyicisi, güncel şema/auth/fotoğraf karantinası ve gerçek
RTO/RPO/temizlik kabulü tamamlanmadan gerçek kurtarma hazır değildir.
Oturum kayıt incelemesindeki `READ_UNAVAILABLE` ayrıca açık kalır.
AŞAMA 33 **NOT PASS**.
