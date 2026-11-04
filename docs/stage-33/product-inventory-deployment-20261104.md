# Product inventory release preparation

This prepares API/worker and migration images for fixed application source `113abadd7f2776953baf9c3e89046b08388bf647` (PR #87). It has repository-read permission only, no AWS identity and no live deployment step.

The existing checksum-pinned preview Dockerfile builds both targets. A Docker internal network contains disposable PostgreSQL, API and privacy worker. AI, semantic matching, S3, Redis and inventory rollout remain disabled in the running services. The verifier enables inventory only inside its separate disposable test process, creates synthetic account/business/products, exercises closed-gate denial, import/movement replay, stock bounds, private/public catalog projection and exact stock, then removes those fixtures. No external provider request is possible from the internal network.

Compiled module digests, Prisma models, applied migration and matching API/worker evidence are preserved with the image archive. Source, image IDs, archive bytes and SHA-256 are recorded. The artifact expires after three days; it is not a permanent deployment or backup.

Preparation does not authorize or perform live migration, flag activation, catalog data entry, signed TestFlight delivery or store submission. Live rollout requires verifying the candidate CI, exact artifact/hash/current services and migration history, protecting the existing privacy worker and environment, applying the additive migration before enabling inventory, and checking authenticated tenant/role gates. The current Apple-accepted build remains 1131. Stage 33 is NOT PASS; B2B and other acceptance remain separate.
