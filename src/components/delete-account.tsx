"use client";
import { useActionState, useState } from "react";
import { deleteMyAccount, type DeleteState } from "@/app/account-actions";
import { btnDanger, btnGhost, btnSecondary, input } from "./ui";

/**
 * "Your data" on the profile: download everything as JSON, and delete the account. Deleting
 * opens a short confirmation that says what goes and what stays, and needs DELETE typed in.
 */
export function YourData({
  blockingClans,
  clansToDelete,
  lastPlatformAdmin,
  upcomingEvents,
}: {
  blockingClans: { name: string; slug: string }[];
  clansToDelete: string[];
  lastPlatformAdmin: boolean;
  upcomingEvents: number;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteMyAccount, undefined);
  const blocked = blockingClans.length > 0 || lastPlatformAdmin;

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <p className="text-muted">Everything Seatbit stores about you (profile, nicks, events, seats, rides, audit log entries) as a JSON file.</p>
        <a href="/profile/export" className={`${btnSecondary} w-full`} download>
          Download my data
        </a>
      </div>
      <div className="space-y-2 border-t border-line pt-4">
        {!open ? (
          <>
            <p className="text-muted">Removes your profile, sign-in and personal data for good.</p>
            <button type="button" className={`${btnGhost} w-full !text-danger`} onClick={() => setOpen(true)}>
              Delete my account…
            </button>
          </>
        ) : (
          <form action={action} className="space-y-3">
            <p className="font-medium text-fg">Delete your account?</p>
            {blocked ? (
              <div className="space-y-2 rounded-md border border-warn/30 bg-warn/10 p-3 text-warn">
                {blockingClans.length > 0 && (
                  <p>
                    You&apos;re the only admin of{" "}
                    {blockingClans.map((c, i) => (
                      <span key={c.slug}>
                        {i > 0 && ", "}
                        <a href={`/clans/${c.slug}/settings?tab=members`} className="underline">
                          {c.name}
                        </a>
                      </span>
                    ))}
                    . Make someone else admin there first, so the clan isn&apos;t left without one.
                  </p>
                )}
                {lastPlatformAdmin && <p>You&apos;re the only platform admin. Make someone else platform admin first.</p>}
              </div>
            ) : (
              <>
                <ul className="list-disc space-y-1 pl-5 text-muted">
                  <li>Your name, email, picture, nicks, LAN IDs and Discord link are deleted, and you&apos;re signed out.</li>
                  <li>
                    You leave all your clans.
                    {upcomingEvents > 0 && ` Your answer and seat for ${upcomingEvents} upcoming event${upcomingEvents === 1 ? "" : "s"} are removed (the waitlist moves up).`}
                  </li>
                  <li>Past events keep an anonymous &ldquo;Deleted member&rdquo; with just the answer, so the clan&apos;s numbers still add up.</li>
                  {clansToDelete.length > 0 && (
                    <li className="text-danger">
                      Nobody else with a login is in {clansToDelete.join(", ")}, so {clansToDelete.length === 1 ? "that clan is" : "those clans are"} deleted too, with all events and guests.
                    </li>
                  )}
                </ul>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Type DELETE to confirm</span>
                  <input
                    name="confirm"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    className={input}
                    placeholder="DELETE"
                  />
                </label>
              </>
            )}
            {state?.error && <p className="text-danger">{state.error}</p>}
            <div className="flex flex-wrap gap-2">
              {!blocked && (
                <button className={btnDanger} disabled={pending || typed.trim().toUpperCase() !== "DELETE"}>
                  {pending ? "Deleting…" : "Delete my account"}
                </button>
              )}
              <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
