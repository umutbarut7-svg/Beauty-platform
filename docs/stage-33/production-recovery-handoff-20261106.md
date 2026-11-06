# Gerçek kurtarma provası — hazır kapsam ve eksik ortam

6 Kasım günlük üretim yedeği gerçekten oluşturuldu ve uzak depodaki sürüm/boyut/
SHA256/AES256 bilgileri başarı makbuzuyla doğrulandı. Bu belge gerçek kurtarmanın
yerine geçmez. Canlı PostgreSQL'e geri yükleme yapılmayacak.

## Hazır ve sabit bilgiler

| Alan                        | Değer                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Kaynak uygulama             | `2e56def282c97a804a2f3d6c9b36a53b42a09df5`                                              |
| Kaynak imaj                 | `sha256:f13b300b0a0a236553b174b6453fc1d8ec3c06b1c912074401e625371464c99e`               |
| Günlük yedek kimliği        | `orzell-database-20261106`                                                              |
| Sınır                       | `LIVE_DAILY_SNAPSHOT`                                                                   |
| Son gerçek başarı           | `2026-11-06T00:00:07Z` / 03:00:07 İstanbul                                              |
| Paket boyutu                | 667.424 bayt; mevcut üretim üst sınırı 128 MiB                                          |
| Bağımsız signer SPKI SHA256 | `1c99e1da54a5e4a303c98f42fddb15c8d924320a6ef772bbf15c61cebc22f13f`                      |
| Alıcı sertifikası SHA256    | `241abc0895734f656d4a5920ad074e008f56c405b0d5a144b0e823777293c84c`                      |
| Kurtarma alıcısı            | `orzell-recovery-241abc0895734f65`; özel anahtar sahibi tarafından telefonda saklanıyor |
| Hazır tüketici              | `infra/operations/recover-backup-package.py`                                            |
| Fotoğraf karantinası        | `infra/operations/quarantine-restored-photos.sql`                                       |

Public signer güven pini 6 Kasım hazırlığında sunucu dışında kaydedildi; yeni
paketin içinden veya yan dosyasından güven kökü türetilmez. Özel anahtar tekrar
oluşturulmaz, kaynak koduna/CI'a/canlı sunucuya gönderilmez. Belgede veya komutta
özel anahtar içeriği yoktur. Bu çalışma özel anahtar dosyasını yeniden okumadı.

## Başlamadan gereken tek ortam bilgisi

Sahibin kullanabileceği **korumalı bağımsız kurtarma bilgisayarı/ortamı** henüz
belirlenmiş ve doğrulanmış değildir. iPhone'da anahtar saklandığı teyitli olsa da
bu, PostgreSQL restore için doğrulanmış bir çalışma ortamı sağlamaz. Hedefin
Linux mühürlü dosya tanıtıcılarını desteklemesi (gerekirse yerel Linux sanal
makinesi), şifreli çalışma diski, yeterli RAM/disk, eşleşen PostgreSQL araçları ve
izole Docker ağı doğrulanmalıdır. Root/same-user erişimi, swap ve çökme sonrası
açık dosya kalıntıları yalnız 0700 dizinle çözülmüş sayılmaz. Yeni ücretli bulut
kaynağı veya yönetici kimliği bu belgeyle oluşturulmaz.

## Ortam belirlendikten sonra uygulanacak prova

1. Gerçek başarı makbuzunu ve yalnız ilgili şifreli paket sürümünü mevcut yetkiyle
   al; boyut/SHA256/sürüm bağını doğrula. Şifreli indirme aşaması ile anahtarlı
   offline aşama ayrılır; bulut kimlikleri offline ortama taşınmaz. Makbuzdaki
   gerçek createdAt/verifiedAt ve bağımsız kaydedilmiş bağlamla dar onaylı zaman
   aralığı belirlenir. Paket kendi kabul koşullarını belirleyemez.
2. Hash'leri doğrulanmış tüketici, dışarıda kayıtlı public signer ve alıcı
   sertifikasıyla imza/kimlik/kaynak/zaman/limitleri denetle; sahibin ayrı tuttuğu
   özel anahtarla korumalı offline ortamda çöz. Mevcut çıktı üzerine yazılmaz.
   Mevcut paket tüketicisinin gerçek CMS ve PostgreSQL testleri korunur.
3. PostgreSQL custom dump'ı önce nesne listesiyle incele; public listener,
   production volume, AWS/OpenAI kimliği veya worker bağlantısı olmayan ayrı
   disposable DB'ye, yetki/sahiplik/extension gereksinimleri incelenerek restore
   et. Tamamlanmış bir restore, uygulamanın yeniden erişime açılması değildir.
4. Ağ dışarı kapalıyken hesap/oturum ve fotoğraf/danışmanlık karantinasını uygula;
   tenant sınırları, mevcut migration/model kimliği ve stok/B2B/sarf tutarlılığını
   salt-okuyan kontrollerle ölç. Eski parola/token veya sonraki silinmiş verinin
   yeniden erişime açılması engellenmeden hiçbir uygulama/worker başlatılmaz.
   Aktif teslim dalının gerçek şemasına uymayan PR47 SQL'i doğrudan uygulanmaz.
5. Paket alma, doğrulama/çözme, DB restore ve karantina kontrol sürelerini ayrı
   kaydet; ölçülen toplam kurtarma süresini ve yedek anına göre kayıp penceresini
   raporla. Müşteri satırı, fotoğraf, dump, anahtar veya token kanıt dosyasına
   yazılmaz. Korumalı geçici açık içerik güvenle kaldırılır; ortam açılmadan
   sonuç bağımsız gözden geçirilir.

Mevcut sentetik izole testler hazırlık kanıtıdır; bu gerçek prova **henüz
çalıştırılmadı**. Bağımsız incelemeci, hesap silme/işletme geçmişi kuralları ve
kullanıcıya bildirim teslimi ayrıca açık kalır. AŞAMA33 **NOT PASS**.
