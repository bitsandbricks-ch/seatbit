import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { joinClan } from "@/app/clan-actions";
import { ClanAvatar } from "@/components/clan-avatar";
import { ClanForm } from "@/components/clan-form";
import { Card, Columns, EmptyState, Page, PageHeader, Pill, btnPrimary, btnSecondary } from "@/components/ui";
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
    <Page>
      <PageHeader title="Clans" subtitle="Your clan sees its events together. Join one with an invite link from your orga, or start your own." />
      <Columns
        aside={
          <Card title="Start a clan">
            <p className="mb-4 text-sm text-muted">You become its admin and can invite your friends.</p>
            <ClanForm />
          </Card>
        }
      >
      {myClans.length === 0 && others.length === 0 && (
        <EmptyState icon="users" title="No clans yet">
          Start one, or ask your orga for an invite link.
        </EmptyState>
      )}
      {myClans.length > 0 && (
        <Card title="Your clans">
          <ul className="space-y-2">
            {myClans.map((c) => (
              <li key={c.id} className="-mx-2 flex items-center gap-2">
                <Link href={`/clans/${c.slug}`} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md p-2 transition hover:bg-raised">
                  <ClanAvatar clan={c} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="text-xs text-muted">{count(c.id)} members</span>
                  </span>
                  {mine.get(c.id) === "admin" && <Pill tone="emerald">admin</Pill>}
                </Link>
                {mine.get(c.id) === "admin" && (
                  <Link href={`/clans/${c.slug}/settings`} className={`${btnSecondary} shrink-0 !text-bit`}>
                    Manage
                  </Link>
                )}
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
                <li key={c.id} className="-mx-2 flex min-h-14 items-center gap-3 p-2">
                  <ClanAvatar clan={c} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="text-xs text-muted">{count(c.id)} members</span>
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

      </Columns>
    </Page>
  );
}
