# Backups and upgrades

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

## Logs and health

- `GET /api/health` answers `{"ok":true}` while the server and database work.
- Errors, sent reminders and (without SMTP) emails go to the container log.
