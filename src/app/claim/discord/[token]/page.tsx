import Link from "next/link";
import { redirect } from "next/navigation";
import { claimGuestFromDiscord } from "@/app/clan-actions";
import { btnPrimary, btnSecondary, cardPage, cardPageTitle } from "@/components/ui";
import { discordTicketState } from "@/lib/guest-claim";
import { getCurrentUser, isProfileComplete } from "@/lib/session";
import { getT } from "@/i18n/server";

/**
 * Where the bot's /claim sends people who had no Seatbit account yet: sign in with
 * that Discord account, then take the guest over (or ask the clan's admins).
 */
export default async function DiscordClaimPage({ params }: PageProps<"/claim/discord/[token]">) {
  const { token } = await params;
  const here = `/claim/discord/${token}`;
  const t = await getT();
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(here)}`);
  if (!isProfileComplete(me)) redirect(`/welcome?next=${encodeURIComponent(here)}`);
  const st = discordTicketState(token, me);
  const clanLink = st.kind !== "invalid" ? `/clans/${st.clan.slug}` : "/";

  if (st.kind === "invalid" || st.kind === "gone" || st.kind === "wrong_discord") {
    const k = st.kind === "invalid" ? "invalid" : st.kind === "gone" ? "gone" : st.linked ? "wrong" : "unlinked";
    const [title, text] = [t(`discordClaim.${k}`), t(`discordClaim.${k}Hint`)];
    return (
      <div className={cardPage}>
        <h1 className={cardPageTitle}>{title}</h1>
        <p className="text-sm text-muted">{text}</p>
        <Link href={st.kind === "wrong_discord" && !st.linked ? "/profile" : clanLink} className={`${btnSecondary} w-full`}>
          {t(st.kind === "wrong_discord" && !st.linked ? "discordClaim.openProfile" : "claimLink.goTo")}
        </Link>
      </div>
    );
  }

  const { guest } = st.claim;
  if (st.kind === "pending") {
    return (
      <div className={cardPage}>
        <h1 className={cardPageTitle}>{t("claimGuest.waiting")}</h1>
        <p className="text-sm text-muted">
          {t.rich("discordClaim.pending", { name: <span className="text-fg">{guest.name}</span>, clan: st.clan.name })}
        </p>
        <Link href={clanLink} className={`${btnSecondary} w-full`}>
          {t("discordClaim.open", { clan: st.clan.name })}
        </Link>
      </div>
    );
  }

  return (
    <div className={cardPage}>
      <h1 className={cardPageTitle}>{t("claimLink.hi", { name: me.firstName })}</h1>
      <p className="text-sm text-muted">
        {t.rich("discordClaim.said", { name: <span className="text-fg">{guest.name}</span>, clan: st.clan.name })}
      </p>
      <form action={claimGuestFromDiscord.bind(null, token)}>
        <button className={`${btnPrimary} w-full`}>{t("claimGuest.meTake")}</button>
      </form>
    </div>
  );
}
