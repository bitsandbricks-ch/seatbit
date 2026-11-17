"use client";
import { useToastAction } from "./action-form";
import type { FormState } from "@/app/actions";
import { saveLanType } from "@/app/lan-type-actions";
import { DISCORD_MODES, type DiscordMode } from "@/lib/discord-modes";
import { useT } from "@/i18n/client";
import { PROFILE_URL_HINT } from "@/lib/profile-link";
import { Field, Input, btnPrimary, input } from "./ui";

/** What a global LAN type says about the LAN party itself (platform staff edit it). */
export type LanTypeValues = {
  id?: string;
  name: string;
  description: string;
  location: string;
  websiteUrl: string;
  ticketUrl: string;
  price: string;
  durationHours: number;
  profileUrl: string;
};

export function LanTypeForm({ values }: { values: LanTypeValues }) {
  const t = useT();
  const [, action, pending] = useToastAction<FormState>(saveLanType, undefined);
  return (
    <form action={action} className="space-y-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
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
        <Field label={t("lanForm.profile")} hint={t("typeForm.profileHint", { id: "{id}" })}>
          <Input name="profileUrl" defaultValue={values.profileUrl} placeholder={PROFILE_URL_HINT} className="font-mono" />
        </Field>
        <Field label={t("typeForm.price")}>
          <Input name="price" defaultValue={values.price} />
        </Field>
        <Field label={t("typeForm.length")} hint={t("typeForm.lengthHint")}>
          <Input type="number" min={1} max={336} name="durationHours" defaultValue={values.durationHours} />
        </Field>
      </div>
      <Field label={t("lanForm.description")}>
        <textarea name="description" defaultValue={values.description} rows={3} className={input} />
      </Field>
      <button disabled={pending} className={btnPrimary}>
        {values.id ? t("typeForm.save") : t("typeForm.add")}
      </button>
    </form>
  );
}

/** A clan's own defaults for events of a LAN type. */
export type ClanTypeValues = {
  capacity: string;
  reminderDays: number;
  seatSpec: string;
  answerDaysBefore: string;
  discordMode: DiscordMode;
};

export function ClanTypeForm({
  action,
  values,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  values: ClanTypeValues;
}) {
  const t = useT();
  const [, formAction, pending] = useToastAction<FormState>(action, undefined);
  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("typeForm.spots")} hint={t("typeForm.spotsHint")}>
          <Input type="number" min={1} name="capacity" defaultValue={values.capacity} />
        </Field>
        <Field label={t("typeForm.seats")} hint={t("typeForm.seatsHint")}>
          <Input name="seatSpec" defaultValue={values.seatSpec} className="font-mono" />
        </Field>
        <Field label={t("typeForm.answerDays")} hint={t("typeForm.answerDaysHint")}>
          <Input type="number" min={0} max={365} name="answerDaysBefore" defaultValue={values.answerDaysBefore} />
        </Field>
        <Field label={t("lanForm.remindDays")}>
          <Input type="number" min={0} max={60} name="reminderDays" defaultValue={values.reminderDays} />
        </Field>
        <Field label="Discord" hint={t("typeForm.discordHint")}>
          <select name="discordMode" defaultValue={values.discordMode} className={input}>
            {DISCORD_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`typeForm.mode.${m}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button disabled={pending} className={btnPrimary}>
        {pending ? t("common.saving") : t("common.save")}
      </button>
    </form>
  );
}
