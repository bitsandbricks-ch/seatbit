import fs from "node:fs";
import { Readable } from "node:stream";
import { audit } from "@/lib/audit";
import { backupPath } from "@/lib/backup";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Download of one backup file. Platform admins only; every download is in the audit log (it holds everyone's data). */
export async function GET(_: Request, { params }: RouteContext<"/admin/backups/[name]">) {
  const { name } = await params;
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return new Response("Not found", { status: 404 });
  const file = backupPath(name);
  if (!file) return new Response("Not found", { status: 404 });
  const size = fs.statSync(file).size;
  audit({ actorId: me.id, action: "backup.download", data: { file: name } });
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
