import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { setUserRole } from "@/app/actions";
import { Card, Pill, btnGhost, btnPrimary } from "@/components/ui";
import { fmtDay } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export default async function AdminPage() {
  const me = await requireAdmin();
  const lans = db.select().from(schema.lan).orderBy(desc(schema.lan.startsAt)).all();
  const users = db.select().from(schema.user).orderBy(schema.user.name).all();
  const att = db.select().from(schema.attendance).all();
  const now = new Date();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin</h1>
      <Card
        title="LANs"
        actions={
          <Link href="/admin/lans/new" className={btnPrimary}>
            Add LAN
          </Link>
        }
      >
        {lans.length === 0 ? (
          <p className="text-sm text-zinc-400">No LANs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-2">Name</th>
                <th>Date</th>
                <th>Going</th>
                <th>No ticket</th>
                <th>No answer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {lans.map((l) => {
                const a = att.filter((x) => x.lanId === l.id);
                const going = a.filter((x) => x.status === "going");
                const answered = new Set(a.filter((x) => x.status !== "maybe").map((x) => x.userId));
                return (
                  <tr key={l.id}>
                    <td className="py-2">
                      <Link href={`/lans/${l.id}/manage`} className="font-medium hover:text-emerald-400">
                        {l.name}
                      </Link>
                      {l.endsAt < now && <span className="ml-2 text-xs text-zinc-500">past</span>}
                    </td>
                    <td>{fmtDay(l.startsAt)}</td>
                    <td>
                      {going.length}
                      {l.capacity ? ` / ${l.capacity}` : ""}
                    </td>
                    <td>{l.paymentDueDate ? going.filter((x) => !x.paid && !x.ticketBought).length : "—"}</td>
                    <td>{users.filter((u) => !answered.has(u.id)).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={`Members (${users.length})`}>
        <table className="w-full text-sm">
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
                <td>{u.role === "admin" ? <Pill tone="emerald">admin</Pill> : <Pill>member</Pill>}</td>
                <td className="text-right">
                  {u.id !== me.id && (
                    <form action={setUserRole.bind(null, u.id, u.role === "admin" ? "member" : "admin")}>
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
      </Card>
    </div>
  );
}
