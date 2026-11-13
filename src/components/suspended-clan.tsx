import Link from "next/link";
import { EmptyState, Page, btnSecondary } from "./ui";
import { getT } from "@/i18n/server";

/** What members see instead of a suspended clan or one of its events. */
export async function SuspendedClan({ name }: { name: string }) {
  const t = await getT();
  return (
    <Page>
      <EmptyState
        icon="users"
        title={t("suspended.clanTitle", { name })}
        action={
          <Link href="/" className={btnSecondary}>
            {t("suspended.home")}
          </Link>
        }
      >
        {t("suspended.clanText")}
      </EmptyState>
    </Page>
  );
}
