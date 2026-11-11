import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

export async function Header() {
  const me = await getCurrentUser();
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-zinc-100">
          <span className="grid h-7 w-7 place-items-center rounded bg-emerald-500 text-xs font-bold text-zinc-950">
            SB
          </span>
          Seatbit
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {me ? (
            <>
              <Link className="rounded px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/">
                LANs
              </Link>
              {me.role === "admin" && (
                <Link className="rounded px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/admin">
                  Admin
                </Link>
              )}
              <Link className="rounded px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/profile">
                {me.name}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link className="rounded px-3 py-1.5 text-zinc-300 hover:bg-zinc-800" href="/login">
                Sign in
              </Link>
              <Link
                className="rounded bg-emerald-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-emerald-400"
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
