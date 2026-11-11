"use client";
import { useActionState } from "react";
import { saveLanType, type FormState } from "@/app/actions";
import { Field, Input, btnPrimary, input } from "./ui";

export type LanTypeValues = {
  id?: string;
  clanId?: string;
  name: string;
  description: string;
  location: string;
  websiteUrl: string;
  ticketUrl: string;
  price: string;
  capacity: string;
  reminderDays: number;
  seatSpec: string;
};

export function LanTypeForm({ values }: { values: LanTypeValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveLanType, undefined);
  return (
    <form action={action} className="space-y-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {values.clanId && <input type="hidden" name="clanId" value={values.clanId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" defaultValue={values.name} required placeholder="e.g. Lock & Load" />
        </Field>
        <Field label="Usual location">
          <Input name="location" defaultValue={values.location} />
        </Field>
        <Field label="Event website">
          <Input type="url" name="websiteUrl" defaultValue={values.websiteUrl} placeholder="https://" />
        </Field>
        <Field label="Ticket shop">
          <Input type="url" name="ticketUrl" defaultValue={values.ticketUrl} placeholder="https://" />
        </Field>
        <Field label="Usual ticket price">
          <Input name="price" defaultValue={values.price} />
        </Field>
        <Field label="Usual group spots">
          <Input type="number" min={1} name="capacity" defaultValue={values.capacity} />
        </Field>
        <Field label="Usual seats" hint="e.g. F1-F20. Copied into each new event of this type.">
          <Input name="seatSpec" defaultValue={values.seatSpec} className="font-mono" />
        </Field>
        <Field label="Remind days before deadline">
          <Input type="number" min={0} max={60} name="reminderDays" defaultValue={values.reminderDays} />
        </Field>
      </div>
      <Field label="Description">
        <textarea name="description" defaultValue={values.description} rows={3} className={input} />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className={btnPrimary}>
        {values.id ? "Save type" : "Add type"}
      </button>
    </form>
  );
}
