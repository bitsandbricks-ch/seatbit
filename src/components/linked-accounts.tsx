"use client";
import { authClient } from "@/lib/auth-client";
import { btnSecondary, Pill } from "./ui";

const names: Record<string, string> = { credential: "Email & password", discord: "Discord", google: "Google" };

export function LinkedAccounts({
  linked,
  available,
}: {
  linked: string[];
  available: { discord: boolean; google: boolean; email?: boolean };
}) {
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {linked.map((p) => (
          <li key={p}>
            <Pill tone="emerald">{names[p] ?? p}</Pill>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {(["discord", "google"] as const)
          .filter((p) => available[p] && !linked.includes(p))
          .map((p) => (
            <button
              key={p}
              className={btnSecondary}
              onClick={() => authClient.linkSocial({ provider: p, callbackURL: "/profile" })}
            >
              Link {names[p]}
            </button>
          ))}
      </div>
    </div>
  );
}
