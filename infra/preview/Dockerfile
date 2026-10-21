# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* && npm install -g pnpm@10.28.1
WORKDIR /repo
COPY . .
ENV DATABASE_URL=postgresql://unused:unused@127.0.0.1:5432/not_connected
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @beauty-platform/api prisma:generate \
    && pnpm --filter @beauty-platform/types build \
    && pnpm --filter @beauty-platform/api build
RUN npm ci --omit=dev --prefix /repo/infra/preview/bootstrap

FROM builder AS api-bundle
RUN pnpm --filter @beauty-platform/api --prod deploy --legacy --frozen-lockfile /out/api \
    && mkdir -p /out/api/dist /out/api/prisma /out/api/node_modules/.prisma/client \
    && cp -a apps/api/dist/. /out/api/dist/ \
    && cp -a apps/api/prisma/. /out/api/prisma/ \
    && node -e 'const f=require("node:fs"),p=require("node:path");const d=p.dirname(f.realpathSync(require.resolve("@prisma/client",{paths:["/repo/apps/api"]})));const c=p.dirname(require.resolve(".prisma/client/default",{paths:[d]}));f.cpSync(c,"/out/api/node_modules/.prisma/client",{recursive:true})' \
    && cd /out/api && node -e 'require("@prisma/client");require("sharp");require("./dist/mvp/providers/private-photo-store.js")'

FROM node:24-bookworm-slim AS api
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /application
COPY --from=api-bundle --chown=node:node /out/api/ ./
COPY --from=builder --chown=node:node /repo/infra/preview/bootstrap/ /bootstrap/
USER node
EXPOSE 3001
ENTRYPOINT ["node", "/bootstrap/entrypoint.cjs"]
CMD ["api"]

FROM builder AS migrate
WORKDIR /repo/apps/api
USER node
ENTRYPOINT ["node", "/repo/infra/preview/bootstrap/entrypoint.cjs"]
CMD ["migrate"]

FROM builder AS admin-build
ARG ADMIN_API_URL
RUN test -n "$ADMIN_API_URL"
ENV NEXT_PUBLIC_API_URL=$ADMIN_API_URL
RUN pnpm --filter @beauty-platform/admin build \
    && pnpm --filter @beauty-platform/admin --prod deploy --legacy --frozen-lockfile /out/admin \
    && mkdir -p /out/admin/.next && cp -a apps/admin/.next/. /out/admin/.next/

FROM node:24-bookworm-slim AS admin
ENV NODE_ENV=production
WORKDIR /application
COPY --from=admin-build --chown=node:node /out/admin/ ./
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]

FROM builder AS web-build
ARG WEB_API_URL
RUN test -n "$WEB_API_URL"
ENV EXPO_PUBLIC_API_URL=$WEB_API_URL
RUN pnpm --filter @beauty-platform/mobile build

FROM caddy:2-alpine AS gateway
COPY --from=web-build /repo/apps/mobile/dist/ /srv/web/
COPY infra/preview/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
