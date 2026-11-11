"use client";
import { useActionState } from "react";
import { saveLan, type FormState } from "@/app/actions";
import { DateTimePicker } from "./date-time-picker";
import { Field, Input, btnPrimary, input, label as labelCls } from "./ui";

export type LanFormValues = {
  id?: string;
  clanId?: string;
  typeId: string;
  name: string;
  description: string;
  location: string;
  websiteUrl: string;
  ticketUrl: string;
  /** The event's own seat plan, where members book their seat. Optional (older callers leave it out). */
  externalPlanUrl?: string;
  startsAt: string;
  endsAt: string;
  signupDeadline: string;
  paymentDueDate: string;
  price: string;
  capacity: string;
  reminderDays: number;
};

export function LanForm({ values, types }: { values: LanFormValues; types: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveLan, undefined);
  return (
    <form action={action} className="space-y-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {values.clanId && <input type="hidden" name="clanId" value={values.clanId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="LAN type" hint="Members' nicks for this type carry over to every event of it.">
          <select name="typeId" defaultValue={values.typeId} className={input}>
            <option value="">None (one-off)</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
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
        <Field
          label="Event seat plan"
          hint="Where members book their seat on the event's own site (e.g. the lal.gg Sitzplan). The link changes every year, so set it per event."
        >
          <Input type="url" name="externalPlanUrl" defaultValue={values.externalPlanUrl ?? ""} placeholder="https://" />
        </Field>
        <DateField label="Starts" name="startsAt" value={values.startsAt} required />
        <DateField label="Ends" name="endsAt" value={values.endsAt} required defaultTime="16:00" />
        <DateField
          label="Answer by"
          name="signupDeadline"
          value={values.signupDeadline}
          hint="When members must say if they come, e.g. before you book the group's seats. Undecided members get a reminder."
          defaultTime="23:59"
        />
        <DateField
          label="Buy ticket by"
          name="paymentDueDate"
          value={values.paymentDueDate}
          hint="Attendees without a ticket get a reminder before this."
          defaultTime="23:59"
        />
        <Field label="Ticket price">
          <Input name="price" defaultValue={values.price} placeholder="e.g. 25 CHF" />
        </Field>
        <Field label="Group spots" hint="How many seats/tickets the group has. Empty = unlimited. Extra sign-ups go to a waitlist.">
          <Input type="number" min={1} name="capacity" defaultValue={values.capacity} />
        </Field>
        <Field label="Remind days before deadline">
          <Input type="number" min={0} max={60} name="reminderDays" defaultValue={values.reminderDays} />
        </Field>
      </div>
      <Field label="Description">
        <textarea name="description" defaultValue={values.description} rows={4} className={input} />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className={btnPrimary}>
        {values.id ? "Save changes" : "Add LAN"}
      </button>
    </form>
  );
}

/** Like Field, but not a <label>: the picker has its own buttons, and a wrapping label would hijack clicks. */
function DateField({
  label,
  name,
  value,
  hint,
  required,
  defaultTime,
}: {
  label: string;
  name: string;
  value: string;
  hint?: string;
  required?: boolean;
  defaultTime?: string;
}) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <DateTimePicker name={name} defaultValue={value} required={required} defaultTime={defaultTime} placeholder={required ? "Pick a date" : "No deadline"} />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </div>
  );
}
