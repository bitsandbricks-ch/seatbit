"use client";
import { authClient } from "@/lib/auth-client";
import { btnSecondary, Pill } from "./ui";
import { useT } from "@/i18n/client";

const PROVIDERS = ["credential", "discord", "google"] as const;

export function LinkedAccounts({
  linked,
  available,
}: {
  linked: string[];
  available: { discord: boolean; google: boolean; email?: boolean };
}) {
  const t = useT();
  const name = (p: string) => (PROVIDERS.find((x) => x === p) ? t(`profile.providers.${p as (typeof PROVIDERS)[number]}`) : p);
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {linked.map((p) => (
          <li key={p}>
            <Pill tone="emerald">{name(p)}</Pill>
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
              {t("profile.link", { provider: name(p) })}
            </button>
          ))}
      </div>
    </div>
  );
}
