# 0003 Timestamped migrations and one file per feature

**Context:** with five to eight pull requests open at once, most of them clashed on the same few files: the translation files, the migration journal, the pages that linked every feature, and the screenshots.

**Decision:** migrations are named by timestamp and regenerated on top of `main` with `npm run db:rebase`. Translations live in one file per namespace and language (`src/i18n/messages/{en,de}/`). Features register in a list (`src/app/admin/sections.ts`, `SETTINGS` in `src/lib/settings.ts`) with one line, and new server actions, translations and components get their own file.

**Consequences:** CI runs `drizzle-kit check` to catch two migrations on the same parent. Parallel pull requests rarely touch the same lines. This matches the handbook's [merge conflicts](https://github.com/bitsandbricks-ch/handbook/blob/main/core/merge-conflicts.md) chapter. Introduced in pull request #115.
