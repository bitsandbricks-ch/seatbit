import Link from "next/link";
import type { ReactNode } from "react";
import { ViewManageSwitch } from "./view-manage-switch";
import type { Lan } from "@/db/schema";
import { ClanAvatar } from "./clan-avatar";
import { PageHeader } from "./ui";
import { fmtDate, lanRange } from "@/lib/format";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { OpenSignupButton, PublishEvent, UndoCancelButton } from "./publish-event";
import { ShareButton } from "./share-button";
import { lanLink } from "@/lib/announce";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";
import { httpHref } from "@/lib/safe-url";

type Clan = Parameters<typeof ClanAvatar>[0]["clan"] & { slug: string; name: string };

/** Same height as the framed share button next to them. */
const eventLink =
  "inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-line px-3 font-medium text-bit transition hover:bg-raised sm:min-h-[50px] sm:px-3.5";

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
    <ShareButton
      url={lanLink(l)}
      title={l.name}
      text={[l.name, lanRange(l, t.locale), l.location].filter(Boolean).join(" · ")}
      iconOnlyOnPhone
    />
  ) : null;
  const links = mode === "view" && (l.websiteUrl || l.ticketUrl);
  // Event page: website, ticket shop and share sit in one row under the title, so the header stays short on phones.
  const headerShare = links ? null : share;
  return (
    <>
    <PageHeader
      eyebrow={
        clan && (
          // Phones: the clan line goes, the header has to stay short above the tabs.
          <Link href={`/clans/${clan.slug}`} className="hidden max-w-full items-center gap-1.5 hover:text-fg sm:inline-flex">
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
          <span className="block truncate sm:inline">
            {lanRange(l, t.locale)}
            {l.location && ` · ${l.location}`}
          </span>
        </>
      }
      actions={
        canManage || actions || headerShare ? (
          <>
        {actions}
        {headerShare}
        {canManage && (
          // With the links row, phones get the small switch in that row instead.
          <span className={links ? "hidden sm:inline-flex" : "inline-flex"}>
            <ViewManageSwitch mode={mode} viewHref={`/lans/${l.id}${keep}`} manageHref={`/lans/${l.id}/manage${keep}`} />
          </span>
        )}
          </>
        ) : undefined
      }
    >
      {links && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          {l.websiteUrl && (
            <a href={httpHref(l.websiteUrl)} target="_blank" rel="noreferrer" className={eventLink}>
              <span className="sm:hidden">{t("eventUi.websiteShort")}</span>
              <span className="hidden sm:inline">{t("eventUi.website")}</span> <span aria-hidden>↗</span>
            </a>
          )}
          {l.ticketUrl && (
            <a href={httpHref(l.ticketUrl)} target="_blank" rel="noreferrer" className={eventLink}>
              <span className="sm:hidden">{t("eventUi.ticketShopShort")}</span>
              <span className="hidden sm:inline">{t("eventUi.ticketShop")}</span> <span aria-hidden>↗</span>
            </a>
          )}
          {share}
          {canManage && (
            <span className="ml-auto sm:hidden">
              <ViewManageSwitch compact mode={mode} viewHref={`/lans/${l.id}${keep}`} manageHref={`/lans/${l.id}/manage${keep}`} />
            </span>
          )}
        </div>
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
            <Link href={`/lans/${l.id}?tab=attendees`} className="block text-fg hover:text-bit hover:underline">
              {t("eventUi.interestCounts", { yes: n("yes"), maybe: n("maybe"), no: n("no") })}
            </Link>
          </p>
        </div>
        {canManage && <OpenSignupButton lanId={l.id} dateTbd={l.dateTbd} />}
      </section>
    );
  }
  return null;
}
