"use client";
import { useTransition } from "react";
import { setMyTicketBought } from "@/app/actions";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";

/** "I have my ticket" checkbox for members (sets ticketBought). Locked once a lead confirmed the ticket. */
export function TicketConfirm({ lanId, bought, confirmed, label }: { lanId: string; bought: boolean; confirmed: boolean; label?: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  const run = useRunAction();
  return (
    <div>
      <label className="flex items-center gap-3 rounded-md border border-line bg-raised px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          key={String(bought || confirmed)}
          defaultChecked={bought || confirmed}
          disabled={pending || confirmed}
          onChange={(e) => {
            const v = e.target.checked;
            start(async () => {
              await run(() => setMyTicketBought(lanId, v));
            });
          }}
          className="h-5 w-5 accent-bit"
        />
        <span>
          {label ?? t("eventUi.haveTicket")}
          {confirmed && <span className="ml-1 text-xs text-muted">{t("eventUi.confirmedByLead")}</span>}
        </span>
      </label>
    </div>
  );
}
