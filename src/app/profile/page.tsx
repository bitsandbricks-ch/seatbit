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
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";
import { LanguageSelect } from "@/components/language-switch";

const DM_RESULTS = ["ok", "dms_off", "guest", "bot_not_set_up", "no_discord", "cant_dm", "error"] as const;

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const me = await requireUser();
  const t = await getT();
  const dmParam = (await searchParams).dm;
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
            <Card title={t("profile.signInMethods")}>
              <LinkedAccounts linked={accounts.map((a) => a.providerId)} available={enabledProviders()} />
            </Card>
            <Card title={t("profile.yourData")}>
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
      <Card title={t("profile.account")}>
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
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-raised/40 p-3 text-sm">
            <input type="checkbox" name="emailReminders" defaultChecked={me.emailReminders} className="mt-0.5" />
            <span>
              {t("profile.emailReminders")}
              <span className="block text-xs text-muted">{t("profile.emailRemindersHint", { email: me.email })}</span>
            </span>
          </label>
          <input type="hidden" name="discordDmsShown" value="1" />
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-raised/40 p-3 text-sm">
            <input type="checkbox" name="discordDms" defaultChecked={me.discordDms} className="mt-0.5" />
            <span>
              {t("profile.discordDms")}
              <span className="block text-xs text-muted">
                {t("profile.discordDmsHint")}
                {!hasDiscord && ` ${t("profile.discordDmsLink")}`}
              </span>
            </span>
          </label>
          <button className={btnPrimary}>{t("common.save")}</button>
        </form>
        <div className="mt-4 border-t border-line pt-4">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">{t("language.label")}</span>
          <LanguageSelect saved={me.locale} />
        </div>
        {hasDiscord && me.discordDms && (
          <form action={sendTestDm} id="dms" className="mt-4 space-y-2 border-t border-line pt-4">
            <button className={btnSecondary}>{t("profile.testDm")}</button>
            {dmResult && <p className={`text-sm ${dmParam === "ok" ? "text-bit" : "text-muted"}`}>{dmResult}</p>}
            {joinServers.length > 0 && (
              <p className="text-sm text-muted">
                {t.rich("profile.missingServers", { servers: joinServers.map((g, i) => (
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
                )) })}
              </p>
            )}
          </form>
        )}
      </Card>

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

      <Card title={t("profile.socials")}>
        <p className="mb-4 text-sm text-muted">{t("profile.socialsIntro")}</p>
        <SocialsForm values={me.socials ?? {}} />
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

      {types.length > 0 && (
        <Card title={t("profile.nicksPerType")}>
          <p className="mb-4 text-sm text-muted">{t("profile.nicksPerTypeIntro")}</p>
          <div className="space-y-5">
            {types.map((ty) => (
              <div key={ty.id}>
                <h3 className="mb-2 text-sm font-medium text-fg">{ty.name}</h3>
                <NickManager nicks={nicks} typeId={ty.id} />
                <div className="mt-2">
                  <LanIdForm value={pickLanAccount(lanIds, { id: "", typeId: ty.id })} typeId={ty.id} label={t("profile.typeId", { type: ty.name })} />
                </div>
                <ProfileLinkHint url={profileLink(ty.profileUrl, pickLanAccount(lanIds, { id: "", typeId: ty.id }))} pattern={ty.profileUrl} tr={t} />
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
