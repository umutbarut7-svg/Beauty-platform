# ORZELL launch blockers — Codex quota fallback (2026-11-20)

## Verified from repository default branch
- Root package manager: pnpm 10.28.1; Node >=22; build/lint/test/typecheck via Turborepo.
- API bootstrap: apps/api/src/main.ts reads loadRuntimeConfig(), requires JWT access/refresh secrets, enables helmet and CORS, and listens on config.port with host 0.0.0.0.
- apps/mobile/app.json currently contains Expo name "Beauty Platform", slug "beauty-platform", version "0.1.0". Do **not** infer this is the TestFlight build configuration.
- README documents authentication, business and booking architecture, but contains historical bootstrap status; do not treat it as a live deployment report.
- Existing GitHub issues #143–#146 describe integrations and universal-link requirements, not proof of shipped functionality.

## P0: Verify before changing production
1. Identify active mobile build configuration (EAS profiles, env overrides, bundle identifier, associated domains) and correlate with TestFlight build 1186.
2. Locate API deployment target and effective environment: domain, HTTPS, DNS, reverse proxy/load balancer, port, health endpoint and timeout telemetry. Never paste secrets into issues or logs.
3. Test DNS resolution, TLS handshake, /health and authenticated booking calls separately. Distinguish DNS failure, TLS failure, connection timeout, upstream 502/504, app timeout and API exception using timestamped evidence.
4. Confirm iOS Universal Links AASA endpoint at https://orzell.app/.well-known/apple-app-site-association and matching entitlements, only after establishing the actual app identifier. Confirm Android assetlinks separately.
5. Verify one complete real-device customer -> service -> availability -> booking -> business confirmation flow.
6. Run focused tenant isolation/auth and booking correctness tests plus minimal CI. Avoid repeated full-suite runs for unrelated changes.

## Safety and scope
- No changes to default branch, DNS, AWS resources, secrets, payment settings or production deployment without validated evidence and required user approval.
- Prefer narrow patches on this branch, review diff, run relevant tests, then open PR.
- Defer cosmetic adjustments, new integrations and nonblocking feature work until the launch-critical path is usable.
- Keep original O/Z logo and approved light/dark themes.
- Codex quota does not prevent GitHub file review, but connector access alone cannot prove runtime health or TestFlight acceptance.

## Current blockers (not yet verified)
- Actual API timeout root cause.
- Effective DNS/TLS and deployment configuration.
- Build 1186 source commit and device test results.
- Existing CI run status.
