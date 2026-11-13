import { setMyLanId } from "@/app/actions";
import { getT } from "@/i18n/server";
import { LAN_ID_MAX } from "@/lib/lan-accounts";
import { input } from "./ui";
import { ActionForm } from "@/components/action-form";

/**
 * The member's participant number/ID at a LAN (lal.gg user ID, ticket number, ...).
 * Pass typeId (profile) or lanId (event page; stored for the event's LAN type). Empty clears it.
 */
export async function LanIdForm({
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
  const t = await getT();
  return (
    <ActionForm action={setMyLanId} auto="all" className="flex gap-2">
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
    </ActionForm>
  );
}
