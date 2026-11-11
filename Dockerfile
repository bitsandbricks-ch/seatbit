# syntax=docker/dockerfile:1
# Seatbit container image: Next.js standalone server + SQLite (better-sqlite3).
# Data lives in /data (mount a volume there).

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# better-sqlite3 ships prebuilt binaries for linux x64/arm64, so no compiler is needed.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/seatbit.db \
    BACKUP_DIR=/backups \
    TZ=Europe/Zurich
RUN groupadd --system --gid 1001 seatbit \
  && useradd --system --uid 1001 --gid seatbit --home /app seatbit \
  && mkdir -p /data /backups && chown seatbit:seatbit /data /backups
COPY --from=build --chown=seatbit:seatbit /app/.next/standalone ./
COPY --from=build --chown=seatbit:seatbit /app/.next/static ./.next/static
COPY --from=build --chown=seatbit:seatbit /app/public ./public
# Migrations run on startup from ./drizzle; backup script for the CronJob.
COPY --from=build --chown=seatbit:seatbit /app/drizzle ./drizzle
COPY --from=build --chown=seatbit:seatbit /app/scripts/backup.mjs ./scripts/backup.mjs
USER seatbit
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
