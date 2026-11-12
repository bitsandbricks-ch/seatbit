import { isMemberRole, roleLabel } from "@/lib/clan-roles";
import { Pill } from "./ui";

/** A member's clan role, or nothing for plain members. */
export function RolePill({ role }: { role: string | null | undefined }) {
  if (!isMemberRole(role) || role === "member") return null;
  return <Pill tone="emerald">{roleLabel(role).toLowerCase()}</Pill>;
}
