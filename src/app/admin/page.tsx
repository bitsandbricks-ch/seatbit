import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { setPlatformRole, suspendClanAction, suspendUserAction, unsuspendClanAction, unsuspendUserAction } from "@/app/moderation-actions";
import { Card, Notice, Page, PageHeader, Pill, btnDanger, btnGhost, btnSecondary, input } from "@/components/ui";
import { ClanAvatar } from "@/components/clan-avatar";
import { lanDay } from "@/lib/format";
import { requirePlatform } from "@/lib/session";
import { STAFF_ROLES, assignableRoles, canSetRole, isStaff, outranks, platformCan } from "@/lib/platform-roles";
import { openReportCount } from "@/lib/reports";
import type { T } from "@/i18n/translate";
import { getLegal } from "@/lib/legal";
import { getDefaultNames } from "@/lib/lans";
import { getT } from "@/i18n/server";

export default async function AdminPage() {
  const me = await requirePlatform("view");
  const t = await getT();
  const can = {
    settings: platformCan(me, "settings"),
    clans: platformCan(me, "clans"),
    reports: platformCan(me, "reports"),
    suspend: platformCan(me, "suspend"),
  };
  const roles = assignableRoles(me);
  const openReports = can.reports ? openReportCount() : 0;
  const lans = db
    .select()
    .from(schema.lan)
    .orderBy(desc(schema.lan.startsAt))
    .all();
  const allUsers = db.select().from(schema.user).orderBy(schema.user.name).all();
  // Deleted accounts only stay as empty rows for past events; they aren't users any more.
  const users = allUsers.filter((u) => !u.deletedAt);
  const deleted = allUsers.length - users.length;
  const people = getDefaultNames(users.map((u) => u.id));
  const clans = db.select().from(schema.clan).orderBy(schema.clan.name).all();
  const members = db.select().from(schema.clanMember).all();
  const att = db.select().from(schema.attendance).all();
  const now = new Date();

  return (
    <Page>
      <PageHeader
        title={t("adminLog.platformAdmin")}
        subtitle={t("admin.subtitle")}
        actions={
          <>
            {can.reports && (
              <Link href="/admin/reports" className={btnSecondary}>
                {t("moderation.reports")}
                {openReports > 0 && <Pill tone="red">{openReports}</Pill>}
              </Link>
            )}
            <Link href="/admin/log" className={btnSecondary}>
              {t("clanHeader.log")}
            </Link>
            {can.settings && (
              <Link href="/admin/settings" className={btnSecondary}>
                {t("clanSettings.platformSettings")}
              </Link>
            )}
          </>
        }
      >
        <p className="text-sm text-muted">
          {t("platformRoles.you", { role: t(`platformRoles.name.${me.role as (typeof STAFF_ROLES)[number]}`) })}{" "}
          {t(`platformRoles.info.${me.role as (typeof STAFF_ROLES)[number]}`)}
        </p>
      </PageHeader>
      {can.settings && !getLegal().complete && (
        <Notice tone="warn">
          {t.rich("admin.legalMissing", {
            link: (
              <Link href="/admin/settings?tab=legal" className="underline">
                {t("admin.legalLink")}
              </Link>
            ),
          })}
        </Notice>
      )}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label={t("admin.clans")} value={clans.length} />
        <Stat label={t("clanPage.upcoming")} value={lans.filter((l) => l.endsAt >= now).length} />
        <Stat
          label={t("admin.users")}
          value={users.filter((u) => !u.isGuest).length}
          hint={`${t("admin.guests", { count: users.filter((u) => u.isGuest).length })}${deleted ? ` · ${t("admin.deleted", { count: deleted })}` : ""}`}
        />
      </div>

      <Card title={`${t("admin.clans")} (${clans.length})`}>
        {clans.length === 0 ? (
          <p className="text-sm text-muted">{t("admin.noClans")}</p>
        ) : (
          <ul className="-my-1 divide-y divide-line">
            {clans.map((c) => (
              <li key={c.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <Link href={`/clans/${c.slug}`} className="flex min-w-0 items-center gap-2.5 font-medium hover:text-bit">
                  <ClanAvatar clan={c} size={28} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate">{c.name}</span>
                      {c.suspendedAt && <Pill tone="red">{t("moderation.suspended")}</Pill>}
                    </span>
                    <span className="block text-xs font-normal text-muted">
                      {t("common.members", { count: members.filter((m) => m.clanId === c.id && m.role !== "pending").length })}
                    </span>
                  </span>
                </Link>
                <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  {can.clans && (
                    <Link href={`/clans/${c.slug}/settings`} className={btnGhost}>
                      {t("admin.settings")}
                    </Link>
                  )}
                  {can.suspend &&
                    (c.suspendedAt ? (
                      <form action={unsuspendClanAction.bind(null, c.id)}>
                        <button className={btnGhost}>{t("moderation.restore")}</button>
                      </form>
                    ) : (
                      <SuspendForm t={t} action={suspendClanAction.bind(null, c.id)} label={t("moderation.suspendClan", { name: c.name })} />
                    ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`LANs (${lans.length})`}>
        {lans.length === 0 ? (
          <p className="text-sm text-muted">{t("admin.noLans")}</p>
        ) : (
          <ul className="-my-1 divide-y divide-line">
            {lans.map((l) => {
              const a = att.filter((x) => x.lanId === l.id);
              const going = a.filter((x) => x.status === "going");
              const noTicket = l.paymentDueDate ? going.filter((x) => !x.paid && !x.ticketBought).length : null;
              const isPast = l.endsAt < now;
              return (
                <li key={l.id}>
                  <Link
                    href={can.clans ? `/lans/${l.id}/manage` : `/lans/${l.id}`}
                    className={`-mx-2 flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-2 py-2 transition hover:bg-raised/60 ${isPast ? "opacity-60" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {l.name}
                        {isPast && <span className="ml-2 text-xs font-normal text-faint">{t("admin.past")}</span>}
                      </span>
                      <span className="block text-xs text-muted">
                        {lanDay(l, t.locale)} · {clans.find((c) => c.id === l.clanId)?.name ?? t("admin.noClan")}
                      </span>
                    </span>
                    <span className="flex gap-1.5">
                      <Pill>
                        {t("admin.going", { n: `${going.length}${l.capacity ? ` / ${l.capacity}` : ""}` })}
                      </Pill>
                      {noTicket ? <Pill tone="red">{t("admin.noTicket", { count: noTicket })}</Pill> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={`${t("admin.users")} (${users.length})`}>
        <ul className="-my-1 divide-y divide-line">
          {users.map((u) => {
            const name = people.get(u.id)?.full ?? u.name;
            const login = !u.isGuest;
            return (
              <li key={u.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{name}</span>
                    {isStaff(u) ? (
                      <Pill tone="emerald">{t(`platformRoles.name.${u.role as (typeof STAFF_ROLES)[number]}`)}</Pill>
                    ) : u.isGuest ? (
                      <Pill>{t("clanSettings.guest")}</Pill>
                    ) : null}
                    {u.suspendedAt && <Pill tone="red">{t("moderation.suspended")}</Pill>}
                  </span>
                  <span className="block truncate text-xs text-muted">{u.isGuest ? t("admin.guestNoLogin") : u.email}</span>
                </span>
                {login && u.id !== me.id && (
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {canSetRole(me, u) && (
                      <form action={setPlatformRole.bind(null, u.id)} className="flex items-center gap-1">
                        <select
                          name="role"
                          defaultValue={u.role}
                          aria-label={t("platformRoles.roleOf", { name })}
                          className={`${input} !w-auto !py-1.5 text-sm`}
                        >
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {t(`platformRoles.name.${r}`)}
                            </option>
                          ))}
                        </select>
                        <button className={btnGhost}>{t("common.save")}</button>
                      </form>
                    )}
                    {can.suspend &&
                      outranks(me, u) &&
                      (u.suspendedAt ? (
                        <form action={unsuspendUserAction.bind(null, u.id)}>
                          <button className={btnGhost}>{t("moderation.restore")}</button>
                        </form>
                      ) : (
                        <SuspendForm t={t} action={suspendUserAction.bind(null, u.id)} label={t("moderation.suspendUser", { name })} />
                      ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={t("platformRoles.title")}>
        <dl className="space-y-2 text-sm">
          {STAFF_ROLES.map((r) => (
            <div key={r}>
              <dt className="font-medium">{t(`platformRoles.name.${r}`)}</dt>
              <dd className="text-muted">{t(`platformRoles.info.${r}`)}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </Page>
  );
}

/** "Suspend" that opens a reason field first, so nobody suspends by a stray tap. */
function SuspendForm({ t, action, label }: { t: T; action: (form: FormData) => Promise<void>; label: string }) {
  return (
    <details className="group">
      <summary className={`${btnGhost} cursor-pointer list-none !text-danger`}>{t("moderation.suspend")}</summary>
      <form action={action} className="mt-2 w-64 max-w-full space-y-2 rounded-card border border-line bg-surface p-3 text-left text-sm">
        <p className="font-medium">{label}</p>
        <input name="reason" className={input} placeholder={t("moderation.reasonPlaceholder")} maxLength={500} />
        <button className={btnDanger}>{t("moderation.suspend")}</button>
      </form>
    </details>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
