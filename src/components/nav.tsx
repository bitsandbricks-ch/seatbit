"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: keyof typeof icons };

const icons = {
  calendar: "M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z",
  users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM21 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  shield: "M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z",
  user: "M20 20v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
};

/** "/" is active for the home page and event pages; other items by prefix. */
function isActive(path: string, href: string) {
  if (href === "/") return path === "/" || path.startsWith("/lans");
  return path === href || path.startsWith(href + "/");
}

function Icon({ name }: { name: NavItem["icon"] }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={icons[name]} />
    </svg>
  );
}

/** Desktop: text links in the header, active one underlined in Bit Green like the page tabs. */
export function TopNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden h-full items-stretch gap-1 sm:flex">
      {items.map((i) => {
        const on = isActive(path, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px flex items-center border-b-2 px-3 text-sm font-medium transition ${
              on ? "border-bit text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phones: a tab bar fixed to the bottom, within thumb reach. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="flex">
        {items.map((i) => {
          const on = isActive(path, i.href);
          return (
            <li key={i.href} className="flex-1">
              <Link
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium transition ${
                  on ? "text-bit" : "text-faint hover:text-muted"
                }`}
              >
                <Icon name={i.icon} />
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
