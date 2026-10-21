# EPIFIZ — ücretli Apple hesabı olmadan mobil önizleme

## Hazır olanlar

- GitHub Actions Stage 32 doğrulaması ve Stage 33 Android/iOS simülatör derlemesi son denetlenen committe başarılıydı.
- GitHub native Android debug APK geliştirici amaçlıdır; Metro gerektirebilir.
- EAS `preview` profili Android APK ve iOS simülatör paketi için tanımlıdır; henüz bir EAS bulut derlemesi yürütülmedi.

## Android test paketi

1. Expo hesabıyla oturum aç ve depoyu yerel ya da bir yetkili geliştirme ortamında kullan.
2. API için telefonun erişebileceği TLS doğrulanmış test URL'sini ayarla; `EXPO_PUBLIC_API_URL` içine gizli anahtar koyma.
3. Expo proje bağlantısını `eas init` ile doğrula; izin/erişim onayı olmadan yeni EAS projesi oluşturma.
4. `eas build --platform android --profile preview` çalıştır ve sonucu/dosya bağlantısını kaydet.
5. APK'yı sentetik hesapla gerçek Android cihazda test et; üretim kullanıcı verisi kullanma.

## iPhone

- Ücretli Apple Developer hesabı ve TestFlight olmadan CI'da üretilen iOS simülatör uygulaması fiziksel iPhone'a kurulamaz.
- Mac + Xcode + ücretsiz Personal Team ile kendi iPhone'unda kısa süreli geliştirme imzasıyla deneme yapılabilir; bu seçenek Mac erişimi ve cihaz bağlantısı gerektirir.
- Alternatif olarak temel Expo uyumluluğu Expo Go ile denenebilir; ancak Expo Go native kabulün ve imzalı bağımsız uygulamanın yerine geçmez.
- EAS `preview` iOS ayarı özellikle **simulator: true**; iPhone IPA veya TestFlight dağıtımı vaadi değildir.

## Testten önce bloklayanlar

- AWS/HTTPS üzerinde çalışan API ve sentetik test verisi doğrulanmalı.
- Expo kimliği/organizasyon erişimi ve gerekli mobil imzalama seçenekleri netleşmeli.
- Bağımsız cihaz testi kanıtları ve Stage 33 politika onayları tamamlanmalı.
- Ücretli AWS/Apple/Expo kaynakları, veri silme, üretim değişikliği veya marka kimliği değişikliği için ayrı izin alınmalı.
