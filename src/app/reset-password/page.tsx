"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { btnPrimary, cardPage, cardPageTitle, Field, Input } from "@/components/ui";
import { useT } from "@/i18n/client";

function ResetForm() {
  const t = useT();
  const token = useSearchParams().get("token");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!token)
    return (
      <div className="space-y-3 text-sm">
        <p className="text-danger">{t("pages.resetInvalid")}</p>
        <Link href="/forgot-password" className="text-bit hover:underline">
          {t("pages.resetAgain")}
        </Link>
      </div>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        const newPassword = String(new FormData(e.currentTarget).get("password"));
        const res = await authClient.resetPassword({ newPassword, token }).catch(() => ({ error: { code: "" } }));
        if (res.error) {
          setBusy(false);
          // A used or expired link is the usual case; the raw auth message is English only.
          return setError(res.error.code === "INVALID_TOKEN" ? t("pages.resetInvalid") : t("pages.resetFailed"));
        }
        router.push("/login?reset=1");
      }}
    >
      <Field label={t("pages.newPassword")}>
        <Input name="password" type="password" minLength={8} required />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}{" "}
          <Link href="/forgot-password" className="text-bit hover:underline">
            {t("pages.resetAgain")}
          </Link>
        </p>
      )}
      <button disabled={busy} className={`${btnPrimary} w-full`}>{t("pages.setPassword")}</button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useT();
  return (
    <div className={cardPage}>
      <h1 className={cardPageTitle}>{t("pages.choosePassword")}</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
