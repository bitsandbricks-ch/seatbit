"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { err, getT, tr } from "@/i18n/server";
import { formError } from "@/i18n/form-errors";
import { audit } from "@/lib/audit";
import { DISCORD_MODES } from "@/lib/discord-modes";
import { getType, addTypeToClan } from "@/lib/lan-types";
import { validProfileUrl } from "@/lib/profile-link";
import { optionalHttpUrl } from "@/lib/safe-url";
import { parseSeatSpec } from "@/lib/seat-spec";
import { assertPlatform, requireClanPermission } from "@/lib/session";
import type { FormState } from "./actions";

const { lanType, clanLanType, leadTask, leadContact, clan } = schema;

const optNumber = (min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(min).max(max).nullable());

// ---------------- Global LAN types (platform staff) ----------------

const lanTypeInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(5000).default(""),
  location: z.string().max(200).default(""),
  websiteUrl: optionalHttpUrl().default(""),
  ticketUrl: optionalHttpUrl().default(""),
  price: z.string().max(50).default(""),
  durationHours: z.coerce.number().int().min(1).max(24 * 14),
  profileUrl: z
    .string()
    .trim()
    .max(500)
    .default("")
    .refine((v) => !v || validProfileUrl(v)),
});

/** Adds or edits a global LAN type. Only platform staff with the "types" permission. */
export async function saveLanType(_: FormState, formData: FormData): Promise<FormState> {
  const me = await assertPlatform("types");
  const id = (formData.get("id") as string) || null;
  if (id && !getType(id)) throw await err("errors.gone");
  const parsed = lanTypeInput.safeParse(Object.fromEntries([...formData.entries()].filter(([k]) => k !== "id")));
  if (!parsed.success) return { error: formError(parsed.error, await getT()) };
  const same = db.select().from(lanType).all().find((x) => x.id !== id && x.name.trim().toLowerCase() === parsed.data.name.toLowerCase());
  if (same) return { error: await tr("lanTypes.nameTaken", { name: same.name }) };
  if (id) db.update(lanType).set(parsed.data).where(eq(lanType.id, id)).run();
  else db.insert(lanType).values(parsed.data).run();
  audit({ actorId: me.id, action: "type.save", data: { type: parsed.data.name, created: !id } });
  revalidatePath("/", "layout");
  redirect("/admin/types");
}

/** Deletes a global LAN type: events keep their details, nicks and IDs for it and the clans' to-dos for it go. */
export async function deleteLanType(id: string) {
  const me = await assertPlatform("types");
  const t = getType(id);
  if (!t) return;
  db.delete(lanType).where(eq(lanType.id, id)).run();
  audit({ actorId: me.id, action: "type.delete", data: { type: t.name } });
  revalidatePath("/", "layout");
  redirect("/admin/types");
}

// ---------------- A clan's LAN types ----------------

function clanSlug(clanId: string) {
  return db.select({ slug: clan.slug }).from(clan).where(eq(clan.id, clanId)).get()?.slug ?? "";
}

/** Puts a global LAN type on the clan's list and opens its page to set the clan's defaults. */
export async function addClanType(clanId: string, formData: FormData) {
  const me = await requireClanPermission(clanId, "events");
  const t = getType(String(formData.get("typeId") ?? ""));
  if (!t) throw await err("errors.gone");
  addTypeToClan(clanId, t.id);
  audit({ actorId: me.id, action: "type.clan_add", clanId, data: { type: t.name } });
  revalidatePath("/clans", "layout");
  redirect(`/clans/${clanSlug(clanId)}/types/${t.id}`);
}

const clanTypeInput = z.object({
  capacity: optNumber(1, 100_000),
  reminderDays: z.coerce.number().int().min(0).max(60),
  seatSpec: z.string().trim().max(500).default(""),
  answerDaysBefore: optNumber(0, 365),
  discordMode: z.enum(DISCORD_MODES).default("channel"),
});

/** The clan's own defaults for events of a type (spots, seats, deadlines, Discord). Adds the type to its list. */
export async function saveClanType(clanId: string, typeId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireClanPermission(clanId, "events");
  const t = getType(typeId);
  if (!t) throw await err("errors.gone");
  const parsed = clanTypeInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: formError(parsed.error, await getT()) };
  if (parsed.data.seatSpec) {
    try {
      parseSeatSpec(parsed.data.seatSpec, await getT());
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  db.insert(clanLanType)
    .values({ clanId, typeId, ...parsed.data })
    .onConflictDoUpdate({ target: [clanLanType.clanId, clanLanType.typeId], set: parsed.data })
    .run();
  audit({ actorId: me.id, action: "type.clan_settings", clanId, data: { type: t.name } });
  revalidatePath("/clans", "layout");
  return { ok: true };
}

/** Takes a type off the clan's list, with the clan's to-dos and contacts for it. Events keep their type. */
export async function removeClanType(clanId: string, typeId: string) {
  const me = await requireClanPermission(clanId, "events");
  const t = getType(typeId);
  if (!t) return;
  db.transaction((tx) => {
    tx.delete(clanLanType).where(and(eq(clanLanType.clanId, clanId), eq(clanLanType.typeId, typeId))).run();
    tx.delete(leadTask).where(and(eq(leadTask.clanId, clanId), eq(leadTask.typeId, typeId))).run();
    tx.delete(leadContact).where(and(eq(leadContact.clanId, clanId), eq(leadContact.typeId, typeId))).run();
  });
  audit({ actorId: me.id, action: "type.clan_remove", clanId, data: { type: t.name } });
  revalidatePath("/clans", "layout");
  redirect(`/clans/${clanSlug(clanId)}/settings?tab=types`);
}
