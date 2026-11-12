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
| `src/lib/lans.ts`, `checklist.ts` | Events, attendance, waitlist and the member checklist. |
| `src/lib/seating.ts`, `seat-layout.ts`, `seat-labels.ts` | Seat block parsing, the auto planner and the seat map layout. |
| `src/lib/reminders.ts` | Due reminders, deduplicated via `reminder_log`. |
| `src/lib/missing.ts` | Who's missing and nudges. |
| `src/lib/notify.ts`, `mail.ts`, `discord.ts` | Sending to a user by email and Discord DM. |
| `src/lib/announce.ts` | The Discord event announcement with its live attendee list. |
| `src/lib/audit.ts` | Audit log entries. |
| `src/lib/billing.ts` | Stripe supporter subscriptions. |
| `src/lib/names.ts`, `format.ts` | `personLabel` (*Anna "Nova" Frei*) and Swiss 24h date formatting. |

## Background work

`src/instrumentation.ts` runs inside the server process: every minute it publishes scheduled drafts, and every *Reminder check interval* minutes it sends due reminders. Setting the interval to `0` turns that off; `/api/cron/reminders` (with `CRON_SECRET`) does the same from outside.

## Rules

- Server code that touches the database must not be imported by client components (`"use client"`); `better-sqlite3` breaks the client bundle.
- Instance-wide options are platform settings, not constants or env-only variables. See [Code guidelines](../contributing/guidelines.md).
