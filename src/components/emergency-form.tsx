"use client";
import { useActionState } from "react";
import { updateEmergencyInfo, type EmergencyState } from "@/app/emergency-actions";
import { Field, Input, btnPrimary, input } from "./ui";
import { useT } from "@/i18n/client";

// Same limits as src/lib/emergency.ts (server-only, so not imported here).
const MAX = { name: 80, phone: 40, diet: 300 };

/** Profile › Emergency: contact person and dietary needs, for the leads of events you come to. */
export function EmergencyForm({ values }: { values: { contactName: string; contactPhone: string; diet: string } }) {
  const t = useT();
  const [state, action, pending] = useActionState<EmergencyState, FormData>(updateEmergencyInfo, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("emergency.contactName")}>
          <Input name="contactName" defaultValue={values.contactName} maxLength={MAX.name} autoComplete="off" placeholder={t("emergency.contactNamePh")} />
        </Field>
        <Field label={t("emergency.contactPhone")}>
          <Input name="contactPhone" type="tel" defaultValue={values.contactPhone} maxLength={MAX.phone} autoComplete="off" placeholder={t("emergency.contactPhonePh")} />
        </Field>
      </div>
      <Field label={t("emergency.diet")} hint={t("emergency.dietHint")}>
        <textarea name="diet" defaultValue={values.diet} rows={3} maxLength={MAX.diet} className={input} placeholder={t("emergency.dietPh")} />
      </Field>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={btnPrimary}>
          {t("common.save")}
        </button>
        {state.ok && !pending && <p className="text-sm text-bit">{t("common.saved")}</p>}
      </div>
    </form>
  );
}
