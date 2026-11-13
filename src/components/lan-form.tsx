"use client";
import { useActionState, useState } from "react";
import { saveLan, type FormState } from "@/app/actions";
import { DateTimePicker } from "./date-time-picker";
import { PROFILE_URL_HINT } from "@/lib/profile-link";
import { Field, Input, btnPrimary, input, label as labelCls } from "./ui";
import { useT } from "@/i18n/client";

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
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveLan, undefined);
  const [typeId, setTypeId] = useState(values.typeId);
  const [startsAt, setStartsAt] = useState(values.startsAt);
  const [endsAt, setEndsAt] = useState(values.endsAt);
  const [deadline, setDeadline] = useState(values.signupDeadline);
  const [ticketBy, setTicketBy] = useState(values.paymentDueDate);
  const [filled, setFilled] = useState<string | null>(null);
  const type = types.find((x) => x.id === typeId);

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
      done.push(t("lanForm.moved.end"));
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
      done.push(t("lanForm.moved.answerBy"));
    }
    const tb = shift(ticketBy);
    if (tb && tb !== ticketBy) {
      setTicketBy(tb);
      done.push(t("lanForm.moved.ticketBy"));
    }
    setFilled(done.length ? t("lanForm.moved.text", { what: done.join(", ") }) : null);
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
            {t("lanForm.interest")}
            <span className="block text-xs text-muted">{t("lanForm.interestHint")}</span>
          </span>
        </label>
      ) : (
        <p className="rounded-md border border-line bg-raised/40 p-3 text-xs text-muted">
          {t(values.interestSwitch === "on-locked" ? "lanForm.interestOn" : "lanForm.interestLocked")}
          {interest && <input type="hidden" name="interestCheck" value="on" />}
        </p>
      )}
      {interest && (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-raised/40 p-3 text-sm">
          <input type="checkbox" name="dateTbd" checked={tbd} onChange={(e) => setTbd(e.target.checked)} className="mt-0.5 h-4 w-4 accent-bit" />
          <span>
            {t("lanForm.tbd")}
            <span className="block text-xs text-muted">{t("lanForm.tbdHint")}</span>
          </span>
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("lanForm.type")} hint={t("lanForm.typeHint")}>
          <select name="typeId" value={typeId} onChange={(e) => setTypeId(e.target.value)} className={input}>
            <option value="">{t("lanForm.typeNone")}</option>
            {types.map((ty) => (
              <option key={ty.id} value={ty.id}>
                {ty.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("lanForm.name")}>
          <Input name="name" defaultValue={values.name} required placeholder={t("lanForm.namePlaceholder")} />
        </Field>
        <Field label={t("lanForm.location")}>
          <Input name="location" defaultValue={values.location} />
        </Field>
        <Field label={t("lanForm.website")}>
          <Input type="url" name="websiteUrl" defaultValue={values.websiteUrl} placeholder="https://" />
        </Field>
        <Field label={t("bot.ticketShop")}>
          <Input type="url" name="ticketUrl" defaultValue={values.ticketUrl} placeholder="https://" />
        </Field>
        <Field
          label={t("lanForm.plan")}
          hint={t("lanForm.planHint")}
        >
          <Input type="url" name="externalPlanUrl" defaultValue={values.externalPlanUrl ?? ""} placeholder="https://" />
        </Field>
        <Field
          label={t("lanForm.profile")}
          hint={t("lanForm.profileHint", { id: "{id}" })}
        >
          <Input name="profileUrl" defaultValue={values.profileUrl ?? ""} placeholder={PROFILE_URL_HINT} className="font-mono" />
        </Field>
        {open ? (
          <Field label={t("lanForm.rough")} hint={t("lanForm.roughHint")}>
            <Input name="dateHint" defaultValue={values.dateHint ?? ""} maxLength={60} placeholder={t("lanForm.roughPlaceholder")} />
          </Field>
        ) : (
          <>
            <DateField
              label={t("manage.starts")}
              name="startsAt"
              value={startsAt}
              onChange={changeStart}
              required
              hint={filled ?? t("lanForm.startsHint")}
            />
            <DateField label={t("lanForm.ends")} name="endsAt" value={endsAt} onChange={setEndsAt} required defaultTime="16:00" />
          </>
        )}
        <DateField
          label={t("notice.field.answerBy")}
          name="signupDeadline"
          value={deadline}
          onChange={setDeadline}
          hint={t("lanForm.answerHint")}
          defaultTime="23:59"
        />
        <DateField
          label={t("manage.buyTicketBy")}
          name="paymentDueDate"
          value={ticketBy}
          onChange={setTicketBy}
          hint={t("lanForm.ticketHint")}
          defaultTime="23:59"
        />
        <Field label={t("lanForm.price")}>
          <Input name="price" defaultValue={values.price} placeholder={t("lanForm.pricePlaceholder")} />
        </Field>
        <Field label={t("lanForm.spots")} hint={t("lanForm.spotsHint")}>
          <Input type="number" min={1} name="capacity" defaultValue={values.capacity} />
        </Field>
        <Field label={t("lanForm.remindDays")}>
          <Input type="number" min={0} max={60} name="reminderDays" defaultValue={values.reminderDays} />
        </Field>
      </div>
      <Field label={t("lanForm.description")}>
        <textarea name="description" defaultValue={values.description} rows={4} className={input} />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className={btnPrimary}>
        {values.id ? t("lanForm.saveChanges") : t("lanForm.saveDraft")}
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
  const t = useT();
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <DateTimePicker name={name} value={value} onChange={onChange} required={required} defaultTime={defaultTime} placeholder={required ? t("picker.pick") : t("lanForm.noDeadline")} />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </div>
  );
}
