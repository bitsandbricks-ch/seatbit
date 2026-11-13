# Rules for coding agents

These rules are for AI coding agents (Claude Code, Codex, Copilot, ...) working on Seatbit. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md), the same rules apply to you in spirit. `CLAUDE.md` imports this file.

## What Seatbit is

A self-hostable web app that helps a clan coordinate going to LAN parties run by others: who comes, tickets, seats, travel, packing lists, games, plus a Discord bot. Not a tool for running a LAN. Docs: `docs/` (MkDocs), user-facing overview: `README.md`.

## Workflow

1. **Branch:** work on your own branch, never push to `main`. One topic per branch and pull request.
2. **Before you push**, all of these must pass locally:
   - `npm run lint`
   - `npm run check:i18n` (UI text not going through `t()`)
   - `npm run typecheck`
   - `npm run build`
   - `mkdocs build --strict` when you touched `docs/` or `mkdocs.yml` (`pip install -r docs/requirements.txt`)
3. **Pull request:** open it as a **draft**. Fill in the template (`.github/pull_request_template.md`): what and why, screenshots for UI changes, the checklist. Link the issue.
4. **CI:** wait for the checks (`CI`, `Docs`, `Container image`). Fix failures yourself; never skip, disable or weaken a check or test to get green.
5. **When you are done, mark the pull request ready for review.** Done means: the task is complete, the checklist is ticked, and all checks are green. Leave it as a draft only while work is still open or you are blocked, and say why in the description.
6. **Never merge** your own pull request, and never force-push to a branch someone else is working on. Merging is the maintainer's call.
7. Keep the pull request description current when you push more commits (what changed, anything the reviewer must do, e.g. new env vars).

## Code rules

- **Next.js:** this is a recent Next.js with breaking changes (see the block below). Read `node_modules/next/dist/docs/` before using an API you aren't sure about.
- **Server code** that touches the database must not be imported by client components (`"use client"`). `better-sqlite3` breaks the client bundle.
- **Database:** change `src/db/schema.ts`, run `npm run db:generate`. Check the new migration's number in `drizzle/`: it must be the next free one (main skips 0010, so drizzle-kit can number one too low: rename the `.sql` and snapshot and fix `meta/_journal.json`). A migration whose journal `when` is older than the last applied one is skipped silently.
- **Settings:** instance-wide options go into `SETTINGS` in `src/lib/settings.ts` (admin UI with env var fallback), not into new hard-coded constants or env-only variables. Only startup values (`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `DATABASE_PATH`, `TZ`) stay env-only.
- **Self-hosting:** never hard-code anything about one particular instance (operator name, address, domain, Discord server, clan). Use settings with neutral defaults. Keep the "Powered by bitsandbricks.ch" and "Source" footer links.
- **UI:** mobile-first with a good desktop layout. Use `src/components/ui.tsx` (Page, PageHeader, Card, Notice, ...) and `src/components/tabs.tsx`; colours only via brand tokens (`brand/tokens.css`), which cover the dark and the light theme (text on green fills: `text-on-bit`). Every page uses the root layout width (max-w-7xl); never add your own max-width.
- **Languages:** UI text goes through `t()` (`getT()` on the server, `useT()` in client components) with keys in both `src/i18n/messages/en.ts` and `de.ts` (Swiss German: "ss", never "ß"). Pass `t.locale` to the date formatters. `npm run check:i18n` flags JSX text and labels that skip `t()`; mark a deliberate exception (a brand name, an example) with `i18n-ignore`. Error messages that reach people (server actions, `{ error }` results) are translated too: `throw await err("errors.…")` and `await tr(...)` from `src/i18n/server.ts`.
- **Dates:** always 24h, Swiss style ("Sat 14.11.2026, 18:00") via `src/lib/format.ts`. No native `datetime-local` inputs; use `src/components/date-time-picker.tsx`.
- **People** are shown via `personLabel` (`src/lib/names.ts`): Name "Nick" Surname by default, or the clan's name display on member-facing pages (`getNames(...).label`, `getDisplayNames`). Clan lead views follow it too and show the full name small below (`full`); logs, exports, mails and the admin page keep the full name. Real accounts (not guests) get `<Verified />`.
- **No secrets** in code, commits, screenshots, logs or docs. Use example values (`example.com`, `1234567890123456789`).
- Write short comments that explain why, not what.

## Docs and screenshots

- A user-facing or setup change must update `docs/` in the same pull request: `docs/features/` (one page per feature), `docs/installation/` (self-hosting), `docs/development/` or `docs/contributing/`. New settings go into `docs/installation/configuration.md`. New pages go into `nav` in `mkdocs.yml`; moved pages get a redirect. See `docs/contributing/docs.md`.
- Screenshots in `docs/screenshots/` are **generated**, never edited by hand. `npm run build && npm run screenshots` rebuilds all of them from the demo data in `scripts/seed-demo.ts`; `SCREENSHOTS_ONLY=phone-event,desktop-admin` rebuilds some. If you add a page or a tab, add a shot to `scripts/screenshots.ts` and use it in the docs. If a page needs new demo data, extend the seed.
- You don't have to commit regenerated screenshots: after a merge to `main`, the `Screenshots` workflow regenerates them and opens a pull request when they changed. Commit them yourself when the docs you write depend on a new shot.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
