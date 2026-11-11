import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  addClanMember,
  addGuest,
  renewGuestLink,
  createInvite,
  deleteClan,
  deleteInvite,
  removeClanMember,
  setClanMemberRole,
} from "@/app/clan-actions";
import { ClanAvatar } from "@/components/clan-avatar";
import { ClanForm } from "@/components/clan-form";
import { AddMemberForm } from "@/components/add-member-form";
import { CopyField } from "@/components/copy-field";
import { GuestForm } from "@/components/guest-form";
import { Tabs } from "@/components/tabs";
import { ClanMemberAdmin } from "@/components/clan-member-list";
import { Card, btnDanger, btnGhost, btnPrimary, btnSecondary } from "@/components/ui";
import { appUrl } from "@/lib/mail";
import { canManageClan, getClanBySlug } from "@/lib/clans";
import { requireUser } from "@/lib/session";
import { unlinkDiscordChannel } from "@/app/actions";
import { discordEnabled, inviteUrl } from "@/lib/discord-api";

const TABS = [
  { id: "general", label: "General" },
  { id: "members", label: "Members" },
  { id: "types", label: "LAN types" },
  { id: "invites", label: "Invite links" },
  { id: "chat", label: "Discord & WhatsApp" },
];

export default async function ClanSettingsPage({ params, searchParams }: PageProps<"/clans/[slug]/settings">) {
  const { slug } = await params;
  const sp = await searchParams;
  const me = await requireUser();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!canManageClan(me, c.id)) redirect(`/clans/${slug}`);
  const tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as string) : "general";

  const members = db
    .select({ u: schema.user, role: schema.clanMember.role })
    .from(schema.clanMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.clanMember.userId))
    .where(eq(schema.clanMember.clanId, c.id))
    .all()
    .sort((a, b) => a.u.name.localeCompare(b.u.name));
  const pending = members.filter((m) => m.role === "pending");
  const active = members.filter((m) => m.role !== "pending");
  const guests = active.filter((m) => m.u.isGuest);
  const defaultNick = new Map(
    db
      .select({ userId: schema.nickname.userId, nick: schema.nickname.nick })
      .from(schema.nickname)
      .where(and(isNull(schema.nickname.lanId), isNull(schema.nickname.typeId)))
      .all()
      .map((n) => [n.userId, n.nick]),
  );
  const inClan = new Set(members.map((m) => m.u.id));
  const others = db
    .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.isGuest, false))
    .orderBy(asc(schema.user.name))
    .all()
    .filter((u) => !inClan.has(u.id))
    // Don't hand every user's full email address to clan admins.
    .map((u) => ({ ...u, email: maskEmail(u.email) }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <ClanAvatar clan={c} size={48} />
        <div className="min-w-0">
          <Link href={`/clans/${c.slug}`} className="text-sm text-muted hover:text-fg">
            ← {c.name}
          </Link>
          <h1 className="text-2xl font-bold">Clan settings</h1>
        </div>
      </div>
      <div className="sticky top-14 z-20 -mx-4 bg-ink/95 px-4 backdrop-blur sm:mx-0 sm:px-0">
        <Tabs
          tabs={TABS.map((t) => ({ ...t, badge: t.id === "members" && pending.length ? `${pending.length} waiting` : undefined }))}
          active={tab}
          hrefFor={(t) => `/clans/${c.slug}/settings?tab=${t}`}
        />
      </div>

      {tab === "general" && (
        <>
          <Card>
            <ClanForm
              key={c.avatar ?? "none"}
              clan={{ id: c.id, name: c.name, description: c.description, joinPolicy: c.joinPolicy, hasAvatar: !!c.avatar }}
            />
          </Card>
          <Card title="Danger zone">
            <p className="mb-3 text-sm text-muted">Deletes the clan with all its events and LAN types.</p>
            <form action={deleteClan.bind(null, c.id)}>
              <button className={btnDanger}>Delete {c.name}</button>
            </form>
          </Card>
        </>
      )}

      {tab === "members" && (
        <>
          {pending.length > 0 && (
            <Card title="Waiting for approval">
              <ul className="space-y-2">
                {pending.map(({ u }) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{u.name}</span>
                      <span className="block truncate text-xs text-muted">{u.email}</span>
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
          <Card title="Add an existing user">
            <AddMemberForm clanId={c.id} users={others} action={addClanMember} />
          </Card>
          <Card title="Guests">
            <p className="mb-3 text-sm text-muted">
              For people who aren&apos;t on Seatbit yet: add them by name, then sign them up for events and give them a seat
              like anyone else. Send them their link: when they sign in with Discord through it, their account takes over
              everything you set up for them.
            </p>
            {guests.length > 0 && (
              <ul className="mb-4 space-y-3">
                {guests.map(({ u }) => (
                  <li key={u.id} className="space-y-1.5">
                    <span className="block truncate text-sm font-medium">{u.name}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      <CopyField value={`${appUrl}/claim/${u.claimCode}`} />
                      <form action={renewGuestLink.bind(null, c.id, u.id)}>
                        <button className={`${btnGhost} text-xs`}>New link</button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <GuestForm action={addGuest.bind(null, c.id)} />
          </Card>
          <Card title={`Members (${active.length})`}>
            <ClanMemberAdmin
              clanId={c.id}
              meId={me.id}
              members={active.map(({ u, role }) => ({
                id: u.id,
                name: u.name,
                nick: defaultNick.get(u.id) ?? "",
                sub: u.isGuest ? "No login yet" : u.email,
                role: role === "admin" ? "admin" : "member",
                isGuest: u.isGuest,
              }))}
            />
          </Card>
        </>
      )}

      {tab === "chat" && <ChatTab clanId={c.id} />}

      {tab === "types" && (
        <TypesTab clanId={c.id} slug={c.slug} />
      )}

      {tab === "invites" && (
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
      )}
    </div>
  );
}

function ChatTab({ clanId }: { clanId: string }) {
  const channels = db
    .select()
    .from(schema.discordChannel)
    .where(eq(schema.discordChannel.clanId, clanId))
    .orderBy(asc(schema.discordChannel.createdAt))
    .all();
  const invite = inviteUrl();
  return (
    <div className="space-y-5">
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
          </div>
        )}
      </Card>
      <Card title="WhatsApp">
        <p className="text-sm text-muted">
          WhatsApp doesn&apos;t let bots post into groups or communities. Each LAN&apos;s manage page has ready-made
          announcement and reminder texts to copy into your WhatsApp group.
        </p>
      </Card>
    </div>
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
                  {[t.location, t.price, t.seatSpec && `seats ${t.seatSpec}`].filter(Boolean).join(" · ") || "—"}
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

function maskEmail(e: string) {
  const [local, domain] = e.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain ?? ""}`;
}
