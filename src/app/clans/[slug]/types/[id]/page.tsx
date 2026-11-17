import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, Columns, Page, PageHeader, btnDanger, btnSecondary } from "@/components/ui";
import { ClanTypeForm } from "@/components/lan-type-form";
import { clanCan, getClanBySlug } from "@/lib/clans";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";
import { clanType } from "@/lib/lan-types";
import { contactsOf, ensureDefaultTasks, tasksAt } from "@/lib/lead-tasks";
import { LeadTaskEditor } from "@/components/lead-task-editor";
import { LeadContactEditor } from "@/components/lead-contact-editor";
import { setClanLeadTasks } from "@/app/lead-task-actions";
import { removeClanType, saveClanType } from "@/app/lan-type-actions";
import { ActionForm } from "@/components/action-form";
import { platformCan } from "@/lib/platform-roles";

/** A global LAN type as one clan uses it: the clan's defaults, contacts and to-dos. */
export default async function ClanLanTypePage({ params }: PageProps<"/clans/[slug]/types/[id]">) {
  const { slug, id } = await params;
  const me = await requireUser();
  const t = await getT();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!clanCan(me, c.id, "events")) redirect(`/clans/${slug}`);
  const ty = clanType(c.id, id);
  if (!ty) notFound();
  ensureDefaultTasks(c.id);
  const contacts = contactsOf(c.id, ty.id);
  const own = tasksAt({ clanId: c.id, typeId: ty.id });
  const clanWide = ty.clanLeadTasks ? tasksAt({ clanId: c.id }) : [];
  const facts = [ty.location, ty.price, t("lanTypes.hours", { count: ty.durationHours })].filter(Boolean).join(" · ");
  return (
    <Page>
      <PageHeader back={{ href: `/clans/${c.slug}/settings?tab=types`, label: t("clanPage.links.types") }} title={ty.name} subtitle={facts} />
      <Columns
        aside={
          <>
            <Card title={t("lanTypes.aboutTitle")}>
              <p className="mb-3 text-sm text-muted">{ty.description || t("lanTypes.aboutHint")}</p>
              <ul className="space-y-1 text-sm">
                {ty.websiteUrl && (
                  <li>
                    <a href={ty.websiteUrl} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                      {t("lanForm.website")}
                    </a>
                  </li>
                )}
                {ty.ticketUrl && (
                  <li>
                    <a href={ty.ticketUrl} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                      {t("bot.ticketShop")}
                    </a>
                  </li>
                )}
              </ul>
              <p className="mt-3 text-xs text-faint">{t("lanTypes.globalNote")}</p>
              {platformCan(me, "types") && (
                <Link href={`/admin/types/${ty.id}`} className={`${btnSecondary} mt-3`}>
                  {t("lanTypes.editGlobal")}
                </Link>
              )}
            </Card>
            {ty.used && (
              <Card title={t("lanTypes.remove")}>
                <p className="mb-3 text-sm text-muted">{t("lanTypes.removeHint")}</p>
                <ActionForm
                  action={removeClanType.bind(null, c.id, ty.id)}
                  done="removed"
                  confirm={{ title: t("lanTypes.removeQ", { name: ty.name }), body: t("lanTypes.removeHint"), confirm: t("lanTypes.removeConfirm"), danger: true }}
                >
                  <button className={btnDanger}>{t("lanTypes.removeName", { name: ty.name })}</button>
                </ActionForm>
              </Card>
            )}
          </>
        }
      >
        <Card title={t("lanTypes.clanDefaults")}>
          <p className="mb-4 text-sm text-muted">{t(ty.used ? "lanTypes.clanDefaultsHint" : "lanTypes.notUsedHint")}</p>
          <ClanTypeForm
            action={saveClanType.bind(null, c.id, ty.id)}
            values={{
              capacity: ty.capacity?.toString() ?? "",
              reminderDays: ty.reminderDays,
              seatSpec: ty.seatSpec,
              answerDaysBefore: ty.answerDaysBefore?.toString() ?? "",
              discordMode: ty.discordMode,
            }}
          />
        </Card>
        <Card id="contacts" title={t("contacts.heading")}>
          <p className="mb-3 text-sm text-muted">{t("contacts.hint")}</p>
          <LeadContactEditor
            clanId={c.id}
            typeId={ty.id}
            contacts={contacts.map(({ id, name, role, email, discord, phone, url, note }) => ({ id, name, role, email, discord, phone, url, note }))}
          />
        </Card>
        <Card id="lead-tasks" title={t("leadTasks.typeHeading")}>
          <p className="mb-3 text-sm text-muted">{t("leadTasks.typeHint")}</p>
          <ActionForm action={setClanLeadTasks.bind(null, c.id, ty.id)} auto="toggles" className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="on" defaultChecked={ty.clanLeadTasks} className="accent-bit" />
              {t("leadTasks.useClanTasks")}
            </label>
            <Link href={`/clans/${c.slug}/settings?tab=types#lead-tasks`} className="text-bit hover:underline">
              {t("leadTasks.editClan")}
            </Link>
          </ActionForm>
          <LeadTaskEditor
            scope={{ clanId: c.id, typeId: ty.id }}
            tasks={own.map(({ id, title, note, after, dueDays, contactId }) => ({ id, title, note, after, dueDays, contactId }))}
            depTasks={[...clanWide, ...own].map((x) => ({ id: x.id, title: x.title }))}
            contacts={contacts.map((x) => ({ id: x.id, name: x.name }))}
          />
        </Card>
      </Columns>
    </Page>
  );
}
