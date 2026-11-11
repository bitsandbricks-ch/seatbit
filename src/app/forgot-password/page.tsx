"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { btnPrimary, Field, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
      <h1 className="text-xl font-semibold">Reset password</h1>
      {sent ? (
        <p className="text-sm text-zinc-300">If that address has an account, a reset link is on its way.</p>
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
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <button className={`${btnPrimary} w-full`}>Send reset link</button>
        </form>
      )}
    </div>
  );
}
