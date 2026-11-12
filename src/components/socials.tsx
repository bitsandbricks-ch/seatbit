"use client";
import { useActionState } from "react";
import { updateSocials, type AppearanceState } from "@/app/actions";
import { SOCIALS, SOCIAL_MAX } from "@/lib/socials";
import { Field, Input, btnPrimary } from "./ui";

/** Profile › Socials: gaming and social handles shown on the member profile. */
export function SocialsForm({ values }: { values: Record<string, string> }) {
  const [state, action, pending] = useActionState<AppearanceState, FormData>(updateSocials, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {SOCIALS.map((s) => (
          <Field key={s.key} label={s.label}>
            <Input name={s.key} defaultValue={values[s.key] ?? ""} maxLength={SOCIAL_MAX} placeholder={s.placeholder} autoComplete="off" />
          </Field>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={btnPrimary}>
          Save
        </button>
        {state.ok && !pending && <p className="text-sm text-bit">Saved.</p>}
      </div>
    </form>
  );
}
