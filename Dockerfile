# ╔══════════════════════════════════════════════════════════════╗
# ║  Dockerfile — 忆见 Memory AI V5 生产镜像                   ║
# ║  Multi-stage: dependencies → builder → runner               ║
# ╚══════════════════════════════════════════════════════════════╝

# ── Stage 1: Dependencies ──────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production && \
    cp -R node_modules /prod_modules && \
    npm ci

# ── Stage 2: Builder ───────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm run package:standalone-rc

# ── Stage 3: Runner ────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=127.0.0.1
ENV AUTH_PROXY_LOOPBACK_ONLY=true

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the manifest-directed standalone runtime without rewriting its layout.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone-rc ./

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "run-standalone-from-manifest.cjs"]
