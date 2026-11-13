/**
 * Member slash commands: answer, tick off the ticket, set a nick and seat wishes, and see
 * where you stand, all without opening the site. Same rules as the website: answers lock
 * once you have a ticket, sign-up closes at the deadline, wishes close when the plan is final.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { INTEREST_ANSWERS, type Attendance, type AttendanceStatus, type InterestAnswer, type Lan, type User } from "@/db/schema";
import { fmtWeekday } from "./format";
import { lanLink } from "./announce";
import { buildChecklist, type StepState } from "./checklist";
import { getClan, isClanMember, myClans } from "./clans";
import type { Json } from "./discord-api";
import {
  type Handled,
  type Interaction,
  EPHEMERAL,
  boolOpt,
  clanForGuild,
  clip,
  linkButton,
  nextDeadline,
  notLinked,
  opt,
  reply,
  seatbitUserFor,
  upcomingLans,
} from "./discord-common";
import { ATTENDANCE_LOCKED_MSG, attendanceLocked, getDisplayNames, getLan, getNames, setAttendance, signupClosed, waitlistPositions } from "./lans";
import { appUrl } from "./mail";
import { saveNick, saveSeatWishes, saveTicketBought } from "./member-updates";
import { nameMatches } from "./names";
import { bookedButton } from "./seat-booking";

const { attendance, lanInterest, lanType, nickname, seat } = schema;

type EditReply = (body: Json) => Promise<unknown>;

const BRAND = 0x10b981;
const openButton = (l: Lan) => ({ type: 2, style: 5, label: "Open in Seatbit", url: lanLink(l) });

/** Slash command name -> attendance answer. */
const ANSWERS: Record<string, AttendanceStatus> = { coming: "going", unsure: "maybe", "not-coming": "declined" };
const INTEREST_FOR: Record<string, InterestAnswer> = { going: "yes", maybe: "maybe", declined: "no" };

export const MEMBER_COMMANDS = new Set([...Object.keys(ANSWERS), "status", "ticket", "nick", "wish"]);

const statusLabel: Record<AttendanceStatus, string> = {
  going: "✅ You're in",
  maybe: "🤔 Marked as unsure",
  declined: "❌ Marked as not coming",
  waitlist: "⏳ It's full, you're on the waitlist",
};

const when = (l: Lan) => (l.dateTbd ? l.dateHint || "date to be fixed" : fmtWeekday(l.startsAt));

/**
 * Who's asking and which events they mean: in a linked server only that server's clan,
 * in DMs or other servers all of the caller's clans.
 */
function scopeOf(i: Interaction) {
  const me = seatbitUserFor(i.member?.user.id ?? i.user?.id ?? "");
  const serverClan = clanForGuild(i.guild_id);
  const clanIds = serverClan ? [serverClan.id] : me ? myClans(me.id).map((m) => m.clan.id) : [];
  const events = upcomingLans(clanIds).filter((l) => !l.cancelledAt);
  return { me, serverClan, events };
}

const myRow = (lanId: string, userId: string) =>
  db
    .select()
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId)))
    .get();

/** The event the `event` option names: a picked suggestion (its id) or typed text that matches one name. */
function pickedEvent(i: Interaction, events: Lan[]): Lan | "unknown" | undefined {
  const v = opt(i, "event")?.trim();
  if (!v) return undefined;
  const byId = events.find((l) => l.id === v);
  if (byId) return byId;
  const byName = events.filter((l) => nameMatches(l.name, v));
  return byName.length === 1 ? byName[0] : "unknown";
}

const unknownEvent = () => reply("I don't know that event. Pick one from the suggestions while you type, or see `/lans`.");

/** Why the caller can't act on this event, or null when they can. */
function notMember(me: User, l: Lan) {
  if (l.clanId && isClanMember(me.id, l.clanId)) return null;
  const c = l.clanId ? getClan(l.clanId) : undefined;
  return reply(`**${l.name}** is for members of **${c?.name ?? "another clan"}**. Ask to join the clan in Seatbit first.`, {
    components: c ? [linkButton("Open clan", `${appUrl}/clans/${c.slug}`)] : [],
  });
}

