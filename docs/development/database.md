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
2. Run `npm run db:generate`. drizzle-kit writes `drizzle/<timestamp>_name.sql` (e.g. `20261113153000_seat_notes.sql`), a snapshot in `drizzle/meta/` and an entry in `drizzle/meta/_journal.json`. Give it a name: `npm run db:generate -- --name seat_notes`.
3. Start the app (or `npm run build`): the migration runs on the existing database. Also try it on a database with data (`npm run seed` first).
4. Extend `scripts/seed-demo.ts` if screenshots need the new data.

Migrations up to `0037` are numbered; newer ones are named by their creation time, so two branches never claim the same name. Which migrations a database already has is tracked by the journal's `when`, not by the file name, so the switch changes nothing on running instances.

!!! warning "Journal timestamps"
    Drizzle skips a migration whose journal `when` is older than the last applied one, silently. `npm run db:rebase` (below) always gives the branch's migration the newest `when`.

## Merge conflicts in migrations

Two branches that each add a migration both append to `_journal.json` and both point their snapshot at the same parent. Whoever merges second gets a conflict, and CI's `drizzle-kit check` fails. Don't fix that by hand:

```sh
git fetch origin main
git merge origin/main     # resolve conflicts outside drizzle/ (e.g. in schema.ts) first
npm run db:rebase         # takes main's drizzle/, regenerates your migration on top
```

`scripts/db-rebase.mjs` drops the branch's own migrations and lets drizzle-kit generate one fresh migration from the merged schema, with the right parent and the newest `when`. Hand-written SQL (data fix-ups) can't be regenerated: the script prints every statement of the old migration that the new one lacks, so you can add it back. A migration that was only hand-written SQL is re-created as a custom migration with the same content.

Then check the new `.sql`, run `npm run build` (applies all migrations to a fresh database) and commit the merge.
