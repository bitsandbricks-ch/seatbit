# Seatbit

Seatbit helps a clan or group of friends coordinate going to LAN parties run by others (think SwitzerLAN or Lock&Load with 30+ people): who's coming, who has bought a ticket, and who sits where in the group's seat block.

- **LANs**: each event the group goes to, with dates, location, event website, ticket shop link, ticket price and the number of group spots.
- **Orgas per LAN**: the members who coordinate the group for that event. Only they (and global admins) can edit the LAN, the seat block and attendance. Any orga can add co-orgas.
- **Attendance**: members answer *going / maybe / can't make it*. When the group's spots are full, new sign-ups go on a **waitlist** and move up automatically (with an email) when someone drops out.
- **Member checklist per LAN**: sign up, set nickname, buy ticket (members tick it off, orgas confirm), claim a seat. Progress shows on the LAN list.
- **Status at a glance**: no answer, attending, seat claimed (with seat number), waitlist/full, maybe, not going, plus free seats left.
- **Due dates and email reminders**: an answer deadline and a buy-ticket deadline per LAN. Reminders go out automatically N days before each (to undecided members and to attendees without a ticket) and one day before the LAN (to everyone going). Each one goes out once per person; orgas can also nudge manually; members can opt out.
- **Seat block**: a grid of the seats the group has. Orgas fill/clear rows, add/remove single seats for aisles, rename seats to match the event's numbering, hold seats for guests, and assign people. Members claim their own seat while seating is open.
- **CSV export** of the group (seat, nick, name, email, status, ticket) to hand to the event's organisers.
- **Nicknames**: several nicks per user, a primary default, and separate nicks per LAN.
- **Login** with email & password, Discord or Google (accounts with the same email are linked). The first user to sign up becomes global admin.

Brand assets and guidelines are in `brand/` (see `brand/BRAND.md`).

## Stack

Next.js 16 (App Router, server actions) · Better Auth · SQLite via Drizzle ORM · Tailwind CSS · Nodemailer.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000 and register; the first account is the admin. The database is created in `./data/lan.db` and migrations run automatically on start.

Without `SMTP_URL`, emails are printed to the server console, so you can try reminders locally.

### Discord / Google login

Buttons only appear when the matching client ID and secret are set.

- **Discord**: create an app at https://discord.com/developers/applications, OAuth2 redirect: `<BETTER_AUTH_URL>/api/auth/callback/discord`
- **Google**: create an OAuth client at https://console.cloud.google.com/apis/credentials, redirect: `<BETTER_AUTH_URL>/api/auth/callback/google`

### Discord bot

The bot uses the same Discord application as the login. It runs inside the app (Discord sends button clicks and slash commands to Seatbit over HTTPS), so there is no extra process to host.

1. In the Discord developer portal, open your app:
   - **Bot**: reset/copy the token into `DISCORD_BOT_TOKEN`.
   - **General Information**: copy the public key into `DISCORD_PUBLIC_KEY`, and set **Interactions Endpoint URL** to `<BETTER_AUTH_URL>/api/discord/interactions` (the app must be running and reachable for Discord to accept it).
2. Run `npm run discord:register` once. It registers the slash commands and prints the invite link for the bot.
3. Any clan can now add the bot: a clan admin opens **Clan settings → Discord & WhatsApp**, invites the bot to their server, and runs `/seatbit here` in the channel it should post in (needs "Manage Server" on Discord and a linked Discord account in Seatbit). A Discord server belongs to one clan; `/seatbit here clan:<name>` picks the clan if you admin several.

What it does, per clan:

- Posts each new LAN of the clan as an announcement with **Coming / Unsure / Not coming** buttons. The attendee list on the post updates live, also when people answer on the website. Only clan members can answer. `/seatbit announce` posts the clan's upcoming LANs in a channel.
- Posts the answer, ticket and "starts tomorrow" reminders in the clan's channels when they're due (same schedule as the emails), pinging the clan members they apply to.
- `/lans` shows the server's clan's upcoming LANs and your status, privately, with answer buttons (in DMs: all your clans).
- Orgas can re-post or post reminders by hand on the LAN's manage page; clan admins can unlink channels in clan settings.

Members are matched by their linked Discord account. Anyone who signed up with email can link Discord on their profile.

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
