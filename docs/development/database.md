# Database and migrations

Seatbit uses SQLite with [Drizzle ORM](https://orm.drizzle.team). The schema is `src/db/schema.ts`; SQL migrations live in `drizzle/` and are applied automatically on startup.

## Database file

| | |
| --- | --- |
| Local | `./data/lan.db` |
| Container | `/data/seatbit.db` |
| Override | `DATABASE_PATH` |

The connection (`src/db/index.ts`) turns on WAL mode and foreign keys, runs pending migrations under a lock (so parallel build workers don't race), then runs a few data fix-ups.

## Change the schema

1. Edit `src/db/schema.ts`.
2. Run `npm run db:generate`. drizzle-kit writes `drizzle/NNNN_name.sql`, a snapshot in `drizzle/meta/` and an entry in `drizzle/meta/_journal.json`.
3. **Check the number.** It must be the next free one. `main` skips `0010`, so drizzle-kit can number one too low: rename the `.sql` and the snapshot and fix the `tag` in `_journal.json`.
4. Start the app (or `npm run build`): the migration runs on the existing database. Also try it on a database with data (`npm run seed` first).
5. Extend `scripts/seed-demo.ts` if screenshots need the new data.

!!! warning "Journal timestamps"
    Drizzle skips a migration whose journal `when` is older than the last applied one, silently. After renumbering or merging `main`, make sure the new entry has the newest `when`.

## Merge conflicts in migrations

When another pull request took your migration number:

1. Merge `main` into your branch.
2. Rename your `.sql` and snapshot to the next free number.
3. Fix `_journal.json`: `idx`, `tag` and a `when` newer than every other entry.
4. Fix the snapshot's `prevId` to point at the latest snapshot on `main`.
5. Run `npm run build` to apply all migrations from scratch.
