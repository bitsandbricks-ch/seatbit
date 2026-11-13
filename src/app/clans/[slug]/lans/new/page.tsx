import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, Columns, Page, PageHeader, Segmented } from "@/components/ui";
import { LanForm } from "@/components/lan-form";
import { toInputValue } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";
import { clanCan, getClanBySlug, myClans } from "@/lib/clans";
import { ClanAvatar } from "@/components/clan-avatar";
import { notFound, redirect } from "next/navigation";

export default async function NewLanPage({ params, searchParams }: PageProps<"/clans/[slug]/lans/new">) {
  const { slug } = await params;
  const me = await requireUser();
  const t = await getT();
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
  const ty =
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
  // The LAN type's usual length and answer deadline (defaults: 46 h, 30 days before).
  const end = new Date(start.getTime() + (ty?.durationHours ?? 46) * 3600_000);
  const answerDays = ty ? ty.answerDaysBefore : 30;
  const deadline = answerDays == null ? null : new Date(start.getTime() - answerDays * 86_400_000);
  deadline?.setHours(23, 59, 0, 0);
  return (
    <Page>
      <PageHeader
        back={{ href: `/clans/${c.slug}`, label: c.name }}
        title={t("home.newEvent")}
        subtitle={t("newEvent.subtitle")}
      />
      <Columns>
      <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">{t("newEvent.clan")}</p>
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
        <p className="mt-2 text-xs text-muted">{t("newEvent.clanHint")}</p>
      </div>
      {types.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">{t("newEvent.startFrom")}</span>
          <Segmented
            label={t("newEvent.startFrom")}
            value={ty?.id ?? "blank"}
            options={[
              ...types.map((x) => ({ id: x.id, label: x.name, href: `/clans/${c.slug}/lans/new?type=${x.id}` })),
              { id: "blank", label: t("newEvent.blank"), href: `/clans/${c.slug}/lans/new` },
            ]}
          />
        </div>
      )}
      <Card>
        <LanForm
          key={ty?.id ?? "blank"}
          types={types}
          values={{
            clanId: c.id,
            typeId: ty?.id ?? "",
            name: ty ? `${ty.name} ${start.getFullYear()}` : "",
            description: ty?.description ?? "",
            location: ty?.location ?? "",
            websiteUrl: ty?.websiteUrl ?? "",
            ticketUrl: ty?.ticketUrl ?? "",
            startsAt: toInputValue(start),
            endsAt: toInputValue(end),
            signupDeadline: toInputValue(deadline),
            paymentDueDate: "",
            price: ty?.price ?? "",
            capacity: ty?.capacity?.toString() ?? "",
            reminderDays: ty?.reminderDays ?? 3,
          }}
        />
        {ty?.seatSpec && (
          <p className="mt-4 text-xs text-muted">{t("newEvent.seats", { seats: ty.seatSpec, type: ty.name })}</p>
        )}
      </Card>
      </Columns>
    </Page>
  );
}
