"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteGuest, removeClanMember, setClanMemberRole } from "@/app/clan-actions";
import { MEMBER_ROLES, ROLE_INFO, roleWithArticle, type MemberRole } from "@/lib/clan-roles";
import { btnGhost } from "./ui";

/** Role and membership controls on a member's profile: admins change roles, recruiters remove plain members. */
export function MemberAdminActions({
  clanId,
  slug,
  userId,
  name,
  role,
  canSetRoles,
  isGuest,
  isSelf,
  lastAdmin,
}: {
  clanId: string;
  slug: string;
  userId: string;
  name: string;
  role: MemberRole;
  canSetRoles: boolean;
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
        <p className="text-sm text-muted">Guests can get a role once they have claimed their account.</p>
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

  const canRemove = !isSelf && (canSetRoles || role === "member");
  const choose = (to: MemberRole) => {
    if (to === role) return;
    if (isSelf && role === "admin" && !confirm("Give up your own admin rights? You can't undo this yourself.")) return;
    run(() => setClanMemberRole(clanId, userId, to));
  };

  return (
    <div className={`space-y-3 ${pending ? "opacity-70" : ""}`}>
      {canSetRoles ? (
        <fieldset disabled={pending || lastAdmin} className="space-y-1.5" aria-label={`Role of ${name}`}>
          {MEMBER_ROLES.map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer gap-3 rounded-md border p-2.5 text-sm transition ${
                r === role ? "border-bit bg-bit-soft" : "border-line hover:bg-raised"
              }`}
            >
              <input type="radio" name="role" value={r} checked={r === role} onChange={() => choose(r)} className="mt-0.5 accent-bit" />
              <span className="min-w-0">
                <span className="block font-medium">{ROLE_INFO[r].label}</span>
                <span className="block text-xs text-muted">{ROLE_INFO[r].description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-muted">
          {isSelf ? "You are" : `${name} is`} {roleWithArticle(role)}:{" "}
          {ROLE_INFO[role].description.charAt(0).toLowerCase() + ROLE_INFO[role].description.slice(1)} Only admins change roles.
        </p>
      )}
      {canRemove && (
        <button
          type="button"
          disabled={pending || lastAdmin}
          className={`${btnGhost} border border-line !text-danger`}
          onClick={() =>
            confirm(`Remove ${name} from the clan?`) &&
            run(() => removeClanMember(clanId, userId), () => router.push(`/clans/${slug}/settings?tab=members`))
          }
        >
          Remove from clan
        </button>
      )}
      {lastAdmin && (
        <p className="text-xs text-faint">
          {isSelf ? "You're" : `${name} is`} the only admin. Make someone else admin first, so the clan is never left without one.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
