import type { T } from "@/i18n/translate";

/**
 * Small status icons for leads, the same everywhere (seat map, attendee lists): held seat, no ticket
 * yet, seat booked on the event's site, guest (no account yet), seat swap pending.
 * Pure markup, safe in server and client components.
 */
export const STATUS_KINDS = ["held", "noTicket", "swap", "guest", "booked"] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

const tones: Record<StatusKind, string> = {
  held: "bg-warn/20 text-warn",
  noTicket: "bg-danger/20 text-danger",
  swap: "bg-seat-taken/25 text-seat-taken",
  guest: "bg-line text-muted",
  booked: "bg-bit/20 text-bit",
};

const paths: Record<StatusKind, React.ReactNode> = {
  held: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  noTicket: <path d="M12 5v9M12 19h.01" />,
  swap: <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  guest: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  booked: <path d="m5 12 5 5L19 7" />,
};

/** Kinds in a fixed order, so the same states always line up the same way. */
export const sortKinds = (kinds: Iterable<StatusKind>) => STATUS_KINDS.filter((k) => new Set(kinds).has(k));

const sizes = {
  xs: ["size-3", "size-2"],
  sm: ["size-3.5 sm:size-4", "size-2.5 sm:size-3"],
  md: ["size-4", "size-3"],
};

/** One icon in a small tinted square. `size`: "xs" for compact seats, "sm" for large seats and legends, "md" next to names. */
export function StatusIcon({ kind, t, size = "md", className = "" }: { kind: StatusKind; t: T; size?: keyof typeof sizes; className?: string }) {
  const label = t(`statusIcons.${kind}`);
  const [box, svg] = sizes[size];
  return (
    <span title={label} className={`grid shrink-0 place-items-center rounded-sm ${box} ${tones[kind]} ${className}`}>
      <svg aria-hidden viewBox="0 0 24 24" className={svg} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {paths[kind]}
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A row of icons, e.g. after a name. Renders nothing without any. */
export function StatusIcons({ kinds, t, size }: { kinds: Iterable<StatusKind>; t: T; size?: keyof typeof sizes }) {
  const list = sortKinds(kinds);
  if (!list.length) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 align-middle">
      {list.map((k) => (
        <StatusIcon key={k} kind={k} t={t} size={size} />
      ))}
    </span>
  );
}
