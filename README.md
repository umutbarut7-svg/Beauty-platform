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
