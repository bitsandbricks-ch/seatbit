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
import { sendReminderNow } from "@/lib/reminders";
import { requireAdmin, requireLanManager, requireUser } from "@/lib/session";

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

export async function addNick(formData: FormData) {
  const me = await requireUser();
  const scope = nickInput.parse({
    nick: formData.get("nick"),
    lanId: formData.get("lanId") ?? undefined,
    typeId: formData.get("typeId") ?? undefined,
  });
  if (scope.lanId && scope.typeId) throw new Error("Pick one scope");
  const existing = db
    .select()
    .from(nickname)
    .where(eq(nickname.userId, me.id))
    .all()
    .filter((n) => sameScope(n, scope));
  db.insert(nickname)
    .values({ userId: me.id, lanId: scope.lanId, typeId: scope.typeId, nick: scope.nick, isPrimary: existing.length === 0 })
    .run();
  revalidatePath("/", "layout");
}

export async function deleteNick(id: string) {
  const me = await requireUser();
  const n = db.select().from(nickname).where(eq(nickname.id, id)).get();
  if (!n || n.userId !== me.id) return;
  db.delete(nickname).where(eq(nickname.id, id)).run();
  if (n.isPrimary) {
    const next = db
      .select()
      .from(nickname)
      .where(eq(nickname.userId, me.id))
      .all()
      .find((x) => sameScope(x, n));
    if (next) db.update(nickname).set({ isPrimary: true }).where(eq(nickname.id, next.id)).run();
  }
  revalidatePath("/", "layout");
}

export async function setPrimaryNick(id: string) {
  const me = await requireUser();
  const n = db.select().from(nickname).where(eq(nickname.id, id)).get();
  if (!n || n.userId !== me.id) return;
  for (const other of db.select().from(nickname).where(eq(nickname.userId, me.id)).all()) {
    if (!sameScope(other, n)) continue;
    db.update(nickname)
      .set({ isPrimary: other.id === id })
      .where(eq(nickname.id, other.id))
      .run();
  }
  revalidatePath("/", "layout");
}

export async function updateProfile(formData: FormData) {
  const me = await requireUser();
  const name = z.string().trim().min(1).max(64).parse(formData.get("name"));
  const emailReminders = formData.get("emailReminders") === "on";
  db.update(user).set({ name, emailReminders }).where(eq(user.id, me.id)).run();
  revalidatePath("/", "layout");
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

export type FormState = { error?: string } | undefined;

export async function saveLan(_: FormState, formData: FormData): Promise<FormState> {
  const id = (formData.get("id") as string) || null;
  const me = id ? await requireLanManager(id) : await requireAdmin();
  const parsed = lanInput.safeParse(
    Object.fromEntries([...formData.entries()].filter(([k]) => k !== "id")),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") };
  }
  const v = parsed.data;
  if (v.endsAt <= v.startsAt) return { error: "The end must be after the start." };

  let lanId = id;
  if (id) {
    const before = mustGetLan(id);
    db.update(lan).set(v).where(eq(lan.id, id)).run();
    if ((v.capacity ?? Infinity) > (before.capacity ?? Infinity) || v.capacity === null) {
      await promoteFromWaitlist(mustGetLan(id));
    }
  } else {
    const row = db.insert(lan).values(v).returning().get();
    lanId = row.id;
    db.insert(lanOrga).values({ lanId: row.id, userId: me.id }).run();
    const t = v.typeId ? db.select().from(lanType).where(eq(lanType.id, v.typeId)).get() : undefined;
    if (t?.seatSpec) applySeatSpec(row.id, t.seatSpec);
  }
  lanPath(lanId!);
  redirect(`/lans/${lanId}/manage`);
}

export async function deleteLan(id: string) {
  await requireAdmin();
  db.delete(lan).where(eq(lan.id, id)).run();
  revalidatePath("/");
  redirect("/admin");
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

/**
 * Fills free (not held) seats, in seat order, with attendees who are going
 * and have no seat yet. Attendees with a confirmed or reported ticket go first.
 */
export async function adminAutoAssignSeats(lanId: string): Promise<number> {
  await requireLanManager(lanId);
  const seats = db.select().from(seat).where(eq(seat.lanId, lanId)).all();
  const seated = new Set(seats.map((s) => s.userId).filter(Boolean));
  const free = seats
    .filter((s) => !s.userId && !s.locked)
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const waiting = db
    .select()
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.status, "going")))
    .all()
    .filter((a) => !seated.has(a.userId))
    .sort(
      (a, b) =>
        Number(b.paid) - Number(a.paid) ||
        Number(b.ticketBought) - Number(a.ticketBought) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
  let n = 0;
  for (const a of waiting) {
    const s = free.shift();
    if (!s) break;
    db.update(seat).set({ userId: a.userId }).where(eq(seat.id, s.id)).run();
    n++;
  }
  lanPath(lanId);
  return n;
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
  await requireAdmin();
  const id = (formData.get("id") as string) || null;
  const parsed = lanTypeInput.safeParse(
    Object.fromEntries([...formData.entries()].filter(([k]) => k !== "id")),
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
  else db.insert(lanType).values(parsed.data).run();
  revalidatePath("/", "layout");
  redirect("/admin/types");
}

export async function deleteLanType(id: string) {
  await requireAdmin();
  db.delete(lanType).where(eq(lanType.id, id)).run();
  revalidatePath("/", "layout");
  redirect("/admin/types");
}
