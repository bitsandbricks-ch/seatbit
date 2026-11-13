import { Notice } from "@/components/ui";
import { SuspendedClan } from "@/components/suspended-clan";
import { getClanBySlug } from "@/lib/clans";
import { platformCan } from "@/lib/platform-roles";
import { getCurrentUser } from "@/lib/session";
import { getT } from "@/i18n/server";

/** A suspended clan is closed for everyone but platform staff, who see it with a banner. */
export default async function ClanLayout({ children, params }: LayoutProps<"/clans/[slug]">) {
  const c = getClanBySlug((await params).slug);
  if (!c?.suspendedAt) return children;
  const me = await getCurrentUser();
  if (!platformCan(me, "view")) return <SuspendedClan name={c.name} />;
  const t = await getT();
  return (
    <div className="space-y-4">
      <Notice tone="danger">
        {t("suspended.staffBanner")}
        {c.suspendedReason && ` ${t("suspended.reason", { reason: c.suspendedReason })}`}
      </Notice>
      {children}
    </div>
  );
}
