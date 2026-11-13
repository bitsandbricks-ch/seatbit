"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteGuest, removeClanMember, setClanMemberRole } from "@/app/clan-actions";
import { MEMBER_ROLES, type MemberRole } from "@/lib/clan-roles";
import { useT } from "@/i18n/client";
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
  const t = useT();
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
        setError(e instanceof Error ? e.message : t("memberList.error"));
      }
    });

  if (isGuest) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted">{t("memberActions.guestNoRole")}</p>
        <button
          type="button"
          disabled={pending}
          className={`${btnGhost} border border-line !text-danger`}
          onClick={() =>
            confirm(t("memberActions.removeGuestQ", { name })) &&
            run(() => deleteGuest(clanId, userId), () => router.push(`/clans/${slug}/settings?tab=members`))
          }
        >
          {t("clanSettings.removeGuest")}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  const canRemove = !isSelf && (canSetRoles || role === "member");
  const choose = (to: MemberRole) => {
    if (to === role) return;
    if (isSelf && role === "admin" && !confirm(t("memberList.giveUpAdmin"))) return;
    run(() => setClanMemberRole(clanId, userId, to));
  };

  return (
    <div className={`space-y-3 ${pending ? "opacity-70" : ""}`}>
      {canSetRoles ? (
        <fieldset disabled={pending || lastAdmin} className="space-y-1.5" aria-label={t("memberList.roleOf", { name })}>
          {MEMBER_ROLES.map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer gap-3 rounded-md border p-2.5 text-sm transition ${
                r === role ? "border-bit bg-bit-soft" : "border-line hover:bg-raised"
              }`}
            >
              <input type="radio" name="role" value={r} checked={r === role} onChange={() => choose(r)} className="mt-0.5 accent-bit" />
              <span className="min-w-0">
                <span className="block font-medium">{t(`roles.${r}`)}</span>
                <span className="block text-xs text-muted">{t(`roleInfo.${r}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-muted">
          {t(isSelf ? "memberActions.youAre" : "memberActions.theyAre", { name, role: t(`roleA.${role}`) })} {t(`roleInfo.${role}`)}{" "}
          {t("memberActions.onlyAdmins")}
        </p>
      )}
      {canRemove && (
        <button
          type="button"
          disabled={pending || lastAdmin}
          className={`${btnGhost} border border-line !text-danger`}
          onClick={() =>
            confirm(t("memberList.removeQ", { name })) &&
            run(() => removeClanMember(clanId, userId), () => router.push(`/clans/${slug}/settings?tab=members`))
          }
        >
          {t("memberActions.removeFromClan")}
        </button>
      )}
      {lastAdmin && (
        <p className="text-xs text-faint">
          {t(isSelf ? "memberActions.lastAdminSelf" : "memberActions.lastAdmin", { name })}
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
