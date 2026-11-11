import { Card } from "@/components/ui";
import { LanForm } from "@/components/lan-form";
import { toInputValue } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export default async function NewLanPage() {
  await requireAdmin();
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
        <p className="mt-1 text-sm text-zinc-400">A LAN party the group wants to go to. You can change everything later.</p>
      </div>
      <Card>
        <LanForm
          values={{
            name: "",
            description: "",
            location: "",
            websiteUrl: "",
            ticketUrl: "",
            startsAt: toInputValue(start),
            endsAt: toInputValue(end),
            signupDeadline: toInputValue(deadline),
            paymentDueDate: "",
            price: "",
            capacity: "",
            reminderDays: 3,
            seatRows: 4,
            seatCols: 8,
            seatingOpen: true,
          }}
        />
      </Card>
    </div>
  );
}
