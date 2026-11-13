"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/db/schema";
import { DISCORD_MODES } from "@/lib/discord-modes";
import {
  getLan,
  moveUp,
  promoteFromWaitlist,
  reorderWaitlist,
  setAttendance,
  signupClosed,
  ATTENDANCE_LOCKED_MSG,
  attendanceLocked,
  interestSwitch,
  addClanAdminsAsOrgas,
} from "@/lib/lans";
import { parseSeatLabel } from "@/lib/seat-layout";
import { rowLetter } from "@/lib/seat-labels";
import { announceLan, postReminderNow, refreshLanMessagesSoon, unlinkChannel } from "@/lib/discord";
import { sendReminderNow } from "@/lib/reminders";
import { publishEvent } from "@/lib/event-notices";
import { notify as notifyMember, notifyLanChanged, notifyLater, notifySeatChanged, trySendDiscordDm } from "@/lib/notify";
import { appUrl } from "@/lib/mail";
import { planSeats } from "@/lib/seating";
import { eventMailVars, renderTemplate } from "@/lib/mail-templates";
import { canViewLan, requireAdmin, requireClanPermission, requireLanManager, requireUser } from "@/lib/session";
import { isClanMember } from "@/lib/clans";
import { lanAccountScope, saveLanAccount } from "@/lib/lan-accounts";
import { validProfileUrl } from "@/lib/profile-link";
import { cleanSocials } from "@/lib/socials";
import { clearSeatBooked } from "@/lib/seat-booking";
import { PROFILE_COLORS, PROFILE_ICONS, deleteUserAvatarFile, saveUserAvatar } from "@/lib/avatars";
import { audit, auditLan, changedFields } from "@/lib/audit";
import { cleanName } from "@/lib/names";
import { saveNick, saveSeatWishes, saveTicketBought, type wishInput } from "@/lib/member-updates";
import { getLocale, localeOf, makeT } from "@/i18n/server";

const { attendance, seat, lan, user, lanOrga, lanType } = schema;

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
  const mine = db.select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, me.id))).get();
  if (attendanceLocked(mine)) throw new Error(ATTENDANCE_LOCKED_MSG);
  await setAttendance(l, me.id, status);
  lanPath(lanId);
}

/** Sets the user's one nick for a scope (default, LAN type or single event). Empty removes it. */
export async function setNick(formData: FormData) {
  const me = await requireUser();
  saveNick(me.id, String(formData.get("nick") ?? ""), {
    lanId: (formData.get("lanId") as string | null) ?? null,
    typeId: (formData.get("typeId") as string | null) ?? null,
  });
  revalidatePath("/", "layout");
}

/**
 * The member's own participant number/ID at a LAN (lal.gg user ID, ticket
 * number, ...). Stored for the LAN type (or a single untyped event). Empty clears it.
 */
export async function setMyLanId(formData: FormData) {
  const me = await requireUser();
  const typeId = String(formData.get("typeId") ?? "");
  const lanId = String(formData.get("lanId") ?? "");
  if (typeId) {
    const t = db.select().from(lanType).where(eq(lanType.id, typeId)).get();
    if (!t || (t.clanId && !isClanMember(me.id, t.clanId) && me.role !== "admin")) throw new Error("Not found");
    saveLanAccount(me.id, { lanId: null, typeId }, String(formData.get("lanAccount") ?? ""));
  } else {
    const l = mustGetLan(lanId);
    if (!canViewLan(me, lanId)) throw new Error("Not found");
    saveLanAccount(me.id, lanAccountScope(l), String(formData.get("lanAccount") ?? ""));
  }
  revalidatePath("/", "layout");
}

const personName = z.string().transform(cleanName).pipe(z.string().min(1).max(40));

/** First name, surname and the user's own nickname (gamer tag, independent of events). */
export async function updateProfile(formData: FormData) {
  const me = await requireUser({ allowIncomplete: true });
  const firstName = personName.parse(formData.get("firstName"));
  const lastName = personName.parse(formData.get("lastName"));
  const emailReminders = formData.get("emailReminders") === "on";
  // Only the profile form has the DM checkbox; other forms leave the setting alone.
  const discordDms = formData.has("discordDmsShown") ? formData.get("discordDms") === "on" : undefined;
  db.update(user)
    .set({ firstName, lastName, name: `${firstName} ${lastName}`, emailReminders, ...(discordDms !== undefined && { discordDms }) })
    .where(eq(user.id, me.id))
    .run();
  if (formData.has("nick")) saveNick(me.id, String(formData.get("nick")));
  revalidatePath("/", "layout");
}

