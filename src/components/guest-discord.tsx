"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/app/admin/settings/actions";
import { Result } from "./settings-section";
import { btnGhost, btnSecondary } from "./ui";

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
  const [sent, resendAction, sending] = useActionState(resend, undefined);
  const [dropped, unlinkAction, unlinking] = useActionState(unlink, undefined);
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
              {sending ? "Sending…" : "Send the DM again"}
            </button>
          </form>
          <form action={unlinkAction}>
            <button disabled={unlinking} className={`${btnGhost} text-xs !text-danger`}>
              Unlink
            </button>
          </form>
        </div>
      )}
      <Result state={sent ?? dropped} />
      <p className="text-xs text-faint">
        {linked ? "To link someone else, run /guest again in Discord." : "Link them in Discord with /guest guest:… member:…"}
      </p>
    </div>
  );
}
