import { Card } from "@/components/ui";
import { LanTypeForm } from "@/components/lan-type-form";
import { requireAdmin } from "@/lib/session";

export default async function NewLanTypePage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Add a LAN type</h1>
      <Card>
        <LanTypeForm
          values={{
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
