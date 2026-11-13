# Backups, upgrades and admin CLI

## Backups

All data is in the SQLite database (`/data/seatbit.db`) and the uploaded avatars (`/data/uploads`).

The image contains a backup script that makes a consistent copy while Seatbit runs:

```sh
docker exec seatbit node scripts/backup.mjs
```

It writes `seatbit-YYYYMMDD-HHMMSS.db` to `BACKUP_DIR` (default `/backups`) and deletes backups older than `BACKUP_KEEP_DAYS` (default 14). Run it daily from cron (or a Kubernetes CronJob mounting the same volume) and copy the backups off the server.

To restore, stop Seatbit, replace `/data/seatbit.db` with a backup (remove `seatbit.db-wal` and `seatbit.db-shm` next to it) and start it again.

## Upgrades

Pull the new image and restart the container. Migrations run on startup. Take a backup first.

```sh
docker compose pull && docker compose up -d
```

There is one database, so run a single instance and stop the old container before the new one starts (`Recreate` strategy on Kubernetes).

After the start, Seatbit takes care of the rest:

- **Discord slash commands** are registered again when the update changed them (needs the bot token and application ID). If that fails, the notice below says so; then click **Check bot & register slash commands** under *Admin → Platform settings → Discord*.
- **Platform admins get a notice** by mail and Discord DM, once per new version: the new version, a link to what changed in the source repository (the *Source code URL* setting) and whether anything is left to do. The very first start and builds without git information send nothing.

## Logs and health

- `GET /api/health` answers `{"ok":true}` while the server and database work.
- Errors, sent reminders and (without SMTP) emails go to the container log.
- *Admin → Health* shows version, database size, mail and Discord status, background jobs and recent errors ([Health](../features/admin.md#health)).
- Set an ops channel to get errors, upgrades and other platform events on Discord ([Platform Discord](../features/admin.md#platform-discord)).
- Before planned downtime, put up a [maintenance banner](../features/admin.md#maintenance-banner).

## Admin CLI

`scripts/admin.mjs` manages platform admins and settings straight on the database, also while the app runs. It is in the container image.

```sh
docker exec seatbit node scripts/admin.mjs list                     # platform admins
docker exec seatbit node scripts/admin.mjs users anna               # find users
docker exec seatbit node scripts/admin.mjs grant anna@example.com   # make admin
docker exec seatbit node scripts/admin.mjs revoke 123456789012345678
docker exec seatbit node scripts/admin.mjs reset-setting discord.clientSecret
```

| Command | |
| --- | --- |
| `list` | List platform admins. |
| `users [search]` | List users, optionally filtered. |
| `grant <user>` | Make a user platform admin. An email nobody has signed in with yet is added to the admin emails, so that person becomes admin on first sign-in. |
| `revoke <user>` | Take platform admin away. |
| `reset-setting <key>` | Clear a saved platform setting, so the environment variable applies again (e.g. after saving wrong Discord login values). |

A user can be given by email, Discord user ID, Seatbit user ID, name or nickname. On Kubernetes use `kubectl exec deploy/seatbit -- node scripts/admin.mjs ...`; in a checkout `npm run admin -- list`.
