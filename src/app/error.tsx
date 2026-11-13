"use client";
import Link from "next/link";
import { useEffect } from "react";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { useT } from "@/i18n/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-danger/15 font-mono text-lg font-bold text-danger">!</span>
      <h1 className="text-xl font-bold">{t("pages.errorTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("pages.errorHint")}</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">{t("pages.errorCode", { code: error.digest })}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button onClick={reset} className={btnPrimary}>
          {t("pages.tryAgain")}
        </button>
        <Link href="/" className={btnSecondary}>
          {t("pages.backToLans")}
        </Link>
      </div>
    </div>
  );
}
