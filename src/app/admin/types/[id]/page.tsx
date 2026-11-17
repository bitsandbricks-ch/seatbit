import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, Columns, Page, PageHeader, btnDanger } from "@/components/ui";
import { LanTypeForm } from "@/components/lan-type-form";
import { ActionForm } from "@/components/action-form";
import { ClanAvatar } from "@/components/clan-avatar";
import { deleteLanType } from "@/app/lan-type-actions";
import { getType } from "@/lib/lan-types";
import { requirePlatform } from "@/lib/session";
import { getT } from "@/i18n/server";

export default async function EditLanTypePage({ params }: PageProps<"/admin/types/[id]">) {
  const { id } = await params;
  await requirePlatform("types");
  const t = await getT();
  const ty = getType(id);
  if (!ty) notFound();
  const clans = db
    .select({ clan: schema.clan })
    .from(schema.clanLanType)
    .innerJoin(schema.clan, eq(schema.clan.id, schema.clanLanType.clanId))
    .where(eq(schema.clanLanType.typeId, ty.id))
    .orderBy(schema.clan.name)
    .all()
    .map((r) => r.clan);
  const events = db.select({ n: count() }).from(schema.lan).where(eq(schema.lan.typeId, ty.id)).get()?.n ?? 0;
  const nicks = db.select({ n: count() }).from(schema.nickname).where(eq(schema.nickname.typeId, ty.id)).get()?.n ?? 0;
  const deleteHint = t("lanTypes.deleteHint", { clans: clans.length, events, nicks });
  return (
    <Page>
      <PageHeader back={{ href: "/admin/types", label: t("clanPage.links.types") }} title={ty.name} />
      <Columns
        aside={
          <>
            <Card title={t("lanTypes.usedBy")}>
              {clans.length === 0 ? (
                <p className="text-sm text-muted">{t("lanTypes.usedByNone")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {clans.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <ClanAvatar clan={c} size={24} /> {c.name}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={t("typePage.delete")}>
              <p className="mb-3 text-sm text-muted">{deleteHint}</p>
              <ActionForm
                action={deleteLanType.bind(null, ty.id)}
                done="deleted"
                confirm={{ title: t("dialog.deleteTypeQ", { name: ty.name }), body: deleteHint, confirm: t("dialog.delete"), danger: true }}
              >
                <button className={btnDanger}>{t("typePage.deleteName", { name: ty.name })}</button>
              </ActionForm>
            </Card>
          </>
        }
      >
        <Card>
          <LanTypeForm values={ty} />
        </Card>
      </Columns>
    </Page>
  );
}
