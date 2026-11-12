import Link from "next/link";
import type { ReactNode } from "react";
import { ViewManageSwitch } from "./view-manage-switch";
import type { Lan } from "@/db/schema";
import { ClanAvatar } from "./clan-avatar";
import { PageHeader, btnGhost } from "./ui";
import { fmtRange } from "@/lib/format";

type Clan = Parameters<typeof ClanAvatar>[0]["clan"] & { slug: string; name: string };

/** Tabs that exist on both the event page and its manage page; switching keeps you on the same one. */
const SHARED_TABS = ["overview", "seats", "attendees"];

/**
 * The event's header, the same on the event page and on its manage page. Orgas get a View / Manage switch
 * next to the title, so editing is always one tap away.
 */
export function EventHeader({
  lan: l,
  clan,
  mode,
  canManage,
  tab,
  actions,
}: {
  lan: Lan;
  clan?: Clan;
  mode: "view" | "manage";
  canManage: boolean;
  tab: string;
  actions?: ReactNode;
}) {
  const keep = SHARED_TABS.includes(tab) && tab !== "overview" ? `?tab=${tab}` : "";
  return (
    <PageHeader
      eyebrow={
        clan && (
          <Link href={`/clans/${clan.slug}`} className="inline-flex max-w-full items-center gap-1.5 hover:text-fg">
            <ClanAvatar clan={clan} size={20} />
            <span className="truncate">
              <span className="text-faint">Event of </span>
              <span className="text-fg">{clan.name}</span>
            </span>
          </Link>
        )
      }
      title={l.name}
      subtitle={
        <>
          {fmtRange(l.startsAt, l.endsAt)}
          {l.location && (
            <span className="block sm:inline">
              <span className="hidden sm:inline"> · </span>
              {l.location}
            </span>
          )}
        </>
      }
      actions={
        canManage || actions ? (
          <>
        {actions}
        {canManage && (
          <ViewManageSwitch mode={mode} viewHref={`/lans/${l.id}${keep}`} manageHref={`/lans/${l.id}/manage${keep}`} />
        )}
          </>
        ) : undefined
      }
    >
      {mode === "view" && (l.websiteUrl || l.ticketUrl) && (
        <p className="mt-1 flex flex-wrap gap-2 text-sm">
          {l.websiteUrl && (
            <a href={l.websiteUrl} target="_blank" rel="noreferrer" className={`${btnGhost} border border-line !text-bit`}>
              Event website <span aria-hidden>↗</span>
            </a>
          )}
          {l.ticketUrl && (
            <a href={l.ticketUrl} target="_blank" rel="noreferrer" className={`${btnGhost} border border-line !text-bit`}>
              Ticket shop <span aria-hidden>↗</span>
            </a>
          )}
        </p>
      )}
    </PageHeader>
  );
}
