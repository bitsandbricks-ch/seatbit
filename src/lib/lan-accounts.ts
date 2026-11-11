import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, LanAccount } from "@/db/schema";

const { lanAccount } = schema;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Longest participant number/ID we store (lal.gg IDs, ticket codes, ...). */
export const LAN_ID_MAX = 40;

export type LanAccountScope = { lanId: string | null; typeId: string | null };

/** Where a LAN's IDs live: the LAN type when it has one (so the ID carries over to next year), else the event. */
export const lanAccountScope = (l: Pick<Lan, "id" | "typeId">): LanAccountScope =>
  l.typeId ? { lanId: null, typeId: l.typeId } : { lanId: l.id, typeId: null };

const inScope = (a: LanAccountScope) =>
  and(
    a.lanId ? eq(lanAccount.lanId, a.lanId) : isNull(lanAccount.lanId),
    a.typeId ? eq(lanAccount.typeId, a.typeId) : isNull(lanAccount.typeId),
  );

/** Event ID first, then the LAN type's ID. */
export function pickLanAccount(list: LanAccount[], l: Pick<Lan, "id" | "typeId">) {
  return (
    list.find((a) => a.lanId === l.id)?.value ??
    (l.typeId ? list.find((a) => a.typeId === l.typeId && !a.lanId)?.value : undefined) ??
    null
  );
}

/** Map userId -> participant ID at this LAN. */
export function getLanAccounts(l: Pick<Lan, "id" | "typeId">, userIds: string[]) {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const rows = db.select().from(lanAccount).where(inArray(lanAccount.userId, userIds)).all();
  for (const uid of userIds) {
    const v = pickLanAccount(rows.filter((r) => r.userId === uid), l);
    if (v) map.set(uid, v);
  }
  return map;
}

/** Sets (or, when empty, clears) a user's ID in one scope. */
export function saveLanAccount(userId: string, scope: LanAccountScope, raw: string) {
  const value = raw.trim().slice(0, LAN_ID_MAX);
  db.transaction((tx) => {
    tx.delete(lanAccount).where(and(eq(lanAccount.userId, userId), inScope(scope))).run();
    if (value) tx.insert(lanAccount).values({ userId, ...scope, value }).run();
  });
}

/** Moves a guest's IDs to the account that claimed it, keeping the account's own where both have one. */
export function moveLanAccounts(tx: Tx, fromId: string, toId: string) {
  const mine = tx.select().from(lanAccount).where(eq(lanAccount.userId, toId)).all();
  for (const a of tx.select().from(lanAccount).where(eq(lanAccount.userId, fromId)).all()) {
    if (mine.some((x) => x.lanId === a.lanId && x.typeId === a.typeId))
      tx.delete(lanAccount).where(eq(lanAccount.id, a.id)).run();
    else tx.update(lanAccount).set({ userId: toId }).where(eq(lanAccount.id, a.id)).run();
  }
}
