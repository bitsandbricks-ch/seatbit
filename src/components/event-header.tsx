import Link from "next/link";
import type { ReactNode } from "react";
import { ViewManageSwitch } from "./view-manage-switch";
import type { Lan } from "@/db/schema";
import { ClanAvatar } from "./clan-avatar";
import { PageHeader, btnGhost } from "./ui";
import { fmtDate, lanRange } from "@/lib/format";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { OpenSignupButton, PublishEvent, UndoCancelButton } from "./publish-event";
import { ShareButton } from "./share-button";
import { lanLink } from "@/lib/announce";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";

type Clan = Parameters<typeof ClanAvatar>[0]["clan"] & { slug: string; name: string };

/** Tabs that exist on both the event page and its manage page; switching keeps you on the same one. */
const SHARED_TABS = ["overview", "seats", "attendees"];

/**
 * The event's header, the same on the event page and on its manage page. Leads get a View / Manage switch
 * next to the title, so editing is always one tap away. Published events get a Share button for everyone.
 */
export async function EventHeader({
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
  const t = await getT();
  const keep = SHARED_TABS.includes(tab) && tab !== "overview" ? `?tab=${tab}` : "";
  // Drafts only open for leads, so a shared link would just be a dead end for everyone else.
  const share = l.publishedAt ? (
    <ShareButton url={lanLink(l)} title={l.name} text={[l.name, lanRange(l, t.locale), l.location].filter(Boolean).join(" · ")} />
  ) : null;
  return (
    <>
    <PageHeader
      eyebrow={
        clan && (
          <Link href={`/clans/${clan.slug}`} className="inline-flex max-w-full items-center gap-1.5 hover:text-fg">
            <ClanAvatar clan={clan} size={20} />
            <span className="truncate text-faint">
              {t.rich("eventUi.eventOf", { clan: <span className="text-fg">{clan.name}</span> })}
            </span>
          </Link>
        )
      }
      title={l.name}
      subtitle={
        <>
          {lanRange(l, t.locale)}
          {l.location && (
            <span className="block sm:inline">
              <span className="hidden sm:inline"> · </span>
              {l.location}
            </span>
          )}
        </>
      }
      actions={
        canManage || actions || share ? (
          <>
        {actions}
        {share}
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
              {t("eventUi.website")} <span aria-hidden>↗</span>
            </a>
          )}
          {l.ticketUrl && (
            <a href={l.ticketUrl} target="_blank" rel="noreferrer" className={`${btnGhost} border border-line !text-bit`}>
              {t("eventUi.ticketShop")} <span aria-hidden>↗</span>
            </a>
          )}
        </p>
      )}
    </PageHeader>
    <EventStatus lan={l} canManage={canManage} t={t} />
    </>
  );
}

/** Where the event stands, when it's anything but a normal open event: draft, interest check or cancelled. */
function EventStatus({ lan: l, canManage, t }: { lan: Lan; canManage: boolean; t: T }) {
  if (l.cancelledAt) {
    return (
      <section aria-label={t("eventUi.cancelled")} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/50 bg-danger/10 p-3 sm:p-4">
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-danger">{t("eventUi.cancelled")}</p>
          <p className="text-muted">{l.cancelReason || t("eventUi.cancelledBy")}</p>
        </div>
        {canManage && <UndoCancelButton lanId={l.id} />}
      </section>
    );
  }
  if (!l.publishedAt) {
    const discordChannels = l.clanId
      ? db.select().from(schema.discordChannel).where(eq(schema.discordChannel.clanId, l.clanId)).all().length
      : 0;
    return (
      <section
        aria-label={t("eventUi.draft")}
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-warn/60 bg-warn/10 p-3 sm:p-4"
      >
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-warn">
            {l.interestCheck ? t("eventUi.draftInterest") : t("eventUi.draft")}
          </p>
          <p className="text-muted">
            {t("eventUi.draftText")}{" "}
            {l.publishAt
              ? t.rich("eventUi.goesLive", { date: <span className="text-fg">{fmtDate(l.publishAt, t.locale)}</span> })
              : t("eventUi.fillIn")}
          </p>
        </div>
        {canManage && (
          <PublishEvent
            lanId={l.id}
            discordChannels={discordChannels}
            scheduled={l.publishAt ? fmtDate(l.publishAt, t.locale) : null}
            interestCheck={l.interestCheck}
          />
        )}
      </section>
    );
  }
  if (l.interestCheck) {
    const answers = db.select().from(schema.lanInterest).where(eq(schema.lanInterest.lanId, l.id)).all();
    const n = (a: string) => answers.filter((x) => x.answer === a).length;
    return (
      <section aria-label={t("eventUi.interestCheck")} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-bit/40 bg-bit-soft p-3 sm:p-4">
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-bit">{t("eventUi.interestCheck")}</p>
          <p className="text-muted">
            {t("eventUi.interestText")}
            <span className="block text-fg">{t("eventUi.interestCounts", { yes: n("yes"), maybe: n("maybe"), no: n("no") })}</span>
          </p>
        </div>
        {canManage && <OpenSignupButton lanId={l.id} dateTbd={l.dateTbd} />}
      </section>
    );
  }
  return null;
}
