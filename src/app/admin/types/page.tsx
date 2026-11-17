import Link from "next/link";
import { count, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, Page, PageHeader, btnPrimary } from "@/components/ui";
import { getT } from "@/i18n/server";
import { allTypes } from "@/lib/lan-types";
import { requirePlatform } from "@/lib/session";

export async function generateMetadata() {
  return { title: `${(await getT())("clanPage.links.types")} · Seatbit` };
}

/** The global LAN types every clan picks from. Platform staff with the "types" permission keep the list. */
export default async function AdminTypesPage() {
  await requirePlatform("types");
  const t = await getT();
  const types = allTypes();
  const clans = new Map(
    db
      .select({ id: schema.clanLanType.typeId, n: count() })
      .from(schema.clanLanType)
      .groupBy(schema.clanLanType.typeId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  const events = new Map(
    db
      .select({ id: schema.lan.typeId, n: count() })
      .from(schema.lan)
      .where(isNotNull(schema.lan.typeId))
      .groupBy(schema.lan.typeId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  return (
    <Page>
      <PageHeader
        title={t("clanPage.links.types")}
        subtitle={t("lanTypes.adminSubtitle")}
        actions={
          <Link href="/admin/types/new" className={btnPrimary}>
            {t("typeForm.add")}
          </Link>
        }
      />
      <Card>
        {types.length === 0 ? (
          <p className="text-sm text-muted">{t("clanSettings.noTypes")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {types.map((ty) => (
              <li key={ty.id}>
                <Link href={`/admin/types/${ty.id}`} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2 hover:text-bit">
                  <span className="min-w-0">
                    <span className="block font-medium">{ty.name}</span>
                    <span className="block truncate text-xs text-muted">{[ty.location, ty.price].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                  <span className="text-xs text-faint">
                    {t("lanTypes.usageClans", { count: clans.get(ty.id) ?? 0 })} · {t("lanTypes.usageEvents", { count: events.get(ty.id) ?? 0 })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
