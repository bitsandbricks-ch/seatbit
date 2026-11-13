"use client";
import { setMyLanId } from "@/app/actions";
import { useT } from "@/i18n/client";
import { LAN_ID_MAX } from "@/lib/lan-accounts";
import { btnSecondary, input } from "./ui";

/**
 * The member's participant number/ID at a LAN (lal.gg user ID, ticket number, ...).
 * Pass typeId (profile) or lanId (event page; stored for the event's LAN type). Empty clears it.
 */
export function LanIdForm({
  value,
  lanId,
  typeId,
  label,
}: {
  value: string | null;
  lanId?: string;
  typeId?: string;
  label?: string;
}) {
  const t = useT();
  return (
    <form action={setMyLanId} className="flex gap-2">
      {lanId && <input type="hidden" name="lanId" value={lanId} />}
      {typeId && <input type="hidden" name="typeId" value={typeId} />}
      <input
        key={value ?? ""}
        name="lanAccount"
        defaultValue={value ?? ""}
        maxLength={LAN_ID_MAX}
        placeholder={t("profile.lanIdPlaceholder")}
        className={`${input} font-mono`}
        aria-label={label ?? t("profile.lanId")}
        autoComplete="off"
      />
      <button className={btnSecondary}>{t("common.save")}</button>
    </form>
  );
}
