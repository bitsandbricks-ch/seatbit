import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { InterestAnswer } from "@/db/schema";
import { getNames } from "@/lib/lans";
import { getAvatars } from "@/lib/avatars";
import { Avatar } from "./avatar";
import { Card, Verified } from "./ui";
import type { MessageKey, T } from "@/i18n/translate";

const GROUPS: { answer: InterestAnswer; title: MessageKey; dot: string }[] = [
  { answer: "yes", title: "interestList.yes", dot: "bg-bit" },
  { answer: "maybe", title: "interestList.maybe", dot: "bg-warn" },
  { answer: "no", title: "interestList.no", dot: "bg-danger" },
];

/**
 * Who answered the interest check, grouped by answer. Everyone who can see the event sees it,
 * like the attendee list later on, so members know who else is in before sign-up opens.
 */
export async function InterestList({ lanId, clanSlug, meId, t }: { lanId: string; clanSlug: string | null; meId: string; t: T }) {
  const answers = db.select().from(schema.lanInterest).where(eq(schema.lanInterest.lanId, lanId)).all();
  const ids = answers.map((a) => a.userId);
  const people = await getNames(lanId, ids);
  const avatars = getAvatars(ids);
  const label = (uid: string) => people.get(uid)?.label ?? "?";

  return (
    <Card id="interest" title={t("interestList.title")}>
      {answers.length === 0 ? (
        <p className="text-sm text-muted">{t("interestList.empty")}</p>
      ) : (
        <div className="space-y-4">
          {GROUPS.map((g) => {
            // Me first, then by name, the same order as the attendee list.
            const list = answers
              .filter((a) => a.answer === g.answer)
              .sort((a, b) => Number(b.userId === meId) - Number(a.userId === meId) || label(a.userId).localeCompare(label(b.userId)));
            if (list.length === 0) return null;
            return (
              <section key={g.answer} aria-label={t(g.title)}>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                  <span className={`size-2 rounded-full ${g.dot}`} aria-hidden />
                  {t(g.title)} <span className="text-faint">{list.length}</span>
                </h3>
                <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((a) => {
                    const mine = a.userId === meId;
                    return (
                      <li key={a.id} className="flex min-h-10 min-w-0 items-center gap-2 rounded-bit bg-raised/60 px-3 py-1.5 text-sm">
                        <Avatar data={avatars.get(a.userId)} size={22} />
                        {clanSlug ? (
                          <Link
                            href={`/clans/${clanSlug}/members/${a.userId}`}
                            className={`truncate hover:text-bit hover:underline ${mine ? "font-semibold text-bit" : ""}`}
                          >
                            {label(a.userId)}
                          </Link>
                        ) : (
                          <span className={`truncate ${mine ? "font-semibold text-bit" : ""}`}>{label(a.userId)}</span>
                        )}
                        {people.get(a.userId)?.verified && <Verified />}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}
