# Clans and roles

A **clan** is your group: its members, the LAN types you go to every year, the events and its Discord server. An instance hosts any number of clans; each clan only sees its own events.

**Who:** anyone can start a clan; clan admins configure it · **Where:** *Clans* tab → your clan → *Manage*

## Create a clan

Anyone signed in can start a clan on the **Clans** page (*Start a clan*) and becomes its first admin.

The clan page has **View** and **Manage** (for admins, event managers and recruiters, with the tabs their role allows). Tabs: **Overview**, **Events**, **Members**, **Stats**.

![Clan page](../screenshots/desktop-clan.png){ .shot }

## Roles

Everyone in a clan has one **clan role**:

| | Admin | Event manager | Recruiter | Member |
|---|:-:|:-:|:-:|:-:|
| Clan settings, Discord, delete the clan | ✓ | | | |
| Give and take roles | ✓ | | | |
| Approve join requests, add and remove members, guests, invite links | ✓ | | ✓ | |
| Create events, run every clan event, LAN types | ✓ | ✓ | | |
| Stats and [audit log](audit-log.md) | ✓ | ✓ | ✓ | |
| Answer for events | ✓ | ✓ | ✓ | ✓ |

- A clan always keeps at least one admin.
- Recruiters only remove plain members; people with a role are removed by an admin.
- Admins change roles in the member list or on a member's profile under **Clan role**. The member gets a message.

![Clan role on a member's profile](../screenshots/desktop-member-role.png){ .shot }

**Orgas** are set per event, on top of the clan role. They edit that event, its attendance and seats, and can add co-orgas. Any member can be an orga of a single event. Whoever creates an event and all clan admins become its orgas; admins and event managers can always manage every event. When an event has no orgas of its own, its admins and event managers approve seat swaps and are listed as contacts.

## Clan settings

*Manage* on the clan page. Tabs:

| Tab | |
| --- | --- |
| **General** | Name, description, avatar, join mode, guest claims, how names are shown, and the [Supporter](supporters.md) card when the instance has it on. |
| **Members** | Join requests, guest claims, add existing users, roles. See [Members and guests](members-guests.md). |
| **Guests** | People without an account yet. See [Guests](members-guests.md#guests). |
| **LAN types** | Templates for LANs you go to regularly. See [below](#lan-types). |
| **Invite links** | Links that let anyone who has them join as a member, whatever the join mode. Delete a link to stop it. |
| **Discord & WhatsApp** | Connect the clan's Discord server. See [Discord and WhatsApp](discord.md). |
| **Audit log** | See [Audit log](audit-log.md). |

![Clan settings](../screenshots/desktop-clan-settings.png){ .shot }

**Who can join:**

| Join mode | |
| --- | --- |
| *Approval* (default) | Anyone can ask to join, an admin or recruiter approves. |
| *Open* | Anyone joins directly. |
| *Invite only* | Only with an invite link. |

**Can members claim guests?** An admin confirms each claim (default), same name or nick moves over right away, or only with the guest's own link. See [Members claiming a guest](members-guests.md#members-claiming-a-guest).

**How are members shown?** Pick how people appear on event pages, the seat map, the clan page, in the Discord bot and where orgas manage the clan (event *Manage*, clan settings › *Members* and *Guests*, stats):

| Name display | Example |
| --- | --- |
| *Name "Nick" Surname* (default) | Mike "Reyki" Keller |
| *Name "Nick"* | Mike "Reyki" |
| *Nick only* | Reyki |

The nick is the one for that event or LAN type, as always. Someone without a nick of their own shows as *Mike K.* in the shorter modes. When the display leaves part of the name out, the attendee list in event *Manage*, the member and guest lists in clan settings and a member's profile (for admins, recruiters and the member themself) show the full name in small print below it, so ticket checks still work, and search finds people by their full name too. The audit log, exports, the guest claim list and the admin page always use the full name.

**Verified check mark:** a green check mark after a name means the person has their own Seatbit account (they signed in with Discord). [Guests](members-guests.md#guests) an orga typed in don't have it until they take their guest over.

## LAN types

A **LAN type** describes a LAN party you go to regularly, e.g. *Lock & Load* or *SwitzerLAN*. New events are created from a type and copy its values.

| Field | |
| --- | --- |
| Location, website, ticket shop, price | Copied to each event. |
| Spots | How many people the group usually brings. |
| Seats | The seats you usually get, e.g. `F1-F20`. |
| Usual length | In hours, e.g. Fri 18:00 to Sun 16:00 = 46. Sets the event's end. |
| Answer by | Days before the start members must answer (default 30). |
| Member profile link | Optional. A member's profile on the event's own site, with `{id}` where their LAN ID goes, e.g. `https://example.com/user/?id={id}`. See [Profile links](#profile-links). |
| Discord | Where the bot posts these events, their reminders and news: the linked channel, a thread per event or a channel per event. See [Discord](discord.md#thread-or-channel-per-event). |

Members set a nick and their user ID **per LAN type**, so they enter their name for the event's own site once, not every year.

![LAN types](../screenshots/desktop-lan-types.png){ .shot }

### Profile links

Many LAN sites have a public page per participant, e.g. `https://example.com/user/?id=4039`. Put that link into the LAN type's **Member profile link** with `{id}` instead of the number: `https://example.com/user/?id={id}`. Seatbit then builds each member's link from the LAN ID they entered and shows a **Profile ↗** link:

- next to each name in the event's **Attendees** tab (all members see it),
- in *Manage → Attendees*, on the seat plan's details pane and in the CSV export,
- on the member's clan profile and their own profile.

An event can have its own link (event *Settings*); empty means the LAN type's. Without a profile link, LAN IDs stay visible to orgas, admins and the member only.

## Stats

**Stats** on the clan page shows, per event, how many people were asked, answered and came, ticket and seat numbers, and the answer rate. Admins, event managers and recruiters see it.

![Clan stats](../screenshots/desktop-clan-stats.png){ .shot }
