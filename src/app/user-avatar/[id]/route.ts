import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { serveUpload } from "@/lib/clans";

export async function GET(_: Request, { params }: RouteContext<"/user-avatar/[id]">) {
  const u = db
    .select({ avatarFile: schema.user.avatarFile })
    .from(schema.user)
    .where(eq(schema.user.id, (await params).id))
    .get();
  return serveUpload(u?.avatarFile);
}
