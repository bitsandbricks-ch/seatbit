"use client";
import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions";
import { Field, Input, btnPrimary, btnSecondary } from "./ui";

/** Adds a guest member: someone without a login yet, managed by the orgas. */
export function GuestForm({
  action,
  submitLabel = "Add guest",
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <Input name="firstName" required maxLength={40} />
        </Field>
        <Field label="Surname">
          <Input name="lastName" required maxLength={40} />
        </Field>
      </div>
      <Field label="Nickname">
        <Input name="nick" maxLength={32} />
      </Field>
      <Field label="Email (optional)" hint="We mail them an invite. Signing in with a Discord account on this address takes the spot over automatically.">
        <Input name="email" type="email" maxLength={200} autoComplete="off" />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && state.message && <p className="text-sm text-bit">{state.message}</p>}
      <button disabled={pending} className={btnSecondary}>
        {pending ? "Adding…" : submitLabel}
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
          placeholder="Their email"
          aria-label="Guest email"
          className="min-w-0 flex-1"
        />
        <button disabled={pending} className={`${btnSecondary} text-xs`}>
          {pending ? "Sending…" : email ? "Send invite again" : "Send invite"}
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
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <Input name="firstName" required maxLength={40} defaultValue={guest.firstName} />
        </Field>
        <Field label="Surname">
          <Input name="lastName" required maxLength={40} defaultValue={guest.lastName} />
        </Field>
      </div>
      <Field label="Nickname" hint="Used everywhere unless a LAN type has its own.">
        <Input name="nick" maxLength={32} defaultValue={guest.nick} />
      </Field>
      {types.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Per LAN type</legend>
          {types.map((t) => (
            <div key={t.id} className="rounded-md border border-line p-3">
              <p className="mb-2 text-sm font-medium">{t.name}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nick">
                  <Input name={`nick_${t.id}`} maxLength={32} defaultValue={t.nick} placeholder={guest.nick || "Same as default"} />
                </Field>
                <Field label="LAN ID">
                  <Input name={`lanId_${t.id}`} maxLength={40} defaultValue={t.lanId} placeholder="e.g. participant number" />
                </Field>
              </div>
            </div>
          ))}
        </fieldset>
      )}
      <Field label="Email" hint="Changing it mails them the invite. If the address already has a Seatbit account, the guest is merged into it.">
        <Input name="email" type="email" maxLength={200} autoComplete="off" defaultValue={guest.email} />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && state.message && <p className="text-sm text-bit">{state.message}</p>}
      <button disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : "Save guest"}
      </button>
    </form>
  );
}
