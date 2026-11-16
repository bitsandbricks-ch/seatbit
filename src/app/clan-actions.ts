"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { LOCALES } from "@/i18n/config";
import { err, getT, tr } from "@/i18n/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { GUEST_CLAIM_MODES } from "@/db/schema";
import { clanCan, clanRole, clanmateIds, getClan, saveAvatar, uniqueSlug } from "@/lib/clans";
import { MEMBER_ROLES, isMemberRole, type MemberRole } from "@/lib/clan-roles";
import { guestEmail } from "@/lib/guests";
import { LAN_ID_MAX } from "@/lib/lan-accounts";
import {
  claimOrRequestGuest,
  discordTicketState,
  guestSuggestions,
  mergeGuestInto,
  normEmail,
  openGuestMatches,
  sendGuestInvite,
} from "@/lib/guest-claim";
import { appUrl } from "@/lib/mail";
import { opsT, postOps } from "@/lib/ops";
import { missingServers, setServerInvite } from "@/lib/discord-invite";
import { notify, notifyClanAdmins, notifyLater } from "@/lib/notify";
import { requireClanPermission, requireLanManager, requireUser } from "@/lib/session";
import { platformCan } from "@/lib/platform-roles";
import { adminSetAttendance, type FormState } from "./actions";
import { getDefaultNames } from "@/lib/lans";
import { audit } from "@/lib/audit";
import { UNLINKED, sendGuestDiscordDm } from "@/lib/discord";
import type { ActionResult } from "@/app/admin/settings/actions";
import { cancelSupport } from "@/lib/billing";
import { NAME_DISPLAYS, cleanName } from "@/lib/names";
import { safeNext } from "@/lib/safe-url";
import { overLimit } from "@/lib/rate-limit";

const { clan, clanMember, clanInvite } = schema;

const clanInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).default(""),
  joinPolicy: z.enum(["approval", "open", "invite"]).default("approval"),
  guestClaims: z.enum(GUEST_CLAIM_MODES).default("approval"),
  nameDisplay: z.enum(NAME_DISPLAYS).default("full"),
  // "" = the instance default
  locale: z.union([z.enum(LOCALES), z.literal("").transform(() => null)]).default(null),
});

const JOIN_LABEL = { approval: "clanForm.joinApproval", open: "clanForm.joinOpen", invite: "clanForm.joinInvite" } as const;

export async function createClan(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  if (overLimit("clan", me.id)) return { error: await tr("errors.tooMany") };
  const parsed = clanInput.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    joinPolicy: formData.get("joinPolicy") ?? "approval",
    guestClaims: formData.get("guestClaims") ?? "approval",
    nameDisplay: formData.get("nameDisplay") ?? "full",
    locale: formData.get("locale") ?? "",
  });
  if (!parsed.success) return { error: (await getT())("clanForm.nameError") };
  const row = db
    .insert(clan)
    .values({ ...parsed.data, slug: uniqueSlug(parsed.data.name) })
    .returning()
    .get();
  db.insert(clanMember).values({ clanId: row.id, userId: me.id, role: "admin" }).run();
  const ot = opsT();
  void postOps("clan", {
    title: ot("ops.newClan", { name: row.name }),
    url: `${appUrl}/clans/${row.slug}`,
    fields: [
      { name: ot("ops.createdBy"), value: me.name },
      { name: ot("clanForm.join"), value: ot(JOIN_LABEL[row.joinPolicy]) },
    ],
  });
  revalidatePath("/", "layout");
  redirect(`/clans/${row.slug}`);
}

export async function updateClan(_: FormState, formData: FormData): Promise<FormState> {
  const clanId = String(formData.get("clanId"));
  const me = await requireClanPermission(clanId, "settings");
  const before = getClan(clanId);
  const parsed = clanInput.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    joinPolicy: formData.get("joinPolicy") ?? "approval",
    guestClaims: formData.get("guestClaims") ?? "approval",
    nameDisplay: formData.get("nameDisplay") ?? "full",
    locale: formData.get("locale") ?? "",
  });
  if (!parsed.success) return { error: (await getT())("clanForm.nameError") };
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
  if (before) {
    const fields = [
      before.name !== parsed.data.name && "name",
      before.description !== parsed.data.description && "description",
      before.joinPolicy !== parsed.data.joinPolicy && "join rule",
      before.guestClaims !== parsed.data.guestClaims && "guest claiming",
      before.nameDisplay !== parsed.data.nameDisplay && "name display",
      (before.locale ?? null) !== parsed.data.locale && "language",
      (avatar || (formData.get("removeAvatar") === "on" && before.avatar)) && "avatar",
    ].filter((f): f is string => !!f);
    if (fields.length) audit({ actorId: me.id, action: "clan.update", clanId, data: { fields } });
  }
  revalidatePath("/", "layout");
  redirect(`/clans/${slug}/settings`);
}

