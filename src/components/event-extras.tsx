"use client";
import { useState, useTransition } from "react";
import type { InterestAnswer } from "@/db/schema";
import { cancelLan, copyForNextYear, deleteNews, postNews, setArrived, setMyInterest, setMyInterests } from "@/app/event-actions";
import { btn, btnDanger, btnGhost, btnPrimary, btnSecondary, input } from "./ui";

const INTEREST: { a: InterestAnswer; label: string; active: string }[] = [
  { a: "yes", label: "I'd come", active: "border-bit bg-bit text-on-bit hover:bg-bit-hover" },
  { a: "maybe", label: "Maybe", active: "border-warn bg-warn text-on-bit" },
  { a: "no", label: "Not this time", active: "border-danger/50 bg-danger/15 text-danger" },
];

/** Interest check answer: would you come? */
export function InterestButtons({ lanId, current }: { lanId: string; current: InterestAnswer | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2" aria-busy={pending}>
        {INTEREST.map((o) => (
          <button
            key={o.a}
            disabled={pending}
            aria-pressed={current === o.a}
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  await setMyInterest(lanId, o.a);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed");
                }
              })
            }
            className={`${btn} border px-2 ${current === o.a ? o.active : "border-line bg-raised text-fg hover:border-muted/40"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Orgas write news for everyone at the event. */
export function NewsComposer({ lanId, published }: { lanId: string; published: boolean }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await postNews(lanId, text);
          if (r.error) setMsg({ ok: false, text: r.error });
          else {
            setText("");
            setMsg({ ok: true, text: published ? `Posted. ${r.sent ?? 0} people got it by mail or DM.` : "Saved. It goes out to nobody while the event is a draft." });
          }
        });
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="e.g. Doors open at 10:00. Bring an extension cord, there are only 2 sockets per seat."
        className={input}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending || !text.trim()} className={btnPrimary}>
          {pending ? "Sending…" : "Post news"}
        </button>
        <span className="text-xs text-muted">Shown on the event page and sent to everyone coming, unsure or on the waitlist.</span>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-bit" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}

export function DeleteNewsButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} className="text-xs text-faint hover:text-danger" onClick={() => start(() => deleteNews(id))}>
      Delete
    </button>
  );
}

/** "I'm here" on the day of the event. */
export function CheckInButton({ lanId, arrived }: { lanId: string; arrived: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className={arrived ? btnSecondary : btnPrimary}
      onClick={() => start(() => setArrived(lanId, null, !arrived))}
    >
      {arrived ? "✓ You're checked in (undo)" : "I'm here"}
    </button>
  );
}

/** Cancel the event, with an optional reason for everyone. */
export function CancelEvent({ lanId, published }: { lanId: string; published: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button className={btnSecondary} onClick={() => setOpen(true)}>
        Cancel event…
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Why? (optional, shown to everyone)"
        className={input}
      />
      <p className="text-xs text-muted">
        {published
          ? "Everyone who answered gets a mail and DM. The event stays visible as cancelled; you can undo it."
          : "It's a draft, so nobody is told."}
      </p>
      <div className="flex gap-2">
        <button disabled={pending} className={btnDanger} onClick={() => start(async () => void (await cancelLan(lanId, reason)))}>
          {pending ? "Cancelling…" : "Cancel the event"}
        </button>
        <button disabled={pending} className={btnGhost} onClick={() => setOpen(false)}>
          Keep it
        </button>
      </div>
    </div>
  );
}

export function CopyNextYear({ lanId }: { lanId: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} className={btnSecondary} onClick={() => start(() => copyForNextYear(lanId))}>
      {pending ? "Copying…" : "Copy for next year"}
    </button>
  );
}

/** Which of a clan's events a member hears about. */
export function InterestsForm({
  clanId,
  types,
  current,
}: {
  clanId: string;
  types: { id: string; name: string }[];
  current: string[] | null;
}) {
  const [pending, start] = useTransition();
  const [all, setAll] = useState(current === null);
  const [picked, setPicked] = useState<string[]>(current ?? []);
  const [saved, setSaved] = useState(false);
  const save = (nextAll: boolean, nextPicked: string[]) => {
    setSaved(false);
    start(async () => {
      await setMyInterests(clanId, nextAll ? null : nextPicked);
      setSaved(true);
    });
  };
  return (
    <div className="space-y-2 text-sm">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="radio"
          checked={all}
          onChange={() => {
            setAll(true);
            save(true, picked);
          }}
          className="h-4 w-4 accent-bit"
        />
        All events
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="radio"
          checked={!all}
          onChange={() => {
            setAll(false);
            save(false, picked);
          }}
          className="h-4 w-4 accent-bit"
        />
        Only these kinds
      </label>
      {!all && (
        <div className="ml-6 flex flex-wrap gap-2">
          {types.map((t) => {
            const on = picked.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                disabled={pending}
                onClick={() => {
                  const next = on ? picked.filter((x) => x !== t.id) : [...picked, t.id];
                  setPicked(next);
                  save(false, next);
                }}
                className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-bit bg-bit-soft text-fg" : "border-line text-muted hover:text-fg"}`}
              >
                {on ? "✓ " : ""}
                {t.name}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted">
        {pending ? "Saving…" : saved ? "Saved." : "One-off events without a kind always reach you. You still see every event of the clan."}
      </p>
    </div>
  );
}
