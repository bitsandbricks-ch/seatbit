"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/db/schema";
import {
  getLan,
  promoteFromWaitlist,
  seatLabel,
  setAttendance,
  signupClosed,
} from "@/lib/lans";
import { announceLan, postReminderNow, refreshLanMessagesSoon, unlinkChannel } from "@/lib/discord";
import { sendReminderNow } from "@/lib/reminders";
import { planSeats } from "@/lib/seating";
import { appUrl, sendMail } from "@/lib/mail";
import { canViewLan, requireAdmin, requireClanManager, requireLanManager, requireUser } from "@/lib/session";
import { isClanMember } from "@/lib/clans";

const { attendance, nickname, seat, lan, user, lanOrga, lanType } = schema;

function mustGetLan(id: string) {
  const l = getLan(id);
  if (!l) throw new Error("LAN not found");
  return l;
}

const lanPath = (id: string) => {
  revalidatePath(`/lans/${id}`);
  revalidatePath(`/lans/${id}/manage`);
  revalidatePath("/");
};

// ---------------- Member actions ----------------

export async function setMyAttendance(lanId: string, status: AttendanceStatus) {
  const me = await requireUser();
  const l = mustGetLan(lanId);
  if (!canViewLan(me, lanId)) throw new Error("Join the clan first");
  if (!ATTENDANCE_STATUSES.includes(status) || status === "waitlist") throw new Error("Bad status");
  if (signupClosed(l)) throw new Error("Sign-up for this LAN is closed");
  await setAttendance(l, me.id, status);
  lanPath(lanId);
}

const nickInput = z.object({
  nick: z.string().trim().min(1).max(32),
  lanId: z.string().optional().transform((v) => v || null),
  typeId: z.string().optional().transform((v) => v || null),
});

const sameScope = (a: { lanId: string | null; typeId: string | null }, b: typeof a) =>
  a.lanId === b.lanId && a.typeId === b.typeId;

/** Sets the user's one nick for a scope (default, LAN type or single event). Empty removes it. */
export async function setNick(formData: FormData) {
  const me = await requireUser();
  saveNick(me.id, String(formData.get("nick") ?? ""), formData.get("lanId"), formData.get("typeId"));
  revalidatePath("/", "layout");
}

function saveNick(userId: string, raw: string, lanId?: FormDataEntryValue | null, typeId?: FormDataEntryValue | null) {
  const nickRaw = raw.trim();
  const scope = nickInput.parse({ nick: nickRaw || "-", lanId: lanId ?? undefined, typeId: typeId ?? undefined });
  if (scope.lanId && scope.typeId) throw new Error("Pick one scope");
  const mine = db.select().from(nickname).where(eq(nickname.userId, userId)).all();
  db.transaction((tx) => {
    for (const n of mine) if (sameScope(n, scope)) tx.delete(nickname).where(eq(nickname.id, n.id)).run();
    if (nickRaw) {
      tx.insert(nickname)
        .values({ userId, lanId: scope.lanId, typeId: scope.typeId, nick: scope.nick, isPrimary: true })
        .run();
    }
  });
}

const personName = z.string().trim().min(1).max(40);

/** First name, surname and the user's own nickname (gamer tag, independent of events). */
export async function updateProfile(formData: FormData) {
  const me = await requireUser({ allowIncomplete: true });
  const firstName = personName.parse(formData.get("firstName"));
  const lastName = personName.parse(formData.get("lastName"));
  const emailReminders = formData.get("emailReminders") === "on";
  db.update(user)
    .set({ firstName, lastName, name: `${firstName} ${lastName}`, emailReminders })
    .where(eq(user.id, me.id))
    .run();
  if (formData.has("nick")) saveNick(me.id, String(formData.get("nick")));
  revalidatePath("/", "layout");
}

/** First-login form: saves the names and nickname, then continues to the app. */
export async function completeProfile(formData: FormData) {
  await updateProfile(formData);
  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

// ---------------- Admin actions ----------------

const optDate = z
  .string()
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !isNaN(d.getTime()), "Invalid date");

const optId = z
  .string()
  .optional()
  .transform((v) => v || null);

const lanInput = z.object({
  typeId: optId,
  name: z.string().trim().min(1).max(100),
  description: z.string().max(5000).default(""),
  location: z.string().max(200).default(""),
  websiteUrl: z.union([z.literal(""), z.url().max(500)]).default(""),
  ticketUrl: z.union([z.literal(""), z.url().max(500)]).default(""),
  startsAt: z.string().min(1).transform((v) => new Date(v)),
  endsAt: z.string().min(1).transform((v) => new Date(v)),
  signupDeadline: optDate,
  paymentDueDate: optDate,
  price: z.string().max(50).default(""),
  capacity: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(1).nullable()),
  reminderDays: z.coerce.number().int().min(0).max(60),
});

