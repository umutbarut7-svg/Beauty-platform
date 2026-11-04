# Shared catalog inventory and B2B preview publication

The fixed request delivers source `2e0c52f705d4ec26f161720a97914aa56965e0c2` after all four exact-source application gates and release preparation validation pass. It uses artifact 13358716963 from successful rehearsal 41902249513, prepared at `cada77687ba76d495becbed3ff1a6559ea78d065`. The immutable ZIP/image identities are pinned in the dispatcher/publisher.

Only the existing preview EC2 target, OIDC/SSM operations role and `preview-server-operations` concurrency group are used. No new access, instance, provider key, quota, paid AI request or customer-content inspection is involved. Runtime must match the previous API/worker image 6370a6ed... and closed inventory/B2B gates; drift stops publication.

Preparation verifies the ZIP, internal image archive, source, both image IDs, five Prisma models and compiled module digests. Existing migration history/checksums and saved-photo matching fields must be intact, the five catalog/B2B tables must be absent, and only the two reviewed additive migrations may be pending. A nonempty paid embedding queue or un-restored prior test window stops the action. No service is stopped before these checks pass.

API and worker retain their own original Compose sources, host/security configuration and environment. Only their image changes; the API additionally receives exactly MVP_INVENTORY_ENABLED=true and MVP_B2B_ENABLED=true. Unrelated services and all other environment values must remain equal. After a controlled stop, both migrations apply before the new worker is verified and the new API starts with those two flags. Health, CORS, compiled model/module identities, worker continuity and unauthenticated 401 denial for visual/inventory/B2B reads must pass.

Before candidate API execution, original API and worker may be restored. Once the candidate API could accept writes, an error restores the prior API/configuration and retains the new compatible privacy worker. New tables are never dropped. A migrated/interrupted/rollback-needed state cannot be blindly replayed. Only a still-unchanged failed preparation may resume after revalidating its original inputs and complete artifact bytes.

The script does not insert real products/suppliers, create quote requests, consume stock, charge money or trigger TestFlight. A combined internal phone build follows verified server delivery. Browser gateway publication is not part of this API/worker update. Full commerce, physical-device/product quality, privacy policy/erasure/recovery and overall Stage 33 acceptance remain separate.
