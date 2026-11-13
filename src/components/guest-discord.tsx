"use client";

import { useToastAction } from "./action-form";
import type { ActionResult } from "@/app/admin/settings/actions";
import { btnGhost, btnSecondary } from "./ui";
import { useT } from "@/i18n/client";

type Act = (prev: ActionResult) => Promise<ActionResult>;

/**
 * The Discord member a lead linked a guest to with /guest: who, when, the DM, and
 * buttons to send the DM again or drop the link. Re-linking someone else happens in Discord.
 */
export function GuestDiscordLink({
  linked,
  lines,
  resend,
  unlink,
}: {
  linked: boolean;
  lines: string[];
  resend: Act;
  unlink: Act;
}) {
  const t = useT();
  const [, resendAction, sending] = useToastAction(resend, undefined);
  const [, unlinkAction, unlinking] = useToastAction(unlink, undefined);
  return (
    <div className="space-y-2">
      <ul className="space-y-0.5 text-sm">
        {lines.map((l) => (
          <li key={l} className="text-muted first:text-fg">
            {l}
          </li>
        ))}
      </ul>
      {linked && (
        <div className="flex flex-wrap items-center gap-2">
          <form action={resendAction}>
            <button disabled={sending} className={`${btnSecondary} text-xs`}>
              {sending ? t("eventUi.sending") : t("guestDiscord.resend")}
            </button>
          </form>
          <form action={unlinkAction}>
            <button disabled={unlinking} className={`${btnGhost} text-xs !text-danger`}>
              {t("clanSettings.unlink")}
            </button>
          </form>
        </div>
      )}
      <p className="text-xs text-faint">
        {t(linked ? "guestDiscord.relink" : "guestDiscord.howToLink")}
      </p>
    </div>
  );
}
