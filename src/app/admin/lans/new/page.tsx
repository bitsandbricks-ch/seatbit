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
      <h1 className="text-2xl font-bold">New LAN</h1>
      <Card>
        <LanForm
          values={{
            name: "",
            description: "",
            location: "",
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
