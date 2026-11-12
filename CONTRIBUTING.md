# Contributing to Seatbit

Thanks for helping! Seatbit is a small project, so a short issue or pull request is always welcome: bug reports, ideas, docs fixes and code. The same guide, with more detail on the stack and the pull request flow, is in the docs under [Development](https://bitsandbricks-ch.github.io/seatbit/development/) and [Contributing](https://bitsandbricks-ch.github.io/seatbit/contributing/).

## Before you start

- **Bugs and ideas:** open an [issue](https://github.com/bitsandbricks-ch/seatbit/issues/new/choose) first, so we can agree on the approach before you spend time on code.
- **Security problems:** please don't open a public issue. See [SECURITY.md](SECURITY.md).
- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

You need Node.js 22 and npm.

```sh
git clone https://github.com/bitsandbricks-ch/seatbit.git
cd seatbit
npm install
cp .env.example .env.local      # set ALLOW_EMAIL_LOGIN=1 to sign in without Discord
npm run dev
```

Open http://localhost:3000. The first account becomes the platform admin. The SQLite database is created in `./data/lan.db`; delete it to start over.

**Demo data:** `npm run seed` fills a fresh database with a demo clan, an upcoming LAN, attendees, seats, travel offers and games (the same data the screenshots use). All demo users have the password `seatbit-demo`, e.g. `alex@example.com` (admin and orga) or `anna@example.com` (member). Use it with `ALLOW_EMAIL_LOGIN=1`.

## Making changes

- **Code style:** TypeScript, React server components and server actions (Next.js App Router). Run `npm run lint`, `npm run typecheck` and `npm run build` before you push. Note that this is a recent Next.js version; read `node_modules/next/dist/docs/` when an API looks unfamiliar (see `AGENTS.md`).
- **UI:** mobile-first, but also check the desktop layout. Use the shared components in `src/components/ui.tsx` and the brand tokens (`brand/tokens.css`), never raw colours. Dates are always 24h, Swiss style ("Sat 14.11.2026, 18:00"), via `src/lib/format.ts`.
- **Database:** edit `src/db/schema.ts`, then `npm run db:generate`. Migrations in `drizzle/` run on startup. Check the file number: it must be the next free one.
- **Settings:** a new instance-wide setting goes into `SETTINGS` in `src/lib/settings.ts`, so admins can change it in the UI and it can still be set by env var.
- **Docs:** user-facing changes need a docs update in `docs/` (MkDocs: Features, Installation, Development, Contributing). Preview with `pip install -r docs/requirements.txt && mkdocs serve`. See [Writing docs](docs/contributing/docs.md).
- **Screenshots:** they are generated, don't edit them by hand. `npm run screenshots` rebuilds them from the demo data (see [Screenshots](docs/development/screenshots.md)). After a merge to `main`, CI regenerates them and opens a pull request if anything changed. If you add a page, add it to `scripts/screenshots.ts`.

## Pull requests

- Keep a pull request to one topic and describe what changed and why. Add screenshots for UI changes.
- Fill in the checklist of the pull request template.
- CI builds the container image and the docs for every pull request; both must pass.

## License

Seatbit is licensed under the [GNU AGPL-3.0](LICENSE) with the additional terms in [NOTICE.md](NOTICE.md). By contributing, you agree that your contribution is licensed under the same terms.
