# Code guidelines

The rules every change follows, for humans and [AI agents](agents.md) alike.

## Code

- **TypeScript**, React server components and server actions (Next.js App Router).
- **Recent Next.js:** read `node_modules/next/dist/docs/` before using an API you aren't sure about. Heed deprecation notices.
- **Server and client:** code that touches the database must not be imported by `"use client"` components.
- **Comments** are short and explain why, not what.
- **No secrets** in code, commits, screenshots, logs or docs. Use example values (`example.com`, `1234567890123456789`).

## Settings and self-hosting

- Instance-wide options go into `SETTINGS` in `src/lib/settings.ts` (admin UI with env var fallback), not hard-coded constants or env-only variables. Only startup values (`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `DATABASE_PATH`, `TZ`) stay env-only.
- New settings are documented in [Configuration](../installation/configuration.md).
- Never hard-code anything about one particular instance (operator, address, domain, Discord server, clan). Use settings with neutral defaults.
- Keep the **"Powered by bitsandbricks.ch"** and **"Source"** footer links (AGPL additional terms).

## UI

- **Mobile-first** with a good desktop layout. Test both.
- Use the shared components in `src/components/ui.tsx` (`Page`, `PageHeader`, `Card`, `Notice`, ...) and `src/components/tabs.tsx`.
- **Colours** only via brand tokens (`brand/tokens.css`), never raw values.
- Every page uses the root layout width (`max-w-7xl`); don't add your own max-width.
- **Texts** go through `t()` with an English and a German entry (`src/i18n/messages/`), never as literals in the page. German uses "ss", not "ß". See [Architecture](../development/architecture.md#languages).

## Formatting

| | |
| --- | --- |
| **Dates** | Always 24h, Swiss style (*Sat 14.11.2026, 18:00*) via `src/lib/format.ts`. |
| **Date inputs** | `src/components/date-time-picker.tsx`, never native `datetime-local`. |
| **People** | *Name "Nick" Surname* via `personLabel` in `src/lib/names.ts`; on member-facing pages use the clan's name display (`getNames(...).label`, `getDisplayNames`). Mark real accounts with `<Verified />`. |

## Database

Change `src/db/schema.ts`, run `npm run db:generate` and check the migration number. See [Database and migrations](../development/database.md).
