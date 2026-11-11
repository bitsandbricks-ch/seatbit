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
  providers: { discord: boolean; google: boolean };
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
        : await authClient.signUp.email({ email, password, name: `${firstName} ${lastName}`, firstName, lastName });
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
    authClient.signIn.social({ provider, callbackURL: next });

  const anySocial = providers.discord || providers.google;

  return (
    <div className="mx-auto max-w-sm space-y-6 rounded-xl border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold">{mode === "login" ? "Sign in" : "Create an account"}</h1>

      {anySocial && (
        <div className="space-y-2">
          {providers.discord && (
            <button
              onClick={() => social("discord")}
              className={`${btnSecondary} w-full !bg-[#5865F2] !border-[#5865F2] hover:!bg-[#4752c4]`}
            >
              Continue with Discord
            </button>
          )}
          {providers.google && (
            <button onClick={() => social("google")} className={`${btnSecondary} w-full`}>
              Continue with Google
            </button>
          )}
          <div className="flex items-center gap-3 py-1 text-xs text-zinc-500">
            <div className="h-px flex-1 bg-zinc-800" /> or <div className="h-px flex-1 bg-zinc-800" />
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "register" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <Input name="firstName" required maxLength={40} autoComplete="given-name" />
              </Field>
              <Field label="Surname">
                <Input name="lastName" required maxLength={40} autoComplete="family-name" />
              </Field>
            </div>
            <Field label="Nickname" hint="Your gamer tag. You can set a different one per LAN type later.">
              <Input name="nick" required maxLength={32} autoComplete="nickname" />
            </Field>
          </>
        )}
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Password">
          <Input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
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
            <Link href={next === "/" ? "/register" : `/register?next=${encodeURIComponent(next)}`} className="hover:text-zinc-200">
              Create account
            </Link>
            <Link href="/forgot-password" className="hover:text-zinc-200">
              Forgot password?
            </Link>
          </>
        ) : (
          <Link href={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`} className="hover:text-zinc-200">
            Already have an account? Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
