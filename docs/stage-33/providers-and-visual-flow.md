# Aşama 33 — sağlayıcılar, görsel akış ve doğrulama

## Uygulama ve güven sınırı

Nest modular monolith ve mevcut worker korunur. Yeni tablo ve endpointler
fotoğrafı tenant-scoped `ConsentRecord` içine sahte businessId ile kaydetmez.
`MvpPhotoConsent`, `MvpPhoto`, `MvpPhotoAnalysis` ve `MvpPrivacyEvent` kullanıcı
sahipliğindedir; birleşik FK'ler fotoğraf/izin/analiz sahibini DB'de de bağlar.
Tenant audit'i yalnız işletme doğrulaması ve katalog index job'unda kullanılır.
`MvpCatalogVector` ve `MvpVerificationRequest` mevcut business/service modellerine bağlıdır.

## Fotoğraf → sorular → plan → arama

- `GET /mvp/v1/photos/policy`: incelenmiş notice/version ve yapılandırma durumu.
  Bu, canlı sağlayıcı kabulünün kanıtı değildir; gerçek storage güvenliği
  izin kaydından önce kontrol edilir ve her işlem hata verebilir.
- `POST /photos/consents`: açık kabul + güncel policyVersion; saklama bitişi ve
  notice hash'i kaydedilir. `GET /photos/consents` yalnız sahibinin aktif izinlerini listeler.
- `POST /photos/upload/:consentId`: JWT + tek multipart `photo` alanı;
  5 MB JPEG/PNG, 20 MP decode sınırı; normalize JPEG'de EXIF/GPS kaldırılır.
  Sunucu özel S3'e yazar. Public/presigned download veya client-supplied URL yoktur.
- `POST /visual/sessions`: owner photoId + intent/target; response yalnız public
  session projection'ıdır, object key veya başka kullanıcının girdisi dönmez.
- `POST /visual/sessions/:id/analyze`: `answers`, `expectedAttempt`; atomik claim,
  en çok üç açık deneme, çağrı kotası, kill switch ve input/output safety.
  Responses API `input_image` ve strict `text.format` kullanır; tools, otomatik
  DB erişimi veya fiyat/booking mutasyonu yoktur. Runtime validation, incomplete,
  refusal, malformed output, timeout ve provider hataları başarı sayılmaz.
- `NEEDS_INFORMATION` sorularını kullanıcı yanıtlar; `PLAN` önerileri ve
  sınırlamaları ayrı görünür. Oluşan sorgu `.../:id/matches` üzerinden gerçek
  embeddings + pgvector cosine sorgusuna gider. Skor işlem sonucu olasılığı değildir.
- `POST /photos/consents/:id/withdraw`: rollout/provider kapalıyken de çalışır;
  owner doğrulanır, erişim kapatılır, metin/sonuç temizlenir, geri dönen in-flight
  sağlayıcı yanıtı commit edilemez. UI da kendi generation kontrolüyle eski yanıtı atar.

Eşleşen hizmetler mevcut catalog/professional/availability/booking yoluna bağlanır.
Ana DATABASE katalog sıralaması değiştirilmez; semantic yüzey ayrı, açık bir kullanıcı eylemidir.

## S3, pgvector ve worker

`@aws-sdk/client-s3` kullanılır. Production'da özel endpoint override kabul edilmez;
AWS credential chain/IAM runtime binding kullanılır. Bucket versioning kapalı,
Public Access Block açık olmalıdır; yazımlar SSE-S3/AES256 ve If-None-Match ile yapılır.
Fotoğrafın ham metadata'sı, object key'i, provider isteği veya credential loglanmaz.
Yerel S3 override yalnız `NODE_ENV=test` ve `http://127.0.0.1:9000` için geçerlidir.

`MVP_CATALOG_EMBED_V1` job'u mevcut durable PostgreSQL kuyruğunda actor/tenant
ile saklanır; Redis wakeup kullanılır. Worker güncel yetkiyi tekrar kontrol eder.
Sadece public/ACTIVE işletmenin active/bookable hizmet adı/açıklaması indexlenir.
OpenAI embedding modeli ve sabit 1536 boyut eşleşmelidir; SQL parametreli vector
cast kullanır. Model, service ve business timestamp'leri stale veya yanlış model
kayıtlarını dışlar. İşçi retry'ı billable çağrıları otomatik tekrarlamaz.

Silme worker'ı fotoğrafın erişim bitişini/geri çekilmesini ve upload lease'ini
kontrol eder; S3 silme başarısızsa `deletedAt` yazmaz ve sonraki turda tekrar dener.
Analiz girdisi/sonucu süre sonunda temizlenir. İzin/audit metadata bitişi kayıt
oluşturulurken dondurulur; ayarlar sonradan kaldırıldığında süre kaybolmaz.
Fiziksel silme bekleyen kaydın object key'i retry tamamlanmadan kaybedilmez.

Çalıştırma: mevcut `pnpm --filter @beauty-platform/api worker`; yalnız silme
görevleri için `node apps/api/dist/worker.js --privacy-cleanup` veya `--privacy-cleanup --once`.
Cleanup-only modu normal MVP rollout kapalıyken de başlatılabilir. Runtime DB,
S3 ve temel uygulama ayarları gereklidir. Worker'ın sürekli çalışması gerekir;
kapalı worker'a rağmen fiziksel silme tamamlanmış gibi yanıt verilmez.

## İşletme doğrulaması

İşletme mobil panelinden version'lı koşulları ve tanımlı alanları okur, başvurur,
durumu izler veya bekleyen başvuruyu iptal eder. Next.js operasyon ekranı kanıtı,
gerekçeyi ve incelemeci beyanını gösterir. Karar endpoint'i yalnız SUPER_ADMIN
ve o işletmeye üye olmayan incelemeciyi kabul eder. Policy version, evidence
expiry, state ve tekrar kontrol edilir. Karar, `Business.isVerified` ve audit
aynı transaction'dadır. AI/kayıt/profil yayını otomatik doğrulama oluşturmaz.

## Açık kabul sınırı

Unit/OpenAI contract doubles canlı provider başarısı değildir. CI'daki MinIO
ephemeral S3-compatible SDK kabulüdür; production AWS güvenlik ayarlarının yerine
geçmez. Gerçek pgvector sorgusu synthetic embedding fixture'ıyla test edilir;
bu, canlı OpenAI embeddings hesabını doğrulamaz. Native JS/Hermes export,
APK/IPA veya cihazda çalışma kabulü değildir. Gerçek bağlantı/politika/cihaz
kapıları ayrı kalır. [İnceleme taslakları](policy-drafts.md) etkinleştirilmiş değildir.

Resmî uygulama kaynakları (20 Ekim 2026):

- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/embeddings
- https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html
- https://github.com/pgvector/pgvector
