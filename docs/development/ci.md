# CI and releases

All checks run on GitHub Actions. Every pull request must pass them before it is merged.

## Workflows

| Workflow | When | What |
| --- | --- | --- |
| **CI** (`ci.yml`) | Pull requests, merge queue, pushes to `main` | Existing screenshots unchanged, lint, `drizzle-kit check` (colliding migrations), untranslated text, typecheck, unit tests, build, render every page on demo data (smoke test), then the [end-to-end tests](testing.md). The screenshots and, on failure, the Playwright report are attached to the run. |
| **Docs** (`docs.yml`) | Pull requests, merge queue; `main` publishes | `mkdocs build --strict` (broken links and missing images fail), deploy to GitHub Pages. |
| **Container image** (`image.yml`) | Pull requests and the merge queue build; `main` and `v*` tags push | Native amd64 and arm64 builds, merged into one multi-arch image on GHCR. |
| **Screenshots** (`screenshots.yml`) | Pushes to `main` that touch the UI | Regenerate `docs/screenshots/` and open or update an *Update screenshots* pull request. See [Screenshots](screenshots.md). |

Dependabot opens weekly npm updates (minor and patch grouped) and monthly GitHub Actions and pip updates.

## Merging

Many pull requests run in parallel, and each merge makes the others stale. Two repository settings keep that cheap; a maintainer turns them on under **Settings**:

1. **General → Pull Requests → Allow auto-merge.** A pull request can then be set to *merge when ready* and lands as soon as its checks are green and it is approved, instead of waiting to be noticed.
2. **Rules → Rulesets → New branch ruleset** for `main` with **Require status checks to pass** (*Lint, typecheck, build*, *build* from Docs, *Build amd64* and *Build arm64*) and **Require merge queue**. The queue merges ready pull requests one by one and tests each on top of the ones before it, so two pull requests that each pass alone can't break `main` together. The CI, Docs and Container image workflows run on `merge_group` for this.

Without the merge queue, merge ready pull requests soon after they are green, oldest first.

## Image tags

| Tag | |
| --- | --- |
| `:main` | Latest build of `main`. |
| `:main-<UTC timestamp>-<sha>` | Every main build, sortable. |
| `:sha-<short sha>` | A specific commit. |
| `:1.2.3` | Releases, from `v1.2.3` tags. |

The image workflow passes the commit as the `GIT_COMMIT` build arg (on pull requests the branch head). `next.config.ts` bakes it in as `SEATBIT_COMMIT`, and the root layout shows and links it.

## Docs site

The docs are built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) from `docs/` and `mkdocs.yml` and published to GitHub Pages from `main`. See [Writing docs](../contributing/docs.md).
