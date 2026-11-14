import Link from "next/link";
import type { T } from "@/i18n/translate";
import type { SeatRule } from "@/lib/seat-rules";
import { SeatWishes } from "./seat-wishes";
import { Card, btnPrimary, btnSecondary, input } from "./ui";

type Person = { id: string; name: string };

/**
 * Manage → Seats: a lead picks a member who is coming and changes their seat wishes with the
 * same editor members use. The picker is a plain GET form (?editWishes=…), so it works without JS.
 */
export function WishLeadEditor({
  lanId,
  members,
  people,
  editing,
  seatLabels,
  rows,
  nearRange,
  closeHref,
  t,
}: {
  lanId: string;
  /** Members who are coming, whose wishes the planner uses. */
  members: Person[];
  /** People who can be named in a wish. */
  people: Person[];
  /** The member being edited, with their wishes. */
  editing: (Person & { rules: SeatRule[]; note: string; names: Record<string, string> }) | null;
  seatLabels: string[];
  rows: string[];
  nearRange: number;
  closeHref: string;
  t: T;
}) {
  return (
    <Card
      id="edit-wishes"
      title={editing ? t("wishLead.editing", { name: editing.name }) : t("wishLead.title")}
      actions={
        editing && (
          <Link href={closeHref} className={btnSecondary}>
            {t("wishLead.done")}
          </Link>
        )
      }
    >
      {editing ? (
        <>
          <p className="mb-3 text-sm text-muted">{t("wishLead.editingHint", { name: editing.name })}</p>
          <SeatWishes
            // A fresh editor per member, so state from the last one never leaks over.
            key={editing.id}
            lanId={lanId}
            member={{ id: editing.id, name: editing.name }}
            people={people.filter((p) => p.id !== editing.id)}
            names={editing.names}
            seatLabels={seatLabels}
            rows={rows}
            nearRange={nearRange}
            initial={{ rules: editing.rules, note: editing.note }}
          />
        </>
      ) : (
        <form method="get" action={`/lans/${lanId}/manage#edit-wishes`} className="space-y-2 text-sm">
          <input type="hidden" name="tab" value="seats" />
          <p className="text-muted">{t("wishLead.intro")}</p>
          <div className="flex flex-wrap gap-2">
            <select name="editWishes" required defaultValue="" aria-label={t("wishLead.pick")} className={`${input} min-w-0 basis-full sm:basis-0 sm:flex-1`}>
              <option value="" disabled>
                {t("wishLead.choose")}
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button className={`${btnPrimary} shrink-0`}>{t("wishLead.open")}</button>
          </div>
        </form>
      )}
    </Card>
  );
}
