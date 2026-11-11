import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { setUserRole } from "@/app/actions";
import { Card, Pill, btnGhost, btnPrimary } from "@/components/ui";
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Platform admin</h1>
          <p className="text-sm text-zinc-400">All clans, events and users on this Seatbit. Clan admins manage their own clan.</p>
        </div>
        <Link href="/admin/settings" className={btnGhost}>
          Platform settings
        </Link>
      </div>
      <Card title={`Clans (${clans.length})`}>
        <ul className="divide-y divide-line">
          {clans.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2">
              <Link href={`/clans/${c.slug}`} className="font-medium hover:text-bit">
                {c.name}
              </Link>
              <span className="flex gap-2 text-sm">
                <span className="text-zinc-500">{members.filter((m) => m.clanId === c.id && m.role !== "pending").length} members</span>
                <Link href={`/clans/${c.slug}/settings`} className="text-zinc-400 hover:text-zinc-200">
                  Settings
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card
        title="LANs"
        actions={
          <Link href="/clans" className={btnPrimary}>
            Clans
          </Link>
        }
      >
        {lans.length === 0 ? (
          <p className="text-sm text-zinc-400">No LANs yet.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="py-2">Name</th>
                  <th>Date</th>
                  <th>Going</th>
                  <th>No ticket</th>
                  <th>Clan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {lans.map((l) => {
                  const a = att.filter((x) => x.lanId === l.id);
                  const going = a.filter((x) => x.status === "going");
                  return (
                    <tr key={l.id}>
                      <td className="py-2">
                        <Link
                          href={`/lans/${l.id}/manage`}
                          className="font-medium hover:text-bit"
                        >
                          {l.name}
                        </Link>
                        {l.endsAt < now && (
                          <span className="ml-2 text-xs text-zinc-500">
                            past
                          </span>
                        )}
                      </td>
                      <td>{fmtDay(l.startsAt)}</td>
                      <td>
                        {going.length}
                        {l.capacity ? ` / ${l.capacity}` : ""}
                      </td>
                      <td>
                        {l.paymentDueDate
                          ? going.filter((x) => !x.paid && !x.ticketBought)
                              .length
                          : "—"}
                      </td>
                      <td className="text-zinc-400">{clans.find((c) => c.id === l.clanId)?.name ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Members (${users.length})`}>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-2">Name</th>
                <th>Email</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2">{u.name}</td>
                  <td className="text-zinc-400">{u.email}</td>
                  <td>
                    {u.role === "admin" ? (
                      <Pill tone="emerald">admin</Pill>
                    ) : (
                      <Pill>member</Pill>
                    )}
                  </td>
                  <td className="text-right">
                    {u.id !== me.id && (
                      <form
                        action={setUserRole.bind(
                          null,
                          u.id,
                          u.role === "admin" ? "member" : "admin",
                        )}
                      >
                        <button className={`${btnGhost} text-xs`}>
                          {u.role === "admin" ? "Remove admin" : "Make admin"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
