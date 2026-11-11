/* eslint-disable @next/next/no-img-element */
import type { AvatarData } from "@/lib/avatars";

/**
 * A member's avatar: their picture, icon or initials, with a ring in their
 * colour. Pure markup, so it works in server and client components.
 */
export function Avatar({ data, size = 28, ring = true }: { data: AvatarData | undefined; size?: number; ring?: boolean }) {
  if (!data) return <span className="inline-block shrink-0 rounded-full bg-raised" style={{ width: size, height: size }} aria-hidden />;
  const style = {
    width: size,
    height: size,
    // A colour ring with a hairline gap, so pictures and the ring stay apart.
    boxShadow: ring ? `0 0 0 ${size >= 48 ? 3 : 2}px ${data.color}` : undefined,
  };
  if (data.src) {
    return (
      <img
        src={data.src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="inline-block shrink-0 rounded-full border border-surface bg-raised object-cover"
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full border border-surface font-semibold leading-none"
      style={{
        ...style,
        background: `color-mix(in oklab, ${data.color} 22%, var(--color-surface))`,
        color: data.color,
        fontSize: data.icon ? size * 0.55 : size * 0.38,
      }}
    >
      {data.icon ?? data.initials}
    </span>
  );
}

/** A small dot in the member's colour, for places too tight for an avatar. */
export function ColorDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}
