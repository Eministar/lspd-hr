# syntax=docker/dockerfile:1.7
# Multi-stage Dockerfile for LSPD HR Dashboard (Dokploy, docker compose, docker run).
#
# Sicherheit: Secrets (DISCORD_BOT_TOKEN, JWT_SECRET, DATABASE_URL, …) werden
# NICHT als ARG/ENV ins Image gebacken. Sie kommen ausschließlich zur Laufzeit
# als Container-Environment. Build-Argumente gibt es nur für öffentliche Werte,
# die Next.js beim Build in den Client-Code einsetzt (NEXT_PUBLIC_*).

ARG NODE_VERSION=22

# ─────────── Stage 1: deps ───────────
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --loglevel=error

# ─────────── Stage 2: builder ───────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Nur öffentliche Werte – werden in den Client-Bundle eingesetzt.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_GITHUB_URL
ARG NEXT_PUBLIC_BUILD_ID
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_GITHUB_URL=${NEXT_PUBLIC_GITHUB_URL} \
    NEXT_PUBLIC_BUILD_ID=${NEXT_PUBLIC_BUILD_ID} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# .git wird nur für die Build-ID (Commit-SHA) gebraucht und danach entfernt.
RUN --mount=type=cache,target=/app/.next/cache \
    npx prisma generate \
 && npm run build \
 && rm -rf .git node_modules/.cache

# ─────────── Stage 3: runner (production) ───────────
FROM node:${NODE_VERSION}-bookworm-slim AS runner
RUN apt-get update \
 && apt-get install -y --no-install-recommends gosu ca-certificates wget \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --home /app nextjs

# Komplettes Build-Ergebnis übernehmen: start.js erzeugt bei Bedarf den
# Prisma-Client neu und Hilfsskripte (Backup, Failover) laufen zur Laufzeit.
COPY --from=builder --chown=nextjs:nodejs /app ./
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Persistente/beschreibbare Verzeichnisse (in Dokploy als Volumes mounten).
RUN mkdir -p uploads config desktop-releases .backup .failover \
 && chown -R nextjs:nodejs uploads config desktop-releases .backup .failover

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/api/health" || exit 1

# Startet als root, korrigiert nur die Rechte gemounteter Volumes und
# wechselt dann auf den unprivilegierten User "nextjs".
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "start.js"]
