import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteLanType } from "@/app/actions";
import { Card, btnDanger } from "@/components/ui";
import { LanTypeForm } from "@/components/lan-type-form";
import { requireAdmin } from "@/lib/session";

export default async function EditLanTypePage({ params }: PageProps<"/admin/types/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const t = db.select().from(schema.lanType).where(eq(schema.lanType.id, id)).get();
  if (!t) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t.name}</h1>
      <Card>
        <LanTypeForm values={{ ...t, capacity: t.capacity?.toString() ?? "" }} />
      </Card>
      <Card title="Delete type">
        <p className="mb-3 text-sm text-zinc-400">
          Events of this type are kept, but members&apos; nicks for this type are deleted.
        </p>
        <form action={deleteLanType.bind(null, t.id)}>
          <button className={btnDanger}>Delete {t.name}</button>
        </form>
      </Card>
    </div>
  );
}
