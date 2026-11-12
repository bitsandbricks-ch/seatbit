# Docker

Images are built for every change on `main` and published to the GitHub Container Registry for amd64 and arm64:

| Tag | Use |
| --- | --- |
| `ghcr.io/bitsandbricks-ch/seatbit:main` | Latest build of `main`. |
| `:main-<UTC timestamp>-<sha>` | Every main build, sortable (for automatic updates, e.g. Flux image policies). |
| `:sha-<short sha>` | A specific commit. |
| `:1.2.3` | Releases, when there are tags. |

## docker run

```sh
docker run -d --name seatbit -p 3000:3000 \
  -v seatbit-data:/data \
  -e BETTER_AUTH_URL=https://seatbit.example.com \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  -e DISCORD_CLIENT_ID=1234567890123456789 \
  -e DISCORD_CLIENT_SECRET=your-client-secret \
  -e TZ=Europe/Zurich \
  ghcr.io/bitsandbricks-ch/seatbit:main
```

Keep the `BETTER_AUTH_SECRET` you generated: sessions and saved secrets depend on it.

## Docker Compose

```yaml title="compose.yaml"
services:
  seatbit:
    image: ghcr.io/bitsandbricks-ch/seatbit:main
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"   # put your HTTPS reverse proxy in front
    volumes:
      - ./data:/data
      - ./backups:/backups
    environment:
      BETTER_AUTH_URL: https://seatbit.example.com
      BETTER_AUTH_SECRET: change-me   # openssl rand -base64 32
      DISCORD_CLIENT_ID: "1234567890123456789"
      DISCORD_CLIENT_SECRET: your-client-secret
      TZ: Europe/Zurich
```

The container runs as uid/gid **1001**: make sure `./data` and `./backups` belong to it (`sudo chown -R 1001:1001 data backups`).

## Good to know

- The SQLite database is `/data/seatbit.db`; uploaded avatars are in `/data/uploads`. Keep `/data` on a volume. Run **one** instance only (SQLite).
- Migrations run automatically on start.
- Health check: `GET /api/health` returns `{"ok":true}`.
- Works with a read-only root filesystem if `/tmp` and `/app/.next/cache` are writable.
- Behind a reverse proxy, forward the `Host` header and `X-Forwarded-Proto`; `BETTER_AUTH_URL` must be the public HTTPS URL.
- All variables: [Configuration](configuration.md). Next: [Discord app and bot](discord.md).

## Without Docker

```sh
git clone https://github.com/bitsandbricks-ch/seatbit.git && cd seatbit
npm ci && npm run build
cp .env.example .env.local   # fill in the values
node .next/standalone/server.js
```

Node.js 22 is required. Run it as a service (e.g. systemd) and keep `DATABASE_PATH` on persistent storage. Copy `.next/static` and `public` next to the standalone server as the [Dockerfile](https://github.com/bitsandbricks-ch/seatbit/blob/main/Dockerfile) does.
