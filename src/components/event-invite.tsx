import Link from "next/link";
import type { Lan } from "@/db/schema";
import { joinClan } from "@/app/clan-actions";
import { ClanAvatar } from "./clan-avatar";
import { Notice, btnPrimary, btnSecondary, cardPage, cardPageTitle } from "./ui";
import { lanRange } from "@/lib/format";

type Clan = { id: string; name: string; slug: string; avatar: string | null; joinPolicy: "open" | "approval" | "invite" };

/**
 * What a shared event link shows to people who can't open the event yet: signed out, or not in the clan.
 * Only name, date and place, the same as the link preview; the way in follows the clan's join setting.
 */
export function EventInvite({
  lan: l,
  clan,
  signedIn,
  pending,
  here,
}: {
  lan: Lan;
  clan: Clan;
  signedIn: boolean;
  /** They already asked to join and wait for a clan admin. */
  pending: boolean;
  here: string;
}) {
  const next = encodeURIComponent(here);
  return (
    <div className={cardPage}>
      <div className="flex flex-col items-center gap-3 text-center">
        <ClanAvatar clan={clan} size={72} />
        <p className="text-sm text-muted">
          Event of <span className="text-fg">{clan.name}</span>
        </p>
        <h1 className={cardPageTitle}>{l.name}</h1>
        <p className="text-sm text-muted">
          {lanRange(l)}
          {l.location && <span className="block">{l.location}</span>}
        </p>
      </div>
      {l.cancelledAt && <Notice tone="danger">This event was cancelled.</Notice>}
      {!signedIn ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted">Sign in to see who&apos;s coming and to answer.</p>
          <div className="grid gap-2">
            <Link href={`/login?next=${next}`} className={btnPrimary}>
              Sign in
            </Link>
            <Link href={`/register?next=${next}`} className={btnSecondary}>
              Create an account
            </Link>
          </div>
        </div>
      ) : pending ? (
        <Notice>
          You asked to join {clan.name}. Once a clan admin lets you in, this link opens the event.
        </Notice>
      ) : clan.joinPolicy === "invite" ? (
        <Notice>
          {clan.name} is invite-only. Ask one of its leads for an invite link, then open this link again.
        </Notice>
      ) : (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted">
            {clan.joinPolicy === "open"
              ? `Join ${clan.name} to see who's coming and to answer.`
              : `Ask to join ${clan.name}. Once a clan admin lets you in, the event opens for you.`}
          </p>
          <form action={joinClan.bind(null, clan.id, here)} className="grid">
            <button className={btnPrimary}>{clan.joinPolicy === "open" ? "Join clan" : "Ask to join"}</button>
          </form>
        </div>
      )}
    </div>
  );
}
