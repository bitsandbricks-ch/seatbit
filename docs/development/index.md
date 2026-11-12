# Contributing

Seatbit is open source and contributions are welcome. The full guide is [CONTRIBUTING.md](https://github.com/bitsandbricks-ch/seatbit/blob/main/CONTRIBUTING.md); rules for AI coding agents are in [AGENTS.md](https://github.com/bitsandbricks-ch/seatbit/blob/main/AGENTS.md).

## Stack

Next.js (App Router, server actions) · Better Auth · SQLite with Drizzle ORM · Tailwind CSS · Nodemailer. The Discord bot is an HTTP interactions endpoint inside the app.

## Run it locally

```sh
npm install
cp .env.example .env.local     # set ALLOW_EMAIL_LOGIN=1
npm run seed                   # demo clan, events, people
npm run dev
```

Sign in at http://localhost:3000 as `alex@example.com` (admin and orga) or `anna@example.com` (member) with the password `seatbit-demo`.

## Checks

| Command | |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build |
| `npm run screenshots` | Renders every page on demo data (also the CI smoke test) |
| `mkdocs serve` | Docs preview at http://localhost:8000 (`pip install -r docs/requirements.txt`) |

## CI

| Workflow | When | What |
| --- | --- | --- |
| **CI** | every pull request and push to `main` | lint, typecheck, build, render every page; the screenshots are attached to the run |
| **Docs** | every pull request; `main` publishes | `mkdocs build --strict` (broken links fail), deploy to GitHub Pages |
| **Container image** | pull requests build; `main` and tags push | multi-arch image to GHCR |
| **Screenshots** | push to `main` touching the UI | regenerate screenshots and open a pull request when they changed |

## Database changes

Edit `src/db/schema.ts`, run `npm run db:generate`, and check that the new migration in `drizzle/` has the next free number. It is applied on the next start.
