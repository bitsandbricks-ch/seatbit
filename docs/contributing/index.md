# Contributing

Seatbit is a small open-source project. Bug reports, ideas, docs fixes and code are all welcome.

## Before you start

| | |
| --- | --- |
| **Bugs and ideas** | Open an [issue](https://github.com/bitsandbricks-ch/seatbit/issues/new/choose) first, so we agree on the approach before you write code. |
| **Security problems** | Don't open a public issue. See [SECURITY.md](https://github.com/bitsandbricks-ch/seatbit/blob/main/SECURITY.md). |
| **Conduct** | Be kind. See the [Code of Conduct](https://github.com/bitsandbricks-ch/seatbit/blob/main/CODE_OF_CONDUCT.md). |
| **Setup** | See [Development](../development/index.md). |

## Pull request flow

1. **Branch.** Work on your own branch (or fork), never on `main`. One topic per branch and pull request.
2. **Change.** Follow the [code guidelines](guidelines.md). A user-facing or setup change updates the [docs](docs.md) in the same pull request.
3. **Check locally.** These must pass before you push:
    ```sh
    npm run lint
    npm run check:i18n      # UI text that skips t()
    npm run check:mail      # mail sent outside the template helpers
    npm run typecheck
    npm run build
    mkdocs build --strict   # when you touched docs/ or mkdocs.yml
    ```
4. **Open a draft pull request.** Fill in the template: what and why, linked issue, screenshots for UI changes (phone and desktop), the checklist.
5. **Wait for CI.** `CI`, `Docs` and `Container image` must be green. Fix failures; never skip or weaken a check. See [CI](../development/ci.md).
6. **Mark it ready for review** when the work is done, the checklist is ticked and checks are green.
7. **Keep it current.** Update the description when you push more commits (e.g. new env vars). Merge `main` into your branch when it conflicts; don't force-push a branch others work on.
8. **Merge** is the maintainer's call.

## Pull request checklist

- [ ] `npm run lint`, `npm run typecheck` and `npm run build` pass
- [ ] Tested on a phone-sized and a desktop-sized window (UI changes)
- [ ] New migration has the next free number and runs on an existing database (schema changes)
- [ ] Docs in `docs/` updated for user-facing or setup changes
- [ ] New pages are added to `scripts/screenshots.ts`

## License

Seatbit is licensed under the [GNU AGPL-3.0](https://github.com/bitsandbricks-ch/seatbit/blob/main/LICENSE) with the additional terms in [NOTICE.md](https://github.com/bitsandbricks-ch/seatbit/blob/main/NOTICE.md). By contributing, you agree that your contribution is licensed under the same terms.
