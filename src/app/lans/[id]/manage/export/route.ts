import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getDisplayNames, getLan } from "@/lib/lans";
import { getCurrentUser, isLanManager } from "@/lib/session";

const csv = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV of the group for this LAN (seat, nick, name, email, status, ticket), e.g. to send to the event's organisers. */
export async function GET(_: Request, { params }: RouteContext<"/lans/[id]/manage/export">) {
  const { id } = await params;
  const me = await getCurrentUser();
  const l = getLan(id);
  if (!me || !l || !isLanManager(me, id)) return new Response("Not found", { status: 404 });

  const rows = db.select().from(schema.attendance).where(eq(schema.attendance.lanId, id)).all();
  const seats = db.select().from(schema.seat).where(eq(schema.seat.lanId, id)).all();
  const users = new Map(db.select().from(schema.user).all().map((u) => [u.id, u]));
  const names = await getDisplayNames(id, rows.map((r) => r.userId));
  const seatOf = new Map(seats.filter((s) => s.userId).map((s) => [s.userId!, s.label]));

  const order = { going: 0, waitlist: 1, maybe: 2, declined: 3 };
  const lines = [["seat", "nick", "name", "email", "status", "ticket", "note"].join(",")];
  for (const r of rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      (seatOf.get(a.userId) ?? "~").localeCompare(seatOf.get(b.userId) ?? "~", undefined, { numeric: true }),
  )) {
    const u = users.get(r.userId);
    lines.push(
      [
        seatOf.get(r.userId) ?? "",
        names.get(r.userId) ?? "",
        u?.name ?? "",
        u?.email ?? "",
        r.status,
        r.paid ? "confirmed" : r.ticketBought ? "reported" : "open",
        r.note,
      ]
        .map(csv)
        .join(","),
    );
  }
  const file = `${l.name.replace(/[^\w-]+/g, "_")}_group.csv`;
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file}"`,
    },
  });
}
