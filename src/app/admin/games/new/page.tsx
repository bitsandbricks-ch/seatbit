import { Card, Columns, Page, PageHeader } from "@/components/ui";
import { CatalogGameForm } from "@/components/catalog-game-form";
import { requirePlatform } from "@/lib/session";
import { getT } from "@/i18n/server";

export default async function NewCatalogGamePage() {
  await requirePlatform("games");
  const t = await getT();
  return (
    <Page>
      <PageHeader back={{ href: "/admin/games", label: t("gameCatalog.title") }} title={t("gameCatalog.add")} />
      <Columns>
        <Card>
          <CatalogGameForm
            values={{ name: "", steamAppId: null, sizeGb: null, url: "", minPlayers: null, maxPlayers: null, free: null, lan: null }}
          />
        </Card>
      </Columns>
    </Page>
  );
}
