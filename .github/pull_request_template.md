## What and why

<!-- What does this change, and why? Link the issue: "Closes #123". -->

## Screenshots

<!-- For UI changes: phone and desktop, before and after. Paste them here (or link the CI "screenshots" artifact); don't commit re-rendered docs/screenshots. Delete if not a UI change. -->

## Checklist

- [ ] `npm run lint`, `npm run check:i18n`, `npm run check:mail`, `npm run check:changelog`, `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` pass
- [ ] New or changed core flows have an end-to-end test
- [ ] Tested on a phone-sized and a desktop-sized window (UI changes)
- [ ] New migration runs on an existing database; after merging `main`, `npm run db:rebase` if it brought migrations too (schema changes)
- [ ] Docs in `docs/` updated for user-facing or setup changes
- [ ] Changelog entry in `changelog/` (EN and DE) for changes people notice
- [ ] New pages are added to `scripts/screenshots.ts`; no re-rendered existing screenshots committed (the bot updates them)
