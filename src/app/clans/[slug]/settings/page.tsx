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
import { MEMBER_ROLES, isMemberRole } from "@/lib/clan-roles";
import { fmtDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { unlinkDiscordChannel } from "@/app/actions";
import { discordEnabled, inviteUrl } from "@/lib/discord-api";
import { clanServers } from "@/lib/discord-invite";
import { AuditLog, auditQuery, parseAuditFilter } from "@/components/audit-log";
import { auditEntries, auditedEvents } from "@/lib/audit";
import { ensureDefaultTasks, tasksAt } from "@/lib/lead-tasks";
import { LeadTaskEditor } from "@/components/lead-task-editor";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";


export default async function ClanSettingsPage({ params, searchParams }: PageProps<"/clans/[slug]/settings">) {
  const { slug } = await params;
  const sp = await searchParams;
  const me = await requireUser();
  const t = await getT();
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
              <Card title={t("manage.dangerZone")}>
                <p className="mb-3 text-sm text-muted">
                  {t("clanSettings.deleteHint")}
                  {c.stripeSubscriptionId && ` ${t("clanSettings.deleteSub")}`}
                </p>
                <form action={deleteClan.bind(null, c.id)}>
                  <button className={btnDanger}>{t("clanSettings.delete")}</button>
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
            <Card title={t("clanSettings.addExisting")}>
              <p className="mb-3 text-sm text-muted">
                {t.rich("clanSettings.addExistingHint", {
                  guest: (
                    <Link href={`/clans/${c.slug}/settings?tab=guests`} className="text-bit hover:underline">
                      {t("clanSettings.guest")}
                    </Link>
                  ),
                })}
              </p>
              <AddMemberForm clanId={c.id} users={candidates} action={addClanMember} />
            </Card>
            <RolesCard t={t} />
            </>
          }
        >
          {pending.length > 0 && (
            <Card title={t("clanPage.waitingApproval")}>
              <ul className="space-y-2">
                {pending.map(({ u }) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{label(u)}</span>
                      <span className="block truncate text-xs text-muted">{[...fullHint(u), u.email].join(" · ")}</span>
                    </span>
                    <span className="flex gap-2">
                      <form action={setClanMemberRole.bind(null, c.id, u.id, "member")}>
                        <button className={btnPrimary}>{t("clanSettings.approve")}</button>
                      </form>
                      <form action={removeClanMember.bind(null, c.id, u.id)}>
                        <button className={btnGhost}>{t("clanSettings.decline")}</button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {claims.length > 0 && (
            <Card title={t("clanSettings.claims")}>
              <p className="mb-3 text-sm text-muted">{t("clanSettings.claimsHint")}</p>
              <ul className="divide-y divide-line">
                {claims.map((r) => {
                  const u = userOf(r.userId);
                  const g = userOf(r.guestId);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {t.rich("clanSettings.isGuest", {
                            name: label(u),
                            guest: label(g),
                            is: <span className="font-normal text-muted">{t("clanSettings.is")}</span>,
                          })}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {[
                            label(u) !== fullName(u) || label(g) !== fullName(g)
                              ? t("clanSettings.isGuestPlain", { name: fullName(u), guest: fullName(g) })
                              : "",
                            r.match ? t(r.match === "nick" ? "clanSettings.sameNick" : "clanSettings.sameName") : t("clanSettings.picked"),
                            u.email,
                            t("clanSettings.asked", { date: fmtDate(r.createdAt, t.locale) }),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="flex gap-2">
                        <form action={decideGuestClaim.bind(null, r.id, true)}>
                          <button className={btnPrimary}>{t("clanSettings.approve")}</button>
                        </form>
                        <form action={decideGuestClaim.bind(null, r.id, false)}>
                          <button className={btnGhost}>{t("clanSettings.decline")}</button>
                        </form>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <Card title={`${t("clanPage.members")} (${active.length - guests.length})`}>
            <p className="mb-3 text-sm text-muted">{t(perms.has("roles") ? "clanSettings.rolesHint" : "clanSettings.rolesOnlyAdmins")}</p>
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
                sub: u.isGuest ? (u.inviteEmail ? `${t("clanSettings.noLogin")} · ${u.inviteEmail}` : t("clanSettings.noLogin")) : u.email,
                role: isMemberRole(role) ? role : "member",
                isGuest: u.isGuest,
                avatar: avatarData(u),
              }))}
            />
          </Card>
        </Columns>
      )}

      {tab === "guests" && <GuestsTab t={t} clanId={c.id} slug={c.slug} guests={guests.map((g) => g.u)} names={people} />}

      {tab === "chat" && <ChatTab t={t} clanId={c.id} />}

      {tab === "log" && <LogTab t={t} clanId={c.id} slug={c.slug} sp={sp} />}

      {tab === "types" && (
        <Columns>
          <TypesTab t={t} clanId={c.id} slug={c.slug} />
        </Columns>
      )}

      {tab === "invites" && (
        <Columns>
          <Card title={t("clanPage.links.invites")}>
            <p className="mb-3 text-sm text-muted">{t("clanSettings.invitesHint")}</p>
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
                      <button className={`${btnGhost} text-xs text-danger`}>{t("eventUi.delete")}</button>
                    </form>
                  </li>
                ))}
            </ul>
            <form action={createInvite.bind(null, c.id)}>
              <button className={btnSecondary}>{t("clanSettings.createInvite")}</button>
            </form>
          </Card>
        </Columns>
      )}
    </Page>
  );
}

async function ChatTab({ t, clanId }: { t: T; clanId: string }) {
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
          <p className="text-sm text-muted">{t("clanSettings.whatsapp")}</p>
        </Card>
      }
    >
      <Card title={t("clanSettings.bot")}>
        {!discordEnabled() ? (
          <p className="text-sm text-muted">
            {t.rich("clanSettings.botNotSetUp", {
              link: (
                <Link href="/admin/settings?tab=discord" className="text-bit hover:underline">
                  {t("clanSettings.platformSettings")}
                </Link>
              ),
            })}
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <ol className="list-decimal space-y-1 pl-5 text-fg/90">
              <li>
                {t.rich("clanSettings.step1", {
                  bot: invite ? (
                    <a href={invite} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                      {t("clanSettings.addBot")}
                    </a>
                  ) : (
                    t("clanSettings.addBot")
                  ),
                })}
              </li>
              <li>{t("clanSettings.step2")}</li>
              <li>{t.rich("clanSettings.step3", { here: <code>/seatbit here</code>, announce: <code>/seatbit announce</code> })}</li>
            </ol>
            <p className="text-muted">{t.rich("clanSettings.botDoes", { lans: <code>/lans</code> })}</p>
            {channels.length === 0 ? (
              <p className="text-faint">{t("clanSettings.noChannels")}</p>
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
                      <button className={`${btnGhost} text-xs text-danger`}>{t("clanSettings.unlink")}</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {servers.length > 0 && (
              <div className="space-y-3 border-t border-line pt-4">
                <h3 className="font-semibold">{t("clanSettings.memberInvite")}</h3>
                <p className="text-muted">{t("clanSettings.memberInviteHint")}</p>
                {servers.map((sv) => (
                  <form
                    key={sv.guildId}
                    action={setClanDiscordInvite.bind(null, clanId, sv.guildId)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="w-full text-xs text-faint">{sv.guildName || t("clanSettings.server", { id: sv.guildId })}</span>
                    <input
                      name="inviteUrl"
                      defaultValue={sv.inviteUrl ?? ""}
                      placeholder="https://discord.gg/…"
                      className="min-w-0 flex-1 rounded-md border border-line bg-raised px-3 py-1.5 font-mono text-xs"
                    />
                    <button className={btnSecondary}>{t("common.save")}</button>
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

function TypesTab({ t, clanId, slug }: { t: T; clanId: string; slug: string }) {
  const types = db.select().from(schema.lanType).where(eq(schema.lanType.clanId, clanId)).orderBy(asc(schema.lanType.name)).all();
  ensureDefaultTasks(clanId);
  const clanTasks = tasksAt({ clanId });
  return (
    <div className="space-y-4 sm:space-y-6">
    <Card
      title={t("clanPage.links.types")}
      actions={
        <Link href={`/clans/${slug}/types/new`} className={btnPrimary}>
          {t("typeForm.add")}
        </Link>
      }
    >
      <p className="mb-3 text-sm text-muted">{t("clanSettings.typesHint")}</p>
      {types.length === 0 ? (
        <p className="text-sm text-muted">{t("clanSettings.noTypes")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {types.map((ty) => (
            <li key={ty.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block font-medium">{ty.name}</span>
                <span className="block truncate text-xs text-muted">
                  {[
                    ty.location,
                    ty.price,
                    ty.seatSpec && t("clanSettings.seats", { seats: ty.seatSpec }),
                    ty.discordMode === "thread" && t("clanSettings.threadPerEvent"),
                    ty.discordMode === "event_channel" && t("clanSettings.channelPerEvent"),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
              </span>
              <span className="flex gap-1">
                <Link href={`/clans/${slug}/types/${ty.id}`} className={btnGhost}>
                  {t("clanSettings.edit")}
                </Link>
                <Link href={`/clans/${slug}/lans/new?type=${ty.id}`} className={btnSecondary}>
                  {t("home.newEvent")}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
    <Card id="lead-tasks" title={t("leadTasks.allHeading")}>
      <p className="mb-3 text-sm text-muted">{t("leadTasks.allHint")}</p>
      <LeadTaskEditor
        scope={{ clanId }}
        tasks={clanTasks.map(({ id, title, note, after, dueDays, contactId }) => ({ id, title, note, after, dueDays, contactId }))}
        depTasks={clanTasks.map((x) => ({ id: x.id, title: x.title }))}
        contacts={[]}
      />
    </Card>
    </div>
  );
}

function GuestsTab({
  t,
  clanId,
  slug,
  guests,
  names,
}: {
  t: T;
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
        <Card title={t("clanSettings.addGuest")}>
          <p className="mb-3 text-sm text-muted">{t("clanSettings.addGuestHint")}</p>
          <GuestForm action={addGuest.bind(null, clanId)} submitLabel={t("clanSettings.addGuestSubmit")} />
        </Card>
      }
    >
      <Card title={`${t("clanPage.links.guests")} (${guests.length})`}>
        {guests.length === 0 ? (
          <p className="text-sm text-muted">{t("clanSettings.noGuests")}</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">{t("clanSettings.guestsHint")}</p>
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
                                ? t("clanSettings.invitedAt", { date: fmtDate(u.invitedAt, t.locale), email: u.inviteEmail })
                                : u.inviteEmail
                              : t("clanSettings.noEmail")}
                            {u.guestDiscordId && ` · Discord: ${u.guestDiscordName ?? t("clanSettings.linked")}`}
                          </span>
                        </span>
                        <span className={`${btnSecondary} shrink-0 group-open:!border-bit`}>
                          <span className="group-open:hidden">{t("clanSettings.edit")}</span>
                          <span className="hidden group-open:inline">{t("clanSettings.close")}</span>
                        </span>
                      </summary>
                      <div className="space-y-4 border-t border-line p-3 sm:p-4">
                        <GuestEditForm
                          action={updateGuest.bind(null, clanId, u.id)}
                          guest={{ firstName: u.firstName, lastName: u.lastName, nick, email: u.inviteEmail ?? "" }}
                          types={types.map((ty) => ({
                            id: ty.id,
                            name: ty.name,
                            nick: typeNicks.find((n) => n.userId === u.id && n.typeId === ty.id)?.nick ?? "",
                            lanId: accounts.find((a) => a.userId === u.id && a.typeId === ty.id)?.value ?? "",
                          }))}
                        />
                        <div className="space-y-1.5 border-t border-line pt-4">
                          <p className="text-xs text-muted">{t("clanSettings.claimLink")}</p>
                          <span className="flex flex-wrap items-center gap-1">
                            <CopyField value={`${appUrl}/claim/${u.claimCode}`} />
                            <form action={renewGuestLink.bind(null, clanId, u.id)}>
                              <button className={`${btnGhost} text-xs`}>{t("clanSettings.newLink")}</button>
                            </form>
                          </span>
                        </div>
                        <div className="space-y-1.5 border-t border-line pt-4">
                          <p className="text-xs text-muted">Discord</p>
                          <GuestDiscordLink
                            linked={!!u.guestDiscordId}
                            lines={guestDiscordLines(u, t)}
                            resend={resendGuestDiscordDm.bind(null, clanId, u.id)}
                            unlink={unlinkGuestDiscord.bind(null, clanId, u.id)}
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                          <Link href={`/clans/${slug}/members/${u.id}`} className="text-sm text-bit hover:underline">
                            {t("clanSettings.profileEvents")}
                          </Link>
                          <form action={deleteGuest.bind(null, clanId, u.id)}>
                            <button className={`${btnGhost} text-xs !text-danger`}>{t("clanSettings.removeGuest")}</button>
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
function LogTab({ t, clanId, slug, sp }: { t: T; clanId: string; slug: string; sp: Record<string, string | string[] | undefined> }) {
  const filter = parseAuditFilter(sp);
  const { rows, total, page, pages } = auditEntries({ clanId, lanId: filter.lan, group: filter.group, page: filter.page });
  return (
    <Card title={t("clanHeader.log")}>
      <p className="mb-4 text-sm text-muted">{t("clanSettings.logHint")}</p>
      <AuditLog
        t={t}
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
function RolesCard({ t }: { t: T }) {
  return (
    <Card title={t("clanSettings.roles")}>
      <dl className="space-y-2.5 text-sm">
        {MEMBER_ROLES.map((r) => (
          <div key={r}>
            <dt className="font-medium">{t(`roles.${r}`)}</dt>
            <dd className="text-muted">{t(`roleInfo.${r}`)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-faint">{t("clanSettings.rolesFoot")}</p>
    </Card>
  );
}

function maskEmail(e: string) {
  const [local, domain] = e.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain ?? ""}`;
}
