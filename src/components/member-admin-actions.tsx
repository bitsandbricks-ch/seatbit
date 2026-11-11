"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteGuest, removeClanMember, setClanMemberRole } from "@/app/clan-actions";
import { btnGhost, btnSecondary } from "./ui";

/** Role and membership buttons on a member's profile, for clan admins. */
export function MemberAdminActions({
  clanId,
  slug,
  userId,
  name,
  role,
  isGuest,
  isSelf,
  lastAdmin,
}: {
  clanId: string;
  slug: string;
  userId: string;
  name: string;
  role: "admin" | "member";
  isGuest: boolean;
  isSelf: boolean;
  /** The only admin left: can't be demoted or removed. */
  lastAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const run = (fn: () => Promise<unknown>, then?: () => void) =>
    start(async () => {
      setError("");
      try {
        await fn();
        then?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });

  if (isGuest) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted">Guests can become admins once they have claimed their account.</p>
        <button
          type="button"
          disabled={pending}
          className={`${btnGhost} border border-line !text-danger`}
          onClick={() =>
            confirm(`Remove the guest ${name}? Their answers and seats go too.`) &&
            run(() => deleteGuest(clanId, userId), () => router.push(`/clans/${slug}/settings?tab=members`))
          }
        >
          Remove guest
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${pending ? "opacity-70" : ""}`}>
      <p className="text-sm text-muted">
        {role === "admin" ? `${isSelf ? "You are" : `${name} is`} a clan admin.` : `${name} is a member.`} Admins manage
        the clan: settings, members, LAN types and every event.
      </p>
      <div className="flex flex-wrap gap-2">
        {role === "admin" ? (
          <button
            type="button"
            disabled={pending || lastAdmin}
            className={btnSecondary}
            onClick={() =>
              (!isSelf || confirm("Remove your own admin rights? You can't undo this yourself.")) &&
              run(() => setClanMemberRole(clanId, userId, "member"))
            }
          >
            Remove admin
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            className={btnSecondary}
            onClick={() => run(() => setClanMemberRole(clanId, userId, "admin"))}
          >
            Make admin
          </button>
        )}
        {!isSelf && (
          <button
            type="button"
            disabled={pending || lastAdmin}
            className={`${btnGhost} !text-danger`}
            onClick={() =>
              confirm(`Remove ${name} from the clan?`) &&
              run(() => removeClanMember(clanId, userId), () => router.push(`/clans/${slug}/settings?tab=members`))
            }
          >
            Remove from clan
          </button>
        )}
      </div>
      {lastAdmin && (
        <p className="text-xs text-faint">
          {isSelf ? "You're" : `${name} is`} the only admin. Make someone else admin first, so the clan is never left without one.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
