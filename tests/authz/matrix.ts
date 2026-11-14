/**
 * Who may call which server action. Every action is tried as every actor in
 * harness.ts; the ones in `allow` may, everyone else must be turned away
 * without anything changing. The first allowed actor (or `positive`) also runs
 * it, to prove the arguments reach the real code path: otherwise a denial could
 * just be a typo in the test.
 *
 * A new server action needs a line here; the test fails for any exported
 * action without one.
 */
import type { Actor } from "./harness";
import { ALL_ACTORS, fx, form, ACTORS } from "./harness";
import { db } from "../../src/db";
import * as actions from "../../src/app/actions";
import * as clanActions from "../../src/app/clan-actions";
import * as eventActions from "../../src/app/event-actions";
import * as extras from "../../src/app/lan-extras-actions";
import * as travel from "../../src/app/travel-gear-actions";
import * as food from "../../src/app/food-actions";
import * as payments from "../../src/app/payment-actions";
import * as billing from "../../src/app/billing-actions";
import * as tasks from "../../src/app/lead-task-actions";
import * as moderation from "../../src/app/moderation-actions";
import * as account from "../../src/app/account-actions";
import * as locale from "../../src/app/locale-actions";
import * as settings from "../../src/app/admin/settings/actions";
import * as backups from "../../src/app/admin/backups/actions";
import * as emergency from "../../src/app/emergency-actions";
import * as costs from "../../src/app/cost-actions";
import * as metrics from "../../src/app/api/metrics/route";
import * as leadExport from "../../src/app/lans/[id]/manage/export/route";
import * as profileExport from "../../src/app/profile/export/route";
import * as backupDownload from "../../src/app/admin/backups/[name]/route";
import * as cron from "../../src/app/api/cron/reminders/route";

export const MODULES = {
  actions,
  "clan-actions": clanActions,
  "event-actions": eventActions,
  "lan-extras-actions": extras,
  "travel-gear-actions": travel,
  "food-actions": food,
  "payment-actions": payments,
  "billing-actions": billing,
  "lead-task-actions": tasks,
  "moderation-actions": moderation,
  "account-actions": account,
  "locale-actions": locale,
  "admin/settings/actions": settings,
  "admin/backups/actions": backups,
  "emergency-actions": emergency,
  "cost-actions": costs,
} as const;

export type Spec = {
  /** "<module>.<export>", plus a note when one action has several rows. */
  name: string;
  allow: readonly Actor[];
  run: () => Promise<unknown>;
  /** Who runs the positive control; defaults to allow[0]. */
  positive?: Actor;
  /**
   * "db" (default): an allowed call changes the database. "none": it has no lasting
   * effect here (mail, Discord, Stripe aren't set up), so denial must be an error.
   * "read": a route handler; allowed gets a 2xx response, everyone else an error status.
   */
  effect?: "db" | "none" | "read";
  /** Why there is no positive control (e.g. the call is only ever denied). */
  noPositive?: string;
};

// ---------- Who is who (see ACTORS in harness.ts) ----------

const SIGNED_IN = ALL_ACTORS.filter((a) => a !== "anon" && a !== "suspended");
/** Full members of the demo clan. Support and moderator are platform staff outside it. */
const MEMBERS: Actor[] = ["member", "lead", "recruiter", "organizer", "clanAdmin", "owner"];
/** May manage Lakeside LAN: its leads, the clan's admins and event managers, platform owners/admins. */
const LAN_MANAGERS: Actor[] = ["lead", "organizer", "clanAdmin", "owner"];
/** Same, for an event David doesn't lead. */
const EVENT_MANAGERS: Actor[] = ["organizer", "clanAdmin", "owner"];
const CLAN_MEMBERS_PERM: Actor[] = ["recruiter", "clanAdmin", "owner"];
const CLAN_SETTINGS: Actor[] = ["clanAdmin", "owner"];
const CLAN_PAYMENTS: Actor[] = ["organizer", "clanAdmin", "owner"];
const PLATFORM_SETTINGS: Actor[] = ["owner"];
const PLATFORM_SUSPEND: Actor[] = ["moderator", "owner"];
const NOBODY: Actor[] = [];
/** Platform staff who may look at every clan's events, read-only. */
const VIEWERS: Actor[] = ["support", "moderator"];
/** Clan members coming to Lakeside LAN (all of them; Sam is suspended). */
const LAKESIDE_ATTENDEES: Actor[] = MEMBERS;

/** Reads one column of a LAN, for calls that flip a switch. */
const lanFlag = (lanId: string, col: string) => !!(db.$client.prepare(`SELECT ${col} AS v FROM lan WHERE id = ?`).get(lanId) as { v: number }).v;

