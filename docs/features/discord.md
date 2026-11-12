# Discord and WhatsApp

The Seatbit bot posts each event to the clan's Discord server with answer buttons, sends reminders and DMs, and has slash commands. For WhatsApp, Seatbit prepares texts to paste.

**Who:** clan admins connect the server; orgas post per event; members answer and get DMs · **Where:** clan *Manage → Discord & WhatsApp*; event *Manage → Discord & WhatsApp*

!!! note "Instance setup"
    The bot needs a Discord application set up by the platform admin first. See [Discord app and bot](../installation/discord.md).

## Connect the clan's server

1. Open **Clan settings → Discord & WhatsApp** and click **Add the Seatbit bot** to invite it to your server.
2. In the channel the bot should post in, run `/seatbit here`. You need *Manage Server* on Discord and a Discord account linked in Seatbit. If you admin several clans, use `/seatbit here clan:<name>`.

![Clan Discord settings](../screenshots/desktop-clan-discord.png){ .shot }

A Discord server belongs to one clan.

## What the bot does

| | |
| --- | --- |
| **Announcements** | Each published event is posted with **Coming / Unsure / Not coming** buttons. The attendee list on the post updates live, also for answers on the website, and shows tickets, seat bookings and the next deadline. Pinned if the bot has *Pin Messages*. Turns red when the event is cancelled. |
| **Reminders** | Answer, ticket and "starts soon" reminders as cards with the deadline, the ticket link and who's still open, pinging the members they apply to. |
| **News** | With a thread or a channel per event (see below), orga news is posted there too. |
| **DMs** | When something changes for a member (their seat, the final plan, reminders, nudges), with buttons like *I booked it*. Members can turn DMs off on their profile. |
| **Join requests** | Admins and recruiters get a DM when someone asks to join or claims a guest. |
| **Server invite** | Members who aren't on the server see **Join our Discord** on the clan page. The bot creates the invite if it has *Create Invite*; otherwise paste your own invite link in the clan settings. |

## Thread or channel per event

Each [LAN type](clans.md#lan-types) chooses where the bot puts its events, under **Discord** in the type's settings:

| Setting | Announcement | Reminders and news |
| --- | --- | --- |
| **In the linked channel** (default) | Linked channel | Linked channel (news only by DM and mail) |
| **Thread per event** | Linked channel | A thread on the announcement, named after the event |
| **Channel per event** | A new channel named after the event, in the linked channel's category | That channel. The linked channel gets a short pointer to it. |

![LAN type with a thread per event](../screenshots/desktop-lan-type-edit.png){ .shot }

A thread needs the bot's *Create Public Threads* and *Send Messages in Threads* permissions, a channel per event needs *Manage Channels*. Without them the bot falls back to the linked channel. One-off events without a type use the linked channel. Changing the setting applies to events posted afterwards. Delete an event's channel on Discord when you no longer need it; the bot then uses the linked channel again.

## Commands

| Command | What it does |
| --- | --- |
| `/lans` | Your upcoming LANs of this server's clan (in DMs: all your clans) with answer buttons. Only you see it. |
| `/claim` | Take over the guest profile the orgas made for you. Lists the clan's guests with your name or nick; `/claim guest:<name>` picks one. See [Claiming a guest on Discord](members-guests.md#on-discord). |
| `/guest guest:<name> member:<name>` | Orgas who manage members: say which Discord member a guest is. `member` suggests only people on the server who aren't in the clan on Seatbit yet. See [Linking a guest to a Discord member](members-guests.md#on-discord). |
| `/seatbit here` | Link this channel to your clan. |
| `/seatbit announce` | Post the clan's upcoming LANs in this channel. |
| `/seatbit stop` | Unlink this channel. |

## Per event

*Manage → Discord & WhatsApp* on an event: re-post the announcement or post a reminder by hand.

![Event Discord and WhatsApp](../screenshots/desktop-manage-chat.png){ .shot }

## WhatsApp

WhatsApp can't be automated for normal groups and communities, so Seatbit prepares the texts: an announcement and reminder texts with **Copy** and a **Share via WhatsApp** link, on the same tab.
