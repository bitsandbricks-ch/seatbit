# Members and guests

Approve join requests, add people, and keep **guests**: people without a Seatbit account who can take over their guest later.

**Who:** clan admins and recruiters · **Where:** clan *Manage* → *Members* and *Guests*

## Members

![Members](../screenshots/desktop-clan-members.png){ .shot }

| Section | |
| --- | --- |
| **Waiting for approval** | People who asked to join (join mode *Approval*). Approve or decline. Admins and recruiters get a Discord DM for each request. |
| **Guest claims** | Members who say they're one of your guests. See [below](#members-claiming-a-guest). |
| **Add an existing user** | Search Seatbit users by name or nick and add them directly. |
| **Role** | One [role](clans.md#roles) per person (admins only). |
| **Remove** | Takes someone out of the clan. Recruiters can remove plain members only. |

## Guests

Guests are people who aren't on Seatbit yet, e.g. a friend who comes once a year. Add them with first name, surname and nick, then sign them up for events and give them a seat like anyone else. Name and nick can be edited later.

![Guests](../screenshots/desktop-clan-guests.png){ .shot }

To hand a guest over to its owner:

| Way | |
| --- | --- |
| **Email invite** | Enter their email and click **Send invite**. When they sign in with a Discord account with the same verified email, everything moves to their account automatically. |
| **Claim link** | Copy the guest's link and send it yourself (WhatsApp, Discord, ...). Whoever opens it and signs in takes the guest over. **New link** invalidates the old one. |
| **That's me** | The member claims the guest themselves. See below. |

### Members claiming a guest

When someone joins and a guest has the **same name or nick** (ignoring case and accents: *Jörg Bäcker*, *Jorg Backer* and *Joerg Baecker* all match), Seatbit asks *"Are you already on the list?"*. Any member can also open that page later from the clan's **Members** tab (*Take it over*).

![Claiming a guest](../screenshots/phone-clan-claim.png){ .shot width="300" }

What happens on **That's me** depends on **Clan settings → General → Can members claim guests?**

| Setting | What happens |
| --- | --- |
| **An admin confirms each claim** (default) | The request shows under **Members → Guest claims**; admins and recruiters get a Discord DM. **Approve** moves everything over, **Decline** tells the member. |
| **Same name or nick moves over right away** | A matching guest moves over at once. Picking any other guest still needs an admin. |
| **Only with the guest's own link** | Members can't claim guests. Use the email invite or the claim link. |

Safeguards, whatever the setting:

- Only clan members can claim, never someone still waiting for approval.
- One open claim per member.
- A guest with an email address, or a guest made clan admin, always needs an admin's OK.
- A name is no proof: check before you approve (the request shows their email and why it was suggested).
- Declined claims and guests marked *Not me* aren't suggested again.
- Every claim, approval and decline is in the [audit log](audit-log.md).

The guest's events, seat and nicks become the member's.
