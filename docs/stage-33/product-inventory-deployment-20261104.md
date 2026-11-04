# Product inventory release preparation

This prepares API/worker and migration images for fixed application source `2e0c52f705d4ec26f161720a97914aa56965e0c2` (PR #89). It has repository-read permission only, no AWS identity and no live deployment step.

The existing checksum-pinned preview Dockerfile builds both targets. A Docker internal network contains disposable PostgreSQL, API and privacy worker. AI, semantic matching, S3, Redis and inventory rollout remain disabled in the running services. The verifier enables inventory only inside its separate disposable test process, creates synthetic account/business/products, exercises closed-gate denial, import/movement replay, stock bounds, private/public catalog projection and exact stock, then removes those fixtures. No external provider request is possible from the internal network.

Compiled module digests, Prisma models, applied migration and matching API/worker evidence are preserved with the image archive. Source, image IDs, archive bytes and SHA-256 are recorded. The artifact expires after three days; it is not a permanent deployment or backup.

Preparation does not authorize or perform live migration, flag activation, catalog data entry, signed TestFlight delivery or store submission. Live rollout requires verifying the candidate CI, exact artifact/hash/current services and migration history, protecting the existing privacy worker and environment, applying the additive migration before enabling inventory, and checking authenticated tenant/role gates. The current Apple-accepted build remains 1131. Stage 33 is NOT PASS; B2B and other acceptance remain separate.

## Combined B2B candidate

The next preparation pins application 2e0c52f705d4ec26f161720a97914aa56965e0c2 (PR #89). It includes inventory plus B2B supplier profiles, product opt-in and scoped quotes. Both migrations and all five Prisma models are verified. Inventory/B2B remain closed in running API/worker; only the synthetic verifier enables them in its own process. Compiled supplier/product discovery, quote replay, supplier price reply, buyer cancellation and zero stock side effects are exercised and removed. There is no live deployment, purchase/payment/notification or provider call. The older inventory-only artifact cannot deploy the combined source.
