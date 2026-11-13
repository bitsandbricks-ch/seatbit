"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";

// Kept apart from legal-page.tsx: that one reads server settings, this one is used in client components.
/** "By continuing you agree to ..." line under the sign-in and sign-up forms. */
export function LegalNotice() {
  const t = useT();
  const link = "text-muted underline hover:text-fg";
  return (
    <p className="mx-auto mt-4 w-full max-w-sm text-center text-xs text-muted">
      {t.rich("auth.legal", {
        terms: (
          <Link href="/terms" className={link}>
            {t("auth.terms")}
          </Link>
        ),
        privacy: (
          <Link href="/privacy" className={link}>
            {t("auth.privacy")}
          </Link>
        ),
      })}
    </p>
  );
}
