/**
 * Fills an empty database with demo data: one clan, five LAN events (one
 * past, one with a final seat plan, one where members pick their own seats,
 * an interest check and a draft),
 * members, guests (one with a claim request), nicknames, seats, travel offers, packing lists and games.
 *
 * Used for local development and by scripts/screenshots.ts, so the docs
 * screenshots always show the same people. Dates are relative to today.
 *
 *   npm run seed                       # uses DATABASE_PATH or ./data/lan.db
 *   DATABASE_PATH=/tmp/demo.db npm run seed
 *
 * Every demo user signs in with <first name>@example.com and the password
 * "seatbit-demo" (needs ALLOW_EMAIL_LOGIN=1). The script refuses to run on a
 * database that already has users, unless --force is given. With --discord the
 * users get (fake) Discord accounts instead of passwords, as on a real instance.
 */
import { hashPassword } from "better-auth/crypto";
import { count, eq } from "drizzle-orm";
import { db, schema } from "../src/db";

export const DEMO_PASSWORD = "seatbit-demo";

const s = schema;
const DAY = 24 * 60 * 60 * 1000;

/** Some members filled in their socials (made-up handles). */
const SOCIALS: Record<string, Record<string, string>> = {
  alex: { discord: "blitz.alex", steam: "blitz_demo", battlenet: "Blitz#2741", twitch: "blitz_demo" },
  anna: { discord: "novafox", steam: "novafox_demo", riot: "NovaFox#EUW", epic: "NovaFox" },
  chiara: { discord: "pixel.chiara", steam: "pixel_demo", faceit: "pixel_demo", youtube: "pixel_demo" },
};

type Person = { key: string; first: string; last: string; nick: string; color: string; icon?: string };

// The first one is the platform admin, clan admin and lead; "anna" is the member the screenshots follow.
const PEOPLE: Person[] = [
  { key: "alex", first: "Alex", last: "Brunner", nick: "Blitz", color: "#6c8cff", icon: "🧙" },
  { key: "anna", first: "Anna", last: "Frei", nick: "Nova", color: "#f472b6", icon: "🦊" },
  { key: "ben", first: "Ben", last: "Huber", nick: "Byte", color: "#2dd4bf" },
  { key: "chiara", first: "Chiara", last: "Rossi", nick: "Pixel", color: "#ffa94d", icon: "👾" },
  { key: "david", first: "David", last: "Meier", nick: "Dex", color: "#a3e635" },
  { key: "elena", first: "Elena", last: "Schmid", nick: "Echo", color: "#a78bfa", icon: "🎧" },
  { key: "finn", first: "Finn", last: "Weber", nick: "Frost", color: "#94a3b8" },
  { key: "gina", first: "Gina", last: "Baumann", nick: "Glitch", color: "#e879f9", icon: "⚡" },
  { key: "jonas", first: "Jonas", last: "Graf", nick: "Jinx", color: "#ff7a6b" },
  { key: "lea", first: "Lea", last: "Fischer", nick: "Lynx", color: "#f2cc4a", icon: "🐱" },
  { key: "marco", first: "Marco", last: "Bianchi", nick: "Mako", color: "#2dd4bf" },
  { key: "nina", first: "Nina", last: "Wolf", nick: "Nyx", color: "#a78bfa", icon: "🐺" },
  { key: "oliver", first: "Oliver", last: "Steiner", nick: "Orbit", color: "#6c8cff", icon: "🚀" },
  { key: "paula", first: "Paula", last: "Zimmermann", nick: "Pulse", color: "#ff7a6b" },
  { key: "rafael", first: "Rafael", last: "Kunz", nick: "Rex", color: "#a3e635", icon: "🐉" },
  { key: "sara", first: "Sara", last: "Lang", nick: "Sparky", color: "#ffa94d" },
  { key: "tim", first: "Tim", last: "Roth", nick: "Turbo", color: "#94a3b8" },
];

/** `days` from today at hh:mm local time, so times of day are always the same. */
function at(days: number, hh: number, mm = 0) {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hh, mm, 0, 0);
  return d;
}

/** The Friday at least `minDays` from today, `hh`:00. */
function friday(minDays: number, hh: number) {
  const d = at(minDays, hh);
  while (d.getDay() !== 5) d.setTime(d.getTime() + DAY);
  return d;
}

