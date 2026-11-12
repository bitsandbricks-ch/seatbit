import Link from "next/link";

// Kept apart from legal-page.tsx: that one reads server settings, this one is used in client components.
/** "By continuing you agree to ..." line under the sign-in and sign-up forms. */
export function LegalNotice() {
  return (
    <p className="mx-auto mt-4 w-full max-w-sm text-center text-xs text-muted">
      By continuing you agree to the{" "}
      <Link href="/terms" className="text-muted underline hover:text-fg">
        Terms of Service
      </Link>{" "}
      and the{" "}
      <Link href="/privacy" className="text-muted underline hover:text-fg">
        Privacy Policy
      </Link>
      .
    </p>
  );
}
