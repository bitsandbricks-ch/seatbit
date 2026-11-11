"use client";
import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions";
import { Field, Input, btnSecondary } from "./ui";

/** Adds a guest member: someone without a login yet, managed by the orgas. */
export function GuestForm({ action }: { action: (s: FormState, f: FormData) => Promise<FormState> }) {
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
          <Input name="lastName" maxLength={40} />
        </Field>
      </div>
      <Field label="Nickname">
        <Input name="nick" maxLength={32} />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className={btnSecondary}>
        Add guest
      </button>
    </form>
  );
}
