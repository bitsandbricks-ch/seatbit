"use client";
import { useActionState } from "react";
import { saveLan, type FormState } from "@/app/actions";
import { Field, Input, btnPrimary, input } from "./ui";

export type LanFormValues = {
  id?: string;
  name: string;
  description: string;
  location: string;
  websiteUrl: string;
  ticketUrl: string;
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
        <Field label="Event name">
          <Input name="name" defaultValue={values.name} required placeholder="e.g. Winter LAN 2026" />
        </Field>
        <Field label="Location">
          <Input name="location" defaultValue={values.location} />
        </Field>
        <Field label="Event website">
          <Input type="url" name="websiteUrl" defaultValue={values.websiteUrl} placeholder="https://" />
        </Field>
        <Field label="Ticket shop">
          <Input type="url" name="ticketUrl" defaultValue={values.ticketUrl} placeholder="https://" />
        </Field>
        <Field label="Starts">
          <Input type="datetime-local" name="startsAt" defaultValue={values.startsAt} required />
        </Field>
        <Field label="Ends">
          <Input type="datetime-local" name="endsAt" defaultValue={values.endsAt} required />
        </Field>
        <Field label="Answer by" hint="When members must say if they come, e.g. before you book the group's seats. Undecided members get a reminder.">
          <Input type="datetime-local" name="signupDeadline" defaultValue={values.signupDeadline} />
        </Field>
        <Field label="Buy ticket by" hint="Attendees without a ticket get a reminder before this.">
          <Input type="datetime-local" name="paymentDueDate" defaultValue={values.paymentDueDate} />
        </Field>
        <Field label="Ticket price">
          <Input name="price" defaultValue={values.price} placeholder="e.g. 25 CHF" />
        </Field>
        <Field label="Group spots" hint="How many seats/tickets the group has. Empty = unlimited. Extra sign-ups go to a waitlist.">
          <Input type="number" min={1} name="capacity" defaultValue={values.capacity} />
        </Field>
        <Field label="Remind days before deadline">
          <Input type="number" min={0} max={60} name="reminderDays" defaultValue={values.reminderDays} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Seat block rows">
            <Input type="number" min={1} max={40} name="seatRows" defaultValue={values.seatRows} />
          </Field>
          <Field label="Seats per row">
            <Input type="number" min={1} max={40} name="seatCols" defaultValue={values.seatCols} />
          </Field>
        </div>
      </div>
      <Field label="Description">
        <textarea name="description" defaultValue={values.description} rows={4} className={input} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="seatingOpen" defaultChecked={values.seatingOpen} className="accent-emerald-500" />
        Attendees can claim seats in the group&apos;s block themselves
      </label>
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button disabled={pending} className={btnPrimary}>
        {values.id ? "Save changes" : "Add LAN"}
      </button>
    </form>
  );
}
