# ╔══════════════════════════════════════════════════════════════╗
# ║  Dockerfile — 忆见 Memory AI V5 生产镜像                   ║
# ║  Multi-stage: dependencies → builder → runner               ║
# ╚══════════════════════════════════════════════════════════════╝

# ── Stage 1: Dependencies ──────────────────────────────────────
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

RUN test "$(node --version)" = "v20.20.2" && test "$(npm --version)" = "10.8.2"

COPY package.json package-lock.json* ./
RUN npm ci --only=production && \
    cp -R node_modules /prod_modules && \
    npm ci

# ── Stage 2: Builder ───────────────────────────────────────────
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder
WORKDIR /app

RUN test "$(node --version)" = "v20.20.2" && test "$(npm --version)" = "10.8.2"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm run package:standalone-rc

# ── Stage 3: Runner ────────────────────────────────────────────
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner
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

# This target is intentionally separate from the runtime image. It exports
# deterministic release evidence when invoked by scripts/ops/export-production-candidate-evidence.sh.
FROM builder AS production-candidate-evidence
ARG PRODUCTION_CANDIDATE_SOURCE_COMMIT
ARG PRODUCTION_CANDIDATE_SOURCE_TREE
ENV PRODUCTION_CANDIDATE_SOURCE_COMMIT=$PRODUCTION_CANDIDATE_SOURCE_COMMIT
ENV PRODUCTION_CANDIDATE_SOURCE_TREE=$PRODUCTION_CANDIDATE_SOURCE_TREE
RUN npm run generate:production-candidate-evidence -- /candidate-evidence && \
    npm sbom --sbom-format=spdx --sbom-type=application > /candidate-evidence/sbom.spdx.json && \
    cd /candidate-evidence && sha256sum manifest.json provenance.intoto.json sbom.spdx.json > SHA256SUMS

FROM scratch AS production-candidate-evidence-export
COPY --from=production-candidate-evidence /candidate-evidence /
