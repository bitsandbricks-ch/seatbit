import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getLan, getNicks } from "@/lib/lans";
import { getCurrentUser, isLanManager } from "@/lib/session";
import { getLanAccounts } from "@/lib/lan-accounts";
import { profileLink, profilePattern } from "@/lib/profile-link";

/**
 * One CSV cell. Text that starts like a formula (=, +, -, @, tab, CR) gets a leading apostrophe,
 * so a nick such as "=HYPERLINK(...)" stays text when a lead opens the file in Excel or Sheets.
 */
const csv = (raw: string) => {
  const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/** CSV of the group for this LAN (seat, nick, LAN ID, name, email, status, ticket, profile link), e.g. to send to the event's organisers. */
export async function GET(_: Request, { params }: RouteContext<"/lans/[id]/manage/export">) {
  const { id } = await params;
  const me = await getCurrentUser();
  const l = getLan(id);
  if (!me || !l || !isLanManager(me, id)) return new Response("Not found", { status: 404 });

  const rows = db.select().from(schema.attendance).where(eq(schema.attendance.lanId, id)).all();
  const seats = db.select().from(schema.seat).where(eq(schema.seat.lanId, id)).all();
  const users = new Map(db.select().from(schema.user).all().map((u) => [u.id, u]));
  const nicks = await getNicks(id, rows.map((r) => r.userId));
  const lanIds = getLanAccounts(l, rows.map((r) => r.userId));
  const type = l.typeId ? db.select().from(schema.lanType).where(eq(schema.lanType.id, l.typeId)).get() : null;
  const pattern = profilePattern(l, type);
  const seatOf = new Map(seats.filter((s) => s.userId).map((s) => [s.userId!, s.label]));

  const order = { going: 0, waitlist: 1, maybe: 2, declined: 3 };
  const lines = [["seat", "nick", "lan_id", "name", "email", "status", "ticket", "note", ...(pattern ? ["profile"] : [])].join(",")];
  for (const r of rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      (seatOf.get(a.userId) ?? "~").localeCompare(seatOf.get(b.userId) ?? "~", undefined, { numeric: true }),
  )) {
    const u = users.get(r.userId);
    lines.push(
      [
        seatOf.get(r.userId) ?? "",
        nicks.get(r.userId) ?? "",
        lanIds.get(r.userId) ?? "",
        u?.name ?? "",
        u && !u.isGuest ? u.email : "",
        r.status,
        r.paid ? "confirmed" : r.ticketBought ? "reported" : "open",
        r.note,
        ...(pattern ? [profileLink(pattern, lanIds.get(r.userId)) ?? ""] : []),
      ]
        .map(csv)
        .join(","),
    );
  }
  const file = `${l.name.normalize("NFC").replace(/[^\p{L}\p{N}-]+/gu, "_")}_group.csv`;
  const ascii = file.normalize("NFKD").replace(/[^\w.-]+/g, "");
  // The byte order mark tells Excel the file is UTF-8; without it "Müller" opens as "MÃ¼ller".
  return new Response("\uFEFF" + lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file)}`,
    },
  });
}
