import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, LanTask, LeadContact, LeadTask } from "@/db/schema";
import { LEAD_STEP_DEPS, type LeadStep } from "./lead-checklist";
import { makeT, type T } from "../i18n/translate";
import { clanLocale } from "../i18n/user-locale";

const { leadTask, leadContact, lanTask, lanType } = schema;

/**
 * Starter to-dos for every clan, for all LAN types. Added once per clan (also for clans that
 * existed before), in the clan's language; leads edit or delete them like their own.
 */
const DEFAULT_TASKS: { key: "groupBlock" | "seatList" | "arrival" | "thanks"; after: string[]; dueDays: number | null }[] = [
  { key: "groupBlock", after: [], dueDays: 60 },
  { key: "seatList", after: ["finalize"], dueDays: 14 },
  { key: "arrival", after: ["tickets"], dueDays: 3 },
  { key: "thanks", after: [], dueDays: -3 },
];

export function ensureDefaultTasks(clanId: string) {
  const c = db.select({ seeded: schema.clan.leadTasksSeeded, locale: schema.clan.locale }).from(schema.clan).where(eq(schema.clan.id, clanId)).get();
  if (!c || c.seeded) return;
  const t = makeT(clanLocale(c));
  db.transaction((tx) => {
    tx.insert(leadTask)
      .values(
        DEFAULT_TASKS.map((d, i) => ({
          clanId,
          title: t(`leadTasks.defaults.${d.key}.title`),
          note: t(`leadTasks.defaults.${d.key}.note`),
          after: d.after,
          dueDays: d.dueDays,
          sort: i,
        })),
      )
      .run();
    tx.update(schema.clan).set({ leadTasksSeeded: true }).where(eq(schema.clan.id, clanId)).run();
  });
}

/** To-dos defined at one level: the clan's "all LAN types" list, one LAN type, or one event. */
export function tasksAt(scope: { clanId: string; typeId?: string | null; lanId?: string | null }) {
  const where = scope.lanId
    ? eq(leadTask.lanId, scope.lanId)
    : scope.typeId
      ? and(eq(leadTask.typeId, scope.typeId), isNull(leadTask.lanId))
      : and(eq(leadTask.clanId, scope.clanId), isNull(leadTask.typeId), isNull(leadTask.lanId));
  return db.select().from(leadTask).where(where).orderBy(asc(leadTask.sort), asc(leadTask.createdAt)).all();
}

export function contactsOf(typeId: string) {
  return db.select().from(leadContact).where(eq(leadContact.typeId, typeId)).orderBy(asc(leadContact.createdAt)).all();
}

/** Every to-do that applies to an event: the clan's (unless its type opts out), its type's, then its own. */
export function tasksForLan(l: Lan) {
  if (!l.clanId) return [];
  ensureDefaultTasks(l.clanId);
  const type = l.typeId ? db.select().from(lanType).where(eq(lanType.id, l.typeId)).get() : undefined;
  const clanWide = !type || type.clanLeadTasks;
  const rows = db
    .select()
    .from(leadTask)
    .where(
      and(
        eq(leadTask.clanId, l.clanId),
        or(
          clanWide ? and(isNull(leadTask.typeId), isNull(leadTask.lanId)) : undefined,
          type ? and(eq(leadTask.typeId, type.id), isNull(leadTask.lanId)) : undefined,
          eq(leadTask.lanId, l.id),
        ),
      ),
    )
    .all();
  const level = (x: LeadTask) => (x.lanId ? 2 : x.typeId ? 1 : 0);
  return rows.sort((a, b) => level(a) - level(b) || a.sort - b.sort || a.createdAt.getTime() - b.createdAt.getTime());
}

export type LeadTaskView = {
  id: string;
  title: string;
  note: string;
  scope: "clan" | "type" | "event";
  state: "done" | "todo" | "locked";
  /** Titles of the steps and to-dos it still waits for. */
  waitingFor: string[];
  due: Date | null;
  overdue: boolean;
  assigneeId: string | null;
  doneAt: Date | null;
  doneById: string | null;
  contact: LeadContact | null;
};

/**
 * Works out each to-do's state at one event. A to-do opens when everything in `after` is done.
 * A built-in step the event doesn't show stands in for the step it waits on itself: "book" only
 * shows with a seat plan link (else finalize counts), "assign" and "finalize" only once seats are in.
 */
export function buildLeadTasks(input: {
  lan: Lan;
  tasks: LeadTask[];
  states: LanTask[];
  steps: LeadStep[];
  contacts: LeadContact[];
  now?: Date;
  t?: T;
}): LeadTaskView[] {
  const t = input.t ?? makeT("en");
  const now = input.now ?? new Date();
  const { lan: l, tasks, steps } = input;
  const state = new Map(input.states.map((s) => [s.taskId, s]));
  const contacts = new Map(input.contacts.map((c) => [c.id, c]));
  const step = new Map(steps.map((s) => [s.key, s]));
  const byId = new Map(tasks.map((x) => [x.id, x]));
  const stepDone = (key: string): boolean => {
    const s = step.get(key);
    if (s) return s.state === "done";
    if (key === "book") return stepDone("finalize");
    if (key === "assign" || key === "finalize") return stepDone("seats");
    return true;
  };
  return tasks.map((x) => {
    const st = state.get(x.id);
    const waitingFor: string[] = [];
    for (const dep of x.after) {
      if (dep.startsWith("task:")) {
        const other = byId.get(dep.slice(5));
        if (other && !state.get(other.id)?.doneAt) waitingFor.push(other.title);
      } else if ((LEAD_STEP_DEPS as readonly string[]).includes(dep) && !stepDone(dep)) {
        waitingFor.push(t(`leadSteps.${dep as (typeof LEAD_STEP_DEPS)[number]}`));
      }
    }
    const due = x.dueDays != null && !l.dateTbd ? new Date(l.startsAt.getTime() - x.dueDays * 86400_000) : null;
    const done = !!st?.doneAt;
    return {
      id: x.id,
      title: x.title,
      note: x.note,
      scope: x.lanId ? "event" : x.typeId ? "type" : "clan",
      state: done ? "done" : waitingFor.length ? "locked" : "todo",
      waitingFor,
      due,
      overdue: !done && !!due && due < now,
      assigneeId: st?.assigneeId ?? null,
      doneAt: st?.doneAt ?? null,
      doneById: st?.doneById ?? null,
      contact: x.contactId ? contacts.get(x.contactId) ?? null : null,
    };
  });
}

/** State rows of one event's to-dos. */
export function lanTaskStates(lanId: string, taskIds: string[]) {
  return taskIds.length ? db.select().from(lanTask).where(and(eq(lanTask.lanId, lanId), inArray(lanTask.taskId, taskIds))).all() : [];
}
