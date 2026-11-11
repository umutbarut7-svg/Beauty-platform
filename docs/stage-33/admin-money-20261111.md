# ORZELL admin monetary display — 11 November 2026

The admin view appended a currency code directly to ledger integer minor units,
so a value of 25075 TRY rendered as 25075 TRY instead of ₺250,75. It now uses the
existing mobile formatter, extracted without changes into the shared types
package. Mobile keeps its original presentation export and behavior; the admin
uses the same formatter. No ledger, payment or conversion calculation changes.

BigInt formatting preserves integer precision, each currency's fraction digits,
negative values below one major unit, zero and the missing/malformed-data fallback.
The existing six presentation tests passed after extraction, including TRY, JPY,
KWD and values beyond Number.MAX_SAFE_INTEGER. Shared build, changed-source lint,
admin production webpack build and mobile typecheck passed. The isolated admin
browser scenario now also renders AVAILABLE gross/net revenue before 401 cleanup,
asserting ₺9.007.199.254.740.991,99 and -₺0,01 exactly.

This change follows the separate admin `/login` and visual identity fix. Live
container publication, physical-device acceptance and Stage 33 remain open until
separately observed. It does not create a payment or alter stock/business records.
