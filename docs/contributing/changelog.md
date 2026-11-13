# Changelog entries

Seatbit keeps user-facing release notes in English and German. They show in the app under **What's new** (`/changelog`, linked in the footer), in the [docs changelog](../changelog/index.md), in the platform admins' upgrade notice and in the public announcements Discord channel when a new version runs.

**Every pull request that changes something people notice adds an entry**: a new feature, a visible improvement, a bug fix people ran into. Internal changes (refactoring, CI, dependency bumps, docs only) don't.

## One file per entry

Each entry is its own file in `changelog/`, so parallel pull requests never edit the same lines:

```text
changelog/2026-11-13-light-theme.yml
```

The name is the day the change is merged (your best guess is fine) plus a short slug in lowercase with dashes.

```yaml
date: 2026-11-13          # same day as in the file name
type: new                 # new | improved | fixed
audience: everyone        # optional: everyone (default) | admins
pr: 103                   # optional: a number or a list [95, 102]
en:
  title: Light theme
  text: >-
    Switch between dark, light and your device's setting in the top bar.
de:
  title: Helles Design
  text: >-
    Wechsle oben in der Leiste zwischen dunkel, hell und der Einstellung deines Geräts.
```

| Field | |
| --- | --- |
| `type` | **new** for a feature, **improved** for a change to an existing one, **fixed** for a bug fix. |
| `audience` | **admins** for things only the people running the instance notice (settings, backups, upgrades, the admin pages). The app shows those to the platform team only, and the announcements channel leaves them out. |
| `en`, `de` | Both are required. `title` is one line (under 120 characters); `text` is optional, one or two sentences of plain text. |

## Writing

- Write for the people who use Seatbit, not for developers: what they can do now, not how it was built. No PR titles, no file names.
- Short: a title that reads on its own, and a sentence or two if it needs explaining.
- Use the app's words: *lead* (German *Lead*, never "orga"), *Coming / Unsure / Not coming*, *Manage*.
- German: Swiss spelling (*ss*, never *ß*), *du*, quotes «…».
- One entry per change people notice. A big pull request can add two files; a follow-up fix to an unreleased entry edits that entry instead of adding one.

## Check

```sh
npm run check:changelog
```

It checks the YAML, the fields, both languages and the Swiss spelling. CI runs it too.

## Where it goes

| Place | What it shows |
| --- | --- |
| App, **What's new** | All entries in the person's language; *admins* entries for the platform team only. |
| Docs, [Changelog](../changelog/index.md) | All entries, English and German pages. |
| Upgrade notice (mail and DM to platform admins, ops channel) | The entries that came with the new version. |
| Announcements channel | The new entries for *everyone*, in the instance's language, with a link to *What's new*. Nothing is posted for a version without such entries. |

An instance remembers which entries it announced, so each entry is announced once, on the first start of the version that brought it.