/** Gaming and social handles on the member's profile. Empty fields are dropped. */
export async function updateSocials(_: AppearanceState, formData: FormData): Promise<AppearanceState> {
  const me = await requireUser();
  db.update(user)
    .set({ socials: cleanSocials(Object.fromEntries(formData.entries())) })
    .where(eq(user.id, me.id))
    .run();
  revalidatePath("/", "layout");
  return { ok: true };
}

export type AppearanceState = { error?: string; ok?: boolean };

/** Avatar style, uploaded picture, icon and personal colour. */
export async function updateAppearance(_: AppearanceState, formData: FormData): Promise<AppearanceState> {
  const me = await requireUser();
  const style = z.enum(["picture", "icon", "initials"]).catch("picture").parse(formData.get("avatarStyle"));
  const colorRaw = String(formData.get("color") ?? "");
  const color = PROFILE_COLORS.some((c) => c.id === colorRaw) ? colorRaw : null;
  const iconRaw = String(formData.get("icon") ?? "");
  const icon = (PROFILE_ICONS as readonly string[]).includes(iconRaw) ? iconRaw : null;
  const current = db.select({ avatarFile: user.avatarFile }).from(user).where(eq(user.id, me.id)).get();
  let avatarFile = current?.avatarFile ?? null;
  const file = formData.get("picture");
  try {
    if (file instanceof File && file.size > 0) {
      const saved = await saveUserAvatar(me.id, file);
      deleteUserAvatarFile(avatarFile);
      avatarFile = saved;
    } else if (formData.get("removePicture") === "on") {
      deleteUserAvatarFile(avatarFile);
      avatarFile = null;
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
  if (style === "icon" && !icon) return { error: "Pick an icon first." };
  db.update(user).set({ avatarStyle: style, color, icon, avatarFile }).where(eq(user.id, me.id)).run();
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Sends the member a test DM and shows on the profile whether it arrived, or why not. */
export async function sendTestDm() {
  const me = await requireUser();
  const r = await trySendDiscordDm(me, (t) => ({
    kind: "test",
    subject: t("notice.testDm"),
    text: t("notice.testDmText"),
    url: `${appUrl}/profile`,
    dmOnly: true,
  }));
  redirect(`/profile?dm=${r.ok ? "ok" : r.problem}#dms`);
}

/** First-login form: saves the names and nickname, then continues to the app. */
export async function completeProfile(formData: FormData) {
  await updateProfile(formData);
  // Keep the language they signed up in, so mails and DMs match it too.
  const me = await requireUser({ allowIncomplete: true });
  if (!me.locale) db.update(user).set({ locale: await getLocale() }).where(eq(user.id, me.id)).run();
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

/** Profile link pattern: empty, or an http(s) URL with {id} in it. */
const profileUrlInput = z
  .string()
  .trim()
  .max(500)
  .default("")
  .refine((v) => !v || validProfileUrl(v), "use a full https:// link with {id} where the LAN ID goes");

const lanInput = z.object({
  typeId: optId,
  name: z.string().trim().min(1).max(100),
  description: z.string().max(5000).default(""),
  location: z.string().max(200).default(""),
  websiteUrl: z.union([z.literal(""), z.url().max(500)]).default(""),
  ticketUrl: z.union([z.literal(""), z.url().max(500)]).default(""),
  externalPlanUrl: z.union([z.literal(""), z.url().max(500)]).default(""),
  profileUrl: profileUrlInput,
  startsAt: optDate,
  endsAt: optDate,
  interestCheck: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  dateTbd: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  dateHint: z.string().trim().max(60).default(""),
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

export type FormState = { error?: string; ok?: boolean; message?: string } | undefined;

/** Event fields named in the audit log when a lead edits them. */
const LAN_FIELD_LABELS: Partial<Record<keyof typeof lan.$inferSelect, string>> = {
  name: "name",
  typeId: "LAN type",
  description: "description",
  location: "location",
  websiteUrl: "website",
  ticketUrl: "ticket link",
  externalPlanUrl: "seat plan link",
  profileUrl: "profile link",
  startsAt: "dates",
  endsAt: "dates",
  dateTbd: "dates",
  dateHint: "dates",
  signupDeadline: "answer deadline",
  paymentDueDate: "ticket deadline",
  price: "price",
  capacity: "spots",
  reminderDays: "reminder days",
};

export async function saveLan(_: FormState, formData: FormData): Promise<FormState> {
  const id = (formData.get("id") as string) || null;
  const clanId = id ? mustGetLan(id).clanId : String(formData.get("clanId") ?? "");
  if (!clanId) return { error: "Pick a clan." };
  const me = id ? await requireLanManager(id) : await requireClanPermission(clanId, "events");
  const parsed = lanInput.safeParse(
    Object.fromEntries([...formData.entries()].filter(([k]) => k !== "id" && k !== "clanId")),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") };
  }
  const { startsAt, endsAt, interestCheck, dateTbd: tbd, ...rest } = parsed.data;
  // On edit the switch follows interestSwitch(): free for drafts and unanswered events, else kept as is.
  const current = id ? mustGetLan(id) : null;
  const inInterest = current && interestSwitch(current) !== "free" ? current.interestCheck : interestCheck;
  const dateTbd = inInterest && tbd;
  let dates: { startsAt: Date; endsAt: Date };
  if (dateTbd) {
    // Placeholder dates (for sorting and "upcoming"); the page shows the hint instead.
    const keep = id ? mustGetLan(id) : null;
    const s = keep && !keep.dateTbd ? keep.startsAt : new Date(Date.now() + 365 * 24 * 3600 * 1000);
    dates = { startsAt: s, endsAt: keep && !keep.dateTbd ? keep.endsAt : new Date(s.getTime() + 2 * 24 * 3600 * 1000) };
  } else {
    if (!startsAt || !endsAt) return { error: "Set when the event starts and ends." };
    if (endsAt <= startsAt) return { error: "The end must be after the start." };
    dates = { startsAt, endsAt };
  }
  const v = { ...rest, ...dates, dateTbd, interestCheck: inInterest };
  if (v.typeId) {
    const t = db.select().from(lanType).where(eq(lanType.id, v.typeId)).get();
    if (t?.clanId !== clanId) return { error: "That LAN type belongs to another clan." };
  }

  let lanId = id;
  if (id) {
    const before = mustGetLan(id);
    db.update(lan).set(v).where(eq(lan.id, id)).run();
    const after = mustGetLan(id);
    const fields = changedFields(before, after, LAN_FIELD_LABELS);
    if (fields.length) auditLan(after, me.id, "event.update", { data: { fields } });
    notifyLater(() => notifyLanChanged(before, after));
    if ((v.capacity ?? Infinity) > (before.capacity ?? Infinity) || v.capacity === null) {
      await promoteFromWaitlist(mustGetLan(id));
    }
  } else {
    const row = db.insert(lan).values({ ...v, clanId }).returning().get();
    lanId = row.id;
    db.insert(lanOrga).values({ lanId: row.id, userId: me.id }).run();
    addClanAdminsAsOrgas(row.id, clanId);
    auditLan(row, me.id, "event.create");
    const t = v.typeId ? db.select().from(lanType).where(eq(lanType.id, v.typeId)).get() : undefined;
    if (t?.seatSpec) applySeatSpec(row.id, t.seatSpec);
  }
  lanPath(lanId!);
  // New LANs start as drafts (no Discord post until published); edits update the existing posts.
  if (id) refreshLanMessagesSoon(id);
  redirect(`/lans/${lanId}/manage`);
}

/**
 * Publishes a draft: clan members can now see it and answer, the Discord channels get the announcement,
 * and reminders start running.
 */
export async function publishLan(lanId: string) {
  const me = await requireLanManager(lanId);
  await publishEvent(lanId, new Date(), me.id);
  lanPath(lanId);
  revalidatePath("/clans", "layout");
}

/** Drafts don't send anything, so manual reminder buttons need a published event. */
function requirePublished(l: { publishedAt: Date | null }) {
  if (!l.publishedAt) throw new Error("Publish the event first. Drafts don't send anything.");
}

export async function deleteLan(id: string) {
  const l = mustGetLan(id);
  const me = l.clanId ? await requireClanPermission(l.clanId, "events") : await requireAdmin();
  db.delete(lan).where(eq(lan.id, id)).run();
  audit({ actorId: me.id, action: "event.delete", clanId: l.clanId, data: { event: l.name } });
  revalidatePath("/");
  redirect("/");
}

export async function toggleSeatCell(lanId: string, row: number, col: number) {
  await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  // One cell past the end of a row adds the next number.
  if (row < 0 || col < 0 || row >= l.seatRows || col > Math.max(l.seatCols, 999)) return;
  const s = db
    .select()
    .from(seat)
    .where(and(eq(seat.lanId, lanId), eq(seat.row, row), eq(seat.col, col)))
    .get();
  if (s) db.delete(seat).where(eq(seat.id, s.id)).run();
  else {
    db.insert(seat).values({ lanId, row, col, label: `${rowLetterIn(lanId, row)}${col + 1}` }).run();
    if (col >= l.seatCols) db.update(lan).set({ seatCols: col + 1 }).where(eq(lan.id, lanId)).run();
  }
  lanPath(lanId);
}

/** The letter of a row in a LAN's seat block (rows are one letter each). */
function rowLetterIn(lanId: string, row: number) {
  const any = db.select().from(seat).where(and(eq(seat.lanId, lanId), eq(seat.row, row))).get();
  return (any && parseSeatLabel(any.label)?.letter) ?? rowLetter(row);
}

export async function renameSeat(seatId: string, label: string): Promise<{ error?: string } | void> {
  const s = db.select().from(seat).where(eq(seat.id, seatId)).get();
  if (!s) return;
  await requireLanManager(s.lanId);
  const p = parseSeatLabel(label);
  if (!p) return { error: "Use a row letter and a number, e.g. F12." };
  const clean = `${p.letter}${p.num}`;
  // Each letter is one row: join the row that already has this letter, keep a row of its own, or start a new one.
  const others = db.select().from(seat).where(eq(seat.lanId, s.lanId)).all().filter((x) => x.id !== s.id);
  const sameLetter = others.find((x) => parseSeatLabel(x.label)?.letter === p.letter);
  const alone = !others.some((x) => x.row === s.row);
  const row = sameLetter ? sameLetter.row : alone ? s.row : Math.max(-1, ...others.map((x) => x.row)) + 1;
  const col = p.num - 1;
  if (others.some((x) => x.row === row && x.col === col)) return { error: `${clean} already exists. Each seat number can only be there once.` };
  db.update(seat).set({ label: clean, row, col }).where(eq(seat.id, seatId)).run();
  const l = mustGetLan(s.lanId);
  if (row >= l.seatRows || col >= l.seatCols)
    db.update(lan)
      .set({ seatRows: Math.max(l.seatRows, row + 1), seatCols: Math.max(l.seatCols, col + 1) })
      .where(eq(lan.id, s.lanId))
      .run();
  lanPath(s.lanId);
}

export async function toggleSeatLock(seatId: string) {
  const s = db.select().from(seat).where(eq(seat.id, seatId)).get();
  if (!s) return;
  const me = await requireLanManager(s.lanId);
  db.update(seat).set({ locked: !s.locked }).where(eq(seat.id, seatId)).run();
  auditLan(mustGetLan(s.lanId), me.id, "seat.lock", { data: { seat: s.label, locked: !s.locked } });
  lanPath(s.lanId);
}

export async function adminAssignSeat(seatId: string, userId: string | null) {
  const s = db.select().from(seat).where(eq(seat.id, seatId)).get();
  if (!s) return;
  const me = await requireLanManager(s.lanId);
  if (s.userId !== userId) {
    clearSeatBooked(s.lanId, [s.userId, userId]);
    const l = mustGetLan(s.lanId);
    if (s.userId) auditLan(l, me.id, "seat.assign", { targetUserId: s.userId, data: { from: s.label, to: null } });
    if (userId) {
      const prev = db.select().from(seat).where(and(eq(seat.lanId, s.lanId), eq(seat.userId, userId))).get();
      auditLan(l, me.id, "seat.assign", { targetUserId: userId, data: { from: prev?.label ?? null, to: s.label } });
    }
  }
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
  const me = await requireLanManager(lanId);
  const cid = mustGetLan(lanId).clanId;
  if (cid && !isClanMember(userId, cid)) throw new Error("Not a member of this clan");
  if (!ATTENDANCE_STATUSES.includes(status)) throw new Error("Bad status");
  const before = db.select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId))).get();
  const l = mustGetLan(lanId);
  // Moving someone up from the waitlist tells them, like an automatic move would.
  if (before?.status === "waitlist" && status === "going") await moveUp(l, userId);
  // Admins can override capacity.
  else await setAttendance(l, userId, status, { force: true });
  if (before?.status !== status)
    auditLan(l, me.id, "attendance.set", { targetUserId: userId, data: { from: before?.status ?? null, to: status } });
  lanPath(lanId);
}

/** Lead moves one person from the waitlist to coming (also over the limit) and tells them. */
export async function adminMoveUp(lanId: string, userId: string) {
  const me = await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  await moveUp(l, userId);
  auditLan(l, me.id, "waitlist.move_up", { targetUserId: userId });
  refreshLanMessagesSoon(lanId);
  lanPath(lanId);
}

/** Lead moves someone one place up (-1) or down (+1) on the waitlist. */
export async function adminReorderWaitlist(lanId: string, userId: string, dir: -1 | 1) {
  const me = await requireLanManager(lanId);
  if (dir !== -1 && dir !== 1) throw new Error("Bad direction");
  if (reorderWaitlist(lanId, userId, dir)) {
    auditLan(mustGetLan(lanId), me.id, "waitlist.reorder", { targetUserId: userId, data: { dir: dir < 0 ? "up" : "down" } });
    refreshLanMessagesSoon(lanId);
  }
  lanPath(lanId);
}

/** Whether a free spot goes to the next in line by itself, or the leads pick. Turning it on fills free spots now. */
export async function setWaitlistAuto(lanId: string, on: boolean) {
  const me = await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  if (l.waitlistAuto === on) return;
  db.update(lan).set({ waitlistAuto: on }).where(eq(lan.id, lanId)).run();
  auditLan(l, me.id, "waitlist.auto", { data: { on } });
  if (on) await promoteFromWaitlist(mustGetLan(lanId));
  refreshLanMessagesSoon(lanId);
  lanPath(lanId);
}

export async function adminRemoveAttendance(lanId: string, userId: string) {
  const me = await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  const before = db.select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId))).get();
  if (before) auditLan(l, me.id, "attendance.remove", { targetUserId: userId, data: { from: before.status } });
  await setAttendance(l, userId, "declined", { force: true });
  db.delete(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId)))
    .run();
  lanPath(lanId);
}

