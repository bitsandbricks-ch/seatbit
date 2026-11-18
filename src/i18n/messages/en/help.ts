// The help page (/help): how Seatbit works for members and leads. One section per topic, each a list of questions.
// Items are read in order; keep the keys (a, b, c, ...) the same in ../de/help.ts.
export const help = {
  title: "Help",
  intro: "How Seatbit works, step by step.",
  back: "Help",
  nav: "Help topics",
  flowTitle: "How an event works",
  flow: "Answer → Ticket → Seat → Plan final → At the LAN",
  stillStuck: "Didn't find it? Ask an organizer of your clan.",
  sections: {
    start: {
      title: "Getting started",
      status: "Account, nick, joining a clan",
      items: {
        a: { q: "What is Seatbit?", a: "Seatbit helps your clan go to LAN parties together: who's coming, tickets, seats, travel, packing and costs, all in one place. The LAN itself is run by its own organizers; Seatbit is for your group." },
        b: { q: "How do I sign in?", a: "With your Discord account. On first sign-in you add your first name, surname and the nick you use at LANs." },
        c: { q: "How do I join my clan?", a: "Open the clan's page from a link an organizer sent you, or find it under Clans. Some clans let you in right away, others ask an organizer to approve you first." },
        d: { q: "An organizer already added me as a guest. What now?", a: "Use the claim link from your organizer or the «That's me» button on the clan page. Your answers and seats from the guest move over to your account." },
      },
    },
    events: {
      title: "Events and sign-up",
      status: "Answers, waitlist, tickets",
      items: {
        a: { q: "How do I sign up?", a: "Open the event and answer «I'm coming», «Unsure» or «Not coming». Answer before the deadline in the event's details." },
        b: { q: "What's an interest check?", a: "Before sign-up opens, the organizers may ask «Would you come?». It's not binding: it helps them decide how many seats to ask for. Your answer carries over when sign-up opens." },
        c: { q: "What happens when the group is full?", a: "New answers go on the waitlist. When a spot opens, the first in line moves up by itself, or the organizers pick, depending on the event. You get an email and a Discord DM either way." },
        d: { q: "How do tickets work?", a: "You buy your ticket yourself in the event's ticket shop, then tick «I have my ticket» in your checklist. From then on your answer is locked; tell an organizer if your plans change. On the waitlist, wait until you move up." },
        e: { q: "What does the checklist do?", a: "It shows the step that matters now with a button that takes you there. Tap it to see all steps. «How this event works» below it explains the whole flow for that event." },
      },
    },
    seats: {
      title: "Seats",
      status: "Wishes, picking your own, final plan, swaps",
      items: {
        a: { q: "Where do our seats come from?", a: "The event gives the group a block of seats. The organizers enter it in Seatbit, and then everyone is placed inside that block." },
        b: { q: "What are seat wishes?", a: "Tell the organizers who you'd like to sit right next to or near, or a seat, row, edge or middle. Your top wish counts most; drag to change the order. You can also say who you'd rather not sit right next to: only the organizers see that." },
        c: { q: "Can I pick my own seat?", a: "If the organizers turned on self pick for the event, yes: on the Seats tab, tap a free seat and «Take this seat». You need to have ticked your ticket first." },
        d: { q: "What does «final» mean?", a: "The organizers check the plan and make it final. After that your seat only changes if you ask. If the event has its own seat plan, the organizers then book everyone's seat there." },
        e: { q: "Who wants to sit near me?", a: "If someone wished to sit next to or near you, the Seats tab shows it, and you can add them to your own wishes with one tap. «Not right next to» wishes are never shown to the person they name." },
        f: { q: "Can I swap seats?", a: "Once the plan is final, ask someone on the Seats tab. When they agree, an organizer approves the swap." },
      },
    },
    trip: {
      title: "Trip",
      status: "Rides, places to sleep, packing; games and costs",
      items: {
        a: { q: "When does the Trip tab show up?", a: "A few weeks before the event (30 days unless your instance changed it), or earlier as soon as someone posted a ride or packed something. It holds travel and the packing list; Games and Costs are their own tabs and always there." },
        b: { q: "Rides and places to sleep", a: "Offer free seats in your car or a place to sleep, or post where you need one from. Posts are grouped by town." },
        c: { q: "Packing list", a: "Your own list: tick what's packed and add your own items. Nobody else sees it." },
        d: { q: "Games", a: "On the Games tab: vote for what you want to play and tick when it's installed: the venue's internet is often slow." },
        e: { q: "Shared costs", a: "On the Costs tab: note what you paid for the group (fuel, a room, snacks), split it, and see who owes whom. Settle up when you've paid each other back." },
      },
    },
    lan: {
      title: "At the LAN",
      status: "Check-in, orders",
      items: {
        a: { q: "Check-in", a: "Tap «I'm here» when you arrive, so the others see who made it." },
        b: { q: "Orders", a: "Pizza run or supermarket trip: whoever goes starts an order, everyone adds what they want, and the list shows who owes what. The Orders tab shows up once the event starts." },
      },
    },
    roles: {
      title: "Who does what",
      status: "Members, organizers, clan roles",
      items: {
        a: { q: "What are organizers?", a: "People from your clan who plan the trip to one event: they run the sign-up, the seats, the news and the booking. Each event shows its organizers with Discord and email." },
        b: { q: "Clan roles", a: "Admins run the clan. Event managers create and run the clan's events. Recruiters approve join requests and add members and guests. Members answer for events and can still be an organizer of single events." },
        c: { q: "Who runs the LAN itself?", a: "The event's own team. Seatbit is only for your group's trip there." },
      },
    },
    discord: {
      title: "Discord",
      status: "Sign-in, DMs, bot",
      items: {
        a: { q: "Why Discord?", a: "You sign in with it, and the Seatbit bot can send you reminders and news as DMs. You can switch DMs off on your profile." },
        b: { q: "/verify", a: "Run /verify on your clan's Discord server (or tap Verify on your profile) so Seatbit knows your Discord account is really yours. You then get a green Discord badge." },
      },
    },
    account: {
      title: "Notifications and your data",
      status: "Mails, DMs, emergency contact, deleting your account",
      items: {
        a: { q: "Notifications", a: "Choose on your profile which emails and Discord DMs you get." },
        b: { q: "Emergency contact and dietary needs", a: "Optional, on your profile. Only the organizers of events you go to can see them." },
        c: { q: "Language and theme", a: "Switch between English and German and between light and dark at the top of the page." },
        d: { q: "Your data", a: "Download everything Seatbit stores about you, or delete your account, on your profile under «Your data»." },
      },
    },
    leads: {
      title: "For organizers",
      status: "Create an event, plan seats, finalize, book",
      items: {
        a: { q: "Create an event", a: "Start from a LAN type, so seats, deadlines and to-dos carry over. New events start as drafts that only organizers see; publish when it's ready." },
        b: { q: "Plan the seats", a: "Enter the seat block on Manage → Seats the first time (later under Manage → Settings). Members send wishes or pick their own; Plan the seats fills the rest from their wishes. Save variants under Plan variants and history to compare plans." },
        c: { q: "Finalize and book", a: "When the plan is right, finalize it: wishes and self pick close and everyone sees their seat. Then book the seats on the event's site and tick each person." },
        d: { q: "Keep everyone posted", a: "Post news, send reminders and use the Organizer checklist and to-dos on Manage → Overview so nothing gets forgotten." },
      },
    },
  },
};
