# Kalan gerçek girdiler — Aşama 33

Bu dosya yeni izin isteme listesi değildir. Önceden verilen kararlar korunur: ORZELL App, bireysel işletmeci Umut Barut, orzellapp@gmail.com, 24 saat fotoğraf/danışmanlık, 90 gün izin/işlem kanıtı ve işletmeden bağımsız doğrulama prensibi. 27 Ekim devamında konuşma kayıtlarında bunlar dışında aşağıdaki kararların verildiğine dair kanıt bulunmadı.

## Hazır teknik sonuç

Hesap silme isteği, işleme alma, fotoğraf kapatma/worker temizliği, uygun hesaplar için gerçek kalıcı silme, en az veri tutan kanıt kaydı, takip kodu/sonuç ekranı, platform operatör kuyruğu ve eski yedekten tekrar girişe karşı karantina aday kodda mevcuttur. İşletme geçmişi olan hesaplar engel sınıfıyla raporlanır; kuralsız bir silme/sonsuz saklama seçeneği yoktur. CI ve tam SHA PR #47'de tutulur. Bu kodun varlığı politika/gerçek cihaz kabulü yerine geçmez.

## Karar veya gerçek kanıt gerektiren alanlar

| Alan                                      | Hazır olan                                                                                                       | Eksik gerçek girdi                                                                                                                                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| İşletme kayıtlarının kişisel veri kapsamı | Model bazlı inceleme; FK ve düz JSON kimlik referanslarını yakalama; başka işletmenin verisini silmeden durma    | BusinessCustomer iletişim/profil/notları, Appointment/sonuç metinleri, finans, audit ve ortak mesajlaşma için silme/anonimleştirme/saklama kuralı ve geçerli süre/basamak. Ömür boyu saklama veya gelişigüzel süre varsayılmaz.                         |
| Doğrulama                                 | Bağımsız SUPER_ADMIN kontrolü ve yetki testleri; MERSİS/ESBİS kaynak hazırlığı önceki görüşmede kaydedilmiş      | İlk pazar ve geçerli resmî kaynak eşlemesi; işletmeye gerçekten bağımsız kişi/rol ataması. İşletmeci adının bilinmesi bu atama değildir.                                                                                                                |
| Fotoğraf sağlayıcı açıklaması             | Güncel resmî OpenAI veri kontrol belgesi ve store:false/ZDR ayrımı taslağa işlendi                               | Gerçek proje/organizasyonun veri kontrol ve aktarım bağlamı ile kullanıcı metninin son incelemesi. Bağlayıcı yalnız API anahtarı işlemleri sunduğu için bu hesap ayarını doğrulamıyor.                                                                  |
| İşleme işletimi                           | Taleplerin tarihi, operatör incelemesi, tekrar deneme, idempotent tamamlanma ve kullanıcı takip ekranı           | Kamuya bildirilecek işlem hedefi/süresi ve fiilî kuyruk sorumlusu. Gönderilmiş e-posta/push bildirimi iddiası yok.                                                                                                                                      |
| Gerçek kullanıcı kabulü                   | Önceki telefon giriş/randevu/iptal testleri korunur; sentetik/güvenlik/provider/adaptör testleri ayrı kaydedilir | Gerçek fotoğrafın bu amaçla işlenmesine açık kullanıcı izni; son adayda fotoğraf → soru → plan → eşleşme kalite/kullanılabilirlik değerlendirmesi ve değişen alanların cihaz kabulü. Başka amaçla yüklenmiş fotoğraf/video bu iznin yerine kullanılmaz. |

## Teknik sınıf eşlemesi

| Veri                                                                    | Teknik işlem için hazırlanan sınır                                                                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| User, Customer, RefreshSession                                          | Uygun kapsamda gerçek satır/oturum silme; eski access ve refresh reddi                                                                       |
| Fotoğraf ve danışmanlık                                                 | Fiziksel yokluk doğrulanmadan veri anahtarı silinmez; içerik temizlenir; izin/işlem kanıtının mevcut bitişi uzatılmadan asgari kaydı tutulur |
| Tenant bağlamı/metadata içermeyen basit auth sayaçları                  | Tür/zaman/seviye korunur; actor/request/route bağı kaldırılır                                                                                |
| BusinessMember, Staff ve program atamaları                              | Üçüncü kişilerin kayıtları kaybolmadan devir/üyelik ve atanmış işlerin devamlılığı; inceleme olmadan toplu silme yok                         |
| BusinessCustomer, Appointment, BeautyJobResult ve kişisel serbest metin | İşlem tarih/tutar/hizmet gibi iş geçmişiyle iletişim/kimlik/kişisel metni ayıran alan bazlı karar gerekiyor                                  |
| Finance/Audit/Message/Governance ve diğer bulunan modeller              | Kaydın sahibi, kişisel alanı, saklama gereği ve süresi kesinleşmeden otomatik silme/anonimleştirme yok                                       |

Eski yedekler çevrimdışı kalır. Yeni karantina, silinmiş hesabın parola veya eski token ile dönmesini engeller; bağımsız ve kalıcı seçici silme günlüğünün yerine geçmiş sayılmaz. Production yedeği, fiilî geri dönüş, mağaza gönderimi ve gerçek bildirim gönderimi bu devamda yapılmadı.
