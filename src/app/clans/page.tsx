import Link from "next/link";
import { asc, count as countRows, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { joinClan } from "@/app/clan-actions";
import { ClanAvatar } from "@/components/clan-avatar";
import { ClanForm } from "@/components/clan-form";
import { Card, Columns, EmptyState, Page, PageHeader, Pill, btnPrimary, btnSecondary } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { CLAN_MANAGE_TABS } from "@/components/clan-header";
import { RolePill } from "@/components/role-pill";
import { MANAGE_TAB_PERMS, roleCan } from "@/lib/clan-roles";
import { getT } from "@/i18n/server";
import { ActionForm } from "@/components/action-form";

export default async function ClansPage() {
  const me = await requireUser();
  const t = await getT();
  const clans = db.select().from(schema.clan).orderBy(asc(schema.clan.name)).all();
  const { clanMember } = schema;
  const mine = new Map(
    db.select({ clanId: clanMember.clanId, role: clanMember.role }).from(clanMember).where(eq(clanMember.userId, me.id)).all().map((m) => [m.clanId, m.role]),
  );
  const sizes = new Map(
    db
      .select({ clanId: clanMember.clanId, n: countRows() })
      .from(clanMember)
      .where(ne(clanMember.role, "pending"))
      .groupBy(clanMember.clanId)
      .all()
      .map((r) => [r.clanId, r.n]),
  );
  const count = (id: string) => sizes.get(id) ?? 0;

  const myClans = clans.filter((c) => mine.get(c.id) && mine.get(c.id) !== "pending");
  const others = clans.filter((c) => !myClans.includes(c));

  return (
    <Page>
      <PageHeader title={t("clans.title")} subtitle={t("clans.subtitle")} />
      <Columns
        aside={
          <Card title={t("clans.start")}>
            <p className="mb-4 text-sm text-muted">{t("clans.startText")}</p>
            <ClanForm />
          </Card>
        }
      >
      {myClans.length === 0 && others.length === 0 && (
        <EmptyState icon="users" title={t("clans.emptyTitle")}>
          {t("clans.emptyText")}
        </EmptyState>
      )}
      {myClans.length > 0 && (
        <Card title={t("clans.yours")}>
          <ul className="space-y-2">
            {myClans.map((c) => (
              <li key={c.id} className="-mx-2 flex items-center gap-2">
                <Link href={`/clans/${c.slug}`} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md p-2 transition hover:bg-raised">
                  <ClanAvatar clan={c} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="text-xs text-muted">{t("common.members", { count: count(c.id) })}</span>
                  </span>
                  <RolePill role={mine.get(c.id)} />
                </Link>
                {CLAN_MANAGE_TABS.some((t) => roleCan(mine.get(c.id), MANAGE_TAB_PERMS[t])) && (
                  <Link href={`/clans/${c.slug}/settings`} className={`${btnSecondary} shrink-0 !text-bit`}>
                    {t("common.manage")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {others.length > 0 && (
        <Card title={t("clans.others")}>
          <ul className="space-y-2">
            {others.map((c) => {
              const pending = mine.get(c.id) === "pending";
              return (
                <li key={c.id} className="-mx-2 flex min-h-14 items-center gap-3 p-2">
                  <ClanAvatar clan={c} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="text-xs text-muted">{t("common.members", { count: count(c.id) })}</span>
                  </span>
                  {pending ? (
                    <Pill tone="amber">{t("clans.requestSent")}</Pill>
                  ) : c.joinPolicy === "invite" ? (
                    <Pill>{t("clans.inviteOnly")}</Pill>
                  ) : (
                    <ActionForm action={joinClan.bind(null, c.id)} done={false}>
                      <button className={c.joinPolicy === "open" ? btnPrimary : btnSecondary}>
                        {c.joinPolicy === "open" ? t("clans.join") : t("clans.askToJoin")}
                      </button>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      </Columns>
    </Page>
  );
}
