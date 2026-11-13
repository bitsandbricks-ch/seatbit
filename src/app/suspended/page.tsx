import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { cardPage, cardPageTitle } from "@/components/ui";
import { getLegal } from "@/lib/legal";
import { getSuspendedAccount } from "@/lib/session";
import { getT } from "@/i18n/server";

/** Where a suspended account lands instead of the app. */
export default async function SuspendedPage() {
  const u = await getSuspendedAccount();
  if (!u) redirect("/");
  const t = await getT();
  const contact = getLegal().contactEmail;
  return (
    <div className={cardPage}>
      <h1 className={cardPageTitle}>{t("suspended.title")}</h1>
      <p className="text-sm text-muted">{t("suspended.text")}</p>
      {u.suspendedReason && <p className="rounded-md bg-raised p-3 text-sm">{t("suspended.reason", { reason: u.suspendedReason })}</p>}
      {contact && (
        <p className="text-sm text-muted">
          {t.rich("suspended.contact", {
            email: (
              <a href={`mailto:${contact}`} className="text-bit hover:underline">
                {contact}
              </a>
            ),
          })}
        </p>
      )}
      <SignOutButton />
    </div>
  );
}
