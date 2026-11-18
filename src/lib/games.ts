import { and, desc, eq, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, User } from "@/db/schema";
import { appUrl } from "./mail";
import { notify } from "./notify";
import { makeT } from "../i18n/translate";
import { localeOf } from "../i18n/user-locale";
import { teamsByGame, type TeamView } from "./teams";
import { coverUrl, gameColor } from "./game-catalog";
import { steamInstallUrl } from "./steam";

const { game, gameVote, attendance, user, reminderLog, lan, catalogGame } = schema;
const DAY = 24 * 60 * 60 * 1000;

/** How long before the LAN the "install your games" reminder goes out. */
export const GAMES_REMINDER_DAYS = 2;

export type GameView = {
  id: string;
  /** The catalog entry with the details; null only for games from before the catalog. */
  catalogId: string | null;
  name: string;
  sizeGb: number | null;
  url: string;
  cover: string | null;
  /** steam://install link that opens Steam's install dialog. */
  installUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  free: boolean | null;
  lan: boolean | null;
  /** May I fix the catalog details (I put it in the catalog, or platform staff)? Set by the page. */
  canEditDetails?: boolean;
  catalogBy: string | null;
  addedBy: string | null;
  votes: number;
  voters: string[];
  installed: number;
  /** Who ticked "installed". */
  installers: string[];
  /** Fill for the cover box when there is no picture, from the profile colours. */
  coverColor: string;
  myVote: boolean;
  myInstalled: boolean;
  /** Tournament teams for this game. */
  teams: TeamView[];
};

/** A LAN's games, most votes first, with my own marks. */
export function listGames(lanId: string, meId?: string): GameView[] {
  const games = db
    .select({ g: game, c: catalogGame })
    .from(game)
    .leftJoin(catalogGame, eq(catalogGame.id, game.catalogId))
    .where(eq(game.lanId, lanId))
    .all()
    .map(({ g, c }) => ({ ...g, c }));
  const teams = games.length ? teamsByGame(lanId) : new Map<string, TeamView[]>();
  const marks = games.length
    ? db.select().from(gameVote).where(inArray(gameVote.gameId, games.map((g) => g.id))).all()
    : [];
  return games
    .map((g) => {
      const mine = marks.filter((m) => m.gameId === g.id);
      const me = mine.find((m) => m.userId === meId);
      return {
        id: g.id,
        catalogId: g.c?.id ?? null,
        name: g.c?.name ?? g.name,
        sizeGb: g.c ? g.c.sizeGb : g.sizeGb,
        url: g.c ? g.c.url : g.url,
        cover: g.c ? coverUrl(g.c) : null,
        installUrl: g.c?.steamAppId ? steamInstallUrl(g.c.steamAppId) : null,
        minPlayers: g.c?.minPlayers ?? null,
        maxPlayers: g.c?.maxPlayers ?? null,
        free: g.c?.free ?? null,
        lan: g.c?.lan ?? null,
        catalogBy: g.c?.createdBy ?? null,
        addedBy: g.addedBy,
        votes: mine.filter((m) => m.vote).length,
        voters: mine.filter((m) => m.vote).map((m) => m.userId),
        installed: mine.filter((m) => m.installed).length,
        installers: mine.filter((m) => m.installed).map((m) => m.userId),
        coverColor: gameColor(g.c?.id ?? g.name),
        myVote: !!me?.vote,
        myInstalled: !!me?.installed,
        teams: teams.get(g.id) ?? [],
      };
    })
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
}

export type PastGame = { catalogId: string | null; name: string; sizeGb: number | null; url: string; votes: number };

/**
 * The games of the clan's previous event of the same LAN type that aren't on this list yet,
 * most votes first, so a yearly LAN doesn't start its list from scratch.
 */
export function previousGames(l: Lan, limit = 12): { lanName: string; games: PastGame[] } | null {
  if (!l.typeId || !l.clanId) return null;
  const prev = db
    .select()
    .from(lan)
    .where(
      and(
        eq(lan.clanId, l.clanId),
        eq(lan.typeId, l.typeId),
        ne(lan.id, l.id),
        lt(lan.startsAt, l.startsAt),
        isNotNull(lan.publishedAt),
        isNull(lan.cancelledAt),
      ),
    )
    .orderBy(desc(lan.startsAt))
    .limit(1)
    .get();
  if (!prev) return null;
  const here = listGames(l.id);
  const have = new Set(here.map((g) => g.name.trim().toLowerCase()));
  const haveIds = new Set(here.map((g) => g.catalogId).filter(Boolean));
  const games = listGames(prev.id)
    .filter((g) => !have.has(g.name.trim().toLowerCase()) && !(g.catalogId && haveIds.has(g.catalogId)))
    .slice(0, limit)
    .map((g) => ({ catalogId: g.catalogId, name: g.name, sizeGb: g.sizeGb, url: g.url, votes: g.votes }));
  return games.length ? { lanName: prev.name, games } : null;
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
