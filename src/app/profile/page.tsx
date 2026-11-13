import { DonorBadge } from "@/components/support-card";
import { isDonor } from "@/lib/donations";
import { asc, eq, inArray } from "drizzle-orm";
import { myClans } from "@/lib/clans";
import { db, schema } from "@/db";
import { sendTestDm, updateProfile } from "@/app/actions";
import { LinkedAccounts } from "@/components/linked-accounts";
import { NickManager } from "@/components/nick-manager";
import { LanIdForm } from "@/components/lan-id-form";
import { pickLanAccount } from "@/lib/lan-accounts";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, Columns, Field, Input, Page, PageHeader, btnPrimary, btnSecondary, halves } from "@/components/ui";
import { Tabs, type Tab } from "@/components/tabs";
import { NotificationsForm } from "@/components/notifications-form";
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
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";
import { LanguageSelect } from "@/components/language-switch";

const DM_RESULTS = ["ok", "dms_off", "guest", "bot_not_set_up", "no_discord", "cant_dm", "error"] as const;

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const me = await requireUser();
  const t = await getT();
  const sp = await searchParams;
  const dmParam = sp.dm;
  const dmKey = DM_RESULTS.find((k) => k === dmParam);
  const dmResult = dmKey ? t(`profile.dm.${dmKey}`) : undefined;
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

  const tabs: Tab[] = [
    { id: "account", label: t("profile.tabs.account") },
    { id: "look", label: t("profile.tabs.look") },
    ...(types.length > 0 ? [{ id: "lans", label: t("profile.tabs.lans") }] : []),
    { id: "socials", label: t("profile.tabs.socials") },
    { id: "notifications", label: t("profile.tabs.notifications") },
    { id: "data", label: t("profile.tabs.data") },
  ];
  const tab = tabs.find((x) => x.id === sp.tab)?.id ?? "account";

  return (
    <Page>
      <PageHeader
        avatar={<Avatar data={avatarData(me)} size={56} />}
        title={personLabel(me, defaultNick)}
        subtitle={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate">{me.email}</span>
            {isDonor(me.id) && <DonorBadge label={t("donate.badgeLabel")} title={t("donate.badgePerson")} />}
          </span>
        }
      />
      <Tabs tabs={tabs} active={tab} hrefFor={(id) => (id === "account" ? "/profile" : `/profile?tab=${id}`)} label={t("nav.yourProfile")} />

      {tab === "account" && (
        <Columns
          aside={
            <>
              <Card title={t("language.label")}>
                <LanguageSelect saved={me.locale} />
              </Card>
              <Card title={t("profile.signInMethods")}>
                <LinkedAccounts linked={accounts.map((a) => a.providerId)} available={enabledProviders()} />
              </Card>
              <div className="sm:hidden">
                <SignOutButton className={`${btnSecondary} w-full`} />
              </div>
            </>
          }
        >
          <Card title={t("profile.names")}>
            <form action={updateProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("auth.firstName")}>
                  <Input name="firstName" defaultValue={me.firstName} required maxLength={40} autoComplete="given-name" />
                </Field>
                <Field label={t("auth.surname")}>
                  <Input name="lastName" defaultValue={me.lastName} required maxLength={40} autoComplete="family-name" />
                </Field>
              </div>
              <Field label={t("auth.nickname")} hint={t("profile.nickHint")}>
                <Input name="nick" defaultValue={defaultNick} maxLength={32} autoComplete="nickname" />
              </Field>
              <button className={btnPrimary}>{t("common.save")}</button>
            </form>
          </Card>
        </Columns>
      )}

      {tab === "look" && (
        <Card title={t("profile.avatar")}>
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
      )}

      {tab === "lans" && (
        <Card title={t("profile.nicksPerType")}>
          <p className="mb-4 text-sm text-muted">{t("profile.nicksPerTypeIntro")}</p>
          <div className={halves}>
            {types.map((ty) => {
              const id = pickLanAccount(lanIds, { id: "", typeId: ty.id });
              return (
                <div key={ty.id} className="min-w-0 space-y-2 rounded-md border border-line bg-raised/40 p-3">
                  <h3 className="text-sm font-medium text-fg">{ty.name}</h3>
                  <NickManager nicks={nicks} typeId={ty.id} />
                  <LanIdForm value={id} typeId={ty.id} label={t("profile.typeId", { type: ty.name })} />
                  <ProfileLinkHint url={profileLink(ty.profileUrl, id)} pattern={ty.profileUrl} tr={t} />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tab === "socials" && (
        <Card title={t("profile.socials")}>
          <p className="mb-4 text-sm text-muted">{t("profile.socialsIntro")}</p>
          <SocialsForm values={me.socials ?? {}} />
        </Card>
      )}

      {tab === "notifications" && (
        <div className={halves}>
          <Card title={t("profile.messages")}>
            <NotificationsForm email={me.email} emailReminders={me.emailReminders} discordDms={me.discordDms} hasDiscord={hasDiscord} />
            {hasDiscord && me.discordDms && (
              <form action={sendTestDm} id="dms" className="mt-4 scroll-mt-32 space-y-2 border-t border-line pt-4">
                <button className={btnSecondary}>{t("profile.testDm")}</button>
                {dmResult && <p className={`text-sm ${dmParam === "ok" ? "text-bit" : "text-muted"}`}>{dmResult}</p>}
                {joinServers.length > 0 && (
                  <p className="text-sm text-muted">
                    {t.rich("profile.missingServers", {
                      servers: joinServers.map((g, i) => (
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
                      )),
                    })}
                  </p>
                )}
              </form>
            )}
          </Card>
          {types.length > 0 && (
            <Card title={t("profile.interests")}>
              <p className="mb-4 text-sm text-muted">{t("profile.interestsIntro")}</p>
              <div className="space-y-5">
                {myClanList
                  .filter((c) => types.some((ty) => ty.clanId === c.clan.id))
                  .map((c) => (
                    <div key={c.clan.id}>
                      {myClanList.length > 1 && <h3 className="mb-2 text-sm font-medium text-fg">{c.clan.name}</h3>}
                      <InterestsForm
                        clanId={c.clan.id}
                        types={types.filter((ty) => ty.clanId === c.clan.id).map((ty) => ({ id: ty.id, name: ty.name }))}
                        current={memberships.find((m) => m.clanId === c.clan.id)?.interestTypes ?? null}
                      />
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "data" && (
        <Columns>
          <Card title={t("profile.yourData")}>
            <YourData
              blockingClans={deletion.blockingClans.map((c) => ({ name: c.name, slug: c.slug }))}
              clansToDelete={deletion.clansToDelete.map((c) => c.name)}
              lastPlatformAdmin={deletion.lastPlatformAdmin}
              upcomingEvents={deletion.upcomingEvents}
            />
          </Card>
        </Columns>
      )}
    </Page>
  );
}

/** Under a LAN ID: the profile link it builds, or that the LAN type has one. */
function ProfileLinkHint({ url, pattern, tr }: { url: string | null; pattern: string; tr: T }) {
  if (!pattern) return null;
  return (
    <p className="mt-1.5 truncate text-xs text-muted">
      {url ? (
        tr.rich("profile.yourProfileLink", {
          url: (
            <a href={url} target="_blank" rel="noreferrer" className="text-bit hover:underline">
              {url}
            </a>
          ),
        })
      ) : (
        tr("profile.addIdForLink")
      )}
    </p>
  );
}
