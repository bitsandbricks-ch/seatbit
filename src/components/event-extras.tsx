"use client";
import { useState, useTransition } from "react";
import type { InterestAnswer } from "@/db/schema";
import { cancelLan, copyForNextYear, deleteNews, postNews, setArrived, setMyInterest, setMyInterests } from "@/app/event-actions";
import { btn, btnDanger, btnGhost, btnPrimary, btnSecondary, input } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";
import type { MessageKey } from "@/i18n/translate";

const INTEREST: { a: InterestAnswer; label: MessageKey; active: string }[] = [
  { a: "yes", label: "eventUi.idCome", active: "border-bit bg-bit text-on-bit hover:bg-bit-hover" },
  { a: "maybe", label: "eventUi.maybe", active: "border-warn bg-warn text-on-bit" },
  { a: "no", label: "eventUi.notThisTime", active: "border-danger/50 bg-danger/15 text-danger" },
];

/** Interest check answer: would you come? */
export function InterestButtons({ lanId, current }: { lanId: string; current: InterestAnswer | null }) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2" aria-busy={pending}>
        {INTEREST.map((o) => (
          <button
            key={o.a}
            disabled={pending}
            aria-pressed={current === o.a}
            onClick={() =>
              start(async () => void (await act(() => setMyInterest(lanId, o.a))))
            }
            className={`${btn} border px-2 ${current === o.a ? o.active : "border-line bg-raised text-fg hover:border-muted/40"}`}
          >
            {t(o.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Leads write news for everyone at the event. */
export function NewsComposer({ lanId, published }: { lanId: string; published: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  const [text, setText] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const ok = await act(
            () => postNews(lanId, text),
            (r) => (published ? t("eventUi.newsPosted", { count: r.sent ?? 0 }) : t("eventUi.newsDraft")),
          );
          if (ok) setText("");
        });
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={t("eventUi.newsPlaceholder")}
        className={input}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending || !text.trim()} className={btnPrimary}>
          {pending ? t("eventUi.sending") : t("eventUi.postNews")}
        </button>
        <span className="text-xs text-muted">{t("eventUi.newsHint")}</span>
      </div>
    </form>
  );
}

export function DeleteNewsButton({ id }: { id: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  return (
    <button disabled={pending} className="text-xs text-faint hover:text-danger" onClick={() => start(async () => void (await act(() => deleteNews(id))))}>
      {t("eventUi.delete")}
    </button>
  );
}

/** "I'm here" on the day of the event. */
export function CheckInButton({ lanId, arrived }: { lanId: string; arrived: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  return (
    <button
      disabled={pending}
      className={arrived ? btnSecondary : btnPrimary}
      onClick={() => start(async () => void (await act(() => setArrived(lanId, null, !arrived))))}
    >
      {arrived ? t("eventUi.checkedIn") : t("eventUi.imHere")}
    </button>
  );
}

/** Cancel the event, with an optional reason for everyone. */
export function CancelEvent({ lanId, published }: { lanId: string; published: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button className={btnSecondary} onClick={() => setOpen(true)}>
        {t("eventUi.cancelOpen")}
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
        placeholder={t("eventUi.cancelWhy")}
        className={input}
      />
      <p className="text-xs text-muted">
        {published
          ? t("eventUi.cancelPublished")
          : t("eventUi.cancelDraft")}
      </p>
      <div className="flex gap-2">
        <button disabled={pending} className={btnDanger} onClick={() => start(async () => void (await act(() => cancelLan(lanId, reason))))}>
          {pending ? t("eventUi.cancelling") : t("eventUi.cancelEvent")}
        </button>
        <button disabled={pending} className={btnGhost} onClick={() => setOpen(false)}>
          {t("eventUi.keepIt")}
        </button>
      </div>
    </div>
  );
}

export function CopyNextYear({ lanId }: { lanId: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  return (
    <button disabled={pending} className={btnSecondary} onClick={() => start(async () => void (await act(() => copyForNextYear(lanId))))}>
      {pending ? t("eventUi.copying") : t("eventUi.copyNextYear")}
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
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  const [all, setAll] = useState(current === null);
  const [picked, setPicked] = useState<string[]>(current ?? []);
  const save = (nextAll: boolean, nextPicked: string[]) => {
    start(async () => void (await act(() => setMyInterests(clanId, nextAll ? null : nextPicked))));
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
        {t("profile.interestsAll")}
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
        {t("profile.interestsSome")}
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
        {pending ? t("common.saving") : t("profile.interestsHint")}
      </p>
    </div>
  );
}
