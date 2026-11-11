# Seatbit

Seatbit is a small web app for a clan or group of friends to organise LAN parties.

- **Multiple LANs**, each with dates, location, price, capacity and description.
- **Attendance**: members answer *going / maybe / can't make it*. When the LAN is full, new sign-ups go on a **waitlist** and move up automatically (with an email) when someone drops out.
- **Due dates**: an answer deadline and a payment due date per LAN. Admins tick off who has paid.
- **Email reminders**: sent automatically N days before the answer deadline (to members who haven't answered or said maybe), before the payment due date (to unpaid attendees) and one day before the LAN (to everyone going). Each reminder goes out once per person; admins can also nudge manually. Members can opt out.
- **Seating plans**: a grid per LAN. Admins add/remove seats to shape tables and aisles, lock seats, rename them and assign people. Attendees who are going pick their own seat.
- **Nicknames**: each user can have several nicks, a primary default nick, and separate nicks per LAN. Seat plans and attendee lists show the LAN nick.
- **Login** with email & password, Discord or Google (accounts with the same email are linked).
- The first user to sign up becomes admin; admins can promote others.

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
