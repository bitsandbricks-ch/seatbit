# syntax=docker/dockerfile:1
# Seatbit container image: Next.js standalone server + SQLite (better-sqlite3).
# Data lives in /data (mount a volume there).

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# better-sqlite3 compiles its native addon on install (node-gyp), so the deps
# stage needs build tools. They don't end up in the final image.
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
# Only the manifests first, so this layer is reused until dependencies change.
COPY package.json package-lock.json ./
# Cache mounts keep npm's download cache and Next's build cache between local
# builds (in CI the registry layer cache does the heavy lifting).
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Commit for the footer (.git isn't in the build context). Declared after COPY
# so a new value only reruns the build step, which reruns anyway.
ARG GIT_COMMIT=""
ENV GIT_COMMIT=$GIT_COMMIT
RUN --mount=type=cache,target=/app/.next/cache npm run build

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
# Migrations run on startup from ./drizzle; backup script for the CronJob;
# admin CLI (kubectl exec deploy/seatbit -- node scripts/admin.mjs help).
COPY --from=build --chown=seatbit:seatbit /app/drizzle ./drizzle
# Changelog entries for the "What's new" page and the upgrade notice (read at runtime).
COPY --from=build --chown=seatbit:seatbit /app/changelog ./changelog
COPY --from=build --chown=seatbit:seatbit /app/scripts/backup.mjs /app/scripts/admin.mjs ./scripts/
USER seatbit
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
