import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, User } from "@/db/schema";
import type { T } from "@/i18n/translate";
import { getAvatars } from "@/lib/avatars";
import { clanCan } from "@/lib/clans";
import { eventCosts } from "@/lib/costs";
import { lanRange } from "@/lib/format";
import { listGames } from "@/lib/games";
import { getDisplayNames } from "@/lib/lans";
import { Avatar } from "./avatar";
import { Card, btnSecondary } from "./ui";

const MAX_FACES = 14;

/**
 * After the LAN: a short look back on the overview (who came, what was played, whether the
 * money is settled) and, for leads, a way to set up the next one from the same LAN type.
 */
export async function EventRecap({ lan: l, me, clanSlug, t }: { lan: Lan; me: User; clanSlug: string | null; t: T }) {
  const came = db
    .select({ userId: schema.attendance.userId })
    .from(schema.attendance)
    .where(and(eq(schema.attendance.lanId, l.id), eq(schema.attendance.status, "going")))
    .all()
    .map((r) => r.userId);
  if (!came.length) return null;
  const names = await getDisplayNames(l.id, came.slice(0, MAX_FACES));
  const avatars = getAvatars(came.slice(0, MAX_FACES));
  const mySeat = db
    .select({ label: schema.seat.label })
    .from(schema.seat)
    .where(and(eq(schema.seat.lanId, l.id), eq(schema.seat.userId, me.id)))
    .get()?.label;
  const games = listGames(l.id).filter((g) => g.votes > 0);
  const teams = games.reduce((n, g) => n + g.teams.length, 0);
  const costs = eventCosts(l.id);
  const open = costs.transfers.length;
  const owe = costs.transfers.filter((x) => x.from === me.id).length;
  const canPlan = !!l.clanId && !!clanSlug && clanCan(me, l.clanId, "events");

  return (
    <Card
      title={t("recap.title", { name: l.name })}
      actions={
        canPlan && (
          <Link href={`/clans/${clanSlug}/lans/new${l.typeId ? `?type=${l.typeId}` : ""}`} className={`${btnSecondary} !min-h-8 !px-3 text-sm`}>
            {t("recap.planNext")}
          </Link>
        )
      }
    >
      <p className="-mt-2 mb-3 text-sm text-muted">{lanRange(l, t.locale)}</p>
      <ul className="space-y-3 text-sm">
        <li>
          <p className="font-medium text-fg">{t("recap.came", { count: came.length })}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {came.slice(0, MAX_FACES).map((id) => (
              <span key={id} title={names.get(id)}>
                <Avatar data={avatars.get(id)} size={26} ring={false} />
              </span>
            ))}
            {came.length > MAX_FACES && <span className="pl-1 text-xs text-muted">+{came.length - MAX_FACES}</span>}
          </div>
        </li>
        {mySeat && <li className="text-muted">{t("recap.yourSeat", { seat: mySeat })}</li>}
        {games.length > 0 && (
          <li>
            <span className="text-muted">{t("recap.played")} </span>
            <span className="text-fg">{games.slice(0, 3).map((g) => g.name).join(", ")}</span>
            {teams > 0 && <span className="text-muted"> · {t("recap.teams", { count: teams })}</span>}
          </li>
        )}
        {costs.expenses.length > 0 && (
          <li>
            <Link href="?tab=costs" scroll={false} className={`hover:underline ${open ? "text-warn" : "text-bit"}`}>
              {open === 0 ? t("recap.settled") : owe ? t("recap.youOwe", { count: owe }) : t("recap.open", { count: open })}
            </Link>
          </li>
        )}
      </ul>
    </Card>
  );
}
