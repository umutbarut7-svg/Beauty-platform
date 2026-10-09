# Beauty Platform

Güzellik, bakım, kuaför, sağlık ve spor dikeylerine genişleyebilen; müşteri,
randevu, hizmet, işletme operasyonları ve AI destekli deneyimleri tek üründe
buluşturan **AI-first super app** için monorepo başlangıç noktası.

> **Durum:** Monorepo geliştirme temeli çalışır durumdadır. Expo mobil uygulaması,
> Next.js yönetim paneli, NestJS/Fastify API, ortak paketler ve kalite komutları
> ürün özelliği içermeyen minimum başlangıçlar olarak hazırlanmıştır.

## Mevcut durum analizi

| Alan               | Mevcut durum                            | Sonuç                                                    |
| ------------------ | --------------------------------------- | -------------------------------------------------------- |
| Mobil uygulama     | Expo + React Native                     | TypeScript başlangıcı ve web export'u çalışıyor.         |
| Web yönetim paneli | Next.js                                 | App Router tabanlı minimum başlangıç çalışıyor.          |
| Backend/API        | NestJS + Fastify                        | `/health` uç noktası olan modüler başlangıç çalışıyor.   |
| Paket yönetimi     | pnpm workspace + Turborepo              | Uygulama ve ortak paket görevleri kökten yönetiliyor.    |
| Test ve kalite     | Vitest + ESLint + Prettier + TypeScript | Kök kalite komutları tüm workspace'leri doğruluyor.      |
| Altyapı            | Yok                                     | Lokal servisler, deployment ve CI/CD henüz tanımlanmadı. |

### Tespit edilen eksikler

- Ortam değişkeni sözleşmesi, kimlik doğrulama ve yetkilendirme modeli yok.
- Veritabanı şeması, migration/seed yaklaşımı ve tenant izolasyonu yok.
- Loglama, metrik, tracing, hata izleme ve audit log altyapısı yok.
- CI, güvenlik taramaları ve deployment akışı henüz yok.
- AI sağlayıcı soyutlaması, araç izinleri, prompt sürümleme ve değerlendirme
  (eval) süreci yok.

Bu temel ürün davranışı eklemez. Mevcut monorepo sınırları korunarak yalnızca
çalıştırılabilir uygulama girişleri, ortak sözleşmeler ve geliştirme araçları
eklenmiştir.

## Önerilen teknoloji yığını

| Katman             | Öneri                                  | Gerekçe                                                                    |
| ------------------ | -------------------------------------- | -------------------------------------------------------------------------- |
| Monorepo           | pnpm workspaces + Turborepo            | Hızlı, deterministik kurulum; ortak paketler ve cache edilebilir görevler  |
| Mobil              | Expo + React Native + TypeScript       | iOS/Android ortak kod tabanı, OTA ve native modül esnekliği                |
| Yönetim web        | Next.js + TypeScript                   | SSR/RSC, iyi geliştirici deneyimi ve güvenli sunucu sınırı                 |
| API                | NestJS, Fastify adapter + TypeScript   | Modüler domain yapısı, doğrulama, OpenAPI ve yüksek throughput             |
| Veri               | PostgreSQL + PostGIS + pgvector        | İşlemsel veri, konum ve embedding aramasını tek güvenilir çekirdekte tutma |
| Cache/queue        | Redis + BullMQ                         | Cache, rate limit ve başlangıç aşaması background job ihtiyaçları          |
| Dosya              | S3 uyumlu object storage + CDN         | Görsel/video için ölçeklenebilir saklama ve dağıtım                        |
| Kimlik             | OIDC/OAuth 2.1 uyumlu sağlayıcı        | MFA, sosyal giriş ve merkezi oturum yönetimi                               |
| Gözlemlenebilirlik | OpenTelemetry + yapılandırılmış loglar | Dağıtık tracing ve sağlayıcıdan bağımsız izleme                            |
| API sözleşmesi     | OpenAPI + üretilmiş istemciler         | Mobil/web ile backend arasında tip güvenliği                               |

İlk sürüm **modüler monolit** olarak başlamalıdır. Randevu, katalog, müşteri,
ödeme ve bildirim domain sınırları kod içinde korunmalı; yalnızca ölçülmüş ihtiyaç
oluştuğunda ayrı servislere çıkarılmalıdır. Bu yaklaşım erken mikroservis
maliyetini önlerken yatay ölçeklemeye açık kalır.

## Hedef mimari

```text
apps/
├── mobile/       # Expo / React Native müşteri ve çalışan deneyimi
├── admin/        # Next.js işletme ve platform yönetim paneli
└── api/          # NestJS/Fastify API ve background worker giriş noktaları
packages/
├── ai/           # Model gateway, agent araçları, guardrail ve eval sözleşmeleri
├── config/       # Paylaşılan lint, TypeScript ve ortam doğrulama ayarları
└── types/        # Framework bağımsız domain/API tipleri
infra/            # Lokal ve bulut altyapısı, gözlemlenebilirlik, IaC
docs/             # ADR'ler, güvenlik, domain ve operasyon dokümanları
```

Bu dizinler bağımsız workspace'lerdir; paketler birbirlerinin yalnızca public
API'lerini kullanmalıdır.

### Önerilen domain sınırları

- **Identity & Access:** kullanıcı, işletme üyeliği, rol/izin ve oturumlar.
- **Tenant & Location:** marka, şube, çalışma saatleri ve kaynaklar.
- **Catalog:** kategori, hizmet, süre, fiyat ve çalışan yetkinliği.
- **Booking:** müsaitlik, rezervasyon, iptal, bekleme listesi ve hatırlatmalar.
- **Customer/CRM:** profil, tercih, onay (consent), not ve geçmiş.
- **Commerce:** sepet, ödeme, iade, komisyon ve faturalama entegrasyonları.
- **AI Experience:** danışman, içerik üretimi, öneri ve operasyon ajanları.
- **Notification:** push, e-posta, SMS/mesajlaşma ve şablonlar.

Her iş kaydı `tenant_id` ile sınırlandırılmalı; repository/service katmanında
tenant kapsamı zorunlu olmalı ve PostgreSQL Row Level Security ile ek savunma
katmanı değerlendirilmelidir. Sağlıkla ilişkili veri normal profil verisinden
ayrılmalı, açık rıza ve saklama/silme politikaları ürün geliştirilmeden önce
netleştirilmelidir.

## AI Agent mimarisi

AI özellikleri doğrudan mobil/web istemcilerinden model sağlayıcısına
bağlanmamalıdır. Backend içindeki AI katmanı şu sorumluluklara sahip olmalıdır:

1. Sağlayıcıdan bağımsız model gateway ve kullanım/maliyet bütçeleri.
2. Şemalı çıktı ve sürümlü prompt/model konfigürasyonu.
3. İzin kontrollü araç kayıt defteri; her araç çağrısında tenant ve kullanıcı
   bağlamı.
4. PII redaksiyonu, içerik güvenliği ve prompt-injection kontrolleri.
5. İnsan onayı olmadan ödeme, iptal, sağlık önerisi veya geri döndürülemez işlem
   yapmayan risk katmanı.
6. Prompt, model, gecikme, token/maliyet, araç çağrısı ve sonuç için audit/tracing.
7. Offline eval veri setleri, regresyon eşikleri ve kontrollü rollout.

