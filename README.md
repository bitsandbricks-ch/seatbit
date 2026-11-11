# Seatbit

Seatbit helps a clan or group of friends coordinate going to LAN parties run by others (think SwitzerLAN or Lock&Load with 30+ people): who's coming, who has bought a ticket, and who sits where in the group's seat block.

- **LANs**: each event the group goes to, with dates, location, event website, ticket shop link, ticket price and the number of group spots.
- **Orgas per LAN**: the members who coordinate the group for that event. Only they (and global admins) can edit the LAN, the seat block and attendance. Any orga can add co-orgas.
- **Attendance**: members answer *going / maybe / can't make it*. When the group's spots are full, new sign-ups go on a **waitlist** and move up automatically (with an email) when someone drops out.
- **Member checklist per LAN**: sign up, set nickname, buy ticket (members tick it off, orgas confirm), claim a seat. Progress shows on the LAN list.
- **Status at a glance**: no answer, attending, seat claimed (with seat number), waitlist/full, maybe, not going, plus free seats left.
- **Due dates and email reminders**: an answer deadline and a buy-ticket deadline per LAN. Reminders go out automatically N days before each (to undecided members and to attendees without a ticket) and one day before the LAN (to everyone going). Each one goes out once per person; orgas can also nudge manually; members can opt out.
- **Seat block**: a grid of the seats the group has. Orgas fill/clear rows, add/remove single seats for aisles, rename seats to match the event's numbering, hold seats for guests, and assign people. Members claim their own seat while seating is open.
- **Travel** (event page, Travel tab): members offer or ask for rides and places to sleep, grouped by town. Others join an offer with free places; a driver can take a person who asked along with one tap, which also clears their request.
- **Gear** (event page, Gear tab): orgas list the shared gear the group needs (switch, power strips, uplink cable, ...) or copy the list from an earlier event; members say how many they bring, so the list shows what's still missing. Members can add extra items they bring, and each member gets a private packing list to tick off.
- **CSV export** of the group (seat, nick, name, email, status, ticket) to hand to the event's organisers.
- **Nicknames**: several nicks per user, a primary default, and separate nicks per LAN.
- **Login with Discord.** The Discord login asks for the account's email, which is used for reminders. On first login members give their first name, surname and nickname (gamer tag). The first user to sign up becomes global admin. Google and email/password login are switched off for now; turn them back on in `LOGIN_METHODS` in `src/lib/auth.ts`. `ALLOW_EMAIL_LOGIN=1` enables email login for local development and tests.

Brand assets and guidelines are in `brand/` (see `brand/BRAND.md`).

## Platform settings

Global admins can configure the platform under **Admin → Platform settings** (`/admin/settings`) without touching the server: SMTP mail relay (with a "send test mail" button), Discord login and bot credentials (with a "check bot & register slash commands" button), sign-up on/off, admin emails, the reminder interval and the cron secret.

