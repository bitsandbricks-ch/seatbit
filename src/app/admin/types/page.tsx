import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, btnGhost, btnPrimary } from "@/components/ui";
import { fmtDay } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export default async function LanTypesPage() {
  await requireAdmin();
  const types = db.select().from(schema.lanType).orderBy(asc(schema.lanType.name)).all();
  const lans = db.select().from(schema.lan).all();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href="/admin" className="hover:text-zinc-300">
              Admin
            </Link>{" "}
            / LAN types
          </p>
          <h1 className="text-2xl font-bold">LAN types</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Recurring LAN parties like Lock &amp; Load or SwitzerLAN. Each year&apos;s event is created from its type, and
            members keep one nick per type.
          </p>
        </div>
        <Link href="/admin/types/new" className={btnPrimary}>
          Add type
        </Link>
      </div>
      {types.length === 0 && (
        <Card>
          <p className="text-sm text-zinc-400">No LAN types yet.</p>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {types.map((t) => {
          const events = lans.filter((l) => l.typeId === t.id).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
          return (
            <Card
              key={t.id}
              title={t.name}
              actions={
                <span className="flex gap-1">
                  <Link href={`/admin/types/${t.id}`} className={btnGhost}>
                    Edit
                  </Link>
                  <Link href={`/admin/lans/new?type=${t.id}`} className={btnPrimary}>
                    New event
                  </Link>
                </span>
              }
            >
              <p className="text-sm text-zinc-400">
                {[t.location, t.price, t.seatSpec && `seats ${t.seatSpec}`].filter(Boolean).join(" · ") || "—"}
              </p>
              {events.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {events.map((e) => (
                    <li key={e.id}>
                      <Link href={`/lans/${e.id}`} className="hover:text-bit">
                        {e.name}
                      </Link>{" "}
                      <span className="text-zinc-500">{fmtDay(e.startsAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
