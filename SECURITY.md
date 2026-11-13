# Security policy

## Supported versions

Seatbit is released from the `main` branch. Security fixes go into `main` and the next container image (`ghcr.io/bitsandbricks-ch/seatbit:main`). Please keep your instance on a recent image.

## Reporting a vulnerability

Please **don't open a public issue** for security problems.

Report them privately through GitHub: open the repository's [Security tab](https://github.com/bitsandbricks-ch/seatbit/security) and click **Report a vulnerability**. Include:

- what is affected (page, API route, Discord command, ...) and the version or image tag;
- steps to reproduce, or a proof of concept;
- what an attacker could do with it.

We aim to answer within a week and to ship a fix as soon as we can. We will credit you in the release notes unless you'd rather stay anonymous.

## Scope

In scope: the Seatbit code in this repository and the container image built from it.

Out of scope: how a particular instance is configured or hosted (contact that instance's operator, listed on its `/privacy` page), Discord itself, and denial-of-service by flooding.

## Security model

Seatbit is built for one group per instance or a handful of clans on one shared instance. Sign-in is Discord OAuth; every server action and download checks the account's platform role, clan role or event lead role itself. The protections that are built in (CSP, header hardening, upload checks, webhook signatures, rate limits, ...) and what operators should set up around Seatbit are listed in [Security hardening](docs/installation/security.md).

## For operators

The short version (details in [Security hardening](docs/installation/security.md)):

- Set a strong `BETTER_AUTH_SECRET` (e.g. `openssl rand -base64 32`) and keep it secret. Saved secrets (SMTP password, bot token, ...) are encrypted with a key derived from it, or from `SETTINGS_ENCRYPTION_KEY`.
- Run Seatbit behind HTTPS only, with `BETTER_AUTH_URL` set to the public `https://` address. List your reverse proxy under **Trusted proxies** if it doesn't use a private address.
- Run the container as in the Kubernetes example: non-root, read-only root filesystem, no capabilities, and a network policy.
- Keep the `/data` volume and your backups private: they contain all personal data.
- Set a `CRON_SECRET` if you use `/api/cron/reminders`; without one the endpoint is off.
