import Link from "next/link";
import type { AvatarData } from "@/lib/avatars";
import type { T } from "@/i18n/translate";
import { Avatar } from "./avatar";
import { Card, Notice, Pill } from "./ui";

export type EmergencyRow = {
  userId: string;
  name: string;
  full: string;
  avatar: AvatarData | undefined;
  seat: string | null;
  contactName: string;
  contactPhone: string;
  diet: string;
};

/** "+41 79 123 45 67" -> "tel:+41791234567". */
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Manage › Emergency: contacts and dietary needs of everyone coming, for the leads only. */
export function EmergencyList({ rows, t, profileBase }: { rows: EmergencyRow[]; t: T; profileBase: string | null }) {
  const filled = rows.filter((r) => r.contactName || r.contactPhone || r.diet);
  const missing = rows.filter((r) => !r.contactName && !r.contactPhone && !r.diet);
  const diets = rows.filter((r) => r.diet);
  return (
    <div className="space-y-4 sm:space-y-6">
      <Notice>{t("emergency.leadNotice")}</Notice>
      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card
          title={t("emergency.manageTitle")}
          actions={<Pill tone={missing.length ? "amber" : "emerald"}>{t("emergency.filledOf", { filled: filled.length, count: rows.length })}</Pill>}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted">{t("emergency.nobodyComing")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.userId} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <Avatar data={r.avatar} size={32} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      {profileBase ? (
                        <Link href={`${profileBase}${r.userId}`} className="font-medium text-fg hover:text-bit">
                          {r.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-fg">{r.name}</span>
                      )}
                      {r.seat && <span className="text-xs text-muted">{t("emergency.seat", { seat: r.seat })}</span>}
                    </div>
                    {r.full !== r.name && <p className="text-xs text-faint">{r.full}</p>}
                    {r.contactName || r.contactPhone ? (
                      <p className="text-sm">
                        <span className="text-muted">{t("emergency.contactShort")} </span>
                        {r.contactName}
                        {r.contactName && r.contactPhone && " · "}
                        {r.contactPhone && (
                          <a href={telHref(r.contactPhone)} className="whitespace-nowrap text-bit hover:underline">
                            {r.contactPhone}
                          </a>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm text-faint">{t("emergency.noContact")}</p>
                    )}
                    {r.diet && (
                      <p className="text-sm">
                        <span className="text-muted">{t("emergency.dietShort")} </span>
                        <span className="whitespace-pre-line">{r.diet}</span>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t("emergency.dietTitle")}>
          {diets.length ? (
            <ul className="space-y-2 text-sm">
              {diets.map((r) => (
                <li key={r.userId}>
                  <span className="font-medium">{r.name}:</span> <span className="whitespace-pre-line text-fg/90">{r.diet}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t("emergency.noDiets")}</p>
          )}
          <p className="mt-3 text-xs text-faint">{t("emergency.dietFoodHint")}</p>
        </Card>
      </div>
    </div>
  );
}
