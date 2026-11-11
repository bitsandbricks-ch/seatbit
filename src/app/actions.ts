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
  trimSeatGrid,
} from "@/lib/lans";
import { sendReminderNow } from "@/lib/reminders";
import { requireAdmin, requireUser } from "@/lib/session";

const { attendance, nickname, seat, lan, user } = schema;

function mustGetLan(id: string) {
  const l = getLan(id);
  if (!l) throw new Error("LAN not found");
  return l;
}

const lanPath = (id: string) => {
  revalidatePath(`/lans/${id}`);
  revalidatePath(`/admin/lans/${id}`);
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
});

export async function addNick(formData: FormData) {
  const me = await requireUser();
  const { nick, lanId } = nickInput.parse({
    nick: formData.get("nick"),
    lanId: formData.get("lanId") ?? undefined,
  });
  const existing = db
    .select()
    .from(nickname)
    .where(eq(nickname.userId, me.id))
    .all()
    .filter((n) => n.lanId === lanId);
  db.insert(nickname)
    .values({ userId: me.id, lanId, nick, isPrimary: existing.length === 0 })
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
      .find((x) => x.lanId === n.lanId);
    if (next) db.update(nickname).set({ isPrimary: true }).where(eq(nickname.id, next.id)).run();
  }
  revalidatePath("/", "layout");
}

export async function setPrimaryNick(id: string) {
  const me = await requireUser();
  const n = db.select().from(nickname).where(eq(nickname.id, id)).get();
  if (!n || n.userId !== me.id) return;
  for (const other of db.select().from(nickname).where(eq(nickname.userId, me.id)).all()) {
    if (other.lanId !== n.lanId) continue;
    db.update(nickname)
      .set({ isPrimary: other.id === id })
      .where(eq(nickname.id, other.id))
      .run();
  }
  revalidatePath("/", "layout");
}

export async function pickSeat(seatId: string) {
  const me = await requireUser();
  const s = db.select().from(seat).where(eq(seat.id, seatId)).get();
  if (!s) throw new Error("Seat not found");
  const l = mustGetLan(s.lanId);
  if (!l.seatingOpen) throw new Error("Seating is closed");
  if (s.locked || (s.userId && s.userId !== me.id)) throw new Error("Seat is taken");
  const a = db
    .select()
    .from(attendance)
    .where(and(eq(attendance.lanId, l.id), eq(attendance.userId, me.id)))
    .get();
  if (a?.status !== "going") throw new Error("Only attendees who are going can pick a seat");
  db.transaction((tx) => {
    tx.update(seat)
      .set({ userId: null })
      .where(and(eq(seat.lanId, l.id), eq(seat.userId, me.id)))
      .run();
    tx.update(seat).set({ userId: me.id }).where(eq(seat.id, seatId)).run();
  });
  lanPath(l.id);
}

export async function releaseMySeat(lanId: string) {
  const me = await requireUser();
  const l = mustGetLan(lanId);
  if (!l.seatingOpen) throw new Error("Seating is closed");
  db.update(seat)
    .set({ userId: null })
    .where(and(eq(seat.lanId, lanId), eq(seat.userId, me.id)))
    .run();
  lanPath(lanId);
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

const lanInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(5000).default(""),
  location: z.string().max(200).default(""),
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
  seatRows: z.coerce.number().int().min(1).max(40),
  seatCols: z.coerce.number().int().min(1).max(40),
  seatingOpen: z.string().optional().transform((v) => v === "on"),
});

export type FormState = { error?: string } | undefined;

export async function saveLan(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = (formData.get("id") as string) || null;
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
    trimSeatGrid(id, v.seatRows, v.seatCols);
    if ((v.capacity ?? Infinity) > (before.capacity ?? Infinity) || v.capacity === null) {
      await promoteFromWaitlist(mustGetLan(id));
    }
  } else {
    const row = db.insert(lan).values(v).returning().get();
    lanId = row.id;
    // Start with a full grid of seats; admins carve out aisles in the editor.
    const seats = [];
    for (let r = 0; r < v.seatRows; r++)
      for (let c = 0; c < v.seatCols; c++)
        seats.push({ lanId: row.id, row: r, col: c, label: seatLabel(r, c) });
    if (seats.length) db.insert(seat).values(seats).run();
  }
  lanPath(lanId!);
  redirect(`/admin/lans/${lanId}`);
}

export async function deleteLan(id: string) {
  await requireAdmin();
  db.delete(lan).where(eq(lan.id, id)).run();
  revalidatePath("/");
  redirect("/admin");
}

export async function toggleSeatCell(lanId: string, row: number, col: number) {
  await requireAdmin();
  const l = mustGetLan(lanId);
  if (row >= l.seatRows || col >= l.seatCols) return;
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
  await requireAdmin();
  const s = db.select().from(seat).where(eq(seat.id, seatId)).get();
  if (!s) return;
  const clean = label.trim().slice(0, 12);
  if (!clean) return;
  db.update(seat).set({ label: clean }).where(eq(seat.id, seatId)).run();
  lanPath(s.lanId);
}

export async function toggleSeatLock(seatId: string) {
  await requireAdmin();
  const s = db.select().from(seat).where(eq(seat.id, seatId)).get();
  if (!s) return;
  db.update(seat).set({ locked: !s.locked }).where(eq(seat.id, seatId)).run();
  lanPath(s.lanId);
}

export async function adminAssignSeat(seatId: string, userId: string | null) {
  await requireAdmin();
  const s = db.select().from(seat).where(eq(seat.id, seatId)).get();
  if (!s) return;
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
  await requireAdmin();
  if (!ATTENDANCE_STATUSES.includes(status)) throw new Error("Bad status");
  // Admins can override capacity.
  await setAttendance(mustGetLan(lanId), userId, status, { force: true });
  lanPath(lanId);
}

export async function adminRemoveAttendance(lanId: string, userId: string) {
  await requireAdmin();
  const l = mustGetLan(lanId);
  await setAttendance(l, userId, "declined", { force: true });
  db.delete(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId)))
    .run();
  lanPath(lanId);
}

export async function adminSetPaid(attendanceId: string, paid: boolean) {
  await requireAdmin();
  const a = db.select().from(attendance).where(eq(attendance.id, attendanceId)).get();
  if (!a) return;
  db.update(attendance).set({ paid }).where(eq(attendance.id, attendanceId)).run();
  lanPath(a.lanId);
}

export async function adminSetNote(attendanceId: string, note: string) {
  await requireAdmin();
  const a = db.select().from(attendance).where(eq(attendance.id, attendanceId)).get();
  if (!a) return;
  db.update(attendance).set({ note: note.slice(0, 500) }).where(eq(attendance.id, attendanceId)).run();
  lanPath(a.lanId);
}

export async function adminSendReminder(
  lanId: string,
  kind: "signup" | "payment" | "event",
): Promise<number> {
  await requireAdmin();
  return sendReminderNow(mustGetLan(lanId), kind);
}

export async function setUserRole(userId: string, role: "admin" | "member") {
  const me = await requireAdmin();
  if (userId === me.id && role !== "admin") throw new Error("You can't demote yourself");
  db.update(user).set({ role }).where(eq(user.id, userId)).run();
  revalidatePath("/admin");
}