Ham hassas veri üçüncü taraf modellere varsayılan olarak gönderilmemeli; veri
minimizasyonu, bölgesel saklama ve sağlayıcının eğitim/veri kullanım koşulları
her entegrasyonda doğrulanmalıdır.

## Güvenlik ve performans ilkeleri

- Kısa ömürlü token, güvenli yenileme, MFA ve RBAC + kaynak bazlı yetki kontrolü.
- Secret'ları repoda tutmama; secret manager ve anahtar rotasyonu kullanma.
- Girdi/çıktı şema doğrulaması, rate limit, idempotency key ve güvenli webhook
  imza doğrulaması.
- Parolaları güçlü adaptif hash ile saklama; hassas alanları aktarımda ve diskte
  şifreleme.
- Audit kayıtlarını değiştirilemez ve uygulama loglarından ayrı tutma; loglarda
  PII maskeleme.
- Availability hesaplarını indeksli sorgularla yapma; medya için doğrudan object
  storage upload ve CDN kullanma.
- SLO'lar tanımlama, yük testi yapma ve yalnızca ölçümlere göre cache/servis
  ayrıştırma.

## Yerel geliştirme

Gereken taban:

- Node.js 22 LTS veya daha yeni LTS sürümü
- pnpm 10
- Docker/Compose (PostgreSQL, Redis ve object storage eklendiğinde)

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### Authentication, RBAC ve tenant güvenliği

