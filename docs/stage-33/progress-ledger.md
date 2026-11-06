# ORZELL ilerleme ve tekrar önleme kaydı

## Güncel devam noktası — 6 Kasım 2026

Bu bölüm aşağıdaki 25 Ekim tarihli notların güncel teslim ve açık iş durumunu
yeniler. Geçmiş test kanıtları korunur; tamamlanan kullanıcı işlemleri tekrar
başlangıç görevi yapılmaz.

| İş                                                         | Güncel kanıt ve durum                                                                                                                                                                                              | Kalan sınır                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Sunucu: hizmet, ürün/stok, B2B, randevuya bağlı toplu sarf | [Yayın 41985890032](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/41985890032) başarılı; uygulama 2e56def282c97a804a2f3d6c9b36a53b42a09df5                                                        | Yeni gerçek iş kaydı veya fiziksel cihaz kabulü yerine geçmez                                                                |
| İç TestFlight                                              | [Yükleme 41986541356](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/41986541356) başarılı; 1151 için Apple VALID / IN_BETA_TESTING ve mevcut iç grup erişimi 5 Kasım 10:32 İstanbul'da kaydedildi | 1151 fiziksel kurulumu teyitli değil; sırf sürüm değişti diye bütün eski testler tekrarlanmaz                                |
| iPhone danışmanlık kaydı                                   | 31 Ekim: aktif liste, kayıtlı analiz/plan ve danışmanlık yeniden açıldığında tamamlanmış eşleştirme sonucu gözlendi                                                                                                | 1111 bağı kullanıcının güncelleme beyanına dayanır; kaynak fotoğraf/öneri kalitesi veya yeni sonuç yazma kabulü değildir     |
| Gerçek şifreli veritabanı yedeği                           | [Aktivasyon 42117150578](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/42117150578): gerçek yedek yükleme/geri okuma, 30 gün saklama ve Türkiye 03:00 günlük/saatlik sağlık zamanlayıcıları aktif | İlk aktivasyon yedeği sonraki takvim çalışmasının kanıtı değildir; bağımsız gerçek restore açık                              |
| Kurtarma anahtarı                                          | Bağımsız alıcı anahtarı üretildi ve sahibine teslim edildi; telefonda saklama kullanıcıca teyitli                                                                                                                  | Yeniden üretilmez, aynı saklama sorusu sorulmaz; özel anahtar sunucuya/CI'a aktarılmaz                                       |
| Hesap silme PR47                                           | [Son aday](https://github.com/umutbarut7-svg/Beauty-platform/pull/47) 6ea4503a7c152ed6a257d2d2c01275fdd0c58a54; kalıcı silme, makbuz ve offline hesap karantinası test edilmiş taslak                              | Birleştirilmedi; işletme geçmişinin alan/süre kuralları, fiilî kuyruk sorumlusu/hedefi ve bağımsız incelemeci girdileri açık |

**Bugünkü gerçek devam sonucu:** [PR107](https://github.com/umutbarut7-svg/Beauty-platform/pull/107)
ana dala alındı; test edilen ağaç ile merge ağacı aynı. [Salt-okuyan denetim
42192830567](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/42192830567)
6 Kasım 12:09 İstanbul'da günlük yedeği doğruladı: başarı saati
**03:00:07 İstanbul**, şifreli paket **667.424 bayt**. Depodaki güncel sürüm/boyut/
SHA256/AES256 bilgileri yükleme makbuzuyla aynı, iki timer enabled/active ve servis
sonuçları başarılı. CloudFormation UPDATE_COMPLETE, 30 günlük kural ve güvenlik
policy'leri doğrulandı; gerçek CloudWatch alarm durumu **OK**. Kişiye bildirim
rotası hâlâ yok. Veritabanı/yedek içeriği/özel anahtar okunmadı; servis veya metrik
yazılmadı. Bu tek günün gerçek gözlemidir; kesintisiz gelecek çalışma garantisi
değildir. Gerçek restore kabulü değildir.

Sıradaki işler: sahibin ayrı anahtarıyla
korumalı bağımsız ortamda gerçek yedeği çözme/ayrı DB'ye restore, tenant ve stok/B2B
bütünlüğü, hesap/fotoğraf karantinası ve ölçülen kurtarma süresi; gerçek kişiye
alarm teslimi için belirlenmiş kanal; eksik ürün/politika/cihaz kabulleri.
Konsol alarmı e-posta/SMS teslimi değildir. 24 saatlik takvim hedefi ölçülmüş RPO
veya sıfır veri kaybı garantisi değildir.

Ortak hizmet/sarf akışı bir kez doğrulanır; katalogdaki her satır için aynı tur
tekrarlanmaz. Önceki ücretli fotoğraf/eşleştirme/indeksleme onayları tek kullanımdır;
yeni çağrı için önceki onay tekrar kullanılmaz. AŞAMA33 **NOT PASS**.

## Tarihsel kayıt — 25 Ekim 2026

25 Ekim 2026 tarihinde konuşma teyitleri, kaynak kod ve GitHub sonuçları karşılaştırıldı.
Çalışmaya devam ederken önce bu kayıt ve ilgili değişikliğin gerçek kaynak farkı okunur.

## Tamamlanan işlevsel kontrolleri koru

| İş                                      | Mevcut kanıt                                                                                                                | Kayıt ve sonraki işlem                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Müşteri alanına giriş                   | 22-24 Ekim konuşmaları; 24 Ekim TestFlight kurulumu sonrası kullanıcının giriş teyidi; 25 Ekim müşteri ana ekranı görüntüsü | Önceki kullanım teyidi korunur. Yeniden giriş turu varsayılan görev değildir.                                          |
| Randevu oluşturma ve durum görüntüleme  | Önceki akış ve kullanıcının 25 Ekim “Test ettik ya onları dün” teyidi                                                       | Önceki işlevsel kabul korunur; her yeni build için otomatik olarak başa dönülmez.                                      |
| Randevu iptali                          | Önceki konuşmada “İptal ettim cancelled oldu” ve işletme tarafında “İptali onayladım oda cancelled oldu” teyitleri          | Müşteri/işletme iptal teyitleri korunur.                                                                               |
| Müşteri-işletme alanı ve işletme seçimi | Önceki konuşmalarda müşteri alanına dönüş ve işletme seçiminin görünmesi teyitleri                                          | Aynı kontrol yeniden istenmez.                                                                                         |
| Gelir özetini yükleme                   | Önceki konuşmada “Buldum yaptım” teyidi                                                                                     | Yükleme işleminin kullanıcı teyidi korunur; bu tutarların muhasebe doğruluğu veya gerçek ödeme kabulü anlamına gelmez. |

Bu satırlar önceki kullanıcı teyitleridir. Her birine kesin native/tarayıcı platformu veya build numarası atayacak kanıt yoksa bu alanlar bilinmiyor olarak kalır; bunun için kullanıcıya aynı işlemler tekrar yaptırılmaz. Bu kayıt bütün 1031 fiziksel cihaz senaryolarının bağımsız PASS sonucu olduğu anlamına gelmez.

## Teknik olarak kapananlar

| İş                                  | Kanıt                                                        | Durum                                                          |
| ----------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| Şube-profesyonel randevu düzeltmesi | PR #41; sonrasında PR #43 ve #45                             | Birleştirildi                                                  |
| Klavye açıkken form erişimi         | PR #43; aday 589fe6a                                         | Birleştirildi                                                  |
| Android yerel form kabulü           | Run 40178178431, uygulama 589fe6a; ekranlar ayrıca incelendi | PASS                                                           |
| Regresyon ve web UI                 | Runs 40178154400, 40178154516                                | PASS                                                           |
| Android/iOS derlemeleri             | Run 40178154459                                              | PASS                                                           |
| İzole worker ve yedek kurtarma      | Runs 40177962465, 40177962492; API kaynağı 06242d0           | PASS, üretim felaket kurtarma kabulü değildir                  |
| Canlı S3 ve OpenAI adaptörleri      | Run 40179062434, sentetik görsel                             | PASS, gerçek saç fotoğrafı öneri kalitesi değildir             |
| TestFlight 1.0.0 (1031)             | Upload 40178879560; Apple/grup teyidi 40179728482            | VALID / IN_BETA_TESTING                                        |
| Mevcut altı arayüzün toplu sunumu   | ORZELL-Arayuzler.pdf, üç sayfa, sentetik web ekranları       | Teslim edildi; nihai tasarım veya mağaza ekran paketi değildir |

## Yalnız yeni değişikliğin kapsamını test et

1031 değişiklikleri şube-profesyonel filtrelemesi ve klavye düzenidir. Bunların otomatik regresyonu ve Android emülatör kabulü geçti. Önceki bütün kullanıcı akışları varsayılan olarak tekrar açılmaz.

Yeni bir manuel test istemeden önce şu dört bilgi kaydedilir:

1. Değişen dosya/davranış veya yeni hata.
2. Önceki kanıtın hangi kısmının artık yetersiz olduğu.
3. Otomatik testin neden yeterli olmadığı.
4. Kullanıcıdan gereken en küçük, tek kontrol.

Kesin build bilgisi eksikliği yeni build için kabul sınırını belirtir; önceki kullanıcı teyitlerini silmez. Yeniden test ancak somut değişiklik, hata veya açık bir yayın kabul koşulu gerektiriyorsa istenir. Mevcut kanıtla kapanan kontroller gerekçesiz tekrarlanmaz.

## Gerçek açıklar ve sıra

1. Hesap silme: uygulama içinden başlatılan, sunucu tarafında tamamlanan ve veri/oturum kapsamı doğrulanan akış. Mevcut operatör yetkili tenant gizlilik talebi global hesap silme değildir.
2. Otomatik şifreli üretim yedeklemesi ve üretim kurtarma kabulü. Mevcut worker/izole kurtarma sonuçları korunur; üretim yedeğiyle karıştırılmaz.
3. Gerçek fotoğraf öneri kalitesi, sağlayıcı/gizlilik incelemesi ve işletme doğrulama süreci. İlgisiz kullanıcı fotoğrafı kullanılmaz; mevcut anahtar kullanım seçimi yeniden sorulmaz.
4. Yayın bilgileri: gözden geçirilmiş destek/gizlilik URL'leri, gerçek veri kullanımı beyanları, incelemeci hesabı ve son sürüm cihaz görselleri.
5. Yalnız kanıtı eksik veya değişiklikten etkilenen fiziksel cihaz/yayın kontrolleri. Tam randevu turu otomatik başlangıç adımı değildir.

Aşama 33 bu açıklar kapanmadan PASS değildir.

## Çalışma kopyası karışıklığı

Eski yerel beauty-platform kopyasının HEAD'i 5e4b77a idi; App.tsx değişikliği ve KeyboardScreen.tsx dosyası PR #43'te zaten uzaktan kaydedilmişti. Bunları tekrar yeni düzeltme olarak üretme. Güncel geliştirme kaynağı feat/stage33-mvp-build-specification dalıdır; TestFlight yükleme dalı ayrı dağıtım dalıdır.

## 25 Ekim devamı: hesap silme talep alımı

PR #47, kaynak fc36961d73fd39da4ca591e2def7ac7a09e35abe, TASLAK.
Talep oluşturma, parola/açık onay, kullanıcıya özel durum, yönetici kuyruğu ve parola hatasından sonra oturumu koruma eklendi.

- Dört yeni servis testi, Prisma kontrolleri, API/mobile/integration typecheck ve lint geçti.
- Run 40181355988: migration/regresyon ve gerçek HTTP/PostgreSQL kabulü PASS; 17 entegrasyon testi PASS.
- Run 40181355949: yeni talep ekranı, vazgeçme, yanlış parola, alan temizleme ve doğru talep makbuzu PASS.
- Run 40181355977: Android/iOS derlemeleri PASS.
- İlk eşzamanlılık testi gerçek bir 500 hatası yakaladı. Boş-update upsert yerine createMany(skipDuplicates) ile düzeltildi; iki 202 ve tek talep ID'si koşulu korunarak geçti.

Bu, hesap silmenin talep başlatma/takip parçasıdır. Kalıcı silme, işletme sahipliği/retention, oturum iptali, özel nesne temizliği ve tamamlanma bildirimi halen AÇIK. PR taslakta; canlı veritabanı, canlı API ve TestFlight 1031 değişmedi. Tam hesap silme veya Aşama 33 PASS olarak işaretlenmez.

Sonraki işe başlanırken bu taslak mevcut kabul edilir; talep ekranı/API yeniden sıfırdan üretilmez. Kullanıcıya önceki telefon/randevu testleri tekrar yaptırılmaz.
