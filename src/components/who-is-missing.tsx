"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { nudgeMissing } from "@/app/lan-extras-actions";
import type { AvatarData } from "@/lib/avatars";
import { relative } from "@/lib/format";
import { Avatar } from "./avatar";
import { Card, Notice, Pill, btnPrimary, btnSecondary } from "./ui";

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
  /** For orga steps: where to fix it. */
  fix?: { href: string; label: string };
};

/** Orga view: who still owes an answer, a ticket, a nick or a seat, with one-tap nudges by Discord DM or mail. */
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
  const members = groups.filter((g) => g.who === "member");
  const orga = groups.filter((g) => g.who === "orga");
  if (groups.length === 0)
    return (
      <Card>
        <p className="text-sm text-muted">Nobody is missing anything. Everyone answered, has a ticket and a seat.</p>
      </Card>
    );
  return (
    <div className="space-y-4 sm:space-y-6">
      <p className="max-w-2xl text-sm text-muted">
        Who still owes the group something, step by step. A nudge goes out as a Discord DM (if they kept DMs on) and as a
        mail (if they kept email reminders on). Each person gets at most one nudge per step every{" "}
        {Math.round(cooldownMs / 3_600_000)} hours.
      </p>
      {blocked && <Notice tone="warn">{blocked}</Notice>}
      <nav aria-label="Steps" className="flex flex-wrap gap-2">
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
            actions={<Pill tone="amber">orga to-do</Pill>}
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
                  {p.discord && p.email ? "DM + mail" : p.discord ? "Discord DM" : p.email ? "Mail only" : <span className="text-warn">Can&apos;t reach</span>}
                  {p.nudgedAt && <> · nudged {relative(new Date(p.nudgedAt))}</>}
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
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // Evaluated once per render; the server re-renders after every nudge.
  const [now] = useState(() => Date.now());
  const cooling = (p: MissingPersonView) => !!p.nudgedAt && now - new Date(p.nudgedAt).getTime() < cooldownMs;
  const reachable = (p: MissingPersonView) => p.discord || p.email;
  const ready = g.people.filter((p) => reachable(p) && !cooling(p));
  const send = (userIds?: string[]) =>
    start(async () => {
      setMsg(null);
      try {
        const r = await nudgeMissing(lanId, g.step, userIds);
        const parts = [`Nudged ${r.sent}`];
        if (r.skipped) parts.push(`${r.skipped} nudged recently`);
        if (r.unreachable) parts.push(`${r.unreachable} can't be reached`);
        setMsg({ tone: r.sent ? "ok" : "err", text: parts.join(" · ") });
      } catch (e) {
        setMsg({ tone: "err", text: e instanceof Error ? e.message : "Failed" });
      }
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
          {ready.length ? `Nudge all ${ready.length}` : "All nudged"}
        </button>
      }
    >
      <p className="mb-3 text-sm text-muted">{g.hint}</p>
      <PeopleList
        people={g.people}
        profileBase={profileBase}
        action={(p) =>
          cooling(p) ? (
            <span className="text-xs text-faint">Nudged</span>
          ) : (
            <button
              disabled={pending || blocked || !reachable(p)}
              className={`${btnSecondary} !min-h-8 !px-2.5 text-xs`}
              onClick={() => send([p.userId])}
              aria-label={`Nudge ${p.name}`}
            >
              Nudge
            </button>
          )
        }
      />
      {msg && <p className={`mt-2 text-sm ${msg.tone === "ok" ? "text-bit" : "text-warn"}`}>{msg.text}</p>}
    </Card>
  );
}
