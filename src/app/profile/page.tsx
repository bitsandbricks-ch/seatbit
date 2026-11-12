import { asc, eq, inArray } from "drizzle-orm";
import { myClans } from "@/lib/clans";
import { db, schema } from "@/db";
import { sendTestDm, updateProfile } from "@/app/actions";
import { LinkedAccounts } from "@/components/linked-accounts";
import { NickManager } from "@/components/nick-manager";
import { LanIdForm } from "@/components/lan-id-form";
import { pickLanAccount } from "@/lib/lan-accounts";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, Columns, Field, Input, Page, PageHeader, btnPrimary, btnSecondary } from "@/components/ui";
import { enabledProviders } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { Avatar } from "@/components/avatar";
import { AppearanceForm } from "@/components/appearance-form";
import { PROFILE_COLORS, PROFILE_ICONS, avatarData, initialsOf, userColor } from "@/lib/avatars";
import { missingServers } from "@/lib/discord-invite";
import { personLabel } from "@/lib/names";
import { InterestsForm } from "@/components/event-extras";
import { YourData } from "@/components/delete-account";
import { checkDeletion } from "@/lib/account";
import { SocialsForm } from "@/components/socials";
import { profileLink } from "@/lib/profile-link";

const DM_RESULT: Record<string, string> = {
  ok: "Test DM sent. Check your Discord DMs from the Seatbit bot.",
  dms_off: "Discord DMs are off. Tick the box above and save first.",
  guest: "Guest profiles can't get DMs.",
  bot_not_set_up: "The Discord bot isn't set up yet (bot token or application ID missing in the platform settings).",
  no_discord: "Your profile isn't linked to Discord. Link it under sign-in methods below.",
  cant_dm:
    "Discord refused the DM. The bot can only DM you if you share a server with it and that server allows DMs from members (Discord: server name → Privacy Settings → Direct Messages).",
  error: "The DM failed for another reason. The server log has the details.",
};

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const me = await requireUser();
  const dmParam = (await searchParams).dm;
  const dmResult = typeof dmParam === "string" ? DM_RESULT[dmParam] : undefined;
  const nicks = db.select().from(schema.nickname).where(eq(schema.nickname.userId, me.id)).all();
  const lanIds = db.select().from(schema.lanAccount).where(eq(schema.lanAccount.userId, me.id)).all();
  const defaultNick = nicks.find((n) => !n.lanId && !n.typeId)?.nick ?? "";
  const memberships = db.select().from(schema.clanMember).where(eq(schema.clanMember.userId, me.id)).all();
  const myClanList = myClans(me.id);
  const clanIds = myClanList.map((c) => c.clan.id);
  const types = clanIds.length
    ? db.select().from(schema.lanType).where(inArray(schema.lanType.clanId, clanIds)).orderBy(asc(schema.lanType.name)).all()
    : [];
  const accounts = db
    .select({ providerId: schema.account.providerId })
    .from(schema.account)
    .where(eq(schema.account.userId, me.id))
    .all();
  const hasDiscord = accounts.some((a) => a.providerId === "discord");
  // After a refused test DM: the clan servers they're not on, with invites.
  const deletion = checkDeletion(me.id);
  const joinServers =
    dmParam === "cant_dm" ? (await Promise.all(clanIds.map((id) => missingServers(me.id, id)))).flat() : [];

  return (
    <Page>
      <PageHeader
        avatar={<Avatar data={avatarData(me)} size={56} />}
        title={personLabel(me, defaultNick)}
        subtitle={
          <span className="block truncate">
            {me.email}
          </span>
        }
      />
      <Columns
        aside={
          <>
            <Card title="Sign-in methods">
              <LinkedAccounts linked={accounts.map((a) => a.providerId)} available={enabledProviders()} />
            </Card>
            <Card title="Your data">
              <YourData
                blockingClans={deletion.blockingClans.map((c) => ({ name: c.name, slug: c.slug }))}
                clansToDelete={deletion.clansToDelete.map((c) => c.name)}
                lastPlatformAdmin={deletion.lastPlatformAdmin}
                upcomingEvents={deletion.upcomingEvents}
              />
            </Card>
            <div className="sm:hidden">
              <SignOutButton className={`${btnSecondary} w-full`} />
            </div>
          </>
        }
      >
      <Card title="Account">
        <form action={updateProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <Input name="firstName" defaultValue={me.firstName} required maxLength={40} autoComplete="given-name" />
            </Field>
            <Field label="Surname">
              <Input name="lastName" defaultValue={me.lastName} required maxLength={40} autoComplete="family-name" />
            </Field>
          </div>
          <Field label="Nickname" hint="Your gamer tag, shown at every LAN unless you set a nick for that LAN type below.">
            <Input name="nick" defaultValue={defaultNick} maxLength={32} autoComplete="nickname" />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-raised/40 p-3 text-sm">
            <input type="checkbox" name="emailReminders" defaultChecked={me.emailReminders} className="mt-0.5" />
            <span>
              Email reminders
              <span className="block text-xs text-muted">
                New events, orga news, deadlines, tickets and the day before a LAN, sent to {me.email}.
              </span>
            </span>
          </label>
          <input type="hidden" name="discordDmsShown" value="1" />
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-raised/40 p-3 text-sm">
            <input type="checkbox" name="discordDms" defaultChecked={me.discordDms} className="mt-0.5" />
            <span>
              Discord DMs
              <span className="block text-xs text-muted">
                When something changes for me: seat, seat plan, event details, reminders, clan requests.
                {!hasDiscord && " Link Discord under Sign-in methods to get them."}
              </span>
            </span>
          </label>
          <button className={btnPrimary}>Save</button>
        </form>
        {hasDiscord && me.discordDms && (
          <form action={sendTestDm} id="dms" className="mt-4 space-y-2 border-t border-line pt-4">
            <button className={btnSecondary}>Send me a test DM</button>
            {dmResult && <p className={`text-sm ${dmParam === "ok" ? "text-bit" : "text-muted"}`}>{dmResult}</p>}
            {joinServers.length > 0 && (
              <p className="text-sm text-muted">
                Your clan&apos;s servers you&apos;re not on:{" "}
                {joinServers.map((g, i) => (
                  <span key={g.guildId}>
                    {i > 0 && ", "}
                    {g.inviteUrl ? (
                      <a href={g.inviteUrl} className="text-bit underline" target="_blank" rel="noreferrer">
                        {g.guildName}
                      </a>
                    ) : (
                      g.guildName
                    )}
                  </span>
                ))}
              </p>
            )}
          </form>
        )}
      </Card>

      <Card title="Avatar & colour">
        <AppearanceForm
          initial={{ style: me.avatarStyle, color: userColor(me), icon: me.icon }}
          colors={PROFILE_COLORS}
          icons={PROFILE_ICONS}
          picture={avatarData({ ...me, avatarStyle: "picture" }).src}
          hasUpload={!!me.avatarFile}
          initials={initialsOf(me)}
          name={defaultNick || me.name}
        />
      </Card>

      <Card title="Socials">
        <p className="mb-4 text-sm text-muted">
          Your gaming and social accounts, so the others can add you. Members of your clans see them on your profile.
        </p>
        <SocialsForm values={me.socials ?? {}} />
      </Card>

      {types.length > 0 && (
        <Card title="Events I hear about">
          <p className="mb-4 text-sm text-muted">
            Who gets a message when a new event is published. Pick the kinds of LANs you care about, per clan.
          </p>
          <div className="space-y-5">
            {myClanList
              .filter((c) => types.some((t) => t.clanId === c.clan.id))
              .map((c) => (
                <div key={c.clan.id}>
                  {myClanList.length > 1 && <h3 className="mb-2 text-sm font-medium text-fg">{c.clan.name}</h3>}
                  <InterestsForm
                    clanId={c.clan.id}
                    types={types.filter((t) => t.clanId === c.clan.id).map((t) => ({ id: t.id, name: t.name }))}
                    current={memberships.find((m) => m.clanId === c.clan.id)?.interestTypes ?? null}
                  />
                </div>
              ))}
          </div>
        </Card>
      )}

      {types.length > 0 && (
        <Card title="Nicks and IDs per LAN type">
          <p className="mb-4 text-sm text-muted">
            One nick per LAN type, used for every event of that type. Leave it empty to use your nickname. Below it,
            optionally your user ID or ticket number at that LAN (e.g. on lal.gg), so the orgas can match you up. Where
            the LAN type has a profile link, your clan sees the link to your profile on the event&apos;s site.
          </p>
          <div className="space-y-5">
            {types.map((t) => (
              <div key={t.id}>
                <h3 className="mb-2 text-sm font-medium text-fg">{t.name}</h3>
                <NickManager nicks={nicks} typeId={t.id} />
                <div className="mt-2">
                  <LanIdForm value={pickLanAccount(lanIds, { id: "", typeId: t.id })} typeId={t.id} label={`${t.name} ID`} />
                </div>
                <ProfileLinkHint url={profileLink(t.profileUrl, pickLanAccount(lanIds, { id: "", typeId: t.id }))} pattern={t.profileUrl} />
              </div>
            ))}
          </div>
        </Card>
      )}

      </Columns>
    </Page>
  );
}

/** Under a LAN ID: the profile link it builds, or that the LAN type has one. */
function ProfileLinkHint({ url, pattern }: { url: string | null; pattern: string }) {
  if (!pattern) return null;
  return (
    <p className="mt-1.5 truncate text-xs text-muted">
      {url ? (
        <>
          Your profile:{" "}
          <a href={url} target="_blank" rel="noreferrer" className="text-bit hover:underline">
            {url}
          </a>
        </>
      ) : (
        "Add your ID to link your profile on the event's site."
      )}
    </p>
  );
}
