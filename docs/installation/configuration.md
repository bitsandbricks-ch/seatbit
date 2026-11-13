# Configuration

Seatbit reads a few **environment variables** at startup. Everything else is a **platform setting** that admins change in the browser under **Admin → Platform settings**; each of those can also be set by an environment variable.

A value saved in the platform settings wins over the environment variable. Clearing it falls back to the variable, then to the default. Each field shows where its current value comes from.

## Startup (environment only)

| Variable | Default | |
| --- | --- | --- |
| `BETTER_AUTH_URL` | `http://localhost:3000` | Public URL of your instance, e.g. `https://seatbit.example.com`. Used for sign-in callbacks and links in emails. |
| `BETTER_AUTH_SECRET` | | **Required.** Random secret for sessions, e.g. `openssl rand -base64 32`. |
| `SETTINGS_ENCRYPTION_KEY` | derived from `BETTER_AUTH_SECRET` | Key for secrets saved in the platform settings. If the key changes, saved secrets must be entered again. |
| `DATABASE_PATH` | `./data/lan.db` (`/data/seatbit.db` in the image) | SQLite file. Uploads go to `uploads/` next to it. |
| `TZ` | `Europe/Zurich` in the image | Timezone for dates in forms, emails and Discord. |
| `ALLOW_EMAIL_LOGIN` | off | `1` turns on email and password login. For development and tests only. |
| `BACKUP_DIR`, `BACKUP_KEEP_DAYS` | `/backups`, `14` | For `scripts/backup.mjs`. |

## Platform settings

| Setting | Variable | Default |
| --- | --- | --- |
| **General** | | |
| Allow new accounts | `SIGNUP_OPEN` | `true` |
| Admin emails (become platform admin on sign-up) | `ADMIN_EMAILS` | |
| Default language (`en` or `de`): for browsers that want neither, mails to people without a choice and clans without their own Discord language | `DEFAULT_LOCALE` | `en` |
| Currency for food orders | `FOOD_CURRENCY` | `CHF` |
| **Email** | | |
| SMTP host, port, encryption | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY` | –, `587`, `starttls` |
| Username, password | `SMTP_USER`, `SMTP_PASSWORD` | |
| Sender | `MAIL_FROM` | `Seatbit <noreply@localhost>` |
| (alternative) one SMTP URL | `SMTP_URL` | |
| **Discord** | | |
| Application (client) ID, client secret | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | |
| Bot token, public key | `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY` | |
| Platform ops channel ID (see [Platform Discord](../features/admin.md#platform-discord)) | `OPS_DISCORD_CHANNEL` | |
| Post upgrades, errors, new clans, supporter payments, abuse reports there | `OPS_DISCORD_UPGRADES`, `OPS_DISCORD_ERRORS`, `OPS_DISCORD_CLANS`, `OPS_DISCORD_PAYMENTS`, `OPS_DISCORD_REPORTS` | `true` each |
| Public announcements channel ID | `ANNOUNCE_DISCORD_CHANNEL` | |
| **Reminders** | | |
| Reminder check interval (minutes, `0` = off) | `REMINDER_INTERVAL_MINUTES` | `60` |
| Cron secret for `/api/cron/reminders` | `CRON_SECRET` | |
| **Maintenance** (see [Maintenance banner](../features/admin.md#maintenance-banner)) | | |
| Banner message (start and end are set in the admin UI) | `MAINTENANCE_MESSAGE` | |
| **Operator & legal** | | |
| Operator name, postal address, contact email | `LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_ADDRESS`, `LEGAL_CONTACT_EMAIL` | |
| Hosting location, governing law | `LEGAL_HOSTING_LOCATION`, `LEGAL_GOVERNING_LAW` | |
| Own Terms of Service / Privacy Policy URL | `LEGAL_TERMS_URL`, `LEGAL_PRIVACY_URL` | built-in pages |
| Source code URL (footer "Source") | `SOURCE_URL` | this repository |
| **Supporters** (see [Stripe](stripe.md)) | | |
| Supporter payments on/off | `BILLING_ENABLED` | `false` |
| Stripe secret key, webhook signing secret | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | |
| Annual and monthly price ID | `STRIPE_PRICE_ANNUAL`, `STRIPE_PRICE_MONTHLY` | |
| Refund policy (sentence in the terms) | `BILLING_REFUND_POLICY` | full refund within 14 days |

Passwords, client secrets and tokens are encrypted (AES-256-GCM) before they are stored and never shown again; the page only shows whether one is set and its last four characters.

The **Server** tab shows the startup values, and **Mail templates** lets you change the wording of every email (see [Email](email.md)).

## Reminders without a long-running process

The server checks for due reminders every *Reminder check interval* minutes. If your host stops idle processes, set it to `0` and call the endpoint from a cron job instead:

```sh
curl -H "Authorization: Bearer $CRON_SECRET" https://seatbit.example.com/api/cron/reminders
```
