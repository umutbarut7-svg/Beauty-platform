# Same-plan matching refresh: release preparation

Exact application candidate: `7b995e79c397d46c18e6095648d3c6c147ff0287`, PR #82.
The API/privacy worker currently run the 4 November compatible-service image
`sha256:d2b7ae718ad2ad78aa2ce4700646b4e37f3b861f0b39362e47af47219f11b5b6`.
No source-photo, matching provider or catalog update is run by this rehearsal.

Build API and reproduction migration images from the pinned application using
the unchanged existing Dockerfile. Run on an internal network with synthetic
PostgreSQL, AI/semantic/storage/Redis disabled and no cloud identity.
Verify existing nullable matching fields, exactly eight compiled module hashes,
compatibility assertions, the new refresh method and its actual DTO validation,
health, private-route rejection and zero-restart privacy worker. No new schema
migration is included. Both processes must return the same synthetic evidence.

Preserve images, checksums and fixed metadata for three days. Record the actual
artifact/run/source/digests and completed candidate CI before bounded code-only
publication. The previous one-time operation files remain unchanged.
Do not claim source/phone/provider acceptance from isolated compilation.
Stage 33 remains NOT PASS.
