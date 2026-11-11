import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { LOGIN_METHODS } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { BottomNav, TopNav, type NavItem } from "./nav";
import { SignOutButton } from "./sign-out-button";

export async function Header() {
  const me = await getCurrentUser();
  const nick = me
    ? db
        .select({ nick: schema.nickname.nick })
        .from(schema.nickname)
        .where(and(eq(schema.nickname.userId, me.id), isNull(schema.nickname.lanId), isNull(schema.nickname.typeId)))
        .get()?.nick
    : undefined;
  const display = nick || me?.firstName || me?.name || "";
  const items: NavItem[] = me
    ? [
        { href: "/", label: "LANs", icon: "calendar" },
        { href: "/clans", label: "Clans", icon: "users" },
        ...(me.role === "admin" ? [{ href: "/admin", label: "Admin", icon: "shield" } as NavItem] : []),
      ]
    : [];

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur supports-[backdrop-filter]:bg-ink/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex shrink-0 items-center" aria-label="Seatbit home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/seatbit-logo.svg" alt="Seatbit" className="h-7 w-auto" />
          </Link>
          {me && <TopNav items={items} />}
          <div className="ml-auto flex items-center gap-2">
            {me ? (
              <>
                <Link
                  href="/profile"
                  className="flex min-w-0 items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm text-fg transition hover:border-bit/60"
                  aria-label="Your profile"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bit-soft font-mono text-xs font-semibold uppercase text-bit">
                    {display.slice(0, 2)}
                  </span>
                  <span className="max-w-[7rem] truncate">{display}</span>
                </Link>
                <span className="hidden sm:inline">
                  <SignOutButton />
                </span>
              </>
            ) : (
              <>
                {LOGIN_METHODS.email && (
                  <Link className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-fg" href="/login">
                    Sign in
                  </Link>
                )}
                <Link
                  className="rounded-md bg-bit px-3 py-1.5 text-sm font-medium text-ink hover:bg-bit-hover"
                  href={LOGIN_METHODS.email ? "/register" : "/login"}
                >
                  {LOGIN_METHODS.email ? "Register" : "Sign in"}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {me && <BottomNav items={[...items, { href: "/profile", label: "Profile", icon: "user" }]} />}
    </>
  );
}
