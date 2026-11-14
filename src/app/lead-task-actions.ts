"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { lanChanged } from "@/lib/live";
import { db, schema } from "@/db";
import type { LeadTask } from "@/db/schema";
import { tr } from "@/i18n/server";
import { auditLan } from "@/lib/audit";
import { getLan } from "@/lib/lans";
import { LEAD_STEP_DEPS } from "@/lib/lead-checklist";
import { isLanManager, requireClanPermission, requireLanManager } from "@/lib/session";
import type { FormState } from "./actions";

const { leadTask, leadContact, lanTask, lanType } = schema;

const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);

/** Who may change a to-do: event to-dos the event's leads, the others clan event managers. */
async function requireTaskEditor(scope: { clanId: string; lanId?: string | null }) {
  return scope.lanId ? requireLanManager(scope.lanId) : requireClanPermission(scope.clanId, "events");
}

function revalidateTasks() {
  revalidatePath("/clans", "layout");
  revalidatePath("/lans", "layout");
}

/** True when `from` (directly or through other to-dos) waits for `target`. */
function waitsFor(from: string, target: string, all: Map<string, LeadTask>, seen = new Set<string>()): boolean {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  const x = all.get(from);
  return !!x?.after.some((d) => d.startsWith("task:") && waitsFor(d.slice(5), target, all, seen));
}

export async function saveLeadTask(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id") || null;
  const existing = id ? db.select().from(leadTask).where(eq(leadTask.id, id)).get() : undefined;
  if (id && !existing) return { error: await tr("errors.taskGone") };
  let scope: { clanId: string; typeId: string | null; lanId: string | null };
  if (existing) scope = { clanId: existing.clanId, typeId: existing.typeId, lanId: existing.lanId };
  else {
    const lanId = str(fd, "lanId") || null;
    const typeId = str(fd, "typeId") || null;
    if (lanId) {
      const l = getLan(lanId);
      if (!l?.clanId) return { error: await tr("errors.taskGone") };
      scope = { clanId: l.clanId, typeId: null, lanId };
    } else if (typeId) {
      const ty = db.select().from(lanType).where(eq(lanType.id, typeId)).get();
      if (!ty?.clanId) return { error: await tr("errors.taskGone") };
      scope = { clanId: ty.clanId, typeId, lanId: null };
    } else scope = { clanId: str(fd, "clanId"), typeId: null, lanId: null };
  }
  await requireTaskEditor(scope);

  const title = str(fd, "title");
  if (!title) return { error: await tr("errors.taskTitle") };
  const all = new Map(db.select().from(leadTask).where(eq(leadTask.clanId, scope.clanId)).all().map((x) => [x.id, x]));
  const after = [...new Set(fd.getAll("after").map(String))].filter((d) => {
    if ((LEAD_STEP_DEPS as readonly string[]).includes(d)) return true;
    if (!d.startsWith("task:")) return false;
    const other = all.get(d.slice(5));
    // Only to-dos of the same clan, never one that already waits for this one (it would never open).
    return !!other && (!id || !waitsFor(other.id, id, all));
  });
  const dueRaw = str(fd, "dueDays", 5);
  const due = dueRaw === "" ? null : Math.max(-365, Math.min(365, Math.round(Number(dueRaw))));
  const contactId = str(fd, "contactId") || null;
  const found = contactId ? db.select().from(leadContact).where(eq(leadContact.id, contactId)).get() : undefined;
  // Only a contact of one of this clan's LAN types.
  const contactClan = found ? db.select({ clanId: lanType.clanId }).from(lanType).where(eq(lanType.id, found.typeId)).get()?.clanId : null;
  const contact = found && contactClan === scope.clanId ? found : undefined;
  const values = {
    title,
    note: str(fd, "note", 2000),
    after,
    dueDays: due != null && Number.isFinite(due) ? due : null,
    contactId: contact ? contact.id : null,
  };
  if (existing) db.update(leadTask).set(values).where(eq(leadTask.id, existing.id)).run();
  else db.insert(leadTask).values({ ...scope, ...values, sort: all.size }).run();
  revalidateTasks();
  return { ok: true };
}

export async function deleteLeadTask(id: string) {
  const x = db.select().from(leadTask).where(eq(leadTask.id, id)).get();
  if (!x) return;
  await requireTaskEditor(x);
  db.delete(leadTask).where(eq(leadTask.id, id)).run();
  // Others that waited for it open up instead of staying locked forever.
  for (const o of db.select().from(leadTask).where(eq(leadTask.clanId, x.clanId)).all()) {
    if (o.after.includes(`task:${id}`)) db.update(leadTask).set({ after: o.after.filter((d) => d !== `task:${id}`) }).where(eq(leadTask.id, o.id)).run();
  }
  revalidateTasks();
}

