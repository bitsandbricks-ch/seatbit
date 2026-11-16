import Link from "next/link";
import type { ReactNode } from "react";
import { ViewManageSwitch } from "./view-manage-switch";
import type { Lan } from "@/db/schema";
import { ClanAvatar } from "./clan-avatar";
import { PageHeader } from "./ui";
import { fmtDate, lanRange } from "@/lib/format";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { OpenSignup, PublishEvent, UndoCancelButton } from "./publish-event";
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
    <ShareButton
      url={lanLink(l)}
      title={l.name}
      text={[l.name, lanRange(l, t.locale), l.location].filter(Boolean).join(" · ")}
      small
    />
  ) : null;
  const switchProps = { mode, viewHref: `/lans/${l.id}${keep}`, manageHref: `/lans/${l.id}/manage${keep}` };
  // Kept short, mainly for phones: the share icon sits next to the title, the website and ticket shop live
  // on the overview and in the checklist, and leads get a small View / Manage switch beside the title.
  return (
    <>
    <PageHeader
      eyebrow={
        clan && (
          <Link href={`/clans/${clan.slug}`} className="hidden max-w-full items-center gap-1.5 hover:text-fg sm:inline-flex">
            <ClanAvatar clan={clan} size={20} />
            <span className="truncate text-faint">
              {t.rich("eventUi.eventOf", { clan: <span className="text-fg">{clan.name}</span> })}
            </span>
          </Link>
        )
      }
      title={
        <>
          {l.name}
          {share && <span className="ml-1.5 inline-block align-middle">{share}</span>}
        </>
      }
      subtitle={
        <span className="block truncate sm:inline">
          {lanRange(l, t.locale)}
          {l.location && ` · ${l.location}`}
        </span>
      }
      actionsBeside
      actions={
        canManage || actions ? (
          <>
            {actions}
            {canManage && (
              <>
                <span className="sm:hidden">
                  <ViewManageSwitch compact {...switchProps} />
                </span>
                <span className="hidden sm:inline-flex">
                  <ViewManageSwitch {...switchProps} />
                </span>
              </>
            )}
          </>
        ) : undefined
      }
    />
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
    const answers = db.select().from(schema.attendance).where(eq(schema.attendance.lanId, l.id)).all();
    const n = (...st: string[]) => answers.filter((x) => st.includes(x.status)).length;
    return (
      <section aria-label={t("eventUi.interestCheck")} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-bit/40 bg-bit-soft p-3 sm:p-4">
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-bit">{t("eventUi.interestCheck")}</p>
          <p className="text-muted">
            {t("eventUi.interestText")}{" "}
            {l.signupOpensAt &&
              !l.dateTbd &&
              t.rich("eventUi.signupOpensOn", { date: <span className="text-fg">{fmtDate(l.signupOpensAt, t.locale)}</span> })}
            <Link href={`/lans/${l.id}#interest`} className="block text-fg hover:text-bit hover:underline">
              {t("eventUi.interestCounts", { yes: n("going", "waitlist"), maybe: n("maybe"), no: n("declined") })}
            </Link>
          </p>
        </div>
        {canManage && (
          <OpenSignup
            lanId={l.id}
            dateTbd={l.dateTbd}
            scheduled={l.signupOpensAt ? fmtDate(l.signupOpensAt, t.locale) : null}
            published={!!l.publishedAt}
          />
        )}
      </section>
    );
  }
  return null;
}