API, e-posta/parola ile kayıt ve giriş sonrasında 15 dakikalık access token ile
30 günlük, her kullanımda döndürülen (rotated) refresh token üretir. Refresh
token'ın kendisi veritabanına yazılmaz; yalnızca SHA-256 özeti ve iptal edilebilir
oturum kaydı saklanır. Parolalar bcrypt cost 12 ile hash'lenir. `POST
/auth/logout` oturumu iptal eder; daha önce kullanılmış veya iptal edilmiş token
yeniden kullanılamaz.

| Endpoint                            | Erişim               | Açıklama                                        |
| ----------------------------------- | -------------------- | ----------------------------------------------- |
| `POST /auth/register`               | Public               | Müşteri hesabı oluşturur                        |
| `POST /auth/login`                  | Public               | Access ve refresh token üretir                  |
| `POST /auth/refresh`                | Public               | Refresh token'ı tek kullanımlık olarak döndürür |
| `POST /auth/logout`                 | Public               | Refresh oturumunu iptal eder                    |
| `GET /auth/me`                      | Bearer access token  | Geçerli kullanıcıyı döndürür                    |
| `GET/PATCH /businesses/:businessId` | Bearer + üyelik/RBAC | Tenant kapsamlı örnek kaynak                    |

Roller `SUPER_ADMIN`, `BUSINESS_OWNER`, `BUSINESS_ADMIN`, `STAFF` ve
`CUSTOMER`'dır. Global auth/role guard'ları deklaratif `@Public()` ve `@Roles()`
metadata'sını uygular. Kaynak erişimi merkezi `PermissionsService` üzerinden hem
izin hem de `BusinessMember` üyeliğini doğrular; URL/body içindeki `businessId`
tek başına yetki sağlamaz. Location, staff, service, appointment ve review
tablolarındaki `businessId` foreign key ve indeksleri repository sorgularının
tenant filtresini zorunlu kılması için ortak veri sınırını sağlar.

`.env.example` dosyasını `.env` olarak kopyalayın ve iki farklı, en az 32
karakterlik rastgele JWT secret belirleyin. Uygulama eksik/zayıf secret ile
başlamayı reddeder. `CORS_ORIGINS` virgülle ayrılmış açık origin listesidir.

```bash
pnpm --filter @beauty-platform/api prisma:generate
pnpm --filter @beauty-platform/api prisma:validate
pnpm --filter @beauty-platform/api prisma:migrate
pnpm --filter @beauty-platform/api prisma:seed
```

Seed yalnızca `.invalid` alan adlı sentetik yerel kullanıcı oluşturur; örnek
parola üretim ortamında kullanılmamalıdır.

### Business core API

Business, location, staff ve service yönetimi access token, merkezi permission
matrisi ve `BusinessMember` üyeliğiyle korunur. Alt kaynaklar her sorguda hem
kaynak kimliği hem URL'deki `businessId` ile filtrelenir. `StaffLocation` ve
`StaffService` bileşik foreign key'leri farklı tenant kayıtlarının veritabanı
seviyesinde bağlanmasını da engeller.

- `POST|GET /businesses`, `GET|PATCH /businesses/:businessId`
- `POST|GET /businesses/:businessId/locations`
- `GET|PATCH|DELETE /businesses/:businessId/locations/:locationId`
- `POST|GET /businesses/:businessId/staff`
- `GET|PATCH|DELETE /businesses/:businessId/staff/:staffId`
- `POST|DELETE /businesses/:businessId/staff/:staffId/services/:serviceId`
- `POST|GET /businesses/:businessId/services`
- `GET|PATCH|DELETE /businesses/:businessId/services/:serviceId`
- `GET|POST /businesses/:businessId/members`
- `GET /businesses/:businessId/members/me`
- `PATCH|DELETE /businesses/:businessId/members/:memberId`
- `GET|POST /businesses/:businessId/branches`
- `GET|PATCH /businesses/:businessId/branches/:branchId`
- `GET|PATCH /businesses/:businessId/settings`
- `GET|PUT /businesses/:businessId/working-hours` (`branchId` query/body ile
  şube kapsamı seçilebilir)

Hizmet fiyatları API'ye iki ondalık basamağa kadar decimal string olarak verilir
ve PostgreSQL `DECIMAL(12,2)` olarak saklanır; binary floating point kullanılmaz.

Yeni business onboarding işlemi business, varsayılan settings, yedi günlük
çalışma saatleri ve oluşturan kullanıcının `BUSINESS_OWNER` üyeliğini tek bir
transaction içinde oluşturur. Business ve branch slug'ları normalize edilir;
unique constraint yarışında `-2`, `-3` biçiminde sınırlı retry uygulanır. Tenant
üyelik rolleri `BUSINESS_OWNER`, `BUSINESS_ADMIN`, `MANAGER` ve `STAFF` olarak
ayrı bir `BusinessRole` sözleşmesiyle yönetilir. Son owner seri hale getirilmiş
transaction içinde korunduğundan silinemez veya daha düşük role çekilemez.

### Service catalog API

Service category, service ve business-member/service atamaları da aynı merkezi
permission ve tenant üyeliği kontrolünü kullanır. Service fiyatları ile personele
özel fiyatlar `DECIMAL(12,2)` saklanır; category, member ve service ilişkilerinde
`businessId` bileşik foreign key'in bir parçasıdır.

- `POST|GET /businesses/:businessId/service-categories`
- `GET|PATCH|DELETE /businesses/:businessId/service-categories/:categoryId`
- `POST|GET /businesses/:businessId/services`
- `GET|PATCH|DELETE /businesses/:businessId/services/:serviceId`
- `POST|GET /businesses/:businessId/staff/:memberId/services`
- `PATCH|DELETE /businesses/:businessId/staff/:memberId/services/:serviceId`

Katalog slug'ları tenant içinde unique ve normalize edilir. Staff rolündeki
üyeler yalnızca aktif/bookable hizmetleri okuyabilir; katalog değişiklikleri
owner, admin ve manager izinleriyle sınırlandırılır.

### Booking ve availability API

Randevu zamanları UTC olarak saklanır; slotlar business timezone'unda üretilip
UTC ISO-8601 olarak döndürülür. Availability hesabı business ve staff çalışma
saatlerini, birden fazla günlük çalışma aralığını, izin/bloke zamanlarını,
service süresi ve buffer'larını, aktif randevuları ve staff-service atamasını
birlikte değerlendirir.

Yeni randevularda aktif ve aynı tenant'a ait `locationId` zorunludur. Seçilen
BusinessMember'ın aktif staff profilinin bu location'a atanmış olduğu doğrulanır;
`endsAt`, fiyat ve para birimi istemciden alınmaz, aktif staff-service kaydından
sunucu tarafında snapshot edilir. `PATCH` ile saat, personel, hizmet veya location
değiştiğinde aynı ilişki ve availability kontrolleri tekrar çalıştırılır.

- `GET /businesses/:businessId/availability`
- `GET|POST /businesses/:businessId/appointments`
- `GET|PATCH /businesses/:businessId/appointments/:appointmentId`
- `POST /businesses/:businessId/appointments/:appointmentId/cancel`
- `GET|PUT /businesses/:businessId/staff/:memberId/working-hours`
- `GET|POST /businesses/:businessId/staff/:memberId/time-off`
- `DELETE /businesses/:businessId/staff/:memberId/time-off/:timeOffId`

Rezervasyon transaction'ı staff başına PostgreSQL advisory lock alır, slotu lock
içinde yeniden hesaplar ve `Serializable` isolation kullanır. Ayrıca aktif
randevular için PostgreSQL GiST exclusion constraint bulunur. Böylece eşzamanlı
isteklerde uygulama kontrolü aşılsa bile aynı çalışanın çakışan randevuları DB
tarafından reddedilir. Buffer çakışmaları advisory lock altında uygulama
seviyesinde, gerçek randevu aralığı çakışmaları ise ayrıca DB constraint'iyle
korunur.

Reschedule sırasında eski ve yeni staff kilitleri deterministik sırada alınır ve
mevcut appointment availability sorgusundan hariç tutulur. Böylece atomik
reschedule kendi kaydıyla çakışmazken başka bir eşzamanlı create/reschedule isteği
advisory lock, `Serializable` transaction ve exclusion constraint katmanlarından
en az biri tarafından reddedilir.

### Appointment Lifecycle

Geriye dönük API uyumluluğu için `PENDING`, operasyonel `BOOKED` durumunu;
`IN_PROGRESS` ise `IN_SERVICE` durumunu temsil eder. İzin verilen ana akış
`PENDING → CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED` şeklindedir.
`PENDING` doğrudan `CHECKED_IN`, `CANCELLED` veya `NO_SHOW`; `CONFIRMED` ise
`CANCELLED` ya da `NO_SHOW` olabilir. `CHECKED_IN` gerektiğinde iptal edilebilir.
`COMPLETED`, `CANCELLED` ve `NO_SHOW` terminaldir ve yeniden açılamaz.

- `PATCH /businesses/:businessId/appointments/:appointmentId/status`
- `GET /businesses/:businessId/appointments/:appointmentId/status-history`

Her geçiş, ilgili operasyon timestamp'ini sunucu saatinden üretir. İptal eden
kullanıcı JWT actor kimliğinden alınır; timestamp ve actor alanları request
payload'ından kabul edilmez. Appointment güncellemesi ve tenant-scoped history
kaydı aynı `Serializable` transaction içinde yazılır. Appointment bazlı advisory
lock, eşzamanlı iki geçişin aynı eski durum üzerinden ilerlemesini önler. İlk
`PENDING` history kaydı booking transaction'ının parçasıdır. Availability yalnızca
`PENDING`, `CONFIRMED`, `CHECKED_IN` ve `IN_PROGRESS` kayıtlarını bloke eder.

### Customer CRM

Salon müşteri profilleri platform `Customer` kimliğinden ayrı, tenant-scoped
`BusinessCustomer` kayıtlarıdır. Böylece aynı kişi farklı salonlarda birbirinden
izole profil, iletişim bilgisi ve notlara sahip olabilir. Telefonlar kanonik rakam
formatına, e-postalar lowercase biçimine normalize edilir; tenant içindeki phone
ve email değerleri unique constraint ile korunur.

- `GET|POST /businesses/:businessId/customers`
- `GET|PATCH|DELETE /businesses/:businessId/customers/:customerId`
- `GET /businesses/:businessId/customers/:customerId/history`
- `GET /businesses/:businessId/customers/:customerId/summary`
- `GET|POST /businesses/:businessId/customers/:customerId/notes`
- `PATCH|DELETE /businesses/:businessId/customers/:customerId/notes/:noteId`
- `GET|POST /businesses/:businessId/customer-tags`
- `PATCH|DELETE /businesses/:businessId/customer-tags/:tagId`
- `POST|DELETE /businesses/:businessId/customers/:customerId/tags/:tagId`

Listeleme en fazla 100 kayıtlık sayfalama ve prefix tabanlı ad, telefon ve e-posta
araması kullanır. Detay yanıtı yakın randevuları, status sayılarını, toplam
tamamlanan ziyaretleri, son ziyareti ve tamamlanan appointment fiyat snapshot
toplamını verir; bu son alan ödeme/tahsilat verisi değildir. Booking isteğinde
opsiyonel `customerProfile` verilirse normalize edilmiş phone/email ile aynı
tenant profili bulunur veya booking transaction'ı içinde oluşturulur.
Customer profilleri tercih edilen staff, pazarlama/SMS/e-posta izinleri ve tenant
tag atamalarını destekler. Silme işlemi geçmiş randevuları korumak için hard delete
yerine arşivleme uygular. History ve summary sorguları yalnızca mevcut appointment
price snapshot'larından hesaplanır; ödeme yapılmış gibi bir varsayım üretmez.

### Staff Operations

`Staff`, authentication hesabından bağımsız salon çalışanı profilidir; `userId`
opsiyoneldir. Profil `title`, `acceptsBookings` ve `sortOrder` alanlarını taşır.
Staff-service atamaları tenant-composite foreign key kullanır ve opsiyonel fiyat
ve süre override'larını Decimal tabanlı mevcut snapshot yaklaşımıyla korur.

Haftalık çalışma saatleri aynı günde birden fazla aralığı destekler. Time-off
kayıtları `BREAK`, `TIME_OFF`, `BLOCKED` veya `OTHER` tipindedir ve oluşturan
kullanıcı request payload'ından değil authenticated actor'dan alınır. Availability
motoru aktiflik, `acceptsBookings`, location, aktif service ataması, çalışma
saatleri, time-off ve mevcut appointment kayıtlarını birlikte değerlendirir.
`staffMemberId` verilmezse aktif ve hizmete atanmış staff profilleri taranır ve
her gerçekten uygun slot staff kimliğiyle döndürülür.

### CRM Segments and Insights

Customer segments tenant-scoped `MANUAL` veya `DYNAMIC` olabilir. Manual segment
üyelikleri kalıcı composite ilişkilerle tutulur; dynamic sonuçlar customer,
appointment metric ve tag verilerinden batched olarak hesaplanır ve ayrıca
persist edilmez. Kural biçimi `{ "field": "completedAppointments", "operator":
"gte", "value": 5 }` şeklindedir. Desteklenen operatörler `eq`, `neq`, `gt`,
`gte`, `lt`, `lte`, `in`, `notIn` ve `contains`; alanlar appointment sayaçları,
spend değerleri, ziyaret tarihleri, `daysSinceLastVisit`, preferred staff,
gender, consent alanları ve tags değerleridir.

- `GET|POST /businesses/:businessId/customer-segments`
- `GET|PATCH|DELETE /businesses/:businessId/customer-segments/:segmentId`
- `POST|DELETE /businesses/:businessId/customer-segments/:segmentId/customers/:customerId`
- `GET /businesses/:businessId/customer-segments/:segmentId/customers`
- `GET /businesses/:businessId/customer-insights`
- `GET /businesses/:businessId/customers/:customerId/metrics`

Deterministic insight varsayımları: new customer 30 gün, VIP 5 tamamlanan ziyaret
veya 5000 appointment-price toplamı, at-risk 60 gün, lost 180 gün ve no-show risk
grubu en az 2 cancellation/no-show kaydıdır. Bunlar AI tahmini değil, merkezi
`CRM_INSIGHT_THRESHOLDS` sabitlerinden üretilen deterministik kurallardır. Segment
listeleri maksimum 100 kayıtlık sayfalama, search, tag ve preferred-staff filtresi
kullanır; rule içindeki staff/tag referansları da tenant ownership kontrolünden
geçer.

Tek bir uygulamayı çalıştırmak için pnpm filtresi kullanılabilir; örneğin
`pnpm --filter @beauty-platform/api dev`. API varsayılan olarak `3001` portunda
dinler. Ortam dosyaları ve gerçek credential'lar repository'ye eklenmemelidir.

## Aşamalı geliştirme planı

1. **Kararları sabitle:** ADR'lerle auth sağlayıcısı, hosting bölgesi, ödeme
   sağlayıcısı, veri sınıflandırması ve ilk ülke/regülasyon kapsamını seç.
2. **Developer foundation:** Expo, Next.js ve NestJS scaffold'larını ekle;
   ortak strict TypeScript, ESLint/formatter, test runner ve Turborepo pipeline
   kur.
3. **Lokal altyapı:** PostgreSQL/Redis/object storage compose dosyası, doğrulanan
   `.env.example`, migration ve seed akışını ekle.
4. **Identity ve tenancy:** OIDC, MFA, RBAC, tenant izolasyon testleri ve audit
   logunu tüm ürün domainlerinden önce tamamla.
5. **İlk dikey dilim:** hizmet kataloğu → müsaitlik → randevu akışını API,
   admin ve mobilde uçtan uca geliştir; contract ve e2e testleri ekle.
6. **AI temeli:** model gateway, izinli read-only araçlar, tracing, eval ve insan
   onayı akışını kur; sonra kontrollü yazma araçlarına geç.
7. **Teslimat:** CI quality/security gates, preview ortamları, migration stratejisi,
   yedek/geri dönüş ve SLO dashboard'larını oluştur.

## Katkı kuralları

- Paketler birbirinin iç dosyalarını değil yalnızca public API'sini import etmeli.
- Domain tipleri UI veya ORM frameworklerine bağımlı olmamalı.
- Şema değişiklikleri geriye uyumlu migration ve rollback planıyla gelmeli.
- Yeni AI aracı için tehdit modeli, izin kapsamı, audit olayı ve eval örnekleri
  zorunlu olmalı.
- Her değişiklik lint, type-check, unit/integration test ve secret scan'den
  geçmelidir.

### CRM Automation Engine

Automation akışı `trigger -> conditions -> actions -> execution/audit` biçimindedir. Event trigger'ları customer created/updated, appointment created/confirmed/completed/cancelled/no-show ve segment entered/exited olaylarını destekler. Time-based `days since last completed appointment`, `days until upcoming appointment` ve `customer inactive days` trigger'ları scheduler taklidi yapmaz; worker tarafından çağrılabilecek deterministik evaluator sunar.

Koşullar CRM metrikleri, tag/segment üyelikleri, preferred staff ve appointment status/staff/service/start alanlarını merkezi doğrulanan operatörlerle değerlendirir. Internal action'lar tag ve manual segment ekleme/çıkarma ile internal note oluşturmadır. SMS, email ve push provider action'ları modellenmiştir fakat provider kurulmadığında execution `FAILED` olur; sahte gönderim başarısı üretilmez.

- `GET|POST /businesses/:businessId/automations`
- `GET|PATCH|DELETE /businesses/:businessId/automations/:id`
- `POST /businesses/:businessId/automations/:id/activate|pause`
- `GET /businesses/:businessId/automations/:id/executions`
- `POST /businesses/:businessId/automations/events/process`

Event, automation ve execution kayıtları tenant scoped'dur. `businessId + executionKey` unique constraint aynı automation/event çiftinin side effect'lerini tekrar çalıştırmasını engeller. Correlation/causation alanları ve merkezi maksimum depth 5 döngü koruması sağlar. Archive işlemi execution geçmişini silmez; paused/archived automation yeni event işlemez.

### Notification & Communication Engine

Communication kayıtları `businessId` ile izole edilir ve `IN_APP`, `EMAIL`, `SMS`, `PUSH`, `WHATSAPP` kanallarını destekler. Template renderer yalnızca `{{nested.path}}` token'larını çözer, zorunlu değişkenleri doğrular, çıktıyı escape eder ve kod çalıştırmaz. Template, notification, delivery attempt, preference ve secret değer yerine yalnızca `secretReference` saklayan provider-config modelleri migration ile eklenmiştir.

Notification oluşturma idempotency key gerektirir. Gönderim atomik status claim ile duplicate worker gönderimini engeller; her provider denemesi ayrı delivery audit kaydıdır. Maksimum 3 deneme ve 1s/2s/4s exponential backoff metadata'sı kullanılır. Yalnızca `IN_APP` built-in provider aktiftir; harici kanallarda provider yoksa mesaj gönderilmiş gösterilmez ve `NOT_CONFIGURED` ile başarısız olur. Marketing opt-out `SKIPPED`, transactional tercih ise merkezi policy üzerinden değerlendirilir.

- `GET|POST /businesses/:businessId/notification-templates`
- `GET|PATCH|DELETE /businesses/:businessId/notification-templates/:id`
- `GET|POST /businesses/:businessId/notifications`
- `GET /businesses/:businessId/notifications/:id`
- `POST /businesses/:businessId/notifications/:id/send|cancel|retry`
- `GET|PUT /businesses/:businessId/notification-preferences`
- `GET|PUT /businesses/:businessId/notification-provider-configs`

Automation `SEND_NOTIFICATION` action'ı template, channel, recipient, variables ve schedule bilgisiyle notification oluşturur; automation execution, correlation ve causation bağları korunur. Appointment kimliği tenant doğrulamasından geçtiği için appointment lifecycle event handler/worker'ları aynı idempotency key ile güvenle notification üretebilir. Communication lifecycle değişiklikleri mevcut event store'a `NOTIFICATION_CREATED`, `SCHEDULED`, `SENT`, `DELIVERED`, `FAILED`, `CANCELLED` veya `SKIPPED` audit event'i yazar.

#### Notification completion: inbox, push devices, messaging and outbox

In-app notifications expose unread count and idempotent single/all-read operations. Preferences are scoped by tenant, customer/user, channel and category (`BOOKING`, `BOOKING_REMINDER`, `BOOKING_CHANGE`, `DEMAND`, `BEAUTY_JOB`, `RESULT`, `PAYMENT`, `SECURITY`, `SYSTEM`, `MARKETING`). `SECURITY` notifications cannot be disabled by ordinary marketing/transactional preferences.

Push devices support multiple IOS/ANDROID/WEB registrations per user. Raw tokens are never returned or stored as plaintext: they are SHA-256 indexed and AES-256-GCM encrypted using `PUSH_TOKEN_ENCRYPTION_KEY`. Revoke and provider-invalid-token flows deactivate a device. No APNs/FCM credentials or fake push success are included.

Tenant conversations require active participant membership for every detail/message/read operation. Messages have tenant idempotency keys and per-participant delivered/read receipts. The communication outbox accepts domain events such as appointment created/confirmed/changed/cancelled, match, job, result, payment and security events. Event idempotency is DB-enforced; processing uses an atomic claim, at most three attempts and bounded retry delay before permanent failure.

Additional endpoints:

- `GET /businesses/:businessId/notifications/unread-count`
- `POST /businesses/:businessId/notifications/:id/read`
- `POST /businesses/:businessId/notifications/mark-all-read`
- `GET|POST /businesses/:businessId/push-devices`
- `DELETE /businesses/:businessId/push-devices/:id`
- `GET|POST /businesses/:businessId/conversations`
- `GET /businesses/:businessId/conversations/:id`
- `GET|POST /businesses/:businessId/conversations/:id/messages`
- `POST /businesses/:businessId/conversations/:id/messages/:messageId/read`

### Search, Discovery & Ranking

`GET /discovery/search` is a public, throttled endpoint backed by the PostgreSQL/Prisma `DatabaseSearchProvider`. Only `ACTIVE` businesses with explicit `isPublic=true` are candidates; responses are built from a public projection and never include membership, customer, notes, auth or internal ranking data. Business owners can opt in/out through the existing tenant-authorized business update endpoint. Verification is platform-managed (`isVerified`) and cannot be mass-assigned by that DTO.

Queries support normalized keyword, category/service, city/district (including active locations), geo radius, price, real review rating, verified-only, availability range, deterministic sort and opaque cursor pagination. Unicode is NFC-normalized and Turkish-aware lowercase is preserved. Limits are capped at 50 and the endpoint uses the existing throttler at 30 requests/minute.

V1 ranking is deterministic: text relevance, category/service match, location, real rating, verified state, proven availability and profile completeness contribute fixed signals. Stable business ID is the final tie-break. Missing review data yields `rating=null`; the DB fallback does not claim a slot and yields `nextAvailabilityAt=null`. Consequently an availability-filtered request excludes candidates whose availability cannot be proven. No booking or slot reservation occurs during search.

`SearchProvider` is provider-independent. V1 uses the real DB fallback and reports `provider=DATABASE`; an unavailable provider raises `SEARCH_PROVIDER_UNAVAILABLE` rather than returning fabricated results. Structured logs contain provider, fallback flag, latency, result count and query length, but not raw query text or user PII.

### Reliability infrastructure

The API validates runtime configuration before boot, enables Nest shutdown hooks for `SIGTERM`/`SIGINT`, and exposes unauthenticated, non-sensitive `GET /health` liveness and `GET /health/ready` database-readiness probes. Every request receives a validated or generated `x-request-id`; structured HTTP logs contain only request ID, method, route, status, and duration. Unknown production errors are sanitized instead of returning stack traces or database details.

Reusable persistence-backed primitives support horizontal replicas without process-local locks: tenant/actor-scoped idempotency reservations, tenant-namespaced TTL cache entries, and background jobs with database-enforced enqueue idempotency. Workers atomically claim due jobs with `FOR UPDATE SKIP LOCKED`, use bounded exponential retry, and move exhausted jobs to `DEAD_LETTER`. Cache failures degrade reads to misses and never replace authorization checks. Vendor-neutral counters track requests, errors, duration, dependency failures, and job outcomes.

Runtime controls are `TRUST_PROXY` (only enable behind a trusted proxy), `EXTERNAL_REQUEST_TIMEOUT_MS`, and `RETRY_MAX_ATTEMPTS`. Production requires an explicit non-empty `CORS_ORIGINS`; existing database and JWT secrets remain fail-fast requirements. Timeout/retry helpers are intended only for bounded network calls and explicitly idempotent operations—not booking, payment, or other unsafe mutations.

### Audit, security monitoring, and observability

Application logs, immutable audit records, and security events are separate concerns. Request context propagates a validated `x-request-id`, safe tenant/actor identifiers, and route metadata. Central telemetry sanitization recursively redacts credentials, authorization/cookie values, communication content, and direct contact fields before audit or security persistence. Unknown failures return the stable `{ code, message, requestId }` contract without stack traces or database details.

`AuditService` persists tenant-scoped actor/action/resource/result records for transactional use by critical write workflows. `SecurityMonitoringService` records authentication failures, authorization denials, rate-limit violations, tenant-boundary attempts, rejected idempotency replays, and suspicious operations without allowing monitoring-store outages to replace the original API response. Fixed-window abuse buckets support hashed IP, actor, tenant, and endpoint scopes across replicas. Metrics remain vendor-neutral and use aggregate counters rather than request/user IDs as labels.

Background jobs retain tenant, actor, and correlation context, emit structured success/retry/dead-letter events, and increment bounded retry/outcome metrics. Runtime rate limits are configured with `RATE_LIMIT_DEFAULT` and `RATE_LIMIT_WINDOW_MS`; the discovery-specific 30 requests/minute override remains unchanged.

### Unified search, geo, discovery, and matching

The discovery domain provides `GET /discovery/search`, `/discovery/businesses`, `/discovery/services`, `/discovery/professionals`, and structured `POST /discovery/match`. Text, voice, and photo-derived structured intents use the same transport-independent pipeline; this stage does not perform speech, image, LLM, or AI inference. Public candidates are limited to active, explicitly public businesses and active/bookable services, locations, and professionals.

Filters combine business/location/professional/service/category text or IDs, city/district, Haversine radius, real review rating, verification, price, duration, and authoritative time-window availability. Coordinates and radius are bounded, provider retrieval is capped at 100 candidates, API pages at 50, and ordering uses score followed by stable business ID. Geo distance uses the nearest known public business/location coordinate. Unknown coordinates, ratings, availability, or result probability remain `null`; no value is guessed.

Ranking is deterministic and explainable. Independent signals cover normalized textual relevance, category/service/professional match, distance, real completed-appointment expertise, verified/review quality, proven availability, profile completeness, and price compatibility. Availability requests require an exact service ID and reuse `AvailabilityService`; checks run in bounded batches and unavailable businesses/professionals are removed. Empty results return `meta.noMatch=true` rather than fabricated matches.

`ResultProbabilityProvider`, `ExpertiseProvider`, `MatchContext`, and `DiscoveryIntent` form the service boundary for the future agent layer: callers submit validated intent and never receive direct database access. Discovery telemetry records aggregate request/latency/zero-result/filter/geo/availability counters without raw query text, customer PII, request IDs, or actor IDs as metric labels.

### Conversational AI and agent engine

Authenticated, tenant-scoped agent sessions are available under `/businesses/:businessId/ai/sessions`. The orchestrator normalizes TEXT, VOICE, and PHOTO-derived text into one structured pipeline, minimizes context to the active goal and four recent turns, creates deterministic plans, and can invoke only versioned tools registered in `ToolRegistry`. Models never receive database access. The built-in deterministic provider makes intent/planning tests independent of external API credentials; voice transcription, vision extraction, Beauty Passport/DNA, business insights, and professional intelligence explicitly report `NOT_AVAILABLE` until real providers exist.

Read tools reuse discovery, availability, business, and appointment services. Booking create/modify/cancel tools are write operations and always create a ten-minute, single-use pending action. Confirmation is atomically claimed before domain authorization and validation are repeated; replay, expiry, rejection, actor mismatch, and tenant mismatch cannot execute the tool. Booking services retain their existing ownership, scheduling, transaction, and overlap protections.

Agent responses expose only the stable session/status/message/intent/goal/question/options/pending-action/result/meta contract. Raw provider payloads, prompts, hidden reasoning, binary media, credentials, and internal appointment relations are not returned or persisted. Unknown intent returns `NEEDS_INFORMATION`; empty discovery returns `NO_MATCH`; missing capabilities return `NOT_AVAILABLE` rather than fabricated data. Planner/tool/write/context/time limits prevent loops and uncontrolled execution. Audit events and aggregate metrics cover session, intent, plan, tool, confirmation, completion, failure, no-match, duration, and limit outcomes without high-cardinality metric labels.

### AI safety, trust, evaluation, and observability

Every agent message creates a tenant-scoped `AIRun` with versioned trace events, bounded retention, aggregate usage/cost fields, latency, outcome, and a deterministic rule-based evaluation. Trace payloads pass through AI-specific recursive redaction; public agent responses remain unchanged and never expose traces, policy decisions, hidden context, or safety evidence. Internal observability queries require a caller-supplied tenant boundary and return only a bounded operational projection.

`AISafetyEngine` treats user and tool content as untrusted data. It detects prompt/tool injection, secret exposure, PII, and cross-tenant arguments before execution and sanitizes tool output afterward. HIGH or CRITICAL findings block execution. Registered-tool allowlists, agent-profile permissions, domain authorization, and booking confirmation remain mandatory; content cannot grant itself a tool permission.

Database-backed kill switches cover GLOBAL, TENANT, AGENT_TYPE, and TOOL scopes. AI-specific tenant/user/session/agent-type rate buckets, tool/planning/retry/token/cost/time budgets, structured failure categories, audit events, and vendor-neutral counters provide bounded degradation without inventing provider results. `AI_TRACE_RETENTION_DAYS`, `AI_MAX_ESTIMATED_COST_MICROS`, and `AI_RATE_LIMIT_PER_MINUTE` configure retention and resource guards.

### Predictive beauty intelligence

Tenant-scoped prediction APIs are available under `/businesses/:businessId/customers/:customerId/predictions`. The deterministic V1 strategy derives recurrence, affinity, weekday/time, cancellation, inactivity, frequency, and historical price-band features from at most two years/200 appointment references; it does not copy customer notes, contact details, protected attributes, or raw conversation content. Fewer than two completed appointments produces explicit `INSUFFICIENT_EVIDENCE` rather than a guessed prediction.

Predictions contain a normalized confidence and LOW/MEDIUM/HIGH band, probabilistic public explanation, validity window, expiry, strategy version, derived signals, evidence, feedback, and measurable outcomes. Refresh supersedes the prior active prediction transactionally, while a partial unique database index permits only one active prediction per tenant/subject/type. Reads expire stale records, pagination is capped at 50, and recomputation is limited to five times per customer/type/hour.

The Customer Beauty Agent accesses predictions only through registered read tools and the existing policy, authorization, safety, rate-limit, and trace chain. Feedback and outcome events form an evaluation dataset; tenant-only aggregate insights report coverage, acceptance, conversion, and stale rates. Medical/health/psychological or protected-attribute inference is unsupported and rejected. Beauty Passport, result history, search/favorite interactions, and other unavailable sources are not fabricated and can be added later through typed signal adapters.

### Personal beauty intelligence / Beauty DNA 2.0

Beauty DNA is a tenant-scoped, versioned beauty-service intelligence profile; it is not biometric identity, face recognition, medical profiling, or a hidden demographic classifier. Normalized traits keep `DECLARED`, verified `OBSERVED`, deterministic `DERIVED`, and probabilistic `INFERRED` sources separate. Evidence is restricted to booking, Beauty Job/result/passport, explicit feedback, verified profile input, and reviewed prediction references; messages, private notes, contact data, media, and protected attributes are excluded.

Confidence combines bounded evidence quantity, source reliability, recency decay, agreement, and conflict penalties. Newer reliable evidence may become active without deleting history; every material change creates an immutable version record. One old observation cannot produce high confidence, stale traits are omitted from active projections, and insufficient history returns `INSUFFICIENT_EVIDENCE`. Idempotency keys, tenant-aware unique constraints, transactions, and advisory locks prevent duplicate evidence and concurrent version races.

Authenticated APIs under `/businesses/:businessId/customers/:customerId/beauty-dna` expose only safe profile, trait, and bounded history projections. Customers may manage only their own declared traits; derived/inferred data remains source-labelled. Explicit recalculation incrementally derives supported booking preferences, while reviewed predictions enter only as low-authority `INFERRED` evidence and never silently become facts. `beauty_dna.context` gives the Customer Beauty Agent at most twelve supported traits without evidence, history, internal identifiers, or private data; `BeautyMatchContext` is the protected-attribute-free Discovery integration boundary.

### Professional intelligence and career engine

Professional Intelligence is a tenant-scoped, versioned evidence system rather than a CV or opaque universal score. Skills use an extensible category/code taxonomy and keep `DECLARED`, `OBSERVED`, `DERIVED`, `INFERRED`, and `VERIFIED` provenance separate. Declarations begin with low confidence; completed jobs, verified results, repeat customers, credentials, and approved adapters add idempotent evidence. No evidence returns `INSUFFICIENT_EVIDENCE`, and specialization requires at least five completed jobs plus a verified result.

Career events and intelligence versions are append-oriented. Declared experience and credentials remain `UNVERIFIED` until a business manager completes a separate verification workflow. Context-specific performance signals and evidence-backed milestones are retained without producing a single human-value score. Advisory transaction locks and tenant-scoped idempotency constraints protect concurrent event processing.

Authenticated APIs under `/businesses/:businessId/professionals/:professionalId/intelligence` expose profile, skills, bounded evidence, experience, credentials, timeline, performance signals, specializations, and history. Public/non-manager reads receive only supported skills and verified career records; evidence and internal history require self or tenant membership. `professional_intelligence.context` gives the Professional Copilot and matching adapters a minimal read model without direct database access, raw customer data, or invented compatibility scores.

### Business intelligence and autonomous growth

Business Intelligence stores tenant-scoped metric definitions, idempotent observations, time-window snapshots, deterministic insights, opportunities, risks, recommendations, privacy-safe benchmarks, controlled experiments, and immutable calculation versions. Missing observations remain `INSUFFICIENT_DATA` rather than zero. Revenue, booking, completion, cancellation, no-show, repeat-customer, ticket, capacity, demand, and professional operational signals remain separate; no opaque global business or employee score is produced.

Rules compare current and previous periods with sample-size, completeness, recency, reliability, and consistency confidence. Recommendations retain evidence, uncertain impact ranges, and a correlation-not-causation constraint; they never execute automatically. Actions are classified as `READ_ONLY`, `LOW_RISK_WRITE`, `REQUIRES_CONFIRMATION`, or `PROHIBITED_AUTONOMOUS`, reusing the existing agent allowlist/policy/confirmation boundary. Experiments have validated transitions and immutable results with explicit positive, negative, inconclusive, or insufficient-data outcomes.

Authenticated APIs under `/businesses/:businessId/intelligence` expose overview, metrics, insights, opportunities, risks, recommendations, experiments, privacy-thresholded benchmarks, and versions to tenant managers. Business Growth Agent read tools call these service projections rather than querying the database or calculating metrics. Search-derived demand must be ingested as a distinct source from completed bookings; benchmark APIs never expose raw cross-tenant rows and return `INSUFFICIENT_BENCHMARK_DATA` below the cohort threshold.

### Marketplace liquidity and network engine

Marketplace liquidity is measured from tenant-scoped, immutable demand, supply, and usable-capacity observations. It distinguishes missing, insufficient, observed-zero, stale, and no-match states; observed demand remains separate from freshness-bounded predicted demand. Deterministic snapshots expose demand coverage, supply/capacity coverage, match success, booking conversion, and unfulfilled demand rather than an opaque marketplace score. Supply gaps and opportunities retain evidence, confidence, limitations, observation time, and calculation version and never promise revenue or customers.

Demand routing orders eligible providers lexicographically by suitability, result probability, confidence, usable capacity, and trust. Commercial value, subscription tier, and ad spend are not routing inputs. Sponsored placements are returned in a separate, explicitly labelled projection and never alter organic rank. Cold-start providers remain eligible when they have real suitability, capacity, and trust evidence, but are clearly marked with bounded confidence rather than fabricated history.

Authenticated tenant-manager APIs under `/businesses/:businessId/marketplace` expose liquidity, demand, supply, capacity, gaps, opportunities, and immutable recalculation. Signal ingestion is an internal typed boundary protected by membership authorization, taxonomy/range validation, source-tenant checks, unique idempotency keys, and PostgreSQL advisory locks. Business Growth Agent marketplace tools are read-only and flow through the existing agent allowlist, authorization, safety, and policy chain; ranking manipulation and hidden sponsorship are prohibited autonomous interventions.

### Open API and external AI ecosystem

The versioned public surface is isolated under `/api/public/v1`; internal controllers, Prisma models, intelligence endpoints, marketplace internals, ranking features, fraud/security metadata, and private notes are not part of its machine-readable contract. `GET /api/public/v1/openapi.json` publishes only the curated v1 operations, API-key security scheme, required scopes, stable metadata, and error contract. Breaking changes require a new API version; responses include deprecation, replacement, and sunset metadata fields rather than silently changing v1.

Integrations are tenant-owned applications with clients, explicit grants, and rotatable credentials. API keys contain a public key ID and high-entropy secret; only a hash and non-secret fingerprint are stored, the raw key is returned once, and revoked/expired/application-disabled credentials fail closed. Tenant identity is derived from the credential's application, never from request input. Read and write scopes are separate. Public booking writes require `Idempotency-Key`, then reuse the existing appointment availability, ownership, advisory-lock, and conflict checks; client-supplied prices are not accepted.

Webhook endpoints require HTTPS and DNS resolution to public addresses; localhost, credentials-in-URL, loopback, link-local, RFC1918, and IPv6 local targets are rejected. Signing secrets are AES-256-GCM encrypted at rest using `WEBHOOK_ENCRYPTION_KEY`, returned once, and deliveries use versioned envelopes and HMAC-SHA256 signatures. Delivery attempts are immutable and use bounded exponential retries. A separately deployed worker/egress proxy is still required to perform production HTTP delivery safely; this repository provides persistence, signing, validation, scheduling, and audit history, not a fake external delivery service.

Public quotas are persisted by application client, tenant, operation, and minute window behind a `PublicRateLimiter` abstraction with PostgreSQL advisory locking. A distributed Redis/API-gateway limiter can replace the implementation without changing controllers; no in-memory limiter is presented as production infrastructure. Usage telemetry stores application/client, tenant, operation, status, latency, timestamp, and correlation ID, never raw keys, signing secrets, or request payloads.

External AI tools are machine-readable, least-privilege public contracts. External AI is not an internal agent or superuser: every call remains API-key authenticated, tenant-bound, scope checked, validated, and audited. Booking creation/cancellation tools are WRITE operations and remain fail-closed until an external confirmation workflow is deployed; a caller-supplied token is never treated as confirmation. Paid integrations do not influence discovery ordering; public discovery removes internal ranking signals and exposes sponsored state separately. Redis, an external API gateway, developer portal UI, and production webhook worker are deployment integrations and are intentionally not claimed as present.

### Multi-category expansion engine

The platform category registry is versioned and models a category → subcategory → service-type hierarchy. Capabilities use a closed taxonomy rather than category-name branches. Tenant configuration is server-authorized and tenant scoped; a service may opt into the new category profile additively, while legacy beauty services with no profile retain their existing booking and availability behavior.

Typed attribute definitions support string, finite number, boolean, enum, multi-enum, date, and duration values with required/range/option validation. Values are stored in normalized typed columns instead of accepting an arbitrary JSON schema. Category-aware booking reuses the existing availability, staff assignment, transaction, and advisory-lock path, then enforces tenant enablement, booking capability, explicit professional eligibility, and usable resource capacity when configured.

Generic resource types, resources, requirements, professional category/service-type assignments, and versioned result-schema definitions are category agnostic. Beauty intelligence remains a specialized layer and is not diluted into generic attributes. Discovery accepts additive subcategory, service-type, capability, and verified professional-skill filters without changing ranking. `GET /api/public/v1/categories` is an additive, scope-protected machine-readable contract; existing v1 responses and routes remain unchanged. AI consumers receive only the deterministic category context projection (category, service type, capabilities, and required attributes), never direct database access or assumed capabilities.

### Globalization engine

Globalization is resolved server-side from an immutable, effective-dated market configuration. A market defines ISO country/currency metadata, BCP 47 locales, IANA timezones, measurement system, address/phone/format policies, booking windows, payment capabilities, and backend-enforced feature flags. Tenant preferences must be a subset of the active market policy; user preferences may override the tenant only when the market explicitly supports them. The fallback chain is user → tenant → market, and unsupported values fail deterministically rather than being guessed.

Canonical domain values stay separate from presentation: money uses integer minor units, FX snapshots are versioned and effective-dated, timestamps remain UTC, phone storage uses E.164, and localized date/number/currency strings are produced only by the formatting boundary. DST gaps are rejected and repeated local times require explicit earlier/later disambiguation. Historical appointments retain their original currency and can reference the market-configuration version and explicit booking/customer timezone used at creation.

`/businesses/:businessId/globalization` is membership-authorized and audited. `/api/public/v1/globalization/context` is additive, API-key tenant-bound, scope protected, and validates requested locale/currency/timezone against the credential's tenant market. Discovery accepts additive market presentation context and country filtering without changing organic ranking. Category availability is a market configuration relation, allowing the global category identity from Stage 28 to be enabled or localized per market without category-name branching. External AI receives a read-only globalization context contract and must not infer timezone or currency.

Market policy reads use a short-lived version-keyed cache. Configurations are immutable rows; publishing a new version avoids mutating historical policy. This repository defines deterministic tax, FX, booking, formatting, measurement, address, phone, feature, and payment boundaries. It does not claim a live FX feed, jurisdiction-complete tax engine, global phone metadata provider, or payment-provider integrations; those providers implement the documented boundaries in deployment.

### Monetization 2.0 and financial intelligence

Monetization is tenant- and market-scoped and configuration-driven. Plans have immutable effective-dated versions, entitlements and price versions; business logic checks entitlement keys rather than plan names. Pricing supports fixed, recurring, usage, tiered, per-seat/location/professional, transaction, commission and hybrid models using integer minor units. Existing Globalization currency validation, FX snapshots and tax boundary remain the only currency/FX/tax source of truth.

Subscriptions retain transition history and optimistic version state. Usage, ledger, refund, promotion redemption, settlement, payout and verified payment-webhook records have database idempotency keys; critical paths additionally take PostgreSQL advisory transaction locks. The ledger is append-only: refunds and corrections create linked reversal entries rather than mutating charges. Credits derive balance from immutable grants and consumption history. Provider references are stored, but raw card data and provider secrets are never accepted by the domain.

Internal tenant APIs under `/businesses/:businessId/financial` expose plans, subscription state/transitions, usage ingestion, refunds, summaries, settlements, credits and evidence-driven forecasts. Reads require `financial:read`; financial mutations require `financial:manage`. Payment providers implement an interface for payments, refunds, customers, subscriptions, retrieval and signature-verified webhooks; no provider SDK or fake production gateway is embedded.

Financial intelligence distinguishes `INSUFFICIENT_DATA` from observed zero, does not combine currencies without an explicit FX snapshot, and never invents CAC/LTV. Deterministic unit economics, AI cost, forecasts, commission, settlement and pricing-recommendation boundaries preserve evidence and return no recommendation when evidence is absent. Pricing recommendations are advisory only and never mutate service prices.

## Stage 31: Growth, viral, and referral engine

The `growth` API module provides a tenant- and market-scoped acquisition-to-reactivation foundation. Referral programs are immutable-versioned: each referral records its program version and a qualification/reward rule snapshot, so later configuration changes cannot reinterpret historical conversions. Referral codes are globally collision-resistant, normalized, expirable, revocable, usage-limited, owner-bound, and resolve only to validated platform-relative `/r/{code}` paths.

Referral processing follows the audited state machine `CREATED → CLICKED/SIGNED_UP → QUALIFIED → CONVERTED → REWARDED`, with terminal expiry, rejection, cancellation, reversal, and fraud-review paths. Invalid transitions fail deterministically. Financial rewards are written exactly once under a database advisory lock and create both the Stage 30 `FinancialCreditGrant` and immutable `FinancialLedgerEntry`; balances are never directly mutated.

Attribution stores first/last-touch-compatible canonical touches with optional UTM metadata and supports tenant-scoped anonymous-to-subject identity attachment. Challenges deduplicate source event IDs. Experiments hash tenant, experiment, and subject identifiers for stable weighted assignment and persist an assignment snapshot, so later weight changes do not move enrolled subjects. Streak calendar boundaries use the Stage 29 IANA timezone validator and Luxon calendar arithmetic, including DST-short or DST-long days.

Privacy-safe abuse assessment blocks self-referrals, existing-user masquerading, cyclic relationships, exhausted codes, and replayed events, while high-velocity conversion patterns enter review. Public code resolution uses a hashed database rate-limit bucket and deliberately returns the same unavailable response for malformed, missing, expired, exhausted, or revoked codes. Administrative endpoints remain behind JWT authentication and service-level `growth:read` / `growth:manage` tenant membership checks.

### Growth API

- `GET /growth/referrals/resolve/:code` — minimal public, enumeration-resistant code resolution.
- `GET|POST /businesses/:businessId/growth/programs` — list/create versioned referral programs.
- `POST /businesses/:businessId/growth/codes` — issue owner-bound referral codes.
- `POST /businesses/:businessId/growth/referrals` — create an idempotent referral.
- `POST /businesses/:businessId/growth/referrals/:referralId/transition` — apply an audited lifecycle transition.
- `POST /businesses/:businessId/growth/referrals/:referralId/rewards` — grant an exactly-once ledger-backed reward.
- `POST /businesses/:businessId/growth/rewards/:rewardId/reverse` — append an immutable ledger reversal after cancellation/refund.
- `POST /businesses/:businessId/growth/attribution` — record a canonical acquisition touch.
- `POST /businesses/:businessId/growth/challenges/:challengeId/progress` — apply idempotent progress.
- `POST /businesses/:businessId/growth/experiments/:experimentId/assignment` — obtain a sticky weighted assignment.

Canonical growth events contain event, tenant, market, subject, actor, timestamp, correlation and causation identifiers plus minimized non-PII payloads. Snapshot metrics expose funnel conversion ratios, referrals per active user, and viral coefficient; absent denominators produce `null`/`INSUFFICIENT_DATA` rather than invented results. Notification delivery remains outside this domain: growth emits eligibility and event records for the existing communication boundary to consume.

## Stage 32: Platform governance and legal-scale controls

The governance module is the policy, review, dispute, consent, and retention control plane; it does not replace authentication, tenant isolation, the financial ledger, security monitoring, or country-specific legal advice. Policies use immutable versions with `DRAFT → REVIEW → APPROVED → ACTIVE → SUPERSEDED/RETIRED` lifecycle state. Resolution deterministically layers global, market, then tenant rules by stable rule key, while explicit fail modes define unmatched behavior. Security, privacy, and financial evaluations may request a fail-closed result.

Each evaluation stores its exact policy version, scalar input snapshot, decision, rule/reason code, actor, market, tenant, correlation identifier and deterministic fingerprint. AI evaluations additionally require tenant-bound model/provider provenance, model and prompt versions, tool metadata, confidence/risk information, and prohibit bypass flags. Low-confidence AI results require human review. Authorized human overrides are append-only records containing previous/new decisions and reasons; they never mutate the original evaluation.

Disputes follow the centrally validated lifecycle `OPEN → EVIDENCE_COLLECTION → AI_TRIAGE/HUMAN_REVIEW → DECISION → APPEAL/RESOLUTION → CLOSED`. Evidence rows contain metadata and protected object references only—not uploaded file contents. All transitions are tenant scoped, idempotent and retained as timeline records. Enforcement models provide reviewable restriction/suspension/hold extension points and can reference policy evaluations or immutable financial records without modifying payment or ledger invariants.

Consent grants and withdrawals are separate, versioned records tied to a purpose and notice version. Export, deletion, anonymization and rectification requests use a validated request lifecycle. Retention evaluation respects configured windows, legal/business holds, and protected audit, financial and security classes. Physical deletion is permitted only through a deployment adapter; protected classes are retained or anonymized so audit evidence is not silently destroyed.

Internal routes under `/businesses/:businessId/governance` require the existing membership and `governance:*`/`privacy:manage` permissions. Service methods repeat tenant ownership checks and never derive tenant identity from request bodies. Governance actions also append the existing platform audit log and canonical governance events with minimized metadata and correlation IDs.

This is technical governance infrastructure, **not legal advice and not a guarantee of legal compliance**. Before production launch, qualified counsel must review each market's applicable privacy, KVKK/GDPR, consumer, employment, marketplace, AI, payment and record-retention obligations, and operators must configure reviewed policy versions accordingly. No country law or statutory deadline is hard-coded by this module.
