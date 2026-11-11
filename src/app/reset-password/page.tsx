"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { btnPrimary, Field, Input } from "@/components/ui";

function ResetForm() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (!token) return <p className="text-sm text-red-400">This reset link is invalid or expired.</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const newPassword = String(new FormData(e.currentTarget).get("password"));
        const res = await authClient.resetPassword({ newPassword, token });
        if (res.error) return setError(res.error.message ?? "Reset failed");
        router.push("/login");
      }}
    >
      <Field label="New password">
        <Input name="password" type="password" minLength={8} required />
      </Field>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className={`${btnPrimary} w-full`}>Set password</button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
