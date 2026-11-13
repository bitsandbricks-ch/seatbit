# Screenshots

The screenshots in the README and these docs are **generated** from demo data, so they always show the current UI. Don't edit them by hand.

```sh
npm run build
npm run screenshots                                 # all of them
SCREENSHOTS_ONLY=phone-event,desktop-admin npm run screenshots
```

How it works (`scripts/screenshots.ts`):

1. Creates a fresh database in a temp folder and fills it with `scripts/seed-demo.ts`: the clan *Pixel Pirates*, three events, 17 members and a guest.
2. Starts the production build on port 3100 with an example operator and a fake Discord app (nothing talks to Discord).
3. Signs in as Alex (admin, lead) or Anna (member) by creating sessions directly, and renders each page with Chromium: phones at 390 px (2x), desktops at 1440 px.
4. Saves `docs/screenshots/<name>.png`. Pictures that differ only by rendering noise are left alone, so only real changes show up in git.

The demo world runs at a fixed date (`NOW` in the script, via `scripts/fake-now.cjs`), so relative dates like "in 5 days" don't change from day to day.

## Adding a page

Add an entry to `SHOTS` in `scripts/screenshots.ts`: a name starting with `phone-` or `desktop-`, who is signed in, the path, and optionally an action (e.g. open a seat) or `full: true` for the whole page. If the page needs data, extend the seed. Then use it in the docs: `![Alt text](../screenshots/desktop-thing.png){ .shot }`.

## Automation

- **CI** renders every page on each pull request and attaches the screenshots to the run (artifact *screenshots*), so reviewers can look at them.
- After a merge to `main` that touches the UI, the **Screenshots** workflow regenerates them and opens (or updates) a pull request *Update screenshots*. Merge it to publish the new pictures to the README and the docs.

## Screenshots in pull requests

Feature pull requests **don't commit changed screenshots**. Every UI change re-renders many of the same PNGs, and binary files can't be merged, so parallel branches would all conflict on them. The bot pull request updates them after the merge instead. CI fails a pull request that modifies an existing file in `docs/screenshots/` (the bot's own branch is exempt); undo it with `git checkout origin/main -- docs/screenshots`.

A **new** shot (a new page or tab) is a new file and can't conflict, so commit it when the docs you write show it. Put pictures for reviewers in the pull request description, or point them at the CI artifact.
