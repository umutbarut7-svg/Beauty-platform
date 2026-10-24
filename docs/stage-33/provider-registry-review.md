# Provider and registry review preparation

Prepared 24 October 2026. This records official sources and remaining checks;
it is not policy approval or an enabled product configuration.

## Photo provider disclosure

The OpenAI API data-controls documentation distinguishes application state from
abuse-monitoring data. The application's `store:false` setting is not a promise
that every provider-side copy expires within ORZELL's 24-hour content window.
Default abuse-monitoring retention may be up to 30 days, subject to the stated
exceptions; special retention controls require separate account eligibility and
configuration. Do not claim Zero Data Retention without account evidence.
API training use is disabled by default unless the customer opts into sharing.

Source: https://developers.openai.com/api/docs/guides/your-data

Before public photo activation, record the actual project data-sharing/retention
configuration, applicable provider terms, image-input exceptions, processing
location and reviewed disclosure. ORZELL's 24-hour content/90-day evidence settings
describe its application policy, not an unverified provider guarantee.
No API key, customer image or provider account setting is copied into this file.

## Turkey registry-source candidates

MERSIS is the Ministry of Trade's central system for company and commercial
enterprise registry transactions and records. ESBIS is the Ministry's tradesperson
and artisan information system. Ministry guidance states that tradespeople can
access their own registry details through authenticated access.

Official sources:

- https://mersis.ticaret.gov.tr/
- https://ticaret.gov.tr/ic-ticaret/ticaret-sicili/merkezi-sicil-kayit-sistemi-mersis
- https://ticaret.gov.tr/esnaf-sanatkarlar/esbis/genel-bilgiler

These are candidates by business registry category, not proof of an unrestricted
public lookup API. Do not scrape authenticated records, request customer e-Devlet
credentials or mark a business verified solely because it entered a number.

Proposed manual procedure, pending policy review: identify the business registry
category; check the legal name and reference using an authorized official channel;
confirm the applicant's business authority through the reviewed business contact
process; have an independent platform reviewer record a reasoned decision.
Record only the minimum reviewed evidence; the existing 90-day retention applies
to approved evidence handling. Registry match alone does not establish professional
licensing, health-service authorization or identity assurance.

## Still required

- Confirm launch market and approved registry procedure.
- Assign an authorized reviewer independent of the applicant business.
- Complete review of the provider disclosure and privacy notice.
- Evaluate explicitly consented real-photo samples.
- Prove live storage erasure/recovery and physical-device behavior separately.

Keep both policy-reviewed flags false until their actual review is complete.
Stage 33 remains NOT PASS. The operator/contact declaration is already recorded
in policy-drafts.md; it is not independently verified by this research.
