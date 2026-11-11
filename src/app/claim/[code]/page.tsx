import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { claimGuest } from "@/app/clan-actions";
import { btnPrimary } from "@/components/ui";
import { getClan } from "@/lib/clans";
import { getCurrentUser, isProfileComplete } from "@/lib/session";
import { redirect } from "next/navigation";

/** A guest's personal link: signing in through it moves the guest's spot to your account. */
export default async function ClaimPage({ params }: PageProps<"/claim/[code]">) {
  const { code } = await params;
  const g = db.select().from(schema.user).where(eq(schema.user.claimCode, code)).get();
  const card = "mx-auto max-w-sm space-y-4 rounded-card border border-line bg-surface p-6";
  if (!g?.isGuest) {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold">Link no longer works</h1>
        <p className="text-sm text-muted">It was used already or replaced. Ask your orga for a new one.</p>
        <Link href="/" className="text-sm text-bit hover:underline">
          Go to Seatbit
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
    <div className={card}>
      <h1 className="text-xl font-semibold">Hi {me.firstName}!</h1>
      <p className="text-sm text-muted">
        {clan ? `The orgas of ${clan.name}` : "An orga"} added you as <span className="text-fg">{g.name}</span>
        {going > 0 ? ` and signed you up for ${going} event${going === 1 ? "" : "s"}` : ""}. Take it over to see your events,
        tickets and seat with your own account.
      </p>
      <form action={claimGuest.bind(null, code)}>
        <button className={`${btnPrimary} w-full`}>That&apos;s me, take it over</button>
      </form>
    </div>
  );
}
