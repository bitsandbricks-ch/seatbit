/**
 * A game's cover in a fixed 460×215 box (Steam's header size), so every row lines up. Without a
 * picture the box is filled with the game's colour and its initials, keeping the same spacing.
 */
export function GameCover({
  name,
  cover,
  color,
  className = "",
  children,
}: {
  name: string;
  cover: string | null;
  color: string;
  className?: string;
  /** Overlay, e.g. the rank. */
  children?: React.ReactNode;
}) {
  const initials = name
    .split(/[\s:\-–]+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => [...w][0].toUpperCase())
    .join("");
  return (
    <div className={`relative aspect-[460/215] shrink-0 overflow-hidden rounded-bit ${className}`}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center text-xl font-semibold tracking-tight sm:text-2xl"
          style={{
            background: `linear-gradient(135deg, color-mix(in oklab, ${color} 30%, var(--color-surface)), color-mix(in oklab, ${color} 12%, var(--color-surface)))`,
            color: `color-mix(in oklab, ${color} var(--avatar-ink, 100%), var(--color-fg))`,
          }}
        >
          {initials}
        </div>
      )}
      {children}
    </div>
  );
}