/** Several events fit and the caller didn't say which: buttons for each (or a hint for commands with more options). */
function whichEvent(events: Lan[], button?: (l: Lan) => Json) {
  const list = events
    .slice(0, 5)
    .map((l) => `• **${l.name}** · ${when(l)}`)
    .join("\n");
  if (!button) return reply(`Which event? Add \`event:\` and pick one:\n${list}`);
  return reply("Which event?", {
    components: events.slice(0, 5).map((l) => ({ type: 1, components: [button(l)] })),
  });
}

// ---------- Answering ----------

/** Records an interest check answer ("would you come?"). */
export function answerInterest(l: Lan, me: User, answer: InterestAnswer): Handled {
  if (!l.interestCheck || l.cancelledAt) return { response: reply("The interest check is over.", { components: [linkButton("Open in Seatbit", lanLink(l))] }) };
  if (!INTEREST_ANSWERS.includes(answer)) return { response: reply("Unknown answer.") };
  const denied = notMember(me, l);
  if (denied) return { response: denied };
  db.insert(lanInterest)
    .values({ lanId: l.id, userId: me.id, answer })
    .onConflictDoUpdate({ target: [lanInterest.lanId, lanInterest.userId], set: { answer } })
    .run();
  void import("./discord").then((d) => d.refreshLanMessagesSoon(l.id)).catch(() => {});
  const text = { yes: "👍 Noted: you'd come", maybe: "🤔 Noted: maybe", no: "👋 Noted: not this time" }[answer];
  return { response: reply(`${text} for **${l.name}**. We'll tell you when sign-up opens.`) };
}

/** Coming / unsure / not coming, from a button or a slash command. */
export function answerEvent(l: Lan, me: User, status: AttendanceStatus, editReply: EditReply): Handled {
  if (!["going", "maybe", "declined"].includes(status)) return { response: reply("Unknown answer.") };
  if (l.interestCheck && !l.cancelledAt) return answerInterest(l, me, INTEREST_FOR[status]);
  if (signupClosed(l)) return { response: reply(`Sign-up for **${l.name}** is closed. Ask a lead if something changed.`) };
  if (attendanceLocked(myRow(l.id, me.id))) return { response: reply(ATTENDANCE_LOCKED_MSG, { components: [linkButton("Open in Seatbit", lanLink(l))] }) };
  const denied = notMember(me, l);
  if (denied) return { response: denied };
  return {
    response: { type: 5, data: { flags: EPHEMERAL } }, // "thinking…", answered below
    later: async () => {
      try {
        const stored = await setAttendance(l, me.id, status);
        const extra =
          stored === "going"
            ? " Tick off your ticket with `/ticket` once you have it."
            : stored === "waitlist"
              ? ` You're #${waitlistPositions(l.id).get(me.id) ?? "?"} in line; you get a DM when you move up.`
              : "";
        await editReply({ content: `${statusLabel[stored]} for **${l.name}**.${extra}`, components: [linkButton("Open in Seatbit", lanLink(l))] });
      } catch (e) {
        console.error("[discord] attendance failed", e);
        await editReply({ content: "Something went wrong, please try again in Seatbit." }).catch(() => {});
      }
    },
  };
}

function answerCommand(i: Interaction, status: AttendanceStatus, editReply: EditReply): Handled {
  const { me, serverClan, events } = scopeOf(i);
  if (!me) return { response: notLinked() };
  const picked = pickedEvent(i, events);
  if (picked === "unknown") return { response: unknownEvent() };
  if (picked) return answerEvent(picked, me, status, editReply);
  const open = events.filter((l) => l.interestCheck || !signupClosed(l));
  if (open.length === 1) return answerEvent(open[0], me, status, editReply);
  if (open.length === 0)
    return { response: reply(`Nothing to answer right now${serverClan ? ` in **${serverClan.name}**` : ""}. \`/status\` shows your events.`) };
  const label = { going: "Coming", maybe: "Unsure", declined: "Not coming", waitlist: "" }[status];
  return {
    response: whichEvent(open, (l) => ({
      type: 2,
      style: status === "going" ? 3 : status === "declined" ? 4 : 2,
      label: clip(`${label}: ${l.name}`, 80),
      custom_id: l.interestCheck ? `int:${l.id}:${INTEREST_FOR[status]}` : `att:${l.id}:${status}`,
    })),
  };
}

