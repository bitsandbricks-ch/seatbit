import { notFound, redirect } from "next/navigation";
import { Card, Columns, Page, PageHeader } from "@/components/ui";
import { LanTypeForm } from "@/components/lan-type-form";
import { clanCan, getClanBySlug } from "@/lib/clans";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";

export default async function NewLanTypePage({ params }: PageProps<"/clans/[slug]/types/new">) {
  const { slug } = await params;
  const me = await requireUser();
  const t = await getT();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!clanCan(me, c.id, "events")) redirect(`/clans/${slug}`);
  return (
    <Page>
      <PageHeader back={{ href: `/clans/${c.slug}/settings?tab=types`, label: t("clanPage.links.types") }} title={t("typePage.add")} />
      <Columns>
      <Card>
        <LanTypeForm
          values={{
            clanId: c.id,
            name: "",
            description: "",
            location: "",
            websiteUrl: "",
            ticketUrl: "",
            price: "",
            capacity: "",
            reminderDays: 3,
            seatSpec: "",
            durationHours: 46,
            answerDaysBefore: "30",
            discordMode: "channel",
            profileUrl: "",
          }}
        />
      </Card>
      </Columns>
    </Page>
  );
}
