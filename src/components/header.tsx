import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

export async function Header() {
  const me = await getCurrentUser();
  return (
    <header className="border-b border-line bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex items-center" aria-label="Seatbit home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/seatbit-logo.svg" alt="Seatbit" className="hidden h-7 w-auto sm:block" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/seatbit-mark.svg" alt="Seatbit" className="h-7 w-auto sm:hidden" />
        </Link>
        <nav className="flex min-w-0 items-center gap-0.5 text-sm sm:gap-1">
          {me ? (
            <>
              <Link className="rounded px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-800 sm:px-3" href="/">
                LANs
              </Link>
              <Link className="rounded px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-800 sm:px-3" href="/clans">
                Clans
              </Link>
              {me.role === "admin" && (
                <Link className="rounded px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-800 sm:px-3" href="/admin">
                  Admin
                </Link>
              )}
              <Link
                className="max-w-[8rem] truncate rounded px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
                href="/profile"
              >
                {me.name}
              </Link>
              <span className="hidden sm:inline">
                <SignOutButton />
              </span>
            </>
          ) : (
            <>
              <Link className="rounded px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/login">
                Sign in
              </Link>
              <Link
                className="rounded bg-bit px-3 py-1.5 font-medium text-ink hover:bg-bit-hover"
                href="/register"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
