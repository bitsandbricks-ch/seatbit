"use client";
import Link from "next/link";
import { useEffect } from "react";
import { btnPrimary, btnSecondary } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-danger/15 font-mono text-lg font-bold text-danger">!</span>
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        That didn&apos;t work, but nothing you entered is lost. Try again, and if it keeps happening, tell an orga.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">Error {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button onClick={reset} className={btnPrimary}>
          Try again
        </button>
        <Link href="/" className={btnSecondary}>
          Back to LANs
        </Link>
      </div>
    </div>
  );
}
