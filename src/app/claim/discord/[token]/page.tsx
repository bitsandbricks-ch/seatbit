import Link from "next/link";
import { redirect } from "next/navigation";
import { claimGuestFromDiscord } from "@/app/clan-actions";
import { btnPrimary, btnSecondary, cardPage, cardPageTitle } from "@/components/ui";
import { discordTicketState } from "@/lib/guest-claim";
import { getCurrentUser, isProfileComplete } from "@/lib/session";

/**
 * Where the bot's /claim sends people who had no Seatbit account yet: sign in with
 * that Discord account, then take the guest over (or ask the clan's admins).
 */
export default async function DiscordClaimPage({ params }: PageProps<"/claim/discord/[token]">) {
  const { token } = await params;
  const here = `/claim/discord/${token}`;
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(here)}`);
  if (!isProfileComplete(me)) redirect(`/welcome?next=${encodeURIComponent(here)}`);
  const st = discordTicketState(token, me);
  const clanLink = st.kind !== "invalid" ? `/clans/${st.clan.slug}` : "/";

  if (st.kind === "invalid" || st.kind === "gone" || st.kind === "wrong_discord") {
    const [title, text] =
      st.kind === "invalid"
        ? ["Link no longer works", "It's older than a day. Run /claim in your clan's Discord server again for a new one."]
        : st.kind === "gone"
          ? ["Already taken over", "That guest isn't waiting anymore. If it was you, you're all set; otherwise talk to your leads."]
          : st.linked
            ? ["Different Discord account", "This link is for the Discord account that ran /claim. Sign in with that one."]
            : ["Link Discord first", "This link is for the Discord account that ran /claim. Link it on your profile, then open the link again."];
    return (
      <div className={cardPage}>
        <h1 className={cardPageTitle}>{title}</h1>
        <p className="text-sm text-muted">{text}</p>
        <Link href={st.kind === "wrong_discord" && !st.linked ? "/profile" : clanLink} className={`${btnSecondary} w-full`}>
          {st.kind === "wrong_discord" && !st.linked ? "Open profile" : "Go to Seatbit"}
        </Link>
      </div>
    );
  }

  const { guest } = st.claim;
  if (st.kind === "pending") {
    return (
      <div className={cardPage}>
        <h1 className={cardPageTitle}>Waiting for an admin</h1>
        <p className="text-sm text-muted">
          You asked to take over <span className="text-fg">{guest.name}</span> in {st.clan.name}. An admin will confirm it, and
          you&apos;ll get a message when they did.
        </p>
        <Link href={clanLink} className={`${btnSecondary} w-full`}>
          Open {st.clan.name}
        </Link>
      </div>
    );
  }

  return (
    <div className={cardPage}>
      <h1 className={cardPageTitle}>Hi {me.firstName}!</h1>
      <p className="text-sm text-muted">
        On Discord you said you&apos;re <span className="text-fg">{guest.name}</span> in {st.clan.name}. Take it over to see their
        events, tickets and seat with your own account.
      </p>
      <form action={claimGuestFromDiscord.bind(null, token)}>
        <button className={`${btnPrimary} w-full`}>That&apos;s me, take it over</button>
      </form>
    </div>
  );
}
