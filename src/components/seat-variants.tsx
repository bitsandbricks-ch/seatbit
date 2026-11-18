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
};

export type VariantRow = VariantStats & {
  id: string;
  name: string;
  /** People who sit somewhere else in it than in the live plan (or have no seat). */
  differs: number;
  /** "Changed 17.11.2026, 18:00". */
  updated: string;
  /** From the exact search: proven best (for the wishes at that time), or best found in time. Null otherwise. */
  proven: boolean | null;
};

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
const scoreText = (x: number | null) => (x === null ? "text-muted" : x >= 0.8 ? "text-bit" : x >= 0.5 ? "text-warn" : "text-danger");
const small = "!min-h-8 !px-2.5 !py-1 text-xs";

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
  final,
  searching,
}: {
  lanId: string;
  live: VariantStats;
  going: number;
  rows: VariantRow[];
  previewId: string | null;
  /** The plan is final: applying a variant tells everyone who moved. */
  final: boolean;
  /** A thorough search runs in the background and will save variant `name`, by `until` at the latest. */
  searching: { name: string; until: string } | null;
}) {
  const t = useT();
  const run = useRunAction();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
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

      <ul className="divide-y divide-line rounded-md border border-line">
        <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-raised/50 px-3 py-2.5">
          <span className="text-sm font-medium text-fg">{t("seatVariants.live")}</span>
          <Stats s={live} going={going} />
        </li>
        {rows.map((r) => (
          <Row key={r.id} lanId={lanId} r={r} going={going} preview={r.id === previewId} final={final} />
        ))}
      </ul>
      {rows.length === 0 && <p className="text-sm text-muted">{t("seatVariants.none")}</p>}
    </div>
  );
}

function Stats({ s, going, differs }: { s: VariantStats; going: number; differs?: number }) {
  const t = useT();
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted tabular-nums">
      <span>{t("seatVariants.seated", { seated: s.seated, going })}</span>
      <span>
        {t("seatVariants.wishes")} <span className={`font-medium ${scoreText(s.score)}`}>{pct(s.score)}</span>
      </span>
      {differs !== undefined &&
        (differs === 0 ? <Pill tone="emerald">{t("seatVariants.same")}</Pill> : <span>{t("seatVariants.differs", { count: differs })}</span>)}
    </span>
  );
}

function Row({ lanId, r, going, preview, final }: { lanId: string; r: VariantRow; going: number; preview: boolean; final: boolean }) {
  const t = useT();
  const run = useRunAction();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(r.name);
  const base = `/lans/${lanId}/manage?tab=seats`;

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
            {r.proven !== null && (
              <span className="ml-2" title={t(r.proven ? "seatVariants.provenHint" : "seatVariants.notProvenHint")}>
                <Pill tone={r.proven ? "emerald" : "amber"}>{t(r.proven ? "seatVariants.proven" : "seatVariants.notProven")}</Pill>
              </span>
            )}
          </span>
        )}
        <Stats s={r} going={going} differs={r.differs} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {preview ? (
          <Link href={`${base}#seat-variants`} className={`${btnSecondary} ${small}`} scroll={false}>
            {t("seatVariants.closePreview")}
          </Link>
        ) : (
          <Link href={`${base}&variant=${encodeURIComponent(r.id)}`} className={`${btnSecondary} ${small}`}>
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
              if (await run(() => deleteSeatVariant(r.id), t("seatVariants.deleted", { name: r.name })) && preview) router.replace(base);
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
}) {
  const t = useT();
  const base = `/lans/${lanId}/manage?tab=seats`;
  return (
    <div className="space-y-2 rounded-card border border-bit/40 bg-bit/10 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-fg">
          {t.rich("seatVariants.previewing", { name: <strong className="font-semibold">{name}</strong> })}
          <span className="block text-xs text-muted">{t("seatVariants.previewHint", { count: differs })}</span>
        </span>
        <span className="flex flex-wrap gap-2">
          <Link href={`${base}#seat-variants`} className={btnSecondary}>
            {t("seatVariants.closePreview")}
          </Link>
          <ApplyButton id={id} name={name} differs={differs} final={final} className={btnPrimary} after={base} />
        </span>
      </div>
      <p className="text-xs text-muted">
        {t("seatVariants.wishesNow")} <span className={`font-medium tabular-nums ${scoreText(score)}`}>{pct(score)}</span>{" "}
        {t("seatVariants.wishesLive", { pct: pct(liveScore) })}
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
