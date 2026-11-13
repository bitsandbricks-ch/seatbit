import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { completeProfile } from "@/app/actions";
import { Field, Input, btnPrimary, cardPage, cardPageTitle } from "@/components/ui";
import { isProfileComplete, requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";
import { LanguageLinks } from "@/components/language-switch";

/** First login: ask for the real name and the gamer tag (Discord only gives us a display name). */
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const me = await requireUser({ allowIncomplete: true });
  const t = await getT();
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
        <h1 className={cardPageTitle}>{t("welcome.title")}</h1>
        <p className="text-sm text-muted">{t("welcome.intro")}</p>
        <p className="text-xs text-muted">
          {t("language.label")}: <LanguageLinks />
        </p>
      </div>
      <form action={completeProfile} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("auth.firstName")}>
            <Input name="firstName" defaultValue={me.firstName} required maxLength={40} autoComplete="given-name" />
          </Field>
          <Field label={t("auth.surname")}>
            <Input name="lastName" defaultValue={me.lastName} required maxLength={40} autoComplete="family-name" />
          </Field>
        </div>
        <Field label={t("auth.nickname")} hint={t("auth.nickHint")}>
          <Input name="nick" defaultValue={nick.slice(0, 32)} required maxLength={32} autoComplete="nickname" />
        </Field>
        <input type="hidden" name="emailReminders" value={me.emailReminders ? "on" : ""} />
        <p className="text-xs text-muted">{t("welcome.reminders", { email: me.email })}</p>
        <button className={`${btnPrimary} w-full`}>{t("welcome.continue")}</button>
      </form>
    </div>
  );
}
