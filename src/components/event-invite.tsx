import Link from "next/link";
import type { Lan } from "@/db/schema";
import { joinClan } from "@/app/clan-actions";
import { ClanAvatar } from "./clan-avatar";
import { Notice, btnPrimary, btnSecondary, cardPage, cardPageTitle } from "./ui";
import { lanRange } from "@/lib/format";
import { getT } from "@/i18n/server";
import { ActionForm } from "@/components/action-form";

type Clan = { id: string; name: string; slug: string; avatar: string | null; joinPolicy: "open" | "approval" | "invite" };

/**
 * What a shared event link shows to people who can't open the event yet: signed out, or not in the clan.
 * Only name, date and place, the same as the link preview; the way in follows the clan's join setting.
 */
export async function EventInvite({
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
  const t = await getT();
  const next = encodeURIComponent(here);
  return (
    <div className={cardPage}>
      <div className="flex flex-col items-center gap-3 text-center">
        <ClanAvatar clan={clan} size={72} />
        <p className="text-sm text-muted">{t.rich("share.eventOf", { clan: <span className="text-fg">{clan.name}</span> })}</p>
        <h1 className={cardPageTitle}>{l.name}</h1>
        <p className="text-sm text-muted">
          {lanRange(l, t.locale)}
          {l.location && <span className="block">{l.location}</span>}
        </p>
      </div>
      {l.cancelledAt && <Notice tone="danger">{t("share.inviteCancelled")}</Notice>}
      {!signedIn ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted">{t("share.signInText")}</p>
          <div className="grid gap-2">
            <Link href={`/login?next=${next}`} className={btnPrimary}>
              {t("share.signIn")}
            </Link>
            <Link href={`/register?next=${next}`} className={btnSecondary}>
              {t("share.register")}
            </Link>
          </div>
        </div>
      ) : pending ? (
        <Notice>{t("share.pending", { clan: clan.name })}</Notice>
      ) : clan.joinPolicy === "invite" ? (
        <Notice>{t("share.inviteOnly", { clan: clan.name })}</Notice>
      ) : (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted">
            {t(clan.joinPolicy === "open" ? "share.joinOpenText" : "share.joinApprovalText", { clan: clan.name })}
          </p>
          <ActionForm action={joinClan.bind(null, clan.id, here)} className="grid" done={false}>
            <button className={btnPrimary}>{t(clan.joinPolicy === "open" ? "share.join" : "share.askToJoin")}</button>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
