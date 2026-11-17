"use server";
import { revalidatePath } from "next/cache";
import { requireClanPermission, requireUser } from "@/lib/session";
import { enforceLimit } from "@/lib/rate-limit";
import { discordEnabled } from "@/lib/discord-api";
import { clanGuildIds, verifyClanMembers, verifyCounts, verifySelf } from "@/lib/discord-verify";
import { getClan } from "@/lib/clans";
import { audit } from "@/lib/audit";
import { tr } from "@/i18n/server";

/** Clan settings › Members: the web side of `/seatbit validate`, against all the clan's servers. */
export async function validateClanDiscord(clanId: string) {
  const me = await requireClanPermission(clanId, "members");
  if (!discordEnabled()) return { ok: false, message: await tr("discordVerify.botOff") };
  const guilds = clanGuildIds(clanId);
  if (guilds.length === 0) return { ok: false, message: await tr("discordVerify.noServer") };
  await enforceLimit("validate", me.id);
  const r = await verifyClanMembers(clanId, guilds);
  const counts = verifyCounts(r);
  audit({ actorId: me.id, clanId, action: "clan.discord_validate", data: counts });
  const slug = getClan(clanId)?.slug;
  if (slug) revalidatePath(`/clans/${slug}`, "layout");
  const message = [await tr("discordVerify.webResult", counts), r.failed ? await tr("discordVerify.failed", { count: r.failed }) : ""]
    .filter(Boolean)
    .join(" ");
  return { ok: true, message };
}

/** Profile › Discord › Verify: is my linked account on one of my clans' servers? */
export async function verifyMyDiscord() {
  const me = await requireUser();
  if (!discordEnabled()) return { ok: false, message: await tr("discordVerify.botOff") };
  await enforceLimit("validate", me.id);
  const r = await verifySelf(me.id);
  revalidatePath("/", "layout");
  const keys = {
    verified: "discordVerify.selfVerified",
    no_discord: "discordVerify.linkFirst",
    no_server: "discordVerify.selfNoServer",
    not_found: "discordVerify.selfNotFound",
    error: "discordVerify.selfError",
  } as const;
  return { ok: r === "verified", message: await tr(keys[r]) };
}
