import fs from "node:fs";
import path from "node:path";
import { AVATAR_MIME, getClan, uploadsDir } from "@/lib/clans";

export async function GET(_: Request, { params }: RouteContext<"/clan-avatar/[id]">) {
  const c = getClan((await params).id);
  if (!c?.avatar || c.avatar.includes("/") || c.avatar.includes("..")) return new Response("Not found", { status: 404 });
  const file = path.join(uploadsDir, c.avatar);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(file), {
    headers: {
      "content-type": AVATAR_MIME[path.extname(file).slice(1)] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
