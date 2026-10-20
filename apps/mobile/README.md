# Beauty Platform mobile

Expo/React Native müşteri ve işletme uygulaması. Repo kökünde
`corepack pnpm install --frozen-lockfile` ve
`corepack pnpm --filter @beauty-platform/types build` sonrasında
`corepack pnpm --filter @beauty-platform/mobile dev` ile çalışır.
API adresi `EXPO_PUBLIC_API_URL`; varsayılan `http://localhost:3001`.
Telefon/emülatörde localhost adresi geliştirme bilgisayarı değildir; test API'si
cihazın erişebildiği adreste olmalıdır. Secret değerleri EXPO_PUBLIC değişkenlerine yazılmaz.

## Native doğrulama

`.github/workflows/stage-33-native.yml` Android debug APK ve imzasız iOS simulator
uygulamasını ayrı job'larda derler. Önce sabit lockfile ile kurulum, sonra Expo'nun
kurulu sürümünün prebuild template'i kullanılır. CI namespace'i
`com.beautyplatform.stage33test` yalnız geçici test kimliğidir; mağaza kimliği
seçilmiş veya uygulama yayımlanmış değildir. Oluşan native klasörler commit edilmez.

Yerelde izole bir worktree'de Android/iOS prebuild, mevcut Expo ve fotoğraf
seçici plugin'i ile başarıyla çalıştırıldı. Derleme sonucu her commit'in native
workflow kaydından ayrıca kontrol edilir; prebuild tek başına APK/iOS build PASS değildir.

Debug artifact'leri mağaza dağıtımı, fiziksel cihaz kabulü veya canlı AWS/OpenAI
kabulü değildir. Debug uygulamanın JavaScript için Metro geliştirme sunucusuna
bağlanması gerekebilir. iOS simulator artifact'i iPhone'a kurulabilir IPA değildir.

Native kullanım kabulünde sentetik test hesapları/fotoğraflarıyla kayıt/giriş,
izin vermeme, fotoğraf seçme/iptal, izin geri çekme ve geciken yanıt, ağ kesilmesi,
slot/randevu, job/result/satisfaction/passport ve işletme ekranları doğrulanmalıdır.
Gerçek müşteri fotoğrafı, credential veya özel içerik CI log/artifact'ine konmaz.
Politika taslakları ve canlı kabul sınırları `docs/stage-33/` altındadır.
