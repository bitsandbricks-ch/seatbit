# 0004 Screenshots are rendered on `main` only

**Context:** the docs screenshots are generated from the demo data (`npm run screenshots`). Binary files can't be merged, so every branch that re-rendered them conflicted with every other.

**Decision:** feature pull requests don't commit re-rendered screenshots; CI fails if they change an existing one. After a merge to `main`, the `Screenshots` workflow renders them and opens a pull request. A new shot is a new file and may be committed with the docs that use it.

**Consequences:** reviewers see UI changes in the pull request description or the CI `screenshots` artifact. See [Screenshots](../development/screenshots.md).