/** `discord`: give the demo users Discord accounts instead of passwords (used for the screenshots). */
export async function seedDemo({ force = false, discord = false } = {}) {
  const [{ n }] = db.select({ n: count() }).from(s.user).all();
  if (n > 0 && !force) {
    throw new Error("The database already has users. Use an empty DATABASE_PATH, or pass --force to add the demo data anyway.");
  }

  const password = await hashPassword(DEMO_PASSWORD);
  const ids: Record<string, string> = {};

  db.transaction((tx) => {
    // ---------- Users ----------
    PEOPLE.forEach((p, i) => {
      const id = `demo-${p.key}`;
      ids[p.key] = id;
      tx.insert(s.user)
        .values({
          id,
          name: `${p.first} ${p.last}`,
          firstName: p.first,
          lastName: p.last,
          email: `${p.key}@example.com`,
          emailVerified: true,
          role: i === 0 ? "admin" : "member",
          avatarStyle: p.icon ? "icon" : "initials",
          icon: p.icon ?? null,
          color: p.color,
          socials: SOCIALS[p.key] ?? {},
          createdAt: new Date(Date.now() - (400 - i) * DAY),
        })
        .run();
      tx.insert(s.account)
        .values(
          discord
            ? // Looks like a Discord sign-in (for screenshots); nobody can log in with it.
              { id: `demo-acc-${p.key}`, accountId: `10000000000000${String(1000 + i)}`, providerId: "discord", userId: id, scope: "identify,email", updatedAt: new Date() }
            : { id: `demo-acc-${p.key}`, accountId: id, providerId: "credential", userId: id, password, updatedAt: new Date() },
        )
        .run();
      tx.insert(s.nickname).values({ userId: id, nick: p.nick, isPrimary: true }).run();
    });

    // ---------- Clan ----------
    const clanId = "demo-clan";
    tx.insert(s.clan)
      .values({
        id: clanId,
        name: "Pixel Pirates",
        slug: "pixel-pirates",
        description: "A bunch of friends from Lucerne who go to two or three LAN parties a year. Bring snacks.",
        joinPolicy: "approval",
        // A Supporter (only shows where Supporter payments are on, like in the screenshots).
        supporterUntil: new Date(Date.now() + 300 * DAY),
        supporterPlan: "year",
        stripeCustomerId: "cus_demo0000000000",
        stripeSubscriptionId: "sub_demo0000000000",
        createdAt: new Date(Date.now() - 400 * DAY),
      })
      .run();
    for (const p of PEOPLE) {
      const role =
        p.key === "alex" || p.key === "ben"
          ? "admin"
          : p.key === "chiara"
            ? "organizer"
            : p.key === "lea"
              ? "recruiter"
              : p.key === "tim"
                ? "pending"
                : "member";
      tx.insert(s.clanMember).values({ clanId, userId: ids[p.key], role }).run();
    }
    tx.insert(s.clanInvite).values({ code: "demo-invite", clanId, createdBy: ids.alex }).run();

    // A guest: someone the leads added who has no account yet.
    ids.yannick = "demo-yannick";
    tx.insert(s.user)
      .values({
        id: ids.yannick,
        name: "Yannick Moser",
        firstName: "Yannick",
        lastName: "Moser",
        email: `${ids.yannick}@guest.seatbit.invalid`,
        isGuest: true,
        guestClanId: clanId,
        claimCode: "demo-claim-yannick",
        avatarStyle: "initials",
        color: "#f2cc4a",
      })
      .run();
    tx.insert(s.nickname).values({ userId: ids.yannick, nick: "Yeti", isPrimary: true }).run();
    tx.insert(s.clanMember).values({ clanId, userId: ids.yannick, role: "member" }).run();

    // Two guests the leads added for people who then signed up on their own: Sara can
    // take hers over (same name), Rafael already asked to (same nick) and waits for an admin.
    const guest = (key: string, first: string, last: string, nick: string, color: string) => {
      ids[key] = `demo-${key}`;
      tx.insert(s.user)
        .values({
          id: ids[key],
          name: `${first} ${last}`,
          firstName: first,
          lastName: last,
          email: `${ids[key]}@guest.seatbit.invalid`,
          isGuest: true,
          guestClanId: clanId,
          claimCode: `demo-claim-${key}`,
          avatarStyle: "initials",
          color,
        })
        .run();
      if (nick) tx.insert(s.nickname).values({ userId: ids[key], nick, isPrimary: true }).run();
      tx.insert(s.clanMember).values({ clanId, userId: ids[key], role: "member" }).run();
    };
    guest("guestsara", "Sara", "Lang", "", "#ffa94d");
    guest("raffi", "Raffi", "Kunz", "Rex", "#a3e635");
    tx.insert(s.guestClaim)
      .values({ clanId, guestId: ids.raffi, userId: ids.rafael, match: "nick", createdAt: at(-1, 20) })
      .run();

    // ---------- LAN types ----------
    const lakeside = "demo-type-lakeside";
    const mountain = "demo-type-mountain";
    tx.insert(s.lanType)
      .values([
        {
          id: lakeside,
          clanId,
          name: "Lakeside LAN",
          description: "Big weekend LAN in a sports hall by the lake. We always get a block in row F.",
          location: "Sports hall, Lakeside",
          websiteUrl: "https://example.com/lakeside-lan",
          ticketUrl: "https://example.com/lakeside-lan/tickets",
          price: "CHF 65",
          capacity: 20,
          seatSpec: "F1-F16, F19-F22",
          discordMode: "thread",
          profileUrl: "https://example.com/lakeside-lan/user/?id={id}",
        },
        {
          id: mountain,
          clanId,
          name: "Mountain Mayhem",
          description: "Small cosy LAN in a mountain hut. Sleeping in the hut is included.",
          location: "Mountain hut, Alpstadt",
          websiteUrl: "https://example.com/mountain-mayhem",
          ticketUrl: "https://example.com/mountain-mayhem/tickets",
          price: "CHF 90 incl. food",
          capacity: 12,
          seatSpec: "A1-A6, B1-B6",
        },
      ])
      .run();
    // Anna uses another nick at Lakeside LAN, and her participant number there.
    tx.insert(s.nickname).values({ userId: ids.anna, typeId: lakeside, nick: "NovaFox" }).run();
    tx.insert(s.lanAccount).values({ userId: ids.anna, typeId: lakeside, value: "48213" }).run();
    tx.insert(s.lanAccount).values({ userId: ids.alex, typeId: lakeside, value: "40977" }).run();
    for (const [key, value] of [["ben", "41250"], ["chiara", "39804"], ["elena", "45117"], ["lea", "42369"]])
      tx.insert(s.lanAccount).values({ userId: ids[key], typeId: lakeside, value }).run();

    // ---------- Events ----------
    const start = friday(30, 18);
    const end = new Date(start.getTime() + 2 * DAY - 4 * 60 * 60 * 1000); // Sunday 14:00
    const mmStart = friday(110, 17);
    const lastYearStart = friday(-335, 18);
    const retroStart = friday(150, 18); // placeholder for sorting; the date is "to be decided"
    const events = {
      lakeside: "demo-lan-lakeside",
      mountain: "demo-lan-mountain",
      past: "demo-lan-lakeside-past",
      retro: "demo-lan-retro",
      draft: "demo-lan-lakeside-next",
    };
    tx.insert(s.lan)
      .values([
        {
          id: events.lakeside,
          clanId,
          typeId: lakeside,
          name: `Lakeside LAN ${start.getFullYear()}`,
          description: "Our big one. Doors open Friday 18:00. We book everyone's seat on the event's seat plan.",
          location: "Sports hall, Lakeside",
          websiteUrl: "https://example.com/lakeside-lan",
          ticketUrl: "https://example.com/lakeside-lan/tickets",
          startsAt: start,
          endsAt: end,
          signupDeadline: at(5, 20),
          paymentDueDate: at(12, 20),
          price: "CHF 65",
          capacity: 20,
          seatRows: 1,
          seatCols: 22,
          seatsPublishedAt: at(-1, 21),
          seatingOpen: true,
          externalPlanUrl: "https://example.com/lakeside-lan/seatplan",
          publishedAt: at(-40, 12),
          createdAt: at(-40, 12),
        },
        {
          id: events.mountain,
          clanId,
          typeId: mountain,
          name: `Mountain Mayhem ${mmStart.getFullYear()}`,
          description: "Hut LAN with fondue on Saturday. Pick your own seat until the leads close the plan.",
          location: "Mountain hut, Alpstadt",
          websiteUrl: "https://example.com/mountain-mayhem",
          ticketUrl: "https://example.com/mountain-mayhem/tickets",
          startsAt: mmStart,
          endsAt: new Date(mmStart.getTime() + 2 * DAY),
          signupDeadline: at(60, 20),
          paymentDueDate: at(80, 20),
          price: "CHF 90 incl. food",
          capacity: 12,
          seatRows: 2,
          seatCols: 6,
          seatPicking: true,
          publishedAt: at(-5, 12),
          createdAt: at(-5, 12),
        },
        {
          id: events.past,
          clanId,
          typeId: lakeside,
          name: `Lakeside LAN ${lastYearStart.getFullYear()}`,
          location: "Sports hall, Lakeside",
          startsAt: lastYearStart,
          endsAt: new Date(lastYearStart.getTime() + 2 * DAY),
          price: "CHF 60",
          capacity: 16,
          seatRows: 1,
          seatCols: 16,
          seatsPublishedAt: new Date(lastYearStart.getTime() - 7 * DAY),
          publishedAt: new Date(lastYearStart.getTime() - 60 * DAY),
          createdAt: new Date(lastYearStart.getTime() - 60 * DAY),
        },
        {
          // Interest check: no date yet, members only say whether they'd come.
          id: events.retro,
          clanId,
          name: "Retro Weekend",
          description: "Old PCs, old games, one weekend. Would you come? If enough people are in, we book the hut.",
          location: "Somewhere in the mountains",
          startsAt: retroStart,
          endsAt: new Date(retroStart.getTime() + 2 * DAY),
          interestCheck: true,
          dateTbd: true,
          dateHint: "Spring 2027",
          publishedAt: at(-3, 19),
          createdAt: at(-3, 19),
        },
        {
          // A draft: only leads and clan admins see it until it's published.
          id: events.draft,
          clanId,
          typeId: lakeside,
          name: `Lakeside LAN ${start.getFullYear() + 1}`,
          description: "Copied from this year. Dates still to confirm with the organisers.",
          location: "Sports hall, Lakeside",
          websiteUrl: "https://example.com/lakeside-lan",
          ticketUrl: "https://example.com/lakeside-lan/tickets",
          startsAt: new Date(start.getTime() + 364 * DAY),
          endsAt: new Date(end.getTime() + 364 * DAY),
          price: "CHF 65",
          capacity: 20,
          seatRows: 1,
          seatCols: 22,
          createdAt: at(-1, 22),
        },
      ])
      .run();
    tx.insert(s.lanOrga)
      .values([
        { lanId: events.lakeside, userId: ids.alex },
        { lanId: events.lakeside, userId: ids.ben },
        { lanId: events.mountain, userId: ids.alex },
        { lanId: events.past, userId: ids.alex },
        { lanId: events.retro, userId: ids.alex },
        { lanId: events.draft, userId: ids.alex },
        { lanId: events.draft, userId: ids.ben },
      ])
      .run();

    // ---------- Lead to-dos and organizer contacts ----------
    // The clan's starter to-dos (what ensureDefaultTasks adds), plus Lakeside LAN's own ones and contacts.
    tx.update(s.clan).set({ leadTasksSeeded: true }).where(eq(s.clan.id, clanId)).run();
    tx.insert(s.leadContact)
      .values([
        {
          id: "demo-contact-seats",
          typeId: lakeside,
          name: "Jonas Beispiel",
          role: "Seat planning",
          email: "seats@example.com",
          discord: "jonas.lakeside",
          note: "Wants the seat list as one mail with seat, nickname and LAN ID.",
        },
        {
          id: "demo-contact-crew",
          typeId: lakeside,
          name: "Lakeside LAN crew",
          role: "Tickets and general questions",
          email: "info@example.com",
          phone: "+41 79 123 45 67",
          url: "https://example.com/lakeside-lan",
        },
      ])
      .run();
    tx.insert(s.leadTask)
      .values([
        { id: "demo-task-block", clanId, title: "Ask the organizers for a group seat block", note: "Tell them roughly how many of you are coming and ask by when they need the final list.", after: [], dueDays: 60, sort: 0 },
        { id: "demo-task-list", clanId, title: "Send the seat list to the organizers", note: "Who sits where, with nicknames or LAN IDs if they ask for them.", after: ["finalize"], dueDays: 14, sort: 1 },
        { id: "demo-task-arrival", clanId, title: "Share arrival and setup info with the group", note: "Check-in times, parking, what to bring. Post it as lead news so everyone gets it.", after: ["tickets"], dueDays: 3, sort: 2 },
        { id: "demo-task-thanks", clanId, title: "Thank the organizers and note what to do better", note: "Write down what worked and what didn't, so next year's leads know.", after: [], dueDays: -3, sort: 3 },
        { id: "demo-task-lal-block", clanId, typeId: lakeside, title: "Email Jonas the group block wish (row F)", after: [], dueDays: 75, contactId: "demo-contact-seats", sort: 4 },
        { id: "demo-task-lal-check", clanId, typeId: lakeside, title: "Check all our seats show as booked on the Lakeside plan", after: ["book", "task:demo-task-list"], dueDays: 5, contactId: "demo-contact-seats", sort: 5 },
        { id: "demo-task-parking", clanId, lanId: events.lakeside, title: "Reserve parking for the two cars", note: "The hall has 10 spots for groups, ask the crew.", after: [], dueDays: 7, contactId: "demo-contact-crew", sort: 6 },
      ])
      .run();
    tx.insert(s.lanTask)
      .values([
        { lanId: events.lakeside, taskId: "demo-task-block", doneAt: at(-38, 19, 30), doneById: ids.alex, assigneeId: ids.alex },
        { lanId: events.lakeside, taskId: "demo-task-lal-block", doneAt: at(-38, 19, 45), doneById: ids.alex, assigneeId: ids.alex },
        { lanId: events.lakeside, taskId: "demo-task-list", assigneeId: ids.ben },
        { lanId: events.lakeside, taskId: "demo-task-parking", assigneeId: ids.alex },
      ])
      .run();

    // Interest check answers for the Retro Weekend (Anna hasn't answered yet).
    const interest: [string, "yes" | "maybe" | "no"][] = [
      ["alex", "yes"], ["ben", "yes"], ["chiara", "maybe"], ["finn", "yes"], ["lea", "no"], ["rafael", "yes"], ["nina", "maybe"],
    ];
    for (const [key, answer] of interest) tx.insert(s.lanInterest).values({ lanId: events.retro, userId: ids[key], answer }).run();

    // Lead news on the Lakeside LAN.
    tx.insert(s.lanNews)
      .values([
        { lanId: events.lakeside, authorId: ids.alex, text: "Seat plan is final! We are booking the seats on the event site this week.", createdAt: at(-1, 21, 5) },
        { lanId: events.lakeside, authorId: ids.ben, text: "Pizza order on Saturday at 19:00, bring cash.", createdAt: at(-6, 18) },
      ])
      .run();

    // ---------- Lakeside LAN: attendance and final seat plan ----------
    type A = { status: "going" | "maybe" | "declined" | "waitlist"; ticket?: boolean; paid?: boolean; booked?: boolean; seat?: string };
    const lakesideAtt: Record<string, A> = {
      alex: { status: "going", ticket: true, paid: true, booked: true, seat: "F8" },
      anna: { status: "going", ticket: true, paid: true, seat: "F9" },
      ben: { status: "going", ticket: true, paid: true, booked: true, seat: "F7" },
      chiara: { status: "going", ticket: true, paid: true, booked: true, seat: "F10" },
      david: { status: "going", ticket: true, paid: true, booked: true, seat: "F1" },
      elena: { status: "going", ticket: true, paid: false, seat: "F11" },
      finn: { status: "going", ticket: true, paid: true, booked: true, seat: "F2" },
      gina: { status: "going", ticket: true, paid: true, seat: "F12" },
      jonas: { status: "going", ticket: false, seat: "F3" },
      lea: { status: "going", ticket: true, paid: true, booked: true, seat: "F13" },
      marco: { status: "going", ticket: true, paid: false, seat: "F4" },
      nina: { status: "going", ticket: true, paid: true, booked: true, seat: "F19" },
      oliver: { status: "maybe" },
      paula: { status: "going", ticket: false },
      rafael: { status: "declined" },
      sara: { status: "maybe" },
      yannick: { status: "going", ticket: true, paid: true, seat: "F20" },
    };
    const seatOwner = new Map<string, string>();
    for (const [key, a] of Object.entries(lakesideAtt)) {
      tx.insert(s.attendance)
        .values({
          lanId: events.lakeside,
          userId: ids[key],
          status: a.status,
          ticketBought: !!a.ticket,
          paid: !!a.paid,
          seatBooked: !!a.booked,
          wishNear: key === "anna" ? [ids.chiara, ids.alex] : key === "chiara" ? [ids.anna] : [],
          wishPosition: key === "david" ? "edge" : "any",
          wishNote: key === "anna" ? "Next to Pixel please, we share a power strip." : "",
          note: key === "paula" ? "Ticket comes with my next salary." : "",
        })
        .run();
      if (a.seat) seatOwner.set(a.seat, ids[key]);
    }
    const lakesideSeats = [...range("F", 1, 16), ...range("F", 19, 22)];
    for (const label of lakesideSeats) {
      const num = Number(label.slice(1));
      tx.insert(s.seat)
        .values({
          lanId: events.lakeside,
          row: 0,
          col: num - 1,
          label,
          userId: seatOwner.get(label) ?? null,
          locked: label === "F14",
        })
        .run();
    }
    // Chiara asked Gina to swap; Gina accepted, waiting for a lead.
    tx.insert(s.seatSwap)
      .values({ lanId: events.lakeside, fromUserId: ids.chiara, toUserId: ids.gina, status: "accepted", note: "Want to sit at the end of the row" })
      .run();

    // ---------- Mountain Mayhem: self pick is open ----------
    const mmAtt: Record<string, A> = {
      alex: { status: "going", ticket: true, seat: "A3" },
      anna: { status: "going", ticket: true },
      ben: { status: "going", ticket: true, seat: "A4" },
      chiara: { status: "going", ticket: true, seat: "B2" },
      elena: { status: "maybe" },
      lea: { status: "going", ticket: true, seat: "B3" },
      nina: { status: "going", ticket: false },
      rafael: { status: "going", ticket: true, seat: "A1" },
      // The hut is full (12 spots): late answers queue up on the waitlist, in this order.
      david: { status: "going", ticket: true },
      finn: { status: "going", ticket: true },
      gina: { status: "going", ticket: false },
      marco: { status: "going", ticket: true },
      yannick: { status: "going", ticket: false },
      jonas: { status: "waitlist" },
      sara: { status: "waitlist" },
      paula: { status: "waitlist" },
    };
    const mmLine = ["jonas", "sara", "paula"];
    const mmOwner = new Map<string, string>();
    for (const [key, a] of Object.entries(mmAtt)) {
      const place = mmLine.indexOf(key);
      tx.insert(s.attendance)
        .values({
          lanId: events.mountain,
          userId: ids[key],
          status: a.status,
          ticketBought: !!a.ticket,
          waitlistedAt: place >= 0 ? at(-3 + place, 20, 15) : null,
        })
        .run();
      if (a.seat) mmOwner.set(a.seat, ids[key]);
    }
    for (const [rowIdx, letter] of ["A", "B"].entries()) {
      for (const label of range(letter, 1, 6)) {
        tx.insert(s.seat)
          .values({ lanId: events.mountain, row: rowIdx, col: Number(label.slice(1)) - 1, label, userId: mmOwner.get(label) ?? null })
          .run();
      }
    }

    // ---------- Last year's Lakeside LAN (for clan stats) ----------
    const pastGoing = ["alex", "anna", "ben", "chiara", "david", "finn", "jonas", "lea", "marco", "rafael"];
    pastGoing.forEach((key, i) => {
      tx.insert(s.attendance)
        .values({ lanId: events.past, userId: ids[key], status: "going", ticketBought: true, paid: true, seatBooked: true })
        .run();
      tx.insert(s.seat).values({ lanId: events.past, row: 0, col: i, label: `F${i + 1}`, userId: ids[key] }).run();
    });
    for (const key of ["elena", "gina"]) {
      tx.insert(s.attendance).values({ lanId: events.past, userId: ids[key], status: "declined" }).run();
    }

    // ---------- Travel ----------
    const ride = "demo-ride-alex";
    tx.insert(s.travelPost)
      .values([
        { id: ride, lanId: events.lakeside, userId: ids.alex, kind: "ride", mode: "offer", town: "Lucerne", places: 3, whenText: "Fri 15:00, back Sun 15:00", note: "Big boot, room for 3 PCs." },
        { id: "demo-ride-lea", lanId: events.lakeside, userId: ids.lea, kind: "ride", mode: "offer", town: "Zug", places: 2, whenText: "Fri 16:30" },
        { id: "demo-ride-req", lanId: events.lakeside, userId: ids.marco, kind: "ride", mode: "request", town: "Lucerne", places: 1, whenText: "Fri afternoon", note: "Only a laptop" },
        { id: "demo-sleep-gina", lanId: events.lakeside, userId: ids.gina, kind: "sleep", mode: "offer", town: "Lakeside", places: 2, note: "Sofa bed at my aunt's, 10 min walk" },
        { id: "demo-sleep-req", lanId: events.lakeside, userId: ids.elena, kind: "sleep", mode: "request", town: "Lakeside", places: 1, whenText: "Fri and Sat night" },
      ])
      .run();
    tx.insert(s.travelSpot).values([{ postId: ride, userId: ids.anna }, { postId: ride, userId: ids.chiara }]).run();

    // ---------- Anna's packing list ----------
    for (const item of ["pc", "screen", "power", "keyboard", "mouse", "headset", "ticket"]) {
      tx.insert(s.gearPacked).values({ lanId: events.lakeside, userId: ids.anna, item }).run();
    }
    tx.insert(s.packingItem)
      .values([
        { lanId: events.lakeside, userId: ids.anna, label: "Spare USB-C cable", packed: true },
        { lanId: events.lakeside, userId: ids.anna, label: "Earplugs", packed: false },
        { lanId: events.lakeside, userId: ids.anna, label: "Card game for breaks", packed: false },
      ])
      .run();

    // ---------- Games ----------
    const games = [
      { id: "demo-game-cs", name: "Counter-Strike 2", sizeGb: 35, voters: ["alex", "ben", "chiara", "david", "finn", "jonas", "marco", "anna"], installed: ["alex", "ben", "david", "anna"] },
      { id: "demo-game-aoe", name: "Age of Empires II: DE", sizeGb: 30, voters: ["anna", "lea", "gina", "alex", "elena"], installed: ["lea", "gina"] },
      { id: "demo-game-tm", name: "Trackmania", sizeGb: 8, voters: ["finn", "nina", "chiara", "anna"], installed: ["nina", "chiara", "anna"] },
      { id: "demo-game-r6", name: "Rainbow Six Siege", sizeGb: 85, voters: ["david", "jonas"], installed: [] as string[] },
    ];
    for (const g of games) {
      tx.insert(s.game)
        .values({ id: g.id, lanId: events.lakeside, name: g.name, sizeGb: g.sizeGb, url: "https://example.com/games", addedBy: ids[g.voters[0]] })
        .run();
      const everyone = new Set([...g.voters, ...g.installed]);
      for (const key of everyone) {
        tx.insert(s.gameVote).values({ gameId: g.id, userId: ids[key], vote: g.voters.includes(key), installed: g.installed.includes(key) }).run();
      }
    }

    // Food: a pizza order Anna collects on Saturday, and Friday's kebab run (already ordered).
    const sat = new Date(start.getTime() + DAY);
    sat.setHours(19, 0, 0, 0);
    tx.insert(s.foodOrder)
      .values([
        { id: "demo-food-pizza", lanId: events.lakeside, title: "Pizza Saturday evening", shop: "Pizzeria Da Gino", menuUrl: "https://example.com/menu", note: "I call at 19:00. Pay me cash or TWINT when it arrives.", closesAt: sat, status: "open", createdBy: ids.anna },
        { id: "demo-food-kebab", lanId: events.lakeside, title: "Friday kebab run", shop: "Bodrum Kebab", status: "ordered", createdBy: ids.alex, createdAt: at(-1, 12) },
      ])
      .run();
    const food: [string, string, string, number, number, string?, boolean?][] = [
      ["demo-food-pizza", "anna", "Margherita", 1, 1650],
      ["demo-food-pizza", "alex", "Diavola", 1, 1950, "extra hot"],
      ["demo-food-pizza", "alex", "Tiramisu", 1, 750],
      ["demo-food-pizza", "ben", "Margherita", 2, 1650],
      ["demo-food-pizza", "chiara", "Quattro Formaggi", 1, 2050, "", true],
      ["demo-food-pizza", "lea", "Margherita", 1, 1650, "", true],
      ["demo-food-pizza", "marco", "Diavola", 1, 1950, "extra hot"],
      ["demo-food-pizza", "nina", "Calzone", 1, 1900],
      ["demo-food-kebab", "alex", "Döner", 1, 1200, "", true],
      ["demo-food-kebab", "elena", "Dürüm", 1, 1300, "no onions", true],
      ["demo-food-kebab", "finn", "Döner box", 1, 1100],
    ];
    food.forEach(([orderId, key, item, qty, priceCents, note = "", paid = false], i) =>
      tx.insert(s.foodItem)
        .values({ orderId, userId: ids[key], item, qty, priceCents, note, paid, createdAt: new Date(Date.now() - (food.length - i) * 60_000) })
        .run(),
    );

    // Audit log: what the leads changed lately (Clan settings -> Audit log, Admin -> Audit log).
    const lanName = (id: string) => tx.select({ name: s.lan.name }).from(s.lan).where(eq(s.lan.id, id)).get()?.name ?? "";
    const lake = { lanId: events.lakeside, clanId, event: lanName(events.lakeside) };
    const log: [number, number, string, string, string | null, Record<string, unknown>, string | null][] = [
      // [days ago, hour, actor, action, target, data, lanId]
      [-12, 19, "alex", "event.publish", null, { event: lake.event }, lake.lanId],
      [-9, 21, "alex", "member.approve", "tim", {}, null],
      [-8, 20, "alex", "guest.add", "yannick", {}, null],
      [-7, 19, "alex", "guest.add", "raffi", {}, null],
      [-1, 20, "rafael", "guest.claim_request", "rafael", { guest: "Raffi Kunz", match: "nick" }, null],
      [-6, 18, "alex", "attendance.set", "yannick", { event: lake.event, from: null, to: "going" }, lake.lanId],
      [-5, 22, "alex", "member.role", "chiara", { from: "member", to: "organizer" }, null],
      [-4, 20, "alex", "member.role", "lea", { from: "member", to: "recruiter" }, null],
      [-3, 19, "alex", "ticket.confirm", "ben", { event: lake.event, paid: true }, lake.lanId],
      [-3, 19, "alex", "ticket.confirm", "anna", { event: lake.event, paid: true }, lake.lanId],
      [-2, 20, "alex", "seat.auto", null, { event: lake.event, mode: "fill", count: 14 }, lake.lanId],
      [-2, 20, "chiara", "seat.swap", "finn", { event: lake.event, a: "F4", b: "F7", otherUserId: ids.gina }, lake.lanId],
      [-1, 21, "alex", "seats.finalize", null, { event: lake.event, notified: 15 }, lake.lanId],
      [0, 8, "chiara", "attendance.set", "tim", { event: lake.event, from: "going", to: "declined" }, lake.lanId],
    ];
    for (const [days, hh, actor, action, target, data, lanId] of log)
      tx.insert(s.auditLog)
        .values({ at: at(days, hh), actorId: ids[actor], action, clanId, lanId, targetUserId: target ? ids[target] : null, data })
        .run();

    // A second, open clan Anna isn't in, so the clan list has something to join.
    tx.insert(s.clan)
      .values({ id: "demo-clan-2", name: "Lag Legends", slug: "lag-legends", description: "Retro LAN fans from Bern. Everyone welcome.", joinPolicy: "open" })
      .run();
    tx.insert(s.clanMember).values({ clanId: "demo-clan-2", userId: ids.rafael, role: "admin" }).run();
  });

  return { users: PEOPLE.length + 1, password: DEMO_PASSWORD };
}

function range(letter: string, from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => `${letter}${from + i}`);
}

// Run directly: `npm run seed [-- --force]`.
if (process.argv[1]?.match(/seed-demo\.[tj]s$/)) {
  seedDemo({ force: process.argv.includes("--force"), discord: process.argv.includes("--discord") })
    .then((r) => {
      console.log(`Demo data added: ${r.users} people in "Pixel Pirates", 5 events.`);
      console.log(`Sign in with alex@example.com (admin and lead) or anna@example.com (member), password "${r.password}".`);
      console.log("Email login needs ALLOW_EMAIL_LOGIN=1.");
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
