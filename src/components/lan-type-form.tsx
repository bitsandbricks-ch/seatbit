"use client";
import { useActionState } from "react";
import { saveLanType, type FormState } from "@/app/actions";
import { DISCORD_MODES, type DiscordMode } from "@/lib/discord-modes";
import { useT } from "@/i18n/client";
import { PROFILE_URL_HINT } from "@/lib/profile-link";
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
  durationHours: number;
  answerDaysBefore: string;
  discordMode: DiscordMode;
  profileUrl: string;
};

export function LanTypeForm({ values }: { values: LanTypeValues }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveLanType, undefined);
  return (
    <form action={action} className="space-y-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {values.clanId && <input type="hidden" name="clanId" value={values.clanId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("attendees.col.name")}>
          <Input name="name" defaultValue={values.name} required placeholder={t("typeForm.namePlaceholder")} />
        </Field>
        <Field label={t("typeForm.location")}>
          <Input name="location" defaultValue={values.location} />
        </Field>
        <Field label={t("lanForm.website")}>
          <Input type="url" name="websiteUrl" defaultValue={values.websiteUrl} placeholder="https://" />
        </Field>
        <Field label={t("bot.ticketShop")}>
          <Input type="url" name="ticketUrl" defaultValue={values.ticketUrl} placeholder="https://" />
        </Field>
        <Field
          label={t("lanForm.profile")}
          hint={t("typeForm.profileHint", { id: "{id}" })}
        >
          <Input name="profileUrl" defaultValue={values.profileUrl} placeholder={PROFILE_URL_HINT} className="font-mono" />
        </Field>
        <Field label={t("typeForm.price")}>
          <Input name="price" defaultValue={values.price} />
        </Field>
        <Field label={t("typeForm.spots")}>
          <Input type="number" min={1} name="capacity" defaultValue={values.capacity} />
        </Field>
        <Field label={t("typeForm.seats")} hint={t("typeForm.seatsHint")}>
          <Input name="seatSpec" defaultValue={values.seatSpec} className="font-mono" />
        </Field>
        <Field label={t("typeForm.length")} hint={t("typeForm.lengthHint")}>
          <Input type="number" min={1} max={336} name="durationHours" defaultValue={values.durationHours} />
        </Field>
        <Field label={t("typeForm.answerDays")} hint={t("typeForm.answerDaysHint")}>
          <Input type="number" min={0} max={365} name="answerDaysBefore" defaultValue={values.answerDaysBefore} />
        </Field>
        <Field label={t("lanForm.remindDays")}>
          <Input type="number" min={0} max={60} name="reminderDays" defaultValue={values.reminderDays} />
        </Field>
        <Field
          label="Discord"
          hint={t("typeForm.discordHint")}
        >
          <select name="discordMode" defaultValue={values.discordMode} className={input}>
            {DISCORD_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`typeForm.mode.${m}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t("lanForm.description")}>
        <textarea name="description" defaultValue={values.description} rows={3} className={input} />
      </Field>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className={btnPrimary}>
        {values.id ? t("typeForm.save") : t("typeForm.add")}
      </button>
    </form>
  );
}
