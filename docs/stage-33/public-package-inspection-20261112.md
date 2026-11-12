# Gerçek şifreli yedeğin anahtarsız incelenmesi

12 Kasım günlük yedeğinin güncel makbuzu gerçek AWS okumasıyla alındı:
`43175976651`, audit job `131040199699`, inspect job `131040400785`.
İnceleme 10:32:52 İstanbul'da sağlıklı zamanlayıcıları, başarılı servisleri,
uzak sürüm/boyut/SHA256 eşleşmesini ve uygulama servislerinin aynı kaldığını
doğruladı. Bu çağrı DB/paket gövdesi/özel anahtar okumadı ve ayar değiştirmedi.

`.github/operations/recovery-snapshot-20261112.json` yalnız bu bağımsız okumanın
sabit paket kimliğini içerir: `orzell-database-20261112`, 667576 bayt,
`bGbetc6wxE4Ru1KA_7zmspAnlu5.CTfE` sürümü ve paket SHA256
`0125b3789379511b52c8a61dbb24f2b847d34626f2a51562fe2a0bc2fa2d1221`.
Kapsam UTC 00:00:02–00:00:07; kaynak uygulama `2e56def282c97a804a2f3d6c9b36a53b42a09df5`
ve kaynak imajı önceki makbuzla aynıdır. Bu dosya otomatik olarak “en yeni”
yedeği seçmez; sonradan gelen farklı sürümün onaylı olduğu varsayılmaz.

## Bağımsız güven girdileri

İmzalayan genel PUBLIC KEY, 5 Kasım'daki sunucu dışı kayıttan alınmıştır;
SPKI SHA256'sı `1c99e1da54a5e4a303c98f42fddb15c8d924320a6ef772bbf15c61cebc22f13f`
OpenSSL ile tekrar eşleştirilmiştir. Yedek paketinden türetilmez ve özel anahtar
içermez. Mevcut genel alıcı sertifikası ayrıca bağımsız DER parmak iziyle bağlanır.

`recovery-schema-reference-2e56def.json`, paketten ayrı olarak migration uygulanmış
reviewed kaynak referansına bağlıdır. 43169608631/job131019470556 testinde
PostgreSQL/pgvector digest'i, katalog sorgusu SHA256'sı ve normalize edilmiş
şema/migration SHA256'sı kaydedilmiştir. Aynı kaynak/referans hash'i önceki
bağımsız CI çalıştırmasında da görülmüştür. Bu, canlı üretim şemasını okumak veya
asıl geri yüklenen DB'nin bu hash'le eşleştiğini kabul etmek değildir; gelecekteki
restore'un karşılaştıracağı bağımsız beklenen referanstır.

## Public inceleme aracı

`inspect-recovery-package.py` varsayılanında `OFFLINE_NO_ACTION` verir. Yalnız
`--inspect` ve şifreli paket yolu kabul eder; özel anahtar argümanı/çözme/DB/ağ/AWS
çağrısı yoktur. Public doğrulama sırasında:

1. Makbuzdaki tam boyutu okumadan önce fstat ile kontrol eder; sonra en fazla
   16 MiB'lik mühürlü kopya üzerinde paket SHA256'sını eşleştirir.
2. Sabit iki üyeli, stored, sınırlı arşivi açar. Signer pinini, RSA-PSS imzasını,
   cipher SHA256/boyutunu, kaynak/yedek/alıcı/zaman bağlarını ve gerçek genel
   alıcı sertifikası parmak izini mevcut verifier ile denetler.
3. Paket kaynağını ayrı schema referansına ve mevcut katalog sorgusu hash'ine
   bağlar. Onaylı handoff için gerekli cipher/context/schema değerlerini üretir;
   bunları paketin kendi beyanından bağımsız güven kökü saymaz.

Başarı `ENCRYPTED_PACKAGE_AUTHENTICATED_NO_RESTORE` olur. encryptedPackageRead=true,
plaintextRead/privateKeyRead/productionSchemaVerified/productionRestoreVerified/
independentRecoveryApproval/realRecoveryReady=false kalır. Kaynağı doğrulanmış
şifreli paket, tek başına gerçek restore veya ürün kabulü değildir.

Yedi yeni yapay test; geçerli imzalı paketi, makbuz boyut/hash/truncation/symlink,
bağımsız kaynak/imaj/sorgu/şema referansı, signer/alıcı/zaman, ZIP hash'i yeniden
hesaplansa bile imza bozulması, ek arşiv üyesi ve CLI sınırlarını doğrular.
Fixture üretiminde yeni yapay anahtarlar kullanılır; verifier decrypt girişini
çağırırsa test başarısız olur. Önceki başarılı DB restore testleri tekrarlanmaz.

## Owner adımı ve açık sınırlar

Sahibin CloudShell'i yalnız sabit bucket/key/**versionId** üzerinden şifreli ZIP'i
indirir. İndirme yeni 0700 geçici dizine yapılır; önceki dosyalar üzerine yazılmaz.
Repo yalnız reviewed commit SHA'sından checkout edilir; CLI aynı commit'teki
public pin, makbuz ve kaynak referansını kullanır. Sonuç JSON'u dışında müşteriye
ait satır, açık dump veya anahtar çıktısı yoktur. Bu adım AWS kaynağı/IAM/servis
oluşturmaz veya değiştirmez; alınan ZIP hâlâ şifrelidir. Ortamda swap bulunsa bile
bu adımda özel anahtar ve açık dump işlenmez.

Gerçek owner paket sonucu henüz yoktur. Telefon arayüzü, immutable istemci
iletimi, kimliği doğrulanmış challenge kanalı, gerçek veri için onaylı host ve
bağımsız güvenlik incelemesi tamamlanmadan anahtarlı aktarım başlatılmaz.
AŞAMA 33 **NOT PASS**.
