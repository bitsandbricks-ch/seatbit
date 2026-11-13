# Architecture

Seatbit is one Next.js app: pages, server actions, API routes, the Discord bot and the reminder scheduler all run in a single Node.js process with a SQLite database.

## Stack

| | |
| --- | --- |
| **Framework** | Next.js (App Router, React server components, server actions), standalone output |
| **Auth** | Better Auth: Discord OAuth (email/password only for development) |
| **Database** | SQLite via better-sqlite3, Drizzle ORM, migrations applied on startup |
| **UI** | Tailwind CSS with brand tokens (`brand/tokens.css`) |
| **Email** | Nodemailer over SMTP, admin-editable templates |
| **Discord** | HTTP interactions endpoint inside the app; REST calls for posts and DMs (no gateway connection) |
| **Payments** | Stripe Checkout and customer portal (optional) |

!!! warning "Recent Next.js"
    Seatbit uses a recent Next.js with breaking changes against older versions. Read the guides in `node_modules/next/dist/docs/` before using an API you aren't sure about.

## Layout

```text
src/
  app/             routes (App Router) and server actions (*-actions.ts)
    api/           auth, Discord interactions, Stripe webhook, cron, health
    lans/[id]/     event page and manage view
    clans/[slug]/  clan page, settings, members, LAN types, stats
    admin/         platform admin, settings, audit log
  components/      React components; ui.tsx and tabs.tsx are the shared building blocks
  db/              schema.ts (Drizzle) and the database connection
  lib/             server logic: seating, reminders, discord, mail, settings, audit ...
  instrumentation.ts  starts the reminder and scheduled-publish loop
drizzle/           SQL migrations and snapshots
scripts/           seed, screenshots, admin CLI, backup
brand/             logo, tokens, brand guide
docs/              this site (MkDocs)
```

## Key pieces

| Module | |
| --- | --- |
| `src/lib/settings.ts` | Platform settings: DB value, then env var, then default. Secrets encrypted with AES-256-GCM. |
| `src/lib/upgrade.ts` | After a new version starts: registers changed slash commands, notifies platform admins once, `onUpgrade()` hook for other channels. |
| `src/lib/lans.ts`, `checklist.ts` | Events, attendance, waitlist and the member checklist. |
| `src/lib/seating.ts`, `seat-layout.ts`, `seat-labels.ts` | Seat block parsing, the auto planner and the seat map layout. |
| `src/lib/reminders.ts` | Due reminders, deduplicated via `reminder_log`. |
| `src/lib/missing.ts` | Who's missing and nudges. |
| `src/lib/notify.ts`, `mail.ts`, `discord.ts` | Sending to a user by email and Discord DM. |
| `src/lib/discord-commands.ts`, `member-updates.ts` | Member slash commands (`/coming`, `/status`, `/ticket`, `/nick`, `/wish`); the member updates they share with the website. |
| `src/lib/announce.ts` | The Discord event announcement with its live attendee list. |
| `src/lib/audit.ts` | Audit log entries. |
| `src/lib/billing.ts` | Stripe supporter subscriptions. |
| `src/lib/names.ts`, `format.ts` | `personLabel` (*Anna "Nova" Frei*) and Swiss 24h date formatting. |

## Languages

The UI is in English and German, without locale prefixes in the URL. `src/i18n/server.ts` picks the language per request: the user's saved `locale`, then the `seatbit-locale` cookie, then `Accept-Language`, then the *Default language* setting.

- Texts are in `src/i18n/messages/en.ts` and `de.ts`. `de.ts` is typed as the English messages, so a missing or extra key fails the type check.
- Server components: `const t = await getT()`. Client components: `const t = useT()` (the root layout provides the language). Both give `t("event.coming")`, `t("home.seatsFree", { count })` and `t.rich(...)` for placeholders that are React nodes.
- `{name}` is a placeholder; a message written as `{ one, other }` picks by `count`.
- Dates: pass `t.locale` to the formatters in `src/lib/format.ts` (weekday names change, the format doesn't).
- German uses Swiss spelling: "ss", never "ß". The per-event role is "Lead" in both languages.
- Mails and Discord messages use `localeOf(user)`: the saved language, else the instance default. Posts in a clan's Discord channels use `clanLocale(clan)`. Mail templates are stored per language (`mailtpl.<id>.<part>` for English, `.de` appended for German).
- Server actions translate what reaches people: `throw await err("errors.joinFirst")` and `{ error: await tr("errors.pickClan") }` from `src/i18n/server.ts`. Pure guards nobody hits through the UI ("Bad status") stay English.
- `npm run check:i18n` (also in CI) parses every `.tsx` and fails on JSX text, user-facing attributes (`title`, `label`, `placeholder`, ...) and `confirm()` text that don't go through `t()`. Brand names and ALL-CAPS words are allowed; `// i18n-ignore` marks a deliberate exception, `i18n-ignore-file` a file written once per language (the legal pages, `TermsEn` / `TermsDe`).

## Background work

`src/instrumentation.ts` runs inside the server process: every minute it publishes scheduled drafts, and every *Reminder check interval* minutes it sends due reminders. Setting the interval to `0` turns that off; `/api/cron/reminders` (with `CRON_SECRET`) does the same from outside.

## Rules

- Server code that touches the database must not be imported by client components (`"use client"`); `better-sqlite3` breaks the client bundle.
- Instance-wide options are platform settings, not constants or env-only variables. See [Code guidelines](../contributing/guidelines.md).
