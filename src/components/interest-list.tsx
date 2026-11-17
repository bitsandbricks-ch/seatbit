import Link from "next/link";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AttendanceStatus } from "@/db/schema";
import { getNames } from "@/lib/lans";
import { getAvatars } from "@/lib/avatars";
import { Avatar } from "./avatar";
import { Card } from "./ui";
import { MemberBadges } from "./member-badges";
import { memberBadges } from "@/lib/member-badges";
import { InterestRemind } from "./interest-remind";
import type { MessageKey, T } from "@/i18n/translate";

type Group = AttendanceStatus | "none";
const GROUPS: { key: Group; title: MessageKey; dot: string }[] = [
  { key: "going", title: "interestList.yes", dot: "bg-bit" },
  { key: "maybe", title: "interestList.maybe", dot: "bg-warn" },
  { key: "declined", title: "interestList.no", dot: "bg-danger" },
  { key: "none", title: "interestList.none", dot: "bg-faint" },
];

/**
 * Who answered the interest check, grouped by answer, plus the clan members who haven't yet.
 * Everyone who can see the event sees it, so members know who else is in before sign-up opens.
 * Leads can remind the ones without an answer from here.
 */
export async function InterestList({
  lanId,
  clanId,
  clanSlug,
  meId,
  canRemind,
  t,
}: {
  lanId: string;
  clanId: string | null;
  clanSlug: string | null;
  meId: string;
  /** Leads of a published event: a "Remind" button on the "No answer yet" group. */
  canRemind: boolean;
  t: T;
}) {
  const answers = db.select().from(schema.attendance).where(eq(schema.attendance.lanId, lanId)).all();
  const answered = new Set(answers.map((a) => a.userId));
  const members = clanId
    ? db
        .select({ userId: schema.clanMember.userId })
        .from(schema.clanMember)
        .where(and(eq(schema.clanMember.clanId, clanId), ne(schema.clanMember.role, "pending")))
        .all()
        .map((m) => m.userId)
    : [];
  const open = members.filter((uid) => !answered.has(uid));
  const groupOf = new Map<string, Group>([
    ...answers.map((a) => [a.userId, a.status === "waitlist" ? "going" : a.status] as const),
    ...open.map((uid) => [uid, "none"] as const),
  ]);
  const ids = [...groupOf.keys()];
  const people = await getNames(lanId, ids);
  const badges = memberBadges(ids);
  const avatars = getAvatars(ids);
  const label = (uid: string) => people.get(uid)?.label ?? "?";

  return (
    <Card id="interest" title={t("interestList.title")}>
      {ids.length === 0 ? (
        <p className="text-sm text-muted">{t("interestList.empty")}</p>
      ) : (
        <div className="space-y-4">
          {GROUPS.map((g) => {
            // Me first, then by name, the same order as the attendee list.
            const list = ids
              .filter((uid) => groupOf.get(uid) === g.key)
              .sort((a, b) => Number(b === meId) - Number(a === meId) || label(a).localeCompare(label(b)));
            if (list.length === 0) return null;
            return (
              <section key={g.key} aria-label={t(g.title)}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                    <span className={`size-2 rounded-full ${g.dot}`} aria-hidden />
                    {t(g.title)} <span className="text-faint">{list.length}</span>
                  </h3>
                  {g.key === "none" && canRemind && <InterestRemind lanId={lanId} count={list.length} />}
                </div>
                <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((uid) => {
                    const mine = uid === meId;
                    return (
                      <li
                        key={uid}
                        className={`flex min-h-10 min-w-0 items-center gap-2 rounded-bit bg-raised/60 px-3 py-1.5 text-sm ${g.key === "none" ? "text-muted" : ""}`}
                      >
                        <Avatar data={avatars.get(uid)} size={22} />
                        {clanSlug ? (
                          <Link
                            href={`/clans/${clanSlug}/members/${uid}`}
                            className={`truncate hover:text-bit hover:underline ${mine ? "font-semibold text-bit" : ""}`}
                          >
                            {label(uid)}
                          </Link>
                        ) : (
                          <span className={`truncate ${mine ? "font-semibold text-bit" : ""}`}>{label(uid)}</span>
                        )}
                        <MemberBadges b={badges.get(uid)} t={t} />
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
