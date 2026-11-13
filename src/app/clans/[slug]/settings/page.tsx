import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  addClanMember,
  addGuest,
  deleteGuest,
  renewGuestLink,
  resendGuestDiscordDm,
  unlinkGuestDiscord,
  updateGuest,
  createInvite,
  decideGuestClaim,
  deleteClan,
  deleteInvite,
  removeClanMember,
  setClanDiscordInvite,
  setClanMemberRole,
} from "@/app/clan-actions";
import type { User } from "@/db/schema";
import { Avatar } from "@/components/avatar";
import { ClanHeader, manageTabsFor } from "@/components/clan-header";
import { ClanForm } from "@/components/clan-form";
import { SupportCard } from "@/components/support-card";
import { AddMemberForm } from "@/components/add-member-form";
import { CopyField } from "@/components/copy-field";
import { GuestEditForm, GuestForm } from "@/components/guest-form";
import { GuestDiscordLink } from "@/components/guest-discord";
import { guestDiscordLines } from "@/lib/guest-claim";
import { ClanMemberAdmin } from "@/components/clan-member-list";
import { Card, Columns, Page, btnDanger, btnGhost, btnPrimary, btnSecondary } from "@/components/ui";
import { appUrl } from "@/lib/mail";
import { getDefaultNames } from "@/lib/lans";
import { avatarData } from "@/lib/avatars";
import { clanPerms, clanRole, getClanBySlug } from "@/lib/clans";
import { MEMBER_ROLES, ROLE_INFO, isMemberRole } from "@/lib/clan-roles";
import { fmtDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { unlinkDiscordChannel } from "@/app/actions";
import { discordEnabled, inviteUrl } from "@/lib/discord-api";
import { clanServers } from "@/lib/discord-invite";
import { AuditLog, auditQuery, parseAuditFilter } from "@/components/audit-log";
import { auditEntries, auditedEvents } from "@/lib/audit";


export default async function ClanSettingsPage({ params, searchParams }: PageProps<"/clans/[slug]/settings">) {
  const { slug } = await params;
  const sp = await searchParams;
  const me = await requireUser();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  const perms = clanPerms(me, c.id);
  const allowed: string[] = manageTabsFor(perms);
  if (!allowed.length) redirect(`/clans/${slug}`);
  const tab = allowed.includes(sp.tab as string) ? (sp.tab as string) : allowed[0];

  const members = db
    .select({ u: schema.user, role: schema.clanMember.role })
    .from(schema.clanMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.clanMember.userId))
    .where(eq(schema.clanMember.clanId, c.id))
    .all()
    .sort((a, b) => a.u.name.localeCompare(b.u.name));
  const pending = members.filter((m) => m.role === "pending");
  const claims = db
    .select()
    .from(schema.guestClaim)
    .where(and(eq(schema.guestClaim.clanId, c.id), eq(schema.guestClaim.status, "pending")))
    .all()
    // Only from people still in the clan (or asking to join it from Discord), for guests still waiting to be claimed.
    .filter((r) => members.some((m) => m.u.id === r.userId) && members.some((m) => m.u.id === r.guestId));
  const active = members.filter((m) => m.role !== "pending");
  const guests = active.filter((m) => m.u.isGuest);
  const inClan = new Set(members.map((m) => m.u.id));
  const others = db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      firstName: schema.user.firstName,
      lastName: schema.user.lastName,
      email: schema.user.email,
    })
    .from(schema.user)
    .where(and(eq(schema.user.isGuest, false), isNull(schema.user.deletedAt)))
    .all()
    .filter((u) => !inClan.has(u.id));
  // Members and guests as the clan shows names; the full name stays next to it, because admins need to know who's who.
  const people = getDefaultNames([...members.map((m) => m.u.id), ...others.map((u) => u.id)], c.nameDisplay);
  const userOf = (id: string) => members.find((m) => m.u.id === id)!.u;
  const fullName = (u: { id: string; name: string }) => people.get(u.id)?.full ?? u.name;
  const label = (u: { id: string; name: string }) => people.get(u.id)?.label ?? u.name;
  /** The full name for the small line under a label, when the label leaves part of it out. */
  const fullHint = (u: { id: string; name: string }) => (label(u) === fullName(u) ? [] : [fullName(u)]);
  const candidates = others
    // Shown as Name "Nick" Surname; don't hand every user's full email address to clan admins.
    .map((u) => ({ id: u.id, name: fullName(u), email: maskEmail(u.email) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Page>
      <ClanHeader clan={c} role={clanRole(me.id, c.id)} perms={perms} mode="manage" tab={tab} />

      {tab === "general" && (
        <Columns
          aside={
            <>
              <SupportCard clan={c} status={typeof sp.support === "string" ? sp.support : undefined} />
              <Card title="Danger zone">
                <p className="mb-3 text-sm text-muted">
                  Deletes the clan with all its events and LAN types.
                  {c.stripeSubscriptionId && " Its Supporter subscription is cancelled too."}
                </p>
                <form action={deleteClan.bind(null, c.id)}>
                  <button className={btnDanger}>Delete clan</button>
                </form>
              </Card>
            </>
          }
        >
          <Card>
            <ClanForm
              key={c.avatar ?? "none"}
              clan={{ id: c.id, name: c.name, description: c.description, joinPolicy: c.joinPolicy, guestClaims: c.guestClaims, nameDisplay: c.nameDisplay, locale: c.locale, hasAvatar: !!c.avatar }}
            />
          </Card>
        </Columns>
      )}

      {tab === "members" && (
        <Columns
          aside={
            <>
            <Card title="Add an existing user">
              <p className="mb-3 text-sm text-muted">
                Someone already on Seatbit. For people without an account, add a{" "}
                <Link href={`/clans/${c.slug}/settings?tab=guests`} className="text-bit hover:underline">
                  guest
                </Link>
                .
              </p>
              <AddMemberForm clanId={c.id} users={candidates} action={addClanMember} />
            </Card>
            <RolesCard />
            </>
          }
        >
          {pending.length > 0 && (
            <Card title="Waiting for approval">
              <ul className="space-y-2">
                {pending.map(({ u }) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{label(u)}</span>
                      <span className="block truncate text-xs text-muted">{[...fullHint(u), u.email].join(" · ")}</span>
                    </span>
                    <span className="flex gap-2">
                      <form action={setClanMemberRole.bind(null, c.id, u.id, "member")}>
                        <button className={btnPrimary}>Approve</button>
                      </form>
                      <form action={removeClanMember.bind(null, c.id, u.id)}>
                        <button className={btnGhost}>Decline</button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {claims.length > 0 && (
            <Card title="Guest claims">
              <p className="mb-3 text-sm text-muted">
                These members say they&apos;re one of your guests. Approving moves the guest&apos;s events, seats and nicks to
                their account. Check it&apos;s really them, a name alone proves nothing.
              </p>
              <ul className="divide-y divide-line">
                {claims.map((r) => {
                  const u = userOf(r.userId);
                  const g = userOf(r.guestId);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {label(u)} <span className="font-normal text-muted">is</span> {label(g)}?
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {[
                            label(u) !== fullName(u) || label(g) !== fullName(g) ? `${fullName(u)} is ${fullName(g)}?` : "",
                            r.match ? `Same ${r.match}` : "Picked from the list",
                            u.email,
                            `asked ${fmtDate(r.createdAt)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="flex gap-2">
                        <form action={decideGuestClaim.bind(null, r.id, true)}>
                          <button className={btnPrimary}>Approve</button>
                        </form>
                        <form action={decideGuestClaim.bind(null, r.id, false)}>
                          <button className={btnGhost}>Decline</button>
                        </form>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <Card title={`Members (${active.length - guests.length})`}>
            <p className="mb-3 text-sm text-muted">
              {perms.has("roles")
                ? "Give members a role here or on their profile. A clan always keeps at least one admin."
                : "Only admins change roles. You can remove members without a role."}
            </p>
            <ClanMemberAdmin
              clanId={c.id}
              slug={c.slug}
              meId={me.id}
              canSetRoles={perms.has("roles")}
              members={active.filter(({ u }) => !u.isGuest).map(({ u, role }) => ({
                id: u.id,
                name: label(u),
                full: fullName(u),
                nick: people.get(u.id)?.nick ?? "",
                sub: u.isGuest ? (u.inviteEmail ? `No login yet · ${u.inviteEmail}` : "No login yet") : u.email,
                role: isMemberRole(role) ? role : "member",
                isGuest: u.isGuest,
                avatar: avatarData(u),
              }))}
            />
          </Card>
        </Columns>
      )}

      {tab === "guests" && <GuestsTab clanId={c.id} slug={c.slug} guests={guests.map((g) => g.u)} names={people} />}

      {tab === "chat" && <ChatTab clanId={c.id} />}

      {tab === "log" && <LogTab clanId={c.id} slug={c.slug} sp={sp} />}

      {tab === "types" && (
        <Columns>
          <TypesTab clanId={c.id} slug={c.slug} />
        </Columns>
      )}

      {tab === "invites" && (
        <Columns>
          <Card title="Invite links">
            <p className="mb-3 text-sm text-muted">
              Anyone with a link joins right away, without approval. Delete a link to stop it working.
            </p>
            <ul className="mb-4 space-y-2">
              {db
                .select()
                .from(schema.clanInvite)
                .where(eq(schema.clanInvite.clanId, c.id))
                .all()
                .map((i) => (
                  <li key={i.code} className="flex items-center gap-2">
                    <input readOnly value={`${appUrl}/join/${i.code}`} className="min-w-0 flex-1 rounded-md border border-line bg-raised px-3 py-1.5 font-mono text-xs" />
                    <form action={deleteInvite.bind(null, i.code)}>
                      <button className={`${btnGhost} text-xs text-danger`}>Delete</button>
                    </form>
                  </li>
                ))}
            </ul>
            <form action={createInvite.bind(null, c.id)}>
              <button className={btnSecondary}>Create invite link</button>
            </form>
          </Card>
        </Columns>
      )}
    </Page>
  );
}

async function ChatTab({ clanId }: { clanId: string }) {
  const channels = db
    .select()
    .from(schema.discordChannel)
    .where(eq(schema.discordChannel.clanId, clanId))
    .orderBy(asc(schema.discordChannel.createdAt))
    .all();
  const invite = inviteUrl();
  const servers = discordEnabled() && channels.length ? await clanServers(clanId) : [];
  return (
    <Columns
      aside={
        <Card title="WhatsApp">
          <p className="text-sm text-muted">
            WhatsApp doesn&apos;t let bots post into groups or communities. Each LAN&apos;s manage page has ready-made
            announcement and reminder texts to copy into your WhatsApp group.
          </p>
        </Card>
      }
    >
      <Card title="Discord bot">
        {!discordEnabled() ? (
          <p className="text-sm text-muted">
            The Discord bot isn&apos;t set up on this Seatbit yet. A platform admin needs to add the bot token and public
            key in{" "}
            <Link href="/admin/settings?tab=discord" className="text-bit hover:underline">
              Platform settings
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <ol className="list-decimal space-y-1 pl-5 text-fg/90">
              <li>
                {invite ? (
                  <a href={invite} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                    Add the Seatbit bot
                  </a>
                ) : (
                  "Add the Seatbit bot"
                )}{" "}
                to your Discord server.
              </li>
              <li>Make sure your Discord account is linked on your Seatbit profile.</li>
              <li>
                In the channel for LAN news, run <code>/seatbit here</code>. Use <code>/seatbit announce</code> to post the
                upcoming LANs.
              </li>
            </ol>
            <p className="text-muted">
              The bot posts new LANs with Coming / Unsure / Not coming buttons, keeps the attendee list up to date, posts
              deadline reminders that ping the members concerned, and answers <code>/lans</code>. A Discord server can
              belong to one clan.
            </p>
            {channels.length === 0 ? (
              <p className="text-faint">No channels linked yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {channels.map((ch) => (
                  <li key={ch.channelId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <a
                      href={`https://discord.com/channels/${ch.guildId}/${ch.channelId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      #{ch.channelName || ch.channelId}
                    </a>
                    <form action={unlinkDiscordChannel.bind(null, ch.channelId)}>
                      <button className={`${btnGhost} text-xs text-danger`}>Unlink</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {servers.length > 0 && (
              <div className="space-y-3 border-t border-line pt-4">
                <h3 className="font-semibold">Invite for members</h3>
                <p className="text-muted">
                  Members who aren&apos;t on your server see a &ldquo;Join our Discord&rdquo; button on the clan page, and get
                  the link when their join request is approved. The bot creates the invite itself if it may (&ldquo;Create
                  Invite&rdquo;), or paste your own.
                </p>
                {servers.map((sv) => (
                  <form
                    key={sv.guildId}
                    action={setClanDiscordInvite.bind(null, clanId, sv.guildId)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="w-full text-xs text-faint">{sv.guildName || `Server ${sv.guildId}`}</span>
                    <input
                      name="inviteUrl"
                      defaultValue={sv.inviteUrl ?? ""}
                      placeholder="https://discord.gg/…"
                      className="min-w-0 flex-1 rounded-md border border-line bg-raised px-3 py-1.5 font-mono text-xs"
                    />
                    <button className={btnSecondary}>Save</button>
                  </form>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </Columns>
  );
}

function TypesTab({ clanId, slug }: { clanId: string; slug: string }) {
  const types = db.select().from(schema.lanType).where(eq(schema.lanType.clanId, clanId)).orderBy(asc(schema.lanType.name)).all();
  return (
    <Card
      title="LAN types"
      actions={
        <Link href={`/clans/${slug}/types/new`} className={btnPrimary}>
          Add type
        </Link>
      }
    >
      <p className="mb-3 text-sm text-muted">
        Recurring LAN parties like Lock &amp; Load or SwitzerLAN. Each year&apos;s event is created from its type, and
        members keep one nick per type.
      </p>
      {types.length === 0 ? (
        <p className="text-sm text-muted">No LAN types yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {types.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block font-medium">{t.name}</span>
                <span className="block truncate text-xs text-muted">
                  {[
                    t.location,
                    t.price,
                    t.seatSpec && `seats ${t.seatSpec}`,
                    t.discordMode === "thread" && "Discord thread per event",
                    t.discordMode === "event_channel" && "Discord channel per event",
                  ].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              <span className="flex gap-1">
                <Link href={`/clans/${slug}/types/${t.id}`} className={btnGhost}>
                  Edit
                </Link>
                <Link href={`/clans/${slug}/lans/new?type=${t.id}`} className={btnSecondary}>
                  New event
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GuestsTab({
  clanId,
  slug,
  guests,
  names,
}: {
  clanId: string;
  slug: string;
  guests: User[];
  names: Map<string, { full: string; label: string }>;
}) {
  const types = db.select().from(schema.lanType).where(eq(schema.lanType.clanId, clanId)).orderBy(asc(schema.lanType.name)).all();
  const ids = guests.map((g) => g.id);
  const typeNicks = ids.length
    ? db.select().from(schema.nickname).where(and(inArray(schema.nickname.userId, ids), isNull(schema.nickname.lanId))).all()
    : [];
  const accounts = ids.length
    ? db.select().from(schema.lanAccount).where(and(inArray(schema.lanAccount.userId, ids), isNull(schema.lanAccount.lanId))).all()
    : [];
  return (
    <Columns
      aside={
        <Card title="Add a guest">
          <p className="mb-3 text-sm text-muted">
            For people who aren&apos;t on Seatbit yet: add them by name, then sign them up for events and give them a seat
            like anyone else. With an email address, Seatbit mails them an invite, and signing in with a Discord account on
            that address takes over everything you set up for them. Or send them their link yourself.
          </p>
          <GuestForm action={addGuest.bind(null, clanId)} />
        </Card>
      }
    >
      <Card title={`Guests (${guests.length})`}>
        {guests.length === 0 ? (
          <p className="text-sm text-muted">No guests. Everyone in the clan has their own login.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              Guests haven&apos;t claimed their spot yet, so you keep their details up to date. Everything carries over
              when they sign in.
            </p>
            <ul className="space-y-2">
              {guests.map((u) => {
                const nick = typeNicks.find((n) => n.userId === u.id && !n.typeId)?.nick ?? "";
                const shown = names.get(u.id) ?? { label: u.name, full: u.name };
                return (
                  <li key={u.id} className="rounded-md border border-line">
                    <details className="group">
                      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
                        <Avatar data={avatarData(u)} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{shown.label}</span>
                          <span className="block truncate text-xs text-faint">
                            {shown.label !== shown.full && `${shown.full} · `}
                            {u.inviteEmail
                              ? u.invitedAt
                                ? `Invited ${fmtDate(u.invitedAt)} at ${u.inviteEmail}`
                                : u.inviteEmail
                              : "No email yet"}
                            {u.guestDiscordId && ` · Discord: ${u.guestDiscordName ?? "linked"}`}
                          </span>
                        </span>
                        <span className={`${btnSecondary} shrink-0 group-open:!border-bit`}>
                          <span className="group-open:hidden">Edit</span>
                          <span className="hidden group-open:inline">Close</span>
                        </span>
                      </summary>
                      <div className="space-y-4 border-t border-line p-3 sm:p-4">
                        <GuestEditForm
                          action={updateGuest.bind(null, clanId, u.id)}
                          guest={{ firstName: u.firstName, lastName: u.lastName, nick, email: u.inviteEmail ?? "" }}
                          types={types.map((t) => ({
                            id: t.id,
                            name: t.name,
                            nick: typeNicks.find((n) => n.userId === u.id && n.typeId === t.id)?.nick ?? "",
                            lanId: accounts.find((a) => a.userId === u.id && a.typeId === t.id)?.value ?? "",
                          }))}
                        />
                        <div className="space-y-1.5 border-t border-line pt-4">
                          <p className="text-xs text-muted">Claim link: whoever opens it and signs in takes over this guest.</p>
                          <span className="flex flex-wrap items-center gap-1">
                            <CopyField value={`${appUrl}/claim/${u.claimCode}`} />
                            <form action={renewGuestLink.bind(null, clanId, u.id)}>
                              <button className={`${btnGhost} text-xs`}>New link</button>
                            </form>
                          </span>
                        </div>
                        <div className="space-y-1.5 border-t border-line pt-4">
                          <p className="text-xs text-muted">Discord</p>
                          <GuestDiscordLink
                            linked={!!u.guestDiscordId}
                            lines={guestDiscordLines(u)}
                            resend={resendGuestDiscordDm.bind(null, clanId, u.id)}
                            unlink={unlinkGuestDiscord.bind(null, clanId, u.id)}
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                          <Link href={`/clans/${slug}/members/${u.id}`} className="text-sm text-bit hover:underline">
                            Profile and events
                          </Link>
                          <form action={deleteGuest.bind(null, clanId, u.id)}>
                            <button className={`${btnGhost} text-xs !text-danger`}>Remove guest</button>
                          </form>
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </Columns>
  );
}

/** Who changed what in the clan: seat moves, answer overrides, roles, guests, publishing. Clan admins only. */
function LogTab({ clanId, slug, sp }: { clanId: string; slug: string; sp: Record<string, string | string[] | undefined> }) {
  const filter = parseAuditFilter(sp);
  const { rows, total, page, pages } = auditEntries({ clanId, lanId: filter.lan, group: filter.group, page: filter.page });
  return (
    <Card title="Audit log">
      <p className="mb-4 text-sm text-muted">
        Changes leads and admins made in this clan and its events. Members&apos; own answers aren&apos;t listed. Entries
        are kept for a year.
      </p>
      <AuditLog
        rows={rows}
        total={total}
        page={page}
        pages={pages}
        filter={filter}
        keep={{ tab: "log" }}
        href={(f) => `/clans/${slug}/settings?${auditQuery(f, { tab: "log" })}`}
        events={auditedEvents(clanId)}
      />
    </Card>
  );
}

/** What each role may do, next to the member list. */
function RolesCard() {
  return (
    <Card title="Roles">
      <dl className="space-y-2.5 text-sm">
        {MEMBER_ROLES.map((r) => (
          <div key={r}>
            <dt className="font-medium">{ROLE_INFO[r].label}</dt>
            <dd className="text-muted">{ROLE_INFO[r].description}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-faint">Leads of a single event are set on the event&apos;s manage page.</p>
    </Card>
  );
}

function maskEmail(e: string) {
  const [local, domain] = e.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain ?? ""}`;
}
