import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteLanType } from "@/app/actions";
import Link from "next/link";
import { Card, Columns, Page, PageHeader, btnDanger, btnSecondary } from "@/components/ui";
import { LanTypeForm } from "@/components/lan-type-form";
import { clanCan, getClanBySlug } from "@/lib/clans";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";
import { contactsOf, ensureDefaultTasks, tasksAt } from "@/lib/lead-tasks";
import { LeadTaskEditor } from "@/components/lead-task-editor";
import { LeadContactEditor } from "@/components/lead-contact-editor";
import { setClanLeadTasks } from "@/app/lead-task-actions";
import { ActionForm } from "@/components/action-form";

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
  ensureDefaultTasks(c.id);
  const contacts = contactsOf(ty.id);
  const own = tasksAt({ clanId: c.id, typeId: ty.id });
  const clanWide = ty.clanLeadTasks ? tasksAt({ clanId: c.id }) : [];
  return (
    <Page>
      <PageHeader back={{ href: `/clans/${c.slug}/settings?tab=types`, label: t("clanPage.links.types") }} title={ty.name} />
      <Columns
        aside={
          <Card title={t("typePage.delete")}>
            <p className="mb-3 text-sm text-muted">{t("typePage.deleteHint")}</p>
            <ActionForm action={deleteLanType.bind(null, ty.id)} done="deleted">
              <button className={btnDanger}>{t("typePage.deleteName", { name: ty.name })}</button>
            </ActionForm>
          </Card>
        }
      >
      <Card>
        <LanTypeForm values={{ ...ty, clanId: c.id, capacity: ty.capacity?.toString() ?? "", answerDaysBefore: ty.answerDaysBefore?.toString() ?? "" }} />
      </Card>
      <Card id="contacts" title={t("contacts.heading")}>
        <p className="mb-3 text-sm text-muted">{t("contacts.hint")}</p>
        <LeadContactEditor typeId={ty.id} contacts={contacts.map(({ id, name, role, email, discord, phone, url, note }) => ({ id, name, role, email, discord, phone, url, note }))} />
      </Card>
      <Card id="lead-tasks" title={t("leadTasks.typeHeading")}>
        <p className="mb-3 text-sm text-muted">{t("leadTasks.typeHint")}</p>
        <ActionForm action={setClanLeadTasks.bind(null, ty.id)} className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="on" defaultChecked={ty.clanLeadTasks} className="accent-bit" />
            {t("leadTasks.useClanTasks")}
          </label>
          <button className={btnSecondary}>{t("leadTasks.useClanTasksSave")}</button>
          <Link href={`/clans/${c.slug}/settings?tab=types#lead-tasks`} className="text-bit hover:underline">
            {t("leadTasks.editClan")}
          </Link>
        </ActionForm>
        <LeadTaskEditor
          scope={{ typeId: ty.id }}
          tasks={own.map(({ id, title, note, after, dueDays, contactId }) => ({ id, title, note, after, dueDays, contactId }))}
          depTasks={[...clanWide, ...own].map((x) => ({ id: x.id, title: x.title }))}
          contacts={contacts.map((x) => ({ id: x.id, name: x.name }))}
        />
      </Card>
      </Columns>
    </Page>
  );
}
