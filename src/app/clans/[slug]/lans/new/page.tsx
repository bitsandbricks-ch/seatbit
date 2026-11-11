import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card } from "@/components/ui";
import { LanForm } from "@/components/lan-form";
import { toInputValue } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { canManageClan, getClanBySlug } from "@/lib/clans";
import { notFound, redirect } from "next/navigation";

export default async function NewLanPage({ params, searchParams }: PageProps<"/clans/[slug]/lans/new">) {
  const { slug } = await params;
  const me = await requireUser();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!canManageClan(me, c.id)) redirect(`/clans/${slug}`);
  const { type } = await searchParams;
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New event for {c.name}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          An event the group wants to go to. Start from a LAN type to fill in its usual details and seats.
        </p>
      </div>
      {types.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Start from:</span>
          {types.map((x) => (
            <Link
              key={x.id}
              href={`/clans/${c.slug}/lans/new?type=${x.id}`}
              className={`rounded-full border px-3 py-1 ${x.id === t?.id ? "border-bit text-bit" : "border-line text-zinc-300 hover:border-zinc-500"}`}
            >
              {x.name}
            </Link>
          ))}
          <Link href={`/clans/${c.slug}/lans/new`} className="text-zinc-500 hover:text-zinc-300">
            blank
          </Link>
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
          <p className="mt-4 text-xs text-zinc-500">Seats {t.seatSpec} will be set up from the {t.name} type.</p>
        )}
      </Card>
    </div>
  );
}
