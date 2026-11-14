"use client";
import { useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { setMySeatWishes } from "@/app/actions";
import { setMemberSeatWishes } from "@/app/seat-wish-actions";
import { btnPrimary, input } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";
import { MAX_NEAR, MAX_WISHES, addRule, isRanked, moveRule, type SeatRule } from "@/lib/seat-rules";
import { wishIcon, wishText } from "@/lib/wish-text";

type Wishes = { rules: SeatRule[]; note: string };
type AddKind = "next" | "near" | "seat" | "row";

// Gap between list items (space-y-2), used to shift neighbours while dragging.
const GAP = 8;

/**
 * Seat wishes: ranked wishes (the top one matters most, one "right next to" at most) and an unranked
 * "not right next to" list. Ranked wishes move by drag (handle, works with touch) or the
 * up/down buttons; every change saves right away. With `member`, a lead edits that member's
 * wishes (the member gets a DM).
 */
export function SeatWishes({
  lanId,
  people,
  names,
  seatLabels,
  rows,
  initial,
  nearRange,
  member,
}: {
  lanId: string;
  /** People who can be picked for near / next to / not next to. */
  people: { id: string; name: string }[];
  /** Names for everyone the rules mention (also people no longer coming). */
  names: Record<string, string>;
  seatLabels: string[];
  /** Row letters of the seat plan. */
  rows: string[];
  initial: Wishes;
  /** Seats apart that count as "near" at this event. */
  nearRange: number;
  /** A lead edits this member's wishes instead of their own. */
  member?: { id: string; name: string };
}) {
  const t = useT();
  const [rules, setRules] = useState<SeatRule[]>(initial.rules);
  const [note, setNote] = useState(initial.note);
  const savedNote = useRef(initial.note);
  const [adding, setAdding] = useState<AddKind | null>(null);
  const [pick, setPick] = useState("");
  const [avoidPick, setAvoidPick] = useState("");
  const [pending, start] = useTransition();
  const run = useRunAction();

  const ranked = rules.filter(isRanked);
  const avoids = rules.filter((r): r is Extract<SeatRule, { kind: "avoid" }> => r.kind === "avoid");

  const save = (next: SeatRule[], nextNote = note) => {
    const before = rules;
    const noteBefore = savedNote.current;
    // Ranked wishes first, then "not right next to": the order the server keeps too.
    const ordered = [...next.filter(isRanked), ...next.filter((r) => !isRanked(r))];
    setRules(ordered);
    // Set before the request so a blur right after Enter doesn't save twice.
    savedNote.current = nextNote;
    start(async () => {
      const w = { rules: ordered, note: nextNote };
      const ok = member
        ? await run(() => setMemberSeatWishes(lanId, member.id, w), t("wishLead.saved", { name: member.name }))
        : await run(() => setMySeatWishes(lanId, w), t("wishes.saved"));
      if (!ok) {
        setRules(before);
        savedNote.current = noteBefore;
      }
    });
  };
  const saveRanked = (nextRanked: SeatRule[]) => save([...nextRanked, ...avoids]);

  const nameOf = (id: string) => names[id] ?? people.find((p) => p.id === id)?.name ?? "?";
  const text = (r: SeatRule) => wishText(r, t, nameOf, nearRange);

  // --- Drag to reorder (pointer events, so it works with touch too) ---
  const listRef = useRef<HTMLOListElement>(null);
  const dragStart = useRef<{ y: number; rects: DOMRect[] } | null>(null);
  // h: the dragged item's height plus the gap, how far the others move aside.
  const [drag, setDrag] = useState<{ from: number; at: number; dy: number; h: number } | null>(null);

  const onHandleDown = (e: ReactPointerEvent, i: number) => {
    if (pending || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const items = [...(listRef.current?.children ?? [])] as HTMLElement[];
    const rects = items.map((el) => el.getBoundingClientRect());
    dragStart.current = { y: e.clientY, rects };
    setDrag({ from: i, at: i, dy: 0, h: (rects[i]?.height ?? 0) + GAP });
  };
  const onHandleMove = (e: ReactPointerEvent) => {
    const s = dragStart.current;
    if (!s || !drag) return;
    const dy = e.clientY - s.y;
    const r = s.rects[drag.from];
    const centre = r.top + r.height / 2 + dy;
    // The new place: how many of the other items sit above the dragged item's centre.
    const at = s.rects.filter((o, j) => j !== drag.from && o.top + o.height / 2 < centre).length;
    setDrag({ ...drag, at, dy });
  };
  const onHandleUp = () => {
    if (drag && drag.at !== drag.from) saveRanked(moveRule(ranked, drag.from, drag.at));
    dragStart.current = null;
    setDrag(null);
  };
  const shift = (j: number) => {
    if (!drag) return 0;
    if (j === drag.from) return drag.dy;
    const { h } = drag;
    if (drag.from < drag.at && j > drag.from && j <= drag.at) return -h;
    if (drag.at < drag.from && j >= drag.at && j < drag.from) return h;
    return 0;
  };

  const hasNext = ranked.some((r) => r.kind === "next");
  const nearFull = ranked.filter((r) => r.kind === "near").length >= MAX_NEAR;
  const blocked = (k: string) => (k === "next" && hasNext ? t("wishes.nextTaken") : k === "near" && nearFull ? t("wishes.nearFull", { max: MAX_NEAR }) : undefined);
  const addKinds: [AddKind | "edge" | "middle", string][] = [
    ["next", t("wishes.add.next")],
    ["near", t("wishes.add.near")],
    ["seat", t("wishes.add.seat")],
    ["row", t("wishes.add.row")],
    ["edge", t("wishes.add.edge")],
    ["middle", t("wishes.add.middle")],
  ];
  const full = ranked.length >= MAX_WISHES;
  const personOptions = (taken: (r: SeatRule) => boolean) =>
    people.filter((p) => !rules.some((r) => "userId" in r && r.userId === p.id && taken(r))).map((p) => ({ value: p.id, label: p.name }));
  const options =
    adding === "near" || adding === "next"
      ? personOptions((r) => r.kind === adding)
      : adding === "seat"
        ? seatLabels.map((l) => ({ value: l, label: l }))
        : adding === "row"
          ? rows.map((r) => ({ value: r, label: t("wishes.rule.row", { row: r }) }))
          : [];
  const addPicked = () => {
    if (!adding || !pick) return;
    const rule: SeatRule =
      adding === "seat"
        ? { kind: "seat", seat: pick }
        : adding === "row"
          ? { kind: "row", row: pick }
          : { kind: adding, userId: pick };
    // A wish about someone on the "not right next to" list takes them off it.
    save(addRule(rules, rule));
    setAdding(null);
    setPick("");
  };
  const addAvoid = () => {
    if (!avoidPick) return;
    save(addRule(rules, { kind: "avoid", userId: avoidPick }));
    setAvoidPick("");
  };

  const iconBtn =
    "inline-flex size-9 items-center justify-center rounded-md text-muted transition hover:bg-line hover:text-fg disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="space-y-4 text-sm">
      {ranked.length === 0 ? (
        <p className="rounded-md bg-raised/60 px-3 py-2.5 text-muted">{t("wishes.empty")}</p>
      ) : (
        <ol
          ref={listRef}
          className="space-y-2"
          aria-label={member ? t("wishLead.editing", { name: member.name }) : t("wishes.listLabel")}
        >
          {ranked.map((r, i) => {
            const label = text(r);
            const dragging = drag?.from === i;
            return (
              <li
                key={`${r.kind}:${"userId" in r ? r.userId : "seat" in r ? r.seat : "row" in r ? r.row : ""}`}
                style={{ transform: `translateY(${shift(i)}px)` }}
                className={`relative flex items-center gap-1 rounded-md border bg-raised/60 py-1 pl-1 pr-1 ${
                  dragging ? "z-10 border-bit shadow-lg" : "border-line transition-transform"
                }`}
              >
                <button
                  type="button"
                  aria-label={t("wishes.drag", { rule: label })}
                  title={t("wishes.dragHint")}
                  onPointerDown={(e) => onHandleDown(e, i)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                  onPointerCancel={onHandleUp}
                  tabIndex={-1}
                  className={`${iconBtn} cursor-grab touch-none active:cursor-grabbing`}
                >
                  <span aria-hidden className="text-base leading-none">⠿</span>
                </button>
                <span
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    i === 0 ? "bg-bit text-on-bit" : "bg-line text-fg/90"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="ml-1 min-w-0 flex-1 leading-tight [overflow-wrap:anywhere]">
                  <span aria-hidden className="mr-1.5">
                    {wishIcon(r)}
                  </span>
                  {label}
                </span>
                <span className="flex flex-col sm:flex-row">
                  <button
                    type="button"
                    disabled={pending || i === 0}
                    onClick={() => saveRanked(moveRule(ranked, i, i - 1))}
                    aria-label={t("wishes.up", { rule: label })}
                    className={iconBtn}
                  >
                    <span aria-hidden>↑</span>
                  </button>
                  <button
                    type="button"
                    disabled={pending || i === ranked.length - 1}
                    onClick={() => saveRanked(moveRule(ranked, i, i + 1))}
                    aria-label={t("wishes.down", { rule: label })}
                    className={iconBtn}
                  >
                    <span aria-hidden>↓</span>
                  </button>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => saveRanked(ranked.filter((_, j) => j !== i))}
                  aria-label={t("wishes.remove", { rule: label })}
                  className={`${iconBtn} hover:text-danger`}
                >
                  <span aria-hidden>✕</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {ranked.length > 1 && <p className="text-xs text-muted">{t("wishes.orderHint")}</p>}

      <fieldset disabled={full || pending}>
        <legend className="mb-2 text-fg/90">{full ? t("wishes.full", { max: MAX_WISHES }) : t("wishes.addTitle")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {addKinds.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={adding === k}
              disabled={!!blocked(k)}
              title={blocked(k)}
              onClick={() => {
                if (k === "edge" || k === "middle") {
                  setAdding(null);
                  save(addRule(rules, { kind: k }));
                } else {
                  setAdding(adding === k ? null : k);
                  setPick("");
                }
              }}
              className={`min-h-9 rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                adding === k ? "bg-bit text-on-bit" : "bg-line/60 text-fg/90 hover:bg-line"
              }`}
            >
              + {label}
            </button>
          ))}
        </div>
        {!full && (hasNext || nearFull) && (
          <p className="mt-2 text-xs text-muted">{[blocked("next"), blocked("near")].filter(Boolean).join(" ")}</p>
        )}
        {adding && (
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              aria-label={t(`wishes.pick.${adding}`)}
              className={`${input} min-w-0 basis-full sm:basis-0 sm:flex-1`}
            >
              <option value="">{t(`wishes.pick.${adding}`)}</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" disabled={!pick} onClick={addPicked} className={`${btnPrimary} shrink-0`}>
              {t("wishes.addButton")}
            </button>
          </div>
        )}
      </fieldset>

      <fieldset disabled={pending} className="space-y-2 border-t border-line pt-4">
        <legend className="sr-only">{t("wishes.avoid.title")}</legend>
        <p aria-hidden className="text-fg/90">
          <span className="mr-1.5">🙅</span>
          {t("wishes.avoid.title")}
        </p>
        <p className="text-xs text-muted">{t("wishes.avoid.hint")}</p>
        {avoids.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label={t("wishes.avoid.title")}>
            {avoids.map((r) => (
              <li key={r.userId} className="inline-flex items-center gap-1 rounded-full bg-line/60 py-0.5 pl-3 pr-1 text-xs text-fg/90">
                <span className="[overflow-wrap:anywhere]">{nameOf(r.userId)}</span>
                <button
                  type="button"
                  onClick={() => save(rules.filter((x) => x !== r))}
                  aria-label={t("wishes.remove", { rule: text(r) })}
                  className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:bg-line hover:text-danger"
                >
                  <span aria-hidden>✕</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-faint">{t("wishes.avoid.none")}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <select
            value={avoidPick}
            onChange={(e) => setAvoidPick(e.target.value)}
            aria-label={t("wishes.pick.avoid")}
            className={`${input} min-w-0 basis-full sm:basis-0 sm:flex-1`}
          >
            <option value="">{t("wishes.pick.avoid")}</option>
            {personOptions((r) => r.kind === "avoid").map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" disabled={!avoidPick} onClick={addAvoid} className={`${btnPrimary} shrink-0`}>
            {t("wishes.addButton")}
          </button>
        </div>
      </fieldset>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (note !== savedNote.current) save(rules, note);
        }}
      >
        <label className="block">
          <span className="mb-1 block text-fg/90">{t("wishes.note")}</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (note !== savedNote.current) save(rules, note);
            }}
            maxLength={300}
            placeholder={t("wishes.notePlaceholder")}
            className={input}
          />
        </label>
      </form>
    </div>
  );
}
