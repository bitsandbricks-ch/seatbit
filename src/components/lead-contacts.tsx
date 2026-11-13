import type { LeadContact } from "@/db/schema";
import type { T } from "@/i18n/translate";

type Contact = Pick<LeadContact, "name" | "role" | "email" | "discord" | "phone" | "url" | "note">;

const linkCls = "text-bit hover:underline break-all";

/** One organizer contact with every way to reach them. No hooks, so server and client pages both use it. */
export function ContactDetails({ c, t, compact = false }: { c: Contact; t: T; compact?: boolean }) {
  return (
    <div className="min-w-0 flex-1 text-sm">
      <p className="font-medium text-fg">
        {c.name}
        {c.role && <span className="font-normal text-muted"> · {c.role}</span>}
      </p>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {c.email && (
          <a href={`mailto:${c.email}`} className={linkCls}>
            {c.email}
          </a>
        )}
        {c.phone && (
          <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`} className={linkCls}>
            {c.phone}
          </a>
        )}
        {c.discord && (
          <span className="text-muted">
            {t("contacts.discord")}: <span className="select-all text-fg">{c.discord}</span>
          </span>
        )}
        {c.url && (
          <a href={c.url} target="_blank" rel="noreferrer" className={linkCls}>
            {c.url.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗
          </a>
        )}
      </p>
      {c.note && !compact && <p className="mt-0.5 whitespace-pre-line text-xs text-muted">{c.note}</p>}
    </div>
  );
}
