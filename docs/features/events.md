# Event lifecycle

An **event** is one edition of a LAN the group attends. It goes from draft (optionally an interest check) to published, sign-up, the LAN itself, and next year's copy.

**Who:** orgas, clan admins and event managers create and run events; members answer · **Where:** *New event* on the *LANs* tab or the clan page; *Manage* on the event

| Stage | Who sees it | What happens |
| --- | --- | --- |
| **Draft** | Orgas, clan admins, event managers | Nothing goes out. |
| **Interest check** (optional) | The clan | *Would you come?* answers, date can stay open. |
| **Published** | The clan | Announcement, answers, tickets, seats, reminders. |
| **LAN day** | The clan | Check-in with *I'm here*. |
| **Cancelled** | The clan, greyed out | Everyone who answered is told. Can be undone. |

**Copy for next year** turns a past event into next year's draft.

## Create an event

**Start from** a LAN type to copy its details and seats, or from *Blank* for a one-off event. Everything can be changed later.

![New event](../screenshots/desktop-new-event.png){ .shot }

| Field | |
| --- | --- |
| **Start, end** | Set the start and the end follows from the type's usual length. Moving the start later moves the end and the deadlines by the same amount. |
| **Answer by** | When the group must know who comes (e.g. before booking the seat block). Defaults from the type's days before. |
| **Buy ticket by** | Deadline for tickets. |
| **Spots** | How many people the group can bring. When full, new answers go on the [waitlist](attendance.md#waitlist); orgas choose whether the next in line moves up by itself or they pick. |
| **Seats** | The seats the event gave the group, e.g. `F1-F16, F19-F22`. See [Seats](seats.md). |
| **Event seat plan** | Link to the event's own seat plan where the leads book the group's seats (new every year). |
| **Member profile link** | A member's profile on the event's site with `{id}` for their LAN ID. Empty uses the LAN type's. See [Profile links](clans.md#profile-links). |

Every date field is a text box: type or paste `14.11.2026 18:00`, `14.11. 18` or `14.11.26 1800`, or open the calendar.

![Date picker](../screenshots/phone-date-picker.png){ .shot width="300" }

## Draft, publish and schedule

A new event starts as a **draft**: only its orgas, clan admins and event managers see it, and nothing goes out (no Discord post, no reminders, no messages).

![A draft event](../screenshots/desktop-event-draft.png){ .shot }

- **Publish now** makes it live.
- **Schedule…** sets a time; the server publishes it by itself (checked every minute).

Publishing shows the event to the clan, posts the [Discord announcement](discord.md) with answer buttons, starts the [reminders](reminders.md) and tells members about the new event by email or Discord DM. Members choose per clan whether they hear about all events or only certain LAN types (one-off events always count).

## Interest check

For when you're not sure yet if, or when, the group goes. Turn it on when creating the event, or later under *Settings* while it's a draft or nobody has answered.

- Members answer *I'd come*, *Maybe* or *Not this time*. Nothing is binding.
- The date can stay open with a rough hint like "Spring 2027".
- **Open sign-up** (after setting the date) tells everyone who was interested (except those who said no) and starts normal answers, tickets and seats.

<div class="phones" markdown>
<figure markdown>

![Interest check, member view](../screenshots/phone-interest.png){ .shot }

<figcaption>Member view</figcaption>
</figure>
</div>

![Interest check, orga view](../screenshots/desktop-interest-manage.png){ .shot }

## Manage

Orgas see **View / Manage** next to the event title. *Manage* has the tabs:

| Tab | |
| --- | --- |
| **Overview** | The lead checklist, numbers (coming, unsure, tickets, seats), deadlines, news, [manual reminders](reminders.md#manual-reminders). |
| **Seats** | The seat planner. See [Seats](seats.md#plan-the-seats). |
| **Attendees** | Answers, tickets, LAN IDs, CSV export. See [Attendance](attendance.md#attendee-list). |
| **Who's missing** | Who still owes something, with nudges. See [Who's missing](reminders.md#whos-missing). |
| **Discord & WhatsApp** | Re-post the announcement, post reminders, WhatsApp texts. See [Discord](discord.md#per-event). |
| **Settings** | Details, dates, spots, links, co-orgas, copy, cancel, delete. |

![Manage overview](../screenshots/desktop-manage.png){ .shot }

### Lead checklist

The top of *Manage → Overview* lists what the leads still have to do for the event. Open steps link to the tab where you do them; on phones only the open steps show.

| Step | Done when |
| --- | --- |
| **Publish the event** | The event is published (waits while a scheduled publish is set). |
| **Open sign-up** | Only during an [interest check](#interest-check): you opened sign-up. |
| **Enter the group's seats** | The seat block is entered. |
| **Move people up from the waitlist** | Only when you move people up by hand and a spot is free. |
| **Confirm tickets** | Every ticket of everyone coming is confirmed. Waits on members while nobody reported one. |
| **Seat everyone** | Everyone coming has a seat. With self pick on: *Members pick, you fill the gaps*. |
| **Finalize the seat plan** | The plan is final. |
| **Book the seats on the event site** | Only with an event seat plan link: every seat is ticked as booked. See [Seats](seats.md#book-on-the-event-site). |
| **Approve seat swaps** | Only while swaps wait for approval. |

### News

Short updates ("Doors open at 10:00, bring cash for pizza"). They show on the event page and go by email or Discord DM to everyone coming, unsure or on the waitlist.

### Settings

![Event settings](../screenshots/desktop-manage-settings.png){ .shot }

| Action | |
| --- | --- |
| **Copy for next year** | Creates next year's event as a draft: dates +1 year, seat block, orgas. |
| **Cancel event…** | Tells everyone who answered and turns the Discord post red. The event stays visible, greyed out. Can be undone. |
| **Delete** | Removes a draft or an event for good. |

## On the day

Members coming tap **I'm here** when they arrive, and everyone sees who is still on the way.
