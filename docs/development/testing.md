# Tests

Seatbit has three kinds of automated tests. CI runs all of them on every pull request.

| Command | What | Where |
| --- | --- | --- |
| `npm test` | Unit tests for pure helpers (money, dates, names, seat planning). Fast, no server. | `src/**/*.test.ts` |
| `npm run test:e2e` | End-to-end tests: a real browser against a production build on fresh demo data. | `e2e/` |
| `npm run test:authz` | [Permission tests](permission-tests.md): every server action and download, tried as every kind of person. No server. | `tests/authz/` |

## Unit tests

Plain [`node:test`](https://nodejs.org/api/test.html) run through `tsx`, next to the code they test (`src/lib/money.ts` → `src/lib/money.test.ts`). Use them for logic that needs no database: parsing, formatting, the seat planner. Add a case when you fix a bug in such a helper.

```sh
npm test
npx tsx --test src/lib/seating.test.ts   # one file
```

## End-to-end tests

[Playwright](https://playwright.dev/) tests in `e2e/`, configured in `playwright.config.ts`. They cover the core flows:

| Spec | Flow |
| --- | --- |
| `auth.spec.ts` | Signed-out redirect, the Discord button starts OAuth with the right app, email login (wrong and right password), sign out. |
| `rsvp.spec.ts` | Coming / unsure / not coming, the ticket locks the answer, waitlist when full, members can't open the lead view. |
| `seats.spec.ts` | Ranked seat wishes (add, reorder by arrows and drag, remove), the leads' wish score, self pick with a ticket, the lead finalizes, members see the final plan; no pick without a ticket. |
| `payments.spec.ts` | Clan payments: a lead creates a charge, the member reports paying, the lead marks it paid. |

`rsvp` and `seats` also run on a phone-sized screen (project `phone`); everything runs on desktop.

### Running them

```sh
npm run build                       # once, after code changes
npx playwright install chromium     # once, for Playwright's browser
npm run test:e2e
npm run test:e2e -- e2e/seats.spec.ts --project desktop   # one file, one screen size
npm run test:e2e -- --ui            # watch and step through in a browser
```

The web server command in `playwright.config.ts` deletes and seeds a database in the temp folder (`e2e/setup-db.ts`, the [demo data](index.md#demo-data)), then starts `next start` on port 3200 with email login on, a fake Discord app and no mail or background jobs. Nothing reaches a real service. `CHROMIUM_PATH=/path/to/chrome` uses another browser binary, as for the [screenshots](screenshots.md).

After a failure, `test-results/` has a screenshot and a trace per failed test (`npx playwright show-trace <file>`). In CI they are attached to the run as the `playwright-report` artifact.

### Writing a test

- **Signing in** skips Discord: `as("anna")` from `e2e/fixtures.ts` gives a page signed in as a demo user (it writes a session into the test database and sets the signed cookie). Only `auth.spec.ts` uses the login form.
- **Own data per test:** `createEvent({ seats, seatPicking, capacity, attendees })` adds a fresh published event of the demo clan, led by Alex. Don't change the shared demo events: tests then depend on each other and on the order they run in.
- **Find things like a person does:** by role and visible text (`getByRole("button", { name: "I'm coming" })`), in English. Check the result in the page, and where it matters in the database too (`db()` in the fixtures).
- **Demo users:** `alex` is platform owner, clan admin and lead; `anna`, `ben`, `chiara`, ... are members. See `scripts/seed-demo.ts`.

Add a test when you build or change a core flow (answering, tickets, seats, payments, permissions).
