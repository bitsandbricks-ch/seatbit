/** Gaming and social accounts a member can show on their profile. Safe for client components. */

export const SOCIAL_MAX = 100;

type Social = {
  key: string;
  label: string;
  placeholder: string;
  /** Builds a link from the handle; links only ever go to the service's own host. */
  link?: (v: string) => string | null;
};

const enc = encodeURIComponent;

/** A pasted profile URL on one of these hosts is kept as is (https only), anything else is treated as a handle. */
function ownUrl(v: string, hosts: string[]) {
  try {
    const u = new URL(v);
    const host = u.hostname.replace(/^www\./, "");
    return hosts.includes(host) ? `https://${u.hostname}${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}

/** Last path segment of a pasted URL, else the value without a leading @. */
const handle = (v: string) => {
  if (/^https?:\/\//i.test(v)) {
    try {
      return new URL(v).pathname.split("/").filter(Boolean).pop()?.replace(/^@/, "") ?? "";
    } catch {
      return "";
    }
  }
  return v.replace(/^@/, "");
};

export const SOCIALS: Social[] = [
  { key: "discord", label: "Discord", placeholder: "username" },
  {
    key: "steam",
    label: "Steam",
    placeholder: "profile link or custom URL name",
    link: (v) =>
      /^https?:\/\//i.test(v)
        ? ownUrl(v, ["steamcommunity.com"])
        : /^\d{17}$/.test(v)
          ? `https://steamcommunity.com/profiles/${v}`
          : `https://steamcommunity.com/id/${enc(v)}`,
  },
  { key: "battlenet", label: "Battle.net", placeholder: "Name#1234" },
  { key: "epic", label: "Epic Games", placeholder: "display name" },
  { key: "riot", label: "Riot ID", placeholder: "Name#TAG" },
  { key: "ea", label: "EA app", placeholder: "EA ID" },
  { key: "ubisoft", label: "Ubisoft Connect", placeholder: "username" },
  { key: "xbox", label: "Xbox", placeholder: "gamertag" },
  { key: "psn", label: "PlayStation", placeholder: "online ID" },
  {
    key: "faceit",
    label: "FACEIT",
    placeholder: "nickname",
    link: (v) => (handle(v) ? `https://www.faceit.com/en/players/${enc(handle(v))}` : null),
  },
  {
    key: "twitch",
    label: "Twitch",
    placeholder: "channel name",
    link: (v) => (handle(v) ? `https://www.twitch.tv/${enc(handle(v))}` : null),
  },
  {
    key: "youtube",
    label: "YouTube",
    placeholder: "@handle",
    link: (v) => (handle(v) ? `https://www.youtube.com/@${enc(handle(v))}` : null),
  },
];

/** Keeps only known keys with a non-empty, trimmed value. */
export function cleanSocials(input: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const s of SOCIALS) {
    const v = String(input[s.key] ?? "")
      .trim()
      .slice(0, SOCIAL_MAX);
    if (v) out[s.key] = v;
  }
  return out;
}

/** The member's filled-in socials in display order, with a link where the service has one. */
export function listSocials(socials: Record<string, string> | null | undefined) {
  return SOCIALS.flatMap((s) => {
    const value = socials?.[s.key];
    return value ? [{ key: s.key, label: s.label, value, href: s.link?.(value) ?? null }] : [];
  });
}
