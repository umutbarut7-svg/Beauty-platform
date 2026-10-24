# ORZELL mobile

Expo/React Native müşteri ve işletme uygulaması. Node 24 ve pnpm 10.28.1 ile repo kökünde:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @beauty-platform/types build
EXPO_PUBLIC_API_URL=http://localhost:3001 corepack pnpm --filter @beauty-platform/mobile dev
```

API adresi `EXPO_PUBLIC_API_URL`; belirtilmezse mevcut ORZELL ön izleme API'si kullanılır. Telefonda localhost geliştirme bilgisayarı değildir; erişilebilir HTTPS test adresi verin. Secret değerleri EXPO_PUBLIC değişkenlerine yazmayın.

## Ekranlar

Müşteri: Keşfet, Randevular, Bakımım, Hesabım. Katalogdan hizmet, konum, uzman, gün ve saat seçilir. Saat seçimi rezervasyon oluşturmaz; fiyat ve tarih incelendikten sonra **Randevuyu onayla** gönderir. Bu adımda ödeme alınmaz. Gelecekteki uygun randevuların iptali ayrıca onaylanır.

İşletme: Hesabım ekranından işletme alanına geçilir. İşletmem, Randevular, Özet, Hesabım sekmeleri bulunur. Konum, ekip, hizmet ve çalışma saatleri İşletme ayarları içindedir. İşlem durumu yalnız sunucunun desteklediği geçişlerle ilerler. Gelir özeti kayıtlı ledger tutarlarını gösterir; veri yoksa gelir uydurulmaz.

Fotoğraflı danışmanlık Keşfet içindedir; mevcut açık izin ve sunucu politika kontrolleri korunur. Giriş bilgileri bellekte tutulur; çıkışta oturum ve hesaba bağlı ekran verileri temizlenir.

## Doğrulama

`.github/workflows/orzell-application.yml` güncel kaynak kodu export eder ve uzak isteklerin tamamını kesen veya sentetik cevaplayan tarayıcı yolculuğunu çalıştırır. 320/390/768 px görünümleri ve ekran görüntüleri artifact olarak saklanır. Gerçek HTTP, veritabanı, worker ve bakım geçmişi akışı Stage 32 validation içindeki Stage 33 integration testinde izole servislerle ayrıca doğrulanır. Bu testin export adresi localhost olarak sabitlenir; uzak ağ istekleri engellenir.

`.github/workflows/stage-33-native.yml` JavaScript içeren Android release ön izleme APK'sı ve imzasız iOS simulator uygulaması derler. CI namespace'i `com.beautyplatform.stage33test` geçici test kimliğidir. Android çıktısı mağaza sürümü değildir; iOS simulator çıktısı iPhone'a kurulabilen IPA değildir. Native klasörler commit edilmez.

Fiziksel Android/iPhone kabulü, gerçek fotoğraf/AI kalite kabulü, incelenmiş işletme/fotoğraf/iletişim politikaları ve sürekli üretim gizlilik/kurtarma kabulü henüz tamamlanmadı. Bu arayüz değişikliği Stage 33 PASS veya mağaza yayını anlamına gelmez. Google Play kurulumu ayrı, iPhone cihaz dağıtımı Apple imzalama hesabı gerektirir.
