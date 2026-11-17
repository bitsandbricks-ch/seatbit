import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ClanLanType, LanType } from "@/db/schema";

const { lanType, clanLanType } = schema;

/** A clan's own defaults for events of a LAN type. */
export type ClanTypeSettings = Omit<ClanLanType, "clanId" | "typeId" | "createdAt">;

/** A global LAN type with one clan's defaults; `used` = the type is on the clan's list. */
export type ClanType = Omit<LanType, "legacyClanId"> & ClanTypeSettings & { used: boolean };

/** What a clan gets for a type it hasn't set anything for yet (same as the column defaults). */
export const CLAN_TYPE_DEFAULTS: ClanTypeSettings = {
  capacity: null,
  reminderDays: 3,
  seatSpec: "",
  answerDaysBefore: 30,
  discordMode: "channel",
  clanLeadTasks: true,
};

function merge(ty: LanType, own: ClanLanType | undefined | null): ClanType {
  const settings: ClanTypeSettings = own
    ? {
        capacity: own.capacity,
        reminderDays: own.reminderDays,
        seatSpec: own.seatSpec,
        answerDaysBefore: own.answerDaysBefore,
        discordMode: own.discordMode,
        clanLeadTasks: own.clanLeadTasks,
      }
    : CLAN_TYPE_DEFAULTS;
  return {
    id: ty.id,
    name: ty.name,
    description: ty.description,
    location: ty.location,
    websiteUrl: ty.websiteUrl,
    ticketUrl: ty.ticketUrl,
    price: ty.price,
    durationHours: ty.durationHours,
    profileUrl: ty.profileUrl,
    createdAt: ty.createdAt,
    ...settings,
    used: !!own,
  };
}

/** Every LAN type on the platform, by name. */
export function allTypes(): LanType[] {
  return db.select().from(lanType).orderBy(asc(lanType.name)).all();
}

export function getType(typeId: string): LanType | undefined {
  return db.select().from(lanType).where(eq(lanType.id, typeId)).get();
}

/** The LAN types a clan goes to, with its defaults, by name. */
export function clanTypes(clanId: string): ClanType[] {
  return db
    .select()
    .from(clanLanType)
    .innerJoin(lanType, eq(lanType.id, clanLanType.typeId))
    .where(eq(clanLanType.clanId, clanId))
    .orderBy(asc(lanType.name))
    .all()
    .map((r) => merge(r.lan_type, r.clan_lan_type));
}

/** One type with the clan's defaults, also when the clan doesn't have it on its list (then `used` is false). */
export function clanType(clanId: string | null | undefined, typeId: string | null | undefined): ClanType | undefined {
  if (!typeId) return undefined;
  const ty = getType(typeId);
  if (!ty) return undefined;
  const own = clanId
    ? db.select().from(clanLanType).where(and(eq(clanLanType.clanId, clanId), eq(clanLanType.typeId, typeId))).get()
    : undefined;
  return merge(ty, own);
}

/** The types any of these clans goes to, each once, by name. */
export function typesOfClans(clanIds: string[]): LanType[] {
  if (!clanIds.length) return [];
  const ids = db
    .selectDistinct({ id: clanLanType.typeId })
    .from(clanLanType)
    .where(inArray(clanLanType.clanId, clanIds))
    .all()
    .map((r) => r.id);
  return ids.length ? db.select().from(lanType).where(inArray(lanType.id, ids)).orderBy(asc(lanType.name)).all() : [];
}

/** Puts a type on a clan's list (with the defaults) unless it is there already. */
export function addTypeToClan(clanId: string, typeId: string) {
  db.insert(clanLanType).values({ clanId, typeId }).onConflictDoNothing().run();
}
