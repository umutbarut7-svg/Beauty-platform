# ORZELL Everywhere web landing integration notes

The draft route `/discover/service` is a **safe preview**, not a booking checkout. It validates public link IDs using the shared package and refuses malformed/duplicate parameters. Configure `ORZELL_PUBLIC_ORIGIN` as the actual deployed, approved HTTPS web origin before testing. Do not assume `orzell.app` is owned or deployed.

**Next:** resolve the business/service/result IDs against published tenant-scoped API data; verify that the service belongs to the business and that the staff/result is published and associated with the service. Show actual name, photo with consent, price/currency, duration and availability; route to existing authenticated or guest booking flow. Reject unpublished/foreign-tenant content with no existence leak. Add integration and physical iPhone tests. Do not enable native Universal Links until domain ownership, apple-app-site-association and assetlinks.json are verified.
