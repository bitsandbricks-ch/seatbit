"use client";
import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions";
import { Field, Input, btnPrimary, btnSecondary } from "./ui";
import { useT } from "@/i18n/client";

/** Adds a guest member: someone without a login yet, managed by the leads. */
export function GuestForm({
  action,
  submitLabel,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  submitLabel?: string;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("auth.firstName")}>
          <Input name="firstName" required maxLength={40} />
        </Field>
        <Field label={t("auth.surname")}>
          <Input name="lastName" required maxLength={40} />
        </Field>
      </div>
      <Field label={t("auth.nickname")}>
        <Input name="nick" maxLength={32} />
      </Field>
      <Field label={t("guestForm.emailOptional")} hint={t("guestForm.emailHint")}>
        <Input name="email" type="email" maxLength={200} autoComplete="off" />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && state.message && <p className="text-sm text-bit">{state.message}</p>}
      <button disabled={pending} className={btnSecondary}>
        {pending ? t("guestForm.adding") : (submitLabel ?? t("clanSettings.addGuestSubmit"))}
      </button>
    </form>
  );
}

/** Sets a guest's email and sends the invite (again). */
export function GuestEmailForm({
  action,
  email,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  email: string | null;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Input
          name="email"
          type="email"
          required
          maxLength={200}
          defaultValue={email ?? ""}
          placeholder={t("guestForm.theirEmail")}
          aria-label={t("guestForm.guestEmail")}
          className="min-w-0 flex-1"
        />
        <button disabled={pending} className={`${btnSecondary} text-xs`}>
          {pending ? t("eventUi.sending") : t(email ? "guestForm.sendAgain" : "guestForm.send")}
        </button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {state?.ok && state.message && <p className="text-xs text-bit">{state.message}</p>}
    </form>
  );
}

export type GuestEditTypeRow = { id: string; name: string; nick: string; lanId: string };

/**
 * Clan admins edit a guest who hasn't claimed their spot yet: name, nicks, LAN IDs per LAN type and email.
 * Everything here carries over when the guest claims the spot.
 */
export function GuestEditForm({
  action,
  guest,
  types,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  guest: { firstName: string; lastName: string; nick: string; email: string };
  types: GuestEditTypeRow[];
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("auth.firstName")}>
          <Input name="firstName" required maxLength={40} defaultValue={guest.firstName} />
        </Field>
        <Field label={t("auth.surname")}>
          <Input name="lastName" required maxLength={40} defaultValue={guest.lastName} />
        </Field>
      </div>
      <Field label={t("auth.nickname")} hint={t("guestForm.nickHint")}>
        <Input name="nick" maxLength={32} defaultValue={guest.nick} />
      </Field>
      {types.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("guestForm.perType")}</legend>
          {types.map((ty) => (
            <div key={ty.id} className="rounded-md border border-line p-3">
              <p className="mb-2 text-sm font-medium">{ty.name}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nick">
                  <Input name={`nick_${ty.id}`} maxLength={32} defaultValue={ty.nick} placeholder={guest.nick || t("guestForm.sameAsDefault")} />
                </Field>
                <Field label={t("guestForm.lanId")}>
                  <Input name={`lanId_${ty.id}`} maxLength={40} defaultValue={ty.lanId} placeholder={t("guestForm.lanIdPlaceholder")} />
                </Field>
              </div>
            </div>
          ))}
        </fieldset>
      )}
      <Field label={t("member.email")} hint={t("guestForm.emailEditHint")}>
        <Input name="email" type="email" maxLength={200} autoComplete="off" defaultValue={guest.email} />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && state.message && <p className="text-sm text-bit">{state.message}</p>}
      <button disabled={pending} className={btnPrimary}>
        {pending ? t("common.saving") : t("guestForm.save")}
      </button>
    </form>
  );
}
