# Hesap silme işletim ve alan kararı kaydı — 11 Kasım 2026

## Yetkilendirilmiş sorumluluk

Kullanıcı “Ben takip edeceğim” yanıtıyla günlük kuyruk takip sorumluluğunu
Umut Barut'a verdi. İşletmeci adı, canlı SUPER_ADMIN rolü veya bağımsız
incelemeci ataması yerine geçmez. Rol/hesap değiştirilmedi. Bu kayıt bir
kamuya açıklanmış tamamlanma süresi veya otomatik silme politikası oluşturmaz.
Kullanıcı bu devamda ilk inceleme hedefini **3 iş günü** olarak seçti. Günlük
kontrol sürer; bu hedef bütün verilerin üç iş gününde silindiği anlamına gelmez.

Güncel aday PR109 taslak durumundadır. ACCOUNT_DELETION_PROCESSING_ENABLED ve
ACCOUNT_DELETION_ERASURE_ENABLED varsayılan olarak false kalır. Canlı admin
teslim kaynağı 61f97f0ed996844917be036a77e36d9aad999a94 olup bu kuyruğu içermez.
Aşağıdaki günlük prosedür, kuyruk ayrıca incelenip yayımlandıktan sonra uygulanır.

## Günlük kontrol prosedürü

1. Yetkisi doğrulanmış platform hesabıyla kuyruğu aç; bekleyen sayfalara sırayla
   bak. Sonraki sayfa varsa ilk listeyle kontrolü bitirme.
2. Talep tarihi ve mevcut durumu kontrol et; bu kimlikleri ve kullanıcı
   e-postalarını ayrı bir açık belgeye kopyalama. Kontrol kaydında yalnız
   kontrol zamanı, sorumlu, toplam bekleyen/engelli talep sayısı ve sonraki
   inceleme adımı yer alsın. Bu sayım için yeni otomatik görev kurulmadı.
3. Her seçilen talepte mevcut incelemeyi yenile. Bekleyen fotoğraf sayısı ve
   engel sınıflarını ayır. Fotoğraf silme/oturum kapatma, hesabın tamamen
   silindiği anlamına gelmez.
4. Sahiplik, işletme geçmişi veya yedekten dönüş engeli varsa ilgili kararı
   incelemeye taşı; doğrudan SQL, zorla silme veya sınıfı istisnaya ekleme
   yoluyla engeli aşma. Son kullanılabilir işletme sahibinin devamlılığı korunsun.
5. İşleme alma ve kalıcı silme ancak yayımlanmış, etkin ve incelenmiş süreçte
   ayrı onaylarıyla yürütülür. Depolama hatası, mevcut fotoğraf veya çözülememiş
   kayıt engeli varken tamamlandı kaydı verme.
6. Süreç etkinleştikten sonra da tamamlanmayı ancak yetkili API'nin gerçek
   tamamlanma sonucuyla bildir. Kullanıcının takip kodu yalnız durum/makbuz
   içindir; parola, yönetici oturumu veya e-posta/push bildirimi değildir.
7. Oturum süresi dolarsa yeniden giriş yap. Başka hesabın veya işletmenin
   talep ayrıntılarını önceki oturumdan kullanma.

Kontrolün her gün yapılacağı ve ilk inceleme hedefinin **3 iş günü** olacağı
kararlaştırıldı. Kontrol saati, iş günü/tatil takviminin teknik uygulaması,
kamuya açıklanacak nihai işlem metni ve bağımsız incelemeci henüz belirlenmedi.
Başvuru sonuçlandırma süresi ve imha kayıtlarının kapsamı
[ayrı inceleme notunda](deletion-timeframes-review-20261111.md) açıklanır. Bu prosedürün gerçek
kuyrukta işletildiği veya herhangi bir hesabın silindiği iddia edilmez.

## Alan bazında inceleme girdisi

Kaynak: aday 6664e6fd4d2e793a13c011be212ae3d3fce95fa5 içindeki Prisma şeması
ve AccountErasureService. Aşağıdaki tablo bir politika önerisi veya onaylanmış
saklama takvimi değildir; karar verilecek somut alanları gösterir.
Hiçbir işletme kaydı bu belgeyle silinmez veya süresiz saklanır sayılmaz.

