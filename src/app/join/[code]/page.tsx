import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { joinWithInvite } from "@/app/clan-actions";
import { ClanAvatar } from "@/components/clan-avatar";
import { Card, btnPrimary } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const me = await getCurrentUser();
  if (!me) redirect(`/register?next=${encodeURIComponent(`/join/${code}`)}`);
  const inv = db.select().from(schema.clanInvite).where(eq(schema.clanInvite.code, code)).get();
  const c = inv && db.select().from(schema.clan).where(eq(schema.clan.id, inv.clanId)).get();
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <div className="flex flex-col items-center gap-3 text-center">
          <ClanAvatar clan={c} size={88} />
          <p className="text-sm text-muted">You&apos;re invited to join</p>
          <h1 className="text-xl font-bold">{c.name}</h1>
          <form action={joinWithInvite.bind(null, code)}>
            <button className={btnPrimary}>Join clan</button>
          </form>
        </div>
      </Card>
    </div>
  );
}