export type FormState = { error?: string; ok?: boolean } | undefined;

export async function saveLan(_: FormState, formData: FormData): Promise<FormState> {
  const id = (formData.get("id") as string) || null;
  const clanId = id ? mustGetLan(id).clanId : String(formData.get("clanId") ?? "");
  if (!clanId) return { error: "Pick a clan." };
  const me = id ? await requireLanManager(id) : await requireClanManager(clanId);
  const parsed = lanInput.safeParse(
    Object.fromEntries([...formData.entries()].filter(([k]) => k !== "id" && k !== "clanId")),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") };
  }
  const v = parsed.data;
  if (v.endsAt <= v.startsAt) return { error: "The end must be after the start." };
  if (v.typeId) {
    const t = db.select().from(lanType).where(eq(lanType.id, v.typeId)).get();
    if (t?.clanId !== clanId) return { error: "That LAN type belongs to another clan." };
  }

  let lanId = id;
  if (id) {
    const before = mustGetLan(id);
    db.update(lan).set(v).where(eq(lan.id, id)).run();
    if ((v.capacity ?? Infinity) > (before.capacity ?? Infinity) || v.capacity === null) {
      await promoteFromWaitlist(mustGetLan(id));
    }
  } else {
    const row = db.insert(lan).values({ ...v, clanId }).returning().get();
    lanId = row.id;
    db.insert(lanOrga).values({ lanId: row.id, userId: me.id }).run();
    const t = v.typeId ? db.select().from(lanType).where(eq(lanType.id, v.typeId)).get() : undefined;
    if (t?.seatSpec) applySeatSpec(row.id, t.seatSpec);
  }
  lanPath(lanId!);
  // New LANs are announced in the Discord channels; edits update the existing posts.
  if (id) refreshLanMessagesSoon(id);
  else await announceLan(lanId!).catch((e) => console.error("[discord] announce failed", e));
  redirect(`/lans/${lanId}/manage`);
}

export async function deleteLan(id: string) {
  const l = mustGetLan(id);
  if (!l.clanId) await requireAdmin();
  else await requireClanManager(l.clanId);
  db.delete(lan).where(eq(lan.id, id)).run();
  revalidatePath("/");
  redirect("/");
}

export async function toggleSeatCell(lanId: string, row: number, col: number) {
  await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  if (row < 0 || col < 0 || row >= l.seatRows || col >= l.seatCols) return;
  const s = db
    .select()
    .from(seat)
    .where(and(eq(seat.lanId, lanId), eq(seat.row, row), eq(seat.col, col)))
    .get();
  if (s) db.delete(seat).where(eq(seat.id, s.id)).run();
  else db.insert(seat).values({ lanId, row, col, label: seatLabel(row, col) }).run();
  lanPath(lanId);
}

export async function renameSeat(seatId: string, label: string) {
  const s = db.select().from(seat).where(eq(seat.id, seatId)).get();
  if (!s) return;
  await requireLanManager(s.lanId);
  const clean = label.trim().slice(0, 12);
  if (!clean) return;
  db.update(seat).set({ label: clean }).where(eq(seat.id, seatId)).run();
  lanPath(s.lanId);
}

export async function toggleSeatLock(seatId: string) {
  const s = db.select().from(seat).where(eq(seat.id, seatId)).get();
  if (!s) return;
  await requireLanManager(s.lanId);
  db.update(seat).set({ locked: !s.locked }).where(eq(seat.id, seatId)).run();
  lanPath(s.lanId);
}

export async function adminAssignSeat(seatId: string, userId: string | null) {
  const s = db.select().from(seat).where(eq(seat.id, seatId)).get();
  if (!s) return;
  await requireLanManager(s.lanId);
  db.transaction((tx) => {
    if (userId) {
      tx.update(seat)
        .set({ userId: null })
        .where(and(eq(seat.lanId, s.lanId), eq(seat.userId, userId)))
        .run();
    }
    tx.update(seat).set({ userId }).where(eq(seat.id, seatId)).run();
  });
  lanPath(s.lanId);
}

export async function adminSetAttendance(lanId: string, userId: string, status: AttendanceStatus) {
  await requireLanManager(lanId);
  const cid = mustGetLan(lanId).clanId;
  if (cid && !isClanMember(userId, cid)) throw new Error("Not a member of this clan");
  if (!ATTENDANCE_STATUSES.includes(status)) throw new Error("Bad status");
  // Admins can override capacity.
  await setAttendance(mustGetLan(lanId), userId, status, { force: true });
  lanPath(lanId);
}

