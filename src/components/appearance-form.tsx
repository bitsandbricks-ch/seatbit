"use client";
import { useActionState, useEffect, useState } from "react";
import { updateAppearance, type AppearanceState } from "@/app/actions";
import type { AvatarData } from "@/lib/avatars";
import { Avatar } from "./avatar";
import { btnPrimary, label } from "./ui";
import { useT } from "@/i18n/client";

type Style = "picture" | "icon" | "initials";

/** Profile › Avatar & colour: pick how you show up, with a live preview. */
export function AppearanceForm({
  initial,
  colors,
  icons,
  picture,
  hasUpload,
  initials,
  name,
}: {
  initial: { style: Style; color: string; icon: string | null };
  colors: readonly { id: string; label: string }[];
  icons: readonly string[];
  /** Uploaded or Discord picture, if any. */
  picture: string | null;
  hasUpload: boolean;
  initials: string;
  name: string;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<AppearanceState, FormData>(updateAppearance, {});
  const [style, setStyle] = useState<Style>(initial.style);
  const [color, setColor] = useState(initial.color);
  const [icon, setIcon] = useState(initial.icon);
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const src = style === "picture" ? (preview ?? (remove ? null : picture)) : null;
  const data: AvatarData = { src, icon: style === "icon" ? icon : null, initials, color, label: name };
  const option = (on: boolean) =>
    `flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
      on ? "border-bit bg-bit-soft text-fg" : "border-line bg-raised text-muted hover:text-fg"
    }`;

  return (
    <form action={action} className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar data={data} size={64} />
        <div className="min-w-0 text-sm">
          <p className="font-medium">{name}</p>
          <p className="text-muted">{t("profile.appearance.shownWhere")}</p>
        </div>
      </div>

      <fieldset>
        <legend className={label}>{t("profile.appearance.show")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["picture", t("profile.appearance.picture")],
              ["icon", t("profile.appearance.icon")],
              ["initials", t("profile.appearance.initials")],
            ] as const
          ).map(([id, text]) => (
            <label key={id} className={option(style === id)}>
              <input type="radio" name="avatarStyle" value={id} checked={style === id} onChange={() => setStyle(id)} />
              {text}
            </label>
          ))}
        </div>
      </fieldset>

      {style === "picture" && (
        <div className="space-y-2 text-sm">
          <p className="text-muted">
            {hasUpload
              ? t("profile.appearance.uploaded")
              : picture
                ? t("profile.appearance.discordPicture")
                : t("profile.appearance.upload")}
          </p>
          <input
            type="file"
            name="picture"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
            className="block w-full text-sm text-fg/90 file:mr-3 file:rounded-md file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-fg"
          />
          <p className="text-xs text-faint">{t("profile.appearance.formats")}</p>
          {hasUpload && (
            <label className="flex items-center gap-2 text-muted">
              <input type="checkbox" name="removePicture" checked={remove} onChange={(e) => setRemove(e.target.checked)} />
              {picture ? t("profile.appearance.removeBack") : t("profile.appearance.remove")}
            </label>
          )}
        </div>
      )}

      {style === "icon" && (
        <fieldset>
          <legend className={label}>{t("profile.appearance.icon")}</legend>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
            {icons.map((i) => (
              <label
                key={i}
                className={`grid aspect-square cursor-pointer place-items-center rounded-md border text-xl transition ${
                  icon === i ? "border-bit bg-bit-soft" : "border-line bg-raised hover:border-muted/40"
                }`}
              >
                <input type="radio" name="icon" value={i} checked={icon === i} onChange={() => setIcon(i)} className="sr-only" />
                {i}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {style !== "icon" && icon && <input type="hidden" name="icon" value={icon} />}

      <fieldset>
        <legend className={label}>{t("profile.appearance.colour")}</legend>
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => (
            <label key={c.id} title={c.label} className="cursor-pointer">
              <input type="radio" name="color" value={c.id} checked={color === c.id} onChange={() => setColor(c.id)} className="peer sr-only" />
              <span
                className="block h-9 w-9 rounded-full ring-offset-2 ring-offset-surface transition peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:ring-2 peer-focus-visible:ring-bit"
                style={{ background: c.id }}
              />
              <span className="sr-only">{c.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">{t("profile.appearance.colourHint")}</p>
      </fieldset>

      <div className="flex items-center gap-3">
        <button className={btnPrimary} disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </button>
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        {state.ok && !pending && <p className="text-sm text-bit">{t("common.saved")}</p>}
      </div>
    </form>
  );
}
