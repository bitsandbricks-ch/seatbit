"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import {
  applySeatVariant,
  deleteSeatVariant,
  planSeatVariant,
  renameSeatVariant,
  saveSeatVariant,
  updateSeatVariant,
} from "@/app/seat-variant-actions";
import { MAX_VARIANT_NAME, MAX_VARIANTS } from "@/lib/seat-variant-math";
import { useRunAction } from "./action-form";
import { ask } from "./dialog";
import { Notice, Pill, btnGhost, btnPrimary, btnSecondary, input } from "./ui";

/** How a seat arrangement does: the live plan or a saved variant, worked out on the server. */
export type VariantStats = {
  /** People coming who have a seat in it. */
  seated: number;
  /** Weighted seat wish score 0..1, null when nobody has wishes that can be checked. */
  score: number | null;
  /** People who sit somewhere else than in the compared plan; undefined when this is that plan. */
  vsBase?: number;
};

export type VariantRow = VariantStats & {
  id: string;
  name: string;
  /** People who sit somewhere else in it than in the live plan (or have no seat). */
  differs: number;
  /** "Changed 17.11.2026, 18:00". */
  updated: string;
};

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
const scoreText = (x: number | null) => (x === null ? "text-muted" : x >= 0.8 ? "text-bit" : x >= 0.5 ? "text-warn" : "text-danger");
const small = "!min-h-8 !px-2.5 !py-1 text-xs";

/** Manage → Seats with a variant on the map (`variant`) and the plan it is compared with (`vs`, live when null). */
export function seatsHref(lanId: string, variant: string | null, vs: string | null) {
  const q = new URLSearchParams({ tab: "seats" });
  if (variant) q.set("variant", variant);
  if (vs) q.set("vs", vs);
  return `/lans/${lanId}/manage?${q}`;
}

/**
 * Manage → Seats: the leads' saved seat arrangements. Save the live plan under a name, let the
 * planner make one from the wishes, compare them against the live plan (seated, wish score, how
 * many people would move), preview one on the map and apply it. Members never see variants.
 */
