# Admin

Next.js tabanlı işletme ve platform yönetim paneli için ayrılmıştır. Sunucu
işlemleri tenant kapsamını ve backend yetki kontrollerini hiçbir zaman bypass
etmemelidir.

`/` ve `/login` aynı platform yöneticisi giriş ekranını açar. İşletme hesabı
erişimi müşteri/işletme uygulamasındadır; burada SUPER_ADMIN kontrolü korunur.
ORZELL özgün logo dosyası mobil uygulamadakiyle birebir aynıdır. Açık ve koyu
renkler cihazın sistem görünümünü izler.

Dağıtım derlemesinde `NEXT_PUBLIC_API_URL` gerçek HTTPS API adresine ayarlanır.
İzole giriş incelemesi için `https://api.example.test` ile Next.js derlenir;
`node scripts/check-admin-entry.cjs` gerçek sunucuyu başlatıp Chromium/WebKit
üzerinde yalnız yapay API yanıtlarıyla giriş ve oturum temizliğini kontrol eder.
