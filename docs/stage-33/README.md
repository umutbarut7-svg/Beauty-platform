# AŞAMA 33 — PRE-LAUNCH / MVP BUILD SPECIFICATION

> Güncel kabul ve kalan işler: [27 Ekim durum kaydı](current-status.md). Aşağıdaki eski run/NOT RUN kayıtları tarihsel kanıttır; bugünün genel durumu olarak kullanılmaz.

## Kaynak ve temel

[Kilitli kullanıcı kaynağı](00-user-source.md) normatiftir. Bu belgelerdeki API,
ekran ve depolama tasarımı teknik uygulama seçimidir; yeni bir ürün kapsamı veya
kullanıcı tarafından verilmiş doğrulama/komisyon politikası değildir.

Temel: main `20550365a19d090221108f3a7fbffe8190647bd3`, tree
`66cfe7c7d392d82041c0463aa868f158c6dffe43`. Aşama 32 run
[39295074744](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39295074744)
tüm zorunlu kapılardan geçmiştir. Aynı gate'ler korunur. Aşama 34/35, dağıtım,
mağaza gönderimi ve gerçek ödeme/bildirim gönderimi kapsam dışıdır.

## Katmanlar ve gerçek başlangıç durumu

- `apps/mobile/App.tsx`: Expo/React Native müşteri ve işletme deneyimi. Temelde
  yalnızca başlangıç metni vardı; domain API'lerinin varlığı mobil ekran kanıtı değildi.
- `apps/admin/app`: Next.js operasyon/yönetim arayüzü. İşletme üyeliği platform
  yöneticisi yetkisi vermez. İşletme deneyimi mobile içinde ayrı görünümde kalır.
- `apps/api/src/app.module.ts`: NestJS modular monolith. Auth, tenancy/RBAC,
  availability/appointments, CRM, discovery, AI orchestrator, DNA, professional
  intelligence, financial, governance modülleri mevcut. Yeniden oluşturulmazlar.
- `apps/api/prisma/schema.prisma`: 185 temel model. `Appointment` operasyonel
  beauty job state'inin kaynağıdır. Sonuç ve öznel memnuniyet yeni, ayrı,
  değiştirilemez kayıtlar olarak eklenir; gelir kaynağı financial ledger olmaya devam eder.
- `infrastructure/background-jobs.service.ts`: PostgreSQL kalıcı kuyruk,
  tenant/actor/correlation, idempotent enqueue, retry ve dead letter mevcut.
  Temelde worker process giriş noktası yoktu. Redis/S3/OpenAI/pgvector adapter'ı
  veya doğrulanmış sağlayıcı bağlantısı yoktu. Deterministik agent provider,
  görsel analiz veya gerçek OpenAI sonucu olarak gösterilemez.
- Tam endpoint/model/dosya envanteri [inventory.md](inventory.md), her iki akışın
  kabul sözleşmesi [acceptance-matrix.md](acceptance-matrix.md).

## Uygulama sözleşmeleri ve yetki

Mevcut `/auth/register|login|refresh|logout|me` DTO'ları kullanılır. Register
yalnızca CUSTOMER oluşturur; işletme yaratma transaction'ı BUSINESS_OWNER üyeliği
sağlar. İstemci role/tenant/verification/price veya ledger durumu atayamaz.
Tokenlar UI belleğindedir, log/URL/localStorage içine yazılmaz. 401 oturumu temizler.

Yeni sürümlü yüzey `/mvp/v1` altındadır. `STAGE33_MVP_ENABLED=true` olmadan
mutasyonlar ve özel okumalar 503 verir. Capabilities yanıtı yalnızca kullanılabilir
özellikleri belirtir; sağlayıcı anahtarlarını veya bağlanmış gibi sonuç göstermez.

- `GET /mvp/v1/capabilities`: authenticated; v1, flag, fotoğraf/AI/provider durumu.
- `GET /mvp/v1/bookings`: authenticated kişinin kendi randevuları, en çok 100;
  yalnızca public appointment projection. Başka müşteri veya internalNote dönmez.