export async function adminRemoveAttendance(lanId: string, userId: string) {
  await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  await setAttendance(l, userId, "declined", { force: true });
  db.delete(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId)))
    .run();
  lanPath(lanId);
}

export async function adminSetPaid(attendanceId: string, paid: boolean) {
  const a = db.select().from(attendance).where(eq(attendance.id, attendanceId)).get();
  if (!a) return;
  await requireLanManager(a.lanId);
  db.update(attendance).set({ paid }).where(eq(attendance.id, attendanceId)).run();
  lanPath(a.lanId);
}

export async function adminSetNote(attendanceId: string, note: string) {
  const a = db.select().from(attendance).where(eq(attendance.id, attendanceId)).get();
  if (!a) return;
  await requireLanManager(a.lanId);
  db.update(attendance).set({ note: note.slice(0, 500) }).where(eq(attendance.id, attendanceId)).run();
  lanPath(a.lanId);
}

export async function adminSendReminder(
  lanId: string,
  kind: "signup" | "payment" | "event",
): Promise<number> {
  await requireLanManager(lanId);
  return sendReminderNow(mustGetLan(lanId), kind);
}

export async function postLanToDiscord(lanId: string): Promise<number> {
  await requireLanManager(lanId);
  return announceLan(lanId);
}

export async function unlinkDiscordChannel(channelId: string) {
  const me = await requireUser();
  if (!unlinkChannel(me, channelId)) throw new Error("Not allowed");
  revalidatePath("/clans", "layout");
}

export async function postDiscordReminder(lanId: string, kind: "signup" | "payment" | "event"): Promise<number> {
  await requireLanManager(lanId);
  return postReminderNow(mustGetLan(lanId), kind);
}

export async function setUserRole(userId: string, role: "admin" | "member") {
  const me = await requireAdmin();
  if (userId === me.id && role !== "admin") throw new Error("You can't demote yourself");
  db.update(user).set({ role }).where(eq(user.id, userId)).run();
  revalidatePath("/admin");
}

export async function setMyTicketBought(lanId: string, bought: boolean) {
  const me = await requireUser();
  const a = db
    .select()
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.userId, me.id)))
    .get();
  if (!a) throw new Error("Say whether you're coming first");
  db.update(attendance).set({ ticketBought: bought }).where(eq(attendance.id, a.id)).run();
  lanPath(lanId);
}

export async function addOrga(lanId: string, userId: string) {
  await requireLanManager(lanId);
  const cid = mustGetLan(lanId).clanId;
  if (cid && !isClanMember(userId, cid)) throw new Error("Not a member of this clan");
  db.insert(lanOrga).values({ lanId, userId }).onConflictDoNothing().run();
  lanPath(lanId);
}

export async function removeOrga(lanId: string, userId: string) {
  await requireLanManager(lanId);
  db.delete(lanOrga)
    .where(and(eq(lanOrga.lanId, lanId), eq(lanOrga.userId, userId)))
    .run();
  lanPath(lanId);
}

/** Fills a seat row; if it is already full, removes its unoccupied seats. */
export async function toggleSeatRow(lanId: string, row: number) {
  await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  if (row < 0 || row >= l.seatRows) return;
  const existing = db
    .select()
    .from(seat)
    .where(and(eq(seat.lanId, lanId), eq(seat.row, row)))
    .all();
  if (existing.length < l.seatCols) {
    const have = new Set(existing.map((s) => s.col));
    const add = [];
    for (let c = 0; c < l.seatCols; c++)
      if (!have.has(c)) add.push({ lanId, row, col: c, label: seatLabel(row, c) });
    if (add.length) db.insert(seat).values(add).run();
  } else {
    for (const s of existing) if (!s.userId) db.delete(seat).where(eq(seat.id, s.id)).run();
  }
  lanPath(lanId);
}

/**
 * Parses a seat list like "F1-F20" or "F1-F10, G1-G10, H3" into rows of labels.
 * Each letter prefix becomes one row, in the order given.
 */
