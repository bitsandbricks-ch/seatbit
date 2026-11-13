import { getClan, serveUpload } from "@/lib/clans";

export async function GET(_: Request, { params }: RouteContext<"/clan-avatar/[id]">) {
  return serveUpload(getClan((await params).id)?.avatar);
}
