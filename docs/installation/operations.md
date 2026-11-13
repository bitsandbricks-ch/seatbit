# Backups, upgrades and admin CLI

## Backups

All data is in the SQLite database (`/data/seatbit.db`) and the uploaded avatars (`/data/uploads`).

Seatbit backs up its database by itself: once a day by default, while it runs, with SQLite's online backup API (a consistent copy, no downtime). Each backup is checked (`PRAGMA integrity_check`) and written as `seatbit-YYYYMMDD-HHMMSS.db` to the backup folder. Backups older than the retention are deleted after each new one; the newest always stays.

Platform [owners](../features/admin.md#platform-roles) manage them under **Admin → Backups**: when the last one ran and the next one is due, **Back up now**, download or delete a backup, and the settings:

| Setting | Variable | Default |
| --- | --- | --- |
| Backup every (hours, `0` = off) | `BACKUP_INTERVAL_HOURS` | `24` |
| Keep backups for (days, `0` = keep all) | `BACKUP_KEEP_DAYS` | `14` |
| Backup folder | `BACKUP_DIR` | `/backups` in the image |

![Backups](../screenshots/desktop-admin-backups.png){ .shot }

A failed backup shows on the admin page and logs a `[backup] failed` line. Downloads, manual backups and deletions are in the [audit log](../features/audit-log.md#platform-audit-log), since a backup holds everyone's data.

### Where to keep them

Mount `/backups` as its **own volume**, so a broken data volume doesn't take the backups with it (see [Docker](docker.md#docker-compose) and [Kubernetes](kubernetes.md#backups)). It must be writable for uid 1001. Then also copy the folder off the server now and then, e.g. with restic, rsync or your volume snapshots: a backup on the same disk doesn't help when the disk dies.

The privacy policy says how long backups are kept, from the **Keep backups for** setting.

If *Admin → Backups* says the folder **isn't writable**, the volume on `/backups` belongs to another user. The server runs as uid 1001: on Kubernetes set `fsGroup: 1001` in the pod's `securityContext` (as in the [example](kubernetes.md#example)). For volume types that ignore `fsGroup` (hostPath, some NFS shares), run `chown -R 1001:1001` on the folder, or use an init container that does. With Docker: `sudo chown -R 1001:1001 backups`.

### Backups from a cron job instead

If you'd rather back up from outside, set **Backup every** to `0` and run the script that is in the image:

```sh
docker exec seatbit node scripts/backup.mjs
```

It writes the same files to `BACKUP_DIR` and deletes ones older than `BACKUP_KEEP_DAYS`, so they show up under *Admin → Backups* too (when the app uses the same folder).

### Restore

1. Download the backup from *Admin → Backups* (or take it from the backup folder).
2. Stop Seatbit.
3. Copy the backup over the database file and remove the WAL files next to it.
4. Start Seatbit again. Migrations of newer versions run on start, so a backup from an older version works too.

With Docker Compose:

```sh
docker compose stop seatbit
cp backups/seatbit-20261112-023000.db data/seatbit.db
rm -f data/seatbit.db-wal data/seatbit.db-shm
docker compose start seatbit
```

On Kubernetes, scale the deployment to 0 and copy the file with a short-lived pod that mounts both volumes:

```sh
kubectl scale deploy/seatbit --replicas=0
kubectl run seatbit-restore --rm -it --restart=Never --image=busybox --overrides='
{"spec":{"securityContext":{"runAsUser":1001,"runAsGroup":1001},
 "containers":[{"name":"r","image":"busybox","stdin":true,"tty":true,
  "command":["sh","-c","cp /backups/seatbit-20261112-023000.db /data/seatbit.db && rm -f /data/seatbit.db-wal /data/seatbit.db-shm"],
  "volumeMounts":[{"name":"data","mountPath":"/data"},{"name":"backups","mountPath":"/backups"}]}],
 "volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"seatbit-data"}},
            {"name":"backups","persistentVolumeClaim":{"claimName":"seatbit-backups"}}]}}'
kubectl scale deploy/seatbit --replicas=1
```

To restore a file you downloaded, copy it into the backup folder first (`kubectl cp` into a running pod that mounts it).

## Upgrades

Pull the new image and restart the container. Migrations run on startup. Take a backup first.

```sh
docker compose pull && docker compose up -d
```

There is one database, so run a single instance and stop the old container before the new one starts (`Recreate` strategy on Kubernetes).

After the start, Seatbit takes care of the rest:

- **Discord slash commands** are registered again when the update changed them (needs the bot token and application ID). If that fails, the notice below says so; then click **Check bot & register slash commands** under *Admin → Platform settings → Discord*.
- **Platform owners and admins get a notice** by mail and Discord DM, once per new version: the new version, the [changelog](../changelog/index.md) entries it brought and whether anything is left to do, with buttons to *What's new* and to *All changes in the code* (the compare view in the source repository, from the *Source code URL* setting). The very first start and builds without git information send nothing.
- **The ops channel** (if set) gets the same new changelog entries. Each entry is announced once, with the version that brought it; the first version with a changelog announces nothing, so the history isn't posted as news. The public announcements channel and clan channels don't get the changelog.

## Logs and health

- `GET /api/health` answers `{"ok":true}` while the server and database work.
- Errors, sent reminders and (without SMTP) emails go to the container log.
- *Admin → Health* shows version, database size, mail and Discord status, background jobs and recent errors ([Health](../features/admin.md#health)).
- Set an ops channel to get errors, upgrades and other platform events on Discord ([Platform Discord](../features/admin.md#platform-discord)).
- Before planned downtime, put up a [maintenance banner](../features/admin.md#maintenance-banner).

## Admin CLI

`scripts/admin.mjs` manages platform roles, suspensions and settings straight on the database, also while the app runs. It is in the container image.

```sh
docker exec seatbit node scripts/admin.mjs list                     # platform staff
docker exec seatbit node scripts/admin.mjs users anna               # find users
docker exec seatbit node scripts/admin.mjs grant anna@example.com   # make owner
docker exec seatbit node scripts/admin.mjs grant ben@example.com --role=moderator
docker exec seatbit node scripts/admin.mjs revoke 123456789012345678
docker exec seatbit node scripts/admin.mjs reset-setting discord.clientSecret
```

| Command | |
| --- | --- |
| `list` | List platform staff (owners, admins, moderators, support). |
| `users [search]` | List users, optionally filtered. |
| `grant <user> [--role=...]` | Give a [platform role](../features/admin.md#platform-roles): `owner` (default), `admin`, `moderator` or `support`. An email nobody has signed in with yet is added to the admin emails, so that person becomes owner on first sign-in. |
| `revoke <user>` | Take the platform role away. Refuses to remove the last owner unless `--force`. |
| `unsuspend <user>` | Lift a suspension, e.g. if you suspended yourself out by mistake. |
| `reset-setting <key>` | Clear a saved platform setting, so the environment variable applies again (e.g. after saving wrong Discord login values). |

A user can be given by email, Discord user ID, Seatbit user ID, name or nickname. On Kubernetes use `kubectl exec deploy/seatbit -- node scripts/admin.mjs ...`; in a checkout `npm run admin -- list`.
