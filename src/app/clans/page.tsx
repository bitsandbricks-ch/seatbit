import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { joinClan } from "@/app/clan-actions";
import { ClanAvatar } from "@/components/clan-avatar";
import { ClanForm } from "@/components/clan-form";
import { Card, Pill, btnPrimary, btnSecondary } from "@/components/ui";
import { requireUser } from "@/lib/session";

export default async function ClansPage() {
  const me = await requireUser();
  const clans = db.select().from(schema.clan).orderBy(asc(schema.clan.name)).all();
  const memberships = db.select().from(schema.clanMember).all();
  const mine = new Map(memberships.filter((m) => m.userId === me.id).map((m) => [m.clanId, m.role]));
  const count = (id: string) => memberships.filter((m) => m.clanId === id && m.role !== "pending").length;

  const myClans = clans.filter((c) => mine.get(c.id) && mine.get(c.id) !== "pending");
  const others = clans.filter((c) => !myClans.includes(c));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Clans</h1>

      {myClans.length > 0 && (
        <Card title="Your clans">
          <ul className="space-y-2">
            {myClans.map((c) => (
              <li key={c.id}>
                <Link href={`/clans/${c.slug}`} className="flex items-center gap-3 rounded-md p-2 hover:bg-zinc-800/60">
                  <ClanAvatar clan={c} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="text-xs text-zinc-500">{count(c.id)} members</span>
                  </span>
                  {mine.get(c.id) === "admin" && <Pill tone="emerald">admin</Pill>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {others.length > 0 && (
        <Card title="Other clans">
          <ul className="space-y-2">
            {others.map((c) => {
              const pending = mine.get(c.id) === "pending";
              return (
                <li key={c.id} className="flex items-center gap-3 p-2">
                  <ClanAvatar clan={c} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="text-xs text-zinc-500">{count(c.id)} members</span>
                  </span>
                  {pending ? (
                    <Pill tone="amber">Request sent</Pill>
                  ) : c.joinPolicy === "invite" ? (
                    <Pill>Invite only</Pill>
                  ) : (
                    <form action={joinClan.bind(null, c.id)}>
                      <button className={c.joinPolicy === "open" ? btnPrimary : btnSecondary}>
                        {c.joinPolicy === "open" ? "Join" : "Ask to join"}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card title="Start a clan">
        <p className="mb-4 text-sm text-zinc-400">You become its admin and can invite your friends.</p>
        <ClanForm />
      </Card>
    </div>
  );
}
