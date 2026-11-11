/* eslint-disable @next/next/no-img-element */
import { avatarUrl } from "@/lib/clans";

export function ClanAvatar({
  clan,
  size = 40,
}: {
  clan: { id: string; name: string; avatar: string | null };
  size?: number;
}) {
  const url = avatarUrl(clan);
  const initials = clan.name
    .split(/\s+/)
    .filter((w) => !/^(the|der|die|das)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return url ? (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-bit object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-bit bg-raised font-bold text-bit"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
