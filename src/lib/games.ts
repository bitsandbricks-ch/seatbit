import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, User } from "@/db/schema";
import { appUrl } from "./mail";
import { notify } from "./notify";
import { makeT } from "../i18n/translate";
import { localeOf } from "../i18n/user-locale";

const { game, gameVote, attendance, user, reminderLog } = schema;
const DAY = 24 * 60 * 60 * 1000;

/** How long before the LAN the "install your games" reminder goes out. */
export const GAMES_REMINDER_DAYS = 2;

export type GameView = {
  id: string;
  name: string;
  sizeGb: number | null;
  url: string;
  addedBy: string | null;
  votes: number;
  voters: string[];
  installed: number;
  myVote: boolean;
  myInstalled: boolean;
};

/** A LAN's games, most votes first, with my own marks. */
export function listGames(lanId: string, meId?: string): GameView[] {
  const games = db.select().from(game).where(eq(game.lanId, lanId)).all();
  const marks = games.length
    ? db.select().from(gameVote).where(inArray(gameVote.gameId, games.map((g) => g.id))).all()
    : [];
  return games
    .map((g) => {
      const mine = marks.filter((m) => m.gameId === g.id);
      const me = mine.find((m) => m.userId === meId);
      return {
        id: g.id,
        name: g.name,
        sizeGb: g.sizeGb,
        url: g.url,
        addedBy: g.addedBy,
        votes: mine.filter((m) => m.vote).length,
        voters: mine.filter((m) => m.vote).map((m) => m.userId),
        installed: mine.filter((m) => m.installed).length,
        myVote: !!me?.vote,
        myInstalled: !!me?.installed,
      };
    })
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
}

/** Games with at least one vote, for the reminder (top 10). */
const reminderGames = (lanId: string) => listGames(lanId).filter((g) => g.votes > 0).slice(0, 10);

export function gamesReminderDue(l: Lan, now = new Date()) {
  const t = l.startsAt.getTime() - now.getTime();
  return t > 0 && t <= GAMES_REMINDER_DAYS * DAY;
}

/** The reminder text for one member: every top game, marking the ones they already installed. */
function gamesText(l: Lan, u: User) {
  const t = makeT(localeOf(u));
  const games = reminderGames(l.id);
  const done = new Set(
    db
      .select()
      .from(gameVote)
      .where(and(eq(gameVote.userId, u.id), eq(gameVote.installed, true)))
      .all()
      .map((v) => v.gameId),
  );
  const open = games.filter((g) => !done.has(g.id));
  if (open.length === 0) return null;
  const total = open.reduce((n, g) => n + (g.sizeGb ?? 0), 0);
  const lines = games.map(
    (g) => `${done.has(g.id) ? "✓" : "•"} ${g.name}${g.sizeGb ? ` (${g.sizeGb} GB)` : ""} · ${t("notice.votes", { count: g.votes })}`,
  );
  return {
    locale: t.locale,
    subject: t("notice.games", { lan: l.name }),
    text: `${t("mail.hi", { name: u.firstName || u.name })}\n\n${t("notice.gamesText", { lan: l.name })}\n\n${lines.join("\n")}\n\n${total ? `${t("notice.gamesTotal", { gb: total })} ` : ""}${t("notice.gamesTick", { url: `${appUrl}/lans/${l.id}?tab=games` })}`,
  };
}

/** Sends the "install your games" reminder once to everyone coming. */
export async function sendGamesReminder(l: Lan, opts: { force?: boolean } = {}) {
  if (!l.publishedAt || reminderGames(l.id).length === 0) return 0;
  const rows = db
    .select({ u: user })
    .from(attendance)
    .innerJoin(user, eq(user.id, attendance.userId))
    .where(and(eq(attendance.lanId, l.id), eq(attendance.status, "going")))
    .all();
  let sent = 0;
  for (const { u } of rows) {
    if (
      !opts.force &&
      db
        .select()
        .from(reminderLog)
        .where(and(eq(reminderLog.lanId, l.id), eq(reminderLog.userId, u.id), eq(reminderLog.kind, "games")))
        .get()
    )
      continue;
    const m = gamesText(l, u);
    if (!m) continue;
    const r = await notify(u, { kind: "reminder", ...m, url: `${appUrl}/lans/${l.id}?tab=games` }).catch(() => ({
      email: false,
      dm: false,
    }));
    if (!r.email && !r.dm) continue;
    db.insert(reminderLog)
      .values({ lanId: l.id, userId: u.id, kind: "games" })
      .onConflictDoUpdate({
        target: [reminderLog.lanId, reminderLog.userId, reminderLog.kind],
        set: { sentAt: new Date() },
      })
      .run();
    sent++;
  }
  return sent;
}
