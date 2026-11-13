"use client";
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
  if (!token) return <p className="text-sm text-danger">{t("pages.resetInvalid")}</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const newPassword = String(new FormData(e.currentTarget).get("password"));
        const res = await authClient.resetPassword({ newPassword, token });
        if (res.error) return setError(res.error.message ?? t("pages.resetFailed"));
        router.push("/login");
      }}
    >
      <Field label={t("pages.newPassword")}>
        <Input name="password" type="password" minLength={8} required />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className={`${btnPrimary} w-full`}>{t("pages.setPassword")}</button>
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
