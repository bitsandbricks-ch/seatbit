import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, Columns, Page, PageHeader, Segmented } from "@/components/ui";
import { LanForm } from "@/components/lan-form";
import { toInputValue } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { clanCan, getClanBySlug, myClans } from "@/lib/clans";
import { ClanAvatar } from "@/components/clan-avatar";
import { notFound, redirect } from "next/navigation";

export default async function NewLanPage({ params, searchParams }: PageProps<"/clans/[slug]/lans/new">) {
  const { slug } = await params;
  const me = await requireUser();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!clanCan(me, c.id, "events")) redirect(`/clans/${slug}`);
  const { type } = await searchParams;
  // Clans this user can create events for, so they can switch here instead of going back.
  const managed = myClans(me.id).filter((m) => clanCan(me, m.clan.id, "events"));
  const types = db
    .select()
    .from(schema.lanType)
    .where(eq(schema.lanType.clanId, c.id))
    .orderBy(asc(schema.lanType.name))
    .all();
  const t =
    typeof type === "string"
      ? db
          .select()
          .from(schema.lanType)
          .where(and(eq(schema.lanType.id, type), eq(schema.lanType.clanId, c.id)))
          .get()
      : undefined;

  const start = new Date();
  start.setDate(start.getDate() + 30);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  end.setHours(14);
  const deadline = new Date(start);
  deadline.setDate(deadline.getDate() - 14);
  return (
    <Page>
      <PageHeader
        back={{ href: `/clans/${c.slug}`, label: c.name }}
        title="New event"
        subtitle="An event the group wants to go to. Start from a LAN type to fill in its usual details and seats."
      />
      <Columns>
      <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">Clan</p>
        {managed.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {managed.map(({ clan: x }) => (
              <Link
                key={x.id}
                href={`/clans/${x.slug}/lans/new`}
                aria-current={x.id === c.id ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm ${x.id === c.id ? "border-bit bg-bit-soft text-fg" : "border-line text-muted hover:text-fg"}`}
              >
                <ClanAvatar clan={x} size={24} /> {x.name}
              </Link>
            ))}
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm">
            <ClanAvatar clan={c} size={24} /> <span className="font-medium">{c.name}</span>
          </span>
        )}
        <p className="mt-2 text-xs text-muted">
          The event belongs to this clan: only its members see it, and its admins and the event&apos;s orgas manage it.
        </p>
      </div>
      {types.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">Start from</span>
          <Segmented
            label="Start from"
            value={t?.id ?? "blank"}
            options={[
              ...types.map((x) => ({ id: x.id, label: x.name, href: `/clans/${c.slug}/lans/new?type=${x.id}` })),
              { id: "blank", label: "Blank", href: `/clans/${c.slug}/lans/new` },
            ]}
          />
        </div>
      )}
      <Card>
        <LanForm
          key={t?.id ?? "blank"}
          types={types}
          values={{
            clanId: c.id,
            typeId: t?.id ?? "",
            name: t ? `${t.name} ${start.getFullYear()}` : "",
            description: t?.description ?? "",
            location: t?.location ?? "",
            websiteUrl: t?.websiteUrl ?? "",
            ticketUrl: t?.ticketUrl ?? "",
            startsAt: toInputValue(start),
            endsAt: toInputValue(end),
            signupDeadline: toInputValue(deadline),
            paymentDueDate: "",
            price: t?.price ?? "",
            capacity: t?.capacity?.toString() ?? "",
            reminderDays: t?.reminderDays ?? 3,
          }}
        />
        {t?.seatSpec && (
          <p className="mt-4 text-xs text-muted">Seats {t.seatSpec} will be set up from the {t.name} type.</p>
        )}
      </Card>
      </Columns>
    </Page>
  );
}
