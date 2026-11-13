import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-url";
import { AuthForm } from "@/components/auth-form";
import { cardPage, cardPageTitle } from "@/components/ui";
import { enabledProviders, signupOpen } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { getT } from "@/i18n/server";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const raw = (await searchParams).next;
  // Only allow same-site paths.
  const next = safeNext(raw);
  if (await getCurrentUser()) redirect(next);
  const providers = enabledProviders();
  // Without email sign-up, Discord's button both signs in and creates accounts: one page is enough.
  if (!providers.email) redirect(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
  if (!signupOpen()) {
    const t = await getT();
    return (
      <div className={`${cardPage} text-sm`}>
        <h1 className={cardPageTitle}>{t("pages.signupClosed")}</h1>
        <p className="text-muted">{t("pages.signupClosedHint")}</p>
        <Link href="/login" className="text-bit hover:underline">
          {t("pages.signInExisting")}
        </Link>
      </div>
    );
  }
  return <AuthForm mode="register" providers={providers} next={next} />;
}
