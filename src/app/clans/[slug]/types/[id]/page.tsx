import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteLanType } from "@/app/actions";
import { Card, Columns, Page, PageHeader, btnDanger } from "@/components/ui";
import { LanTypeForm } from "@/components/lan-type-form";
import { canManageClan, getClanBySlug } from "@/lib/clans";
import { requireUser } from "@/lib/session";

export default async function EditLanTypePage({ params }: PageProps<"/clans/[slug]/types/[id]">) {
  const { slug, id } = await params;
  const me = await requireUser();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!canManageClan(me, c.id)) redirect(`/clans/${slug}`);
  const t = db
    .select()
    .from(schema.lanType)
    .where(and(eq(schema.lanType.id, id), eq(schema.lanType.clanId, c.id)))
    .get();
  if (!t) notFound();
  return (
    <Page>
      <PageHeader back={{ href: `/clans/${c.slug}/settings?tab=types`, label: "LAN types" }} title={t.name} />
      <Columns
        aside={
          <Card title="Delete type">
            <p className="mb-3 text-sm text-muted">
              Events of this type are kept, but members&apos; nicks for this type are deleted.
            </p>
            <form action={deleteLanType.bind(null, t.id)}>
              <button className={btnDanger}>Delete {t.name}</button>
            </form>
          </Card>
        }
      >
      <Card>
        <LanTypeForm values={{ ...t, clanId: c.id, capacity: t.capacity?.toString() ?? "", answerDaysBefore: t.answerDaysBefore?.toString() ?? "" }} />
      </Card>
      </Columns>
    </Page>
  );
}
