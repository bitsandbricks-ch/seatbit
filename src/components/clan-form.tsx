"use client";
import { useActionState } from "react";
import { createClan, updateClan } from "@/app/clan-actions";
import type { FormState } from "@/app/actions";
import { Field, Input, btnPrimary, input } from "./ui";
import { NAME_DISPLAYS } from "@/lib/names";
import { LOCALES, LOCALE_NAMES } from "@/i18n/config";
import { useT } from "@/i18n/client";

export function ClanForm({
  clan,
}: {
  clan?: { id: string; name: string; description: string; joinPolicy: string; guestClaims: string; nameDisplay: string; locale: string | null; hasAvatar: boolean };
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(clan ? updateClan : createClan, undefined);
  return (
    <form action={action} className="space-y-4">
      {clan && <input type="hidden" name="clanId" value={clan.id} />}
      <Field label={t("clanForm.name")}>
        <Input name="name" required minLength={2} maxLength={80} defaultValue={clan?.name} placeholder={t("clanForm.namePlaceholder")} />
      </Field>
      <Field label={t("clanForm.description")}>
        <textarea name="description" rows={2} defaultValue={clan?.description} className={input} />
      </Field>
      <Field label={t("clanForm.join")}>
        <select name="joinPolicy" defaultValue={clan?.joinPolicy ?? "approval"} className={input}>
          <option value="approval">{t("clanForm.joinApproval")}</option>
          <option value="open">{t("clanForm.joinOpen")}</option>
          <option value="invite">{t("clanForm.joinInvite")}</option>
        </select>
      </Field>
      <Field
        label={t("clanForm.claims")}
        hint={t("clanForm.claimsHint")}
      >
        <select name="guestClaims" defaultValue={clan?.guestClaims ?? "approval"} className={input}>
          <option value="approval">{t("clanForm.claimsApproval")}</option>
          <option value="match">{t("clanForm.claimsMatch")}</option>
          <option value="off">{t("clanForm.claimsOff")}</option>
        </select>
      </Field>
      <Field
        label={t("clanForm.names")}
        hint={t("clanForm.namesHint")}
      >
        <select name="nameDisplay" defaultValue={clan?.nameDisplay ?? "full"} className={input}>
          {NAME_DISPLAYS.map((d) => (
            <option key={d} value={d}>
              {t(`clanForm.nameDisplay.${d}`)}
              {d === "full" ? ' (Mike "Reyki" Keller)' : d === "nameNick" ? ' (Mike "Reyki")' : " (Reyki)"}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("clanForm.language")} hint={t("clanForm.languageHint")}>
        <select name="locale" defaultValue={clan ? (clan.locale ?? "") : t.locale} className={input}>
          <option value="">{t("clanForm.languageDefault")}</option>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </select>
      </Field>
      {clan && (
        <Field label={t("clanForm.avatar")} hint={t("clanForm.avatarHint")}>
          <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif" className="block w-full text-sm text-fg/90 file:mr-3 file:rounded-md file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-fg" />
          {clan.hasAvatar && (
            <label className="mt-2 flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="removeAvatar" className="accent-bit" /> {t("clanForm.removeAvatar")}
            </label>
          )}
        </Field>
      )}
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className={btnPrimary}>
        {clan ? t("common.save") : t("clanForm.create")}
      </button>
    </form>
  );
}
