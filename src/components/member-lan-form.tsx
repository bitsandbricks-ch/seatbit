"use client";
import type { FormState } from "@/app/actions";
import { useToastAction } from "./action-form";
import { LanTypeFields, type GuestEditTypeRow } from "./guest-form";
import { btnPrimary, btnSecondary } from "./ui";
import { useT } from "@/i18n/client";

/**
 * Clan admins (and platform admins) set a member's nick and LAN ID per LAN type of the clan.
 * Folded behind a button, since it's a rare fix rather than something to look at.
 */
export function MemberLanForm({
  action,
  types,
  defaultNick,
  label,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  types: GuestEditTypeRow[];
  defaultNick: string;
  /** Button text; defaults to "Edit nicks & LAN IDs". */
  label?: string;
}) {
  const t = useT();
  const [, formAction, pending] = useToastAction(action, undefined);
  if (types.length === 0) return null;
  return (
    <details className="group">
      <summary className={`${btnSecondary} cursor-pointer list-none`}>{label ?? t("memberLan.edit")}</summary>
      <form action={formAction} className="mt-3 space-y-3">
        <p className="text-xs text-muted">{t("memberLan.hint")}</p>
        <LanTypeFields types={types} defaultNick={defaultNick} />
        <button disabled={pending} className={btnPrimary}>
          {pending ? t("common.saving") : t("common.save")}
        </button>
      </form>
    </details>
  );
}
