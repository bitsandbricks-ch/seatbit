"use client";
import { useToastAction } from "./action-form";
import type { FormState } from "@/app/actions";
import { saveCatalogGame } from "@/app/game-catalog-actions";
import { useT } from "@/i18n/client";
import { Field, Input, btnPrimary, input } from "./ui";

/** What the catalog says about a game (platform staff with "games" edit it). */
export type CatalogGameValues = {
  id?: string;
  name: string;
  steamAppId: number | null;
  sizeGb: number | null;
  url: string;
  minPlayers: number | null;
  maxPlayers: number | null;
  free: boolean | null;
  lan: boolean | null;
};

const yesNo = (v: boolean | null) => (v == null ? "" : v ? "yes" : "no");

export function CatalogGameForm({ values }: { values: CatalogGameValues }) {
  const t = useT();
  const [, action, pending] = useToastAction<FormState>(saveCatalogGame, undefined);
  return (
    <form action={action} className="space-y-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("gameCatalog.name")}>
          <Input name="name" defaultValue={values.name} required maxLength={60} />
        </Field>
        <Field label={t("gameCatalog.steamLink")} hint={t("gameCatalog.steamHint")}>
          <Input name="steamAppId" defaultValue={values.steamAppId ?? ""} placeholder="https://store.steampowered.com/app/730/" />
        </Field>
        <Field label={t("gameCatalog.link")}>
          <Input type="url" name="url" defaultValue={values.url} placeholder="https://" />
        </Field>
        <Field label={t("gameCatalog.size")}>
          <Input type="number" min={0} max={2000} name="sizeGb" defaultValue={values.sizeGb ?? ""} />
        </Field>
        <Field label={t("gameCatalog.minPlayers")}>
          <Input type="number" min={1} max={1000} name="minPlayers" defaultValue={values.minPlayers ?? ""} />
        </Field>
        <Field label={t("gameCatalog.maxPlayers")}>
          <Input type="number" min={1} max={1000} name="maxPlayers" defaultValue={values.maxPlayers ?? ""} />
        </Field>
        <Field label={t("gameCatalog.price")}>
          <select name="free" defaultValue={yesNo(values.free)} className={input}>
            <option value="">{t("gameCatalog.unknown")}</option>
            <option value="yes">{t("gameCatalog.free")}</option>
            <option value="no">{t("gameCatalog.paid")}</option>
          </select>
        </Field>
        <Field label={t("gameCatalog.lan")}>
          <select name="lan" defaultValue={yesNo(values.lan)} className={input}>
            <option value="">{t("gameCatalog.unknown")}</option>
            <option value="yes">{t("gameCatalog.lanYes")}</option>
            <option value="no">{t("gameCatalog.lanNo")}</option>
          </select>
        </Field>
        <Field label={t("gameCatalog.cover")} hint={t("gameCatalog.coverHint")}>
          <input type="file" name="cover" accept="image/png,image/jpeg,image/webp,image/gif" className="block w-full text-sm text-muted" />
        </Field>
      </div>
      <button disabled={pending} className={btnPrimary}>
        {values.id ? t("gameCatalog.save") : t("gameCatalog.add")}
      </button>
    </form>
  );
}
