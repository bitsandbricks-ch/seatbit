## What and why

<!-- What does this change, and why? Link the issue: "Closes #123". -->

## Screenshots

<!-- For UI changes: phone and desktop, before and after. Paste them here (or link the CI "screenshots" artifact); don't commit re-rendered docs/screenshots. Delete if not a UI change. -->

## Checklist

- [ ] `npm run lint`, `npm run check:i18n`, `npm run typecheck` and `npm run build` pass
- [ ] Tested on a phone-sized and a desktop-sized window (UI changes)
- [ ] New migration runs on an existing database; after merging `main`, `npm run db:rebase` if it brought migrations too (schema changes)
- [ ] Docs in `docs/` updated for user-facing or setup changes
- [ ] New pages are added to `scripts/screenshots.ts`; no re-rendered existing screenshots committed (the bot updates them)
