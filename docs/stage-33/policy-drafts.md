# Fotoğraf ve işletme doğrulaması — inceleme taslağı

Bu metin etkinleştirilmiş bir politika değildir. Kaynakta bulunmayan ürün kararları
aşağıda **öneri** olarak sunulur; kullanıcı tarafından verilmiş kararlar sayılmaz.
`.env.example` içindeki iki `*_POLICY_REVIEWED` değeri `false` kalır.

## Önerilen fotoğraf kapsamı

| Karar      | İncelemeye sunulan öneri                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Amaç       | Kullanıcının istediği saç görünümü için tekil danışmanlık, ek sorular, öneri planı ve katalog eşleştirmesi         |
| Sahiplik   | İşletme seçilmeden önce platformdaki kullanıcı; işletme/profesyonel veya diğer kullanıcı fotoğrafı okuyamaz        |
| Paylaşım   | Özel AWS S3 depolaması ve kullanıcının başlattığı analiz için OpenAI; işletmeye veya reklama otomatik paylaşım yok |
| Saklama    | Fotoğraf, hedef/yanıtlar ve AI planı için azami **24 saat**; teknik onay/işlem kanıtı için **90 gün** önerilir     |
| İzin       | Varsayılanı boş olan ayrı onay; kayıt olmak veya katalog kullanmak fotoğraf izni sayılmaz                          |
| Geri çekme | İzinler ekranından geri çekme; erişim ve analiz sonucu hemen kapatılır, worker fiziksel silmeyi takip eder         |
| İşleme     | JPEG/PNG; en fazla 5 MB ve 20 milyon piksel; server JPEG'e dönüştürür, EXIF/GPS bilgisini kaldırır                 |
| Sınır      | Kimlik tespiti, sağlık/korunan özellik çıkarımı, teşhis, sonuç garantisi veya eğitim/veri satışı amacı yok         |

### Kullanıcı metni için doldurulacak taslak

“[Platformun kayıtlı adı] olarak seçtiğiniz fotoğrafı, isteğinizi ve hedefinizi
saç danışmanlığı için işleriz. Fotoğrafınız özel depolamada tutulur; analizi
başlattığınızda bu amaçla OpenAI'ye iletilir. Fotoğraf ve danışmanlık içeriği
en fazla [onaylanan süre] saklanır. Onay/işlem kanıtı [onaylanan süre] tutulur.
İzninizi uygulamadaki fotoğraf izinleri bölümünden geri çekebilirsiniz. Bu,
fotoğraf ve sonuçlarına erişimi kapatır; fiziksel silme worker tarafından takip
edilir. Analiz profesyonel değerlendirmesinin yerine geçmez ve sonuç garantisi
vermez. Başvurular için [iletişim] ve sağlayıcı işleme koşulları için [bağlantı].”

`store:false`, uygulamanın Responses isteğinde kullandığı ayardır; sağlayıcının
hesap/veri işleme koşullarının yerine geçen bir saklama garantisi olarak sunulmaz.
Kayıtlı platform adı, iletişim, sağlayıcı koşulları ve süreler doldurulmadan
bu metin etkinleştirilmemelidir. Bu eksiklikler test-fixture metinleriyle kapatılmaz.

## Önerilen işletme doğrulaması

| Karar     | İncelemeye sunulan öneri                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| Başvuru   | İşletmenin kayıt adı ve yetkili kayıttaki referansı; belge asılları veya kimlik fotoğrafları bu forma yüklenmez |
| İnceleme  | İşletmeye üye olmayan platform yöneticisi, ilgili resmî kaynaktan ve işletmeyle kurulan kanaldan kontrol eder   |
| Karar     | Gerekçeli onay/red; hiçbir AI veya normal işletme yöneticisi otomatik doğrulama yapamaz                         |
| İptal     | İşletme, bekleyen başvuruyu iptal edip güncel koşullarla yeniden başvurabilir                                   |
| Geri alma | Yetkili platform incelemecisi gerekçeyle doğrulamayı geri alabilir                                              |
| Saklama   | Başvuru kanıtı/notu için **90 gün** önerilir; süre dolunca içerik temizlenir, bekleyen başvuru sona erer        |
| Audit     | Karar/actor/resource referansı mevcut tenant audit'inde kalır; kanıt metni audit/log içine yazılmaz             |

Kayıt referansının hangi resmî kaynakla doğrulanacağı, platformun hangi pazarlarda
başlayacağı ve yetkili incelemecinin kim olacağı netleşmelidir. Bu seçimler
tanımlanmadan `MVP_VERIFICATION_POLICY_REVIEWED=true` yapılmaz. Kod, incelenmiş
version/notice/field-list/retention bağlamını zorunlu kılar; önerilen alan adları
`legal_name` ve `registry_reference` olabilir. Bunlar otomatik olarak ayarlara yazılmaz.

## Etkinleştirme öncesi somut gereklilikler

1. Yukarıdaki öneriler üzerindeki ürün tercihleri ve eksik platform bilgileri.
2. Özel, versioning kapalı S3 bucket, Public Access Block ve uygun IAM runtime
   rolü; gerçek bucket'ın erişim/şifreleme/silme ve saklama ayarlarının doğrulanması.
3. Runtime secret binding ile OpenAI anahtarı, erişilebilir vision modeli ve
   açık kullanıcı/platform günlük çağrı kotaları. Anahtarlar sohbet/commit/log'a yazılmaz.
4. Gerçek S3/OpenAI uçtan uca denemesi ve gerçek iOS/Android cihaz kabulü.

Politika tercihleri, canlı runtime bağlantıları ve cihaz kabulü tamamlanmadan
Aşama 33 bütünü PASS değildir.