export function SeatVariants({
  lanId,
  live,
  going,
  rows,
  previewId,
  baseId,
  final,
  searching,
}: {
  lanId: string;
  live: VariantStats;
  going: number;
  rows: VariantRow[];
  previewId: string | null;
  /** The variant everything is compared with; null: the live plan. */
  baseId: string | null;
  /** The plan is final: applying a variant tells everyone who moved. */
  final: boolean;
  /** A thorough search runs in the background and will save variant `name`, by `until` at the latest. */
  searching: { name: string; until: string } | null;
}) {
  const t = useT();
  const run = useRunAction();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const liveName = t("seatVariants.live");
  const baseName = rows.find((r) => r.id === baseId)?.name ?? null;
  const full = rows.length >= MAX_VARIANTS;
  const create = (fn: typeof saveSeatVariant) =>
    start(async () => {
      if (await run(() => fn(lanId, name), (r) => t("seatVariants.saved", { name: r.name }))) setName("");
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("seatVariants.hint")}</p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create(saveSeatVariant);
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_VARIANT_NAME}
          placeholder={t("seatVariants.namePlaceholder")}
          aria-label={t("seatVariants.name")}
          className={`${input} min-w-0 flex-1 basis-48`}
        />
        <button type="submit" disabled={pending || full} className={btnPrimary}>
          {t("seatVariants.saveLive")}
        </button>
        <button type="button" disabled={pending || full} className={btnSecondary} onClick={() => create(planSeatVariant)}>
          {t("seatVariants.planNew")}
        </button>
      </form>
      {searching && <Notice>{t("seatVariants.searching", searching)}</Notice>}
      {full && <p className="text-xs text-warn">{t("seatVariants.full", { max: MAX_VARIANTS })}</p>}

      {/* With one variant, its preview already compares it with the live plan. */}
      {rows.length > 1 && (
        <div className="space-y-1">
          <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {t("seatVariants.compareWith")}
            <select
              value={baseId ?? ""}
              onChange={(e) => router.replace(`${seatsHref(lanId, previewId, e.target.value || null)}#seat-variants`, { scroll: false })}
              className={`${input} !min-h-9 w-auto min-w-0 max-w-full flex-1 basis-48`}
            >
              <option value="">{liveName}</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-faint">{t("seatVariants.compareHint")}</p>
        </div>
      )}

      <ul className="divide-y divide-line rounded-md border border-line">
        <li className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 ${baseId === null ? "bg-raised" : "bg-raised/50"}`}>
          <span className="text-sm font-medium text-fg">{liveName}</span>
          <Stats s={live} going={going} base={baseName} isBase={baseId === null && rows.length > 1} />
        </li>
        {rows.map((r) => (
          <Row key={r.id} lanId={lanId} r={r} going={going} preview={r.id === previewId} baseId={baseId} baseName={baseName} final={final} />
        ))}
      </ul>
      {rows.length === 0 && <p className="text-sm text-muted">{t("seatVariants.none")}</p>}
    </div>
  );
}

/** `base`: the compared variant's name, null for the live plan. */
function Stats({ s, going, base, isBase }: { s: VariantStats; going: number; base: string | null; isBase: boolean }) {
  const t = useT();
  const differs = s.vsBase;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted tabular-nums">
      <span>{t("seatVariants.seated", { seated: s.seated, going })}</span>
      <span>
        {t("seatVariants.wishes")} <span className={`font-medium ${scoreText(s.score)}`}>{pct(s.score)}</span>
      </span>
      {isBase ? (
        <Pill>{t("seatVariants.comparing")}</Pill>
      ) : (
        differs !== undefined &&
        (differs === 0 ? (
          <Pill tone="emerald">{base === null ? t("seatVariants.same") : t("seatVariants.sameAs", { name: base })}</Pill>
        ) : (
          <span className={differs > 0 ? "text-warn" : ""}>{t("seatVariants.differs", { count: differs })}</span>
        ))
      )}
    </span>
  );
}

function Row({
  lanId,
  r,
  going,
  preview,
  baseId,
  baseName,
  final,
}: {
  lanId: string;
  r: VariantRow;
  going: number;
  preview: boolean;
  baseId: string | null;
  baseName: string | null;
  final: boolean;
}) {
  const t = useT();
  const run = useRunAction();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(r.name);
  const base = seatsHref(lanId, null, baseId);

  const rename = () =>
    start(async () => {
      if (!name.trim() || name.trim() === r.name) {
        setName(r.name);
        return setEditing(false);
      }
      if (await run(() => renameSeatVariant(r.id, name), t("seatVariants.renamed"))) setEditing(false);
    });

  return (
    <li className={`space-y-2 px-3 py-2.5 ${preview ? "bg-bit/5" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {editing ? (
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              rename();
            }}
          >
            <input
              autoFocus
              value={name}
              maxLength={MAX_VARIANT_NAME}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setName(r.name);
                  setEditing(false);
                }
              }}
              aria-label={t("seatVariants.name")}
              className={`${input} min-w-0 flex-1`}
            />
            <button type="submit" disabled={pending} className={btnSecondary}>
              {t("common.save")}
            </button>
          </form>
        ) : (
          <span className="min-w-0 text-sm font-medium text-fg">
            <span className="break-words">{r.name}</span>
            <span className="ml-2 text-xs font-normal text-faint">{r.updated}</span>
          </span>
        )}
        <Stats s={r} going={going} base={baseName} isBase={r.id === baseId} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {preview ? (
          <Link href={`${base}#seat-variants`} className={`${btnSecondary} ${small}`} scroll={false}>
            {t("seatVariants.closePreview")}
          </Link>
        ) : (
          <Link href={seatsHref(lanId, r.id, baseId)} className={`${btnSecondary} ${small}`}>
            {t("seatVariants.preview")}
          </Link>
        )}
        <ApplyButton id={r.id} name={r.name} differs={r.differs} final={final} className={`${btnPrimary} ${small}`} after={preview ? base : undefined} />
        <button type="button" disabled={pending} className={`${btnGhost} ${small}`} onClick={() => setEditing(true)}>
          {t("seatVariants.rename")}
        </button>
        <button
          type="button"
          disabled={pending || r.differs === 0}
          className={`${btnGhost} ${small}`}
          onClick={async () => {
            if (!(await ask({ title: t("seatVariants.updateConfirm", { name: r.name }), body: t("seatVariants.updateBody"), confirm: t("seatVariants.update") }))) return;
            start(async () => {
              await run(() => updateSeatVariant(r.id), t("seatVariants.updated", { name: r.name }));
            });
          }}
        >
          {t("seatVariants.update")}
        </button>
        <button
          type="button"
          disabled={pending}
          className={`${btnGhost} ${small} hover:!text-danger`}
          onClick={async () => {
            if (!(await ask({ title: t("seatVariants.deleteConfirm", { name: r.name }), confirm: t("seatVariants.delete"), danger: true }))) return;
            start(async () => {
              if ((await run(() => deleteSeatVariant(r.id), t("seatVariants.deleted", { name: r.name }))) && (preview || r.id === baseId))
                router.replace(seatsHref(lanId, null, r.id === baseId ? null : baseId));
            });
          }}
        >
          {t("seatVariants.delete")}
        </button>
      </div>
    </li>
  );
}