export async function setClanLeadTasks(typeId: string, fd: FormData) {
  const ty = db.select().from(lanType).where(eq(lanType.id, typeId)).get();
  if (!ty?.clanId) return;
  await requireClanPermission(ty.clanId, "events");
  db.update(lanType).set({ clanLeadTasks: fd.get("on") === "on" }).where(eq(lanType.id, typeId)).run();
  revalidateTasks();
}

// ---------------- Organizer contacts ----------------

export async function saveLeadContact(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id") || null;
  const existing = id ? db.select().from(leadContact).where(eq(leadContact.id, id)).get() : undefined;
  const typeId = existing?.typeId ?? str(fd, "typeId");
  const ty = db.select().from(lanType).where(eq(lanType.id, typeId)).get();
  if (!ty?.clanId || (id && !existing)) return { error: await tr("errors.taskGone") };
  await requireClanPermission(ty.clanId, "events");
  const name = str(fd, "name");
  if (!name) return { error: await tr("errors.contactName") };
  const url = str(fd, "url", 500);
  const values = {
    name,
    role: str(fd, "role"),
    email: str(fd, "email"),
    discord: str(fd, "discord"),
    phone: str(fd, "phone", 50),
    // Only web links, so the contact card never renders a javascript: URL.
    url: /^https?:\/\//i.test(url) ? url : url ? `https://${url}` : "",
    note: str(fd, "note", 1000),
  };
  if (existing) db.update(leadContact).set(values).where(eq(leadContact.id, existing.id)).run();
  else db.insert(leadContact).values({ ...values, typeId }).run();
  revalidateTasks();
  return { ok: true };
}

export async function deleteLeadContact(id: string) {
  const c = db.select().from(leadContact).where(eq(leadContact.id, id)).get();
  if (!c) return;
  const ty = db.select().from(lanType).where(eq(lanType.id, c.typeId)).get();
  if (!ty?.clanId) return;
  await requireClanPermission(ty.clanId, "events");
  db.delete(leadContact).where(eq(leadContact.id, id)).run();
  revalidateTasks();
}

// ---------------- Ticking off at an event ----------------

function taskOfLan(lanId: string, taskId: string) {
  const l = getLan(lanId);
  const x = db.select().from(leadTask).where(eq(leadTask.id, taskId)).get();
  // Only a to-do this event actually lists: the clan's, its own type's or its own.
  if (!l || !x || x.clanId !== l.clanId || (x.lanId && x.lanId !== l.id) || (x.typeId && x.typeId !== l.typeId)) return null;
  return { l, x };
}

function upsertState(lanId: string, taskId: string, set: Partial<typeof lanTask.$inferInsert>) {
  db.insert(lanTask)
    .values({ lanId, taskId, ...set })
    .onConflictDoUpdate({ target: [lanTask.lanId, lanTask.taskId], set })
    .run();
}

export async function toggleLanTask(lanId: string, taskId: string) {
  const me = await requireLanManager(lanId);
  const found = taskOfLan(lanId, taskId);
  if (!found) return;
  const cur = db.select().from(lanTask).where(and(eq(lanTask.lanId, lanId), eq(lanTask.taskId, taskId))).get();
  const done = !cur?.doneAt;
  upsertState(lanId, taskId, done ? { doneAt: new Date(), doneById: me.id } : { doneAt: null, doneById: null });
  auditLan(found.l, me.id, done ? "lead.task_done" : "lead.task_undone", { data: { task: found.x.title } });
  lanChanged(lanId);
  revalidatePath(`/lans/${lanId}/manage`);
}

export async function assignLanTask(lanId: string, taskId: string, userId: string) {
  const me = await requireLanManager(lanId);
  const found = taskOfLan(lanId, taskId);
  if (!found) return;
  // Only someone who can manage the event: its leads, clan admins and event managers.
  const to = userId && isLanManager({ id: userId, role: "member" }, lanId) ? userId : null;
  const cur = db.select().from(lanTask).where(and(eq(lanTask.lanId, lanId), eq(lanTask.taskId, taskId))).get();
  if ((cur?.assigneeId ?? null) === to) return;
  upsertState(lanId, taskId, { assigneeId: to });
  auditLan(found.l, me.id, "lead.task_assign", { targetUserId: to, data: { task: found.x.title, from: cur?.assigneeId ?? undefined } });
  lanChanged(lanId);
  revalidatePath(`/lans/${lanId}/manage`);
}
