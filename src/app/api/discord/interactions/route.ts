import { after } from "next/server";
import { handleInteraction, verifyDiscordRequest } from "@/lib/discord";

/**
 * Discord "Interactions Endpoint URL": slash commands and button clicks arrive
 * here as signed HTTP requests, so the bot needs no separate always-on process.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const ok = verifyDiscordRequest(
    body,
    req.headers.get("x-signature-ed25519"),
    req.headers.get("x-signature-timestamp"),
  );
  if (!ok) return new Response("Bad signature", { status: 401 });

  const { response, later } = handleInteraction(JSON.parse(body));
  if (later) after(later);
  // Most answers are instant; member search for /guest asks Discord first.
  return Response.json(await response);
}
