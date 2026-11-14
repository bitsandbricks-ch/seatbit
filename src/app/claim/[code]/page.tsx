import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { claimGuest } from "@/app/clan-actions";
import { btnPrimary, btnSecondary, cardPage, cardPageTitle } from "@/components/ui";
import { getClan } from "@/lib/clans";
import { claimCodeWasUsed, takenGuestFor } from "@/lib/guest-claim";
import { getCurrentUser, isProfileComplete } from "@/lib/session";
import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { ActionForm } from "@/components/action-form";

/** A guest's personal link: signing in through it moves the guest's spot to your account. */
export default async function ClaimPage({ params }: PageProps<"/claim/[code]">) {
  const { code } = await params;
  const t = await getT();
  const g = db.select().from(schema.user).where(eq(schema.user.claimCode, code)).get();
  if (!g?.isGuest) {
    // Signing in through the link can take the guest over on its own (verified email or a
    // Discord account a lead linked), so the page the login sends back to must say "done".
    if (claimCodeWasUsed(code)) {
      const me = await getCurrentUser();
      if (!me) redirect(`/login?next=${encodeURIComponent(`/claim/${code}`)}`);
      const taken = takenGuestFor(me.id, { code });
      const clan = taken?.clanId ? getClan(taken.clanId) : null;
      if (taken)
        return (
          <div className={cardPage}>
            <h1 className={cardPageTitle}>{t("claimLink.done")}</h1>
            <p className="text-sm text-muted">
              {t.rich(clan ? "claimLink.doneTextClan" : "claimLink.doneText", {
                name: <span className="text-fg">{taken.guestName}</span>,
                clan: clan?.name ?? "",
              })}
            </p>
            <Link href={clan ? `/clans/${clan.slug}` : "/"} className={`${btnSecondary} w-full`}>
              {clan ? t("discordClaim.open", { clan: clan.name }) : t("claimLink.goTo")}
            </Link>
          </div>
        );
    }
    return (
      <div className={cardPage}>
        <h1 className={cardPageTitle}>{t("claimLink.gone")}</h1>
        <p className="text-sm text-muted">{t("claimLink.goneHint")}</p>
        <Link href="/" className="text-sm text-bit hover:underline">
          {t("claimLink.goTo")}
        </Link>
      </div>
    );
  }
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/claim/${code}`)}`);
  if (!isProfileComplete(me)) redirect(`/welcome?next=${encodeURIComponent(`/claim/${code}`)}`);
  const clan = g.guestClanId ? getClan(g.guestClanId) : null;
  const going = db.select().from(schema.attendance).where(eq(schema.attendance.userId, g.id)).all().length;

  return (
    <div className={cardPage}>
      <h1 className="text-xl font-semibold">{t("claimLink.hi", { name: me.firstName })}</h1>
      <p className="text-sm text-muted">
        {t.rich(going > 0 ? (clan ? "claimLink.addedClanEvents" : "claimLink.addedEvents") : clan ? "claimLink.addedClan" : "claimLink.added", {
          clan: clan?.name ?? "",
          name: <span className="text-fg">{g.name}</span>,
          count: going,
        })}
      </p>
      <ActionForm action={claimGuest.bind(null, code)} done={false}>
        <button className={`${btnPrimary} w-full`}>{t("claimGuest.meTake")}</button>
      </ActionForm>
    </div>
  );
}
