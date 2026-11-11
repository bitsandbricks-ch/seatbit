"use client";
import { useActionState } from "react";
import { createClan, updateClan } from "@/app/clan-actions";
import type { FormState } from "@/app/actions";
import { Field, Input, btnPrimary, input } from "./ui";

export function ClanForm({
  clan,
}: {
  clan?: { id: string; name: string; description: string; joinPolicy: string; hasAvatar: boolean };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(clan ? updateClan : createClan, undefined);
  return (
    <form action={action} className="space-y-4">
      {clan && <input type="hidden" name="clanId" value={clan.id} />}
      <Field label="Clan name">
        <Input name="name" required minLength={2} maxLength={80} defaultValue={clan?.name} placeholder="e.g. The Dark Lizards" />
      </Field>
      <Field label="Description">
        <textarea name="description" rows={2} defaultValue={clan?.description} className={input} />
      </Field>
      <Field label="Who can join?">
        <select name="joinPolicy" defaultValue={clan?.joinPolicy ?? "approval"} className={input}>
          <option value="approval">Anyone can ask, an admin approves</option>
          <option value="open">Anyone can join directly</option>
          <option value="invite">Only with an invite link</option>
        </select>
      </Field>
      {clan && (
        <Field label="Avatar" hint="PNG, JPG, WebP or GIF, up to 2 MB.">
          <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif" className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-zinc-100" />
          {clan.hasAvatar && (
            <label className="mt-2 flex items-center gap-2 text-sm text-zinc-400">
              <input type="checkbox" name="removeAvatar" className="accent-bit" /> Remove current avatar
            </label>
          )}
        </Field>
      )}
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button disabled={pending} className={btnPrimary}>
        {clan ? "Save" : "Create clan"}
      </button>
    </form>
  );
}
