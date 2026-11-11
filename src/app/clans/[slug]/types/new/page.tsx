import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { LanTypeForm } from "@/components/lan-type-form";
import { canManageClan, getClanBySlug } from "@/lib/clans";
import { requireUser } from "@/lib/session";

export default async function NewLanTypePage({ params }: PageProps<"/clans/[slug]/types/new">) {
  const { slug } = await params;
  const me = await requireUser();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!canManageClan(me, c.id)) redirect(`/clans/${slug}`);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Add a LAN type</h1>
      <Card>
        <LanTypeForm
          values={{
            clanId: c.id,
            name: "",
            description: "",
            location: "",
            websiteUrl: "",
            ticketUrl: "",
            price: "",
            capacity: "",
            reminderDays: 3,
            seatSpec: "",
          }}
        />
      </Card>
    </div>
  );
}