// ---------- Ticket ----------

/** "I have my ticket", from /ticket or its button. */
export function ticketFor(l: Lan, me: User, bought: boolean): Handled {
  const denied = notMember(me, l);
  if (denied) return { response: denied };
  const a = myRow(l.id, me.id);
  if (bought && a?.status !== "going" && a?.status !== "waitlist")
    return { response: reply(`Say you're coming to **${l.name}** first: \`/coming\`.`) };
  try {
    saveTicketBought(l.id, me.id, bought);
  } catch (e) {
    return { response: reply((e as Error).message) };
  }
  void import("./discord").then((d) => d.refreshLanMessagesSoon(l.id)).catch(() => {});
  return {
    response: reply(
      bought
        ? `🎟️ Noted: you have your ticket for **${l.name}**. A lead will confirm it. Your answer is locked now; ask a lead if your plans change.`
        : `OK, no ticket for **${l.name}** yet.`,
      { components: [linkButton("Open in Seatbit", lanLink(l))] },
    ),
  };
}

function ticketCommand(i: Interaction): Handled {
  const { me, events } = scopeOf(i);
  if (!me) return { response: notLinked() };
  const bought = boolOpt(i, "bought") ?? true;
  const picked = pickedEvent(i, events);
  if (picked === "unknown") return { response: unknownEvent() };
  if (picked) return ticketFor(picked, me, bought);
  const rows = new Map(events.map((l) => [l.id, myRow(l.id, me.id)]));
  const open = events.filter((l) => {
    const a = rows.get(l.id);
    return a && !a.paid && (a.status === "going" || a.status === "waitlist") && a.ticketBought !== bought;
  });
  if (open.length === 1) return ticketFor(open[0], me, bought);
  if (open.length === 0)
    return { response: reply(bought ? "No event is waiting for your ticket. Say you're coming first with `/coming`." : "You haven't ticked off a ticket anywhere.") };
  return {
    response: whichEvent(
      open,
      bought ? (l) => ({ type: 2, style: 3, label: clip(`I have my ticket: ${l.name}`, 80), custom_id: `ticket:${l.id}` }) : undefined,
    ),
  };
}

// ---------- Nick ----------

function nickCommand(i: Interaction): Handled {
  const { me, events } = scopeOf(i);
  if (!me) return { response: notLinked() };
  const raw = opt(i, "nick") ?? "";
  const picked = pickedEvent(i, events);
  if (picked === "unknown") return { response: unknownEvent() };
  try {
    if (!picked) {
      const nick = saveNick(me.id, raw);
      return { response: reply(`👍 Your nick is **${nick}** now, wherever you haven't set another one.`) };
    }
    const denied = notMember(me, picked);
    if (denied) return { response: denied };
    // Nicks belong to the LAN type, so next year's event keeps them; one-off events get their own.
    const type = picked.typeId ? db.select().from(lanType).where(eq(lanType.id, picked.typeId)).get() : undefined;
    const nick = saveNick(me.id, raw, type ? { typeId: type.id } : { lanId: picked.id });
    void import("./discord").then((d) => d.refreshLanMessagesSoon(picked.id)).catch(() => {});
    return { response: reply(`👍 Your nick is **${nick}** at ${type ? `every **${type.name}** event` : `**${picked.name}**`}.`) };
  } catch {
    return { response: reply("A nick needs 1 to 32 characters.") };
  }
}

// ---------- Seat wishes ----------

const POSITIONS = { any: "anywhere", edge: "at the edge", middle: "in the middle" } as const;

