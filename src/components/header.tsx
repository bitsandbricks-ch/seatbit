import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { LOGIN_METHODS } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { BottomNav, TopNav, type NavItem } from "./nav";
import { SignOutButton } from "./sign-out-button";
import { Avatar } from "./avatar";
import { avatarData } from "@/lib/avatars";
import { getT } from "@/i18n/server";
import { getTheme } from "@/lib/theme-server";
import { DisplayMenu } from "./display-menu";

export async function Header() {
  const me = await getCurrentUser();
  const t = await getT();
  const theme = await getTheme();
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
        { href: "/", label: t("nav.lans"), icon: "calendar" },
        { href: "/clans", label: t("nav.clans"), icon: "users" },
        ...(me.role === "admin" ? [{ href: "/admin", label: t("nav.admin"), icon: "shield" } as NavItem] : []),
      ]
    : [];

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur supports-[backdrop-filter]:bg-ink/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center" aria-label={t("nav.home")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/seatbit-logo.svg" alt="Seatbit" className="h-7 w-auto light:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/seatbit-logo-light.svg" alt="Seatbit" className="hidden h-7 w-auto light:block" />
          </Link>
          {me && <TopNav items={items} />}
          <div className="ml-auto flex items-center gap-2">
            <DisplayMenu theme={theme} />
            {me ? (
              <>
                <Link
                  href="/profile"
                  className="flex min-w-0 items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm text-fg transition hover:border-bit/60"
                  aria-label={t("nav.yourProfile")}
                >
                  <Avatar data={avatarData(me)} size={28} ring={false} />
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
                    {t("nav.signIn")}
                  </Link>
                )}
                <Link
                  className="rounded-md bg-bit px-3 py-1.5 text-sm font-medium text-on-bit hover:bg-bit-hover"
                  href={LOGIN_METHODS.email ? "/register" : "/login"}
                >
                  {LOGIN_METHODS.email ? t("nav.register") : t("nav.signIn")}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {me && <BottomNav items={[...items, { href: "/profile", label: t("nav.profile"), icon: "user" }]} />}
    </>
  );
}
