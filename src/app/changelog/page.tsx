import type { Metadata } from "next";
import { Card, EmptyState, Page, PageHeader, Pill } from "@/components/ui";
import { changelogByDay, entryText, getChangelog, type ChangeType } from "@/lib/changelog";
import { fmtDay } from "@/lib/format";
import { isStaff } from "@/lib/platform-roles";
import { getCurrentUser } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t("changelog.title")} · Seatbit` };
}

const TONE: Record<ChangeType, "emerald" | "zinc" | "amber"> = { new: "emerald", improved: "zinc", fixed: "amber" };

/** "2026-11-13" as a local date, so it never shifts a day with the time zone. */
const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Public, so people can read it before signing in; admin-only entries show to the platform team. */
export default async function ChangelogPage() {
  const t = await getT();
  const me = await getCurrentUser();
  const staff = isStaff(me);
  const days = changelogByDay(getChangelog().filter((e) => e.audience === "everyone" || staff));

  return (
    <Page>
      <PageHeader title={t("changelog.title")} subtitle={t("changelog.subtitle")} />
      {days.length === 0 && <EmptyState title={t("changelog.empty")} />}
      {days.map(({ date, entries }) => (
        <Card key={date} id={date} title={<time dateTime={date}>{fmtDay(day(date))}</time>}>
          <ul className="-my-2 divide-y divide-line">
            {entries.map((e) => {
              const c = entryText(e, t.locale);
              return (
                <li key={e.id} id={e.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:gap-4">
                  <div className="flex shrink-0 flex-wrap items-start gap-1.5 sm:w-28 sm:flex-col">
                    <Pill tone={TONE[e.type]}>{t(`changelog.type.${e.type}`)}</Pill>
                    {e.audience === "admins" && <Pill>{t("changelog.forAdmins")}</Pill>}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-medium text-fg">{c.title}</h3>
                    {c.text?.split(/\n{2,}/).map((p, i) => (
                      <p key={i} className="whitespace-pre-line text-sm text-muted">
                        {p}
                      </p>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </Page>
  );
}
