import { asc, eq, inArray } from "drizzle-orm";
import { myClans } from "@/lib/clans";
import { db, schema } from "@/db";
import { sendTestDm, updateProfile } from "@/app/actions";
import { LinkedAccounts } from "@/components/linked-accounts";
import { NickManager } from "@/components/nick-manager";
import { LanIdForm } from "@/components/lan-id-form";
import { pickLanAccount } from "@/lib/lan-accounts";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, Field, Input, btnPrimary, btnSecondary } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { AppearanceForm } from "@/components/appearance-form";
import { PROFILE_COLORS, PROFILE_ICONS, avatarData, initialsOf, userColor } from "@/lib/avatars";
import { enabledProviders } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { missingServers } from "@/lib/discord-invite";

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
  const clanIds = myClans(me.id).map((c) => c.clan.id);
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
  const joinServers =
    dmParam === "cant_dm" ? (await Promise.all(clanIds.map((id) => missingServers(me.id, id)))).flat() : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Avatar data={avatarData(me)} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{defaultNick || me.name}</h1>
          <p className="truncate text-sm text-muted">
            {me.name} · {me.email}
          </p>
        </div>
      </div>

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
              <span className="block text-xs text-muted">Deadlines, tickets and the day before a LAN, sent to {me.email}.</span>
            </span>
          </label>
          <input type="hidden" name="discordDmsShown" value="1" />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="discordDms" defaultChecked={me.discordDms} className="mt-0.5 accent-bit" />
            <span>
              Send me Discord DMs when something changes for me: seat, seat plan, event details, reminders, clan
              requests
              {!hasDiscord && <span className="block text-xs text-faint">Link Discord below to get them.</span>}
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

      {types.length > 0 && (
        <Card title="Nicks and IDs per LAN type">
          <p className="mb-4 text-sm text-muted">
            One nick per LAN type, used for every event of that type. Leave it empty to use your nickname. Below it,
            optionally your user ID or ticket number at that LAN (e.g. on lal.gg), so the orgas can match you up.
          </p>
          <div className="space-y-5">
            {types.map((t) => (
              <div key={t.id}>
                <h3 className="mb-2 text-sm font-medium text-fg">{t.name}</h3>
                <NickManager nicks={nicks} typeId={t.id} />
                <div className="mt-2">
                  <LanIdForm value={pickLanAccount(lanIds, { id: "", typeId: t.id })} typeId={t.id} label={`${t.name} ID`} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Sign-in methods">
        <LinkedAccounts linked={accounts.map((a) => a.providerId)} available={enabledProviders()} />
      </Card>

      <div className="sm:hidden">
        <SignOutButton className={`${btnSecondary} w-full`} />
      </div>
    </div>
  );
}