function parseSeatSpec(spec: string): string[][] {
  const rows = new Map<string, string[]>();
  for (const raw of spec.split(/[\s,;]+/).filter(Boolean)) {
    const range = raw.match(/^([A-Za-z]*)(\d+)-(?:([A-Za-z]*))?(\d+)$/);
    const single = raw.match(/^([A-Za-z]*)(\d+)$/);
    let prefix: string, from: number, to: number;
    if (range && (!range[3] || range[3].toUpperCase() === range[1].toUpperCase())) {
      [prefix, from, to] = [range[1].toUpperCase(), Number(range[2]), Number(range[4])];
    } else if (single) {
      [prefix, from, to] = [single[1].toUpperCase(), Number(single[2]), Number(single[2])];
    } else {
      throw new Error(`Can't read "${raw}". Use e.g. F1-F20 or F1, F2, G5.`);
    }
    if (to < from) [from, to] = [to, from];
    if (to - from > 200) throw new Error(`"${raw}" is too many seats`);
    const row = rows.get(prefix) ?? [];
    for (let n = from; n <= to; n++) {
      const label = `${prefix}${n}`;
      if (!row.includes(label)) row.push(label);
    }
    rows.set(prefix, row);
  }
  return [...rows.values()];
}

/** Replaces the seat block with the given seat labels, keeping assignments for labels that remain. */
function applySeatSpec(lanId: string, spec: string): { error?: string; count?: number } {
  let rows: string[][];
  try {
    rows = parseSeatSpec(spec);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const total = rows.reduce((n, r) => n + r.length, 0);
  if (total === 0) return { error: "Enter at least one seat, e.g. F1-F20." };
  if (total > 1000) return { error: "That's more than 1000 seats." };
  const old = new Map(
    db.select().from(seat).where(eq(seat.lanId, lanId)).all().map((s) => [s.label.toUpperCase(), s]),
  );
  db.transaction((tx) => {
    tx.delete(seat).where(eq(seat.lanId, lanId)).run();
    const values = rows.flatMap((labels, r) =>
      labels.map((label, c) => {
        const prev = old.get(label);
        return { lanId, row: r, col: c, label, userId: prev?.userId ?? null, locked: prev?.locked ?? false };
      }),
    );
    tx.insert(seat).values(values).run();
    tx.update(lan)
      .set({ seatRows: rows.length, seatCols: Math.max(...rows.map((r) => r.length)) })
      .where(eq(lan.id, lanId))
      .run();
  });
  return { count: total };
}

export async function setSeatsFromList(lanId: string, spec: string): Promise<{ error?: string; count?: number }> {
  await requireLanManager(lanId);
  const r = applySeatSpec(lanId, spec);
  if (!r.error) lanPath(lanId);
  return r;
}

/** Assigns a seat to an attendee from the attendee list (seatId null = no seat). */
export async function adminSetSeatFor(lanId: string, userId: string, seatId: string | null) {
  await requireLanManager(lanId);
  db.transaction((tx) => {
    tx.update(seat)
      .set({ userId: null })
      .where(and(eq(seat.lanId, lanId), eq(seat.userId, userId)))
      .run();
    if (seatId) tx.update(seat).set({ userId }).where(and(eq(seat.id, seatId), eq(seat.lanId, lanId))).run();
  });
  lanPath(lanId);
}

function planPeople(lanId: string) {
  return db
    .select()
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.status, "going")))
    .all()
    .map((a) => ({
      userId: a.userId,
      near: a.wishNear ?? [],
      avoid: a.wishAvoid ?? [],
      position: a.wishPosition,
      seat: a.wishSeat,
      priority: a.paid ? 2 : a.ticketBought ? 1 : 0,
      order: a.createdAt.getTime(),
    }));
}

/**
 * Seats attendees who are coming, using their seat wishes. "fill" only seats
 * people without a seat; "replan" first clears every seat that isn't held.
 * People with a confirmed or reported ticket go first.
 */
export async function adminAutoAssignSeats(lanId: string, mode: "fill" | "replan" = "fill"): Promise<number> {
  await requireLanManager(lanId);
  if (mode === "replan") {
    db.update(seat)
      .set({ userId: null })
      .where(and(eq(seat.lanId, lanId), eq(seat.locked, false)))
      .run();
  }
  const seats = db.select().from(seat).where(eq(seat.lanId, lanId)).all();
  const everyone = planPeople(lanId);
  const seated = new Set(seats.map((s) => s.userId).filter(Boolean));
  const plan = planSeats(seats, everyone.filter((p) => !seated.has(p.userId)), everyone);
  db.transaction((tx) => {
    for (const [userId, seatId] of plan) tx.update(seat).set({ userId }).where(eq(seat.id, seatId)).run();
  });
  lanPath(lanId);
  return plan.size;
}

