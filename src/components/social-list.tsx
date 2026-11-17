import { listSocials } from "@/lib/socials";
import { getT } from "@/i18n/server";
import { Pill } from "./ui";

/**
 * A member's socials as a definition list; services with a profile page get a link.
 * Socials they hid are left out, except for themselves (`isSelf`), marked "hidden".
 */
export async function SocialList({
  socials,
  discordId,
  discordUsername,
  hidden = [],
  isSelf = false,
}: {
  socials: Record<string, string>;
  discordId?: string | null;
  /** The linked Discord account's name, shown when they didn't type one. */
  discordUsername?: string | null;
  hidden?: string[];
  isSelf?: boolean;
}) {
  const t = await getT();
  const rows = listSocials(socials, { discordUsername: discordId ? discordUsername : null, hidden })
    .filter((r) => isSelf || !r.hidden)
    .map((r) =>
      // A linked Discord login gives us their user id, which opens their profile in Discord.
      r.key === "discord" && discordId ? { ...r, href: `https://discord.com/users/${discordId}` } : r,
    );
  if (rows.length === 0) return <p className="text-sm text-muted">{t("member.noSocials")}</p>;
  return (
    <dl className="space-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.key} className="flex justify-between gap-3">
          <dt className="flex shrink-0 items-center gap-1.5 text-muted">
            {r.label}
            {r.hidden && (
              <span title={t("member.socialHiddenHint")}>
                <Pill>{t("member.socialHidden")}</Pill>
              </span>
            )}
          </dt>
          <dd className="min-w-0 truncate text-right font-medium">
            {r.href ? (
              <a href={r.href} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                {r.value}
              </a>
            ) : (
              <span className="select-all">{r.value}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