- `POST /mvp/v1/businesses/:businessId/appointments/:appointmentId/result`:
  `ResultDto { summary: string(1..2000), idempotencyKey: string(1..100) }`.
  Appointment tenant ve actor scope kontrolü + business appointment:read;
  yöneticiler veya yalnızca atanmış profesyonel. Sadece COMPLETED appointment.
  Bir appointment için tek değiştirilemez sonuç. Eşzamanlı aynı istek replay;
  farklı payload/key veya yabancı tenant 409/404. Audit aynı transaction'da.
- Aynı path altında `GET result`: yalnızca domain'in zaten izin verdiği actor;
  PII/internalNote yerine sonuç projection'ı.
- `POST .../satisfaction`: `SatisfactionDto { outcome: SATISFIED|UNSATISFIED|UNSURE,
idempotencyKey }`. Bu sınıflar teknik seçimdir, puan/kalite eşiği değildir.
  Yalnızca appointment'ın gerçek customer.userId'si; işletme veya SUPER_ADMIN
  müşteri adına memnuniyet yazamaz. Sonuç olmadan 409; immutable/idempotent.
- `GET /mvp/v1/passport`: yalnızca JWT actor'ünün kendi tamamlanmış sonucu ve
  kendi memnuniyet kaydı; en çok 50 son kayıt. Başka müşteri parametresi kabul etmez.
  Bu kanıta dayalı işlem geçmişidir, Beauty DNA inference veya tıbbi profil değildir.

Booking mevcut `POST /businesses/:businessId/appointments` DTO'suyla mevcut
availability/transaction/overlap kurallarından geçer. Beauty Job için ayrı
durum makinesi icat edilmez: PENDING → CONFIRMED/CHECKED_IN → IN_PROGRESS →
COMPLETED; CANCELLED/NO_SHOW terminaldir. Fiyat ve uygunluk sunucudan gelir.
Result/satisfaction, geçmiş appointment veya finansal ledger'i değiştirmez.

## Ekranlar ve davranış

Mobile: giriş/kayıt, müşteri/işletme görünümü, intent/target, gerçek discovery,
business/service/professional seçimi, availability slot seçimi, rezervasyon,
job/result/memnuniyet/passport; işletmede profil/üye/hizmet/uygunluk/randevu/
sonuç/ledger özeti. Operasyon console mevcut tenant API'lerini kullanır;
doğrulanmamış sağlayıcı/verification için açık unavailable durumu gösterilir.

Her ağ işlemi: disabled/loading, erişilebilir durum metni, empty, 401, 403,
409 ve genel güvenli hata. JSON yerine insan tarafından okunur ana projection'lar;
sunucuya gönderilen girdiler DTO sınırlarını takip eder. Ağ hatası mevcut veriyi
başarılı mutation gibi işaretlemez. Aynı isteğin yeniden gönderilmesinde aynı
idempotency key korunur. Ekran yenileme yeni oturum gerektirir.

## Privacy, dış servis ve kesin engeller

Fotoğraflar için public URL, base64 request body loglama veya genel upload
endpoint'i eklenmez. Kullanıcı sahibi, consent purpose/notice version,
retention/hold politikası ve private S3 adapter doğrulanmadan transfer açılamaz.
İşletme seçilmeden önceki fotoğraf, mevcut tenant-scoped ConsentRecord'a yanlış
tenant ile bağlanamaz. Bu akış için onaylanmış owner/platform consent ve retention
kararı kaynakta eksiktir. Bu bir **BLOCKED** kabul koşuludur; UI bunu saklamaz.

Business Verification için mevcut `Business.isVerified` okunur. Credential
verification başka bir domain'dir ve işletmeyi otomatik doğrulamaz. Onaylanmış
işletme verification politikası, kanıt toplama ve yönetici review sözleşmesi
eksiktir; kayıt açmayı doğrulama gibi göstermeyiz.