/** Joins an open clan directly, or asks to join an approval clan. `next`: where to go afterwards (a shared event link). */
export async function joinClan(clanId: string, next?: unknown) {
  const me = await requireUser();
  const c = getClan(clanId);
  if (!c) throw new Error("Clan not found");
  if (c.suspendedAt) throw await err("errors.clanSuspended");
  const staff = platformCan(me, "clans");
  if (c.joinPolicy === "invite" && !staff) throw await err("errors.inviteOnly");
  const role = c.joinPolicy === "open" || staff ? "member" : "pending";
  db.insert(clanMember).values({ clanId, userId: me.id, role }).onConflictDoNothing().run();
  if (role === "pending") {
    notifyLater(() =>
      notifyClanAdmins(clanId, (t) => ({
        kind: "clan_request",
        subject: t("notice.joinRequest", { name: me.name, clan: c.name }),
        text: t("notice.joinRequestText", { name: me.name, clan: c.name }),
        url: `${appUrl}/clans/${c.slug}/settings?tab=members`,
      })),
    );
  }
  revalidatePath("/", "layout");
  // Bound form actions also get the FormData here, so only a same-site path counts.
  const back = safeNext(next, "") || undefined;
  redirect(afterJoin(c, me.id, back));
}

/** Where a new member lands: the guest check when the leads seem to have added them already. */
function afterJoin(c: { id: string; slug: string; guestClaims: string }, userId: string, next?: string) {
  const member = ["member", "admin"].includes(clanRole(userId, c.id) ?? "");
  if (member && c.guestClaims !== "off" && openGuestMatches(c.id, userId).length) return `/clans/${c.slug}/claim`;
  // Pending requests go back too: the shared event shows that the request is waiting.
  return next ?? `/clans/${c.slug}`;
}

export async function joinWithInvite(code: string) {
  const me = await requireUser();
  const inv = db.select().from(clanInvite).where(eq(clanInvite.code, code)).get();
  const c = inv && getClan(inv.clanId);
  if (!c) throw await err("errors.inviteInvalid");
  db.insert(clanMember)
    .values({ clanId: c.id, userId: me.id, role: "member" })
    .onConflictDoUpdate({
      target: [clanMember.clanId, clanMember.userId],
      set: { role: sql`CASE WHEN ${clanMember.role} = 'pending' THEN 'member' ELSE ${clanMember.role} END` },
    })
    .run();
  revalidatePath("/", "layout");
  redirect(afterJoin(c, me.id));
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
    throw await err("errors.lastAdmin");
  }
  db.delete(clanMember)
    .where(and(eq(clanMember.clanId, clanId), eq(clanMember.userId, me.id)))
    .run();
  revalidatePath("/", "layout");
  redirect("/clans");
}

/**
 * Approve a join request (pending -> member: admins and recruiters) or change a member's role (admins only).
 * A clan always keeps one admin.
 */
