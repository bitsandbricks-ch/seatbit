"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { btnPrimary, cardPage, cardPageTitle, Field, Input } from "@/components/ui";
import { useT } from "@/i18n/client";

export default function ForgotPasswordPage() {
  const t = useT();
  const [sent, setSent] = useState(false);
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
            const email = String(new FormData(e.currentTarget).get("email"));
            await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
            setSent(true);
          }}
        >
          <Field label={t("auth.email")}>
            <Input name="email" type="email" required />
          </Field>
          <button className={`${btnPrimary} w-full`}>{t("pages.sendReset")}</button>
        </form>
      )}
    </div>
  );
}
