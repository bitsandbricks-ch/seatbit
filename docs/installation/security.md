# Security hardening

What Seatbit does to protect its users, and what you as the operator of an instance should set up around it. To report a vulnerability, see the [security policy](https://github.com/bitsandbricks-ch/seatbit/security/policy).

## Built in

| Area | What Seatbit does |
| --- | --- |
| **Sign-in** | Discord OAuth through Better Auth. Session cookies are `HttpOnly`, `SameSite=Lax` and `Secure` when `BETTER_AUTH_URL` is `https://`. Sign-in and sign-up are rate limited per visitor. |
| **Permissions** | Every server action and download checks the signed-in account itself: platform roles (owner, admin, moderator, support; moderators and support see every clan's events read-only), clan roles (admin, event manager, recruiter) and event leads. Suspended and deleted accounts count as signed out, on the website and in Discord. |
| **Cross-site requests** | Next.js server actions only accept requests from the same origin; Better Auth checks the origin of its own endpoints. |
| **Browser headers** | A Content Security Policy with a fresh nonce per page (only Seatbit's own scripts run), `frame-ancestors 'none'` and `X-Frame-Options: DENY` (no embedding), `X-Content-Type-Options: nosniff`, a strict referrer policy, `Cross-Origin-Opener-Policy`, a restrictive `Permissions-Policy` and HSTS. |
| **User content** | React escapes everything people type; mails escape it too. Links people enter (event website, ticket shop, games, food menus, profile link patterns) must be `http(s)`. Mentions in Discord posts are switched off, so no one can ping `@everyone` through Seatbit. |
| **Redirects** | "Come back here after signing in" only accepts paths on the same site. |
| **Uploads** | Avatars must really be PNG, JPEG, WebP or GIF (checked by content, not by the name the browser sends), at most 2 MB, and are served with `nosniff` and a sandboxing CSP. |
| **Exports** | The CSV export for leads neutralises cells that spreadsheet apps would read as formulas. Exports and backups aren't cached. |
| **Webhooks** | Stripe webhooks are checked against their signing secret and a five-minute time window, and each event is applied once. Discord interactions are checked against the app's public key and must be recent. `/seatbit` server commands also check the caller's *Manage Server* permission. |
| **Spam guards** | Reports, new clans, test DMs and everything a lead sends by hand (news, reminders, nudges, guest invites, payment reminders) are rate limited per account. |
| **Secrets** | Secrets saved in the admin settings (SMTP password, bot token, Stripe keys, ...) are encrypted (AES-256-GCM) and never sent to the browser. The audit log records which settings changed, not their values. |
| **Privacy** | Clan leads only see and add people who already share a clan with them; everyone else joins by invite link, request, or an email invite. "Download my data" exports everything about a person; deleting an account removes personal data and keeps only anonymous counts. |
| **Container** | The image runs as an unprivileged user (uid 1001) and works with a read-only root filesystem. Only the runtime dependencies end up in it (not even npm). Each build is scanned for known vulnerabilities (Trivy), and Dependabot keeps dependencies and the base image current. |
| **Tests** | An automated test tries every action as signed out, suspended, another clan's admin, pending, member, lead, each clan role and platform staff, on every change (see [Permission tests](../development/permission-tests.md)). |

## Your checklist

### Secrets

- Set a long random `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and keep it out of git. It signs sessions and, unless you set `SETTINGS_ENCRYPTION_KEY`, encrypts the saved secrets: losing it means saving those again.
- Keep secrets in a Kubernetes `Secret` (or Docker secrets / an env file only root can read), ideally managed with Sealed Secrets, SOPS or an external secret store.
- Set a `CRON_SECRET` only if you call `/api/cron/reminders`; without one the endpoint is off.
- Rotate the Discord client secret, bot token and Stripe keys when someone who had access leaves.

### Reverse proxy

- Serve Seatbit over HTTPS only and redirect plain HTTP. `BETTER_AUTH_URL` must be the public `https://` address.
- Your proxy must pass the original `Host` header and set `X-Forwarded-For`. Seatbit finds the visitor's address by skipping the proxies listed in **Trusted proxies** (default: private address ranges). If your proxy has a public address, add it there, otherwise login rate limits can't tell visitors apart.
- Don't let clients set `X-Forwarded-For` past your edge if you can avoid it (on ingress-nginx, keep `use-forwarded-headers` off unless another proxy sits in front).
- Limit request bodies to a few MB (the largest upload is a 2 MB avatar), e.g. `nginx.ingress.kubernetes.io/proxy-body-size: 4m`.
- Seatbit sets its own security headers; you don't need to add them at the proxy. If you do, don't add a second, different `Content-Security-Policy`.

### Kubernetes

- Use the hardened deployment from [Kubernetes](kubernetes.md): non-root, read-only root filesystem, all capabilities dropped, no privilege escalation, `RuntimeDefault` seccomp, no service account token.
- Add a `NetworkPolicy`: allow ingress only from your ingress controller on port 3000, and egress only to DNS and HTTPS (Discord, Stripe) plus your SMTP server. Seatbit never fetches addresses that users enter.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: seatbit
spec:
  podSelector: { matchLabels: { app: seatbit } }
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: ingress-nginx } }
      ports: [{ port: 3000 }]
  egress:
    - ports: [{ port: 53, protocol: UDP }, { port: 53, protocol: TCP }]
    - to: [{ ipBlock: { cidr: 0.0.0.0/0, except: [10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16] } }]
      ports: [{ port: 443 }, { port: 587 }, { port: 465 }]
```

- Pin the image by digest (or a commit tag) instead of `:main` if you want to control when updates land, and update regularly.

### Data

- `/data` and the backups hold all personal data, including emails and LAN IDs. Keep both volumes private, encrypt backups you copy off the cluster, and delete old ones (Seatbit keeps its own backups for the time set in the admin settings).
- Only give the platform **owner** role to people who need backups and billing; use **admin**, **moderator** and **support** for everything else.

## Known limits

- Rate limits are kept in memory: they reset when Seatbit restarts. That is fine for the single-instance setup Seatbit supports.
- Styles may be inline (`style-src 'unsafe-inline'`), because React style attributes need it. Scripts are strictly limited by the nonce.
- A guest invite sent to an address that already has an account is taken over automatically at that person's next sign-in with Discord (verified email). Leads should only enter addresses they know belong to the guest.
- Clan leads see the email addresses of their clan's members and guests; event members see their leads' email address. That's how they reach each other.
