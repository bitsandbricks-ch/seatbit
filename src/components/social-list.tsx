import { listSocials } from "@/lib/socials";

/** A member's socials as a definition list; services with a profile page get a link. */
export function SocialList({ socials, discordId }: { socials: Record<string, string>; discordId?: string | null }) {
  const rows = listSocials(socials).map((r) =>
    // A linked Discord login gives us their user id, which opens their profile in Discord.
    r.key === "discord" && discordId ? { ...r, href: `https://discord.com/users/${discordId}` } : r,
  );
  if (rows.length === 0) return <p className="text-sm text-muted">No socials added yet.</p>;
  return (
    <dl className="space-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.key} className="flex justify-between gap-3">
          <dt className="shrink-0 text-muted">{r.label}</dt>
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