- A value saved there wins over the matching environment variable. Clearing it falls back to the env var, then to the default. Each field shows where its current value comes from.
- Passwords, client secrets and tokens are encrypted (AES-256-GCM) before they are stored, and are never shown again; the page only shows whether one is set and its last four characters.
- The encryption key is `SETTINGS_ENCRYPTION_KEY`, or derived from `BETTER_AUTH_SECRET` if that isn't set. If the key changes, saved secrets can't be read any more and have to be entered again (the page says so).
- `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `DATABASE_PATH` and `TZ` are needed at startup, so they stay env-only.

### First start (bootstrap)

Login is Discord-only, so nobody can reach the settings page until Discord login works:

1. Create a Discord application (see below) and start Seatbit with `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` set as env vars (plus `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`).
2. Sign in. **The first account becomes platform admin.** To pick admins up front instead, set `ADMIN_EMAILS` (the emails of their Discord accounts).
3. Everything else (bot token, public key, SMTP, ...) can then be set in the platform settings. Keep the two login env vars in place: if a wrong client ID or secret is ever saved on the settings page, nobody can sign in, and `node scripts/admin.mjs reset-setting discord.clientSecret` (and `discord.clientId`) brings back the env values.

### Admin CLI

`scripts/admin.mjs` manages platform admins straight on the database, also while the app runs (it's in the container image):

```sh
kubectl exec deploy/seatbit -- node scripts/admin.mjs list                    # platform admins
kubectl exec deploy/seatbit -- node scripts/admin.mjs users mike              # find users
kubectl exec deploy/seatbit -- node scripts/admin.mjs grant mike@example.com  # make admin
kubectl exec deploy/seatbit -- node scripts/admin.mjs revoke 123456789012345678
kubectl exec deploy/seatbit -- node scripts/admin.mjs reset-setting discord.clientSecret
```

A user can be given by email, Discord user ID, Seatbit user ID, name or nickname. `grant` with an email nobody has signed in with yet adds it to the admin emails, so that person becomes admin on first sign-in. Locally: `npm run admin -- list`.

## Stack

Next.js 16 (App Router, server actions) · Better Auth · SQLite via Drizzle ORM · Tailwind CSS · Nodemailer.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000 and register; the first account is the admin. The database is created in `./data/lan.db` and migrations run automatically on start.

Without an SMTP host (platform settings or env), emails are printed to the server console, so you can try reminders locally.

### Discord / Google login

Buttons only appear when the matching client ID and secret are set.

- **Discord**: create an app at https://discord.com/developers/applications, OAuth2 redirect: `<BETTER_AUTH_URL>/api/auth/callback/discord`
- **Google**: create an OAuth client at https://console.cloud.google.com/apis/credentials, redirect: `<BETTER_AUTH_URL>/api/auth/callback/google`

### Discord bot

The bot uses the same Discord application as the login. It runs inside the app (Discord sends button clicks and slash commands to Seatbit over HTTPS), so there is no extra process to host.

1. In the Discord developer portal, open your app:
   - **Bot**: reset/copy the token into `DISCORD_BOT_TOKEN`.
   - **General Information**: copy the public key into `DISCORD_PUBLIC_KEY`, and set **Interactions Endpoint URL** to `<BETTER_AUTH_URL>/api/discord/interactions` (the app must be running and reachable for Discord to accept it).
2. Click **Check bot & register slash commands** in **Admin → Platform settings → Discord** (or run `npm run discord:register`) once. It registers the slash commands.
3. Any clan can now add the bot: a clan admin opens **Clan settings → Discord & WhatsApp**, invites the bot to their server, and runs `/seatbit here` in the channel it should post in (needs "Manage Server" on Discord and a linked Discord account in Seatbit). A Discord server belongs to one clan; `/seatbit here clan:<name>` picks the clan if you admin several.

What it does, per clan:

- Posts each new LAN of the clan as an announcement with **Coming / Unsure / Not coming** buttons. The attendee list on the post updates live, also when people answer on the website. Only clan members can answer. `/seatbit announce` posts the clan's upcoming LANs in a channel.
- Posts the answer, ticket and "starts tomorrow" reminders in the clan's channels when they're due (same schedule as the emails), pinging the clan members they apply to.
- `/lans` shows the server's clan's upcoming LANs and your status, privately, with answer buttons (in DMs: all your clans).
- Orgas can re-post or post reminders by hand on the LAN's manage page; clan admins can unlink channels in clan settings.

Members are matched by their linked Discord account. Everyone signs in with Discord, so every member is matched automatically.

### WhatsApp

WhatsApp's official API can't post into regular groups or communities, so there is no bot. Instead the LAN's manage page has ready-made announcement and reminder texts with a copy button and a "Share via WhatsApp" link, to paste into the community.

### Reminders

The server checks for due reminders every `REMINDER_INTERVAL_MINUTES` (default 60). If you host somewhere without a long-running process, set it to `0` and call the endpoint from a cron job instead:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/reminders
```

## Production

```bash
npm run build
npm start
```

Keep the `data/` directory (or `DATABASE_PATH`) on persistent storage, and set `TZ` to your timezone so dates in forms and emails are right.

## Database changes

Edit `src/db/schema.ts`, then run `npm run db:generate` to create a migration in `drizzle/`. It is applied on the next start.

## Container image

GitHub Actions builds a multi-arch image (amd64 + arm64) on every push to `main` and pushes it to `ghcr.io/bitsandbricks-ch/seatbit` as `:main` and `:sha-<short sha>` (tags `v1.2.3` also give `:1.2.3`).

```sh
docker run -p 3000:3000 -v seatbit-data:/data \
  -e BETTER_AUTH_URL=https://seatbit.ch -e BETTER_AUTH_SECRET=$(openssl rand -base64 32) \
  -e DISCORD_CLIENT_ID=... -e DISCORD_CLIENT_SECRET=... \
  ghcr.io/bitsandbricks-ch/seatbit:main
```

- Runs as uid/gid 1001; the SQLite database is `/data/seatbit.db` (keep `/data` on a volume, one instance only).
- Health check: `GET /api/health`. Migrations run on startup.
- Admin CLI: `docker exec <container> node scripts/admin.mjs help` (see "Admin CLI").
- Online backup while running: `node scripts/backup.mjs` (writes to `BACKUP_DIR`, default `/backups`, keeps `BACKUP_KEEP_DAYS`, default 14).
- Works with a read-only root filesystem if `/tmp` and `/app/.next/cache` are writable.