export async function setClanMemberRole(clanId: string, userId: string, role: MemberRole) {
  if (!(MEMBER_ROLES as readonly string[]).includes(role)) throw new Error("Unknown role");
  const from = clanRole(userId, clanId);
  if (!from) throw new Error("Not in this clan");
  const approving = from === "pending" && role === "member";
  const me = await requireClanPermission(clanId, approving ? "members" : "roles");
  if (from === role) return;
  if (from === "admin" && adminCount(clanId) <= 1) throw await err("errors.oneAdmin");
  if (role !== "member" && db.select({ g: schema.user.isGuest }).from(schema.user).where(eq(schema.user.id, userId)).get()?.g) {
    throw await err("errors.guestRole");
  }
  db.update(clanMember)
    .set({ role })
    .where(and(eq(clanMember.clanId, clanId), eq(clanMember.userId, userId)))
    .run();
  if (from === "pending") audit({ actorId: me.id, action: "member.approve", clanId, targetUserId: userId });
  if (from !== "pending" || role !== "member") {
    audit({ actorId: me.id, action: "member.role", clanId, targetUserId: userId, data: { from, to: role } });
  }
  revalidatePath("/", "layout");
  const c = getClan(clanId);
  if (from === "pending" && c) {
    notifyLater(async () => {
      // They may not be on the clan's Discord yet, so this also goes by mail, with the invite.
      const invites = (await missingServers(userId, clanId)).map((sv) => sv.inviteUrl).filter(Boolean);
      await notify(userId, (t) => ({
        kind: "clan_approved",
        subject: t("notice.approved", { clan: c.name }),
        text: `${t("notice.approvedText", { clan: c.name })}${
          invites.length ? `\n\n${t("notice.joinDiscord", { links: invites.join(" ") })}` : ""
        }\n\n${appUrl}/clans/${c.slug}`,
        url: `${appUrl}/clans/${c.slug}`,
      }));
    });
  } else if (c && role !== "member") {
    notifyLater(() =>
      notify(userId, (t) => ({
        kind: "clan_role",
        subject: t("notice.roleNow", { clan: c.name, role: t(`roleA.${role}`) }),
        text: `${t(`roleInfo.${role}`)}\n\n${appUrl}/clans/${c.slug}`,
        url: `${appUrl}/clans/${c.slug}`,
      })),
    );
  }
}

/** Recruiters remove members and decline requests; anyone with a role besides member only an admin can remove. */
export async function removeClanMember(clanId: string, userId: string) {
  const role = clanRole(userId, clanId);
  const me = await requireClanPermission(clanId, role === "member" || role === "pending" || !role ? "members" : "roles");
  if (role === "admin" && adminCount(clanId) <= 1) {
    throw await err("errors.oneAdmin");
  }
  if (role) audit({ actorId: me.id, action: "member.remove", clanId, targetUserId: userId, data: { pending: role === "pending" || undefined } });
  db.delete(clanMember)
    .where(and(eq(clanMember.clanId, clanId), eq(clanMember.userId, userId)))
    .run();
  revalidatePath("/", "layout");
}

export async function createInvite(clanId: string) {
  const me = await requireClanPermission(clanId, "members");
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  db.insert(clanInvite).values({ code, clanId, createdBy: me.id }).run();
  audit({ actorId: me.id, action: "invite.create", clanId });
  revalidatePath("/", "layout");
}

export async function deleteInvite(code: string) {
  const me = await requireUser();
  const inv = db.select().from(clanInvite).where(eq(clanInvite.code, code)).get();
  if (!inv || !clanCan(me, inv.clanId, "members")) return;
  db.delete(clanInvite).where(eq(clanInvite.code, code)).run();
  audit({ actorId: me.id, action: "invite.delete", clanId: inv.clanId });
  revalidatePath("/", "layout");
}

export async function deleteClan(clanId: string) {
  const me = await requireClanPermission(clanId, "settings");
  const c = getClan(clanId);
  // A deleted clan shouldn't keep paying.
  if (c) await cancelSupport(c);
  db.delete(clan).where(eq(clan.id, clanId)).run();
  // The clan's own entries lose their clan (platform admins still see them); this one says what happened.
  audit({ actorId: me.id, action: "clan.delete", data: { clan: c?.name } });
  revalidatePath("/", "layout");
  redirect("/clans");
}

