import { exportUserData } from "@/lib/account";
import { getCurrentUser } from "@/lib/session";

/** "Download my data": everything Seatbit stores about the signed-in person, as a JSON file. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return new Response("Sign in first", { status: 401 });
  const data = exportUserData(me.id);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="seatbit-my-data-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
