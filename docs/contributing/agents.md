# AI coding agents

AI coding agents (Claude Code, Codex, Copilot, ...) follow [AGENTS.md](https://github.com/bitsandbricks-ch/seatbit/blob/main/AGENTS.md) in the repository root; `CLAUDE.md` imports it. The rules are the same as for humans, written down so an agent can follow them without asking.

## Summary

| Rule | |
| --- | --- |
| **Branch** | Own branch, one topic per pull request, never push to `main`. |
| **Checks** | `lint`, `typecheck`, `build` (and `mkdocs build --strict` for docs) pass before pushing. |
| **Pull request** | Opened as a **draft** with the template filled in, linked issue, screenshots for UI changes. |
| **CI** | Wait for `CI`, `Docs` and `Container image`; fix failures, never skip or weaken a check. |
| **Done** | Mark the pull request **ready for review** when the task is complete, the checklist is ticked and checks are green. |
| **Merging** | Never merge your own pull request; never force-push a branch someone else works on. |
| **Conflicts** | Merge `main` and resolve conflicts (including [migration numbers](../development/database.md#merge-conflicts-in-migrations)) when `main` moves. |
| **Description** | Keep it current with each push. |
| **Docs** | User-facing or setup changes update `docs/` in the same pull request. |

Code rules: see [Code guidelines](guidelines.md). AGENTS.md is the source of truth; update both when a rule changes.
