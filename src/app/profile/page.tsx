import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { updateProfile } from "@/app/actions";
import { LinkedAccounts } from "@/components/linked-accounts";
import { NickManager } from "@/components/nick-manager";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, Field, Input, btnPrimary } from "@/components/ui";
import { enabledProviders } from "@/lib/auth";
import { requireUser } from "@/lib/session";

export default async function ProfilePage() {
  const me = await requireUser();
  const nicks = db.select().from(schema.nickname).where(eq(schema.nickname.userId, me.id)).all();
  const types = db.select().from(schema.lanType).orderBy(asc(schema.lanType.name)).all();
  const accounts = db
    .select({ providerId: schema.account.providerId })
    .from(schema.account)
    .where(eq(schema.account.userId, me.id))
    .all();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Your profile</h1>

      <Card title="Account">
        <form action={updateProfile} className="space-y-4">
          <Field label="Name">
            <Input name="name" defaultValue={me.name} required maxLength={64} />
          </Field>
          <p className="text-sm text-zinc-400">Email: {me.email}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="emailReminders" defaultChecked={me.emailReminders} className="accent-bit" />
            Send me email reminders about deadlines, payments and upcoming LANs
          </label>
          <button className={btnPrimary}>Save</button>
        </form>
      </Card>

      <Card title="Default nick">
        <p className="mb-3 text-sm text-zinc-400">
          Shown at every LAN unless you set a nick for that LAN type below.
        </p>
        <NickManager nicks={nicks} />
      </Card>

      {types.length > 0 && (
        <Card title="Nicks per LAN type">
          <p className="mb-4 text-sm text-zinc-400">
            One nick per LAN type, used for every event of that type. Leave it empty to use your default nick.
          </p>
          <div className="space-y-5">
            {types.map((t) => (
              <div key={t.id}>
                <h3 className="mb-2 text-sm font-medium text-zinc-200">{t.name}</h3>
                <NickManager nicks={nicks} typeId={t.id} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="sm:hidden">
        <SignOutButton />
      </div>

      <Card title="Sign-in methods">
        <LinkedAccounts linked={accounts.map((a) => a.providerId)} available={enabledProviders()} />
      </Card>
    </div>
  );
}
