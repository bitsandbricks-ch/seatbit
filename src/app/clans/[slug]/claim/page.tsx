import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray, isNotNull, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { cancelGuestClaim, claimGuestAsMember, dismissGuestSuggestion } from "@/app/clan-actions";
import { Avatar } from "@/components/avatar";
import { Card, Columns, Notice, Page, PageHeader, Pill, btnGhost, btnPrimary, btnSecondary } from "@/components/ui";
import { avatarData } from "@/lib/avatars";
import { clanRole, getClanBySlug } from "@/lib/clans";
import { isMemberRole } from "@/lib/clan-roles";
import { canClaimDirectly, guestSuggestions, type GuestSuggestion } from "@/lib/guest-claim";
import { getDefaultNames } from "@/lib/lans";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";

/**
 * "Did the leads add you already?": a member picks the guest that is them. Guests with
 * the same name or nick are suggested first; the clan decides whether an admin confirms.
 */
export default async function ClaimGuestPage({ params }: PageProps<"/clans/[slug]/claim">) {
  const { slug } = await params;
  const me = await requireUser();
  const t = await getT();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  const role = clanRole(me.id, c.id);
  if (me.isGuest || !isMemberRole(role) || c.guestClaims === "off") redirect(`/clans/${slug}`);

  const all = guestSuggestions(c.id, me.id);
  // Full names whatever the clan shows: people are looking for their own real name here.
  const names = getDefaultNames(all.map((s) => s.guest.id));
  const roles = new Map(
    all.length
      ? db
          .select()
          .from(schema.clanMember)
          .where(and(eq(schema.clanMember.clanId, c.id), inArray(schema.clanMember.userId, all.map((s) => s.guest.id))))
          .all()
          .map((m) => [m.userId, m.role])
      : [],
  );
  // Upcoming events each guest is signed up for, so people recognise "their" guest.
  const signedUp = all.length
    ? db
        .select({ userId: schema.attendance.userId, name: schema.lan.name })
        .from(schema.attendance)
        .innerJoin(schema.lan, eq(schema.lan.id, schema.attendance.lanId))
        .where(
          and(
            inArray(schema.attendance.userId, all.map((s) => s.guest.id)),
            inArray(schema.attendance.status, ["going", "waitlist", "maybe"]),
            gt(schema.lan.endsAt, new Date()),
            isNotNull(schema.lan.publishedAt),
          ),
        )
        .all()
    : [];

  const pending = all.find((s) => s.status === "pending");
  const suggested = all.filter((s) => s.match && s.status !== "dismissed" && s.status !== "declined");
  const others = all.filter((s) => !suggested.includes(s));

  const row = (s: GuestSuggestion) => {
    const direct = canClaimDirectly(c.guestClaims, s, roles.get(s.guest.id) ?? null);
    const events = signedUp.filter((e) => e.userId === s.guest.id).map((e) => e.name);
    return (
      <li key={s.guest.id} className="flex flex-wrap items-center gap-3 py-3">
        <Avatar data={avatarData(s.guest)} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{names.get(s.guest.id)?.full ?? s.guest.name}</span>
            {s.match && <Pill tone="emerald">{t(s.match === "nick" ? "clanSettings.sameNick" : "clanSettings.sameName")}</Pill>}
            {s.status === "pending" && <Pill tone="amber">{t("claimGuest.waiting")}</Pill>}
            {s.status === "declined" && <Pill tone="red">{t("claimGuest.declined")}</Pill>}
          </span>
          <span className="block truncate text-xs text-muted">
            {events.length ? t("claimGuest.signedUp", { events: events.join(", ") }) : t("claimGuest.notSignedUp")}
          </span>
        </span>
        <span className="flex w-full shrink-0 flex-wrap justify-end gap-2 sm:w-auto">
          {s.status === "pending" && s.claimId ? (
            <form action={cancelGuestClaim.bind(null, s.claimId)}>
              <button className={btnGhost}>{t("claimGuest.cancel")}</button>
            </form>
          ) : s.status === "declined" ? null : (
            <>
              <form action={claimGuestAsMember.bind(null, c.id, s.guest.id)}>
                <button className={s.match ? btnPrimary : btnSecondary}>{t(direct ? "claimGuest.meTake" : "claimGuest.me")}</button>
              </form>
              {s.match && (
                <form action={dismissGuestSuggestion.bind(null, c.id, s.guest.id)}>
                  <button className={btnGhost}>{t("claimGuest.notMe")}</button>
                </form>
              )}
            </>
          )}
        </span>
      </li>
    );
  };

  return (
    <Page>
      <PageHeader
        back={{ href: `/clans/${c.slug}`, label: c.name }}
        title={t("claimGuest.title")}
        subtitle={t("claimGuest.subtitle")}
      />
      <Columns
        aside={
          <Card title={t("claimGuest.how")}>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
              <li>
                {t(c.guestClaims === "match" ? "claimGuest.howMatch" : "claimGuest.howAdmin")}
              </li>
              {c.guestClaims === "match" && <li>{t("claimGuest.howOther")}</li>}
              <li>{t("claimGuest.howOne")}</li>
              <li>{t("claimGuest.howLink")}</li>
            </ul>
          </Card>
        }
      >
        {pending && (
          <Notice>
            {t.rich("claimGuest.pending", { name: <span className="font-semibold">{pending.guest.name}</span>, clan: c.name })}
          </Notice>
        )}
        <Card title={t(suggested.length ? "claimGuest.looksLikeYou" : "claimGuest.clanGuests")}>
          {all.length === 0 ? (
            <p className="text-sm text-muted">{t("claimGuest.none", { clan: c.name })}</p>
          ) : suggested.length ? (
            <ul className="-my-3 divide-y divide-line">{suggested.map(row)}</ul>
          ) : (
            <p className="text-sm text-muted">{t("claimGuest.noMatch")}</p>
          )}
        </Card>
        {others.length > 0 && (
          <Card title={suggested.length ? t("claimGuest.others") : `${t("claimGuest.all")} (${others.length})`}>
            <ul className="-my-3 divide-y divide-line">{others.map(row)}</ul>
          </Card>
        )}
        <div className="flex justify-end">
          <Link href={`/clans/${c.slug}`} className={btnGhost}>
            {t("claimGuest.noneOfThese")}
          </Link>
        </div>
      </Columns>
    </Page>
  );
}
