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
| `profile.spec.ts` | A new nickname and socials show on the member page (Twitch as a link, Battle.net as text); first name can't be emptied. Puts Elena's profile back afterwards. |
| `create-event.spec.ts` | A lead creates an event by typing the dates (fields found by their own names), it stays hidden from members as a draft, and shows up for them once published. |
| `admin-settings.spec.ts` | The operator saves their legal details on the platform settings and the terms show them; a wrong value saves nothing and keeps what was typed (also on the maintenance notice); emptied fields go back to the defaults; members can't open the page. |
| `double-submit.spec.ts` | A double click on a form button (creating an invite link) sends it once. |
| `delete-account.spec.ts` | A member deletes their own account: DELETE must be typed, they end up signed out on the login page with a note, and their membership and upcoming answer are gone while the clan stays. |
| `clan-leave.spec.ts` | Leaving a clan asks first, withdraws the answers on its upcoming events (the waitlist moves up), keeps answers with a ticket, and ends lead roles (a leftover lead row gives a non-member no access). |
| `reports.spec.ts` | A member reports a clan ("Something else" needs a short text); a moderator resolves it with a note and it moves to the closed reports. |
| `emergency.spec.ts` | A member saves an emergency contact; the event lead sees it with a phone link and the look is logged; a plain member coming too sees nothing; two days after the event the lead loses access. |
| `password-reset.spec.ts` | Email login only: a reset link sets a new password, the login page says so, the new password signs in and the same link is refused a second time; an unknown address gets the same answer and no link. |
| `swaps.spec.ts` | Seat swaps once the plan is out: a member asks, the other agrees, a lead approves and the seats change; declining; no swaps before the plan is out. |
| `travel.spec.ts` | Carpool: offer a ride, join and leave it, a driver takes along someone who asked; members who aren't coming can't post or join. |
| `clan-join.spec.ts` | Joining a clan: an admin approves or declines a request, an open clan lets you in right away, an invite-only clan only through an invite link. |
| `food.spec.ts` | Food orders at the LAN: start one, add a line with a price, the runner sees the merged list and total, ticks who paid and closes it; others can't. |
| `payments.spec.ts` | Clan payments: a lead creates a charge, the member reports paying, the lead marks it paid. |
| `smoke.spec.ts` | Every page (and every event tab) loads on the demo data for the people who may see it (member, lead, platform owner, and a newcomer without a clan, who sees «Ask to join» on an event link instead of the event): no error status, no crash in the browser, and every visible button, link, field and image has a name for screen readers (a placeholder alone doesn't count; alt="" marks a decorative image), and no page scrolls sideways (the phone project runs it on a Pixel 7 screen). Old links redirect on the server. Add a new page or tab to its lists. |

`rsvp`, `seats`, `smoke` and a few more also run on a phone-sized screen (project `phone`, see `testMatch` in `playwright.config.ts`); everything runs on desktop.

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
