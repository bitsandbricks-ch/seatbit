"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { btnPrimary, btnSecondary, Field, Input } from "./ui";

export function AuthForm({
  mode,
  providers,
}: {
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
    const res =
      mode === "login"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(f.get("name")) });
    setBusy(false);
    if (res.error) return setError(res.error.message ?? "Something went wrong");
    router.push("/");
    router.refresh();
  }

  const social = (provider: "discord" | "google") =>
    authClient.signIn.social({ provider, callbackURL: "/" });

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
          <Field label="Name">
            <Input name="name" required autoComplete="name" />
          </Field>
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
            <Link href="/register" className="hover:text-zinc-200">
              Create account
            </Link>
            <Link href="/forgot-password" className="hover:text-zinc-200">
              Forgot password?
            </Link>
          </>
        ) : (
          <Link href="/login" className="hover:text-zinc-200">
            Already have an account? Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
