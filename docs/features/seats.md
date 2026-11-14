# Seats

The **seat plan** shows the group's seat block. Members send seat wishes or pick a seat, leads plan and finalize it, then everyone books the same seat on the event's own site.

**Who:** members view, wish and pick; leads plan · **Where:** event *Seats* tab; *Manage → Seats*

![Seat plan with the details panel](../screenshots/desktop-event-seats.png){ .shot }

## The plan

- Each letter is a row; each seat sits at its number. A dotted gap means those numbers aren't the group's.
- Seats show the seat label or the first letters of the nick. **Large** shows whole nicks (remembered on the device).
- Tap a seat for details: a panel on the right on desktop, a sheet at the bottom on phones.
- **Find someone** highlights a person.

## Seat steps

| Step | |
| --- | --- |
| 1. **Seat wishes** | Members list their wishes as ranked rules, most important first (see [Seat wishes](#seat-wishes)). On Discord: `/wish`. |
| 2. **Self pick** (optional) | Leads turn it on; members with a ticket tap a free seat and **Take this seat**, **Move here** or **Give up my seat**. |
| 3. **Final plan** | Leads finalize. This closes wishes and self pick, shows everyone the plan and can tell everyone their seat. Later changes notify the people who moved. **Reopen** goes back. |

Seats only count, and everyone sees the plan, once it is final. The member [checklist](attendance.md#checklist) follows these steps: *Pick your seat* (or the optional *Send seat wishes*), then *Leads confirm your seat*.

<div class="phones" markdown>
<figure markdown>

![Picking a seat](../screenshots/phone-seat-picking.png){ .shot }

<figcaption>Self pick</figcaption>
</figure>
<figure markdown>

![Final seat plan](../screenshots/phone-seat-plan.png){ .shot }

<figcaption>Final plan</figcaption>
</figure>
<figure markdown>

![Lead seat editing on a phone](../screenshots/phone-manage-seats.png){ .shot }

<figcaption>Lead: editing</figcaption>
</figure>
</div>

## Seat wishes

On the event's *Seats* tab, each member keeps a list of wishes. Every wish is a rule:

| Rule | Met when |
| --- | --- |
| **Near someone** | You sit as close as you chose: right next to them, within 2 or 3 seats, or anywhere in the same row. |
| **Away from someone** | The reverse: not right next to them, not within 2 or 3 seats, or not in the same row. |
| **A seat** | You get that seat. Add several to rank alternatives ("F7, else F9"). |
| **A row** | You sit in that row. |
| **At the edge** / **In the middle** | Your seat is (or isn't) at the end of a row. You can have one of the two. |

The order is the priority: the top wish counts most, each one below half as much as the one above, so a wish outweighs all the wishes below it together. Everyone's wishes add up to the same total, so a member with ten wishes doesn't count more than one with three. Drag a wish by its handle (works with touch) or use the arrows to move it; every change saves right away. A wish that contradicts an older one (near and away from the same person, edge and middle) takes the older one's place. Change how close or how far on the wish itself. Up to 20 wishes, plus a free-text note for the leads.

## Plan the seats

*Manage → Seats*.

![Lead seat plan](../screenshots/desktop-manage-seats.png){ .shot }

**Our seats:** enter the seats the event gave you, e.g. `F1-F16, F19-F22`. Saving again keeps assignments for seats that stay in the list. **Edit seats** in the map shows every number of a row: tap a dashed one to add it, a seat to remove it.

Tap a seat:

| Action | |
| --- | --- |
| **Give seat to** | Assign someone. |
| **Swap / move** | Swap two people or move one. |
| **Clear** | Free the seat. |
| **Hold** | Members can't take it and auto-assign skips it (e.g. for a guest). |
| **Rename** | Match the event's numbering. |

People coming without a seat are listed under **Not seated yet**: tap one, then a seat. On desktop, drag names onto seats and seated people onto other seats to swap.

**Fill free seats** seats everyone without a seat; **Re-plan everyone** starts over. The planner follows seat wishes in each member's order, so when two wishes can't both be met the higher one wins, and it seats people with a ticket first. It first seats people one by one, then keeps moving and swapping them while that makes the people involved happier overall, so a wish like "near Reykime" is still met when Reykime was seated earlier. Held seats never move, and **Fill free seats** leaves people who already have a seat where they are.

**Re-plan automatically when wishes change** (under *Our seats*) re-plans every seat that isn't held whenever someone changes their wishes, on the website or with `/wish`, and once right away when you turn it on. It pauses while self pick is on and once the plan is final, so it never moves a member's own pick or a final seat.

Seat pages update by themselves when the plan or someone's wishes change, so leads and members don't need to reload (see [Live updates](events.md#live-updates)).

The **Seat wishes** card scores the current plan: for each member the share of their wishes that are met, weighted by their order (a met top wish counts more), and the average over everyone. **Needs a look** (the default) lists only members whose wishes aren't all met or can't be checked yet; **Everyone** lists all members with wishes. Each member is one line, lowest score first: their seat, how many wishes are met, their score and the wishes the plan misses. Tap a member for all their wishes in order (✓ met, ✗ missed, · can't be checked yet because they or the other person have no seat) and their note. The seat details panel shows the same for one person.

The **Plan history** card lists every change to the seats, newest first: re-plans (by a lead, or automatic after a wish change), moves, swaps, held seats and the final plan. For each re-plan it shows who moved from which seat to which, or that nobody moved.

## Book on the event site

When the event has an **event seat plan** link, the leads book everyone's seat there once the plan is final. *Manage → Seats → Booking on the event site* lists every seat with the person and their LAN ID: book it on the event site and tick it off. Members see *Booked on the event site* in their checklist, the Attendees tab shows *booked on site*, and the [lead checklist](events.md#lead-checklist) counts the open ones. A seat change (or an approved swap) clears the tick, so the leads book again.

## Seat swaps

After the plan is final, a member can ask another to swap. Once the other agrees, a lead **approves** or rejects it on the Seats tab, and both are told.
