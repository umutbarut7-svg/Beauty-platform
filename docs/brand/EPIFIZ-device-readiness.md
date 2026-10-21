# EPIFIZ — fiziksel cihaz testine geçiş kapısı

Durum: **hazırlık kontrol listesi**. Bu dosyanın varlığı cihaz, sunucu veya AŞAMA 33 PASS anlamına gelmez.

## Derleme ve paketleme
- [ ] PR #13 üzerinde Stage 32 validation ve Stage 33 native compilation işleri SUCCESS; commit SHA eşleşiyor.
- [ ] Android debug APK indirilip SHA256 doğrulanır. Metro gerektiren debug paketini bağımsız çalışır uygulama sanmayın.
- [ ] Fiziksel iPhone için Apple geliştirici imzası/provisioning, TestFlight veya kontrollü development build hazırlanır. CI iOS simulator ZIP'i iPhone IPA'sı değildir.
- [ ] Expo teknik slug `beauty-platform` korunur. Geçici test bundle/package `com.beautyplatform.stage33test` mağaza kimliği değildir.
- [ ] Nihai ikon ve splash görselleri **henüz paketlenmedi**; üretilen logo panoları yalnız onaylanan tasarım yönüdür.

## Ulaşılabilir test API ve güvenlik
- [ ] Test sunucusu çalışıyor, DNS ve TLS doğrulandı; cihazın mobil ağından güvenli HTTPS erişimi var.
- [ ] `EXPO_PUBLIC_API_URL` test build'inde cihazın erişebildiği HTTPS host'a işaret ediyor; `localhost` veya `127.0.0.1` değil.
- [ ] İstemciye gömülü `EXPO_PUBLIC_*` değişkenlerinde API anahtarı, secret veya kullanıcı kimlik bilgisi yok.
- [ ] AWS bölge, bütçe, alarm, yetki kapsamı, S3 özel erişim ve SSM çalışma izni canlı ortam için doğrulandı.
- [ ] Bağımsız test veritabanı ve sentetik müşteri/işletme hesapları hazır. Gerçek müşteri fotoğrafları kullanılmaz.
- [ ] Fotoğraf/AI/business-verification rollout bayrakları politika ve kabul onayı tamamlanana kadar kapalı.

## Fiziksel cihaz senaryoları
- [ ] iPhone: açılış, kayıt/giriş/çıkış, ağ kesintisi, yeniden başlatma, erişilebilirlik.
- [ ] Android: aynı kimlik ve temel kullanıcı akışları.
- [ ] İşletme keşfi, katalog, gerçek slot, randevu, iptal/durum, sonuç, memnuniyet ve passport akışı.
- [ ] Fotoğraf seçmeyi reddetme/iptal, rıza verme/geri çekme ve zaman aşımı; özellik etkinleştirilmeden test koşulları ve resmî izin metni onaylanmalı.
- [ ] Tenant sınırı, yetki reddi, job tekrarları ve veri silme gözlemleri.
- [ ] Gerçek fotoğraf PLAN/match kalitesi, bağımsız işletme inceleyicisi ve canlı retention worker kontrolleri ayrı AŞAMA 33 kabul maddeleridir.

## Kanıt ve kabul
Her senaryo için tarih, cihaz/OS sürümü, uygulama commit'i, sunucu sürümü, ortam, beklenen/gerçek sonuç ve redakte edilmiş log tutulur. CI yeşili tek başına fiziksel cihaz testi değildir. PR #11 kabul matrisi kapanmadan AŞAMA 33 PASS sayılmaz.

**Kullanıcı aksiyonu gerekenler:** Apple geliştirici imzalama/TestFlight erişimi; gerçek iPhone/Android ile test; kamuya açık alan adı ve marka tescili için nihai karar. Yeni ücretli AWS kaynakları ve üretim geçişi için ayrıca maliyet ve güvenlik onayı gerekir.