export async function adminSetPaid(attendanceId: string, paid: boolean) {
  const a = db.select().from(attendance).where(eq(attendance.id, attendanceId)).get();
  if (!a) return;
  const me = await requireLanManager(a.lanId);
  db.update(attendance).set({ paid }).where(eq(attendance.id, attendanceId)).run();
  if (a.paid !== paid) auditLan(mustGetLan(a.lanId), me.id, "ticket.confirm", { targetUserId: a.userId, data: { paid } });
  refreshLanMessagesSoon(a.lanId);
  lanPath(a.lanId);
}

export async function adminSetNote(attendanceId: string, note: string) {
  const a = db.select().from(attendance).where(eq(attendance.id, attendanceId)).get();
  if (!a) return;
  const me = await requireLanManager(a.lanId);
  db.update(attendance).set({ note: note.slice(0, 500) }).where(eq(attendance.id, attendanceId)).run();
  if (a.note !== note.slice(0, 500)) auditLan(mustGetLan(a.lanId), me.id, "attendance.note", { targetUserId: a.userId });
  lanPath(a.lanId);
}

/** Leads fill in or fix someone's participant ID (e.g. for guests). Same scope as the member's own. */
export async function adminSetLanId(lanId: string, userId: string, value: string) {
  const me = await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  const a = db.select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId))).get();
  if (!a) throw new Error("Not on this LAN");
  saveLanAccount(userId, lanAccountScope(l), value);
  if (userId !== me.id) auditLan(l, me.id, "lanid.set", { targetUserId: userId });
  lanPath(lanId);
}

