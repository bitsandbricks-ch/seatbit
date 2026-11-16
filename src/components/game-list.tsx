"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { addGame, deleteGame, setGameMark, updateGame } from "@/app/lan-extras-actions";
import type { GameView, PastGame } from "@/lib/games";
import { btnGhost, btnPrimary, btnSecondary, input } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";
import { httpHref } from "@/lib/safe-url";
import type { AvatarData } from "@/lib/avatars";
import { Avatar } from "./avatar";
import { TeamChips } from "./team-panel";
import { myGamesTodo } from "@/lib/games-todo";

/** Games to play at the LAN: suggest, vote, and tick off what you installed. */
export function GameList({
  lanId,
  games,
  meId,
  canManage,
  canAdd,
  names,
  avatars,
  reminderDays,
  lastTime,
}: {
  lanId: string;
  games: GameView[];
  meId: string;
  canManage: boolean;
  canAdd: boolean;
  /** userId -> name per the clan's name display, for voters and who added a game. */
  names: Record<string, string>;
  avatars: Record<string, AvatarData>;
  reminderDays: number;
  /** Games of the previous event of this LAN type that aren't on the list yet. */
  lastTime?: { lanName: string; games: PastGame[] } | null;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  const form = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await act(fn);
    });
  // Vote and "installed" show at once (slow LAN wifi) and fall back if saving fails.
  const [marks, setMark] = useOptimistic<Record<string, boolean>, [string, boolean]>({}, (s, [k, on]) => ({ ...s, [k]: on }));
  const mark = (id: string, kind: "vote" | "installed", on: boolean) =>
    run(() => {
      setMark([`${id}:${kind}`, on]);
      return setGameMark(id, kind, on);
    });
  const voted = (g: { id: string; myVote: boolean }) => marks[`${g.id}:vote`] ?? g.myVote;
  const { toInstall, gb } = myGamesTodo(
    games.map((g) => ({ ...g, myVote: voted(g), myInstalled: marks[`${g.id}:installed`] ?? g.myInstalled })),
  );
  const addPast = (p: PastGame) => {
    const fd = new FormData();
    fd.set("name", p.name);
    fd.set("sizeGb", p.sizeGb == null ? "" : String(p.sizeGb));
    fd.set("url", p.url);
    run(() => addGame(lanId, fd));
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {t("games.intro")} {t("games.reminder", { days: reminderDays })}
        {toInstall > 0 && (
          <span className="block text-warn">
            {gb ? t("games.stillNeedGb", { count: toInstall, gb }) : t("games.stillNeed", { count: toInstall })}
          </span>
        )}
      </p>

      {games.length === 0 ? (
        <p className="text-sm text-muted">{t("games.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {games.map((g, i) =>
            editing === g.id ? (
              <li key={g.id} className="rounded-bit border border-bit/40 bg-surface px-3 py-2.5">
                <form
                  className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)_auto]"
                  aria-label={t("games.editTitle")}
                  action={(fd) =>
                    start(async () => {
                      if (await act(() => updateGame(g.id, fd))) setEditing(null);
                    })
                  }
                >
                  <input name="name" required maxLength={60} defaultValue={g.name} className={input} aria-label={t("games.game")} autoFocus />
                  <input
                    name="sizeGb"
                    type="number"
                    min={0}
                    max={2000}
                    defaultValue={g.sizeGb ?? ""}
                    placeholder="GB"
                    className={input}
                    aria-label={t("games.size")}
                  />
                  <input name="url" type="url" defaultValue={g.url} placeholder={t("games.linkPh")} className={input} aria-label={t("games.link")} />
                  <div className="flex gap-2">
                    <button disabled={pending} className={btnPrimary}>
                      {t("games.save")}
                    </button>
                    <button type="button" className={btnSecondary} onClick={() => setEditing(null)}>
                      {t("games.cancel")}
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-bit border border-line bg-surface px-3 py-2.5">
                <span className="w-5 text-right text-sm tabular-nums text-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg">
                    {g.url ? (
                      <a href={httpHref(g.url)} target="_blank" rel="noreferrer" className="hover:text-bit hover:underline">
                        {g.name}
                      </a>
                    ) : (
                      g.name
                    )}
                    {g.sizeGb != null && <span className="ml-2 whitespace-nowrap text-xs font-normal text-muted">{g.sizeGb} GB</span>}
                  </p>
                  {g.addedBy && names[g.addedBy] && (
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                      <Avatar data={avatars[g.addedBy]} size={16} ring={false} />
                      <span className="truncate">
                        {t("games.addedBy", { name: g.addedBy === meId ? t("games.you") : names[g.addedBy] })}
                      </span>
                    </p>
                  )}
                  <p className="truncate text-xs text-muted" title={g.voters.map((v) => names[v] ?? "?").join(", ")}>
                    {t("games.votes", { count: g.votes })}
                    {g.votes ? `: ${g.voters.map((v) => names[v] ?? "?").join(", ")}` : ""} · {t("games.installedCount", { count: g.installed })}
                  </p>
                  <TeamChips g={g} meId={meId} canManage={canManage} canJoin={canAdd} people={{ names, avatars }} />
                </div>
                <div className="flex w-full items-center gap-2 pl-8 sm:w-auto sm:pl-0">
                  <button
                    disabled={pending}
                    aria-pressed={voted(g)}
                    onClick={() => mark(g.id, "vote", !voted(g))}
                    className={`min-h-9 rounded-md border px-3 text-sm transition ${voted(g) ? "border-bit bg-bit-soft text-bit" : "border-line text-muted hover:text-fg"}`}
                  >
                    {voted(g) ? t("games.voted") : t("games.vote")}
                  </button>
                  <label className="flex min-h-9 items-center gap-2 rounded-md border border-line px-3 text-sm">
                    <input
                      type="checkbox"
                      checked={marks[`${g.id}:installed`] ?? g.myInstalled}
                      disabled={pending}
                      onChange={(e) => mark(g.id, "installed", e.target.checked)}
                      className="h-4 w-4 accent-bit"
                    />
                    {t("games.installed")}
                  </label>
                  {(g.addedBy === meId || canManage) && (
                    <>
                      <button
                        disabled={pending}
                        className={`${btnGhost} !px-2`}
                        aria-label={t("games.edit", { name: g.name })}
                        title={t("games.editTitle")}
                        onClick={() => setEditing(g.id)}
                      >
                        ✎
                      </button>
                      <button
                        disabled={pending}
                        className={`${btnGhost} !px-2`}
                        aria-label={t("games.remove", { name: g.name })}
                        onClick={() => run(() => deleteGame(g.id))}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {canAdd && lastTime && lastTime.games.length > 0 && (
        <section aria-label={t("games.lastTime", { lan: lastTime.lanName })} className="space-y-2">
          <p className="text-xs text-muted">{t("games.lastTime", { lan: lastTime.lanName })}</p>
          <ul className="flex flex-wrap gap-2">
            {lastTime.games.map((p) => (
              <li key={p.name}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => addPast(p)}
                  aria-label={t("games.addPast", { name: p.name })}
                  title={t("games.votes", { count: p.votes })}
                  className="min-h-9 rounded-md border border-dashed border-line px-3 text-sm text-muted transition hover:border-bit hover:text-fg"
                >
                  + {p.name}
                  {p.sizeGb != null && <span className="ml-1.5 text-xs text-faint">{p.sizeGb} GB</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canAdd && (
        <form
          ref={form}
          className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)_auto]"
          action={(fd) =>
            start(async () => {
              if (await act(() => addGame(lanId, fd))) form.current?.reset();
            })
          }
        >
          <input name="name" required maxLength={60} placeholder={t("games.namePh")} className={input} aria-label={t("games.game")} />
          <input name="sizeGb" type="number" min={0} max={2000} placeholder="GB" className={input} aria-label={t("games.size")} />
          <input name="url" type="url" placeholder={t("games.linkPh")} className={input} aria-label={t("games.link")} />
          <button disabled={pending} className={btnPrimary}>
            {t("games.add")}
          </button>
        </form>
      )}
    </div>
  );
}