const wishInput = z.object({
  near: z.array(z.string()).max(10),
  avoid: z.array(z.string()).max(10),
  position: z.enum(["any", "edge", "middle"]),
  seat: z.string().trim().max(12),
  note: z.string().trim().max(300),
});

export async function setMySeatWishes(lanId: string, input: z.input<typeof wishInput>) {
  const me = await requireUser();
  const l = mustGetLan(lanId);
  if (l.seatsPublishedAt) throw new Error("The seat plan is already published. Ask an orga.");
  const w = wishInput.parse(input);
  const a = db
    .select()
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.userId, me.id)))
    .get();
  if (!a) throw new Error("Say you're coming first");
  db.update(attendance)
    .set({
      wishNear: w.near.filter((x) => x !== me.id),
      wishAvoid: w.avoid.filter((x) => x !== me.id && !w.near.includes(x)),
      wishPosition: w.position,
      wishSeat: w.seat.toUpperCase(),
      wishNote: w.note,
    })
    .where(eq(attendance.id, a.id))
    .run();
  lanPath(lanId);
}

/** Makes the seat plan visible to members; optionally emails everyone coming their seat. */
export async function publishSeats(lanId: string, notify: boolean): Promise<number> {
  await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  db.update(lan).set({ seatsPublishedAt: new Date() }).where(eq(lan.id, lanId)).run();
  let sent = 0;
  if (notify) {
    const rows = db
      .select({ a: attendance, u: user })
      .from(attendance)
      .innerJoin(user, eq(user.id, attendance.userId))
      .where(and(eq(attendance.lanId, lanId), eq(attendance.status, "going")))
      .all();
    const seats = db.select().from(seat).where(eq(seat.lanId, lanId)).all();
    for (const { u } of rows) {
      const mine = seats.find((s) => s.userId === u.id);
      try {
        await sendMail(
          u.email,
          mine ? `Your seat at ${l.name}: ${mine.label}` : `Seat plan for ${l.name} is out`,
          `Hi ${u.name},\n\nthe seat plan for ${l.name} is published. ${
            mine ? `You're sitting at ${mine.label}.` : "You don't have a seat yet, an orga will get back to you."
          }\n\n${appUrl}/lans/${l.id}`,
        );
        sent++;
      } catch (e) {
        console.error("[mail] failed", e);
      }
    }
  }
  lanPath(lanId);
  return sent;
}

export async function unpublishSeats(lanId: string) {
  await requireLanManager(lanId);
  db.update(lan).set({ seatsPublishedAt: null }).where(eq(lan.id, lanId)).run();
  lanPath(lanId);
}

// ---------------- LAN types (templates) ----------------

const lanTypeInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(5000).default(""),
  location: z.string().max(200).default(""),
  websiteUrl: z.union([z.literal(""), z.url().max(500)]).default(""),
  ticketUrl: z.union([z.literal(""), z.url().max(500)]).default(""),
  price: z.string().max(50).default(""),
  capacity: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(1).nullable()),
  reminderDays: z.coerce.number().int().min(0).max(60),
  seatSpec: z.string().max(500).default(""),
});

export async function saveLanType(_: FormState, formData: FormData): Promise<FormState> {
  const id = (formData.get("id") as string) || null;
  const existing = id ? db.select().from(lanType).where(eq(lanType.id, id)).get() : undefined;
  const clanId = existing?.clanId ?? String(formData.get("clanId") ?? "");
  if (!clanId) return { error: "Pick a clan." };
  await requireClanManager(clanId);
  const parsed = lanTypeInput.safeParse(
    Object.fromEntries([...formData.entries()].filter(([k]) => k !== "id" && k !== "clanId")),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") };
  }
  if (parsed.data.seatSpec) {
    try {
      parseSeatSpec(parsed.data.seatSpec);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  if (id) db.update(lanType).set(parsed.data).where(eq(lanType.id, id)).run();
  else db.insert(lanType).values({ ...parsed.data, clanId }).run();
  revalidatePath("/", "layout");
  redirect(`/clans/${clanSlug(clanId)}/settings?tab=types`);
}

export async function deleteLanType(id: string) {
  const t = db.select().from(lanType).where(eq(lanType.id, id)).get();
  if (!t?.clanId) return;
  await requireClanManager(t.clanId);
  db.delete(lanType).where(eq(lanType.id, id)).run();
  revalidatePath("/", "layout");
  redirect(`/clans/${clanSlug(t.clanId)}/settings?tab=types`);
}

function clanSlug(clanId: string) {
  return db.select({ slug: schema.clan.slug }).from(schema.clan).where(eq(schema.clan.id, clanId)).get()?.slug ?? "";
}
