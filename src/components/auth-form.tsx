"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setNick } from "@/app/actions";
import { authClient } from "@/lib/auth-client";
import { btnPrimary, btnSecondary, Field, Input } from "./ui";

export function AuthForm({
  mode,
  providers,
  next = "/",
}: {
  next?: string;
  mode: "login" | "register";
  providers: { discord: boolean; google: boolean; email: boolean };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    const firstName = String(f.get("firstName") ?? "").trim();
    const lastName = String(f.get("lastName") ?? "").trim();
    const res =
      mode === "login"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({
            email,
            password,
            name: `${firstName} ${lastName}`,
            firstName,
            lastName,
          });
    if (res.error) {
      setBusy(false);
      return setError(res.error.message ?? "Something went wrong");
    }
    if (mode === "register" && String(f.get("nick") ?? "").trim()) {
      const n = new FormData();
      n.set("nick", String(f.get("nick")));
      await setNick(n);
    }
    setBusy(false);
    router.push(next);
    router.refresh();
  }

  const social = (provider: "discord" | "google") =>
    authClient.signIn.social({
      provider,
      callbackURL: next,
      newUserCallbackURL: `/welcome?next=${encodeURIComponent(next)}`,
    });

  const anySocial = providers.discord || providers.google;

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] items-center justify-center">
      <div className="w-full max-w-sm space-y-6 rounded-card border border-line bg-surface p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            {mode === "login" ? "Sign in" : "Create an account"}
          </h1>
          {!providers.email && (
            <p className="text-sm text-muted">
              Seatbit uses your Discord account. New here? The same button
              creates your account.
            </p>
          )}
        </div>

        {anySocial && (
          <div className="space-y-2">
            {providers.discord && (
              <button
                onClick={() => social("discord")}
                className={`${btnSecondary} w-full !border-[#5865F2] !bg-[#5865F2] !py-2.5 hover:!bg-[#4752c4]`}
              >
                Continue with Discord
              </button>
            )}
            {providers.google && (
              <button
                onClick={() => social("google")}
                className={`${btnSecondary} w-full`}
              >
                Continue with Google
              </button>
            )}
          </div>
        )}

        {!anySocial && !providers.email && (
          <p className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
            Discord login isn&apos;t set up yet. Set DISCORD_CLIENT_ID and
            DISCORD_CLIENT_SECRET on the server, or add them under Admin,
            Settings, Discord.
          </p>
        )}

        {providers.email && (
          <>
            {anySocial && (
              <div className="flex items-center gap-3 text-xs text-faint">
                <div className="h-px flex-1 bg-line" /> or{" "}
                <div className="h-px flex-1 bg-line" />
              </div>
            )}
            <form onSubmit={onSubmit} className="space-y-4">
              {mode === "register" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name">
                      <Input
                        name="firstName"
                        required
                        maxLength={40}
                        autoComplete="given-name"
                      />
                    </Field>
                    <Field label="Surname">
                      <Input
                        name="lastName"
                        required
                        maxLength={40}
                        autoComplete="family-name"
                      />
                    </Field>
                  </div>
                  <Field
                    label="Nickname"
                    hint="Your gamer tag. You can set a different one per LAN type later."
                  >
                    <Input
                      name="nick"
                      required
                      maxLength={32}
                      autoComplete="nickname"
                    />
                  </Field>
                </>
              )}
              <Field label="Email">
                <Input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </Field>
              <Field label="Password">
                <Input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </Field>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button disabled={busy} className={`${btnPrimary} w-full`}>
                {mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>

            <div className="flex justify-between text-sm text-zinc-400">
              {mode === "login" ? (
                <>
                  <Link
                    href={
                      next === "/"
                        ? "/register"
                        : `/register?next=${encodeURIComponent(next)}`
                    }
                    className="hover:text-zinc-200"
                  >
                    Create account
                  </Link>
                  <Link href="/forgot-password" className="hover:text-zinc-200">
                    Forgot password?
                  </Link>
                </>
              ) : (
                <Link
                  href={
                    next === "/"
                      ? "/login"
                      : `/login?next=${encodeURIComponent(next)}`
                  }
                  className="hover:text-zinc-200"
                >
                  Already have an account? Sign in
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
