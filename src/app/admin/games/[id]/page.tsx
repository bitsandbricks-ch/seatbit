import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, Columns, Page, PageHeader, btnDanger, btnSecondary, input } from "@/components/ui";
import { CatalogGameForm } from "@/components/catalog-game-form";
import { ActionForm } from "@/components/action-form";
import { deleteCatalogGame, mergeCatalogGame, refreshCatalogFromSteam, removeCatalogCover } from "@/app/game-catalog-actions";
import { allCatalogGames, coverUrl, getCatalogGame, steamLookupOn } from "@/lib/game-catalog";
import { fmtDate } from "@/lib/format";
import { personLabel } from "@/lib/names";
import { requirePlatform } from "@/lib/session";
import { getT } from "@/i18n/server";

export default async function EditCatalogGamePage({ params }: PageProps<"/admin/games/[id]">) {
  const { id } = await params;
  await requirePlatform("games");
  const t = await getT();
  const g = getCatalogGame(id);
  if (!g) notFound();
  const events = db
    .select({ id: schema.lan.id, name: schema.lan.name, startsAt: schema.lan.startsAt })
    .from(schema.game)
    .innerJoin(schema.lan, eq(schema.lan.id, schema.game.lanId))
    .where(eq(schema.game.catalogId, g.id))
    .orderBy(desc(schema.lan.startsAt))
    .all();
  const by = g.createdBy ? db.select().from(schema.user).where(eq(schema.user.id, g.createdBy)).get() : undefined;
  const others = allCatalogGames().filter((x) => x.id !== g.id);
  const cover = coverUrl(g);
  return (
    <Page>
      <PageHeader back={{ href: "/admin/games", label: t("gameCatalog.title") }} title={g.name} />
      <Columns
        aside={
          <>
            {cover && (
              <Card>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt="" className="w-full rounded object-cover" />
                <ActionForm action={removeCatalogCover.bind(null, g.id)} done="removed" className="mt-3">
                  <button className={btnSecondary}>{t("gameCatalog.removeCover")}</button>
                </ActionForm>
              </Card>
            )}
            {g.steamAppId && steamLookupOn() && (
              <Card title={t("gameCatalog.steam")}>
                {g.steamFetchedAt && <p className="mb-2 text-xs text-muted">{t("gameCatalog.fetched", { date: fmtDate(g.steamFetchedAt, t.locale) })}</p>}
                <p className="mb-3 text-sm text-muted">{t("gameCatalog.refreshHint")}</p>
                <ActionForm action={refreshCatalogFromSteam.bind(null, g.id)} success={t("gameCatalog.refreshed")}>
                  <button className={btnSecondary}>{t("gameCatalog.refresh")}</button>
                </ActionForm>
              </Card>
            )}
            <Card title={t("gameCatalog.usedOn")}>
              {events.length === 0 ? (
                <p className="text-sm text-muted">{t("gameCatalog.usedOnNone")}</p>
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
            {others.length > 0 && (
              <Card title={t("gameCatalog.merge")}>
                <p className="mb-3 text-sm text-muted">{t("gameCatalog.mergeHint")}</p>
                <ActionForm
                  action={mergeCatalogGame.bind(null, g.id)}
                  done={false}
                  className="flex flex-col gap-2"
                  confirm={{ title: t("gameCatalog.mergeQ", { name: g.name }), body: t("gameCatalog.mergeHint"), confirm: t("gameCatalog.mergeButton") }}
                >
                  <select name="into" required aria-label={t("gameCatalog.mergeInto")} className={input} defaultValue="">
                    <option value="" disabled>
                      {t("gameCatalog.mergeInto")}
                    </option>
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <button className={btnSecondary}>{t("gameCatalog.mergeButton")}</button>
                </ActionForm>
              </Card>
            )}
            <Card title={t("gameCatalog.delete")}>
              <p className="mb-3 text-sm text-muted">{t("gameCatalog.deleteHint")}</p>
              <ActionForm
                action={deleteCatalogGame.bind(null, g.id)}
                done="deleted"
                confirm={{ title: t("gameCatalog.deleteQ", { name: g.name }), body: t("gameCatalog.deleteHint"), confirm: t("dialog.delete"), danger: true }}
              >
                <button className={btnDanger} disabled={events.length > 0}>
                  {t("gameCatalog.deleteName", { name: g.name })}
                </button>
              </ActionForm>
            </Card>
          </>
        }
      >
        <Card>
          {by && <p className="mb-4 text-xs text-muted">{t("gameCatalog.addedBy", { name: personLabel(by) })}</p>}
          <CatalogGameForm
            values={{
              id: g.id,
              name: g.name,
              steamAppId: g.steamAppId,
              sizeGb: g.sizeGb,
              url: g.url,
              minPlayers: g.minPlayers,
              maxPlayers: g.maxPlayers,
              free: g.free,
              lan: g.lan,
            }}
          />
        </Card>
      </Columns>
    </Page>
  );
}
