import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { setUserRole } from "@/app/actions";
import { Card, Page, PageHeader, Pill, btnGhost, btnSecondary } from "@/components/ui";
import { ClanAvatar } from "@/components/clan-avatar";
import { fmtDay } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export default async function AdminPage() {
  const me = await requireAdmin();
  const lans = db
    .select()
    .from(schema.lan)
    .orderBy(desc(schema.lan.startsAt))
    .all();
  const users = db.select().from(schema.user).orderBy(schema.user.name).all();
  const clans = db.select().from(schema.clan).orderBy(schema.clan.name).all();
  const members = db.select().from(schema.clanMember).all();
  const att = db.select().from(schema.attendance).all();
  const now = new Date();

  return (
    <Page>
      <PageHeader
        title="Platform admin"
        subtitle="All clans, events and users on this Seatbit. Clan admins manage their own clan."
        actions={
          <Link href="/admin/settings" className={btnSecondary}>
            Platform settings
          </Link>
        }
      />
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Clans" value={clans.length} />
        <Stat label="Upcoming" value={lans.filter((l) => l.endsAt >= now).length} />
        <Stat label="Users" value={users.filter((u) => !u.isGuest).length} hint={`${users.filter((u) => u.isGuest).length} guests`} />
      </div>

      <Card title={`Clans (${clans.length})`}>
        {clans.length === 0 ? (
          <p className="text-sm text-muted">No clans yet.</p>
        ) : (
          <ul className="-my-1 divide-y divide-line">
            {clans.map((c) => (
              <li key={c.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <Link href={`/clans/${c.slug}`} className="flex min-w-0 items-center gap-2.5 font-medium hover:text-bit">
                  <ClanAvatar clan={c} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate">{c.name}</span>
                    <span className="block text-xs font-normal text-muted">
                      {members.filter((m) => m.clanId === c.id && m.role !== "pending").length} members
                    </span>
                  </span>
                </Link>
                <Link href={`/clans/${c.slug}/settings`} className={`${btnGhost} shrink-0`}>
                  Settings
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`LANs (${lans.length})`}>
        {lans.length === 0 ? (
          <p className="text-sm text-muted">No LANs yet. Clan admins add them from their clan page.</p>
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
                        {isPast && <span className="ml-2 text-xs font-normal text-faint">past</span>}
                      </span>
                      <span className="block text-xs text-muted">
                        {fmtDay(l.startsAt)} · {clans.find((c) => c.id === l.clanId)?.name ?? "No clan"}
                      </span>
                    </span>
                    <span className="flex gap-1.5">
                      <Pill>
                        {going.length}
                        {l.capacity ? ` / ${l.capacity}` : ""} going
                      </Pill>
                      {noTicket ? <Pill tone="red">{noTicket} no ticket</Pill> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={`Users (${users.length})`}>
        <ul className="-my-1 divide-y divide-line">
          {users.map((u) => (
            <li key={u.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{u.name}</span>
                  {u.role === "admin" ? <Pill tone="emerald">admin</Pill> : u.isGuest ? <Pill>guest</Pill> : null}
                </span>
                <span className="block truncate text-xs text-muted">{u.isGuest ? "Guest, no login yet" : u.email}</span>
              </span>
              {u.id !== me.id && !u.isGuest && (
                <form action={setUserRole.bind(null, u.id, u.role === "admin" ? "member" : "admin")} className="shrink-0">
                  <button className={btnGhost}>{u.role === "admin" ? "Remove admin" : "Make admin"}</button>
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
