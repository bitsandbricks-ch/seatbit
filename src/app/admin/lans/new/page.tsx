import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card } from "@/components/ui";
import { LanForm } from "@/components/lan-form";
import { toInputValue } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export default async function NewLanPage({ searchParams }: PageProps<"/admin/lans/new">) {
  await requireAdmin();
  const { type } = await searchParams;
  const types = db.select().from(schema.lanType).orderBy(asc(schema.lanType.name)).all();
  const t =
    typeof type === "string" ? db.select().from(schema.lanType).where(eq(schema.lanType.id, type)).get() : undefined;

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
        <h1 className="text-2xl font-bold">Add a LAN</h1>
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
              href={`/admin/lans/new?type=${x.id}`}
              className={`rounded-full border px-3 py-1 ${x.id === t?.id ? "border-bit text-bit" : "border-line text-zinc-300 hover:border-zinc-500"}`}
            >
              {x.name}
            </Link>
          ))}
          <Link href="/admin/lans/new" className="text-zinc-500 hover:text-zinc-300">
            blank
          </Link>
        </div>
      )}
      <Card>
        <LanForm
          key={t?.id ?? "blank"}
          types={types}
          values={{
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
