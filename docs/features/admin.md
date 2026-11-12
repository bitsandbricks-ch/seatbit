# Platform admin

Platform admins run the instance: they see all clans, events and users and change the platform settings.

**Who:** platform admins · **Where:** *Admin*

The first account is always admin. Add more with the **Admin emails** setting, in the user list, or with the [admin CLI](../installation/operations.md#admin-cli).

![Admin](../screenshots/desktop-admin.png){ .shot }

## Admin page

| Section | |
| --- | --- |
| **Clans, events, users** | Everything on the instance. Make someone admin or take it away in the user list. Deleted accounts only show as a count. |
| **Audit log** | Every clan's log plus platform changes. See [Audit log](audit-log.md#platform-audit-log). |
| **Platform settings** | Instance configuration, see below. |

## Platform settings

| Tab | | Docs |
| --- | --- | --- |
| **Email** | SMTP server, sender, test mail. | [Email](../installation/email.md) |
| **Discord** | Login app, bot token, slash commands, bot invite link. | [Discord app and bot](../installation/discord.md) |
| **Sign-up & admins** | Allow new accounts, admin emails. | [Configuration](../installation/configuration.md) |
| **Reminders** | Check interval, cron secret. | [Configuration](../installation/configuration.md#reminders-without-a-long-running-process) |
| **Operator & legal** | Operator details, own terms and privacy URLs, source URL. | [Operator, privacy and terms](../installation/legal.md) |
| **Supporters** | Stripe keys and prices. | [Stripe](../installation/stripe.md) |
| **Mail templates** | The wording of every email. | [Email](../installation/email.md#mail-templates) |
| **Server** | Startup values (read-only). | [Configuration](../installation/configuration.md#startup-environment-only) |

![Platform settings](../screenshots/desktop-admin-discord.png){ .shot }
