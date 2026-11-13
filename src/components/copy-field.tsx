"use client";
import { useState } from "react";
import { btnGhost } from "./ui";
import { useT } from "@/i18n/client";

/** Read-only text with a copy button (for invite links). */
export function CopyField({ value }: { value: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.target.select()}
        className="min-w-0 flex-1 rounded-md border border-line bg-raised px-3 py-1.5 font-mono text-xs"
      />
      <button
        type="button"
        className={`${btnGhost} shrink-0 text-xs`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
      >
        {t(copied ? "common.copied" : "common.copy")}
      </button>
    </span>
  );
}