/** People at the event someone can wish to sit near or away from. */
async function wishPeople(l: Lan, meId: string) {
  const rows = db.select().from(attendance).where(eq(attendance.lanId, l.id)).all().filter((a) => a.userId !== meId && a.status !== "declined");
  const names = await getDisplayNames(l.id, rows.map((r) => r.userId));
  return rows.map((r) => ({ id: r.userId, name: names.get(r.userId) ?? "?" })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Events where the caller can still change seat wishes. */
const wishEvents = (events: Lan[], meId: string) =>
  events.filter((l) => {
    const a = myRow(l.id, meId);
    return !l.seatsPublishedAt && a && a.status !== "declined";
  });

async function wishSummary(l: Lan, a: Attendance) {
  const names = await getDisplayNames(l.id, [...a.wishNear, ...a.wishAvoid]);
  const who = (ids: string[]) => ids.map((id) => names.get(id) ?? "?").join(", ");
  const lines = [
    a.wishNear.length ? `🤝 Near: ${who(a.wishNear)}` : "",
    a.wishAvoid.length ? `🙅 Not next to: ${who(a.wishAvoid)}` : "",
    a.wishPosition !== "any" ? `📍 ${POSITIONS[a.wishPosition][0].toUpperCase()}${POSITIONS[a.wishPosition].slice(1)}` : "",
    a.wishSeat ? `💺 Seat ${a.wishSeat}` : "",
    a.wishNote ? `📝 ${clip(a.wishNote, 300)}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

async function wishCommand(i: Interaction): Promise<Json> {
  const { me, events } = scopeOf(i);
  if (!me) return notLinked();
  const picked = pickedEvent(i, events);
  if (picked === "unknown") return unknownEvent();
  const open = wishEvents(events, me.id);
  const l = picked ?? (open.length === 1 ? open[0] : undefined);
  if (!l) return open.length ? whichEvent(open) : reply("No event takes seat wishes from you right now. Say you're coming first with `/coming`.");
  const denied = notMember(me, l);
  if (denied) return denied;
  if (l.seatsPublishedAt) return reply(`The seat plan for **${l.name}** is final. Ask a lead if you need to move.`);
  const a = myRow(l.id, me.id);
  if (!a || a.status === "declined") return reply(`Say you're coming to **${l.name}** first: \`/coming\`.`);

  const near = opt(i, "near");
  const avoid = opt(i, "avoid");
  const position = opt(i, "position") as keyof typeof POSITIONS | undefined;
  const seatWish = opt(i, "seat");
  const note = opt(i, "note");
  const clear = boolOpt(i, "clear") ?? false;
  const changes = [near, avoid, position, seatWish, note].some((v) => v !== undefined) || clear;
  const open_ = [openButton(l)];
  if (!changes) {
    const now = await wishSummary(l, a);
    return reply(
      now
        ? `Your seat wishes for **${l.name}**:\n${now}\n\n-# Change them with \`/wish\` options, or \`/wish clear:True\` to start over.`
        : `No seat wishes for **${l.name}** yet. Add some with \`/wish near:\`, \`avoid:\`, \`position:\`, \`seat:\` or \`note:\`.`,
      { components: [{ type: 1, components: open_ }] },
    );
  }

  // Someone picked from the suggestions (a user id) or typed a name that matches one person.
  const people = near || avoid ? await wishPeople(l, me.id) : [];
  const person = (v: string) => {
    const byId = people.find((p) => p.id === v);
    if (byId) return byId;
    const byName = people.filter((p) => nameMatches(p.name, v));
    return byName.length === 1 ? byName[0] : undefined;
  };
  const nearP = near ? person(near) : undefined;
  const avoidP = avoid ? person(avoid) : undefined;
  if ((near && !nearP) || (avoid && !avoidP))
    return reply("I don't know who you mean. Pick the person from the suggestions while you type; only people who answered for this event are listed.");

  let w = clear
    ? { near: [] as string[], avoid: [] as string[], position: "any" as const, seat: "", note: "" }
    : { near: a.wishNear, avoid: a.wishAvoid, position: a.wishPosition, seat: a.wishSeat, note: a.wishNote };
  if (nearP) w = { ...w, near: [...w.near.filter((x) => x !== nearP.id), nearP.id], avoid: w.avoid.filter((x) => x !== nearP.id) };
  if (avoidP) w = { ...w, avoid: [...w.avoid.filter((x) => x !== avoidP.id), avoidP.id], near: w.near.filter((x) => x !== avoidP.id) };
  if (position && position in POSITIONS) w = { ...w, position };
  if (seatWish !== undefined) w = { ...w, seat: seatWish };
  if (note !== undefined) w = { ...w, note };
  if (w.near.length > 10 || w.avoid.length > 10) return reply("That's more than 10 people. Start over with `/wish clear:True`.");
  try {
    saveSeatWishes(l.id, me.id, w);
  } catch {
    return reply("That didn't work: a seat is at most 12 characters, a note at most 300.");
  }
  const saved = myRow(l.id, me.id)!;
  const now = await wishSummary(l, saved);
  return reply(`👍 Seat wishes for **${l.name}** saved:\n${now || "none (anywhere is fine)"}\n\n-# The leads see them when they plan the seats.`, {
    components: [{ type: 1, components: open_ }],
  });
}

// ---------- Status ----------

const STEP_ICON: Record<StepState, string> = { done: "✅", pending: "⏳", todo: "⬜" };

/** One event's card for /status: your answer, the checklist (nick, ticket, seat) and what's due next. */
async function statusCard(l: Lan, me: User) {
  const a = myRow(l.id, me.id);
  const seats = db.select().from(seat).where(eq(seat.lanId, l.id)).all();
  const nicks = db.select().from(nickname).where(eq(nickname.userId, me.id)).all();
  const hasNick = nicks.some((n) => (n.lanId === null && n.typeId === null) || n.lanId === l.id || (!!l.typeId && n.typeId === l.typeId));
  // Lead assignments stay private until the plan is final; a self-picked seat shows while picking is on.
  const showSeat = !!l.seatsPublishedAt || (l.seatPicking && !l.seatsPublishedAt);
  const mySeat = showSeat ? (seats.find((s) => s.userId === me.id)?.label ?? null) : null;
  const nick = (await getNames(l.id, [me.id])).get(me.id)?.nick;
  const lines: string[] = [];
  if (l.interestCheck) {
    const mine = db.select().from(lanInterest).where(and(eq(lanInterest.lanId, l.id), eq(lanInterest.userId, me.id))).get()?.answer;
    lines.push(`Interest check: ${mine ? { yes: "you'd come", maybe: "maybe", no: "not this time" }[mine] : "**no answer yet**"}`);
  } else {
    const steps = buildChecklist({
      lan: l,
      attendance: a,
      hasNick,
      seatLabel: mySeat,
      hasSeatPlan: seats.length > 0,
      freeSeats: seats.filter((s) => !s.userId && !s.locked).length,
      waitlistPlace: a?.status === "waitlist" ? waitlistPositions(l.id).get(me.id) : undefined,
    });
    if (!a) lines.push("⬜ **No answer yet**: `/coming`, `/unsure` or `/not-coming`");
    else if (a.status !== "going")
      lines.push({ maybe: "🤔 You said **unsure**", declined: "❌ You're **not coming**", waitlist: `⏳ You're on the **waitlist** (#${waitlistPositions(l.id).get(me.id) ?? "?"})`, going: "" }[a.status]);
    // Not coming: the rest of the checklist doesn't apply.
    for (const s of a?.status === "declined" ? [] : steps) {
      if (s.key === "going" && a?.status !== "going") continue;
      const hint = s.key === "nick" && hasNick && nick ? `**${nick}**` : s.hint;
      lines.push(`${STEP_ICON[s.state]} ${s.title}: ${hint}`);
    }
    if (a && a.status !== "declined" && !l.seatsPublishedAt) {
      const wishes = await wishSummary(l, a);
      if (wishes) lines.push(`\n**Seat wishes**\n${wishes}`);
    }
  }
  const due = nextDeadline(l);
  if (due) lines.push(`\n${due}`);
  return {
    card: {
      title: clip(`${l.name} · ${when(l)}`, 256),
      url: lanLink(l),
      color: BRAND,
      description: clip(lines.join("\n"), 4000),
    },
    attendance: a,
    mySeat,
  };
}

async function statusCommand(i: Interaction): Promise<Json> {
  const { me, serverClan, events } = scopeOf(i);
  if (!me) return notLinked();
  const picked = pickedEvent(i, events);
  if (picked === "unknown") return unknownEvent();
  if (picked) {
    const denied = notMember(me, picked);
    if (denied) return denied;
    const { card, attendance: a, mySeat } = await statusCard(picked, me);
    const buttons: Json[] = [];
    if (!signupClosed(picked) && !attendanceLocked(a) && !picked.interestCheck && a?.status !== "going" && a?.status !== "waitlist")
      buttons.push({ type: 2, style: 3, label: "Coming", custom_id: `att:${picked.id}:going` });
    if (a && !a.paid && !a.ticketBought && (a.status === "going" || a.status === "waitlist"))
      buttons.push({ type: 2, style: 3, label: "I have my ticket", custom_id: `ticket:${picked.id}` });
    if (picked.externalPlanUrl && picked.seatsPublishedAt && mySeat && a?.status === "going" && !a.seatBooked) {
      buttons.push(bookedButton(picked.id));
      buttons.push({ type: 2, style: 5, label: "Event seat plan", url: picked.externalPlanUrl });
    }
    buttons.push(openButton(picked));
    return { type: 4, data: { flags: EPHEMERAL, embeds: [card], components: [{ type: 1, components: buttons }], allowed_mentions: { parse: [] } } };
  }
  const mine = events.filter((l) => isClanMember(me.id, l.clanId ?? "")).slice(0, 5);
  if (mine.length === 0) return reply(`No upcoming events${serverClan ? ` in **${serverClan.name}**` : ""} for you right now.`);
  const cards = await Promise.all(mine.map((l) => statusCard(l, me).then((c) => c.card)));
  return {
    type: 4,
    data: {
      flags: EPHEMERAL,
      content: events.length > 5 ? "-# Your next 5 events. Add `event:` for another one." : undefined,
      embeds: cards,
      components: [{ type: 1, components: mine.map((l) => ({ type: 2, style: 5, label: clip(l.name, 80), url: lanLink(l) })) }],
      allowed_mentions: { parse: [] },
    },
  };
}

// ---------- Entry points ----------

/** A member slash command, or undefined when it isn't one. */
export function handleMemberCommand(i: Interaction, editReply: EditReply): Handled | undefined {
  const name = i.data?.name ?? "";
  if (i.type !== 2 || !MEMBER_COMMANDS.has(name)) return undefined;
  if (name in ANSWERS) return answerCommand(i, ANSWERS[name], editReply);
  if (name === "ticket") return ticketCommand(i);
  if (name === "nick") return nickCommand(i);
  if (name === "wish") return { response: wishCommand(i) };
  return { response: statusCommand(i) };
}

/** The "I have my ticket" button from /ticket and /status. */
export function handleTicketButton(i: Interaction): Handled {
  const l = getLan(i.data?.custom_id?.slice("ticket:".length) ?? "");
  if (!l) return { response: reply("This LAN doesn't exist anymore.") };
  const me = seatbitUserFor(i.member?.user.id ?? i.user?.id ?? "");
  if (!me) return { response: notLinked() };
  return ticketFor(l, me, true);
}

/** Suggestions while typing `event:`, `near:` or `avoid:` in a member command. */
export function memberAutocomplete(i: Interaction): Json | Promise<Json> | undefined {
  const name = i.data?.name ?? "";
  if (i.type !== 4 || !MEMBER_COMMANDS.has(name)) return undefined;
  const focused = i.data?.options?.find((o) => o.focused);
  const q = String(focused?.value ?? "").trim();
  const choices = (list: { name: string; value: string }[]) => ({ type: 8, data: { choices: list.slice(0, 25) } });
  const { me, events } = scopeOf(i);

  if (focused?.name === "event") {
    // Each command suggests the events it can act on first.
    let list = events;
    if (me && name === "wish") list = wishEvents(events, me.id);
    if (me && name === "ticket") list = events.filter((l) => myRow(l.id, me.id)?.status === "going" || myRow(l.id, me.id)?.status === "waitlist");
    if (name in ANSWERS) list = events.filter((l) => l.interestCheck || !signupClosed(l));
    if (!list.length) list = events;
    return choices(list.filter((l) => !q || nameMatches(l.name, q)).map((l) => ({ name: clip(`${l.name} · ${when(l)}`, 100), value: l.id })));
  }

  if (name === "wish" && me && (focused?.name === "near" || focused?.name === "avoid")) {
    const picked = pickedEvent(i, events);
    const open = wishEvents(events, me.id);
    const l = picked && picked !== "unknown" ? picked : open.length === 1 ? open[0] : undefined;
    if (!l) return choices([]);
    return wishPeople(l, me.id).then((people) =>
      choices(people.filter((p) => !q || nameMatches(p.name, q)).map((p) => ({ name: clip(p.name, 100), value: p.id }))),
    );
  }
  return choices([]);
}
