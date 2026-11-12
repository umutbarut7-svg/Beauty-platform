# Ağsız geri yükleme ve erişim karantinası bileşeni

`restore-backup-isolated.py`, doğrulanmış paketin bellek üzerinde açılan dump'ını
ayrı, geçici PostgreSQL'e yüklemek için hazırlanır. CLI varsayılanı
`OFFLINE_NO_ACTION` olur; anahtar/paket kabul eden komut veya upload endpoint'i
eklenmez. Sahibin gerçek anahtarı ve üretim yedeği bu çalışmada kullanılmaz.

## Girdi ve hedef sınırı

`recover_and_restore` bağımsız signer/alıcı/kaynak/zaman/paket bağlarını önceki
`verified_dump` API'siyle denetler. Ayrı bir referanstan alınmış katalog SHA256'sı,
açık erişim geçersizleştirme kabulü ve en fazla 300 saniyelik DB işlem sınırı
zorunludur. Dump üst sınırı 128 MiB'dir. Alt katman yalnız mühürlü, düzenli,
boyutu sınır içindeki PGDMP tanıtıcısını kabul eder.

Hedef yalnız önceden indirilmiş, digest ile sabit PostgreSQL 17/pgvector imajıdır.
Yeni rastgele isimli konteynerin ayarları başlamadan önce ve çıktıktan sonra
denetlenir: network none, public port/host mount/harici volume yok, root olmayan
kullanıcı, salt okunur rootfs, capabilities kapalı, no-new-privileges, 1 GiB RAM
ve aynı memory-swap sınırı, 1 CPU, 128 PID, core 0, Docker log driver none.
Dump ve DB yalnız 512 MiB tmpfs içindedir. SQL hataları, müşteri satırları ve
ham komut çıktıları rapora verilmez. Kota/süre/izolasyon/temizlik hatası başarı
üretmez; yalnız oluşturulan rastgele hedef zorla kaldırılır ve yokluğu okunur.

Katalog karşılaştırması namespaces, ilişkiler, kolonlar, constraints, indexes,
enums, fonksiyonlar, kullanıcı triggers, extension sürümleri ve uygulanmış
Prisma migration kimliği/checksumlarını kapsar. Bu kapsam tam bir DDL güvenlik
incelemesinin veya yeniden erişim açma onayının yerine geçmez. Beklenen hash
geri yüklenen hedeften veya paketin yan dosyasından üretilemez.

`pg_dump` silinmiş kolonların fiziksel sıra boşluklarını ve enumların kesirli
iç sıra numaralarını yeniden oluşturmaz. Katalog bu iki alan için yaşayan
kolon/değerlerin sırasını karşılaştırır; ad, tip, varsayılan, enum etiketi ve
etiket sırası korunur. `public.BeautyJobSatisfaction` tablosundaki
`BeautyJobSatisfaction_outcome_check` ifadesinin ARRAY text cast'i PostgreSQL
tarafından eleman başına cast olarak yeniden yazılır. Yalnız bu adlandırılmış
kısıttaki iki tam, incelenmiş ifade aynı biçime eşlenir; başka ifadeler veya
kısıtlar atlanmaz. CI kolon tipi, yeni kısıt, bu özel kısıtın izinli değerleri,
enum etiketi ve migration checksum değişikliklerini ayrı transaction'larla
sınar; her probdan sonra referansın değişmediğini denetler.

Başarısız geri yüklemede de konteyner kaldırıldıktan sonra yokluğu doğrulanır.
Temizlik hatası veya kalan hedef, ilk hatanın üstüne yazsa bile başarı sonucu
üretemez. Bunun ayrı sınır testi vardır.

## Geçici kopyada uygulanan karantina

Fiziksel yalıtımın yanında SQL ayrıca offline DB adı ve auth/fotoğraf
geçersizleştirme kabullerini ister. Tek transaction içinde:

- Eski parola hash'leri girişe kapalı bir marker ile değiştirilir; refresh
  sessions ve API credentials geçersizleştirilir. API uygulama/client ve webhook
  endpoint'leri iptal edilir; bekleyen webhook teslimleri başarısız duruma alınır.
  Push cihazları pasifleştirilir.
- Tüm geri yüklenen fotoğraf izinleri ve fotoğraflar erişime kapatılır; analiz
  ve matching içeriği temizlenir. Yeni audit olayı `photo.restore.invalidated`
  olur; kullanıcı geri çekmiş gibi sahte olay yazılmaz. Önceki geri çekilme
  zamanı ve audit saklama sonu korunur.
- İkinci uygulamanın yeni olay/tarih üretmediği ve seçili kullanıcı/işletme/audit
  alanlarının korunduğu doğrulanır. Şema tekrar karşılaştırılır.

Uygulama, worker, bildirim veya AI sağlayıcı çağrısı başlatılmaz. Konteyner
sonuçtan sonra kaldırılır; DB hiçbir zaman açık bırakılmaz. Çıktıda
`reopenAuthorized=false` ve `realRecoveryReady=false` korunur.

## Kabulün kapsamı

CI, ayrı bir PostgreSQL hizmetine gözden geçirilmiş
`2e56def282c97a804a2f3d6c9b36a53b42a09df5` uygulamasının migration'larını uygular.
Yalnız yapay hesap/oturum/API anahtarı/push/webhook/fotoğraf kayıtları ekler.
Gerçek pg_dump, yeni yapay RSA/CMS imzalı paket, mühürlü bellekte çözme,
network-none pg_restore ve iki kez karantina zinciri sınanır. Yanlış şema
referansı reddedilmeli; başarılı ve başarısız hedeflerin ikisi de kaldırılmalıdır.
CI host swap kabulünü yalnız yapay fixture için taklit eder; gerçek API'de
swap bypass seçeneği yoktur. Üretim host kabulü veya güncel gerçek yedek provası
bu CI sonucu değildir. 61f97f0 tesliminin veya gelecekteki backup şemasının bu
referansla aynı olduğu varsayılmaz.

Kalanlar: korumalı telefon anahtar/paket teslimi; gerçek başarı makbuzu ve
şemaya bağlanan referans; gerçek restore ölçümü; eski JWT/encryption secret
yenileme ve yeniden kayıt politikası; sonraki silme/geri çekilme uzlaşması;
fiziksel nesne erasure; bağımsız inceleme ve EC2/stack kaynak temizliği.
Bu bileşen EC2 veya mevcut 120 dakikalık timer üzerinde değişiklik yapmaz.
AŞAMA 33 **NOT PASS**.