export async function adminSendReminder(
  lanId: string,
  kind: "signup" | "payment" | "event",
): Promise<number> {
  await requireLanManager(lanId);
  requirePublished(mustGetLan(lanId));
  return sendReminderNow(mustGetLan(lanId), kind);
}

export async function postLanToDiscord(lanId: string): Promise<number> {
  await requireLanManager(lanId);
  return announceLan(lanId);
}

export async function unlinkDiscordChannel(channelId: string) {
  const me = await requireUser();
  const ch = db.select().from(schema.discordChannel).where(eq(schema.discordChannel.channelId, channelId)).get();
  if (!unlinkChannel(me, channelId)) throw new Error("Not allowed");
  if (ch) audit({ actorId: me.id, action: "discord.unlink", clanId: ch.clanId, data: { channel: ch.channelName || ch.channelId } });
  revalidatePath("/clans", "layout");
}

export async function postDiscordReminder(lanId: string, kind: "signup" | "payment" | "event"): Promise<number> {
  await requireLanManager(lanId);
  requirePublished(mustGetLan(lanId));
  return postReminderNow(mustGetLan(lanId), kind);
}

export async function setUserRole(userId: string, role: "admin" | "member") {
  const me = await requireAdmin();
  if (userId === me.id && role !== "admin") throw new Error("You can't demote yourself");
  db.update(user).set({ role }).where(eq(user.id, userId)).run();
  audit({ actorId: me.id, action: "platform.role", targetUserId: userId, data: { to: role } });
  revalidatePath("/admin");
}

