"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { canManageClan, clanRole, getClan, saveAvatar, uniqueSlug } from "@/lib/clans";
import { guestEmail } from "@/lib/guests";
import { appUrl } from "@/lib/mail";
import { notify, notifyClanAdmins, notifyLater } from "@/lib/notify";
import { requireClanManager, requireLanManager, requireUser } from "@/lib/session";
import { adminSetAttendance, type FormState } from "./actions";

const { clan, clanMember, clanInvite } = schema;

const clanInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).default(""),
  joinPolicy: z.enum(["approval", "open", "invite"]).default("approval"),
});

export async function createClan(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const parsed = clanInput.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    joinPolicy: formData.get("joinPolicy") ?? "approval",
  });
  if (!parsed.success) return { error: "Give the clan a name (at least 2 characters)." };
  const row = db
    .insert(clan)
    .values({ ...parsed.data, slug: uniqueSlug(parsed.data.name) })
    .returning()
    .get();
  db.insert(clanMember).values({ clanId: row.id, userId: me.id, role: "admin" }).run();
  revalidatePath("/", "layout");
  redirect(`/clans/${row.slug}`);
}

export async function updateClan(_: FormState, formData: FormData): Promise<FormState> {
  const clanId = String(formData.get("clanId"));
  await requireClanManager(clanId);
  const parsed = clanInput.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    joinPolicy: formData.get("joinPolicy") ?? "approval",
  });
  if (!parsed.success) return { error: "Give the clan a name (at least 2 characters)." };
  let avatar: string | undefined;
  const file = formData.get("avatar");
  if (file instanceof File && file.size > 0) {
    try {
      avatar = await saveAvatar(clanId, file);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  const slug = uniqueSlug(parsed.data.name, clanId);
  db.update(clan)
    .set({ ...parsed.data, slug, ...(avatar && { avatar }) })
    .where(eq(clan.id, clanId))
    .run();
  if (formData.get("removeAvatar") === "on") db.update(clan).set({ avatar: null }).where(eq(clan.id, clanId)).run();
  revalidatePath("/", "layout");
  redirect(`/clans/${slug}/settings`);
}

/** Joins an open clan directly, or asks to join an approval clan. */
export async function joinClan(clanId: string) {
  const me = await requireUser();
  const c = getClan(clanId);
  if (!c) throw new Error("Clan not found");
  if (c.joinPolicy === "invite" && me.role !== "admin") throw new Error("This clan is invite-only");
  const role = c.joinPolicy === "open" || me.role === "admin" ? "member" : "pending";
  db.insert(clanMember).values({ clanId, userId: me.id, role }).onConflictDoNothing().run();
  if (role === "pending") {
    notifyLater(() =>
      notifyClanAdmins(clanId, {
        kind: "clan_request",
        subject: `${me.name} wants to join ${c.name}`,
        text: `${me.name} asked to join ${c.name}. Approve or decline it in the clan's member list.`,
        url: `${appUrl}/clans/${c.slug}/settings?tab=members`,
      }),
    );
  }
  revalidatePath("/", "layout");
  redirect(`/clans/${c.slug}`);
}

export async function joinWithInvite(code: string) {
  const me = await requireUser();
  const inv = db.select().from(clanInvite).where(eq(clanInvite.code, code)).get();
  const c = inv && getClan(inv.clanId);
  if (!c) throw new Error("This invite link is no longer valid");
  db.insert(clanMember)
    .values({ clanId: c.id, userId: me.id, role: "member" })
    .onConflictDoUpdate({
      target: [clanMember.clanId, clanMember.userId],
      set: { role: sql`CASE WHEN ${clanMember.role} = 'pending' THEN 'member' ELSE ${clanMember.role} END` },
    })
    .run();
  revalidatePath("/", "layout");
  redirect(`/clans/${c.slug}`);
}

function adminCount(clanId: string) {
  return db
    .select()
    .from(clanMember)
    .where(and(eq(clanMember.clanId, clanId), eq(clanMember.role, "admin")))
    .all().length;
}

export async function leaveClan(clanId: string) {
  const me = await requireUser();
  if (clanRole(me.id, clanId) === "admin" && adminCount(clanId) <= 1) {
    throw new Error("You're the last admin. Make someone else admin first.");
  }
  db.delete(clanMember)
    .where(and(eq(clanMember.clanId, clanId), eq(clanMember.userId, me.id)))
    .run();
  revalidatePath("/", "layout");
  redirect("/clans");
}

/** Approve a join request (pending -> member) or change a member's role. */
export async function setClanMemberRole(clanId: string, userId: string, role: "admin" | "member") {
  await requireClanManager(clanId);
  if (role === "member" && clanRole(userId, clanId) === "admin" && adminCount(clanId) <= 1) {
    throw new Error("A clan needs at least one admin.");
  }
  const wasPending = clanRole(userId, clanId) === "pending";
  db.update(clanMember)
    .set({ role })
    .where(and(eq(clanMember.clanId, clanId), eq(clanMember.userId, userId)))
    .run();
  revalidatePath("/", "layout");
  const c = getClan(clanId);
  if (wasPending && c) {
    notifyLater(() =>
      notify(userId, {
        kind: "clan_approved",
        subject: `You're in: ${c.name}`,
        text: `Your request to join ${c.name} was approved. Their LANs now show up in Seatbit.`,
        url: `${appUrl}/clans/${c.slug}`,
        dmOnly: true,
      }),
    );
  }
}

export async function removeClanMember(clanId: string, userId: string) {
  await requireClanManager(clanId);
  if (clanRole(userId, clanId) === "admin" && adminCount(clanId) <= 1) {
    throw new Error("A clan needs at least one admin.");
  }
  db.delete(clanMember)
    .where(and(eq(clanMember.clanId, clanId), eq(clanMember.userId, userId)))
    .run();
  revalidatePath("/", "layout");
}

export async function createInvite(clanId: string) {
  const me = await requireClanManager(clanId);
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  db.insert(clanInvite).values({ code, clanId, createdBy: me.id }).run();
  revalidatePath("/", "layout");
}

export async function deleteInvite(code: string) {
  const me = await requireUser();
  const inv = db.select().from(clanInvite).where(eq(clanInvite.code, code)).get();
  if (!inv || !canManageClan(me, inv.clanId)) return;
  db.delete(clanInvite).where(eq(clanInvite.code, code)).run();
  revalidatePath("/", "layout");
}

export async function deleteClan(clanId: string) {
  await requireClanManager(clanId);
  db.delete(clan).where(eq(clan.id, clanId)).run();
  revalidatePath("/", "layout");
  redirect("/clans");
}

/** Admins add an existing Seatbit user directly. */
export async function addClanMember(clanId: string, userId: string) {
  await requireClanManager(clanId);
  db.insert(clanMember)
    .values({ clanId, userId, role: "member" })
    .onConflictDoUpdate({
      target: [clanMember.clanId, clanMember.userId],
      set: { role: sql`CASE WHEN ${clanMember.role} = 'pending' THEN 'member' ELSE ${clanMember.role} END` },
    })
    .run();
  revalidatePath("/", "layout");
}

// ---------------- Guests ----------------

const guestInput = z.object({
  firstName: z.string().trim().min(1).max(40),
  lastName: z.string().trim().max(40).default(""),
  nick: z.string().trim().max(32).default(""),
});

const newClaimCode = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

/** Creates a guest member of a clan from the form. Returns the guest's id, or an error. */
function createGuest(clanId: string, formData: FormData): { id: string } | { error: string } {
  const parsed = guestInput.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName") ?? "",
    nick: formData.get("nick") ?? "",
  });
  if (!parsed.success) return { error: "Give the guest at least a first name." };
  const { firstName, lastName, nick } = parsed.data;
  const id = crypto.randomUUID();
  db.transaction((tx) => {
    tx.insert(schema.user)
      .values({
        id,
        name: `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        email: guestEmail(id),
        emailReminders: false,
        isGuest: true,
        guestClanId: clanId,
        claimCode: newClaimCode(),
      })
      .run();
    tx.insert(clanMember).values({ clanId, userId: id, role: "member" }).run();
    if (nick) tx.insert(schema.nickname).values({ userId: id, nick, isPrimary: true }).run();
  });
  return { id };
}

/** Adds a member without a login, so orgas can sign them up and seat them. */
export async function addGuest(clanId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireClanManager(clanId);
  const r = createGuest(clanId, formData);
  if ("error" in r) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}

/** From an event's Attendees tab: adds a guest to the event's clan and signs them up as coming. */
export async function addGuestToLan(lanId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireLanManager(lanId);
  const l = db.select({ clanId: schema.lan.clanId }).from(schema.lan).where(eq(schema.lan.id, lanId)).get();
  if (!l?.clanId) return { error: "This event has no clan." };
  const r = createGuest(l.clanId, formData);
  if ("error" in r) return r;
  await adminSetAttendance(lanId, r.id, "going");
  revalidatePath("/", "layout");
  return { ok: true };
}

function requireGuestOf(clanId: string, userId: string) {
  const g = db.select().from(schema.user).where(eq(schema.user.id, userId)).get();
  if (!g?.isGuest || g.guestClanId !== clanId) throw new Error("Not a guest of this clan");
  return g;
}

export async function deleteGuest(clanId: string, userId: string) {
  await requireClanManager(clanId);
  requireGuestOf(clanId, userId);
  db.delete(schema.user).where(eq(schema.user.id, userId)).run();
  revalidatePath("/", "layout");
}

/** New claim link; the old one stops working. */
export async function renewGuestLink(clanId: string, userId: string) {
  await requireClanManager(clanId);
  requireGuestOf(clanId, userId);
  db.update(schema.user).set({ claimCode: newClaimCode() }).where(eq(schema.user.id, userId)).run();
  revalidatePath(`/clans`, "layout");
}

/**
 * The signed-in user takes over a guest: clan membership, attendance, seats,
 * nicks, orga roles, rides and gear move to the real account, then the guest is deleted.
 * Where both have something for the same LAN, the real account's stays.
 */
export async function claimGuest(code: string) {
  const me = await requireUser();
  const g = db.select().from(schema.user).where(eq(schema.user.claimCode, code)).get();
  if (!g?.isGuest) redirect("/");
  const { attendance, seat, nickname, lanOrga } = schema;
  db.transaction((tx) => {
    for (const m of tx.select().from(clanMember).where(eq(clanMember.userId, g.id)).all()) {
      const mine = tx.select().from(clanMember).where(and(eq(clanMember.clanId, m.clanId), eq(clanMember.userId, me.id))).get();
      if (!mine) tx.update(clanMember).set({ userId: me.id }).where(and(eq(clanMember.clanId, m.clanId), eq(clanMember.userId, g.id))).run();
      else if (mine.role === "pending")
        tx.update(clanMember).set({ role: m.role }).where(and(eq(clanMember.clanId, m.clanId), eq(clanMember.userId, me.id))).run();
    }
    for (const a of tx.select().from(attendance).where(eq(attendance.userId, g.id)).all()) {
      const mine = tx.select().from(attendance).where(and(eq(attendance.lanId, a.lanId), eq(attendance.userId, me.id))).get();
      if (!mine) tx.update(attendance).set({ userId: me.id }).where(eq(attendance.id, a.id)).run();
    }
    for (const s of tx.select().from(seat).where(eq(seat.userId, g.id)).all()) {
      const mine = tx.select().from(seat).where(and(eq(seat.lanId, s.lanId), eq(seat.userId, me.id))).get();
      if (!mine) tx.update(seat).set({ userId: me.id }).where(eq(seat.id, s.id)).run();
    }
    const myNicks = tx.select().from(nickname).where(eq(nickname.userId, me.id)).all();
    for (const n of tx.select().from(nickname).where(eq(nickname.userId, g.id)).all()) {
      if (!myNicks.some((x) => x.lanId === n.lanId && x.typeId === n.typeId))
        tx.update(nickname).set({ userId: me.id }).where(eq(nickname.id, n.id)).run();
    }
    for (const o of tx.select().from(lanOrga).where(eq(lanOrga.userId, g.id)).all()) {
      const mine = tx.select().from(lanOrga).where(and(eq(lanOrga.lanId, o.lanId), eq(lanOrga.userId, me.id))).get();
      if (!mine) tx.update(lanOrga).set({ userId: me.id }).where(and(eq(lanOrga.lanId, o.lanId), eq(lanOrga.userId, g.id))).run();
    }
    // Rides, sleeping spots and gear the orgas noted for the guest.
    tx.update(schema.travelPost).set({ userId: me.id }).where(eq(schema.travelPost.userId, g.id)).run();
    for (const sp of tx.select().from(schema.travelSpot).where(eq(schema.travelSpot.userId, g.id)).all()) {
      const post = tx.select().from(schema.travelPost).where(eq(schema.travelPost.id, sp.postId)).get();
      const mine = tx
        .select()
        .from(schema.travelSpot)
        .where(and(eq(schema.travelSpot.postId, sp.postId), eq(schema.travelSpot.userId, me.id)))
        .get();
      if (mine || post?.userId === me.id) tx.delete(schema.travelSpot).where(eq(schema.travelSpot.id, sp.id)).run();
      else tx.update(schema.travelSpot).set({ userId: me.id }).where(eq(schema.travelSpot.id, sp.id)).run();
    }
    tx.update(schema.gearPledge).set({ userId: me.id }).where(eq(schema.gearPledge.userId, g.id)).run();
    // Seat wishes of others that name the guest now name the real account.
    for (const col of ["wish_near", "wish_avoid"] as const)
      tx.run(sql`UPDATE attendance SET ${sql.raw(col)} = replace(${sql.raw(col)}, ${`"${g.id}"`}, ${`"${me.id}"`}) WHERE ${sql.raw(col)} LIKE ${`%"${g.id}"%`}`);
    tx.delete(schema.user).where(eq(schema.user.id, g.id)).run();
  });
  revalidatePath("/", "layout");
  const c = g.guestClanId ? getClan(g.guestClanId) : null;
  redirect(c ? `/clans/${c.slug}` : "/");
}
