import Link from "next/link";
import { Card, Page, PageHeader, btnPrimary } from "@/components/ui";
import { getT } from "@/i18n/server";
import { allCatalogGames, coverUrl } from "@/lib/game-catalog";
import { requirePlatform } from "@/lib/session";

export async function generateMetadata() {
  return { title: `${(await getT())("gameCatalog.title")} · Seatbit` };
}

/** The global game catalog. Platform staff with the "games" permission keep it tidy. */
export default async function AdminGamesPage() {
  await requirePlatform("games");
  const t = await getT();
  const games = allCatalogGames();
  return (
    <Page>
      <PageHeader
        title={t("gameCatalog.title")}
        subtitle={t("gameCatalog.subtitle")}
        actions={
          <Link href="/admin/games/new" className={btnPrimary}>
            {t("gameCatalog.add")}
          </Link>
        }
      />
      <Card>
        {games.length === 0 ? (
          <p className="text-sm text-muted">{t("gameCatalog.empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {games.map((g) => {
              const cover = coverUrl(g);
              return (
                <li key={g.id}>
                  <Link href={`/admin/games/${g.id}`} className="flex min-h-12 items-center gap-3 py-2 hover:text-bit">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" loading="lazy" className="h-8 w-[69px] shrink-0 rounded object-cover" />
                    ) : (
                      <span aria-hidden className="h-8 w-[69px] shrink-0 rounded bg-raised" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{g.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {[g.sizeGb != null ? `${g.sizeGb} GB` : null, g.steamAppId ? t("gameCatalog.steam") : null].filter(Boolean).join(" · ") ||
                          t("gameCatalog.noDetails")}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-faint">{t("gameCatalog.usage", { count: g.events })}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Page>
  );
}
