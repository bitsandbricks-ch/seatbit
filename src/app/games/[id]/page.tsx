import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, Columns, Page, PageHeader, btnSecondary } from "@/components/ui";
import { GameCover } from "@/components/game-cover";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { coverUrl, gameColor, getCatalogGame } from "@/lib/game-catalog";
import { storeOf } from "@/lib/game-stores";
import { platformCan } from "@/lib/platform-roles";
import { httpHref } from "@/lib/safe-url";
import { canViewLan, requireUser } from "@/lib/session";
import { steamInstallUrl } from "@/lib/steam";

export async function generateMetadata({ params }: PageProps<"/games/[id]">) {
  const g = getCatalogGame((await params).id);
  return { title: `${g?.name ?? (await getT())("gameCatalog.title")} · Seatbit` };
}

/** One game of the catalog, read-only for everyone signed in, with the events of theirs that play it. */
export default async function GamePage({ params }: PageProps<"/games/[id]">) {
  const { id } = await params;
  const me = await requireUser({ next: `/games/${id}` });
  const t = await getT();
  const g = getCatalogGame(id);
  if (!g) notFound();
  const events = db
    .select({ id: schema.lan.id, name: schema.lan.name, startsAt: schema.lan.startsAt })
    .from(schema.game)
    .innerJoin(schema.lan, eq(schema.lan.id, schema.game.lanId))
    .where(eq(schema.game.catalogId, g.id))
    .orderBy(desc(schema.lan.startsAt))
    .all()
    .filter((e) => canViewLan(me, e.id));
  const store = storeOf(g.url);
  const href = httpHref(g.url);
  const players =
    g.minPlayers != null && g.maxPlayers != null && g.minPlayers !== g.maxPlayers
      ? t("games.playersRange", { min: g.minPlayers, max: g.maxPlayers })
      : (g.maxPlayers ?? g.minPlayers)
        ? t("games.players", { count: (g.maxPlayers ?? g.minPlayers)! })
        : null;
  const yesNo = (v: boolean | null, yes: string, no: string) => (v == null ? "—" : v ? yes : no);
  const facts: [string, string][] = [
    [t("gameCatalog.size"), g.sizeGb != null ? `${g.sizeGb} GB` : "—"],
    [t("gameCatalog.players"), players ?? "—"],
    [t("gameCatalog.price"), yesNo(g.free, t("gameCatalog.free"), t("gameCatalog.paid"))],
    [t("gameCatalog.lan"), yesNo(g.lan, t("gameCatalog.lanYes"), t("gameCatalog.lanNo"))],
  ];
  return (
    <Page>
      <PageHeader
        back={{ href: "/games", label: t("gameCatalog.title") }}
        title={g.name}
        actions={
          platformCan(me, "games") ? (
            <Link href={`/admin/games/${g.id}`} className={btnSecondary}>
              {t("gameCatalog.edit")}
            </Link>
          ) : undefined
        }
      />
      <Columns
        aside={
          <Card title={t("gameCatalog.yourEvents")}>
            {events.length === 0 ? (
              <p className="text-sm text-muted">{t("gameCatalog.yourEventsNone")}</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/lans/${e.id}?tab=games`} className="hover:text-bit hover:underline">
                      {e.name}
                    </Link>{" "}
                    <span className="text-xs text-faint">{fmtDate(e.startsAt, t.locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        }
      >
        <Card>
          <GameCover name={g.name} cover={coverUrl(g)} color={gameColor(g.id)} className="w-full max-w-xl" />
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
                <dd className="mt-0.5 font-medium text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          {(href || g.steamAppId) && (
            <p className="mt-4 flex flex-wrap gap-2">
              {href && store && (
                <a href={href} target="_blank" rel="noreferrer" className={btnSecondary}>
                  {store.name ?? t("games.website")} <span aria-hidden>↗</span>
                </a>
              )}
              {g.steamAppId && (
                <a href={steamInstallUrl(g.steamAppId)} className={btnSecondary} title={t("games.installTitle")}>
                  <span aria-hidden>⤓</span> {t("games.install")}
                </a>
              )}
            </p>
          )}
        </Card>
      </Columns>
    </Page>
  );
}