export async function setMyTicketBought(lanId: string, bought: boolean) {
  const me = await requireUser();
  saveTicketBought(lanId, me.id, bought);
  refreshLanMessagesSoon(lanId);
  lanPath(lanId);
}

export async function addOrga(lanId: string, userId: string) {
  const me = await requireLanManager(lanId);
  const cid = mustGetLan(lanId).clanId;
  if (cid && !isClanMember(userId, cid)) throw new Error("Not a member of this clan");
  const r = db.insert(lanOrga).values({ lanId, userId }).onConflictDoNothing().run();
  if (r.changes) auditLan(mustGetLan(lanId), me.id, "orga.add", { targetUserId: userId });
  lanPath(lanId);
}

export async function removeOrga(lanId: string, userId: string) {
  const me = await requireLanManager(lanId);
  const r = db.delete(lanOrga)
    .where(and(eq(lanOrga.lanId, lanId), eq(lanOrga.userId, userId)))
    .run();
  if (r.changes) auditLan(mustGetLan(lanId), me.id, "orga.remove", { targetUserId: userId });
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
      if (!have.has(c)) add.push({ lanId, row, col: c, label: `${rowLetterIn(lanId, row)}${c + 1}` });
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
    if (!prefix) throw new Error(`"${raw}" needs its row letter, e.g. F1-F20.`);
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
    // Each seat sits at its number, so gaps in the numbering (F1-F20, F25-F30) stay visible.
    const values = rows.flatMap((labels, r) =>
      labels.map((label) => {
        const prev = old.get(label);
        const c = (parseSeatLabel(label)?.num ?? 1) - 1;
        return { lanId, row: r, col: c, label, userId: prev?.userId ?? null, locked: prev?.locked ?? false };
      }),
    );
    tx.insert(seat).values(values).run();
    tx.update(lan)
      .set({ seatRows: rows.length, seatCols: Math.max(...values.map((v) => v.col + 1)) })
      .where(eq(lan.id, lanId))
      .run();
  });
  return { count: total };
}