| Kayıt | Kimlik/kişisel içerik için incelenecek alanlar | Bağlı iş geçmişi ve teknik karar |
| --- | --- | --- |
| BusinessCustomer | userCustomerId, firstName, lastName, phone, email, birthDate, gender, notes; marketingConsent, smsConsent, emailConsent | İşletme müşteri kartı, notlar, etiketler ve bağlı randevular birlikte incelenmeli; pazarlama izni bir saklama süresi değildir. |
| Appointment | customerId, businessCustomerId, staffMemberId, staffId, cancelledById, customerNote, internalNote, cancellationReason | startsAt/endsAt, serviceId, price/currency, durum geçmişi ve bağlı sonuç korunma/temizleme kararına bağlanmalı. customerId zorunlu ve Restrict ilişkisidir; yalnız null atama yeterli değildir. |
| BeautyJobResult | summary, recordedById | appointmentId bağlantısı ve yayınlanmış passport sonucu birlikte incelenmeli; recordedById zorunludur. |
| BusinessMember / Staff | userId; Staff firstName, lastName, displayName, phone, email, bio, avatarUrl | Sahiplik devri, gelecek randevular ve personel atamaları çözülmeden toplu silinmez. |
| InventoryOperation | actorId, response JSON | Stok miktarları, hareket bağlantısı, keyHash/requestHash ve tekrar güvenliği korunmalı; actorId zorunlu düz String olup otomatik FK temizliği yoktur. |
| B2BQuoteRequest | requestedBy, respondedBy, buyerNote, supplierNote | İki işletmenin teklif geçmişi, miktar/fiyat/durum ve revision birlikte incelenmeli; requestedBy zorunlu düz String'dir. |
| FinancialLedgerEntry | actorId, reason; sourceType/sourceId ve correlationId içindeki kimlik bağlantıları | amountMinor, currency, reversalOfId ve bağlı iadeler/işlemler dengesi bozulmadan alan ve süre kararı gerekir. |
| AuditLog | actorId, resourceId, requestId, correlationId, metadata | İşletme bağlamlı audit, basit tenant'sız auth sayacı istisnasına girmez. |
| Message / MessageReceipt | senderUserId, body; userId ve konuşma katılımcısı | Başka tarafın mesaj geçmişi ve okundu/iletildi kayıtları beraber ele alınmalı; Message.senderUserId Restrict ilişkisidir. |
| Governance ve diğer engeller | createdBy/actorId, reason/grounds, parties, evidenceMetadata, metadata/payload ve resource bağlantıları | Her bulunan model ayrı incelenir. Bu tablo bütün şemanın tam envanteri değildir; çalışma anındaki muhafazakâr engel taraması sürer. |

Her engel için gerekli karar kaydı: model/alan, işlem (silme,
anonimleştirme veya sınırlı saklama), amaç ve kapsam, süre/başlangıç olayı,
bağımlı kayıtlar, sorumlu incelemeci ve kabul kanıtı. Kesinleşmemiş süreler
uydurulmaz. Fotoğraf/danışmanlık için mevcut 24 saat, işlem/izin kanıtı için
90 gün ve yedek için 30 gün kararları ayrı kapsamlardır; işletme kayıtlarına
otomatik uygulanmaz.

## Tekrar çalıştırılmadan doğrulanan sonuçlar

GitHub commit workflow okuması ve her işin adım sonucu aday
6664e6fd4d2e793a13c011be212ae3d3fce95fa5 ile eşleştirildi.

| Kontrol grubu | Run | Sonuç ve sınır |
| --- | --- | --- |
| Regresyon, migration ve gerçek HTTP/PostgreSQL | 43065206167 | success; workspace ve Stage33 servis kontrolleri tamamlandı |
| Admin Chromium/WebKit | 43065206230 | success; rol reddi, sentetik kuyruk inceleme, onaysız başlatmanın devre dışı oluşu ve 401 temizliği |
| Uygulama/tarayıcı | 43065206174 | success; stok/ürün, randevu malzemeleri, B2B, danışmanlık ve eşleşme akışları |
| İki restore sınırı | 43065206173 | iki iş de success; sentetik PostgreSQL, gerçek üretim yedeği değildir |
| Worker crash/restart | 43065206140 | success; izole temizlik/tekrar deneme |
| Android ve iOS derleme | 43065206162 | iki iş de success; imzasız derleme, fiziksel cihaz kabulü değildir |
| Native iOS fotoğraf IO | 43065206405 | success; sentetik simülatör/loopback multipart, gerçek fotoğraf kalitesi değildir |

Bu belge eklenirken çalışma kodu, şema, SQL, bağımlılıklar ve workflow
değiştirilmez. Doküman değişikliği önceki çalıştırmaların yeni bir uygulama
sürümünde tekrar yapıldığı şeklinde raporlanmaz. İşletme geçmişi kararları,
yayınlanmış süre, gerçek erişim/işletim kabulü, bağımsız inceleme, gerçek
üretim restore ve fiziksel cihaz/fotoğraf kalitesi açık kalır.
Aşama 33 NOT PASS.
