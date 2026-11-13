"use client";
import { useActionState, useState } from "react";
import { saveLan, type FormState } from "@/app/actions";
import { DateTimePicker } from "./date-time-picker";
import { PROFILE_URL_HINT } from "@/lib/profile-link";
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
  /** The event's own seat plan, where the leads book the seats. Optional (older callers leave it out). */
  externalPlanUrl?: string;
  /** Profile link pattern with {id}; empty = the LAN type's. */
  profileUrl?: string;
  startsAt: string;
  endsAt: string;
  signupDeadline: string;
  paymentDueDate: string;
  price: string;
  capacity: string;
  reminderDays: number;
  /** In the interest check (new events: whether to start with one). */
  interestCheck?: boolean;
  dateTbd?: boolean;
  dateHint?: string;
  /** Edit only: whether the interest check may be switched here (see interestSwitch). */
  interestSwitch?: "free" | "on-locked" | "off-locked";
};

type TypeOption = { id: string; name: string; durationHours?: number; answerDaysBefore?: number | null };

const toLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v) : null);
const valid = (d: Date | null): d is Date => !!d && !isNaN(d.getTime());

export function LanForm({ values, types }: { values: LanFormValues; types: TypeOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveLan, undefined);
  const [typeId, setTypeId] = useState(values.typeId);
  const [startsAt, setStartsAt] = useState(values.startsAt);
  const [endsAt, setEndsAt] = useState(values.endsAt);
  const [deadline, setDeadline] = useState(values.signupDeadline);
  const [ticketBy, setTicketBy] = useState(values.paymentDueDate);
  const [filled, setFilled] = useState<string | null>(null);
  const type = types.find((t) => t.id === typeId);

  /**
   * A new start moves the other dates with it: when they were set, by the same amount (keeps the
   * event's length and the deadlines' distance); otherwise from the LAN type's usual length and
   * "answer by" days.
   */
  const changeStart = (v: string) => {
    const prev = fromLocal(startsAt);
    const next = fromLocal(v);
    setStartsAt(v);
    if (!valid(next)) return;
    const shift = (s: string) => {
      const d = fromLocal(s);
      return valid(prev) && valid(d) ? toLocal(new Date(d.getTime() + next.getTime() - prev.getTime())) : "";
    };
    const done: string[] = [];
    const end = shift(endsAt) || toLocal(new Date(next.getTime() + (type?.durationHours ?? 46) * 3600_000));
    if (end !== endsAt) {
      setEndsAt(end);
      done.push("end");
    }
    let dl = shift(deadline);
    const days = type ? type.answerDaysBefore : 30;
    if (!dl && days != null) {
      const d = new Date(next.getTime() - days * 86_400_000);
      d.setHours(23, 59, 0, 0);
      dl = toLocal(d);
    }
    if (dl && dl !== deadline) {
      setDeadline(dl);
      done.push("answer by");
    }
    const tb = shift(ticketBy);
    if (tb && tb !== ticketBy) {
      setTicketBy(tb);
      done.push("ticket by");
    }
    setFilled(done.length ? `Moved ${done.join(", ")} along with the start.` : null);
  };
  const [interest, setInterest] = useState(!!values.interestCheck);
  const [tbd, setTbd] = useState(!!values.dateTbd);
  // The date may stay open only during the interest check.
  const open = interest && tbd;
  return (
    <form action={action} className="space-y-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {values.clanId && <input type="hidden" name="clanId" value={values.clanId} />}
      {(values.interestSwitch ?? "free") === "free" ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-raised/40 p-3 text-sm">
          <input
            type="checkbox"
            name="interestCheck"
            checked={interest}
            onChange={(e) => setInterest(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-bit"
          />
          <span>
            Start with an interest check
            <span className="block text-xs text-muted">
              Members first only say whether they&apos;d come, before sign-up, tickets and seats. The date can stay open.
              You open sign-up when you&apos;ve decided.
            </span>
          </span>
        </label>
      ) : (
        <p className="rounded-md border border-line bg-raised/40 p-3 text-xs text-muted">
          {values.interestSwitch === "on-locked"
            ? "This event is in its interest check. End it with “Open sign-up” at the top of the page."
            : "Sign-up is open and members have answered, so it can't go back to an interest check."}
          {interest && <input type="hidden" name="interestCheck" value="on" />}
        </p>
      )}
      {interest && (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-raised/40 p-3 text-sm">
          <input type="checkbox" name="dateTbd" checked={tbd} onChange={(e) => setTbd(e.target.checked)} className="mt-0.5 h-4 w-4 accent-bit" />
          <span>
            Date not fixed yet
            <span className="block text-xs text-muted">Set it before you open sign-up.</span>
          </span>
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="LAN type" hint="Members' nicks for this type carry over to every event of it.">
          <select name="typeId" value={typeId} onChange={(e) => setTypeId(e.target.value)} className={input}>
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
          hint="Where the leads book the group's seats on the event's own site (e.g. the lal.gg Sitzplan). The link changes every year, so set it per event."
        >
          <Input type="url" name="externalPlanUrl" defaultValue={values.externalPlanUrl ?? ""} placeholder="https://" />
        </Field>
        <Field
          label="Member profile link"
          hint="A member's profile on the event's site, with {id} where their LAN ID goes. Empty uses the LAN type's link."
        >
          <Input name="profileUrl" defaultValue={values.profileUrl ?? ""} placeholder={PROFILE_URL_HINT} className="font-mono" />
        </Field>
        {open ? (
          <Field label="Rough date" hint="Optional, shown instead of the date, e.g. “spring 2027” or “usually in March”.">
            <Input name="dateHint" defaultValue={values.dateHint ?? ""} maxLength={60} placeholder="e.g. spring 2027" />
          </Field>
        ) : (
          <>
            <DateField
              label="Starts"
              name="startsAt"
              value={startsAt}
              onChange={changeStart}
              required
              hint={filled ?? "Type or paste e.g. 14.11.2026 18:00, or open the calendar. The other dates follow."}
            />
            <DateField label="Ends" name="endsAt" value={endsAt} onChange={setEndsAt} required defaultTime="16:00" />
          </>
        )}
        <DateField
          label="Answer by"
          name="signupDeadline"
          value={deadline}
          onChange={setDeadline}
          hint="When members must say if they come, e.g. before you book the group's seats. Undecided members get a reminder."
          defaultTime="23:59"
        />
        <DateField
          label="Buy ticket by"
          name="paymentDueDate"
          value={ticketBy}
          onChange={setTicketBy}
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
        {values.id ? "Save changes" : "Save as draft"}
      </button>
    </form>
  );
}

/** Like Field, but not a <label>: the picker has its own buttons, and a wrapping label would hijack clicks. */
function DateField({
  label,
  name,
  value,
  onChange,
  hint,
  required,
  defaultTime,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  required?: boolean;
  defaultTime?: string;
}) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <DateTimePicker name={name} value={value} onChange={onChange} required={required} defaultTime={defaultTime} placeholder={required ? "Pick a date" : "No deadline"} />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </div>
  );
}
