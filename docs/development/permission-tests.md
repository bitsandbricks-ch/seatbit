# Permission tests

`npm run test:authz` tries every server action and every download as every kind of person and checks that only the right people get through. It runs in CI (the **Security** workflow) on every pull request.

```sh
npm run test:authz
```

It needs no running server and no setup: it seeds a throwaway database with the [demo data](index.md#demo-data) in a temporary folder and deletes it afterwards. A run takes about a minute.

## Who tries

| Actor | Who |
| --- | --- |
| `anon` | Signed out |
| `suspended` | A member of the demo clan whose account is suspended |
| `outsider` | Admin of another clan and lead of its event, not in the demo clan |
| `pending` | Asked to join the demo clan, not approved yet |
| `member` | Plain member, coming to Lakeside LAN |
| `lead` | Plain member, lead of Lakeside LAN only |
| `recruiter`, `organizer`, `clanAdmin` | The clan roles (organizer is "Event manager") |
| `support`, `moderator` | Platform staff, not in the demo clan (they may look, not change) |
| `owner` | Platform owner |

## How it decides

Each row in `tests/authz/matrix.ts` names an action, the arguments to call it with, and who is allowed. For every actor who isn't allowed, the test calls the action and compares the whole database before and after: any change fails the test. Actions with no lasting effect here (mail, Discord, Stripe) must throw or return an error instead, and downloads must answer with an error status.

Then one allowed actor runs the same call, and it must change something (or, for downloads, get the file). That proves the arguments reach the real code: without it, a typo in the test would look like a correct denial.

After each call the database is put back, so rows don't affect each other.

## Adding a server action

The test fails when an exported server action, or a `"use server"` file, has no row in `matrix.ts`. Add one:

```ts
{ name: "event-actions.postNews", allow: LAN_MANAGERS, run: () => eventActions.postNews(fx.lan, "Hello") },
```

- `allow` is who may do it; everyone else must be refused. Reuse the groups at the top of the file (`MEMBERS`, `LAN_MANAGERS`, `CLAN_SETTINGS`, ...).
- Point at demo data through `fx` (ids are filled in by `tests/authz/harness.ts`). If you need something the demo data doesn't have, add it in `setup()` there.
- `positive` picks who runs the positive control (default: the first allowed actor). Pick the least privileged one, so the test shows that role really works.
- `effect: "none"` for actions that only send something; `effect: "read"` for route handlers.
- Several rows for one action are fine when the answer depends on the target ("own post" vs "someone else's").

## How it works

The actions run in plain Node: `tests/authz/setup.cjs` picks the database and replaces `next/headers` and `next/cache` with small stubs, and each actor signs in with email and password through Better Auth, so the real session code decides who is calling. Redirects to the sign-in page, `/suspended` or `/admin` count as refusals.
