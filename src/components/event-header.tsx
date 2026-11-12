import Link from "next/link";
import type { ReactNode } from "react";
import type { Lan } from "@/db/schema";
import { ClanAvatar } from "./clan-avatar";
import { PageHeader, btnGhost } from "./ui";
import { fmtRange } from "@/lib/format";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PublishEvent } from "./publish-event";

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
  const discordChannels =
    !l.publishedAt && canManage && l.clanId
      ? db.select().from(schema.discordChannel).where(eq(schema.discordChannel.clanId, l.clanId)).all().length
      : 0;
  return (
    <>
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
          <nav aria-label="View or manage" className="inline-flex rounded-lg border border-line bg-raised p-1">
            <Link
              href={`/lans/${l.id}${keep}`}
              aria-current={mode === "view" ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium transition ${
                mode === "view" ? "bg-surface text-fg shadow" : "text-muted hover:text-fg"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              View
            </Link>
            <Link
              href={`/lans/${l.id}/manage${keep}`}
              aria-current={mode === "manage" ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3.5 text-sm font-semibold transition ${
                mode === "manage" ? "bg-bit text-on-bit shadow" : "text-bit hover:bg-bit-soft"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Manage
            </Link>
          </nav>
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
    {!l.publishedAt && (
      <section
        aria-label="Draft"
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-warn/60 bg-warn/10 p-3 sm:p-4"
      >
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-warn">Draft</p>
          <p className="text-muted">
            Only orgas and clan admins see this event. Members get nothing yet: no Discord post, no reminders. Fill in
            the details, then publish.
          </p>
        </div>
        {canManage && <PublishEvent lanId={l.id} discordChannels={discordChannels} />}
      </section>
    )}
    </>
  );
}
