# syntax=docker/dockerfile:1

# ---------- base ----------
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---------- deps: installs node_modules (includes prisma generate via postinstall) ----------
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ---------- builder: builds Next ----------
FROM deps AS builder
COPY . .
RUN npm run build

# ---------- migrator: applies migrations and the seed, then exits ----------
FROM deps AS migrator
# The seed demo reuses the app's pure calculations (totals, CUIT).
COPY src/lib ./src/lib
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

# ---------- runner: final image, only the standalone output ----------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Product images. In docker-compose it is a volume: when it is created, Docker copies
# this empty directory with its owner, so the nextjs user can write to it.
ENV UPLOADS_DIR=/app/uploads
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
