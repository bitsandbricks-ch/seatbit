import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { uploadHeaders, uploadsDir } from "@/lib/clans";

export async function GET(_: Request, { params }: RouteContext<"/user-avatar/[id]">) {
  const u = db
    .select({ avatarFile: schema.user.avatarFile })
    .from(schema.user)
    .where(eq(schema.user.id, (await params).id))
    .get();
  const name = u?.avatarFile;
  if (!name || name.includes("/") || name.includes("..")) return new Response("Not found", { status: 404 });
  const file = path.join(uploadsDir, name);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(file), {
    headers: uploadHeaders(file),
  });
}
