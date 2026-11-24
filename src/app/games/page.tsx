import Link from "next/link";
import { Card, Page, PageHeader, btnSecondary } from "@/components/ui";
import { GameCover } from "@/components/game-cover";
import { getT } from "@/i18n/server";
import { allCatalogGames, coverUrl, gameColor } from "@/lib/game-catalog";
import { platformCan } from "@/lib/platform-roles";
import { requireUser } from "@/lib/session";

export async function generateMetadata() {
  return { title: `${(await getT())("gameCatalog.title")} · Seatbit` };
}

/** The game catalog for everyone signed in, read-only. Platform staff edit it under Admin → Games. */
export default async function GamesPage() {
  const me = await requireUser({ next: "/games" });
  const t = await getT();
  const games = allCatalogGames();
  return (
    <Page>
      <PageHeader
        title={t("gameCatalog.title")}
        subtitle={t("gameCatalog.publicSubtitle")}
        actions={
          platformCan(me, "games") ? (
            <Link href="/admin/games" className={btnSecondary}>
              {t("gameCatalog.manage")}
            </Link>
          ) : undefined
        }
      />
      {games.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t("gameCatalog.empty")}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {games.map((g) => (
            <li key={g.id}>
              <Link href={`/games/${g.id}`} className="block rounded-card border border-line bg-surface p-2 transition hover:border-bit/60">
                <GameCover name={g.name} cover={coverUrl(g)} color={gameColor(g.id)} className="w-full" />
                <span className="mt-2 block truncate px-1 font-semibold text-fg">{g.name}</span>
                <span className="block truncate px-1 pb-1 text-sm text-muted">
                  {[g.sizeGb != null ? `${g.sizeGb} GB` : null, t("gameCatalog.usage", { count: g.events })].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
