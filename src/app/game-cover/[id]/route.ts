import { serveUpload } from "@/lib/clans";
import { getCatalogGame } from "@/lib/game-catalog";

// Covers are stored on this server (copied from Steam once), so browsing the games list never
// sends anyone's browser to Steam.
export async function GET(_: Request, { params }: RouteContext<"/game-cover/[id]">) {
  return serveUpload(getCatalogGame((await params).id)?.cover);
}
