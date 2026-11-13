"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setNick } from "@/app/actions";
import { LegalNotice } from "@/components/legal-notice";
import { authClient } from "@/lib/auth-client";
import { btnPrimary, btnSecondary, Field, Input } from "./ui";
import { useT } from "@/i18n/client";

export function AuthForm({
  mode,
  providers,
  next = "/",
  notice,
}: {
  next?: string;
  /** Short line shown above the form, e.g. after an account was deleted. */
  notice?: string;
  mode: "login" | "register";
  providers: { discord: boolean; google: boolean; email: boolean };
}) {
  const router = useRouter();
  const t = useT();
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
      return setError(res.error.message ?? t("auth.somethingWrong"));
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

  const [socialBusy, setSocialBusy] = useState<string | null>(null);
  const social = (provider: "discord" | "google") => {
    setSocialBusy(provider);
    return authClient.signIn
      .social({
      provider,
      callbackURL: next,
      newUserCallbackURL: `/welcome?next=${encodeURIComponent(next)}`,
    })
      .catch(() => setSocialBusy(null));
  };

  const anySocial = providers.discord || providers.google;

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/seatbit-mark.svg" alt="" className="h-12 w-12" />
        <p className="mt-3 text-balance text-sm text-muted">{t("auth.tagline")}</p>
      </div>
      {notice && (
        <p role="status" className="w-full max-w-sm rounded-card border border-bit/30 bg-bit/10 p-3 text-sm text-fg">
          {notice}
        </p>
      )}
      <div className="w-full max-w-sm space-y-6 rounded-card border border-line bg-surface p-5 sm:p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {mode === "login" ? t("auth.signIn") : t("auth.createAnAccount")}
          </h1>
          {!providers.email && (
            <p className="text-sm text-muted">{t("auth.discordOnly")}</p>
          )}
        </div>

        {anySocial && (
          <div className="space-y-2">
            {providers.discord && (
              <button
                onClick={() => social("discord")}
                disabled={!!socialBusy}
                className={`${btnSecondary} min-h-12 w-full !border-[#5865F2] !bg-[#5865F2] text-base !text-white hover:!bg-[#4752c4]`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                  <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4a12.9 12.9 0 0 1-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.1-.8-9.5-3.6-13.6ZM8.3 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7.4 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
                </svg>
                {socialBusy === "discord" ? t("auth.openingDiscord") : t("auth.continueDiscord")}
              </button>
            )}
            {providers.google && (
              <button
                onClick={() => social("google")}
                disabled={!!socialBusy}
                className={`${btnSecondary} w-full`}
              >
                {t("auth.continueGoogle")}
              </button>
            )}
          </div>
        )}

        {!anySocial && !providers.email && (
          <p className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
            {t("auth.notSetUp")}
          </p>
        )}

        {providers.email && (
          <>
            {anySocial && (
              <div className="flex items-center gap-3 text-xs text-muted">
                <div className="h-px flex-1 bg-line" /> {t("auth.or")}{" "}
                <div className="h-px flex-1 bg-line" />
              </div>
            )}
            <form onSubmit={onSubmit} className="space-y-4">
              {mode === "register" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t("auth.firstName")}>
                      <Input
                        name="firstName"
                        required
                        maxLength={40}
                        autoComplete="given-name"
                      />
                    </Field>
                    <Field label={t("auth.surname")}>
                      <Input
                        name="lastName"
                        required
                        maxLength={40}
                        autoComplete="family-name"
                      />
                    </Field>
                  </div>
                  <Field
                    label={t("auth.nickname")}
                    hint={t("auth.nickHint")}
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
              <Field label={t("auth.email")}>
                <Input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </Field>
              <Field label={t("auth.password")}>
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
              {error && <p className="text-sm text-danger">{error}</p>}
              <button disabled={busy} className={`${btnPrimary} w-full`}>
                {mode === "login" ? t("auth.signIn") : t("auth.createAccount")}
              </button>
            </form>

            <div className="flex justify-between text-sm text-muted">
              {mode === "login" ? (
                <>
                  <Link
                    href={
                      next === "/"
                        ? "/register"
                        : `/register?next=${encodeURIComponent(next)}`
                    }
                    className="hover:text-fg"
                  >
                    {t("auth.createAccount")}
                  </Link>
                  <Link href="/forgot-password" className="hover:text-fg">
                    {t("auth.forgot")}
                  </Link>
                </>
              ) : (
                <Link
                  href={
                    next === "/"
                      ? "/login"
                      : `/login?next=${encodeURIComponent(next)}`
                  }
                  className="hover:text-fg"
                >
                  {t("auth.haveAccount")}
                </Link>
              )}
            </div>
          </>
        )}
      </div>
      <LegalNotice />
    </div>
  );
}
