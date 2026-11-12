"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { canManageClan, clanRole, getClan, saveAvatar, uniqueSlug } from "@/lib/clans";
import { guestEmail } from "@/lib/guests";
import { LAN_ID_MAX } from "@/lib/lan-accounts";
import { accountByEmail, mergeGuestInto, normEmail, sendGuestInvite } from "@/lib/guest-claim";
import { appUrl } from "@/lib/mail";
import { missingServers, setServerInvite } from "@/lib/discord-invite";
import { notify, notifyClanAdmins, notifyLater } from "@/lib/notify";
import { requireClanManager, requireLanManager, requireUser } from "@/lib/session";
import { adminSetAttendance, type FormState } from "./actions";
import { getDefaultNames } from "@/lib/lans";

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
    notifyLater(async () => {
      // They may not be on the clan's Discord yet, so this also goes by mail, with the invite.
      const invites = (await missingServers(userId, clanId)).map((sv) => sv.inviteUrl).filter(Boolean);
      await notify(userId, {
        kind: "clan_approved",
        subject: `You're in: ${c.name}`,
        text: `Your request to join ${c.name} was approved. Their LANs now show up in Seatbit.${
          invites.length ? `\n\nJoin the clan's Discord: ${invites.join(" ")}` : ""
        }\n\n${appUrl}/clans/${c.slug}`,
        url: `${appUrl}/clans/${c.slug}`,
      });
    });
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
  lastName: z.string().trim().min(1).max(40),
  nick: z.string().trim().max(32).default(""),
  email: z.union([z.literal(""), z.email().max(200)]).default(""),
});

const newClaimCode = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

type Created = { id: string; existing?: string } | { error: string };

/**
 * Creates a guest member of a clan from the form. When the email belongs to someone
 * who already has a Seatbit account, that account is added to the clan instead.
 */
function createGuest(clanId: string, formData: FormData): Created {
  const parsed = guestInput.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName") ?? "",
    nick: formData.get("nick") ?? "",
    email: formData.get("email") ?? "",
  });
  if (!parsed.success) {
    const bad = new Set(parsed.error.issues.map((i) => i.path[0]));
    return { error: bad.has("email") ? "That email address doesn't look right." : "Give the guest a first name and a surname." };
  }
  const { firstName, lastName, nick, email } = parsed.data;
  if (email) {
    const acc = accountByEmail(email);
    if (acc) {
      db.insert(clanMember)
        .values({ clanId, userId: acc.id, role: "member" })
        .onConflictDoUpdate({
          target: [clanMember.clanId, clanMember.userId],
          set: { role: sql`CASE WHEN ${clanMember.role} = 'pending' THEN 'member' ELSE ${clanMember.role} END` },
        })
        .run();
      return { id: acc.id, existing: acc.name };
    }
  }
  const id = crypto.randomUUID();
  db.transaction((tx) => {
    tx.insert(schema.user)
      .values({
        id,
        name: `${firstName} ${lastName}`,
        firstName,
        lastName,
        email: guestEmail(id),
        emailReminders: false,
        isGuest: true,
        guestClanId: clanId,
        claimCode: newClaimCode(),
        inviteEmail: email ? normEmail(email) : null,
      })
      .run();
    tx.insert(clanMember).values({ clanId, userId: id, role: "member" }).run();
    if (nick) tx.insert(schema.nickname).values({ userId: id, nick, isPrimary: true }).run();
  });
  return { id };
}

/** The orga as the invite mail names them: Mike "Reyki" Keller. */
const inviterName = (u: { id: string; name: string }) => getDefaultNames([u.id]).get(u.id)?.full ?? u.name;

/** What the orga sees after adding someone. */
function addedMessage(r: { id: string; existing?: string }, invited: boolean, what: string) {
  if (r.existing) return `${r.existing} already has a Seatbit account with that email, so we ${what} them instead of a guest.`;
  return invited ? "Guest added. The invite mail is on its way." : "Guest added.";
}

/** Adds a member without a login, so orgas can sign them up and seat them. */
export async function addGuest(clanId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireClanManager(clanId);
  const r = createGuest(clanId, formData);
  if ("error" in r) return r;
  const invited = !r.existing && (await sendGuestInvite(r.id, inviterName(me)).catch(() => false));
  revalidatePath("/", "layout");
  return { ok: true, message: addedMessage(r, invited, "added") };
}

/** From an event's Attendees tab: adds a guest to the event's clan and signs them up as coming. */
export async function addGuestToLan(lanId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireLanManager(lanId);
  const l = db.select({ clanId: schema.lan.clanId }).from(schema.lan).where(eq(schema.lan.id, lanId)).get();
  if (!l?.clanId) return { error: "This event has no clan." };
  const r = createGuest(l.clanId, formData);
  if ("error" in r) return r;
  await adminSetAttendance(lanId, r.id, "going");
  // After signing up, so the invite lists this event.
  const invited = !r.existing && (await sendGuestInvite(r.id, inviterName(me)).catch(() => false));
  revalidatePath("/", "layout");
  return { ok: true, message: addedMessage(r, invited, "signed up") };
}

/** Sets (or changes) a guest's email and sends them the invite. */
export async function setGuestEmail(clanId: string, userId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireClanManager(clanId);
  const g = requireGuestOf(clanId, userId);
  const parsed = z.email().max(200).safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { error: "That email address doesn't look right." };
  const acc = accountByEmail(parsed.data);
  if (acc) {
    // They're on Seatbit already: hand everything over right away.
    mergeGuestInto(g, acc.id);
    revalidatePath("/", "layout");
    return { ok: true, message: `${acc.name} already has an account with that email. Everything moved over to it.` };
  }
  db.update(schema.user).set({ inviteEmail: normEmail(parsed.data) }).where(eq(schema.user.id, userId)).run();
  const sent = await sendGuestInvite(userId, inviterName(me)).catch((e) => {
    console.error("[mail] guest invite failed", e);
    return false;
  });
  revalidatePath("/", "layout");
  return sent ? { ok: true, message: "Invite sent." } : { error: "Saved, but the mail couldn't be sent. Check the email settings." };
}

const guestEdit = z.object({
  firstName: z.string().trim().min(1).max(40),
  lastName: z.string().trim().min(1).max(40),
  nick: z.string().trim().max(32),
  email: z.union([z.literal(""), z.email().max(200)]),
});

/**
 * Clan admins edit a guest who hasn't claimed their spot yet: name, default nick, nick and LAN ID per LAN
 * type, and email. A new email sends the invite (or hands everything over if that address has an account).
 */
export async function updateGuest(clanId: string, userId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireClanManager(clanId);
  const g = requireGuestOf(clanId, userId);
  const parsed = guestEdit.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    nick: formData.get("nick") ?? "",
    email: String(formData.get("email") ?? "").trim(),
  });
  if (!parsed.success) {
    const bad = new Set(parsed.error.issues.map((i) => i.path[0]));
    if (bad.has("email")) return { error: "That email address doesn't look right." };
    if (bad.has("nick")) return { error: "Nicks can be up to 32 characters." };
    return { error: "A guest needs a first name and a surname." };
  }
  const { firstName, lastName, nick, email } = parsed.data;
  const types = db.select({ id: schema.lanType.id }).from(schema.lanType).where(eq(schema.lanType.clanId, clanId)).all();
  const nicks = db.select().from(schema.nickname).where(eq(schema.nickname.userId, userId)).all();

  db.transaction((tx) => {
    tx.update(schema.user).set({ firstName, lastName, name: `${firstName} ${lastName}` }).where(eq(schema.user.id, userId)).run();
    const setNick = (typeId: string | null, value: string) => {
      for (const n of nicks) if (!n.lanId && n.typeId === typeId) tx.delete(schema.nickname).where(eq(schema.nickname.id, n.id)).run();
      if (value) tx.insert(schema.nickname).values({ userId, typeId, nick: value, isPrimary: true }).run();
    };
    setNick(null, nick);
    for (const t of types) {
      if (formData.has(`nick_${t.id}`)) setNick(t.id, String(formData.get(`nick_${t.id}`)).trim().slice(0, 32));
      if (formData.has(`lanId_${t.id}`)) {
        const value = String(formData.get(`lanId_${t.id}`)).trim().slice(0, LAN_ID_MAX);
        tx.delete(schema.lanAccount)
          .where(and(eq(schema.lanAccount.userId, userId), eq(schema.lanAccount.typeId, t.id), isNull(schema.lanAccount.lanId)))
          .run();
        if (value) tx.insert(schema.lanAccount).values({ userId, typeId: t.id, value }).run();
      }
    }
  });

  let message = "Saved.";
  const newEmail = email ? normEmail(email) : null;
  if (newEmail !== (g.inviteEmail ?? null)) {
    if (!newEmail) {
      db.update(schema.user).set({ inviteEmail: null, invitedAt: null }).where(eq(schema.user.id, userId)).run();
    } else {
      const acc = accountByEmail(newEmail);
      if (acc) {
        mergeGuestInto({ ...g, firstName, lastName, name: `${firstName} ${lastName}` }, acc.id);
        revalidatePath("/", "layout");
        return { ok: true, message: `${acc.name} already has an account with that email. Everything moved over to it.` };
      }
      db.update(schema.user).set({ inviteEmail: newEmail }).where(eq(schema.user.id, userId)).run();
      const sent = await sendGuestInvite(userId, inviterName(me)).catch((e) => {
        console.error("[mail] guest invite failed", e);
        return false;
      });
      message = sent ? "Saved. The invite mail is on its way." : "Saved, but the invite mail couldn't be sent. Check the email settings.";
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, message };
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
  mergeGuestInto(g, me.id);
  revalidatePath("/", "layout");
  const c = g.guestClanId ? getClan(g.guestClanId) : null;
  redirect(c ? `/clans/${c.slug}` : "/");
}

/** Clan admins set the Discord invite link shown to members who aren't on the server. */
export async function setClanDiscordInvite(clanId: string, guildId: string, formData: FormData) {
  await requireClanManager(clanId);
  const r = setServerInvite(clanId, guildId, String(formData.get("inviteUrl") ?? ""));
  if (r.error) throw new Error(r.error);
  revalidatePath("/clans", "layout");
}
