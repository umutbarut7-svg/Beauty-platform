# Kullanıcı tarafından sağlanan görev metni

Aşağıdaki metin 19 Ekim 2026 tarihinde kullanıcı tarafından sağlandı. Kaynak gereksinimleridir; teknik çözüm kararları değildir. Ekli dosyanın içeriği korunmuştur.

```text
AŞAMA 33 — PRE-LAUNCH / MVP BUILD SPECIFICATION

Kullanıcı eski planı bulup ekran görüntülerini gönderdi. Önceki kapsam eksikliği giderildi; aşağıdaki metin ekran görüntülerinden okunmuş, kullanıcı tarafından kilitlenmiş AŞAMA 33 kapsamıdır. Bu görevi şimdi başlat. Aynı Beauty-platform projesinden devam et, AŞAMA 34'e geçme.

DOĞRULANMIŞ TEMEL: PR #10 ve #9 birleştirildi. Main SHA: 20550365a19d090221108f3a7fbffe8190647bd3. Git tree: 66cfe7c7d392d82041c0463aa868f158c6dffe43. Run #16 / 39295074744 bütün zorunlu Prisma, PostgreSQL entegrasyon, test, build, typecheck, lint ve format kapılarından geçti. Main'in güncel durumunu kontrol et; bu SHA'dan sonra kullanıcı değişikliği varsa koru ve incele. Eski iskelet commitiyle başlama. Önce AGENTS.md ve mevcut mimariyi oku. Ayrı feat/stage33-mvp-build-specification dalında çalış; main'e doğrudan yazma, eski aşamaları yeniden oluşturma.

KAYNAKTAKİ KİLİTLİ KAPSAM — TAM AKTARIM:
Başlık: AŞAMA 33 — PRE-LAUNCH / MVP BUILD SPECIFICATION.
Açıklama: Burada artık fikir bitti, üretim dokümanı başladı.
MVP kapsamı, ilk versiyon:
CUSTOMER AKIŞI (sırasıyla): Register → AI Intent → Current Photo → Target → Smart Questions → AI Analysis → Result Plan → AI Match → Professional → Booking → Beauty Job → Result → Satisfaction → Beauty Passport.
BUSINESS AKIŞI (sırasıyla): Register → Verification → Profile → Professionals → Services → Pricing → Availability → Demand → AI Match → Booking → Beauty Job → Result → Revenue.
Kaynakta Backend başlığı altında teknoloji dizisi: React Native / Expo → NestJS → PostgreSQL → Redis → S3 → OpenAI API → pgvector.
Admin: Next.js.
V1: Modular Monolith + Worker architecture. Microservice yok.
Kodlama prensibi: Security + Tests + Observability + Audit + Validation + Feature Flags + Versioning.
Definition of Done: Bir özellik sadece 'Kodlandı' diye tamamlanmış sayılmaz. Unit test, integration test, authorization, error handling, logging, monitoring, audit, privacy, fallback ve documentation tamamlanacak.
AŞAMA 33 KİLİTLENDİ. Bundan sonraki AŞAMA 34 / beta bölümü bu görev kapsamına dahil değildir. İlk iki gönderilen görsel rakip raporudur; yukarıdaki kapsam son dört görselden gelir, rakip raporunu yeni ürün gereksinimi olarak ekleme.

UYGULAMA GÖREVİ:
1. Yukarıdaki orijinal kapsamı deponun docs/stage-33/ altında kalıcı bir kaynak/spec belgesine aktar. Kaynaktaki gereksinimler ile senin teknik uygulama seçimlerini açıkça ayır. Sonraki sefer kapsam kaybolmasın. Bu git deposundaki dokümantasyondur.
2. Önce mevcut modüller/endpointler, Prisma modelleri, mobile/admin ekranları ve worker altyapısını envanterle. Customer ve Business akışındaki HER adımı mevcut dosya/API/UI, eksik, yetki/tenant sınırı, veri/state geçişi, test ve kabul koşuluyla eşleştiren izlenebilir MVP build specification üret. Mevcut doğru implementasyonu yeniden yazma. 'Backend hazır' diye tüm ürün akışlarını hazır sayma.
3. Bu dokümanı uygulanabilir üretim sözleşmesine çevir: mevcut adlandırmalara uygun API/DTO sözleşmeleri, kullanıcı/işletme/profesyonel/admin rolleri, state geçişleri ve kabul kriterleri; uygulama ekranları ve loading/empty/error/fallback durumları; servis/worker sorumlulukları; feature flags ve versioning; kurulum/çalıştırma, gözlemlenebilirlik, audit ve privacy gereksinimleri. Kaynakta olmayan komisyon yüzdesi, puan eşiği veya doğrulama politikasını kullanıcı kararıymış gibi uydurma; mevcut kilitli domain kurallarını kullan, zorunlu eksik iş kararını somut belirt.
4. Belirlenen MVP eksiklerini bu kapsamda kod, ekran, entegrasyon ve anlamlı testlerle tamamla. Mevcut React Native/Expo, NestJS modular monolith + worker ve Next.js admin yapısına sadık kal; microservice'e bölme. React Native frontend'i yanlışlıkla backend olarak yeniden mimarileştirme; kaynak listesini mevcut projenin katmanlarına doğru eşleştir. Kullanıcı tarafından istenen müşteri/işletme yolculuklarını mevcut domain servisleriyle uçtan uca bağla. Next.js admin ile işletme paneli sorumluluklarını mevcut mimariyle tutarlı tut.
5. Fotoğraf yükleme ve erişimde tenant/owner yetkisi, özel depolama ve mevcut retention/consent kurallarını koru. S3/OpenAI/Redis/pgvector ihtiyaçlarını mevcut adapter/config üzerinden entegre et; gerçek sağlayıcı anahtarı yoksa dış servis başarılı olmuş gibi davranma. AI sonucu, eşleşme, verification, tahsilat ve Revenue değerlerini uydurma; mevcut gerçek domain verisine bağla. OpenAI API uygulamasında güncel resmi dokümantasyonu kullan, gerçek secret'ı kod/log/commit içine yazma; kullanıcıdan sohbette credential isteme. Test doubles yalnızca açıkça testlerde; ürün çıktısını sahte başarıya dönüştürme. Dış servis erişimi gerektiren doğrulama gerçek engelse kesin BLOCKED olarak raporla; yanlış PASS verme.
6. Redis/worker görevlerinde yetki/tenant bağlamı, idempotency/retry, güvenli hata davranışı ve mevcut audit kurallarını koru. Müşteri fotoğrafı/AI içeriklerini gereksiz loglama. PII içermeyen correlation/request/job kayıtları, health/readiness ve mevcut monitoring düzenine uygun ölçümler kullan. Yeni dış monitoring hesabı veya ücretli servis oluşturma.
7. Definition of Done'u belgeyle sınırlama: gerekli unit, integration ve kritik Customer/Business E2E akışlarını doğrula. Üyelik/rol/tenant dışı erişim reddi, veri izolasyonu ve fotoğraf erişimi, geçersiz state/input, provider unavailable, worker tekrarı, booking–job–result–satisfaction–passport ve işletme revenue gerçeklik koşullarını uygun katmanlarda kapsa. Mevcut AŞAMA 32 testlerini bozma. Yalnızca maket ekran veya mock DB ile 'gerçek MVP tamamlandı' deme. Native Android/iOS veya provider doğrulaması çalıştırılamadıysa ayrı açıkça yaz; web testi native doğrulamanın yerine geçmiş sayılmaz.
8. Repo tarafından sabitlenen pnpm 10.28.1 / desteklenen Node sürümüne ve frozen lockfile'a uy. Gerekli migration'ları yalnızca izole test DB'de doğrula. Prisma engine 403 yerelde tekrarlanırsa doğrulanmış mevcut GitHub CI yolunu kullan; TLS/checksum güvenliğini kapatma. Mevcut başarılı CI kapılarını koru ve Aşama 33 kontrollerini ekle; test silme/skip veya koşulları gevşeterek PASS üretme.
9. Değişiklikleri anlamlı commitlerle ayrı dala kaydet ve push et. main tabanlı, kapsamı ve doğrulaması açık taslak PR oluştur. Production dağıtımı, App Store/Play Store gönderimi, gerçek ödeme veya bildirim gönderimi yapma; AŞAMA 34/35'i başlatma. Kapsamın içindeki rutin geri alınabilir düzeltmeler için tekrar izin istemeden ilerle; gerçek engeli çözebildiğin alternatifleri denedikten sonra somut raporla.

TAKİP VE SONUÇ:
İlk ilerleme mesajında kaynak başlığını, temel SHA'yı ve envanterden çıkan asıl eksikleri belirt. Sonraki ilerlemeyi aynı sohbette kısa ve somut ver. Son raporda kaynak spec ve kabul matrisi dosyaları; uygulanan/önceden mevcut/engelli adımlar; gerçek komut ve test sonuçları; branch/SHA/gerçek PR-CI bağlantıları; UI ve gerçek entegrasyonların doğrulama sınırları yer alsın. Kaynak spec'in belgelenmiş olması ile çalışır MVP akışlarının doğrulanmasını ayrı raporla. Zorunlu kabul koşulu eksik/engelliyse AŞAMA 33 PASS deme. Amaç bu görev içinde belgelendirme ve gerekli implementasyon/testleri tamamlayarak doğrulanmış, incelemeye hazır sonuç üretmek. Başla.
```
