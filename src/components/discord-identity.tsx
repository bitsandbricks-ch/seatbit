import { CopyField } from "./copy-field";
import { VerifyDiscordButton } from "./discord-verify-buttons";
import { Pill, label } from "./ui";
import { fmtDay } from "@/lib/format";
import type { T } from "@/i18n/translate";

/** The linked Discord account on the profile: username, id to copy, and the bot's verification. */
export function DiscordIdentity({
  t,
  identity,
  canVerify,
}: {
  t: T;
  /** The bot is set up, so it can look the account up. */
  canVerify: boolean;
  identity: { id: string; username: string | null; verifiedAt: Date | null };
}) {
  return (
    <div className="space-y-3">
      <div>
        <span className={label}>{t("discordVerify.username")}</span>
        {identity.username ? (
          <span className="font-mono text-sm">@{identity.username}</span>
        ) : (
          <span className="text-sm text-muted">{t("discordVerify.unknownName")}</span>
        )}
      </div>
      <div>
        <span className={label}>{t("discordVerify.userId")}</span>
        <CopyField value={identity.id} label={t("discordVerify.userId")} />
      </div>
      {identity.verifiedAt ? (
        <div className="space-y-1">
          <Pill tone="emerald">{t("discordVerify.verifiedOn", { date: fmtDay(identity.verifiedAt) })}</Pill>
          <p className="text-xs text-muted">{t("discordVerify.verifiedHint")}</p>
        </div>
      ) : (
        <p className="text-xs text-muted">{t("discordVerify.notVerified")}</p>
      )}
      {canVerify && <VerifyDiscordButton />}
    </div>
  );
}
