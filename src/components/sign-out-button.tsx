"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { btnGhost } from "./ui";
import { useT } from "@/i18n/client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const t = useT();
  return (
    <button
      disabled={busy}
      className={className ?? btnGhost}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      {busy ? t("nav.signingOut") : t("nav.signOut")}
    </button>
  );
}
