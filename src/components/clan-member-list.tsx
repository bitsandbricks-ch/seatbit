"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteGuest, removeClanMember, setClanMemberRole } from "@/app/clan-actions";
import { PagerBar, matches, usePager } from "./pager";
import { Pill, btnGhost, btnSecondary, input } from "./ui";
import { Avatar } from "./avatar";
import type { AvatarData } from "@/lib/avatars";
import { MEMBER_ROLES, ROLE_INFO, type MemberRole } from "@/lib/clan-roles";
import { RolePill } from "./role-pill";

const PAGE_SIZE = 20;

/** Members tab on the clan page: everyone as Mike "Reyki" Keller, with search and pages. */
export function ClanMemberGrid({
  slug,
  members,
}: {
  slug: string;
  members: { id: string; name: string; role: MemberRole; guest?: boolean; avatar?: AvatarData }[];
}) {
  const [q, setQ] = useState("");
  const shown = members.filter((m) => !q || matches(m.name, q));
  const pager = usePager(shown, 48);
  return (
    <div className="space-y-3">
      {members.length > 12 && (
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            pager.reset();
          }}
          placeholder={`Search ${members.length} members`}
          className={input}
          type="search"
          aria-label="Search members"
        />
      )}
      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {pager.items.map((m) => (
          <li key={m.id}>
            <Link
              href={`/clans/${slug}/members/${m.id}`}
              className="flex min-h-14 items-center justify-between gap-2 rounded-bit bg-raised/60 px-3 py-2 text-sm transition hover:bg-raised"
            >
              <span className="flex min-w-0 items-center gap-3">
                <Avatar data={m.avatar} size={32} />
                <span className="truncate font-medium">{m.name}</span>
              </span>
              <span className="flex shrink-0 gap-1">
                <RolePill role={m.role} />
                {m.guest && <Pill>guest</Pill>}
              </span>
            </Link>
          </li>
        ))}
        {shown.length === 0 && <li className="py-4 text-center text-sm text-muted sm:col-span-full">Nobody matches “{q}”.</li>}
      </ul>
      <PagerBar pager={pager} noun="members" />
    </div>
  );
}

export type ClanMemberRow = {
  id: string;
  name: string;
  nick: string;
  /** Email, or "No login yet" for guests. */
  sub: string;
  role: MemberRole;
  isGuest: boolean;
  avatar?: AvatarData;
};

type RoleFilter = "all" | MemberRole;
const roleFilters: { id: RoleFilter; label: string; test: (m: ClanMemberRow) => boolean }[] = [
  { id: "all", label: "all", test: () => true },
  { id: "admin", label: "admins", test: (m) => m.role === "admin" },
  { id: "organizer", label: "event managers", test: (m) => m.role === "organizer" },
  { id: "recruiter", label: "recruiters", test: (m) => m.role === "recruiter" },
  { id: "member", label: "members", test: (m) => m.role === "member" && !m.isGuest },
];

/** Clan settings › Members: search, role filter and pages, with the admin actions per person. */
export function ClanMemberAdmin({
  clanId,
  slug,
  meId,
  canSetRoles,
  members,
}: {
  clanId: string;
  slug: string;
  meId: string;
  /** Admins change roles; recruiters only remove plain members. */
  canSetRoles: boolean;
  members: ClanMemberRow[];
}) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const test = roleFilters.find((f) => f.id === role)!.test;
  const shown = members.filter((m) => test(m) && (!q || matches(`${m.name} ${m.nick} ${m.sub}`, q)));
  const pager = usePager(shown, PAGE_SIZE);
  const lastAdmin = members.filter((m) => m.role === "admin").length <= 1;
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError("");
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });

  return (
    <div className={`space-y-3 ${pending ? "opacity-70" : ""}`}>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm sm:mx-0 sm:flex-wrap sm:px-0">
        {roleFilters
          .filter((f) => f.id === "all" || f.id === "member" || f.id === "admin" || members.some(f.test))
          .map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setRole(f.id);
              pager.reset();
            }}
            className={`${role === f.id ? btnSecondary + " !border-bit" : btnGhost} shrink-0 !rounded-full !py-1`}
          >
            {f.label} <span className="text-faint">{members.filter(f.test).length}</span>
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          pager.reset();
        }}
        placeholder="Search name, nick or email"
        className={input}
        type="search"
        aria-label="Search members"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <ul className="divide-y divide-line">
        {pager.items.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex min-w-0 items-center gap-3">
            <Avatar data={m.avatar} size={32} />
            <span className="min-w-0">
              <span className="block truncate font-medium">
                <Link href={`/clans/${slug}/members/${m.id}`} className="hover:text-bit hover:underline">
                  {m.name}
                </Link>{" "}
                <RolePill role={m.role} />
                {m.isGuest && <Pill>guest</Pill>}
              </span>
              <span className="block truncate text-xs text-muted">
                {m.sub}
              </span>
            </span>
            </span>
            <span className="flex gap-1">
              {m.isGuest ? (
                <button
                  type="button"
                  className={`${btnGhost} text-xs text-danger`}
                  onClick={() => confirm(`Remove the guest ${m.name}?`) && run(() => deleteGuest(clanId, m.id))}
                >
                  Remove
                </button>
              ) : (
                <>
                  {canSetRoles && (
                    <select
                      key={m.role}
                      defaultValue={m.role}
                      disabled={m.role === "admin" && lastAdmin}
                      title={m.role === "admin" && lastAdmin ? "The clan needs at least one admin. Make someone else admin first." : undefined}
                      aria-label={`Role of ${m.name}`}
                      className={`${input} !w-auto !py-1 text-xs`}
                      onChange={(e) => {
                        const to = e.target.value as MemberRole;
                        if (m.role === "admin" && m.id === meId && !confirm("Give up your own admin rights? You can't undo this yourself.")) {
                          e.target.value = m.role;
                          return;
                        }
                        run(() => setClanMemberRole(clanId, m.id, to));
                      }}
                    >
                      {MEMBER_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_INFO[r].label}
                        </option>
                      ))}
                    </select>
                  )}
                  {m.id !== meId && (canSetRoles || m.role === "member") && (
                    <button
                      type="button"
                      disabled={m.role === "admin" && lastAdmin}
                      className={`${btnGhost} text-xs text-danger`}
                      onClick={() => confirm(`Remove ${m.name} from the clan?`) && run(() => removeClanMember(clanId, m.id))}
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
        {shown.length === 0 && <li className="py-6 text-center text-sm text-muted">Nobody matches.</li>}
      </ul>
      <PagerBar pager={pager} noun="members" />
    </div>
  );
}