/** Admins add an existing Seatbit user directly. */
export async function addClanMember(clanId: string, userId: string) {
  const me = await requireClanPermission(clanId, "members");
  const u = db.select().from(schema.user).where(eq(schema.user.id, userId)).get();
  if (!u || u.deletedAt) throw new Error("User not found");
  // Leads add people they already share a clan with; everyone else joins by invite link or request.
  if (!platformCan(me, "clans") && !clanmateIds(me.id).has(userId)) throw new Error("User not found");
  const from = clanRole(userId, clanId);
  if (from === "pending") audit({ actorId: me.id, action: "member.approve", clanId, targetUserId: userId });
  else if (!from) audit({ actorId: me.id, action: "member.add", clanId, targetUserId: userId });
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

const guestName = z.string().transform(cleanName).pipe(z.string().min(1).max(40));

const guestInput = z.object({
  firstName: guestName,
  lastName: guestName,
  nick: z.string().transform(cleanName).pipe(z.string().max(32)).default(""),
  email: z.union([z.literal(""), z.email().max(200)]).default(""),
});

const newClaimCode = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

type Created = { id: string } | { error: string };

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
  // An address that belongs to an account still makes a guest with an invite: leads don't add
  // people to a clan by email, and the form doesn't tell whether an address has an account.
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

/** The lead as the invite mail names them: Mike "Reyki" Keller. */
const inviterName = (u: { id: string; name: string }) => getDefaultNames([u.id]).get(u.id)?.full ?? u.name;

/** Sends a guest their invite mail, unless the lead already sent a lot in a short time (spam guard). */
const inviteGuest = async (guestId: string, me: { id: string; name: string }) =>
  overLimit("send", me.id) ? false : sendGuestInvite(guestId, inviterName(me));

/** What the lead sees after adding someone. */
function addedMessage(invited: boolean) {
  return invited ? "Guest added. The invite mail is on its way." : "Guest added.";
}

/** Adds a member without a login, so leads can sign them up and seat them. */
export async function addGuest(clanId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireClanPermission(clanId, "members");
  const r = createGuest(clanId, formData);
  if ("error" in r) return r;
  audit({ actorId: me.id, action: "guest.add", clanId, targetUserId: r.id });
  const invited = await inviteGuest(r.id, me).catch(() => false);
  revalidatePath("/", "layout");
  return { ok: true, message: addedMessage(invited) };
}

/** From an event's Attendees tab: adds a guest to the event's clan and signs them up as coming. */
export async function addGuestToLan(lanId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireLanManager(lanId);
  const l = db.select({ clanId: schema.lan.clanId }).from(schema.lan).where(eq(schema.lan.id, lanId)).get();
  if (!l?.clanId) return { error: await tr("errors.noClan") };
  const r = createGuest(l.clanId, formData);
  if ("error" in r) return r;
  audit({ actorId: me.id, action: "guest.add", clanId: l.clanId, lanId, targetUserId: r.id });
  await adminSetAttendance(lanId, r.id, "going");
  // After signing up, so the invite lists this event.
  const invited = await inviteGuest(r.id, me).catch(() => false);
  revalidatePath("/", "layout");
  return { ok: true, message: addedMessage(invited) };
}

const guestEdit = z.object({
  firstName: guestName,
  lastName: guestName,
  nick: z.string().transform(cleanName).pipe(z.string().max(32)),
  email: z.union([z.literal(""), z.email().max(200)]),
});

/**
 * Clan admins edit a guest who hasn't claimed their spot yet: name, default nick, nick and LAN ID per LAN
 * type, and email. A new email sends the invite (or hands everything over if that address has an account).
 */
export async function updateGuest(clanId: string, userId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireClanPermission(clanId, "members");
  const g = requireGuestOf(clanId, userId);
  const parsed = guestEdit.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    nick: formData.get("nick") ?? "",
    email: String(formData.get("email") ?? "").trim(),
  });
  if (!parsed.success) {
    const bad = new Set(parsed.error.issues.map((i) => i.path[0]));
    if (bad.has("email")) return { error: await tr("errors.badEmail") };
    if (bad.has("nick")) return { error: await tr("errors.nickLength") };
    return { error: await tr("errors.guestName") };
  }
  const { firstName, lastName, nick, email } = parsed.data;
  const types = db.select({ id: schema.lanType.id }).from(schema.lanType).where(eq(schema.lanType.clanId, clanId)).all();
  const nicks = db.select().from(schema.nickname).where(eq(schema.nickname.userId, userId)).all();
  const lanAccounts = db.select().from(schema.lanAccount).where(eq(schema.lanAccount.userId, userId)).all();
  const nickOf = (typeId: string | null) => nicks.find((n) => !n.lanId && n.typeId === typeId)?.nick ?? "";
  const fields = [
    (g.firstName !== firstName || g.lastName !== lastName) && "name",
    (nickOf(null) !== nick ||
      types.some((t) => formData.has(`nick_${t.id}`) && nickOf(t.id) !== String(formData.get(`nick_${t.id}`)).trim().slice(0, 32))) &&
      "nicks",
    types.some(
      (t) =>
        formData.has(`lanId_${t.id}`) &&
        (lanAccounts.find((a) => a.typeId === t.id && !a.lanId)?.value ?? "") !== String(formData.get(`lanId_${t.id}`)).trim().slice(0, LAN_ID_MAX),
    ) && "LAN IDs",
    (email ? normEmail(email) : null) !== (g.inviteEmail ?? null) && "email",
  ].filter((f): f is string => !!f);
  if (fields.length) audit({ actorId: me.id, action: "guest.update", clanId, targetUserId: userId, data: { fields } });

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
      db.update(schema.user).set({ inviteEmail: newEmail }).where(eq(schema.user.id, userId)).run();
      const sent = await inviteGuest(userId, me).catch((e) => {
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
  const me = await requireClanPermission(clanId, "members");
  const g = requireGuestOf(clanId, userId);
  audit({ actorId: me.id, action: "guest.delete", clanId, data: { guest: g.name } });
  db.delete(schema.user).where(eq(schema.user.id, userId)).run();
  revalidatePath("/", "layout");
}

/** New claim link; the old one stops working. */
/** "Send the DM again" on a guest a lead linked to a Discord member. */
export async function resendGuestDiscordDm(clanId: string, userId: string): Promise<ActionResult> {
  const me = await requireClanPermission(clanId, "members");
  const g = requireGuestOf(clanId, userId);
  if (!g.guestDiscordId) return { ok: false, message: await tr("guestDiscord.notLinked"), at: Date.now() };
  if (overLimit("send", me.id)) return { ok: false, message: await tr("errors.tooMany"), at: Date.now() };
  const r = await sendGuestDiscordDm(g.id);
  audit({ actorId: me.id, action: "guest.discord_dm", clanId, targetUserId: g.id, data: { guest: g.name, ok: r.ok } });
  revalidatePath("/clans", "layout");
  return r.ok
    ? { ok: true, message: await tr("errors.dmSent"), at: Date.now() }
    : {
        ok: false,
        message:
          r.problem === "cant_dm"
            ? "Discord didn't let the bot DM them (no shared server, or DMs off). Send them the claim link yourself."
            : r.problem === "bot_not_set_up"
              ? "The Discord bot isn't set up on this instance."
              : "Couldn't send the DM. Try again later or send the claim link yourself.",
        at: Date.now(),
      };
}

/** Drops a guest's Discord link, so that member's sign-in no longer takes it over. */
export async function unlinkGuestDiscord(clanId: string, userId: string): Promise<ActionResult> {
  const me = await requireClanPermission(clanId, "members");
  const g = requireGuestOf(clanId, userId);
  db.update(schema.user).set(UNLINKED).where(eq(schema.user.id, g.id)).run();
  audit({ actorId: me.id, action: "guest.discord_unlink", clanId, targetUserId: g.id, data: { guest: g.name } });
  revalidatePath("/clans", "layout");
  return { ok: true, message: await tr("errors.unlinked"), at: Date.now() };
}

export async function renewGuestLink(clanId: string, userId: string) {
  const me = await requireClanPermission(clanId, "members");
  requireGuestOf(clanId, userId);
  audit({ actorId: me.id, action: "guest.renew_link", clanId, targetUserId: userId });
  db.update(schema.user).set({ claimCode: newClaimCode() }).where(eq(schema.user.id, userId)).run();
  revalidatePath(`/clans`, "layout");
}

/**
 * The signed-in user takes over a guest: clan membership, attendance, seats,
 * nicks, lead roles, rides and gear move to the real account, then the guest is deleted.
 * Where both have something for the same LAN, the real account's stays.
 */
export async function claimGuest(code: string) {
  const me = await requireUser();
  const g = db.select().from(schema.user).where(eq(schema.user.claimCode, code)).get();
  if (!g?.isGuest) redirect("/");
  if (g.id !== me.id) audit({ actorId: me.id, action: "guest.claimed", clanId: g.guestClanId, data: { guest: g.name } });
  mergeGuestInto(g, me.id);
  revalidatePath("/", "layout");
  const c = g.guestClanId ? getClan(g.guestClanId) : null;
  redirect(c ? `/clans/${c.slug}` : "/");
}

/** "That's me" on the sign-in link from the bot's /claim (people who had no Seatbit account yet). */
export async function claimGuestFromDiscord(token: string) {
  const me = await requireUser();
  const st = discordTicketState(token, me);
  if (st.kind !== "ok") redirect(`/claim/discord/${token}`);
  const r = claimOrRequestGuest(st.clan, st.claim, me, "discord");
  revalidatePath("/", "layout");
  redirect(r === "claimed" ? `/clans/${st.clan.slug}?claimed=1` : `/claim/discord/${token}`);
}

/** Clan admins set the Discord invite link shown to members who aren't on the server. */
export async function setClanDiscordInvite(clanId: string, guildId: string, formData: FormData) {
  await requireClanPermission(clanId, "settings");
  const r = setServerInvite(clanId, guildId, String(formData.get("inviteUrl") ?? ""), await getT());
  if (r.error) throw new Error(r.error);
  revalidatePath("/clans", "layout");
}

// ---------------- Members claiming guests ----------------

/** The signed-in member of the clan (not pending, not a guest) and the clan, or an error. */
async function requireClaimingMember(clanId: string) {
  const me = await requireUser();
  const c = getClan(clanId);
  if (!c) throw new Error("Clan not found");
  const role = clanRole(me.id, clanId);
  if (me.isGuest || !isMemberRole(role)) throw await err("errors.joinFirst");
  if (c.guestClaims === "off") throw await err("errors.claimOff");
  return { me, c };
}

/**
 * "That's me": the member takes over a guest of the clan. With a name or nick match in a
 * clan that allows it, everything moves over right away; otherwise a clan admin confirms.
 */
export async function claimGuestAsMember(clanId: string, guestId: string) {
  const { me, c } = await requireClaimingMember(clanId);
  const s = guestSuggestions(clanId, me.id).find((x) => x.guest.id === guestId);
  if (!s) throw await err("errors.claimedAlready");
  const r = claimOrRequestGuest(c, s, me);
  revalidatePath("/", "layout");
  redirect(r === "claimed" ? `/clans/${c.slug}?claimed=1` : `/clans/${c.slug}/claim`);
}

/** "Not me": stops suggesting this guest to the member. */
export async function dismissGuestSuggestion(clanId: string, guestId: string) {
  const { me } = await requireClaimingMember(clanId);
  const g = db.select().from(schema.user).where(eq(schema.user.id, guestId)).get();
  if (!g?.isGuest || g.guestClanId !== clanId) return;
  db.insert(schema.guestClaim)
    .values({ clanId, guestId, userId: me.id, status: "dismissed" })
    .onConflictDoUpdate({ target: [schema.guestClaim.guestId, schema.guestClaim.userId], set: { status: "dismissed" } })
    .run();
  revalidatePath("/", "layout");
}

/** The member takes back their open request. */
export async function cancelGuestClaim(claimId: string) {
  const me = await requireUser();
  db.delete(schema.guestClaim)
    .where(and(eq(schema.guestClaim.id, claimId), eq(schema.guestClaim.userId, me.id), eq(schema.guestClaim.status, "pending")))
    .run();
  revalidatePath("/", "layout");
}

/** A clan admin confirms (everything moves to the member) or declines a request. */
export async function decideGuestClaim(claimId: string, approve: boolean) {
  const r = db.select().from(schema.guestClaim).where(eq(schema.guestClaim.id, claimId)).get();
  if (!r) return;
  const me = await requireClanPermission(r.clanId, "members");
  const c = getClan(r.clanId);
  const g = db.select().from(schema.user).where(eq(schema.user.id, r.guestId)).get();
  if (!c || !g?.isGuest || r.status !== "pending") return;
  audit({
    actorId: me.id,
    action: approve ? "guest.claim_approve" : "guest.claim_decline",
    clanId: c.id,
    targetUserId: r.userId,
    data: { guest: g.name },
  });
  if (approve) mergeGuestInto(g, r.userId);
  else db.update(schema.guestClaim).set({ status: "declined" }).where(eq(schema.guestClaim.id, claimId)).run();
  notifyLater(() =>
    notify(r.userId, (t) => ({
      kind: approve ? "guest_claim_approved" : "guest_claim_declined",
      subject: approve
        ? t("notice.tookOver", { guest: g.name, clan: c.name })
        : t("notice.notTakenOver", { guest: g.name }),
      text: `${t(approve ? "notice.claimApprovedText" : "notice.claimDeclinedText", { guest: g.name, clan: c.name })}\n\n${appUrl}/clans/${c.slug}`,
      url: `${appUrl}/clans/${c.slug}`,
    })),
  );
  revalidatePath("/", "layout");
}
