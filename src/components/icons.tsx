// Small line icons in the text colour (currentColor), instead of colourful emojis in the UI.
// 20×20 grid, 1.6 stroke, so they sit well next to text-sm.

const PATHS = {
  // People
  next: "M7 8.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM13 8.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM3 16c0-2.2 1.8-4 4-4s4 1.8 4 4M9 16c0-2.2 1.8-4 4-4s4 1.8 4 4",
  near: "M10 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM5 17c0-2.8 2.2-5 5-5s5 2.2 5 5M4 8.5a1.8 1.8 0 1 0 0-3.6M16 8.5a1.8 1.8 0 1 1 0-3.6M1.5 14.5c0-1.8 1-3 2.5-3.4M18.5 14.5c0-1.8-1-3-2.5-3.4",
  avoid: "M8 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 17c0-2.8 2.2-5 5-5 1.2 0 2.3.4 3.1 1.1M13.5 13.5l4 4M17.5 13.5l-4 4",
  seat: "M6 3.5h8v7H6zM4.5 10.5h11v3h-11zM6 13.5V17M14 13.5V17",
  row: "M3 10h14M6 7l-3 3 3 3M14 7l3 3-3 3",
  edge: "M4 4v12M8 7h8v6H8z",
  middle: "M3 7h4v6H3zM13 7h4v6h-4zM8.5 7h3v6h-3z",
  // Help topics
  start: "M5 17V3.5M5 4h9l-2 3.5 2 3.5H5",
  calendar: "M4 5.5h12v11H4zM4 9h12M7.5 3.5v3M12.5 3.5v3",
  car: "M3.5 13.5v-3l2-4.5h9l2 4.5v3zM3.5 13.5V16h2.5v-2.5M16.5 13.5V16H14v-2.5M6.5 11h.01M13.5 11h.01",
  bag: "M4.5 7h11l-1 9.5h-9zM7.5 7V5.5a2.5 2.5 0 0 1 5 0V7",
  people: "M7 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 16.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M13.5 9a2 2 0 1 0 0-4M14.5 12.2c1.8.4 3 2 3 4.3",
  chat: "M3.5 4.5h13v9H9l-3.5 3v-3h-2z",
  bell: "M5.5 13.5V9a4.5 4.5 0 0 1 9 0v4.5l1.5 1.5H4zM8.5 17h3",
  compass: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM12.8 7.2l-1.6 4-4 1.6 1.6-4z",
  help: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM7.9 7.7a2.2 2.2 0 1 1 3 2.1c-.6.3-.9.7-.9 1.3v.3M10 14h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`${className} shrink-0`} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
