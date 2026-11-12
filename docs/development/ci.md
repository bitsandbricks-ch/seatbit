# CI and releases

All checks run on GitHub Actions. Every pull request must pass them before it is merged.

## Workflows

| Workflow | When | What |
| --- | --- | --- |
| **CI** (`ci.yml`) | Pull requests, pushes to `main` | Lint, typecheck, build, then render every page on demo data (smoke test). The screenshots are attached to the run. |
| **Docs** (`docs.yml`) | Pull requests; `main` publishes | `mkdocs build --strict` (broken links and missing images fail), deploy to GitHub Pages. |
| **Container image** (`image.yml`) | Pull requests build; `main` and `v*` tags push | Native amd64 and arm64 builds, merged into one multi-arch image on GHCR. |
| **Screenshots** (`screenshots.yml`) | Pushes to `main` that touch the UI | Regenerate `docs/screenshots/` and open or update an *Update screenshots* pull request. See [Screenshots](screenshots.md). |

Dependabot opens weekly npm updates (minor and patch grouped) and monthly GitHub Actions and pip updates.

## Image tags

| Tag | |
| --- | --- |
| `:main` | Latest build of `main`. |
| `:main-<UTC timestamp>-<sha>` | Every main build, sortable. |
| `:sha-<short sha>` | A specific commit. |
| `:1.2.3` | Releases, from `v1.2.3` tags. |

The image workflow passes the commit as the `GIT_COMMIT` build arg (on pull requests the branch head). `next.config.ts` bakes it in as `SEATBIT_COMMIT`, and the footer shows and links it.

## Docs site

The docs are built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) from `docs/` and `mkdocs.yml` and published to GitHub Pages from `main`. See [Writing docs](../contributing/docs.md).
