# Platform admin

Platform staff run the instance: they see all clans, events and users, change the platform settings and handle abuse reports. What each person may do depends on their platform role.

**Who:** platform owners, admins, moderators and support · **Where:** *Admin*

![Admin](../screenshots/desktop-admin.png){ .shot }

## Platform roles

| Role | Can |
| --- | --- |
| **Owner** | Everything, including the *Supporters* (billing) and *Operator & legal* settings and giving the owner role. |
| **Admin** | Platform settings and mail templates, manage every clan and event like their admins, give and take the moderator and support roles, reports and suspensions. |
| **Moderator** | The [report queue](moderation.md), suspending and restoring users and clans. No settings. |
| **Support** | Read-only: the admin page, every clan and event, the audit log. To help people, without changing anything. |

The first account is always owner, as is anyone in the **Admin emails** setting. Give roles in the user list on the admin page or with the [admin CLI](../installation/operations.md#admin-cli). Nobody changes their own role, and admins can't touch owners or other admins, so there is always an owner. The last owner can't delete their account.

!!! note "Upgrading"
    Instances from before platform roles had one admin flag. The upgrade turns every existing admin into an owner, so nobody loses rights.

## Admin page

| Section | |
| --- | --- |
| **Clans, events, users** | Everything on the instance. Give platform roles and suspend users or clans from the lists. Deleted accounts only show as a count. |
| **Reports** | Abuse reports from members. See [Reports and suspensions](moderation.md). |
| **Audit log** | Every clan's log plus platform changes. See [Audit log](audit-log.md#platform-audit-log). |
| **Platform settings** | Instance configuration, see below. Owners and admins only. |

A moderator sees the same page without the settings, and support without any buttons:

![Admin page of a moderator](../screenshots/desktop-admin-moderator.png){ .shot }

## Platform settings

| Tab | | Docs |
| --- | --- | --- |
| **Email** | SMTP server, sender, test mail. | [Email](../installation/email.md) |
| **Discord** | Login app, bot token, slash commands, bot invite link. | [Discord app and bot](../installation/discord.md) |
| **Sign-up & admins** | Allow new accounts, admin emails. | [Configuration](../installation/configuration.md) |
| **Reminders** | Check interval, cron secret. | [Configuration](../installation/configuration.md#reminders-without-a-long-running-process) |
| **Operator & legal** | Operator details, own terms and privacy URLs, source URL. Owners only. | [Operator, privacy and terms](../installation/legal.md) |
| **Supporters** | Stripe keys and prices. Owners only. | [Stripe](../installation/stripe.md) |
| **Mail templates** | The wording of every email. | [Email](../installation/email.md#mail-templates) |
| **Server** | Startup values (read-only). | [Configuration](../installation/configuration.md#startup-environment-only) |

![Platform settings](../screenshots/desktop-admin-discord.png){ .shot }
