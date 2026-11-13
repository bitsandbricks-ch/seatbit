"use client";
import { useRef, useState, useTransition } from "react";
import { addGame, deleteGame, setGameMark } from "@/app/lan-extras-actions";
import type { GameView } from "@/lib/games";
import { btnGhost, btnPrimary, input } from "./ui";
import { useT } from "@/i18n/client";
import { httpHref } from "@/lib/safe-url";

/** Games to play at the LAN: suggest, vote, and tick off what you installed. */
export function GameList({
  lanId,
  games,
  meId,
  canManage,
  canAdd,
  names,
  reminderDays,
}: {
  lanId: string;
  games: GameView[];
  meId: string;
  canManage: boolean;
  canAdd: boolean;
  /** userId -> full name, for the voter list. */
  names: Record<string, string>;
  reminderDays: number;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("eventUi.failed"));
      }
    });
  const toInstall = games.filter((g) => g.votes > 0 && !g.myInstalled);
  const gb = toInstall.reduce((n, g) => n + (g.sizeGb ?? 0), 0);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {t("games.intro")} {t("games.reminder", { days: reminderDays })}
        {toInstall.length > 0 && (
          <span className="block text-warn">
            {gb ? t("games.stillNeedGb", { count: toInstall.length, gb }) : t("games.stillNeed", { count: toInstall.length })}
          </span>
        )}
      </p>

      {games.length === 0 ? (
        <p className="text-sm text-muted">{t("games.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {games.map((g, i) => (
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
                <p className="truncate text-xs text-muted" title={g.voters.map((v) => names[v] ?? "?").join(", ")}>
                  {t("games.votes", { count: g.votes })}
                  {g.votes ? `: ${g.voters.map((v) => names[v] ?? "?").join(", ")}` : ""} · {t("games.installedCount", { count: g.installed })}
                </p>
              </div>
              <div className="flex w-full items-center gap-2 pl-8 sm:w-auto sm:pl-0">
                <button
                  disabled={pending}
                  aria-pressed={g.myVote}
                  onClick={() => run(() => setGameMark(g.id, "vote", !g.myVote))}
                  className={`min-h-9 rounded-md border px-3 text-sm transition ${g.myVote ? "border-bit bg-bit-soft text-bit" : "border-line text-muted hover:text-fg"}`}
                >
                  {g.myVote ? t("games.voted") : t("games.vote")}
                </button>
                <label className="flex min-h-9 items-center gap-2 rounded-md border border-line px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={g.myInstalled}
                    disabled={pending}
                    onChange={(e) => run(() => setGameMark(g.id, "installed", e.target.checked))}
                    className="h-4 w-4 accent-bit"
                  />
                  {t("games.installed")}
                </label>
                {(g.addedBy === meId || canManage) && (
                  <button
                    disabled={pending}
                    className={`${btnGhost} !px-2`}
                    aria-label={t("games.remove", { name: g.name })}
                    onClick={() => run(() => deleteGame(g.id))}
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <form
          ref={form}
          className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)_auto]"
          action={(fd) =>
            run(async () => {
              const r = await addGame(lanId, fd);
              if (r.error) setError(r.error);
              else form.current?.reset();
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
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
