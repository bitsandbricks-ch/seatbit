/**
 * What members change about themselves for an event (nick, ticket, seat wishes). Shared by the
 * server actions and the Discord commands, so both follow the same rules.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { cleanName } from "./names";
import { makeT, type T } from "../i18n/translate";
import { MAX_NEAR, MAX_WISHES, normalizeRules, rulesProblem, seatRulesSchema } from "./seat-rules";
import { lanChanged } from "./live";

const { attendance, nickname } = schema;

export type NickScope = { lanId: string | null; typeId: string | null };

const nickInput = z.object({
  nick: z.string().transform(cleanName).pipe(z.string().min(1).max(32)),
  lanId: z.string().nullish().transform((v) => v || null),
  typeId: z.string().nullish().transform((v) => v || null),
});

const sameScope = (a: NickScope, b: NickScope) => a.lanId === b.lanId && a.typeId === b.typeId;

/** Sets the user's one nick for a scope (default, LAN type or single event). Empty removes it. Returns the stored nick. */
export function saveNick(userId: string, raw: string, scopeIn: Partial<NickScope> = {}) {
  const nickRaw = raw.trim();
  const scope = nickInput.parse({ nick: nickRaw || "-", lanId: scopeIn.lanId, typeId: scopeIn.typeId });
  if (scope.lanId && scope.typeId) throw new Error("Pick one scope");
  const mine = db.select().from(nickname).where(eq(nickname.userId, userId)).all();
  db.transaction((tx) => {
    for (const n of mine) if (sameScope(n, scope)) tx.delete(nickname).where(eq(nickname.id, n.id)).run();
    if (nickRaw) {
      tx.insert(nickname)
        .values({ userId, lanId: scope.lanId, typeId: scope.typeId, nick: scope.nick, isPrimary: true })
        .run();
    }
  });
  return nickRaw ? scope.nick : null;
}

const myAttendance = (lanId: string, userId: string) =>
  db
    .select()
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId)))
    .get();

/** "I bought my ticket" (or not). Once a lead confirmed it, only they can change it. */
export function saveTicketBought(lanId: string, userId: string, bought: boolean, t: T = makeT("en")) {
  const a = myAttendance(lanId, userId);
  if (!a) throw new Error(t("errors.answerFirst"));
  if (a.paid) throw new Error(t("errors.ticketConfirmed"));
  db.update(attendance).set({ ticketBought: bought }).where(eq(attendance.id, a.id)).run();
  lanChanged(lanId);
}

export const wishInput = z.object({
  rules: seatRulesSchema,
  note: z.string().trim().max(300),
});
export type SeatWishes = z.output<typeof wishInput>;

/**
 * Saves a member's seat wishes (by the member or a lead). The caller checks the plan isn't final yet.
 * Returns whether anything changed.
 */
export function saveSeatWishes(lanId: string, userId: string, input: z.input<typeof wishInput>, t: T = makeT("en")) {
  const w = wishInput.parse(input);
  const problem = rulesProblem(w.rules);
  if (problem === "tooMany") throw new Error(t("wishes.errors.tooMany", { max: MAX_WISHES }));
  if (problem === "twoNext") throw new Error(t("wishes.errors.oneNext"));
  if (problem === "tooManyNear") throw new Error(t("wishes.errors.tooManyNear", { max: MAX_NEAR }));
  const a = myAttendance(lanId, userId);
  if (!a) throw new Error(t("errors.comingFirst"));
  const rules = normalizeRules(w.rules, userId);
  const changed = JSON.stringify(rules) !== JSON.stringify(a.wishRules ?? []) || w.note !== a.wishNote;
  db.update(attendance).set({ wishRules: rules, wishNote: w.note }).where(eq(attendance.id, a.id)).run();
  lanChanged(lanId);
  return changed;
}