export async function setSeatsFromList(lanId: string, spec: string): Promise<{ error?: string; count?: number }> {
  const me = await requireLanManager(lanId);
  const r = applySeatSpec(lanId, spec);
  if (!r.error) {
    auditLan(mustGetLan(lanId), me.id, "seat.layout", { data: { spec: spec.trim().slice(0, 200), count: r.count } });
    lanPath(lanId);
  }
  return r;
}

/** Swaps the people on two seats of the same LAN (either may be empty, which moves one person). */
export async function adminSwapSeats(seatA: string, seatB: string) {
  const a = db.select().from(seat).where(eq(seat.id, seatA)).get();
  const b = db.select().from(seat).where(eq(seat.id, seatB)).get();
  if (!a || !b || a.id === b.id || a.lanId !== b.lanId) return;
  const me = await requireLanManager(a.lanId);
  clearSeatBooked(a.lanId, [a.userId, b.userId]);
  const first = a.userId ? a : b;
  const second = first === a ? b : a;
  if (first.userId)
    auditLan(mustGetLan(a.lanId), me.id, "seat.swap", {
      targetUserId: first.userId,
      data: { a: first.label, b: second.label, otherUserId: second.userId },
    });
  // (lan, user) is unique, so empty both seats first, then fill them crosswise.
  db.transaction((tx) => {
    tx.update(seat).set({ userId: null }).where(inArray(seat.id, [a.id, b.id])).run();
    tx.update(seat).set({ userId: b.userId }).where(eq(seat.id, a.id)).run();
    tx.update(seat).set({ userId: a.userId }).where(eq(seat.id, b.id)).run();
  });
  lanPath(a.lanId);
  const l = mustGetLan(a.lanId);
  if (a.userId) notifyLater(() => notifySeatChanged(l, a.userId!, b.label));
  if (b.userId) notifyLater(() => notifySeatChanged(l, b.userId!, a.label));
}