/** Applies a variant after asking; also on the preview bar above the map. */
export function ApplyButton({
  id,
  name,
  differs,
  final,
  className,
  after,
}: {
  id: string;
  name: string;
  differs: number;
  final: boolean;
  className: string;
  /** Where to go once applied (out of the preview). */
  after?: string;
}) {
  const t = useT();
  const run = useRunAction();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending || differs === 0}
      className={className}
      onClick={async () => {
        const ok = await ask({
          title: t("seatVariants.applyConfirm", { name }),
          body: `${t("seatVariants.applyBody", { count: differs })} ${final ? t("seatVariants.applyFinal") : t("seatVariants.applyDraft")}`,
          confirm: t("seatVariants.apply"),
        });
        if (!ok) return;
        start(async () => {
          if (await run(() => applySeatVariant(id), (n) => t("seatVariants.applied", { name, count: n })) && after) router.replace(after);
        });
      }}
    >
      {t("seatVariants.apply")}
    </button>
  );
}

/**
 * Above the map while it shows a variant instead of the live plan. The variant is checked against
 * today's seat wishes, so the leads see whether it still works after wishes changed since saving it.
 */
export function VariantPreviewBar({
  lanId,
  id,
  name,
  differs,
  final,
  score,
  liveScore,
  worse,
  better,
  base,
}: {
  lanId: string;
  id: string;
  name: string;
  differs: number;
  final: boolean;
  score: number | null;
  liveScore: number | null;
  /** People whose wishes this variant meets worse than the live plan. */
  worse: string[];
  /** How many it suits better. */
  better: number;
  /** The plan it is compared with (live when id is null); `changed` null when it is this variant itself. */
  base: { id: string | null; name: string; score: number | null; changed: number | null };
}) {
  const t = useT();
  const back = seatsHref(lanId, null, base.id);
  return (
    <div className="space-y-2 rounded-card border border-bit/40 bg-bit/10 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-fg">
          {t.rich("seatVariants.previewing", { name: <strong className="font-semibold">{name}</strong> })}
          <span className="block text-xs text-muted">{t("seatVariants.previewHint", { count: differs })}</span>
          {base.id && base.changed !== null && (
            <span className="block text-xs text-warn">
              {base.changed === 0 ? t("seatVariants.compareSame", { base: base.name }) : t("seatVariants.compareNote", { count: base.changed, base: base.name })}
            </span>
          )}
        </span>
        <span className="flex flex-wrap gap-2">
          <Link href={`${back}#seat-variants`} className={btnSecondary}>
            {t("seatVariants.closePreview")}
          </Link>
          <ApplyButton id={id} name={name} differs={differs} final={final} className={btnPrimary} after={back} />
        </span>
      </div>
      <p className="text-xs text-muted">
        {t("seatVariants.wishesNow")} <span className={`font-medium tabular-nums ${scoreText(score)}`}>{pct(score)}</span>{" "}
        {base.id && base.changed !== null
          ? t("seatVariants.wishesBase", { name: base.name, pct: pct(base.score) })
          : t("seatVariants.wishesLive", { pct: pct(liveScore) })}
        {worse.length > 0 && (
          <>
            {" · "}
            <span className="text-warn">{t("seatVariants.worseFor", { count: worse.length, names: worse.join(", ") })}</span>
          </>
        )}
        {better > 0 && <>{" · "}{t("seatVariants.betterFor", { count: better })}</>}
      </p>
    </div>
  );
}
