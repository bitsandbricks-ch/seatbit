"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { err, getT, shownError, tr } from "@/i18n/server";
import { formError } from "@/i18n/form-errors";
import { getDisplayNames, mustGetLan } from "@/lib/lans";
import { lanChanged } from "@/lib/live";
import { appUrl } from "@/lib/mail";
import { notify, notifyLater } from "@/lib/notify";
import { optionalHttpUrl } from "@/lib/safe-url";
import { canTakePart, isLanManager, requireUser } from "@/lib/session";
import { MAX_TEAMS_PER_LAN, MAX_TEAM_SIZE } from "@/lib/teams";

const { game, team, teamMember } = schema;

const refresh = (lanId: string) => {
  lanChanged(lanId);
  revalidatePath(`/lans/${lanId}`);
};

const teamInput = z.object({
  name: z.string().trim().min(1).max(40),
  size: z.coerce.number().int().min(2).max(MAX_TEAM_SIZE),
  url: optionalHttpUrl().default(""),
  note: z.string().trim().max(200).default(""),
});

const parseTeam = (fd: FormData) =>
  teamInput.safeParse({
    name: fd.get("name") ?? "",
    size: fd.get("size") ?? "",
    url: String(fd.get("url") ?? "").trim(),
    note: fd.get("note") ?? "",
  });

/** Anyone who takes part in the event (members, leads), like the games. */
async function participant(lanId: string) {
  const me = await requireUser();
  if (!canTakePart(me, lanId)) throw await err("errors.joinFirst");
  return me;
}

async function mustGame(gameId: string) {
  const g = db.select().from(game).where(eq(game.id, gameId)).get();
  if (!g) throw await err("errors.gone");
  return g;
}

async function mustTeam(teamId: string) {
  const row = db.select({ t: team, lanId: game.lanId }).from(team).innerJoin(game, eq(game.id, team.gameId)).where(eq(team.id, teamId)).get();
  if (!row) throw await err("teams.errors.gone");
  return { ...row.t, lanId: row.lanId };
}

const membersOf = (teamId: string) =>
  db.select({ userId: teamMember.userId }).from(teamMember).where(eq(teamMember.teamId, teamId)).all().map((m) => m.userId);

/** The team someone already plays in for this game. */
function teamOfFor(gameId: string, userId: string) {
  const ids = db.select({ id: team.id }).from(team).where(eq(team.gameId, gameId)).all().map((t) => t.id);
  if (!ids.length) return undefined;
  return db
    .select()
    .from(teamMember)
    .where(and(inArray(teamMember.teamId, ids), eq(teamMember.userId, userId)))
    .get();
}

/** Tells everyone in the team that it's complete, once it fills up. */
async function announceFull(t: { id: string; name: string; size: number; lanId: string }) {
  const members = membersOf(t.id);
  if (members.length !== t.size) return;
  const l = mustGetLan(t.lanId);
  const names = await getDisplayNames(t.lanId, members);
  const list = members.map((m) => names.get(m) ?? "?").join(", ");
  notifyLater(async () => {
    for (const m of members) {
      await notify(m, (tt) => ({
        kind: "team_full",
        subject: tt("teams.notice.full", { team: t.name, lan: l.name }),
        text: tt("teams.notice.fullText", { team: t.name, people: list }),
        url: `${appUrl}/lans/${l.id}?tab=games`,
        dmOnly: true,
      })).catch(() => undefined);
    }
  });
}

/** Starts a team for a game; who starts it is the captain and its first player. */
export async function createTeam(gameId: string, fd: FormData): Promise<{ error?: string }> {
  const g = await mustGame(gameId);
  const me = await participant(g.lanId);
  const parsed = parseTeam(fd);
  if (!parsed.success) return { error: formError(parsed.error, await getT()) };
  const count = db.select({ id: team.id }).from(team).innerJoin(game, eq(game.id, team.gameId)).where(eq(game.lanId, g.lanId)).all().length;
  if (count >= MAX_TEAMS_PER_LAN) return { error: await tr("teams.errors.max", { count: MAX_TEAMS_PER_LAN }) };
  // Leads can set up teams for others without joining; members start the team they play in.
  const lead = isLanManager(me, g.lanId);
  const playing = teamOfFor(gameId, me.id);
  if (playing && !lead) return { error: await tr("teams.errors.alreadyIn") };
  db.transaction((tx) => {
    const t = tx.insert(team).values({ gameId, createdBy: me.id, ...parsed.data }).returning().get();
    if (!playing) tx.insert(teamMember).values({ teamId: t.id, userId: me.id }).run();
  });
  refresh(g.lanId);
  return {};
}

/** Name, size, link and note: the captain or a lead. */
export async function updateTeam(teamId: string, fd: FormData): Promise<{ error?: string }> {
  const t = await mustTeam(teamId);
  const me = await participant(t.lanId);
  if (t.createdBy !== me.id && !isLanManager(me, t.lanId)) throw await err("teams.errors.captainOnly");
  const parsed = parseTeam(fd);
  if (!parsed.success) return { error: formError(parsed.error, await getT()) };
  if (parsed.data.size < membersOf(teamId).length) return { error: await tr("teams.errors.tooSmall") };
  db.update(team).set(parsed.data).where(eq(team.id, teamId)).run();
  if (parsed.data.size !== t.size) await announceFull({ ...t, ...parsed.data });
  refresh(t.lanId);
  return {};
}

export async function deleteTeam(teamId: string) {
  const t = await mustTeam(teamId);
  const me = await participant(t.lanId);
  if (t.createdBy !== me.id && !isLanManager(me, t.lanId)) throw await err("teams.errors.captainOnly");
  db.delete(team).where(eq(team.id, teamId)).run();
  refresh(t.lanId);
}

/** Join a team with a free place; one team per game. */
export async function joinTeam(teamId: string) {
  const t = await mustTeam(teamId);
  const me = await participant(t.lanId);
  const t2 = await getT();
  db.transaction((tx) => {
    const ids = tx.select({ id: team.id }).from(team).where(eq(team.gameId, t.gameId)).all().map((x) => x.id);
    const mine = tx.select().from(teamMember).where(and(inArray(teamMember.teamId, ids), eq(teamMember.userId, me.id))).get();
    if (mine?.teamId === teamId) return;
    if (mine) throw shownError(t2("teams.errors.alreadyIn"));
    const taken = tx.select({ u: teamMember.userId }).from(teamMember).where(eq(teamMember.teamId, teamId)).all().length;
    if (taken >= t.size) throw shownError(t2("teams.errors.full"));
    tx.insert(teamMember).values({ teamId, userId: me.id }).run();
  });
  await announceFull(t);
  refresh(t.lanId);
}

/** Leave a team, or (captain, lead) take someone out of it. */
export async function leaveTeam(teamId: string, userId?: string) {
  const t = await mustTeam(teamId);
  const me = await participant(t.lanId);
  const target = userId ?? me.id;
  if (target !== me.id && t.createdBy !== me.id && !isLanManager(me, t.lanId)) throw await err("teams.errors.captainOnly");
  db.delete(teamMember).where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, target))).run();
  refresh(t.lanId);
}
