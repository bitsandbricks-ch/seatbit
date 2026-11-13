import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { joinWithInvite } from "@/app/clan-actions";
import { ClanAvatar } from "@/components/clan-avatar";
import { btnPrimary, cardPage, cardPageTitle } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { ActionForm } from "@/components/action-form";

export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const me = await getCurrentUser();
  const t = await getT();
  if (!me) redirect(`/register?next=${encodeURIComponent(`/join/${code}`)}`);
  const inv = db.select().from(schema.clanInvite).where(eq(schema.clanInvite.code, code)).get();
  const c = inv && db.select().from(schema.clan).where(eq(schema.clan.id, inv.clanId)).get();
  if (!c) notFound();
  return (
    <div className={cardPage}>
        <div className="flex flex-col items-center gap-3 text-center">
          <ClanAvatar clan={c} size={88} />
          <p className="text-sm text-muted">{t("joinPage.invited")}</p>
          <h1 className={cardPageTitle}>{c.name}</h1>
          <ActionForm action={joinWithInvite.bind(null, code)} done={false}>
            <button className={btnPrimary}>{t("joinPage.join")}</button>
          </ActionForm>
        </div>
    </div>
  );
}
