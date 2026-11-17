import { Verified } from "./ui";
import { DiscordBadge, type DiscordState } from "./discord-badge";
import type { T } from "@/i18n/translate";

/** What `memberBadges()` in src/lib/member-badges.ts finds for one person. */
export type Badges = {
  /** Their own account (not a guest a lead typed in): the check mark. */
  real: boolean;
  discord?: { state: DiscordState; id: string };
  donor: boolean;
};

/** Small "Donor" mark for a person or clan who gave a one-off donation in the last year. */
export function DonorBadge({ label, title }: { label: string; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-bit border border-bit/30 bg-bit-soft px-1.5 py-0.5 text-xs font-medium text-bit"
    >
      <span aria-hidden>♥</span> {label}
    </span>
  );
}

/**
 * The marks after a name, the same everywhere: check mark, Discord, Donor.
 * `linkDiscord` (lead views): the Discord mark opens their Discord profile.
 * Pure markup, safe in server and client components.
 */
export function MemberBadges({
  b,
  t,
  linkDiscord = false,
  size,
  full = false,
}: {
  b?: Badges;
  t: T;
  linkDiscord?: boolean;
  size?: number;
  /** Profile headers: the Donor mark with its label. Lists get just the heart, so names keep their room. */
  full?: boolean;
}) {
  if (!b || (!b.real && !b.discord && !b.donor)) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 align-middle">
      {b.real && <Verified size={size} />}
      {b.discord && <DiscordBadge state={b.discord.state} discordId={linkDiscord ? b.discord.id : undefined} t={t} />}
      {b.donor &&
        (full ? (
          <DonorBadge label={t("donate.badgeLabel")} title={t("donate.badgePerson")} />
        ) : (
          <span title={t("donate.badgePerson")} className="inline-grid size-4 shrink-0 place-items-center rounded-sm bg-bit-soft text-[10px] leading-none text-bit">
            <span aria-hidden>♥</span>
            <span className="sr-only">{t("donate.badgeLabel")}</span>
          </span>
        ))}
    </span>
  );
}
