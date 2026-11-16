"use client";
import { useState, useTransition } from "react";
import { createTeam, deleteTeam, joinTeam, leaveTeam, updateTeam } from "@/app/team-actions";
import { useT } from "@/i18n/client";
import type { AvatarData } from "@/lib/avatars";
import type { GameView } from "@/lib/games";
import { httpHref } from "@/lib/safe-url";
import type { TeamView } from "@/lib/teams";
import { useRunAction } from "./action-form";
import { Avatar } from "./avatar";
import { ask } from "./dialog";
import { SidePanel } from "./side-panel";
import { Field, btnDanger, btnGhost, btnPrimary, btnSecondary, input } from "./ui";

type People = { names: Record<string, string>; avatars: Record<string, AvatarData> };

/** Teams of one game as small chips under the game, each opening the team in the side panel. */
export function TeamChips({
  g,
  meId,
  canManage,
  canJoin,
  people,
}: {
  g: GameView;
  meId: string;
  canManage: boolean;
  canJoin: boolean;
  people: People;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | "new" | null>(null);
  const team = g.teams.find((x) => x.id === open);
  if (!g.teams.length && !canJoin) return null;
  return (
    <>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {g.teams.map((x) => {
          const full = x.members.length >= x.size;
          const mine = x.members.includes(meId);
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => setOpen(x.id)}
              title={t("teams.placesLong", { count: x.members.length, size: x.size })}
              className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition hover:border-bit/50 ${
                mine ? "border-bit/50 bg-bit-soft text-bit" : "border-line text-fg"
              }`}
            >
              <ShieldIcon />
              <span className="max-w-40 truncate font-medium">{x.name}</span>
              <span className={`tabular-nums ${full ? "text-bit" : "text-muted"}`}>
                {full ? "✓" : t("teams.places", { count: x.members.length, size: x.size })}
              </span>
            </button>
          );
        })}
        {canJoin && (
          <button type="button" onClick={() => setOpen("new")} className="inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed border-line px-2.5 text-xs text-muted hover:border-bit/50 hover:text-fg">
            <span aria-hidden>+</span> {t("teams.newTeam")}
          </button>
        )}
      </div>
      {open === "new" && (
        <SidePanel title={t("teams.newTeamFor", { game: g.name })} onClose={() => setOpen(null)}>
          <TeamForm g={g} onDone={() => setOpen(null)} />
        </SidePanel>
      )}
      {team && (
        <SidePanel title={team.name} onClose={() => setOpen(null)}>
          <TeamDetails g={g} team={team} meId={meId} canManage={canManage} canJoin={canJoin} people={people} onGone={() => setOpen(null)} />
        </SidePanel>
      )}
    </>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />
    </svg>
  );
}

function TeamForm({ g, team, onDone }: { g: GameView; team?: TeamView; onDone: () => void }) {
  const t = useT();
  const act = useRunAction();
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      action={(fd) =>
        start(async () => {
          if (await act(() => (team ? updateTeam(team.id, fd) : createTeam(g.id, fd)))) onDone();
        })
      }
    >
      {!team && <p className="text-sm text-muted">{t("teams.hint")}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
        <Field label={t("teams.name")}>
          <input name="name" required maxLength={40} defaultValue={team?.name} placeholder={t("teams.namePh")} className={input} autoFocus />
        </Field>
        <Field label={t("teams.size")}>
          <input name="size" type="number" required min={2} max={16} defaultValue={team?.size ?? 5} className={input} />
        </Field>
      </div>
      <Field label={t("teams.link")}>
        <input name="url" type="url" defaultValue={team?.url} placeholder={t("teams.linkPh")} className={input} />
      </Field>
      <Field label={t("teams.note")}>
        <input name="note" maxLength={200} defaultValue={team?.note} placeholder={t("teams.notePh")} className={input} />
      </Field>
      <div className="flex gap-2">
        <button disabled={pending} className={btnPrimary}>
          {team ? t("teams.save") : t("teams.create")}
        </button>
        <button type="button" className={btnSecondary} onClick={onDone}>
          {t("teams.cancel")}
        </button>
      </div>
    </form>
  );
}

function TeamDetails({
  g,
  team,
  meId,
  canManage,
  canJoin,
  people,
  onGone,
}: {
  g: GameView;
  team: TeamView;
  meId: string;
  canManage: boolean;
  canJoin: boolean;
  people: People;
  onGone: () => void;
}) {
  const t = useT();
  const act = useRunAction();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      if (await act(fn, false)) after?.();
    });
  const name = (id: string) => (id === meId ? `${people.names[id] ?? "?"} (${t("teams.you")})` : (people.names[id] ?? "?"));
  const captainView = canManage || team.captain === meId;
  const mine = team.members.includes(meId);
  const full = team.members.length >= team.size;
  const inOther = g.teams.some((x) => x.id !== team.id && x.members.includes(meId));
  const inAnyTeam = new Set(g.teams.flatMap((x) => x.members));
  const free = g.voters.filter((v) => !inAnyTeam.has(v));

  if (editing) return <TeamForm g={g} team={team} onDone={() => setEditing(false)} />;

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-sm">
        <p className="font-medium text-fg">
          {g.name} · {full ? t("teams.full") : t("teams.missing", { count: team.size - team.members.length })}
        </p>
        {team.note && <p className="text-muted">{team.note}</p>}
        {team.url && (
          <a href={httpHref(team.url)} target="_blank" rel="noreferrer" className="text-bit hover:underline">
            {t("teams.tournament")} ↗
          </a>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          {t("teams.players")} · {t("teams.places", { count: team.members.length, size: team.size })}
        </h3>
        <ul className="divide-y divide-line rounded-bit border border-line">
          {team.members.map((m) => (
            <li key={m} className="flex min-h-12 items-center justify-between gap-2 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2.5 text-sm">
                <Avatar data={people.avatars[m]} size={28} />
                <span className="truncate font-medium">{name(m)}</span>
                {team.captain === m && <span className="text-xs text-muted">{t("teams.captain")}</span>}
              </span>
              {captainView && m !== meId && (
                <button
                  type="button"
                  disabled={pending}
                  aria-label={t("teams.remove", { name: people.names[m] ?? "?" })}
                  className={`${btnGhost} !min-h-8 !px-2`}
                  onClick={async () => {
                    if (await ask({ title: t("teams.removeQ", { name: people.names[m] ?? "?", team: team.name }), confirm: t("dialog.remove"), danger: true }))
                      run(() => leaveTeam(team.id, m));
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
          {Array.from({ length: Math.max(0, team.size - team.members.length) }, (_, i) => (
            <li key={`open-${i}`} className="flex min-h-12 items-center gap-2.5 px-3 py-2 text-sm text-faint">
              <span className="size-7 rounded-full border border-dashed border-line" aria-hidden />
              {t("teams.open")}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        {mine ? (
          <button type="button" disabled={pending} className={btnSecondary} onClick={() => run(() => leaveTeam(team.id))}>
            {t("teams.leave")}
          </button>
        ) : (
          canJoin &&
          !full && (
            <button type="button" disabled={pending || inOther} className={btnPrimary} onClick={() => run(() => joinTeam(team.id))}>
              {t("teams.join")}
            </button>
          )
        )}
        {captainView && (
          <>
            <button type="button" className={btnSecondary} onClick={() => setEditing(true)}>
              {t("teams.edit")}
            </button>
            <button
              type="button"
              disabled={pending}
              className={btnDanger}
              onClick={async () => {
                if (await ask({ title: t("teams.deleteQ", { name: team.name }), body: t("teams.deleteBody"), confirm: t("dialog.delete"), danger: true }))
                  run(() => deleteTeam(team.id), onGone);
              }}
            >
              {t("teams.delete")}
            </button>
          </>
        )}
      </div>
      {!mine && inOther && <p className="text-xs text-muted">{t("teams.oneTeam")}</p>}

      {captainView && g.voters.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("teams.withoutTeam", { game: g.name })}</h3>
          {free.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {free.map((v) => (
                <li key={v} className="inline-flex items-center gap-1.5 rounded-full bg-raised px-2 py-1 text-xs">
                  <Avatar data={people.avatars[v]} size={18} ring={false} />
                  {name(v)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t("teams.withoutTeamNone", { game: g.name })}</p>
          )}
        </div>
      )}
    </div>
  );
}
