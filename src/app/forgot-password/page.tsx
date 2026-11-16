"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { btnPrimary, cardPage, cardPageTitle, Field, Input } from "@/components/ui";
import { useT } from "@/i18n/client";

export default function ForgotPasswordPage() {
  const t = useT();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className={cardPage}>
      <h1 className={cardPageTitle}>{t("pages.resetPassword")}</h1>
      {sent ? (
        <p className="text-sm text-fg/90">{t("pages.resetSent")}</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setFailed(false);
            const email = String(new FormData(e.currentTarget).get("email"));
            // Unknown addresses succeed too (no account probing); only a dropped request is an error.
            const res = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" }).catch(() => null);
            setBusy(false);
            if (!res || (res.error && !res.error.status)) return setFailed(true);
            setSent(true);
          }}
        >
          <Field label={t("auth.email")}>
            <Input name="email" type="email" required />
          </Field>
          {failed && (
            <p role="alert" className="text-sm text-danger">
              {t("auth.somethingWrong")}
            </p>
          )}
          <button disabled={busy} className={`${btnPrimary} w-full`}>
            {t("pages.sendReset")}
          </button>
        </form>
      )}
    </div>
  );
}
