"use client";
import { useTransition } from "react";
import { validateClanDiscord, verifyMyDiscord } from "@/app/discord-verify-actions";
import { useRunAction } from "./action-form";
import { btnSecondary } from "./ui";
import { useT } from "@/i18n/client";

function RunButton({ run, idle }: { run: () => Promise<unknown>; idle: "discordVerify.button" | "discordVerify.verifyButton" }) {
  const t = useT();
  const act = useRunAction();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className={btnSecondary} onClick={() => start(async () => void (await act(run)))}>
      {pending ? t("discordVerify.verifying") : t(idle)}
    </button>
  );
}

/** Clan settings › Members: check every member against the clan's Discord server. */
export function ValidateDiscordButton({ clanId }: { clanId: string }) {
  return <RunButton run={() => validateClanDiscord(clanId)} idle="discordVerify.button" />;
}

/** Profile › Discord: check my own account against my clans' servers. */
export function VerifyDiscordButton() {
  return <RunButton run={verifyMyDiscord} idle="discordVerify.verifyButton" />;
}
