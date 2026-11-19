"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { linkGuestToMember } from "@/app/guest-link-actions";
import type { LinkCandidate } from "@/lib/guest-link";
import { nameMatches } from "@/lib/names";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";
import { ask } from "./dialog";
import { btnSecondary, input } from "./ui";

/**
 * "This guest is …": search a real account and move the guest's answers, seats and nicks to it.
 * The confirm lists the events both answered and whose answer stays there.
 */
export function GuestLinkForm({
  clanId,
  guestId,
  guestName,
  candidates,
  afterHref,
}: {
  clanId: string;
  guestId: string;
  guestName: string;
  candidates: LinkCandidate[];
  /** Where to go once the guest is gone; `{id}` becomes the linked account. */
  afterHref: string;
}) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const act = useRunAction();
  const hits = useMemo(
    () => (q.trim().length < 2 ? [] : candidates.filter((c) => nameMatches(c.name, q) || c.email.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)),
    [q, candidates],
  );

  const link = async (c: LinkCandidate) => {
    const ok = await ask({
      title: t("guestLink.confirmQ", { guest: guestName, name: c.name }),
      body: (
        <div className="space-y-2">
          <p>{t("guestLink.confirmBody", { guest: guestName, name: c.name })}</p>
          {c.conflicts.length > 0 && (
            <>
              <p>{t("guestLink.bothAnswered", { count: c.conflicts.length })}</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {c.conflicts.map((x) => (
                  <li key={x.event}>
                    {t(x.keep === "guest" ? "guestLink.keepsGuest" : "guestLink.keepsMember", { event: x.event, guest: guestName, name: c.name })}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-faint">{t("guestLink.cantUndo")}</p>
        </div>
      ),
      confirm: t("guestLink.link"),
    });
    if (!ok) return;
    start(async () => {
      if (await act(() => linkGuestToMember(clanId, guestId, c.id))) router.push(afterHref.replace("{id}", c.id));
    });
  };

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("guestLink.search")}
        aria-label={t("guestLink.search")}
        className={input}
      />
      {hits.length > 0 && (
        <ul className="space-y-1">
          {hits.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-raised/60 px-3 py-1.5">
              <span className="min-w-0 text-sm">
                <span className="block truncate">{c.name}</span>
                <span className="block truncate text-xs text-faint">{c.email}</span>
                {c.conflicts.length > 0 && <span className="block text-xs text-muted">{t("guestLink.bothOn", { count: c.conflicts.length })}</span>}
              </span>
              <button type="button" disabled={pending} className={`${btnSecondary} !py-1 text-xs`} onClick={() => link(c)}>
                {t("guestLink.link")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && hits.length === 0 && <p className="text-sm text-muted">{t("guestLink.none")}</p>}
    </div>
  );
}
