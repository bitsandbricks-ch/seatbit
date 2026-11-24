# Threat model

Who could attack a Seatbit instance, through which way in, and what stops them. The [BitsAndBricks handbook](https://github.com/bitsandbricks-ch/handbook/blob/main/core/security.md) asks for one page per app, updated whenever a new way in is added (an API route, a webhook, a bot command, an outside service). What operators set up around Seatbit is in [Security hardening](installation/security.md).

## What is worth protecting

| Asset | Where |
| --- | --- |
| Personal data: names, emails, Discord IDs, LAN IDs, emergency contacts, dietary needs | The SQLite database in `/data` and the backups |
| Who may do what: platform, clan and event roles | Database; checked on every request |
| Secrets: auth secret, Discord bot token and client secret, SMTP password, Stripe keys, S3 keys | Environment variables; saved settings encrypted with AES-256-GCM |
| Money flows: supporter subscriptions, clan payments | Stripe; Seatbit only stores their state |
| The clan's Discord server | The bot can post and send DMs in the servers it was added to |

## Who might attack

- Someone on the internet without an account.
- A signed-in member who tries to see or change another clan's data, or to act as an organizer or admin.
- A clan organizer who tries to reach people outside the clan or to spam members.
- Anyone who can send requests to the webhook endpoints or the Discord interactions endpoint.
- A compromised dependency or container image.

## Ways in

| Way in | Who reaches it | What protects it |
| --- | --- | --- |
| Pages and server actions | Everyone; most need a session | Better Auth session cookies (`HttpOnly`, `SameSite=Lax`, `Secure` on https). Every action checks the caller itself (`requireUser`, `requireClanPermission`, `requireLanManager`, `assertPlatform`, `canTakePart`); the [permission tests](development/permission-tests.md) try every action as every role. Same-origin check on server actions. zod validation on form input. |
| Sign-in (`/api/auth/*`) | Everyone | Discord OAuth only ([decision 0001](decisions/0001-discord-sign-in.md)); rate limited per visitor; "come back after sign-in" only accepts paths on the same site. |
| Downloads and exports | Signed-in members with the right role | Same permission checks as actions; not cached; CSV cells that spreadsheets would read as formulas are neutralised. |
| Avatar uploads | Signed-in members | Content-type checked from the file's bytes, 2 MB limit, served with `nosniff` and a sandboxing CSP. |
| Live updates (`/api/live/<lanId>`) | People who may view the event | `canViewLan`; only "this event changed" is sent, never data. |
| Discord interactions (`/api/discord/interactions`) | Discord, and anyone who can reach the URL | Signature checked against the app's public key, must be recent; `/seatbit` commands also need *Manage Server*; suspended accounts count as signed out. |
| Stripe webhooks (`/api/billing/stripe/webhook`, `/api/payments/stripe/webhook`) | Stripe, and anyone who can reach the URL | Signing secret, five-minute window, each event applied once. Payments are off unless an operator sets up Stripe. |
| Reminder trigger (`/api/cron/reminders`) | Anyone who can reach the URL | Off unless `CRON_SECRET` is set; needs it as a bearer token. |
| Metrics (`/api/metrics`) | Anyone who can reach the URL | Off unless a metrics token is set; only totals, no names. |
| Health (`/api/health`) | Anyone who can reach the URL | Returns only `ok`. |
| Outgoing calls | Seatbit itself | Only fixed hosts: Discord, Stripe, the Steam store and image hosts, the SMTP server, the S3 bucket for off-site backups. Seatbit never fetches addresses people enter. |
| Mail and Discord messages people trigger | Organizers, members | Rate limited per account; mentions switched off in Discord posts; text escaped in mails. |
| Dependencies and the image | The supply chain | Trivy scans of dependencies, Dockerfile, committed secrets and the built image on every change and weekly; grouped dependency updates. |

## Known gaps and accepted risks

- An account is as safe as its Discord account; Seatbit has no second factor for admins (open question, see `AGENTS.md`).
- Rate limits live in memory and reset on restart; fine for the single instance Seatbit supports.
- `style-src 'unsafe-inline'` is allowed because React style attributes need it; scripts are limited by a nonce.
- Organizers see the emails of their clan's members and guests, by design.
- The database and backups hold all personal data; their safety depends on the operator (see [Security hardening](installation/security.md#data)).

## When to update this page

Add a row when a change adds a way in: a new API route, webhook, Discord command group, outside service, or a new kind of upload or export.
