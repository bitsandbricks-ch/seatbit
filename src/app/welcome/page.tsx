import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { completeProfile } from "@/app/actions";
import { Field, Input, btnPrimary, cardPage, cardPageTitle } from "@/components/ui";
import { isProfileComplete, requireUser } from "@/lib/session";

/** First login: ask for the real name and the gamer tag (Discord only gives us a display name). */
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const me = await requireUser({ allowIncomplete: true });
  const raw = (await searchParams).next;
  const next = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  if (isProfileComplete(me)) redirect(next);
  const nick =
    db
      .select({ nick: schema.nickname.nick })
      .from(schema.nickname)
      .where(and(eq(schema.nickname.userId, me.id), isNull(schema.nickname.lanId), isNull(schema.nickname.typeId)))
      .get()?.nick ?? me.name;

  return (
    <div className={`${cardPage} !space-y-6`}>
      <div className="space-y-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/seatbit-mark.svg" alt="" className="mb-3 h-10 w-10" />
        <h1 className={cardPageTitle}>Welcome to Seatbit</h1>
        <p className="text-sm text-muted">
          Tell your clan who you are. Your name helps leads book tickets, your nickname is what everyone sees.
        </p>
      </div>
      <form action={completeProfile} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <Input name="firstName" defaultValue={me.firstName} required maxLength={40} autoComplete="given-name" />
          </Field>
          <Field label="Surname">
            <Input name="lastName" defaultValue={me.lastName} required maxLength={40} autoComplete="family-name" />
          </Field>
        </div>
        <Field label="Nickname" hint="Your gamer tag. You can set a different one per LAN type later.">
          <Input name="nick" defaultValue={nick.slice(0, 32)} required maxLength={32} autoComplete="nickname" />
        </Field>
        <input type="hidden" name="emailReminders" value={me.emailReminders ? "on" : ""} />
        <p className="text-xs text-muted">Reminders go to {me.email}, the email on your Discord account.</p>
        <button className={`${btnPrimary} w-full`}>Continue</button>
      </form>
    </div>
  );
}
