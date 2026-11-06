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

## Sahibin CloudShell sonucu — swap açık

6 Kasım 19:34 İstanbul ekranında kullanıcı değişmez PR110 komutunu çalıştırdı;
`NOT_READY / ACTIVE_SWAP_REQUIRES_REVIEW`, productionRestoreVerified=false,
privateKeyRead=false, productionDataRead=false görüldü. Bu beklenen duruş,
PostgreSQL provasının çalıştığı anlamına gelmez. Önceki komut aynı haliyle tekrar
istenmez; host swap'ı kapatılmaz veya temizlenmiş sayılmaz.

Yalnız bu aracın sabit yapay verilerini denemek için açık
`--synthetic-only-allow-host-swap` seçeneği eklendi. Varsayılan swap reddi korunur.
Seçenek herhangi bir paket/dump/anahtar yolu veya gerçek veri kabulü eklemez;
konteynerin ağ/kimlik/mount/log/bellek sınırlarını değiştirmez. Host swap açıksa
başarılı sentetik çıktı `SYNTHETIC_PROBE_PASSED_HOST_SWAP_REVIEW_REQUIRED`,
hostSwapActive=true ve ACTIVE_HOST_SWAP_NOT_APPROVED_FOR_REAL_DATA engelini
raporlar. productionRestoreVerified ve realRecoveryReady daima false kalır.
Tmpfs içeriğinin host swap'a yazılabileceği için bu sonuç anahtarlı/gerçek
kurtarma ortamı kabulü değildir. CI da artık swapoff çalıştırmadan aynı açık
sentetik seçeneği kullanır. Kullanıcının yeni sonuç çıktısı henüz görülmedi.

Python derlemesinin fcntl mühür sabitlerini dışa aktarmadığı durumda, mevcut
verified-backup.py ile aynı kararlı Linux UAPI değerleri kullanılır; gerçek
kernel mühür ekleme/okuma kontrolü atlanmaz.

## Yenilenmiş terminal ve ayrıntılı adım kaydı

19:44 sayfa yenilenmesinde önceki çıktı kayboldu. 19:52 salt-okuyan kontrolde
prova Python işlemi ve bu araca etiketli konteyner yoktu. Sonuç bilinmediği için
başarı sayılmadı. Sonraki sentetik deneme `nohup` ile başlatılıp yalnız sentetik
stdout/stderr sahibin `orzell-prova.log` dosyasına yönlendirildi. 19:55 ekranında
NOT_READY/ENVIRONMENT_CHECK_FAILED ve çıkış kodu1 görüldü; gerçek veri/anahtar
okunmadı. 19:57 ayrı salt-okuyan tanıda BELLEK_OK, DOCKER_OK ve BOS_ALAN_GB4
görüldü. Bu ön koşullar PostgreSQL provasının tamamlandığı anlamına gelmez;
önceki hatanın sonraki adımı henüz bilinmiyor.

Araç artık Docker çağrıları ve doğrulama adımlarından önce sabit adları JSON
satırlarıyla hemen yazar. Timeout hatası örneğin DOCKER_PULL_TIMEOUT veya
DOCKER_START_TIMEOUT olarak ayrılır. Diğer genel hatalarda yalnız exception
türü ve sayısal errno verilir; ham hata, komut argümanı, ortam değişkeni veya
kimlik yayımlanmaz. Bu sayede kalıcı sentetik logun son satırları nerede
durulduğunu gösterir. Son satır sonuç JSON'udur; ilerleme satırları başarı
kanıtı değildir. İzolasyon/anahtar/gerçek kurtarma kısıtları aynı kalır.

## Birincil kaynaklar

- [CloudShell mobil erişim ve Docker desteği](https://docs.aws.amazon.com/cloudshell/latest/userguide/working-with-aws-cloudshell.html)
- [CloudShell kaynakları](https://docs.aws.amazon.com/cloudshell/latest/userguide/vm-specs.html)
- [CloudShell şifreleme](https://docs.aws.amazon.com/cloudshell/latest/userguide/data-encryption.html)
- [Docker tmpfs ve host swap sınırlaması](https://docs.docker.com/engine/storage/tmpfs/)

Kaynaklar 6 Kasım 2026'da incelendi. TLS ve disk şifrelemesi, host yöneticisinden
yalıtım veya bağımsız gerçek kurtarma kanıtı olarak sunulmaz.
