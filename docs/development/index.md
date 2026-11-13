# Development

Run Seatbit locally with demo data, then read [Architecture](architecture.md) for how the code is laid out. To get a change merged, see [Contributing](../contributing/index.md).

## Requirements

- Node.js 22 and npm
- Python 3 for the docs preview (optional)
- Chromium via Playwright for the screenshot script (optional, `npx playwright install chromium`)

## Local setup

```sh
git clone https://github.com/bitsandbricks-ch/seatbit.git
cd seatbit
npm install
cp .env.example .env.local     # set ALLOW_EMAIL_LOGIN=1
npm run seed                   # demo clan, events, people
npm run dev
```

Open <http://localhost:3000>. The database is `./data/lan.db`; delete it to start over. Without seeding, the first account you create becomes platform admin.

### Demo data

`npm run seed` fills a fresh database with the clan *Pixel Pirates*, three events, 17 members and a guest: the same data the [screenshots](screenshots.md) use. Sign in with email and password (needs `ALLOW_EMAIL_LOGIN=1`):

| User | Role | Password |
| --- | --- | --- |
| `alex@example.com` | Platform admin, clan admin, lead | `seatbit-demo` |
| `anna@example.com` | Member | `seatbit-demo` |

### Discord locally

Discord login and the bot need a Discord application (see [Discord app and bot](../installation/discord.md)). The bot's interactions endpoint must be reachable over HTTPS, so use a tunnel (e.g. `cloudflared` or `ngrok`) and set `BETTER_AUTH_URL` to its URL. For most work, email login is enough.

### Email locally

Without `SMTP_HOST`, emails are printed to the server log.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Dev server with hot reload. |
| `npm run build`, `npm start` | Production build and server. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | Next.js route types + TypeScript. |
| `npm run seed` | Demo data. |
| `npm run screenshots` | Render every page on demo data. See [Screenshots](screenshots.md). |
| `npm run db:generate` | New migration from `src/db/schema.ts`. See [Database](database.md). |
| `npm run admin -- <cmd>` | [Admin CLI](../installation/operations.md#admin-cli) on the local database. |
| `npm run discord:register` | Register the slash commands (also a button in the admin UI). |
| `mkdocs serve` | Docs preview at <http://localhost:8000> (`pip install -r docs/requirements.txt`). |

Before you push, `npm run lint`, `npm run typecheck` and `npm run build` must pass, plus `mkdocs build --strict` when you touched the docs.
