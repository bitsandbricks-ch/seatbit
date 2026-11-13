import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteLanType } from "@/app/actions";
import { Card, Columns, Page, PageHeader, btnDanger } from "@/components/ui";
import { LanTypeForm } from "@/components/lan-type-form";
import { clanCan, getClanBySlug } from "@/lib/clans";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";

export default async function EditLanTypePage({ params }: PageProps<"/clans/[slug]/types/[id]">) {
  const { slug, id } = await params;
  const me = await requireUser();
  const t = await getT();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!clanCan(me, c.id, "events")) redirect(`/clans/${slug}`);
  const ty = db
    .select()
    .from(schema.lanType)
    .where(and(eq(schema.lanType.id, id), eq(schema.lanType.clanId, c.id)))
    .get();
  if (!ty) notFound();
  return (
    <Page>
      <PageHeader back={{ href: `/clans/${c.slug}/settings?tab=types`, label: t("clanPage.links.types") }} title={ty.name} />
      <Columns
        aside={
          <Card title={t("typePage.delete")}>
            <p className="mb-3 text-sm text-muted">{t("typePage.deleteHint")}</p>
            <form action={deleteLanType.bind(null, ty.id)}>
              <button className={btnDanger}>{t("typePage.deleteName", { name: ty.name })}</button>
            </form>
          </Card>
        }
      >
      <Card>
        <LanTypeForm values={{ ...ty, clanId: c.id, capacity: ty.capacity?.toString() ?? "", answerDaysBefore: ty.answerDaysBefore?.toString() ?? "" }} />
      </Card>
      </Columns>
    </Page>
  );
}
