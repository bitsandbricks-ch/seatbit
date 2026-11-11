"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { canManageClan, clanRole, getClan, saveAvatar, uniqueSlug } from "@/lib/clans";
import { requireClanManager, requireUser } from "@/lib/session";
import type { FormState } from "./actions";

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
  db.update(clanMember)
    .set({ role })
    .where(and(eq(clanMember.clanId, clanId), eq(clanMember.userId, userId)))
    .run();
  revalidatePath("/", "layout");
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
