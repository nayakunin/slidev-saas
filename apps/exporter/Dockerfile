FROM node:24-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

FROM base AS pruner

COPY . .

RUN pnpm dlx turbo@2.9.5 prune @app/exporter --docker

FROM base AS installer

COPY --from=pruner /app/out/json/ .

RUN pnpm install --frozen-lockfile

FROM base AS builder

COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .

RUN pnpm --filter @app/exporter build

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN corepack enable

RUN apt-get update && apt-get install -y --no-install-recommends \
  chromium \
  fonts-noto \
  fonts-noto-cjk \
  fonts-noto-color-emoji \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=pruner /app/out/json/ .

RUN pnpm install --prod --frozen-lockfile

COPY --from=pruner /app/out/full/ .
COPY --from=builder /app/apps/exporter/dist ./apps/exporter/dist

CMD ["node", "apps/exporter/dist/server.mjs"]
