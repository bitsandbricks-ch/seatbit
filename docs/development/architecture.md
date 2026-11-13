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
| `src/lib/mail-fill.ts`, `mail-templates.ts`, `system-mail.ts` | The one mail layout, the admin-editable templates and the fixed system mails. See [Mail](#mail). |
| `src/lib/discord-commands.ts`, `member-updates.ts` | Member slash commands (`/coming`, `/status`, `/ticket`, `/nick`, `/wish`); the member updates they share with the website. |
| `src/lib/announce.ts` | The Discord event announcement with its live attendee list. |
| `src/lib/audit.ts` | Audit log entries. |
| `src/lib/billing.ts` | Stripe supporter subscriptions. |
| `src/lib/names.ts`, `format.ts` | `personLabel` (*Anna "Nova" Frei*) and Swiss 24h date formatting. |

## Languages

The UI is in English and German, without locale prefixes in the URL. `src/i18n/server.ts` picks the language per request: the user's saved `locale`, then the `seatbit-locale` cookie, then `Accept-Language`, then the *Default language* setting.

- Texts are in `src/i18n/messages/en/` and `de/`, one file per namespace (`en/seatMap.ts` holds every `seatMap.*` key). Each German file is typed as its English namespace, so a missing or extra key fails the type check. One file per namespace keeps parallel features from editing the same file. A new namespace needs a file in both folders plus one import and one entry in each `index.ts` (sorted).
- Server components: `const t = await getT()`. Client components: `const t = useT()` (the root layout provides the language). Both give `t("event.coming")`, `t("home.seatsFree", { count })` and `t.rich(...)` for placeholders that are React nodes.
- `{name}` is a placeholder; a message written as `{ one, other }` picks by `count`.
- Dates: pass `t.locale` to the formatters in `src/lib/format.ts` (weekday names change, the format doesn't).
- German uses Swiss spelling: "ss", never "ß". The per-event role is "Lead" in both languages.
- Mails and Discord messages use `localeOf(user)`: the saved language, else the instance default. Posts in a clan's Discord channels use `clanLocale(clan)`. Mail templates are stored per language (`mailtpl.<id>.<part>` for English, `.de` appended for German).
- Server actions translate what reaches people: `throw await err("errors.joinFirst")` and `{ error: await tr("errors.pickClan") }` from `src/i18n/server.ts`. Pure guards nobody hits through the UI ("Bad status") stay English.
- `npm run check:i18n` (also in CI) parses every `.tsx` and fails on JSX text, user-facing attributes (`title`, `label`, `placeholder`, ...) and `confirm()` text that don't go through `t()`. Brand names and ALL-CAPS words are allowed; `// i18n-ignore` marks a deliberate exception, `i18n-ignore-file` a file written once per language (the legal pages, `TermsEn` / `TermsDe`).

## Toasts

After a save, a change or a failure the app shows a short note at the bottom of the screen (above the tab bar on phones, in the bottom right corner on wider screens): green with a tick when it worked, red with the reason when it didn't. `<Toaster />` in the root layout shows them; they stay across page changes, pause while hovered or focused, and are announced to screen readers (errors right away, the rest politely).

Every server action reports through the helpers in `src/components/action-form.tsx`, so it looks the same everywhere:

| Called from | Use |
| --- | --- |
| A plain form, also in a server component | `<ActionForm action={saveThing.bind(null, id)}>`; `done="deleted"` / `"removed"` changes the note, `done={false}` drops it (actions that leave for Stripe or another page). |
| `useActionState` | `useToastAction(action, initial, success?)`, same signature. |
| A button or transition | `const act = useRunAction();` then `start(async () => void (await act(() => saveThing(id))))`. It resolves to `true` when it worked. |

`success` is the note for a good result: leave it out for *Saved.*, pass a text, a function of the result (`(n) => t("chat.posted", { count: n })`) or `false`. A result like `{ error }` or `{ ok: false, message }` shows as an error, `{ ok: true, message }` uses its message. A thrown error shows its text when it came from `throw await err("errors.…")`; production builds hide the text of any other thrown error, so those show *That didn't work*. Client-only notes call `toast.success()` / `toast.error()` from `src/components/toast.tsx`. Don't add inline "Saved" texts or error paragraphs next to buttons.

## Mail

Every email goes out in the same layout (`renderMail` in `src/lib/mail-fill.ts`), in the recipient's language. There are three ways to send one, and no other:

- `sendTemplate()` (`mail-templates.ts`): the templates admins can edit (reminders, invites, event news, ...).
- `sendSystemMail()` (`system-mail.ts`): fixed system mails whose text lives in the `systemMail` messages (SMTP test mail, password reset). Add a new one to `SYSTEM_MAILS` with an English and a German text.
- `notify()` (`notify.ts`): notifications by email and Discord DM. A notice with a rendered template uses it; a plain-text notice (join requests, upgrades, seat swaps, ...) is wrapped by `renderNotice()`: its text as the body, its link as the button (`urlLabel` names it). Put further links in `links` (mail: small buttons, DM: link buttons) instead of raw URLs in the text.

`deliverMail()` in `mail.ts` is the only code that talks to SMTP and takes only a rendered mail (HTML and text). `npm run check:mail` (also in CI) fails when anything else imports nodemailer or calls `deliverMail()`.

## Background work

`src/instrumentation.ts` runs inside the server process: every minute it publishes scheduled drafts, and every *Reminder check interval* minutes it sends due reminders. Setting the interval to `0` turns that off; `/api/cron/reminders` (with `CRON_SECRET`) does the same from outside. The same timer makes the scheduled backups (`src/lib/backup.ts`) and restore-tests the newest one (`src/lib/backup-drill.ts`). Wrap new background work in `runJob()` (`src/lib/jobs.ts`): it then shows on *Admin → Health* and in the `seatbit_job_*` metrics (`src/lib/metrics.ts`, served at `/api/metrics`).

## Rules

- Server code that touches the database must not be imported by client components (`"use client"`); `better-sqlite3` breaks the client bundle.
- Instance-wide options are platform settings, not constants or env-only variables. See [Code guidelines](../contributing/guidelines.md).
