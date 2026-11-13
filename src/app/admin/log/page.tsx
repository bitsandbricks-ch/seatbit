import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { AuditLog, auditQuery, parseAuditFilter } from "@/components/audit-log";
import { Card, Page, PageHeader } from "@/components/ui";
import { auditEntries } from "@/lib/audit";
import { requirePlatform } from "@/lib/session";
import { getT } from "@/i18n/server";

/** Platform admins: the audit log of every clan plus platform-wide changes (settings, platform roles, deleted accounts). */
export default async function AdminLogPage({ searchParams }: PageProps<"/admin/log">) {
  await requirePlatform("view");
  const t = await getT();
  const filter = parseAuditFilter(await searchParams);
  const clans = db.select({ id: schema.clan.id, name: schema.clan.name }).from(schema.clan).orderBy(asc(schema.clan.name)).all();
  const { rows, total, page, pages } = auditEntries({
    clanId: filter.clan === "none" ? null : filter.clan || undefined,
    group: filter.group,
    page: filter.page,
  });
  return (
    <Page>
      <PageHeader
        title={t("clanHeader.log")}
        subtitle={t("adminLog.subtitle")}
      />
      <Card>
        <AuditLog
          t={t}
          rows={rows}
          total={total}
          page={page}
          pages={pages}
          filter={filter}
          href={(f) => `/admin/log?${auditQuery(f)}`}
          clans={clans}
          clanNames={new Map(clans.map((c) => [c.id, c.name]))}
        />
      </Card>
    </Page>
  );
}
