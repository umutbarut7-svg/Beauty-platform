# B08 — İşletme talep paneli

Bu belge kilitli kaynağa yeni ürün kuralı eklemez. Mevcut marketplace domain
verilerinin mobil akışta okunmasını tanımlar. Aşama 33 bütünü PASS değildir.

## Uygulanan sözleşme

- `apps/mobile/BusinessDemand.tsx` seçili işletmeye bağlıdır; işletme değişimi,
  çıkış veya oturumun sona ermesi eski paneli kaldırır. Dönem değişimi ve
  yenileme önce eski sonuçları temizler. Loading uygulamanın ortak göstergesini
  kullanır; hata mesajı ve yeniden deneme vardır. Başarısız iki sorgudan biri
  eski veya kısmi başarı göstermez.
- Salt okunur `GET /businesses/:businessId/marketplace/demand` ve `/liquidity`
  kullanılır. Query `window=ROLLING_7_DAYS|ROLLING_30_DAYS|ROLLING_90_DAYS`;
  panel `limit=20` gönderir. URL limitinin sayıya çevrilmesi düzeltildi;
  integer 1–100 sınırı, JWT ve mevcut işletme üyeliği korunur. STAFF ve
  üye olmayan kullanıcılar intelligence okuyamaz. SUPER_ADMIN davranışı mevcut
  domain kuralıdır.
- Demand sorgusu hem tenant hem timeWindow hem gözlem zamanı ile sınırlanır.
  Süresi geçmiş ve geleceğe tarihli kayıtlar seçilen döneme karışmaz. Dönem
  verilmeyen dahili servis çağrılarının önceki davranışı korunur; HTTP DTO'su
  halen window zorunlu tutar. Yeni migration veya veri üreticisi eklenmez.
- Son 20 sinyal ayrı kayıtlar olarak gösterilir; gözlem, türetilmiş veri ve
  tahmin ayrıdır. Sinyal toplamı, benzersiz müşteri sayısı, tahsilat veya
  gelir hesaplanmaz. `NO_DATA`, `ZERO`, `INSUFFICIENT_DATA`, `STALE_DATA`
  birbirinin yerine gösterilmez. Snapshot'ın gerçek dönemi ve hesaplama zamanı
  görünür. Panel otomatik yeniden hesaplama veya ticari müdahale yapmaz.
- Sunucu projection'ı `evidence`, kaynak kişi/entity referansı veya müşteri
  bilgisi içermez. UI ham hata gövdesi, credential veya payload loglamaz.
  Mevcut request metrics/logging ve yetki reddi kayıtları korunur.

## Kabul kontrolleri

Unit: URL limit dönüşümü, sınır dışı/non-finite değerler, geçersiz dönem,
observation-window filtresi ve STAFF reddi. Önceki DTO testleri korunur.

`integration/mvp.e2e.test.ts`: gerçek PostgreSQL kayıtları ile güncel, eski,
gelecek, farklı dönem ve predicted sinyaller; güvenli response projection,
üye olmayan/STAFF/JWT reddi ve DTO hataları. Mevcut gerçek Chromium yolculuğu
panelde stale snapshot, dönem değiştirme, tahmin etiketi, boş veri,
üyelik yetkisinin gerçekten kaldırılması sonrası hata/önceki verinin temizlenmesi
ve işletme değişimini çalıştırır. Test doubles bu kapıda kullanılmaz.

20 Ekim yerel sonuç: Node 24.19.0, pnpm 10.28.1 frozen install; workspace test
(API 424 test / 93 dosya), typecheck, lint, format ve build başarılı.
Integration TypeScript kontrolü başarılı. Prisma 6.19 generate ve validate da
bu ortamda başarılıdır; eski ortamın engine engeli bu çalışmaya taşınmaz.
Yerel PostgreSQL/Redis servisleri ve native araçlar kurulu olmadığından gerçek
DB/Chromium/worker kabulü mevcut GitHub CI kapısında ayrıca doğrulanmalıdır.
Bu belgenin eklenmesi tek başına yeni CI veya native başarısı iddia etmez.

## Kalan sınırlar

Panel yeni sinyal veya yeterli veri uydurmaz; canlı ingest kaynağı veri
sağlamıyorsa boş kalır. Bu uygulama işletme AI Match konsolu, private S3,
OpenAI vision, pgvector adapter'ı, doğrulama politikası veya fotoğraf
consent/retention kararlarının tamamlandığı anlamına gelmez. Gerçek Android/iOS
cihaz kabulü ayrıca gereklidir. Aşama 34/35, production ve main merge kapsam dışıdır.