/** Turns the optional self-pick step on or off (members choose their own free seat). Only before the plan is final. */
export async function setSeatPicking(lanId: string, open: boolean) {
  const me = await requireLanManager(lanId);
  if (open && mustGetLan(lanId).seatsPublishedAt) throw new Error("The seat plan is final. Reopen it first.");
  db.update(lan).set({ seatPicking: open }).where(eq(lan.id, lanId)).run();
  auditLan(mustGetLan(lanId), me.id, "seat.picking", { data: { open } });
  lanPath(lanId);
}

/**
 * A member takes a free seat (or gives theirs up with seatId null) while seat
 * self pick is on and the plan isn't final. Held seats can't be picked.
 * Leads can still move anyone afterwards.
 */
export async function pickMySeat(lanId: string, seatId: string | null): Promise<{ error?: string }> {
  await requireUser(); // outside the try: a sign-in redirect must not be caught
  try {
    await pickMySeatOrThrow(lanId, seatId);
    return {};
  } catch (e) {
    // Production builds hide thrown messages from the client, so hand them back.
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

async function pickMySeatOrThrow(lanId: string, seatId: string | null) {
  const me = await requireUser();
  const l = mustGetLan(lanId);
  if (!l.seatPicking || l.seatsPublishedAt) throw new Error(l.seatsPublishedAt ? "The leads finalized the seat plan. Ask them to move you." : "Seat picking is closed. Ask a lead.");
  const a = db.select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, me.id))).get();
  if (a?.status !== "going") throw new Error("Say you're coming first.");
  if (seatId && !a.ticketBought && !a.paid) throw new Error("Confirm you have your ticket first.");
  db.transaction((tx) => {
    if (seatId) {
      const s = tx.select().from(seat).where(and(eq(seat.id, seatId), eq(seat.lanId, lanId))).get();
      if (!s) throw new Error("That seat doesn't exist.");
      if (s.locked) throw new Error(`${s.label} is held by the leads.`);
      if (s.userId && s.userId !== me.id) throw new Error(`${s.label} was just taken. Pick another one.`);
    }
    tx.update(seat).set({ userId: null }).where(and(eq(seat.lanId, lanId), eq(seat.userId, me.id))).run();
    if (seatId) tx.update(seat).set({ userId: me.id }).where(eq(seat.id, seatId)).run();
  });
  clearSeatBooked(lanId, [me.id]);
  lanPath(lanId);
}

/** Assigns a seat to an attendee from the attendee list (seatId null = no seat). */
export async function adminSetSeatFor(lanId: string, userId: string, seatId: string | null) {
  const me = await requireLanManager(lanId);
  const before = db.select().from(seat).where(and(eq(seat.lanId, lanId), eq(seat.userId, userId))).get();
  const target = seatId ? db.select().from(seat).where(eq(seat.id, seatId)).get() : undefined;
  if ((before?.id ?? null) !== seatId) {
    clearSeatBooked(lanId, [userId, target?.userId]);
    const l = mustGetLan(lanId);
    auditLan(l, me.id, "seat.assign", { targetUserId: userId, data: { from: before?.label ?? null, to: target?.label ?? null } });
    if (target?.userId && target.userId !== userId)
      auditLan(l, me.id, "seat.assign", { targetUserId: target.userId, data: { from: target.label, to: null } });
  }
  db.transaction((tx) => {
    tx.update(seat)
      .set({ userId: null })
      .where(and(eq(seat.lanId, lanId), eq(seat.userId, userId)))
      .run();
    if (seatId) tx.update(seat).set({ userId }).where(and(eq(seat.id, seatId), eq(seat.lanId, lanId))).run();
  });
  lanPath(lanId);
  const label = seatId ? db.select().from(seat).where(eq(seat.id, seatId)).get()?.label ?? null : null;
  notifyLater(() => notifySeatChanged(mustGetLan(lanId), userId, label));
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
  const me = await requireLanManager(lanId);
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
  // Replanning can move anyone; filling only seats people who had none.
  clearSeatBooked(lanId, mode === "replan" ? everyone.map((p) => p.userId) : [...plan.keys()]);
  lanPath(lanId);
  // After the plan is out, tell people whose seat changed.
  const l = mustGetLan(lanId);
  auditLan(l, me.id, "seat.auto", { data: { mode, count: plan.size } });
  if (l.seatsPublishedAt) {
    const label = new Map(seats.map((s) => [s.id, s.label]));
    notifyLater(async () => {
      for (const [userId, seatId] of plan) await notifySeatChanged(l, userId, label.get(seatId) ?? null);
    });
  }
  return plan.size;
}

