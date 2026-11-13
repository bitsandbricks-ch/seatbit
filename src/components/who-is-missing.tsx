"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { nudgeMissing } from "@/app/lan-extras-actions";
import type { AvatarData } from "@/lib/avatars";
import { relative } from "@/lib/format";
import { Avatar } from "./avatar";
import { Card, Notice, Pill, btnPrimary, btnSecondary } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";
import { toast } from "./toast";

export type MissingPersonView = {
  userId: string;
  name: string;
  avatar?: AvatarData;
  discord: boolean;
  email: boolean;
  nudgedAt: Date | null;
  detail?: string;
};

export type MissingGroupView = {
  step: string;
  title: string;
  /** What the nudge says, in a few words. */
  hint: string;
  who: "member" | "orga";
  people: MissingPersonView[];
  /** For lead steps: where to fix it. */
  fix?: { href: string; label: string };
};

/** Lead view: who still owes an answer, a ticket, a nick or a seat, with one-tap nudges by Discord DM or mail. */
export function WhoIsMissing({
  lanId,
  groups,
  profileBase,
  blocked,
  cooldownMs,
}: {
  lanId: string;
  groups: MissingGroupView[];
  profileBase: string | null;
  /** Why nudges are off (draft, cancelled). */
  blocked: string | null;
  cooldownMs: number;
}) {
  const t = useT();
  const members = groups.filter((g) => g.who === "member");
  const orga = groups.filter((g) => g.who === "orga");
  if (groups.length === 0)
    return (
      <Card>
        <p className="text-sm text-muted">{t("missing.none")}</p>
      </Card>
    );
  return (
    <div className="space-y-4 sm:space-y-6">
      <p className="max-w-2xl text-sm text-muted">{t("missing.intro", { hours: Math.round(cooldownMs / 3_600_000) })}</p>
      {blocked && <Notice tone="warn">{blocked}</Notice>}
      <nav aria-label={t("missing.steps")} className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <a
            key={g.step}
            href={`#missing-${g.step}`}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm text-fg hover:border-bit/50"
          >
            {g.title}
            <span className={`rounded-full px-1.5 text-xs tabular-nums ${g.who === "orga" ? "bg-warn/15 text-warn" : "bg-bit-soft text-bit"}`}>
              {g.people.length}
            </span>
          </a>
        ))}
      </nav>
      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-2">
        {members.map((g) => (
          <MemberGroup key={g.step} lanId={lanId} group={g} profileBase={profileBase} blocked={!!blocked} cooldownMs={cooldownMs} />
        ))}
        {orga.map((g) => (
          <Card
            key={g.step}
            title={
              <span id={`missing-${g.step}`} className="scroll-mt-24">
                {g.title} <span className="text-sm font-normal text-faint">{g.people.length}</span>
              </span>
            }
            actions={<Pill tone="amber">{t("missing.leadTodo")}</Pill>}
          >
            <p className="mb-3 text-sm text-muted">{g.hint}</p>
            <PeopleList people={g.people} profileBase={profileBase} />
            {g.fix && (
              <Link href={g.fix.href} className={`${btnSecondary} mt-3`}>
                {g.fix.label}
              </Link>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function PeopleList({ people, profileBase, action }: { people: MissingPersonView[]; profileBase: string | null; action?: (p: MissingPersonView) => React.ReactNode }) {
  const t = useT();
  return (
    <ul className="divide-y divide-line rounded-bit border border-line">
      {people.map((p) => (
        <li key={p.userId} className="flex min-h-12 items-center justify-between gap-2 px-3 py-1.5 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar data={p.avatar} size={24} />
            <span className="min-w-0">
              {profileBase ? (
                <Link href={`${profileBase}${p.userId}`} className="block truncate text-fg hover:text-bit hover:underline">
                  {p.name}
                </Link>
              ) : (
                <span className="block truncate text-fg">{p.name}</span>
              )}
              {action && (
                <span className="block text-xs text-faint">
                  {p.discord && p.email ? (
                    t("missing.dmMail")
                  ) : p.discord ? (
                    t("missing.dm")
                  ) : p.email ? (
                    t("missing.mailOnly")
                  ) : (
                    <span className="text-warn">{t("missing.cantReach")}</span>
                  )}
                  {p.nudgedAt && <> · {t("missing.nudgedAgo", { when: relative(new Date(p.nudgedAt), new Date(), t.locale) })}</>}
                </span>
              )}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {p.detail && <Pill>{p.detail}</Pill>}
            {action?.(p)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MemberGroup({
  lanId,
  group: g,
  profileBase,
  blocked,
  cooldownMs,
}: {
  lanId: string;
  group: MissingGroupView;
  profileBase: string | null;
  blocked: boolean;
  cooldownMs: number;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  // Evaluated once per render; the server re-renders after every nudge.
  const [now] = useState(() => Date.now());
  const cooling = (p: MissingPersonView) => !!p.nudgedAt && now - new Date(p.nudgedAt).getTime() < cooldownMs;
  const reachable = (p: MissingPersonView) => p.discord || p.email;
  const ready = g.people.filter((p) => reachable(p) && !cooling(p));
  const send = (userIds?: string[]) =>
    start(async () => {
      let r: Awaited<ReturnType<typeof nudgeMissing>> | undefined;
      await act(async () => void (r = await nudgeMissing(lanId, g.step, userIds)), false);
      if (!r) return;
      const parts = [t("missing.nudged", { count: r.sent })];
      if (r.skipped) parts.push(t("missing.skipped", { count: r.skipped }));
      if (r.unreachable) parts.push(t("missing.unreachable", { count: r.unreachable }));
      // Nobody reached is worth a second look, so it shows as a problem.
      (r.sent ? toast.success : toast.error)(parts.join(" · "));
    });
  return (
    <Card
      title={
        <span id={`missing-${g.step}`} className="scroll-mt-24">
          {g.title} <span className="text-sm font-normal text-faint">{g.people.length}</span>
        </span>
      }
      actions={
        <button disabled={pending || blocked || ready.length === 0} className={btnPrimary} onClick={() => send()}>
          {ready.length ? t("missing.nudgeAll", { count: ready.length }) : t("missing.allNudged")}
        </button>
      }
    >
      <p className="mb-3 text-sm text-muted">{g.hint}</p>
      <PeopleList
        people={g.people}
        profileBase={profileBase}
        action={(p) =>
          cooling(p) ? (
            <span className="text-xs text-faint">{t("missing.nudgedShort")}</span>
          ) : (
            <button
              disabled={pending || blocked || !reachable(p)}
              className={`${btnSecondary} !min-h-8 !px-2.5 text-xs`}
              onClick={() => send([p.userId])}
              aria-label={t("missing.nudgeName", { name: p.name })}
            >
              {t("missing.nudge")}
            </button>
          )
        }
      />
    </Card>
  );
}