const params = <T>(p: T) => ({ params: Promise.resolve(p) });
const get = (path: string, headers: Record<string, string> = {}) => new Request(`http://localhost:3000${path}`, { headers });

/** Set as the cron secret in setup(). */
export const CRON_SECRET = "test-cron-secret-0123456789";
export const METRICS_TOKEN = "test-metrics-token-0123456789";

const D = 86_400_000;
const day = (n: number) => new Date(Date.now() + n * D).toISOString().slice(0, 16);

export const SPECS: Spec[] = [
  // ---------- actions.ts: answering, profile ----------
  { name: "actions.setMyAttendance", allow: MEMBERS, run: () => actions.setMyAttendance(fx.openLan, "maybe") },
  { name: "actions.setMyAttendance (draft)", allow: EVENT_MANAGERS, run: () => actions.setMyAttendance(fx.draftLan, "going") },
  { name: "actions.setNick", allow: SIGNED_IN, run: () => actions.setNick(form({ nick: "Zed" })) },
  { name: "actions.setNick (other clan's event)", allow: ["outsider", ...VIEWERS, "owner"], run: () => actions.setNick(form({ nick: "Zed", lanId: fx.otherLan })) },
  { name: "actions.setNick (demo event)", allow: [...MEMBERS, ...VIEWERS], run: () => actions.setNick(form({ nick: "Zed", lanId: fx.lan })) },
  { name: "actions.setMyLanId", allow: [...MEMBERS, ...VIEWERS], run: () => actions.setMyLanId(form({ typeId: fx.type, lanAccount: "99999" })) },
  { name: "actions.updateProfile", allow: SIGNED_IN, run: () => actions.updateProfile(form({ firstName: "Zora", lastName: "Test" })) },
  { name: "actions.completeProfile", allow: SIGNED_IN, run: () => actions.completeProfile(form({ firstName: "Zora", lastName: "Test" })) },
  { name: "actions.updateNotifications", allow: SIGNED_IN, run: () => actions.updateNotifications({}, form({ emailReminders: "on" })) },
  { name: "actions.updateSocials", allow: SIGNED_IN, run: () => actions.updateSocials({}, form({ steam: "zed_test" })) },
  { name: "actions.updateAppearance", allow: SIGNED_IN, run: () => actions.updateAppearance({}, form({ avatarStyle: "initials", color: "" })) },
  { name: "actions.sendTestDm", allow: SIGNED_IN, run: () => actions.sendTestDm(), effect: "none" },
  { name: "actions.setMyTicketBought", allow: MEMBERS, run: () => actions.setMyTicketBought(fx.pickLan, true) },
  { name: "actions.setMySeatWishes", allow: MEMBERS, run: () => actions.setMySeatWishes(fx.pickLan, { rules: [{ kind: "edge" }], note: "window" }) },
  { name: "actions.pickMySeat", allow: MEMBERS, run: () => actions.pickMySeat(fx.pickLan, fx.pickSeat) },

  // ---------- actions.ts: managing events ----------
  {
    name: "actions.saveLan (new)",
    allow: EVENT_MANAGERS,
    run: () => actions.saveLan(undefined, form({ clanId: fx.clan, name: "Test LAN", startsAt: day(50), endsAt: day(52), reminderDays: "3" })),
  },
  {
    name: "actions.saveLan (edit)",
    allow: LAN_MANAGERS,
    run: () => actions.saveLan(undefined, form({ id: fx.lan, name: "Renamed LAN", startsAt: day(30), endsAt: day(32), reminderDays: "3" })),
  },
  {
    name: "actions.saveLan (other clan's LAN type)",
    allow: NOBODY,
    noPositive: "a LAN type from another clan is always refused",
    run: () => actions.saveLan(undefined, form({ id: fx.otherLan, typeId: fx.type, name: "Other LAN", startsAt: day(40), endsAt: day(42), reminderDays: "3" })),
  },
  { name: "actions.publishLan", allow: ["clanAdmin", "organizer", "owner"], run: () => actions.publishLan(fx.draftLan) },
  { name: "actions.deleteLan", allow: EVENT_MANAGERS, run: () => actions.deleteLan(fx.lan) },
  { name: "actions.toggleSeatCell", allow: LAN_MANAGERS, run: () => actions.toggleSeatCell(fx.lan, 0, 21) },
  { name: "actions.renameSeat", allow: LAN_MANAGERS, run: () => actions.renameSeat(fx.freeSeat, "Z9") },
  { name: "actions.toggleSeatLock", allow: LAN_MANAGERS, run: () => actions.toggleSeatLock(fx.seat) },
  { name: "actions.adminAssignSeat", allow: LAN_MANAGERS, run: () => actions.adminAssignSeat(fx.seat, null) },
  { name: "actions.adminSetAttendance", allow: LAN_MANAGERS, run: () => actions.adminSetAttendance(fx.lan, ACTORS.member, "declined") },
  { name: "actions.adminMoveUp", allow: EVENT_MANAGERS, run: () => actions.adminMoveUp(fx.pickLan, "demo-jonas") },
  { name: "actions.adminReorderWaitlist", allow: EVENT_MANAGERS, run: () => actions.adminReorderWaitlist(fx.pickLan, "demo-sara", -1) },
  { name: "actions.setWaitlistAuto", allow: EVENT_MANAGERS, run: () => actions.setWaitlistAuto(fx.pickLan, !lanFlag(fx.pickLan, "waitlist_auto")) },
  { name: "actions.adminRemoveAttendance", allow: LAN_MANAGERS, run: () => actions.adminRemoveAttendance(fx.lan, ACTORS.member) },
  { name: "actions.adminSetPaid", allow: LAN_MANAGERS, run: () => actions.adminSetPaid(fx.annaAttendance, false) },
  { name: "actions.adminSetNote", allow: LAN_MANAGERS, run: () => actions.adminSetNote(fx.annaAttendance, "late") },
  { name: "actions.adminSetLanId", allow: LAN_MANAGERS, run: () => actions.adminSetLanId(fx.lan, ACTORS.member, "11111") },
  { name: "actions.adminSendReminder", allow: LAN_MANAGERS, run: () => actions.adminSendReminder(fx.lan, "event"), effect: "none" },
  { name: "actions.postLanToDiscord", allow: LAN_MANAGERS, run: () => actions.postLanToDiscord(fx.lan), effect: "none" },
  { name: "actions.postDiscordReminder", allow: LAN_MANAGERS, run: () => actions.postDiscordReminder(fx.lan, "event"), effect: "none" },
  { name: "actions.unlinkDiscordChannel", allow: CLAN_SETTINGS, run: () => actions.unlinkDiscordChannel(fx.discordChannel) },
  { name: "actions.addOrga", allow: LAN_MANAGERS, run: () => actions.addOrga(fx.lan, ACTORS.member) },
  { name: "actions.addOrga (outsider as lead)", allow: NOBODY, noPositive: "only clan members can lead", run: () => actions.addOrga(fx.lan, ACTORS.outsider) },
  { name: "actions.removeOrga", allow: LAN_MANAGERS, run: () => actions.removeOrga(fx.lan, ACTORS.clanAdmin) },
  { name: "actions.toggleSeatRow", allow: LAN_MANAGERS, run: () => actions.toggleSeatRow(fx.lan, 0) },
  { name: "actions.setSeatsFromList", allow: LAN_MANAGERS, run: () => actions.setSeatsFromList(fx.pickLan, "A1-A4"), positive: "organizer" },
  { name: "actions.adminSwapSeats", allow: LAN_MANAGERS, run: () => actions.adminSwapSeats(fx.seat, fx.freeSeat) },
  { name: "actions.setSeatPicking", allow: EVENT_MANAGERS, run: () => actions.setSeatPicking(fx.pickLan, false) },
  { name: "actions.adminSetSeatFor", allow: LAN_MANAGERS, run: () => actions.adminSetSeatFor(fx.lan, ACTORS.member, fx.freeSeat) },
  { name: "actions.adminAutoAssignSeats", allow: LAN_MANAGERS, run: () => actions.adminAutoAssignSeats(fx.lan, "replan") },
  { name: "actions.publishSeats", allow: EVENT_MANAGERS, run: () => actions.publishSeats(fx.pickLan, false) },
  { name: "actions.unpublishSeats", allow: LAN_MANAGERS, run: () => actions.unpublishSeats(fx.lan) },
  { name: "actions.saveLanType (new)", allow: EVENT_MANAGERS, run: () => actions.saveLanType(undefined, form({ clanId: fx.clan, name: "New type", reminderDays: "3", durationHours: "48" })) },
  { name: "actions.saveLanType (edit)", allow: EVENT_MANAGERS, run: () => actions.saveLanType(undefined, form({ id: fx.type, name: "Renamed type", reminderDays: "3", durationHours: "48" })) },
  { name: "actions.deleteLanType", allow: EVENT_MANAGERS, run: () => actions.deleteLanType(fx.type) },

  // ---------- event-actions.ts ----------
  { name: "event-actions.schedulePublish", allow: ["clanAdmin", "organizer", "owner"], run: () => eventActions.schedulePublish(fx.draftLan, day(3)) },
  { name: "event-actions.setMyInterest", allow: MEMBERS, run: () => eventActions.setMyInterest(fx.interestLan, "yes") },
  { name: "event-actions.openSignupNow", allow: EVENT_MANAGERS, run: () => eventActions.openSignupNow(fx.interestLan), effect: "none" },
  { name: "event-actions.cancelLan", allow: LAN_MANAGERS, run: () => eventActions.cancelLan(fx.lan, "test") },
  { name: "event-actions.uncancelLan", allow: LAN_MANAGERS, run: () => eventActions.uncancelLan(fx.lan), effect: "none" },
  { name: "event-actions.copyForNextYear", allow: LAN_MANAGERS, run: () => eventActions.copyForNextYear(fx.lan) },
  { name: "event-actions.postNews", allow: LAN_MANAGERS, run: () => eventActions.postNews(fx.lan, "Hello") },
  { name: "event-actions.deleteNews", allow: LAN_MANAGERS, run: () => eventActions.deleteNews(fx.news) },
  { name: "event-actions.setMyInterests", allow: MEMBERS, run: () => eventActions.setMyInterests(fx.clan, [fx.type]) },
  { name: "event-actions.setArrived (self)", allow: MEMBERS, run: () => eventActions.setArrived(fx.lan, null, true) },
  { name: "event-actions.setArrived (someone else)", allow: LAN_MANAGERS, run: () => eventActions.setArrived(fx.lan, "demo-finn", true) },

  // ---------- lan-extras-actions.ts ----------
  { name: "lan-extras-actions.adminSetSeatBooked", allow: LAN_MANAGERS, run: () => extras.adminSetSeatBooked(fx.lan, ACTORS.member, true) },
  { name: "lan-extras-actions.requestSeatSwap", allow: ["owner", "member", "recruiter", "lead", "organizer"], run: () => extras.requestSeatSwap(fx.lan, ACTORS.clanAdmin, "swap?") },
  { name: "lan-extras-actions.answerSeatSwap", allow: ["member"], run: () => extras.answerSeatSwap(fx.swapToAnna, false) },
  { name: "lan-extras-actions.cancelSeatSwap", allow: ["member"], run: () => extras.cancelSeatSwap(fx.swapFromAnna) },
  { name: "lan-extras-actions.decideSeatSwap", allow: LAN_MANAGERS, run: () => extras.decideSeatSwap(fx.swapFromAnna, false) },
  { name: "lan-extras-actions.addGame", allow: MEMBERS, run: () => extras.addGame(fx.lan, form({ name: "Quake", sizeGb: "1", url: "" })) },
  { name: "lan-extras-actions.deleteGame", allow: ["member", ...LAN_MANAGERS], run: () => extras.deleteGame(fx.annaGame) },
  { name: "lan-extras-actions.setGameMark", allow: MEMBERS, run: () => extras.setGameMark(fx.game, "installed", true), positive: "organizer" },
  { name: "lan-extras-actions.nudgeMissing", allow: LAN_MANAGERS, run: () => extras.nudgeMissing(fx.lan, "ticket"), effect: "none" },

  // ---------- travel-gear-actions.ts ----------
  {
    name: "travel-gear-actions.saveTravelPost (new)",
    allow: LAKESIDE_ATTENDEES,
    run: () => travel.saveTravelPost(fx.lan, { kind: "ride", mode: "offer", town: "Bern", places: 2 }),
  },
  {
    name: "travel-gear-actions.saveTravelPost (someone else's)",
    allow: ["recruiter"],
    run: () => travel.saveTravelPost(fx.lan, { kind: "ride", mode: "offer", town: "Basel", places: 3 }, fx.travelOffer),
  },
  { name: "travel-gear-actions.deleteTravelPost", allow: ["recruiter", ...LAN_MANAGERS], run: () => travel.deleteTravelPost(fx.travelOffer) },
  { name: "travel-gear-actions.joinTravelOffer", allow: LAKESIDE_ATTENDEES, run: () => travel.joinTravelOffer(fx.travelOffer) },
  { name: "travel-gear-actions.leaveTravelOffer (someone else)", allow: ["owner", ...LAN_MANAGERS], run: () => travel.leaveTravelOffer("demo-ride-alex", ACTORS.organizer) },
  { name: "travel-gear-actions.leaveTravelOffer (self)", allow: ["member", "organizer"], run: () => travel.leaveTravelOffer("demo-ride-alex") },
  { name: "travel-gear-actions.takeAlong", allow: ["recruiter"], run: () => travel.takeAlong(fx.travelRequest, fx.travelOffer) },
  { name: "travel-gear-actions.setPacked", allow: MEMBERS, run: () => travel.setPacked(fx.lan, "pc", true), positive: "organizer" },
  { name: "travel-gear-actions.addPackingItem", allow: MEMBERS, run: () => travel.addPackingItem(fx.lan, "Fan") },
  { name: "travel-gear-actions.setPackingItemPacked", allow: ["member"], run: () => travel.setPackingItemPacked(fx.annaPackingItem, true) },
  { name: "travel-gear-actions.deletePackingItem", allow: ["member"], run: () => travel.deletePackingItem(fx.annaPackingItem) },

  // ---------- food-actions.ts ----------
  { name: "food-actions.createFoodOrder", allow: [...LAKESIDE_ATTENDEES, ...LAN_MANAGERS], run: () => food.createFoodOrder(fx.lan, form({ title: "Sushi", shop: "", note: "", closesAt: "" })) },
  { name: "food-actions.setFoodOrderStatus", allow: ["member", ...LAN_MANAGERS], run: () => food.setFoodOrderStatus(fx.foodOrder, "ordered") },
  { name: "food-actions.deleteFoodOrder", allow: ["member", ...LAN_MANAGERS], run: () => food.deleteFoodOrder(fx.foodOrder) },
  { name: "food-actions.addFoodItem", allow: [...LAKESIDE_ATTENDEES, ...LAN_MANAGERS], run: () => food.addFoodItem(fx.foodOrder, form({ item: "Margherita", qty: "1", price: "12", note: "" })) },
  { name: "food-actions.removeFoodItem", allow: ["member", ...LAN_MANAGERS], run: () => food.removeFoodItem(fx.annaFoodItem) },
  { name: "food-actions.setFoodPaid", allow: ["member", ...LAN_MANAGERS], run: () => food.setFoodPaid(fx.foodOrder, ACTORS.member, true) },

  // ---------- cost-actions.ts (shared costs at an event) ----------
  {
    name: "cost-actions.addExpense",
    allow: LAKESIDE_ATTENDEES,
    run: () => costs.addExpense(fx.lan, form({ title: "Pizza", note: "", amount: "30", paidBy: ACTORS.member, people: [ACTORS.member, ACTORS.recruiter] })),
    positive: "member",
  },
  {
    name: "cost-actions.updateExpense",
    allow: ["member", ...LAN_MANAGERS],
    run: () => costs.updateExpense(fx.annaExpense, form({ title: "Snacks and drinks", note: "", amount: "25", paidBy: ACTORS.member, people: [ACTORS.member, ACTORS.organizer] })),
  },
  { name: "cost-actions.deleteExpense", allow: ["member", ...LAN_MANAGERS], run: () => costs.deleteExpense(fx.annaExpense) },
  { name: "cost-actions.recordSettlement", allow: ["member", "recruiter", ...LAN_MANAGERS], run: () => costs.recordSettlement(fx.lan, ACTORS.recruiter, ACTORS.member, "5") },
  { name: "cost-actions.deleteSettlement", allow: ["member", ...LAN_MANAGERS], run: () => costs.deleteSettlement(fx.annaSettlement) },

  // ---------- payment-actions.ts ----------
  { name: "payment-actions.savePaymentSettings", allow: CLAN_PAYMENTS, run: () => payments.savePaymentSettings(fx.clan, undefined, form({ enabled: "on", paymentInfo: "IBAN test" })) },
  {
    name: "payment-actions.createCharge",
    allow: CLAN_PAYMENTS,
    run: () => payments.createCharge(fx.clan, undefined, form({ title: "Test", kind: "other", amount: "10", who: "members" })),
  },
  { name: "payment-actions.updateCharge", allow: CLAN_PAYMENTS, run: () => payments.updateCharge(fx.charge, undefined, form({ title: "Dues renamed", note: "", dueAt: "" })) },
  { name: "payment-actions.deleteCharge", allow: CLAN_PAYMENTS, run: () => payments.deleteCharge(fx.charge) },
  { name: "payment-actions.addToCharge", allow: CLAN_PAYMENTS, run: () => payments.addToCharge(fx.charge, undefined, form({ amount: "5", people: fx.annaClaimable })) },
  { name: "payment-actions.remindCharge", allow: CLAN_PAYMENTS, run: () => payments.remindCharge(fx.charge) },
  { name: "payment-actions.setLineStatus", allow: CLAN_PAYMENTS, run: () => payments.setLineStatus(fx.annaChargeItem, "paid", "cash") },
  { name: "payment-actions.markLinesPaid", allow: CLAN_PAYMENTS, run: () => payments.markLinesPaid(fx.charge, form({ line: fx.annaChargeItem, via: "cash" })) },
  { name: "payment-actions.setLineAmount", allow: CLAN_PAYMENTS, run: () => payments.setLineAmount(fx.annaChargeItem, form({ amount: "77" })) },
  { name: "payment-actions.removeLine", allow: CLAN_PAYMENTS, run: () => payments.removeLine(fx.annaChargeItem) },
  { name: "payment-actions.reportPaid", allow: ["member"], run: () => payments.reportPaid(fx.annaChargeItem, true) },
  { name: "payment-actions.connectStripe", allow: CLAN_SETTINGS, run: () => payments.connectStripe(fx.clan), effect: "none" },
  { name: "payment-actions.disconnectStripe", allow: CLAN_SETTINGS, run: () => payments.disconnectStripe(fx.clan) },
  { name: "payment-actions.payOnline", allow: ["member"], run: () => payments.payOnline(fx.annaChargeItem), effect: "none" },

  // ---------- billing-actions.ts ----------
  { name: "billing-actions.startSupport", allow: CLAN_SETTINGS, run: () => billing.startSupport(fx.clan, "year"), effect: "none" },
  { name: "billing-actions.manageSupport", allow: CLAN_SETTINGS, run: () => billing.manageSupport(fx.clan), effect: "none" },
  { name: "billing-actions.startDonation", allow: SIGNED_IN, run: () => billing.startDonation(form({ amount: "10" })), effect: "none" },

  // ---------- lead-task-actions.ts ----------
  { name: "lead-task-actions.saveLeadTask (clan)", allow: EVENT_MANAGERS, run: () => tasks.saveLeadTask(undefined, form({ clanId: fx.clan, title: "New task", dueDays: "5" })) },
  { name: "lead-task-actions.saveLeadTask (event)", allow: LAN_MANAGERS, run: () => tasks.saveLeadTask(undefined, form({ lanId: fx.lan, title: "New task", dueDays: "5" })) },
  { name: "lead-task-actions.saveLeadTask (edit)", allow: EVENT_MANAGERS, run: () => tasks.saveLeadTask(undefined, form({ id: fx.leadTask, title: "Edited", dueDays: "5" })) },
  { name: "lead-task-actions.deleteLeadTask", allow: EVENT_MANAGERS, run: () => tasks.deleteLeadTask(fx.leadTask) },
  { name: "lead-task-actions.deleteLeadTask (event)", allow: LAN_MANAGERS, run: () => tasks.deleteLeadTask(fx.lanLeadTask) },
  { name: "lead-task-actions.setClanLeadTasks", allow: EVENT_MANAGERS, run: () => tasks.setClanLeadTasks(fx.type, form({})) },
  { name: "lead-task-actions.saveLeadContact", allow: EVENT_MANAGERS, run: () => tasks.saveLeadContact(undefined, form({ typeId: fx.type, name: "Crew" })) },
  { name: "lead-task-actions.deleteLeadContact", allow: EVENT_MANAGERS, run: () => tasks.deleteLeadContact(fx.leadContact) },
  { name: "lead-task-actions.toggleLanTask", allow: LAN_MANAGERS, run: () => tasks.toggleLanTask(fx.lan, fx.leadTask) },
  { name: "lead-task-actions.assignLanTask", allow: LAN_MANAGERS, run: () => tasks.assignLanTask(fx.lan, fx.leadTask, ACTORS.lead) },

  // ---------- clan-actions.ts ----------
  { name: "clan-actions.createClan", allow: SIGNED_IN, run: () => clanActions.createClan(undefined, form({ name: "Fresh Clan" })) },
  { name: "clan-actions.updateClan", allow: CLAN_SETTINGS, run: () => clanActions.updateClan(undefined, form({ clanId: fx.clan, name: "Renamed Clan" })) },
  { name: "clan-actions.joinClan", allow: ["outsider", "support", "moderator"], run: () => clanActions.joinClan(fx.clan) },
  { name: "clan-actions.joinWithInvite", allow: ["outsider", "support", "moderator", "pending"], run: () => clanActions.joinWithInvite(fx.invite) },
  { name: "clan-actions.leaveClan", allow: ["pending", ...MEMBERS], run: () => clanActions.leaveClan(fx.clan) },
  { name: "clan-actions.setClanMemberRole (approve)", allow: CLAN_MEMBERS_PERM, run: () => clanActions.setClanMemberRole(fx.clan, ACTORS.pending, "member") },
  { name: "clan-actions.setClanMemberRole (promote)", allow: CLAN_SETTINGS, run: () => clanActions.setClanMemberRole(fx.clan, ACTORS.member, "admin") },
  { name: "clan-actions.removeClanMember", allow: CLAN_MEMBERS_PERM, run: () => clanActions.removeClanMember(fx.clan, ACTORS.member) },
  { name: "clan-actions.removeClanMember (an admin)", allow: CLAN_SETTINGS, run: () => clanActions.removeClanMember(fx.clan, ACTORS.clanAdmin), positive: "owner" },
  { name: "clan-actions.createInvite", allow: CLAN_MEMBERS_PERM, run: () => clanActions.createInvite(fx.clan) },
  { name: "clan-actions.deleteInvite", allow: CLAN_MEMBERS_PERM, run: () => clanActions.deleteInvite(fx.invite) },
  { name: "clan-actions.deleteClan", allow: CLAN_SETTINGS, run: () => clanActions.deleteClan(fx.clan) },
  { name: "clan-actions.addClanMember", allow: CLAN_MEMBERS_PERM, run: () => clanActions.addClanMember(fx.clan, ACTORS.support), positive: "owner" },
  { name: "clan-actions.addGuest", allow: CLAN_MEMBERS_PERM, run: () => clanActions.addGuest(fx.clan, undefined, form({ firstName: "Gus", lastName: "Guest" })) },
  { name: "clan-actions.addGuestToLan", allow: LAN_MANAGERS, run: () => clanActions.addGuestToLan(fx.lan, undefined, form({ firstName: "Gus", lastName: "Guest" })) },
  { name: "clan-actions.updateGuest", allow: CLAN_MEMBERS_PERM, run: () => clanActions.updateGuest(fx.clan, fx.guest, undefined, form({ firstName: "Yan", lastName: "Renamed" })) },
  { name: "clan-actions.deleteGuest", allow: CLAN_MEMBERS_PERM, run: () => clanActions.deleteGuest(fx.clan, fx.guest) },
  { name: "clan-actions.resendGuestDiscordDm", allow: CLAN_MEMBERS_PERM, run: () => clanActions.resendGuestDiscordDm(fx.clan, fx.guest), effect: "none" },
  { name: "clan-actions.unlinkGuestDiscord", allow: CLAN_MEMBERS_PERM, run: () => clanActions.unlinkGuestDiscord(fx.clan, fx.guest), effect: "none" },
  { name: "clan-actions.renewGuestLink", allow: CLAN_MEMBERS_PERM, run: () => clanActions.renewGuestLink(fx.clan, fx.guest) },
  { name: "clan-actions.claimGuest", allow: SIGNED_IN, run: () => clanActions.claimGuest("claim-anna"), positive: "member" },
  { name: "clan-actions.claimGuestFromDiscord", allow: NOBODY, noPositive: "needs a Discord ticket", run: () => clanActions.claimGuestFromDiscord("no-such-ticket") },
  { name: "clan-actions.setClanDiscordInvite", allow: CLAN_SETTINGS, run: () => clanActions.setClanDiscordInvite(fx.clan, "1234567890123456780", form({ inviteUrl: "https://discord.gg/example" })) },
  { name: "clan-actions.claimGuestAsMember", allow: MEMBERS, positive: "member", run: () => clanActions.claimGuestAsMember(fx.clan, fx.annaClaimable) },
  { name: "clan-actions.dismissGuestSuggestion", allow: MEMBERS, run: () => clanActions.dismissGuestSuggestion(fx.clan, fx.annaClaimable) },
  { name: "clan-actions.cancelGuestClaim", allow: ["owner"], noPositive: "the claim is Rafael's; nobody else may cancel it", run: () => clanActions.cancelGuestClaim(fx.guestClaim) },
  { name: "clan-actions.decideGuestClaim", allow: CLAN_MEMBERS_PERM, run: () => clanActions.decideGuestClaim(fx.guestClaim, false) },

  // ---------- moderation-actions.ts ----------
  { name: "moderation-actions.reportContent", allow: SIGNED_IN, run: () => moderation.reportContent(undefined, form({ clanId: fx.otherClan, reason: "spam", message: "test" })) },
  { name: "moderation-actions.setPlatformRole", allow: ["owner"], run: () => moderation.setPlatformRole(ACTORS.member, form({ role: "support" })) },
  { name: "moderation-actions.suspendUserAction", allow: PLATFORM_SUSPEND, run: () => moderation.suspendUserAction(ACTORS.member, form({ reason: "test" })) },
  { name: "moderation-actions.unsuspendUserAction", allow: PLATFORM_SUSPEND, run: () => moderation.unsuspendUserAction(ACTORS.suspended) },
  { name: "moderation-actions.suspendClanAction", allow: PLATFORM_SUSPEND, run: () => moderation.suspendClanAction(fx.otherClan, form({ reason: "test" })) },
  { name: "moderation-actions.unsuspendClanAction", allow: PLATFORM_SUSPEND, run: () => moderation.unsuspendClanAction(fx.otherClan), effect: "none" },
  { name: "moderation-actions.updateReport", allow: PLATFORM_SUSPEND, run: () => moderation.updateReport(fx.report, "dismissed", form({ note: "ok" })) },

  // ---------- account and language ----------
  { name: "account-actions.deleteMyAccount", allow: SIGNED_IN, run: () => account.deleteMyAccount(undefined, form({ confirm: "DELETE" })), positive: "member" },
  { name: "locale-actions.setLocale", allow: SIGNED_IN, run: () => locale.setLocale("de") },

  // ---------- platform admin ----------
  { name: "admin/settings/actions.saveSettings", allow: PLATFORM_SETTINGS, run: () => settings.saveSettings("general", { ok: true, message: "", at: 0 }, form({ "site.name": "Test" })) },
  { name: "admin/settings/actions.sendTestMail", allow: PLATFORM_SETTINGS, run: () => settings.sendTestMail(), effect: "none" },
  { name: "admin/settings/actions.setupDiscordBot", allow: PLATFORM_SETTINGS, run: () => settings.setupDiscordBot(), effect: "none" },
  { name: "admin/settings/actions.saveMailTemplate", allow: PLATFORM_SETTINGS, run: () => settings.saveMailTemplate("reminderEvent", "en", { ok: true, message: "", at: 0 }, form({ subject: "Hi", body: "Body" })) },
  { name: "admin/settings/actions.resetMailTemplate", allow: PLATFORM_SETTINGS, run: () => settings.resetMailTemplate("reminderEvent", "en") },
  { name: "admin/settings/actions.sendTemplateTest", allow: PLATFORM_SETTINGS, run: () => settings.sendTemplateTest("reminderEvent", "en"), effect: "none" },
  { name: "admin/settings/actions.sendSystemMailTest", allow: PLATFORM_SETTINGS, run: () => settings.sendSystemMailTest("passwordReset", "en"), effect: "none" },
  { name: "admin/settings/actions.testOpsChannels", allow: PLATFORM_SETTINGS, run: () => settings.testOpsChannels(), effect: "none" },
  { name: "admin/settings/actions.postPlatformAnnouncement", allow: PLATFORM_SETTINGS, run: () => settings.postPlatformAnnouncement({ ok: true, message: "", at: 0 }, form({ title: "Hi", text: "News" })), effect: "none" },
  { name: "admin/settings/actions.saveMaintenance", allow: PLATFORM_SETTINGS, run: () => settings.saveMaintenance({ ok: true, message: "", at: 0 }, form({ message: "Down soon", startsAt: day(1) })) },
  { name: "admin/backups/actions.backupNow", allow: ["owner"], run: () => backups.backupNow(), effect: "none" },
  { name: "admin/backups/actions.testNewestBackup", allow: ["owner"], run: () => backups.testNewestBackup(), effect: "none" },
  { name: "emergency-actions.updateEmergencyInfo", allow: SIGNED_IN, run: () => emergency.updateEmergencyInfo({}, form({ contactName: "Mum", contactPhone: "+41 79 000 00 00", diet: "" })) },
  { name: "admin/backups/actions.removeBackup", allow: ["owner"], run: () => backups.removeBackup("seatbit-none.db"), effect: "none" },

  // ---------- Downloads (route handlers) ----------
  { name: "route GET /lans/[id]/manage/export", allow: LAN_MANAGERS, effect: "read", run: () => leadExport.GET(get(`/lans/${fx.lan}/manage/export`), params({ id: fx.lan })) },
  { name: "route GET /profile/export", allow: SIGNED_IN, effect: "read", run: () => profileExport.GET() },
  { name: "route GET /admin/backups/[name]", allow: ["owner"], effect: "read", run: () => backupDownload.GET(get(`/admin/backups/${fx.backup}`), params({ name: fx.backup })) },
  // Cron isn't tied to a person: only the shared secret counts, whoever is signed in.
  { name: "route GET /api/cron/reminders (no secret)", allow: NOBODY, effect: "read", noPositive: "needs the secret", run: () => cron.GET(get("/api/cron/reminders")) },
  { name: "route GET /api/cron/reminders (wrong secret)", allow: NOBODY, effect: "read", noPositive: "needs the secret", run: () => cron.GET(get("/api/cron/reminders", { authorization: "Bearer wrong-secret-wrong-secret" })) },
  { name: "route GET /api/metrics (no token)", allow: NOBODY, effect: "read", noPositive: "needs the token", run: async () => metrics.GET(get("/api/metrics")) },
  { name: "route GET /api/metrics (wrong token)", allow: NOBODY, effect: "read", noPositive: "needs the token", run: async () => metrics.GET(get("/api/metrics", { authorization: "Bearer wrong-token-wrong-token-wrong" })) },
  { name: "route GET /api/metrics (token)", allow: ALL_ACTORS, effect: "read", run: async () => metrics.GET(get("/api/metrics", { authorization: `Bearer ${METRICS_TOKEN}` })) },
  { name: "route GET /api/cron/reminders (secret)", allow: ALL_ACTORS, effect: "read", run: () => cron.GET(get("/api/cron/reminders", { authorization: `Bearer ${CRON_SECRET}` })) },
];
