"use client";
import { isMemberRole } from "@/lib/clan-roles";
import { useT } from "@/i18n/client";
import { Pill } from "./ui";

/** A member's clan role, or nothing for plain members. */
export function RolePill({ role }: { role: string | null | undefined }) {
  const t = useT();
  if (!isMemberRole(role) || role === "member") return null;
  return <Pill tone="emerald">{t(`roles.${role}`).toLowerCase()}</Pill>;
}
