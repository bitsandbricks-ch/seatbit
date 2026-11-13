"use client";
import { useState, useTransition } from "react";
import {
  deleteTravelPost,
  joinTravelOffer,
  leaveTravelOffer,
  saveTravelPost,
  takeAlong,
  type TravelInput,
} from "@/app/travel-gear-actions";
import type { TravelKind } from "@/db/schema";
import { Field, Input, Pill, Segmented, btnGhost, btnPrimary, btnSecondary } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";

export type TravelPostView = {
  id: string;
  userId: string;
  name: string;
  kind: TravelKind;
  mode: "offer" | "request";
  town: string;
  places: number;
  whenText: string;
  note: string;
  /** The author has since said they're not coming. */
  notComing: boolean;
  spots: { userId: string; name: string }[];
};

const townKey = (t: string) => t.trim().toLowerCase();

export function TravelBoard({
  lanId,
  posts,
  meId,
  canPost,
  isManager,
}: {
  lanId: string;
  posts: TravelPostView[];
  meId: string;
  canPost: boolean;
  isManager: boolean;
}) {
  const [kind, setKind] = useState<TravelKind>("ride");
  const [form, setForm] = useState<{ mode: "offer" | "request"; post?: TravelPostView } | null>(null);
  const [pending, start] = useTransition();
  const act = useRunAction();
  const t = useT();

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      if (!(await act(fn))) return;
      after?.();
    });

  const list = posts.filter((p) => p.kind === kind);
  const offers = list.filter((p) => p.mode === "offer" && !p.notComing);
  const free = offers.reduce((n, p) => n + Math.max(0, p.places - p.spots.length), 0);
  const looking = list.filter((p) => p.mode === "request" && !p.notComing).reduce((n, p) => n + p.places, 0);
  const myOffers = list.filter((p) => p.mode === "offer" && p.userId === meId && p.spots.length < p.places);
  const iAmIn = new Set(list.filter((p) => p.spots.some((s) => s.userId === meId)).map((p) => p.id));

  // Group by town (case-insensitive), alphabetically; offers before requests within a town.
  const groups = new Map<string, { town: string; posts: TravelPostView[] }>();
  for (const p of list) {
    const k = townKey(p.town);
    if (!groups.has(k)) groups.set(k, { town: p.town.trim(), posts: [] });
    groups.get(k)!.posts.push(p);
  }
  const sorted = [...groups.values()].sort((a, b) => a.town.localeCompare(b.town));
  for (const g of sorted) g.posts.sort((a, b) => Number(a.mode === "request") - Number(b.mode === "request"));
  const towns = [...new Set(posts.map((p) => p.town.trim()).filter(Boolean))].sort();
  const count = (k: TravelKind) => posts.filter((p) => p.kind === k).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label={t("travel.label")}
          value={kind}
          onChange={(k) => {
            setKind(k);
            setForm(null);
          }}
          options={(["ride", "sleep"] as const).map((k) => ({ id: k, label: k === "ride" ? t("travel.carpool") : t("travel.sleeping"), count: count(k) }))}
        />
        <p className="text-sm text-muted">
          <span className="text-bit">{t(`travel.${kind}.free`, { count: free })}</span> ·{" "}
          <span className="text-warn">{t("travel.looking", { count: looking })}</span>
        </p>
      </div>

      {canPost ? (
        form ? (
          <PostForm
            key={`${kind}-${form.mode}-${form.post?.id ?? "new"}`}
            kind={kind}
            mode={form.mode}
            post={form.post}
            towns={towns}
            pending={pending}
            onCancel={() => setForm(null)}
            onSave={(v) => run(() => saveTravelPost(lanId, v, form.post?.id), () => setForm(null))}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={() => setForm({ mode: "offer" })}>
              {t(`travel.${kind}.offer`)}
            </button>
            <button className={btnSecondary} onClick={() => setForm({ mode: "request" })}>
              {t(`travel.${kind}.request`)}
            </button>
          </div>
        )
      ) : (
        <p className="rounded-md bg-raised/60 px-3 py-2 text-sm text-muted">
          {t(`travel.${kind}.sayComing`)}
        </p>
      )}

      {sorted.length === 0 && <p className="text-sm text-muted">{t(`travel.${kind}.empty`)}</p>}

      <div className="grid items-start gap-x-6 gap-y-4 lg:grid-cols-2">
      {sorted.map((g) => (
        <section key={townKey(g.town)} className="min-w-0">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
            <span aria-hidden>📍</span> {g.town || t("travel.somewhere")}
          </h3>
          <ul className="space-y-2">
            {g.posts.map((p) => {
              const mine = p.userId === meId;
              const left = p.places - p.spots.length;
              const canRemove = mine || isManager;
              return (
                <li
                  key={p.id}
                  className={`rounded-lg border px-3 py-2.5 text-sm ${
                    p.mode === "offer" ? "border-bit/25 bg-bit-soft/40" : "border-warn/25 bg-warn/5"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p>
                        <span className={`font-semibold ${mine ? "text-bit" : "text-fg"}`}>{p.name}</span>{" "}
                        <span className="text-muted">{p.mode === "offer" ? t(`travel.${kind}.offerTitle`) : t(`travel.${kind}.requestTitle`)}</span>
                        {p.notComing && (
                          <span className="ml-2">
                            <Pill tone="red">{t("travel.notComing")}</Pill>
                          </span>
                        )}
                      </p>
                      {p.whenText && <p className="text-fg/90">{p.whenText}</p>}
                      {p.note && <p className="text-muted">{p.note}</p>}
                    </div>
                    <span className="shrink-0">
                      {p.mode === "offer" ? (
                        <Pill tone={left > 0 ? "emerald" : "zinc"}>
                          {left > 0 ? t(`travel.${kind}.left`, { left, count: p.places }) : t("travel.full")}
                        </Pill>
                      ) : (
                        <Pill tone="amber">
                          {t(`travel.${kind}.need`, { count: p.places })}
                        </Pill>
                      )}
                    </span>
                  </div>

                  {p.mode === "offer" && p.spots.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {p.spots.map((s) => (
                        <li key={s.userId} className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-xs">
                          <span className={s.userId === meId ? "text-bit" : ""}>{s.name}</span>
                          {(canRemove || s.userId === meId) && (
                            <button
                              aria-label={t("travel.remove", { name: s.name })}
                              disabled={pending}
                              onClick={() => run(() => leaveTravelOffer(p.id, s.userId))}
                              className="text-muted hover:text-danger"
                            >
                              ×
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.mode === "offer" && !mine && canPost && !iAmIn.has(p.id) && left > 0 && !p.notComing && (
                      <button className={btnPrimary} disabled={pending} onClick={() => run(() => joinTravelOffer(p.id))}>
                        {t(`travel.${kind}.join`)}
                      </button>
                    )}
                    {iAmIn.has(p.id) && (
                      <button className={btnSecondary} disabled={pending} onClick={() => run(() => leaveTravelOffer(p.id))}>
                        {t("travel.leave")}
                      </button>
                    )}
                    {p.mode === "request" &&
                      !mine &&
                      myOffers.map((o) => (
                        <button
                          key={o.id}
                          className={btnPrimary}
                          disabled={pending || o.places - o.spots.length < 1}
                          onClick={() => run(() => takeAlong(p.id, o.id))}
                        >
                          {t(`travel.${kind}.take`)}
                          {myOffers.length > 1 && ` (${o.town})`}
                        </button>
                      ))}
                    {mine && (
                      <button className={btnGhost} disabled={pending} onClick={() => setForm({ mode: p.mode, post: p })}>
                        {t("travel.edit")}
                      </button>
                    )}
                    {canRemove && (
                      <button
                        className={`${btnGhost} text-danger`}
                        disabled={pending}
                        onClick={() => run(() => deleteTravelPost(p.id))}
                      >
                        {t("travel.delete")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      </div>
    </div>
  );
}

function PostForm({
  kind,
  mode,
  post,
  towns,
  pending,
  onSave,
  onCancel,
}: {
  kind: TravelKind;
  mode: "offer" | "request";
  post?: TravelPostView;
  towns: string[];
  pending: boolean;
  onSave: (v: TravelInput) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [v, setV] = useState({
    town: post?.town ?? "",
    places: String(post?.places ?? (mode === "offer" ? (kind === "ride" ? 3 : 2) : 1)),
    whenText: post?.whenText ?? "",
    note: post?.note ?? "",
  });
  const listId = `towns-${kind}`;
  return (
    <form
      className="max-w-2xl space-y-3 rounded-lg border border-line bg-ink/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ kind, mode, ...v, places: Number(v.places) });
      }}
    >
      <p className="font-medium text-fg">{mode === "offer" ? t(`travel.${kind}.offer`) : t(`travel.${kind}.request`)}</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label={mode === "request" && kind === "ride" ? t("travel.from") : t(`travel.${kind}.town`)}>
          <Input
            required
            list={listId}
            value={v.town}
            maxLength={40}
            placeholder={t(`travel.${kind}.townPh`)}
            onChange={(e) => setV({ ...v, town: e.target.value })}
          />
          <datalist id={listId}>
            {towns.map((tn) => (
              <option key={tn} value={tn} />
            ))}
          </datalist>
        </Field>
        <Field label={mode === "offer" ? t(`travel.${kind}.places`) : t("travel.people")}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            required
            value={v.places}
            onChange={(e) => setV({ ...v, places: e.target.value })}
          />
        </Field>
      </div>
      <Field label={t(`travel.${kind}.when`)}>
        <Input value={v.whenText} maxLength={60} placeholder={t(`travel.${kind}.whenPh`)} onChange={(e) => setV({ ...v, whenText: e.target.value })} />
      </Field>
      <Field label={t("travel.note")}>
        <Input
          value={v.note}
          maxLength={200}
          placeholder={t(`travel.${kind}.notePh`)}
          onChange={(e) => setV({ ...v, note: e.target.value })}
        />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className={btnPrimary} disabled={pending}>
          {post ? t("common.save") : mode === "offer" ? t("travel.postOffer") : t("travel.postRequest")}
        </button>
        <button type="button" className={btnGhost} onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
