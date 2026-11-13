"use client";
import { setNick } from "@/app/actions";
import { useT } from "@/i18n/client";
import type { Nickname } from "@/db/schema";
import { btnSecondary, input } from "./ui";

/** One nick per scope: default (no ids), a LAN type, or a single event. Empty clears it. */
export function NickManager({
  nicks,
  lanId = null,
  typeId = null,
  placeholder,
}: {
  nicks: Nickname[];
  lanId?: string | null;
  typeId?: string | null;
  placeholder?: string;
}) {
  const t = useT();
  const current = nicks.find((n) => n.lanId === lanId && n.typeId === typeId)?.nick ?? "";
  return (
    <form action={setNick} className="flex gap-2">
      {lanId && <input type="hidden" name="lanId" value={lanId} />}
      {typeId && <input type="hidden" name="typeId" value={typeId} />}
      <input
        key={current}
        name="nick"
        defaultValue={current}
        maxLength={32}
        placeholder={placeholder ?? t("profile.yourNick")}
        className={input}
        aria-label={t("auth.nickname")}
      />
      <button className={btnSecondary}>{t("common.save")}</button>
    </form>
  );
}
