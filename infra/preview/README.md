# Persistent preview package — not deployed

This package targets an explicitly approved, low-load preview in `eu-north-1`.
It is not a production/high-availability deployment. The application source tested
so far is `123e7339e2ab2a9e8e94f391a8431b73afc28efe`.

## Components

- A 2 GiB x86 EC2 `t3.small` with Standard CPU credits and an encrypted 30 GiB gp3
  root disk. No SSH port; use Systems Manager for administration.
- PostgreSQL/pgvector with a persistent Docker volume; no public database port.
- Separate API and durable worker processes from the same production-dependency
  image. With rollout closed the worker still runs the privacy-cleanup loop.
- Expo web assets and a Next.js operator process behind Caddy HTTPS, with two DNS
  hostnames. The `/api` prefix is removed by the proxy before reaching Nest.
- An immutable-tag ECR repository for the approved images and an instance IAM
  role scoped to the repository, four named SSM parameters and the photo prefix.
  Containers use IMDSv2; the hop limit of two supports the container boundary.

All product, AI, semantic and policy-review flags remain closed in `compose.yml`.
The preview is initially for synthetic data. Before real customer use, the product
identity, notices, independent verification policy, real-photo/native acceptance,
backup/erasure policy and operating procedures still require completion.

## Secret binding

`bootstrap/entrypoint.cjs` retrieves only the SecureString parameters required by
the selected process. The existing OpenAI key is read only if AI is explicitly
enabled. OpenAI and JWT plaintext stay in process memory, not image layers,
Compose configuration, user data, build arguments, artifacts or secret files.

The database password is shared with PostgreSQL through a dedicated Docker tmpfs
volume; it is not a persistent disk file. Parameter names are fixed in the loader.
The `PREVIEW_CI_FIXTURE` path is allowed only with `NODE_ENV=test` and contains
clearly disposable values. It must never be enabled for the persistent preview.
Database and JWT parameters must be provisioned separately as SecureStrings after
cost approval. Do not rotate the DB parameter without also updating PostgreSQL's
role password and validating the restart procedure.

## Build and validate before deployment

Use `Dockerfile` targets `api`, `migrate`, `admin`, and `gateway`. Both frontends
require their final public HTTPS API URL at build time:

```bash
docker build -f infra/preview/Dockerfile --target api -t beauty-preview-api .
docker build -f infra/preview/Dockerfile --target migrate -t beauty-preview-migrate .
docker build -f infra/preview/Dockerfile --target admin --build-arg ADMIN_API_URL=https://ops.example.test/api -t beauty-preview-admin .
docker build -f infra/preview/Dockerfile --target gateway --build-arg WEB_API_URL=https://preview.example.test/api -t beauty-preview-gateway .
```

The pnpm workspace install/deploy and bootstrap npm install use their lockfiles.
Prisma's generated client is explicitly included in the API runtime. API and
operator runtime processes run as the Node user. CPU/heap/container memory limits
are preview defaults, not a performance/capacity guarantee.

Before applying the foundation template, obtain the owner's approval of the
monthly cost and final two DNS names. Then validate the CloudFormation change
set, provision the new runtime parameters, build/test/push images to the returned
ECR URI, record immutable image digests, and point both DNS names at the returned
IPv4 address. Install Docker/Compose on the instance through SSM and start the
stack with the approved image digests. Compose starts the secret initializer,
healthy database, successful migrations, API, worker and gateway in dependency
order. The operator needs independent platform-reviewer setup; do not substitute
a business member or enable unreviewed policy flags.

This preparation does not execute those provisioning or deployment steps.

## Data and cost boundary

The root disk persists through normal stop/start. Terminating the instance deletes
its root disk and the preview database; teardown requires an explicit owner
instruction. No automatic database snapshots are configured: analysis content
must not silently survive its approved lifetime in backups. This preview is not a
backup/restore or production-data acceptance claim. Stopping EC2 does not remove
disk, public IPv4 or registry storage charges.

AWS's Stockholm price list published 15 October 2026 lists Linux/shared/On-Demand
`t3.small` at USD 0.0216/hour and gp3 at USD 0.0836/GiB-month. At 730 hours and
30 GiB, compute plus disk is USD 18.276/month. One public IPv4 at USD 0.005/hour
adds USD 3.65, for a **USD 21.926/month base estimate**. This excludes tax, domains,
ECR storage, S3 storage/requests, network transfer and OpenAI usage. Free-tier or
promotional credits are not assumed. The current USD 5 AWS budget is an alert,
not an infrastructure spending cap, and must be reviewed before deployment.

Sources checked 21 October 2026:

- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/eu-north-1/index.json
- https://aws.amazon.com/vpc/pricing/
- https://pnpm.io/10.x/cli/deploy
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html

The container build/stack gate and the foundation lint gate must pass before
this package is called validated. The foundation still needs a live AWS change
set and the running service needs HTTPS, restart, migration, worker and resource
measurement checks after the owner authorizes provisioning.