OpenAI gerçek key/model, incelenmiş notice ve policy olmadan çağrılmaz. Güncel
[Responses / structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
ve [vision](https://developers.openai.com/api/docs/guides/images-vision) belgeleri
19 Ekim 2026'da incelendi: görsel `input_image`, schema `text.format` kullanır.
Bu değişiklik doğrulanmamış text provider'ı görsel analiz olarak sunmaz. Anahtar
sohbette istenmez. Provider olmadan Smart Questions/Analysis/Result Plan tam
ürün kabulü **BLOCKED** kalır. S3/OpenAI/Redis/pgvector gerçek entegrasyon kabulü
ayrı yapılır; unit test double'ları sağlayıcı kanıtı değildir.

Redis kalıcı DB job kaydının yerini sessizce almaz. Mevcut worker yürütücüsü
aynı monolith modüllerini application context olarak kullanır. Yeni handler
yetkilendirme/tenant lookup yapmalı; JSON payload yetki kanıtı değildir. Handler
ve sağlayıcı yoksa iş başarıyla tüketilmez. Fotoğraf/AI payload'ları bu aşamadaki
genel kuyruk üzerinden gönderilmez. pgvector semantic matching yokken mevcut
deterministik discovery açıkça DATABASE provider olarak kalır.

## DoD ve çalışma

`pnpm@10.28.1`, Node 24 / repo desteklenen >=22; `pnpm install --frozen-lockfile`.
`pnpm --filter @beauty-platform/types build`, Prisma validate/generate,
`prisma:migrate` yalnızca disposable DB, migration status ve representative upgrade;
`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check`,
`git diff --check`. `test:stage33:integration` gerçek PostgreSQL + generated
client + Nest HTTP çalıştırır; flags/owner/tenant/state/replay/rollback test eder.
`pnpm --filter @beauty-platform/api worker` build sonrası ayrı process'tir.

Yeni sonuç audit'i yalnızca resource/actor/idempotency correlation metadata tutar;
summary, photo, prompt, token, contact ve provider raw payload'ı loglanmaz.
Health/readiness ve HTTP/job metrics mevcut infrastructure üzerinden sürer.
Fiziksel silme adapter ve reviewed retention/hold politikası olmadan çalışmaz.

Native Android/iOS kabulü web export veya Vitest ile PASS sayılamaz. Canlı provider
ve kritik Customer/Business UI E2E koşulları ayrı evidence gerektirir. Tüm zincir,
fotoğraf, provider, verification ve native kapıları geçmeden AŞAMA 33 PASS değildir.

## Uygulamada ortaya çıkan başlangıç sorunları

Tam derlenmiş API HTTP testinde iki çakışan route bulundu; önceki yalnız
module/unit testleri tüm AppModule boot'unu doğrulamıyordu. Liveness/readiness
`/health` ve `/health/ready` olarak Infrastructure'da kalır; eski bootstrap
bilgisi `GET /` olur. Kimlikli üye hizmet atamaları
`/businesses/:businessId/members/:memberId/services` altında ayrılır;
`/staff/:staffId/services/:serviceId` gerçek profesyonel profilini yönetir.
Bu iki farklı ID tipinin çakışan DELETE rotası kaldırılmış, yetki/servis
implementasyonları korunmuştur. İstemciler member namespace'ine taşınmalıdır.

Sonuç/memnuniyet ve tenant-scoped job kaydı aynı transaction'dadır. Worker
`MVP_PASSPORT_PUBLISH_V1` için owner/tenant/result/satisfaction/state kontrolünü
DB üzerinden tekrarlar. Passport yalnız yayınlanmış sonuçları gösterir. Worker
replay'i birden fazla yayın audit'i oluşturmaz. Redis yalnız PII içermeyen wakeup tick'i taşır; iş kaydı ve yetkisi PostgreSQL'dedir. Feature flag kapalı
worker başlamaz ve başka consumer'ın işlerini tüketmez.

Web kabulü için root dev dependency `@playwright/test@1.64.1` sabitlenmiştir;
lockfile değişiklikleri bu test aracı, Next.js optional peer bağlamı ve açıkça eklenen Redis SDK bağımlılığı içindir.
CI tüm eski kapılardan sonra Chromium kurar, aynı gerçek API/DB/worker'a bağlı
Expo web booking → işletme job/result → müşteri satisfaction/passport ve
Next.js ledger görünümünü çalıştırır. Bu native cihaz testi değildir.

## Redis bağlantısı ve yerel çalışma sözleşmesi

`redis@6.3.0` resmi Node SDK'sı, mevcut PostgreSQL kalıcı kuyruğuna opsiyonel
wakeup adapter'ı olarak eklenmiştir. Redis içine yalnız `1` tick'i yazılır;
photo, prompt, actor, tenant veya job payload'ı taşınmaz. Liste 1 öğeyle ve 10
saniyelik teknik wakeup TTL'iyle sınırlıdır; bu müşteri verisi retention kararı
değildir. Job/idempotency/retry/authority PostgreSQL'de kalır. Redis yoksa
`ready:false` açıkça raporlanır, worker DB polling'e döner; Redis teslimi başarılı
olmuş gibi gösterilmez. Production bağlantısı `rediss://` gerektirir; TLS doğrulama
ayarları kapatılmaz. [Resmi bağlantı dokümanı](https://redis.io/docs/latest/develop/clients/nodejs/connect/)
ve kurulu SDK tipleri kullanılmıştır. Servis hatası URL/credential loglamaz.

Çalıştırma sırası (yalnız geliştirme veya izole test ortamı):

1. Sabitlenen pnpm ile frozen install; gerçek DB'de Prisma validate/generate;
   test migration'ı yalnız disposable DB'ye uygulayın.
2. Runtime bağlamında `DATABASE_URL`, JWT anahtarları ve izinli `CORS_ORIGINS`
   sağlayın; secret değerlerini git veya terminal çıktısına yazmayın.
3. `STAGE33_MVP_ENABLED=true` ile `pnpm --filter @beauty-platform/api build`,
   ardından `pnpm --filter @beauty-platform/api start`.
4. Ayrı process: aynı gözden geçirilmiş runtime bağlamıyla
   `pnpm --filter @beauty-platform/api worker`. Flag kapalıysa worker başlamaz.
5. Redis için `MVP_REDIS_ENABLED=true`, runtime `MVP_REDIS_URL` binding'i;
   aksi halde açık PostgreSQL polling fallback'i kullanılır.
6. Expo: `EXPO_PUBLIC_API_URL` erişilebilir API origin'i ile
   `pnpm --filter @beauty-platform/mobile dev`. Native fiziksel cihazın localhost'u
   API host'u değildir; gerçek cihaz için erişilebilir HTTPS origin gereklidir.
7. Next.js: `NEXT_PUBLIC_API_URL` ile `pnpm --filter @beauty-platform/admin dev`.
   Üretim dışı local HTTP yalnız loopback/emulator adresleri için kabul edilir.
   Bu public değişkenlere hiçbir sağlayıcı veya JWT secret'ı eklenmez.

`test:stage33:integration` aynı disposable PostgreSQL ve Redis üzerinde çalışır.
Paylaşılan Redis wakeup sinyalinde test fixture yarışını önlemek için dosyalar
seri çalışır; üretim retry/authorization/rate-limit kuralları gevşetilmez. Testler
gerçek SDK bağlantısı, sınırlı/non-PII tick, Redis yokken fallback ve production
TLS gereksinimini doğrular. pgvector semantic adapter ve canlı OpenAI/S3
entegrasyonu halen doğrulanmış değildir; bunlar tamamlandı diye işaretlenmez.

## Doğrulama kaydı

Gerçek komutlar, CI bağlantıları, web/native/provider sınırları ve kalan zorunlu
kabul engelleri [validation.md](validation.md) içinde kaydedilir.
