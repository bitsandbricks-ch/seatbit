"use client";
import { useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { addGame, deleteGame, setGameMark, updateGame } from "@/app/lan-extras-actions";
import type { GameView, PastGame } from "@/lib/games";
import { btnGhost, btnPrimary, btnSecondary, inlineLink, input } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";
import { httpHref } from "@/lib/safe-url";
import type { AvatarData } from "@/lib/avatars";
import { Avatar } from "./avatar";
import { TeamChips } from "./team-panel";
import { myGamesTodo } from "@/lib/games-todo";
import { storeOf } from "@/lib/game-stores";
import { GamePicker, type Picked } from "./game-picker";
import { GameCover } from "./game-cover";
import Link from "next/link";

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
  catalogStaff = false,
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
  /** Platform staff who keep the game catalog: may fix every game's details. */
  catalogStaff?: boolean;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  const form = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked>(null);
  const [sent, setSent] = useState(0);
  // The catalog details change every event's copy, so only who put the game in the catalog
  // (or staff) changes them. Games from before the catalog: whoever may edit the game.
  const canEditDetails = (g: GameView) =>
    catalogStaff || (g.catalogId ? g.catalogBy === meId : g.addedBy === meId || canManage);
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
    if (p.catalogId) fd.set("catalogId", p.catalogId);
    fd.set("sizeGb", p.sizeGb == null ? "" : String(p.sizeGb));
    fd.set("url", p.url);
    run(() => addGame(lanId, fd));
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {t("games.intro")} {t("games.reminder", { days: reminderDays })}{" "}
        <Link href="/games" className={inlineLink}>
          {t("games.catalogLink")}
        </Link>
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
<GameEditForm
                  g={g}
                  canEditDetails={canEditDetails(g)}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSave={(fd) =>
                    start(async () => {
                      if (await act(() => updateGame(g.id, fd))) setEditing(null);
                    })
                  }
                />
              </li>
            ) : (
              <li
                key={g.id}
                className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-bit border border-line bg-surface p-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:gap-x-4"
              >
                <GameCover name={g.name} cover={g.cover} color={g.coverColor} className="w-full self-start sm:row-span-2">
                  <span className="absolute left-1 top-1 rounded bg-ink/75 px-1.5 text-xs font-semibold tabular-nums text-fg" aria-label={t("games.rank", { n: i + 1 })}>
                    {i + 1}
                  </span>
                </GameCover>
                <div className="min-w-0">
                  <p className="text-base font-semibold leading-snug text-fg sm:text-lg">
                    {g.catalogId ? (
                      <Link href={`/games/${g.catalogId}`} className="hover:text-bit hover:underline">
                        {g.name}
                      </Link>
                    ) : g.url ? (
                      <a href={httpHref(g.url)} target="_blank" rel="noreferrer" className="hover:text-bit hover:underline">
                        {g.name}
                      </a>
                    ) : (
                      g.name
                    )}
                  </p>
                  <GameFacts g={g} />
                  <GameLinks g={g} />
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:self-start">
                  <button
                    disabled={pending}
                    aria-pressed={voted(g)}
                    onClick={() => mark(g.id, "vote", !voted(g))}
                    className={`min-h-10 rounded-md border px-3 text-sm font-medium transition ${voted(g) ? "border-bit bg-bit-soft text-bit" : "border-line text-muted hover:text-fg"}`}
                  >
                    {voted(g) ? t("games.voted") : t("games.vote")}
                  </button>
                  <label className="flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium">
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
                    <div className="flex gap-1">
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
                    </div>
                  )}
                </div>
                <div className="col-span-2 space-y-2 border-t border-line pt-3 sm:col-start-2 sm:row-start-2 sm:border-0 sm:pt-0">
                  <PeopleRow
                    label={t("games.votes", { count: g.votes })}
                    icon="▲"
                    ids={g.voters}
                    names={names}
                    avatars={avatars}
                    meId={meId}
                    empty={t("games.noVotes")}
                  />
                  <PeopleRow
                    label={t("games.installedCount", { count: g.installed })}
                    icon="✓"
                    ids={g.installers}
                    names={names}
                    avatars={avatars}
                    meId={meId}
                    empty={t("games.noInstalls")}
                  />
                  {g.addedBy && names[g.addedBy] && (
                    <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                      <Avatar data={avatars[g.addedBy]} size={16} ring={false} />
                      <span className="truncate">
                        {t("games.addedBy", { name: g.addedBy === meId ? t("games.you") : names[g.addedBy] })}
                      </span>
                    </p>
                  )}
                  <TeamChips g={g} meId={meId} canManage={canManage} canJoin={canAdd} people={{ names, avatars }} />
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
          aria-label={t("games.addTitle")}
          className={`grid gap-2 ${picked ? "sm:grid-cols-[minmax(0,1fr)_auto]" : "sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)_auto]"}`}
          action={(fd) =>
            start(async () => {
              if (await act(() => addGame(lanId, fd))) {
                form.current?.reset();
                setPicked(null);
                setSent((n) => n + 1);
              }
            })
          }
        >
          <GamePicker onPick={setPicked} resetKey={sent} />
          {!picked && (
            <>
              <input name="sizeGb" type="number" min={0} max={2000} placeholder="GB" className={input} aria-label={t("games.size")} />
              <input name="url" type="url" placeholder={t("games.linkPh")} className={input} aria-label={t("games.link")} />
            </>
          )}
          <button disabled={pending} className={btnPrimary}>
            {t("games.add")}
          </button>
          <p className="text-xs text-faint sm:col-span-full">{picked ? t("games.pickedHint") : t("games.addHint")}</p>
        </form>
      )}
    </div>
  );
}

