import { Card, Columns, Page, PageHeader } from "@/components/ui";
import { LanTypeForm } from "@/components/lan-type-form";
import { requirePlatform } from "@/lib/session";
import { getT } from "@/i18n/server";

export default async function NewLanTypePage() {
  await requirePlatform("types");
  const t = await getT();
  return (
    <Page>
      <PageHeader back={{ href: "/admin/types", label: t("clanPage.links.types") }} title={t("typePage.add")} />
      <Columns>
        <Card>
          <LanTypeForm
            values={{ name: "", description: "", location: "", websiteUrl: "", ticketUrl: "", price: "", durationHours: 46, profileUrl: "" }}
          />
        </Card>
      </Columns>
    </Page>
  );
}
