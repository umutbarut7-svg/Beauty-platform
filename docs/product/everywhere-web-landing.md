# ORZELL Everywhere web landing integration notes

The draft route `/discover/service` is a **safe preview**, not a booking checkout. It validates public link IDs using the shared package and refuses malformed/duplicate parameters. Configure `ORZELL_PUBLIC_ORIGIN` as the actual deployed, approved HTTPS web origin before testing. Do not assume `orzell.app` is owned or deployed.

**Next:** resolve the business/service/result IDs against published tenant-scoped API data; verify that the service belongs to the business and that the staff/result is published and associated with the service. Show actual name, photo with consent, price/currency, duration and availability; route to existing authenticated or guest booking flow. Reject unpublished/foreign-tenant content with no existence leak. Add integration and physical iPhone tests. Do not enable native Universal Links until domain ownership, apple-app-site-association and assetlinks.json are verified.

## Published discovery integration (draft PR)

- Optional server-side `ORZELL_PUBLIC_API_ORIGIN` must be a bare HTTPS origin of the trusted ORZELL API. Without it the page fails closed (no service details).
- Landing now requests `GET /discovery/services?businessId=...&serviceId=...&limit=10` without caching, with a 5-second timeout.
- It displays only an exact matching published business/service returned by public discovery; missing, ambiguous and failing responses show a generic unavailable state.
- Existing database discovery filters businesses by `isPublic=true`, `status=ACTIVE` and services by `isActive=true`, `isBookable=true`.
- This is **not** end-to-end booking. Professional/result photo approval, verified availability and authenticated booking remain gated. No secrets or payment data are sent in the public URL.
- CI must validate the new Next.js page and formatting before merge. No deployed origin is assumed.
