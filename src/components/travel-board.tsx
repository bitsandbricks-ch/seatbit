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
import { Field, Input, Pill, btnGhost, btnPrimary, btnSecondary } from "./ui";

export type TravelPostView = {
  id: string;
  userId: string;
  nick: string;
  kind: TravelKind;
  mode: "offer" | "request";
  town: string;
  places: number;
  whenText: string;
  note: string;
  /** The author has since said they're not coming. */
  notComing: boolean;
  spots: { userId: string; nick: string }[];
};

const copy = {
  ride: {
    offer: "Offer a ride",
    request: "Need a ride",
    offerTitle: "drives",
    requestTitle: "needs a ride",
    places: "Free seats",
    town: "Leaving from",
    townPh: "e.g. Luzern",
    when: "When",
    whenPh: "e.g. Fri 16:00, back Sun evening",
    unit: (n: number) => (n === 1 ? "seat" : "seats"),
    join: "Join ride",
    empty: "No rides yet. Got a car with free seats? Offer them, or say where you need a ride from.",
  },
  sleep: {
    offer: "Offer a place to sleep",
    request: "Need a place to sleep",
    offerTitle: "has room",
    requestTitle: "needs a place to sleep",
    places: "Free places",
    town: "Town",
    townPh: "e.g. near the venue",
    when: "Nights",
    whenPh: "e.g. Fri and Sat night",
    unit: (n: number) => (n === 1 ? "place" : "places"),
    join: "Take a place",
    empty: "Nobody has offered or asked for a place to sleep yet.",
  },
} as const;

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
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const c = copy[kind];

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        after?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
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
        <div role="tablist" className="inline-flex rounded-lg border border-line bg-raised p-1 text-sm">
          {(["ride", "sleep"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => {
                setKind(k);
                setForm(null);
              }}
              className={`rounded-md px-3 py-1.5 font-medium ${kind === k ? "bg-line text-fg" : "text-muted hover:text-fg"}`}
            >
              {k === "ride" ? "Carpool" : "Sleeping"}
              {count(k) > 0 && <span className="ml-1.5 text-xs text-muted">{count(k)}</span>}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
          <span className="text-bit">{free}</span> free {c.unit(free)} · <span className="text-warn">{looking}</span>{" "}
          looking
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
              {c.offer}
            </button>
            <button className={btnSecondary} onClick={() => setForm({ mode: "request" })}>
              {c.request}
            </button>
          </div>
        )
      ) : (
        <p className="rounded-md bg-raised/60 px-3 py-2 text-sm text-muted">
          Say you&apos;re coming (or unsure) on the Overview tab to offer or ask for {kind === "ride" ? "a ride" : "a place to sleep"}.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {sorted.length === 0 && <p className="text-sm text-muted">{c.empty}</p>}

      <div className="grid items-start gap-x-6 gap-y-4 lg:grid-cols-2">
      {sorted.map((g) => (
        <section key={townKey(g.town)} className="min-w-0">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
            <span aria-hidden>📍</span> {g.town || "Somewhere"}
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
                        <span className={`font-semibold ${mine ? "text-bit" : "text-fg"}`}>{p.nick}</span>{" "}
                        <span className="text-muted">{p.mode === "offer" ? c.offerTitle : c.requestTitle}</span>
                        {p.notComing && (
                          <span className="ml-2">
                            <Pill tone="red">not coming anymore</Pill>
                          </span>
                        )}
                      </p>
                      {p.whenText && <p className="text-fg/90">{p.whenText}</p>}
                      {p.note && <p className="text-muted">{p.note}</p>}
                    </div>
                    <span className="shrink-0">
                      {p.mode === "offer" ? (
                        <Pill tone={left > 0 ? "emerald" : "zinc"}>
                          {left > 0 ? `${left} of ${p.places} ${c.unit(p.places)} free` : "Full"}
                        </Pill>
                      ) : (
                        <Pill tone="amber">
                          {p.places} {c.unit(p.places)}
                        </Pill>
                      )}
                    </span>
                  </div>

                  {p.mode === "offer" && p.spots.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {p.spots.map((s) => (
                        <li key={s.userId} className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-xs">
                          <span className={s.userId === meId ? "text-bit" : ""}>{s.nick}</span>
                          {(canRemove || s.userId === meId) && (
                            <button
                              aria-label={`Remove ${s.nick}`}
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
                        {c.join}
                      </button>
                    )}
                    {iAmIn.has(p.id) && (
                      <button className={btnSecondary} disabled={pending} onClick={() => run(() => leaveTravelOffer(p.id))}>
                        Leave
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
                          {kind === "ride" ? "Take along" : "Host"}
                          {myOffers.length > 1 && ` (${o.town})`}
                        </button>
                      ))}
                    {mine && (
                      <button className={btnGhost} disabled={pending} onClick={() => setForm({ mode: p.mode, post: p })}>
                        Edit
                      </button>
                    )}
                    {canRemove && (
                      <button
                        className={`${btnGhost} text-danger`}
                        disabled={pending}
                        onClick={() => run(() => deleteTravelPost(p.id))}
                      >
                        Delete
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
  const c = copy[kind];
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
      <p className="font-medium text-fg">{mode === "offer" ? c.offer : c.request}</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label={mode === "request" && kind === "ride" ? "From" : c.town}>
          <Input
            required
            list={listId}
            value={v.town}
            maxLength={40}
            placeholder={c.townPh}
            onChange={(e) => setV({ ...v, town: e.target.value })}
          />
          <datalist id={listId}>
            {towns.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label={mode === "offer" ? c.places : "People"}>
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
      <Field label={c.when}>
        <Input value={v.whenText} maxLength={60} placeholder={c.whenPh} onChange={(e) => setV({ ...v, whenText: e.target.value })} />
      </Field>
      <Field label="Note">
        <Input
          value={v.note}
          maxLength={200}
          placeholder={kind === "ride" ? "e.g. big trunk, room for a tower PC" : "e.g. air mattress, bring a sleeping bag"}
          onChange={(e) => setV({ ...v, note: e.target.value })}
        />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className={btnPrimary} disabled={pending}>
          {post ? "Save" : mode === "offer" ? "Post offer" : "Post request"}
        </button>
        <button type="button" className={btnGhost} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