export async function setMySeatWishes(lanId: string, input: z.input<typeof wishInput>) {
  const me = await requireUser();
  const l = mustGetLan(lanId);
  if (l.seatsPublishedAt) throw new Error("The seat plan is final. Ask a lead.");
  saveSeatWishes(lanId, me.id, input);
  lanPath(lanId);
}

/**
 * The leads' last step: finalizes the seat plan (stored as seatsPublishedAt).
 * Closes self pick and seat wishes, shows everyone the plan and optionally
 * tells everyone coming their seat. Also the last step when members picked their own seats.
 */
export async function publishSeats(lanId: string, notify: boolean): Promise<number> {
  const me = await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  // seatPicking stays set: it records that the event used self pick (the member checklist keeps that step).
  // Picking itself is closed by seatsPublishedAt.
  db.update(lan).set({ seatsPublishedAt: new Date() }).where(eq(lan.id, lanId)).run();
  let sent = 0;
  // Drafts tell nobody; members see the seats once the event is published.
  if (notify && l.publishedAt) {
    const rows = db
      .select({ a: attendance, u: user })
      .from(attendance)
      .innerJoin(user, eq(user.id, attendance.userId))
      .where(and(eq(attendance.lanId, lanId), eq(attendance.status, "going")))
      .all();
    const seats = db.select().from(seat).where(eq(seat.lanId, lanId)).all();
    for (const { u } of rows) {
      const mine = seats.find((s) => s.userId === u.id);
      const ut = makeT(localeOf(u));
      try {
        const r = await notifyMember(u, {
          kind: "seatsPublished",
          ...renderTemplate(
            "seatsPublished",
            {
              ...eventMailVars(l, u, ut.locale),
              seat: mine?.label,
              seatInfo: mine
                ? ut(l.externalPlanUrl ? "mail.seatInfoBook" : "mail.seatInfo", { seat: mine.label })
                : ut("mail.seatInfoNone"),
            },
            ut.locale,
          ),
          url: `${appUrl}/lans/${l.id}`,
        });
        if (r.email || r.dm) sent++;
      } catch (e) {
        console.error("[mail] failed", e);
      }
    }
  }
  auditLan(l, me.id, "seats.finalize", { data: { notified: sent || undefined } });
  lanPath(lanId);
  return sent;
}

/** Reopens a finalized plan (members can send wishes again; self pick stays off until a lead turns it on). */
export async function unpublishSeats(lanId: string) {
  const me = await requireLanManager(lanId);
  db.update(lan).set({ seatsPublishedAt: null, seatPicking: false }).where(eq(lan.id, lanId)).run();
  auditLan(mustGetLan(lanId), me.id, "seats.reopen");
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
  durationHours: z.coerce.number().int().min(1).max(24 * 14),
  answerDaysBefore: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(0).max(365).nullable()),
  discordMode: z.enum(DISCORD_MODES).default("channel"),
  profileUrl: profileUrlInput,
});

export async function saveLanType(_: FormState, formData: FormData): Promise<FormState> {
  const id = (formData.get("id") as string) || null;
  const existing = id ? db.select().from(lanType).where(eq(lanType.id, id)).get() : undefined;
  const clanId = existing?.clanId ?? String(formData.get("clanId") ?? "");
  if (!clanId) return { error: "Pick a clan." };
  const me = await requireClanPermission(clanId, "events");
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
  audit({ actorId: me.id, action: "type.save", clanId, data: { type: parsed.data.name, created: !id } });
  revalidatePath("/", "layout");
  redirect(`/clans/${clanSlug(clanId)}/settings?tab=types`);
}

export async function deleteLanType(id: string) {
  const t = db.select().from(lanType).where(eq(lanType.id, id)).get();
  if (!t?.clanId) return;
  const me = await requireClanPermission(t.clanId, "events");
  db.delete(lanType).where(eq(lanType.id, id)).run();
  audit({ actorId: me.id, action: "type.delete", clanId: t.clanId, data: { type: t.name } });
  revalidatePath("/", "layout");
  redirect(`/clans/${clanSlug(t.clanId)}/settings?tab=types`);
}

function clanSlug(clanId: string) {
  return db.select({ slug: schema.clan.slug }).from(schema.clan).where(eq(schema.clan.id, clanId)).get()?.slug ?? "";
}
