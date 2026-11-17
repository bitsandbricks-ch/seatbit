/**
 * The marks after a member's name, gathered for a whole list at once: real account
 * (check mark), Discord linked/verified, Donor. Render with <MemberBadges>.
 */
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { discordInfo } from "./discord-verify";
import { donorIds } from "./donations";
import type { Badges } from "@/components/member-badges";

export function memberBadges(userIds: string[]): Map<string, Badges> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, Badges>();
  if (ids.length === 0) return out;
  const guests = new Set(
    db
      .select({ id: schema.user.id, isGuest: schema.user.isGuest })
      .from(schema.user)
      .where(inArray(schema.user.id, ids))
      .all()
      .flatMap((u) => (u.isGuest ? [u.id] : [])),
  );
  const discord = discordInfo(ids);
  const donors = donorIds(ids);
  for (const id of ids) out.set(id, { real: !guests.has(id), discord: discord.get(id), donor: donors.has(id) });
  return out;
}

/** As a plain object, for passing to client components. */
export const badgesRecord = (userIds: string[]) => Object.fromEntries(memberBadges(userIds));
