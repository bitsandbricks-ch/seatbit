import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

const { team, teamMember, game } = schema;

/** Teams per event; more is a mistake or spam. */
export const MAX_TEAMS_PER_LAN = 40;
export const MAX_TEAM_SIZE = 16;

export type TeamView = {
  id: string;
  gameId: string;
  name: string;
  size: number;
  url: string;
  note: string;
  captain: string | null;
  /** In the order they joined. */
  members: string[];
};

/** The event's teams by game id. */
export function teamsByGame(lanId: string): Map<string, TeamView[]> {
  const rows = db
    .select({ t: team })
    .from(team)
    .innerJoin(game, eq(game.id, team.gameId))
    .where(eq(game.lanId, lanId))
    .orderBy(asc(team.createdAt))
    .all()
    .map((r) => r.t);
  const members = rows.length
    ? db
        .select()
        .from(teamMember)
        .where(
          inArray(
            teamMember.teamId,
            rows.map((t) => t.id),
          ),
        )
        .orderBy(asc(teamMember.joinedAt))
        .all()
    : [];
  const out = new Map<string, TeamView[]>();
  for (const t of rows) {
    const list = out.get(t.gameId) ?? [];
    list.push({
      id: t.id,
      gameId: t.gameId,
      name: t.name,
      size: t.size,
      url: t.url,
      note: t.note,
      captain: t.createdBy,
      members: members.filter((m) => m.teamId === t.id).map((m) => m.userId),
    });
    out.set(t.gameId, list);
  }
  return out;
}

/** The team a person plays in for a game, if any: one team per game. */
export function myTeamFor(teams: TeamView[] | undefined, userId: string) {
  return teams?.find((t) => t.members.includes(userId));
}
