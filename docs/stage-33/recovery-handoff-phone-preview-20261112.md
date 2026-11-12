# Recovery handoff phone preview — 2026-11-12

This change adds a self-contained Turkish phone interface for reviewing the protected key handoff. It is an internal development preview. It does not deploy a page, open a receiver, access AWS, accept a live backup context, or enable real recovery key intake.

## Two explicit builds

```sh
python3 infra/operations/build-recovery-handoff-ui.py
python3 infra/operations/build-recovery-handoff-ui.py --build-preview /new/path/review.html
python3 infra/operations/build-recovery-handoff-ui.py --build-synthetic-fixture-preview /new/path/synthetic.html
```

The default command takes no action. Review mode cannot enable private input. The second build can exercise encryption only after a public challenge and independently authenticated SHA256 pin match, the context says `SYNTHETIC_ONLY`, and the operator acknowledges generated test material. There is no query parameter or builder option to enable live intake. Output creation is exclusive, mode 0600, and deterministic. Never choose an owner recovery key in either preview.

## Flow and handling

The interface reviews the bounded public challenge before reading a selected private file. The existing Web Crypto core then creates an RSA-OAEP-SHA256/AES-256-GCM capsule bound to the complete challenge. Only that encrypted capsule is downloadable. Reset, public-input changes, page exit, and expiry clear selections and password fields and revoke any download URL. An epoch check prevents a late async file read from recreating output after reset. Browser buffers are best-effort cleared; this is not a memory-zeroization guarantee.

The page contains its own script and style. A CSP permits only their exact SHA256 hashes, blocks connections and external content, and does not allow unsafe-inline or eval. No telemetry, service worker, storage, remote fonts, or form submission is included. The builder and UI share the same challenge-review implementation as the existing wrapping core.

## Verification and limits

Four builder tests cover the default mode, exact CSP bodies, explicit synthetic switch, deterministic output, and refusal to overwrite files or follow an output symlink. The browser runner uses newly generated keys/certificates and a stdio-only fixture receiver; its host-check patch is limited to that fixture. It checks review-only behavior, wrong pins, rejected live metadata, ciphertext download and receiver equivalence, descriptor closure, reset races, expiry, public-input invalidation, CSP blocking, empty storage, and dark/light layouts at 320, 390, and 1024 pixels. CI runs Chromium and WebKit in a pinned Playwright image. Shared-core changes also run the existing 13 protected-handoff boundary tests.

WebKit automation does not prove physical iPhone/Safari behavior. The preview does not authenticate a host, distribute a trusted page, establish an independent owner communication channel, or provide independent security review. The custom capsule format is still subject to that review. Owner encrypted-package authentication, controlled host planning, trusted challenge delivery, physical phone acceptance, and an actual isolated restore remain separate gates. Real restore readiness remains false.
