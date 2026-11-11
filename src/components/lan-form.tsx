"use client";
import { useActionState } from "react";
import { saveLan, type FormState } from "@/app/actions";
import { Field, Input, btnPrimary, input } from "./ui";

export type LanFormValues = {
  id?: string;
  name: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  signupDeadline: string;
  paymentDueDate: string;
  price: string;
  capacity: string;
  reminderDays: number;
  seatRows: number;
  seatCols: number;
  seatingOpen: boolean;
};

export function LanForm({ values }: { values: LanFormValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveLan, undefined);
  return (
    <form action={action} className="space-y-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" defaultValue={values.name} required />
        </Field>
        <Field label="Location">
          <Input name="location" defaultValue={values.location} />
        </Field>
        <Field label="Starts">
          <Input type="datetime-local" name="startsAt" defaultValue={values.startsAt} required />
        </Field>
        <Field label="Ends">
          <Input type="datetime-local" name="endsAt" defaultValue={values.endsAt} required />
        </Field>
        <Field label="Answer by (sign-up deadline)" hint="Members who haven't answered get a reminder before this.">
          <Input type="datetime-local" name="signupDeadline" defaultValue={values.signupDeadline} />
        </Field>
        <Field label="Payment due" hint="Unpaid attendees get a reminder before this.">
          <Input type="datetime-local" name="paymentDueDate" defaultValue={values.paymentDueDate} />
        </Field>
        <Field label="Price">
          <Input name="price" defaultValue={values.price} placeholder="e.g. 25 CHF" />
        </Field>
        <Field label="Capacity" hint="Empty = unlimited. Extra sign-ups go to a waitlist.">
          <Input type="number" min={1} name="capacity" defaultValue={values.capacity} />
        </Field>
        <Field label="Remind days before deadline">
          <Input type="number" min={0} max={60} name="reminderDays" defaultValue={values.reminderDays} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Seat rows">
            <Input type="number" min={1} max={40} name="seatRows" defaultValue={values.seatRows} />
          </Field>
          <Field label="Seat columns">
            <Input type="number" min={1} max={40} name="seatCols" defaultValue={values.seatCols} />
          </Field>
        </div>
      </div>
      <Field label="Description">
        <textarea name="description" defaultValue={values.description} rows={4} className={input} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="seatingOpen" defaultChecked={values.seatingOpen} className="accent-emerald-500" />
        Attendees can pick their own seats
      </label>
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button disabled={pending} className={btnPrimary}>
        {values.id ? "Save changes" : "Create LAN"}
      </button>
    </form>
  );
}
