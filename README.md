<p align="center"><img src="brand/logo/seatbit-logo.svg" alt="Seatbit" width="260"></p>

<p align="center">
  <a href="https://github.com/bitsandbricks-ch/seatbit/actions/workflows/ci.yml"><img src="https://github.com/bitsandbricks-ch/seatbit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://bitsandbricks-ch.github.io/seatbit/"><img src="https://github.com/bitsandbricks-ch/seatbit/actions/workflows/docs.yml/badge.svg" alt="Docs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-2ee59d" alt="License: AGPL-3.0"></a>
  <a href="https://buymeacoffee.com/bitsandbricks"><img src="https://img.shields.io/badge/buy%20me%20a%20coffee-bitsandbricks-2ee59d?logo=buymeacoffee&logoColor=white" alt="Buy Me a Coffee"></a>
</p>

Seatbit helps a clan or group of friends go to LAN parties run by others (think SwitzerLAN or Lock & Load, with 30+ people): who's coming, who has bought a ticket, who sits where in the group's seat block, who drives whom and what to install before you leave. Self-host it with one container.

**📖 Documentation: [bitsandbricks-ch.github.io/seatbit](https://bitsandbricks-ch.github.io/seatbit/)**

| | |
| --- | --- |
| [**Features**](https://bitsandbricks-ch.github.io/seatbit/features/) | Events, attendance, seats, clans and guests, travel, games, food, Discord bot, audit log |
| [**Installation**](https://bitsandbricks-ch.github.io/seatbit/installation/) | Docker, Kubernetes, configuration, Discord app, email, Stripe, operator details |
| [**Development**](https://bitsandbricks-ch.github.io/seatbit/development/) | Local setup with demo data, architecture, migrations, screenshots, CI |
| [**Contributing**](https://bitsandbricks-ch.github.io/seatbit/contributing/) | Pull request flow, code guidelines, docs, AI agents |

## Highlights

- **Attendance and tickets:** coming / unsure / not coming, waitlist, deadlines with email and Discord reminders, leads confirm tickets.
- **Seat plan** of the group's block (e.g. `F1-F16, F19-F22`): seat wishes, self pick, drag and drop planner, then everyone books the same seat on the event's own site.
- **At the LAN:** rides and places to sleep, private packing lists, game votes, food orders.
- **Clans** with roles, guests, invite links, **clan payments** (dues, ticket money, who paid) and a **Discord bot** with answer buttons.
- **Self-hosted:** one container, SQLite, every setting in the browser.

| LANs | Event | Seat plan | Lead: who's missing |
| --- | --- | --- | --- |
| <img src="docs/screenshots/phone-lans.png" width="200" alt="LAN list on a phone"> | <img src="docs/screenshots/phone-event.png" width="200" alt="Event page on a phone"> | <img src="docs/screenshots/phone-seat-plan.png" width="200" alt="Seat plan with the details sheet"> | <img src="docs/screenshots/phone-manage-missing.png" width="200" alt="Who's missing with nudge buttons"> |

## Quick start

```sh
docker run -d -p 3000:3000 -v seatbit-data:/data \
  -e BETTER_AUTH_URL=https://seatbit.example.com \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  -e DISCORD_CLIENT_ID=... -e DISCORD_CLIENT_SECRET=... \
  ghcr.io/bitsandbricks-ch/seatbit:main
```

Sign in with Discord (the first account becomes admin), then follow the [installation guide](https://bitsandbricks-ch.github.io/seatbit/installation/).

For development: `npm install`, `npm run seed`, `npm run dev`; see [Development](https://bitsandbricks-ch.github.io/seatbit/development/). Contributions are welcome: [CONTRIBUTING.md](CONTRIBUTING.md); AI coding agents follow [AGENTS.md](AGENTS.md). Security issues: [SECURITY.md](SECURITY.md).

## License

Seatbit is free software under the [GNU Affero General Public License v3.0](LICENSE), with [additional terms](NOTICE.md): keep the "Powered by bitsandbricks.ch" and "Source" links when you run it for others. Brand assets and guidelines are in [`brand/`](brand/BRAND.md).
