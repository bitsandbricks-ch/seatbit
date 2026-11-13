import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { setUserRole } from "@/app/actions";
import { Card, Notice, Page, PageHeader, Pill, btnGhost, btnSecondary } from "@/components/ui";
import { ClanAvatar } from "@/components/clan-avatar";
import { lanDay } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { getLegal } from "@/lib/legal";
import { donationsEnabled } from "@/lib/donations";
import { getDefaultNames } from "@/lib/lans";
import { getT } from "@/i18n/server";

export default async function AdminPage() {
  const me = await requireAdmin();
  const t = await getT();
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
            <Link href="/admin/health" className={btnSecondary}>
              {t("health.title")}
            </Link>
            <Link href="/admin/log" className={btnSecondary}>
              {t("clanHeader.log")}
            </Link>
            {donationsEnabled() && (
              <Link href="/admin/donations" className={btnSecondary}>
                {t("adminDonations.title")}
              </Link>
            )}
            <Link href="/admin/settings" className={btnSecondary}>
              {t("clanSettings.platformSettings")}
            </Link>
          </>
        }
      />
      {!getLegal().complete && (
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
                    <span className="block truncate">{c.name}</span>
                    <span className="block text-xs font-normal text-muted">
                      {t("common.members", { count: members.filter((m) => m.clanId === c.id && m.role !== "pending").length })}
                    </span>
                  </span>
                </Link>
                <Link href={`/clans/${c.slug}/settings`} className={`${btnGhost} shrink-0`}>
                  {t("admin.settings")}
                </Link>
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
                    href={`/lans/${l.id}/manage`}
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
          {users.map((u) => (
            <li key={u.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{people.get(u.id)?.full ?? u.name}</span>
                  {u.role === "admin" ? <Pill tone="emerald">{t("admin.admin")}</Pill> : u.isGuest ? <Pill>{t("clanSettings.guest")}</Pill> : null}
                </span>
                <span className="block truncate text-xs text-muted">{u.isGuest ? t("admin.guestNoLogin") : u.email}</span>
              </span>
              {u.id !== me.id && !u.isGuest && (
                <form action={setUserRole.bind(null, u.id, u.role === "admin" ? "member" : "admin")} className="shrink-0">
                  <button className={btnGhost}>{t(u.role === "admin" ? "admin.removeAdmin" : "admin.makeAdmin")}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </Page>
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
