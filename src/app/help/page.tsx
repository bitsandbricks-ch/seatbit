import type { Metadata } from "next";
import { Card, Page, PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { getT } from "@/i18n/server";
import { MESSAGES } from "@/i18n/translate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t("help.title")} · Seatbit` };
}

type SectionId = keyof (typeof MESSAGES)["en"]["help"]["sections"];
const SECTIONS: [SectionId, IconName][] = [
  ["start", "start"],
  ["events", "calendar"],
  ["seats", "seat"],
  ["trip", "car"],
  ["lan", "bag"],
  ["roles", "people"],
  ["discord", "chat"],
  ["account", "bell"],
  ["leads", "compass"],
];

/**
 * How Seatbit works, for members and leads, in both languages. Public, so a link from a chat works before signing in.
 * Phones: the topics as rows that jump to their card. Desktop: the same list as a sticky sidebar.
 */
export default async function HelpPage() {
  const t = await getT();
  const sections = MESSAGES[t.locale].help.sections;
  const topics = (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {SECTIONS.map(([id, icon]) => (
        <li key={id}>
          <a href={`#${id}`} className="group flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm hover:bg-raised">
            <span className="text-muted group-hover:text-bit">
              <Icon name={icon} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-fg">{sections[id].title}</span>
              <span className="block truncate text-muted">{sections[id].status}</span>
            </span>
            <svg viewBox="0 0 16 16" width={12} height={12} aria-hidden className="shrink-0 text-faint group-hover:text-bit">
              <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4" />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <Page>
      <PageHeader title={t("help.title")} subtitle={t("help.intro")} />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <nav aria-label={t("help.nav")} className="min-w-0 lg:sticky lg:top-20">
          {topics}
        </nav>
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <section className="rounded-card border border-bit/40 bg-bit-soft p-4 sm:p-5">
            <h2 className="font-semibold text-fg">{t("help.flowTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("help.flow")}</p>
          </section>
          {SECTIONS.map(([id, icon]) => (
            <Card
              key={id}
              id={id}
              title={
                <span className="flex items-center gap-2">
                  <span className="text-muted">
                    <Icon name={icon} className="size-5" />
                  </span>
                  {sections[id].title}
                </span>
              }
            >
              <div className="-my-1 divide-y divide-line">
                {Object.entries(sections[id].items).map(([k, item]) => (
                  <details key={k} id={`${id}-${k}`} className="group py-1">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-fg hover:text-bit">
                      {item.q}
                      <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden className="shrink-0 text-muted transition group-open:rotate-180">
                        <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
                      </svg>
                    </summary>
                    <p className="pb-3 text-sm text-muted">{item.a}</p>
                  </details>
                ))}
              </div>
            </Card>
          ))}
          <p className="text-sm text-muted">{t("help.stillStuck")}</p>
        </div>
      </div>
    </Page>
  );
}
