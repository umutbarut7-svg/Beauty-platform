# Telefondan yönetilen kurtarma ortamı — sentetik ön prova

Umut 6 Kasım'da kendi bilgisayarı olmadan, telefondan ilerlemeyi istedi ve devamı
onayladı. Kişisel bilgisayar satın almak zorunlu değildir. AWS CloudShell,
telefondaki tarayıcı veya AWS Console mobil uygulaması üzerinden yönetilebilen
bir Linux/Docker adayıdır. Bu belge CloudShell oturumuna erişildiğini veya gerçek
kurtarmanın tamamlandığını söylemez.

## Tek komutun kapsamı

`infra/operations/phone-recovery-rehearsal.py --allow-public-image-pull`:

- Linux mühürlü bellek desteğini, boş RAM/disk ve aktif swap olmamasını kontrol
  eder. Ortam uygun değilse ilerlemez; swap'ı veya host yapılandırmasını değiştirmez.
- Mevcut uygulamanın PostgreSQL 17/pgvector sürümüne ait public Docker imajını
  sabit registry index digest'iyle indirir. Yeni EC2, IAM, VPC, S3 veya ücretli
  veritabanı kaynağı açmaz; AWS API çağırmaz. İmaj Docker önbelleğinde kalabilir.
- Yerel Docker soketinde rastgele isimli tek sentetik konteyner oluşturur.
  Ağ `none`, port yok, host dizini/soketi/kimliği aktarımı yok; root dosya sistemi
  salt okunur, veri yalnız sınırlı tmpfs'te, root olmayan kullanıcı, capabilities
  kapalı, çekirdek dökümü ve Docker log sürücüsü kapalıdır. RAM/swap/CPU/PID sınırları
  ve gerçek Docker ayarları başlamadan ve çıktıdan sonra denetlenir.
- Yalnız iki yapay tenant/stok satırı oluşturur; pgvector extension ile gerçek
  `pg_dump`/`pg_restore` çalıştırıp ayrı hedef DB'de sonucu kontrol eder. Konteyneri
  ve olası anonim volume'lerini kaldırır; kaldırma hatası başarı sayılmaz.

Özel kurtarma anahtarı istenmez veya okunmaz. Gerçek paket, müşteri kaydı, canlı
DB, üretim servisi veya üretim yedek zamanlayıcısına erişilmez. Script için
telefonun anahtar dosyasını yüklemeyin; anahtarı sohbete veya komuta yapıştırmayın.

## Sonucun anlamı

`SYNTHETIC_RECOVERY_ENVIRONMENT_PASSED`, yalnız komutun çalıştığı ortamda sentetik
restore ve belirlenen yalıtım kontrollerinin geçtiğini belirtir. CI başarısı,
kullanıcının CloudShell oturumunun da geçtiği anlamına gelmez. `NOT_READY` çıktısı
üzerinden sebep incelenir; kontrol gevşetilmez.

CloudShell oturumu konsol sahibinin AWS yetkilerini taşır. Konteynerin ağ/kimlik
ayrımı, host yöneticisinden veya aynı bulut hesabından bağımsız güven sınırı
değildir. Gerçek veriyi çözmeden önce bu güven modeli, anahtarın yalnız korumalı
bellekte girişi, paket/makbuz aktarımı, dump boyutu ve süre sınırları, güncel
şemaya uygun karantina/doğrulama, kesilmede temizlik ve bağımsız inceleme ayrıca
hazırlanıp doğrulanmalıdır. Bu araç gerçek veri almaya hazır olduğunu söylemez.

Gerçek yedeğin bağımsız kurtarması ve ölçülen RTO henüz yok; AŞAMA33 NOT PASS.
Anahtar muhafazası, 30 günlük saklama ve önceki telefon testleri tekrar istenmez.

## Birincil kaynaklar

- [CloudShell mobil erişim ve Docker desteği](https://docs.aws.amazon.com/cloudshell/latest/userguide/working-with-aws-cloudshell.html)
- [CloudShell kaynakları](https://docs.aws.amazon.com/cloudshell/latest/userguide/vm-specs.html)
- [CloudShell şifreleme](https://docs.aws.amazon.com/cloudshell/latest/userguide/data-encryption.html)

Kaynaklar 6 Kasım 2026'da incelendi. TLS ve disk şifrelemesi, host yöneticisinden
yalıtım veya bağımsız gerçek kurtarma kanıtı olarak sunulmaz.