function GameTag({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap rounded border border-line px-1.5 py-px text-xs text-muted">{children}</span>;
}

/** Size, players, free and LAN mode in one line. */
function GameFacts({ g }: { g: GameView }) {
  const t = useT();
  const players = playersText(g, t);
  if (g.sizeGb == null && !players && !g.free && !g.lan) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
      {g.sizeGb != null && <span className="whitespace-nowrap">{g.sizeGb} GB</span>}
      {players && <span className="whitespace-nowrap">{players}</span>}
      {g.free && <GameTag>{t("games.free")}</GameTag>}
      {g.lan && <GameTag>{t("games.lanMode")}</GameTag>}
    </p>
  );
}

function playersText(g: Pick<GameView, "minPlayers" | "maxPlayers">, t: ReturnType<typeof useT>) {
  if (g.minPlayers != null && g.maxPlayers != null && g.minPlayers !== g.maxPlayers) return t("games.playersRange", { min: g.minPlayers, max: g.maxPlayers });
  const n = g.maxPlayers ?? g.minPlayers;
  return n ? t("games.players", { count: n }) : null;
}

/** Who voted, or who installed: the count, their avatars and names. */
function PeopleRow({
  label,
  icon,
  ids,
  names,
  avatars,
  meId,
  empty,
}: {
  label: string;
  icon: string;
  ids: string[];
  names: Record<string, string>;
  avatars: Record<string, AvatarData>;
  meId: string;
  empty: string;
}) {
  const t = useT();
  const who = ids.map((id) => (id === meId ? t("games.you") : (names[id] ?? "?")));
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:flex-nowrap">
      <span className="w-24 shrink-0 font-medium text-fg sm:w-28">
        <span aria-hidden className="mr-1 text-muted">
          {icon}
        </span>
        <span>{label}</span>
      </span>
      {ids.length === 0 ? (
        <span className="text-faint">{empty}</span>
      ) : (
        <>
          <span className="flex shrink-0 -space-x-1.5" aria-hidden>
            {ids.slice(0, 6).map((id) => (
              <Avatar key={id} data={avatars[id]} size={24} ring={false} />
            ))}
          </span>
          <span className="w-full min-w-0 truncate text-muted sm:w-auto" title={who.join(", ")}>
            {who.join(", ")}
          </span>
        </>
      )}
    </div>
  );
}

/** Store page and, for Steam games, a button that opens Steam's install dialog. */
function GameLinks({ g }: { g: GameView }) {
  const t = useT();
  const store = storeOf(g.url);
  const href = httpHref(g.url);
  if (!href && !g.installUrl) return null;
  const chip = "inline-flex min-h-8 items-center gap-1 rounded-md border border-line px-2.5 text-sm text-muted transition hover:border-bit hover:text-fg";
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5">
      {href && store && (
        <a href={href} target="_blank" rel="noreferrer" className={chip}>
          {store.name ?? t("games.website")} <span aria-hidden>↗</span>
        </a>
      )}
      {g.installUrl && (
        <a href={g.installUrl} className={chip} title={t("games.installTitle")}>
          <span aria-hidden>⤓</span> {t("games.install")}
        </a>
      )}
    </p>
  );
}

/** Edit a game on the event: its name, and the catalog details when I may change them. */
function GameEditForm({
  g,
  canEditDetails,
  pending,
  onSave,
  onCancel,
}: {
  g: GameView;
  canEditDetails: boolean;
  pending: boolean;
  onSave: (fd: FormData) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const yesNo = (v: boolean | null) => (v == null ? "" : v ? "yes" : "no");
  return (
    <form className="space-y-2" aria-label={t("games.editTitle")} action={onSave}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)]">
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
          disabled={!canEditDetails}
        />
        <input
          name="url"
          type="url"
          defaultValue={g.url}
          placeholder={t("games.linkPh")}
          className={input}
          aria-label={t("games.link")}
          disabled={!canEditDetails}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          name="minPlayers"
          type="number"
          min={1}
          max={1000}
          defaultValue={g.minPlayers ?? ""}
          placeholder={t("games.minPlayers")}
          className={input}
          aria-label={t("games.minPlayers")}
          disabled={!canEditDetails}
        />
        <input
          name="maxPlayers"
          type="number"
          min={1}
          max={1000}
          defaultValue={g.maxPlayers ?? ""}
          placeholder={t("games.maxPlayers")}
          className={input}
          aria-label={t("games.maxPlayers")}
          disabled={!canEditDetails}
        />
        <select name="free" defaultValue={yesNo(g.free)} className={input} aria-label={t("games.price")} disabled={!canEditDetails}>
          <option value="">{t("games.priceUnknown")}</option>
          <option value="yes">{t("games.free")}</option>
          <option value="no">{t("games.paid")}</option>
        </select>
        <select name="lan" defaultValue={yesNo(g.lan)} className={input} aria-label={t("games.lanMode")} disabled={!canEditDetails}>
          <option value="">{t("games.lanUnknown")}</option>
          <option value="yes">{t("games.lanYes")}</option>
          <option value="no">{t("games.lanNo")}</option>
        </select>
      </div>
      {!canEditDetails && <p className="text-xs text-faint">{t("games.detailsLocked")}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className={btnPrimary}>
          {t("games.save")}
        </button>
        <button type="button" className={btnSecondary} onClick={onCancel}>
          {t("games.cancel")}
        </button>
      </div>
    </form>
  );
}
