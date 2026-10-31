# ORZELL App Store submission preparation

Prepared 25 October 2026. Draft metadata only; no App Review submission or public release has been performed.

## Turkish listing draft

- App name: ORZELL
- Subtitle: Kendine zaman ayır
- Keywords: kuaför,güzellik,randevu,bakım,salon,saç
- Support contact: orzellapp@gmail.com
- Declared individual operator: Umut Barut

### Description

ORZELL ile bakımına zaman ayır. İşletmeleri ve sundukları hizmetleri incele, uygun saatleri bul ve randevunu planla.

Müşteri alanında randevularını ve durumlarını takip edebilir, uygun randevular için iptal talebini uygulamadan yönetebilirsin. İşletme hesabıyla yetkili olduğun işletmenin profil, hizmet, profesyonel ve çalışma saatlerini düzenleyebilir; randevularını ve mevcut gelir/talep verilerini inceleyebilirsin.

Bu ilk sürümün temel kapsamı işletme keşfi ve randevu yönetimidir. Fotoğraflı AI danışmanlığı, ürün ticareti, uygulama içi ödeme ve B2B pazaryeri bu açıklamada kullanılabilir özellik olarak sunulmaz.

## Release identity and build

- Bundle ID: com.orzell.app
- Apple team: CDL78S6U9A
- Product version: 1.0.0
- Internal TestFlight group: ORZELL iç test
- First accepted binary: 1.0.0 (1011), 24 October 2026.
- A later candidate must record its own processed build, source revision and device observations. Earlier phone observations cannot certify later code.

## Submission gates still requiring real values/evidence

| Gate                      | Required evidence                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public support URL        | An owner-controlled HTTPS support page; an email address alone is not a URL.                                                                                       |
| Public privacy-policy URL | Reviewed disclosure covering actual data, processors, retention and deletion; no placeholder link.                                                                 |
| Account deletion          | Verify an accessible account-deletion path and backend behavior before submission. Do not equate logout with deletion.                                             |
| App Privacy answers       | Derive each answer from the actual app/backend and SDK behavior, including account details, photos if enabled and diagnostics. Do not guess tracking declarations. |
| Age rating and encryption | Answer Apple's actual questionnaire against the final binary and content. No declaration is inferred from a successful upload.                                     |
| Reviewer access           | A designated test account and instructions using synthetic data, supplied securely in App Store Connect. No password is committed here.                            |
| Screenshots               | Capture the final candidate on the required supported Apple display sizes. The synthetic web-screen PDF is a review aid, not a substitute for store screenshots.   |
| Device acceptance         | Verify install, keyboard, login, booking, cancel, relaunch and logout on the exact release candidate.                                                              |
| Scope                     | Keep photo/AI/verification features closed until their actual policy and provider review is complete.                                                              |

Do not advertise marketplace, product stock, live payments, health diagnosis or AI outcomes as shipped functionality. The UI examples contain synthetic data and are not business revenue evidence.

Stage 33 remains NOT PASS until the corresponding acceptance gates are satisfied.
