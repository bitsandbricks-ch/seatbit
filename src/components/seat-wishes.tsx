"use client";
import { useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { setMySeatWishes } from "@/app/actions";
import { btnPrimary, input } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";
import { DEFAULT_AVOID_RANGE, DEFAULT_NEAR_RANGE, MAX_SEAT_RULES, NEAR_RANGES, RANGE_KEY, addRule, moveRule, rangeOf, type NearRange, type SeatRule } from "@/lib/seat-rules";

type Wishes = { rules: SeatRule[]; note: string };
type AddKind = "near" | "avoid" | "seat" | "row";

const parseRange = (v: string): NearRange => (v === "row" ? "row" : (Number(v) as 1 | 2 | 3));

const ICON: Record<SeatRule["kind"], string> = { near: "🤝", avoid: "🙅", seat: "💺", row: "↔", edge: "📍", middle: "📍" };
// Gap between list items (space-y-2), used to shift neighbours while dragging.
const GAP = 8;

/**
 * A member's seat wishes as a ranked rule list: the top rule matters most. Rules move by
 * drag (handle, works with touch) or the up/down buttons; every change saves right away.
 */
export function SeatWishes({
  lanId,
  people,
  names,
  seatLabels,
  rows,
  initial,
}: {
  lanId: string;
  /** People the member can pick for near / not next to. */
  people: { id: string; name: string }[];
  /** Names for everyone the rules mention (also people no longer coming). */
  names: Record<string, string>;
  seatLabels: string[];
  /** Row letters of the seat plan. */
  rows: string[];
  initial: Wishes;
}) {
  const t = useT();
  const [rules, setRules] = useState<SeatRule[]>(initial.rules);
  const [note, setNote] = useState(initial.note);
  const savedNote = useRef(initial.note);
  const [adding, setAdding] = useState<AddKind | null>(null);
  const [pick, setPick] = useState("");
  const [range, setRange] = useState<NearRange>(DEFAULT_NEAR_RANGE);
  const [pending, start] = useTransition();
  const run = useRunAction();

  const save = (next: SeatRule[], nextNote = note) => {
    const before = rules;
    const noteBefore = savedNote.current;
    setRules(next);
    // Set before the request so a blur right after Enter doesn't save twice.
    savedNote.current = nextNote;
    start(async () => {
      const ok = await run(() => setMySeatWishes(lanId, { rules: next, note: nextNote }), t("wishes.saved"));
      if (!ok) {
        setRules(before);
        savedNote.current = noteBefore;
      }
    });
  };

  const text = (r: SeatRule) => {
    switch (r.kind) {
      case "near":
        return t(`wishes.rule.near.${RANGE_KEY[rangeOf(r)]}`, { name: names[r.userId] ?? "?" });
      case "avoid":
        return t(`wishes.rule.avoid.${RANGE_KEY[rangeOf(r)]}`, { name: names[r.userId] ?? "?" });
      case "seat":
        return t("wishes.rule.seat", { seat: r.seat });
      case "row":
        return t("wishes.rule.row", { row: r.row });
      case "edge":
        return t("wishes.rule.edge");
      case "middle":
        return t("wishes.rule.middle");
    }
  };

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
    if (drag && drag.at !== drag.from) save(moveRule(rules, drag.from, drag.at));
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

  const addKinds: [AddKind | "edge" | "middle", string][] = [
    ["near", t("wishes.add.near")],
    ["avoid", t("wishes.add.avoid")],
    ["seat", t("wishes.add.seat")],
    ["row", t("wishes.add.row")],
    ["edge", t("wishes.add.edge")],
    ["middle", t("wishes.add.middle")],
  ];
  const full = rules.length >= MAX_SEAT_RULES;
  const options =
    adding === "near" || adding === "avoid"
      ? people.map((p) => ({ value: p.id, label: p.name }))
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
          : adding === "near"
            ? { kind: "near", userId: pick, within: range }
            : { kind: "avoid", userId: pick, within: range };
    save(addRule(rules, rule));
    setAdding(null);
    setPick("");
  };

  const rangeOptions = (kind: "near" | "avoid") =>
    NEAR_RANGES.map((r) => (
      <option key={r} value={String(r)}>
        {t(`wishes.${kind === "near" ? "range" : "avoidRange"}.${RANGE_KEY[r]}`)}
      </option>
    ));

  const iconBtn =
    "inline-flex size-9 items-center justify-center rounded-md text-muted transition hover:bg-line hover:text-fg disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="space-y-4 text-sm">
      {rules.length === 0 ? (
        <p className="rounded-md bg-raised/60 px-3 py-2.5 text-muted">{t("wishes.empty")}</p>
      ) : (
        <ol ref={listRef} className="space-y-2" aria-label={t("wishes.listLabel")}>
          {rules.map((r, i) => {
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
                {r.kind === "near" || r.kind === "avoid" ? (
                  // Who on top, how close below it: [Right next to ▾].
                  <span className="ml-1 min-w-0 flex-1 leading-tight">
                    <span className="block [overflow-wrap:anywhere]">
                      <span aria-hidden className="mr-1.5">
                        {ICON[r.kind]}
                      </span>
                      {names[r.userId] ?? "?"}
                    </span>
                    <select
                      value={String(rangeOf(r))}
                      disabled={pending}
                      onChange={(e) => save(rules.map((x, j) => (j === i ? { ...r, within: parseRange(e.target.value) } : x)))}
                      aria-label={t(r.kind === "near" ? "wishes.range.change" : "wishes.avoidRange.change", { rule: label })}
                      className="mt-1 block w-full max-w-[15rem] rounded-md border border-line bg-surface py-0.5 pl-1.5 text-base text-fg sm:text-sm"
                    >
                      {rangeOptions(r.kind)}
                    </select>
                  </span>
                ) : (
                  <span className="ml-1 min-w-0 flex-1 leading-tight [overflow-wrap:anywhere]">
                    <span aria-hidden className="mr-1.5">
                      {ICON[r.kind]}
                    </span>
                    {label}
                  </span>
                )}
                <span className="flex flex-col sm:flex-row">
                <button
                  type="button"
                  disabled={pending || i === 0}
                  onClick={() => save(moveRule(rules, i, i - 1))}
                  aria-label={t("wishes.up", { rule: label })}
                  className={iconBtn}
                >
                  <span aria-hidden>↑</span>
                </button>
                <button
                  type="button"
                  disabled={pending || i === rules.length - 1}
                  onClick={() => save(moveRule(rules, i, i + 1))}
                  aria-label={t("wishes.down", { rule: label })}
                  className={iconBtn}
                >
                  <span aria-hidden>↓</span>
                </button>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => save(rules.filter((_, j) => j !== i))}
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

      {rules.length > 1 && <p className="text-xs text-muted">{t("wishes.orderHint")}</p>}

      <fieldset disabled={full || pending}>
        <legend className="mb-2 text-fg/90">{full ? t("wishes.full", { max: MAX_SEAT_RULES }) : t("wishes.addTitle")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {addKinds.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={adding === k}
              onClick={() => {
                if (k === "edge" || k === "middle") {
                  setAdding(null);
                  save(addRule(rules, { kind: k }));
                } else {
                  setAdding(adding === k ? null : k);
                  setRange(k === "avoid" ? DEFAULT_AVOID_RANGE : DEFAULT_NEAR_RANGE);
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
            {(adding === "near" || adding === "avoid") && (
              <select
                value={String(range)}
                onChange={(e) => setRange(parseRange(e.target.value))}
                aria-label={t(adding === "near" ? "wishes.range.label" : "wishes.avoidRange.label")}
                className={`${input} min-w-0 flex-1 sm:w-auto sm:flex-none`}
              >
                {rangeOptions(adding)}
              </select>
            )}
            <button type="button" disabled={!pick} onClick={addPicked} className={`${btnPrimary} shrink-0`}>
              {t("wishes.addButton")}
            </button>
          </div>
        )}
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
