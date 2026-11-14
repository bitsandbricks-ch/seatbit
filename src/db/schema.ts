import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import type { ClanRole } from "../lib/clan-roles";
import type { DiscordMode } from "../lib/discord-modes";
import type { NameDisplay } from "../lib/names";
import type { SeatRule } from "../lib/seat-rules";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ---------- Better Auth tables ----------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // "First Last", kept in sync with the two fields below
  firstName: text("first_name").default("").notNull(),
  lastName: text("last_name").default("").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  /** Platform role (see src/lib/platform-roles.ts): "owner" | "admin" | "moderator" | "support" | "member". */
  role: text("role").default("member").notNull(),
  /** Suspended by platform staff: signed out everywhere until restored. */
  suspendedAt: integer("suspended_at", { mode: "timestamp_ms" }),
  suspendedReason: text("suspended_reason"),
  emailReminders: integer("email_reminders", { mode: "boolean" }).default(true).notNull(),
  /** Discord DMs from the bot about changes (needs a linked Discord account). */
  discordDms: integer("discord_dms", { mode: "boolean" }).default(true).notNull(),
  /** "en" | "de" chosen on the profile; null = follow the browser (and the instance default for mails). */
  locale: text("locale"),
  // Guests: members a lead added who have no login yet. They belong to one clan
  // and are taken over by a real account through their claim link.
  isGuest: integer("is_guest", { mode: "boolean" }).default(false).notNull(),
  guestClanId: text("guest_clan_id").references((): AnySQLiteColumn => clan.id, { onDelete: "cascade" }),
  claimCode: text("claim_code").unique(),
  // A guest's real email address, if the leads know it: the invite goes there, and a
  // Discord sign-in with this (verified) address takes the guest over automatically.
  inviteEmail: text("invite_email"),
  invitedAt: integer("invited_at", { mode: "timestamp_ms" }),
  // The Discord user a lead said this guest is (via the bot): their Discord sign-in
  // takes the guest over automatically.
  guestDiscordId: text("guest_discord_id"),
  /** How that Discord member was shown when linked ("Nick (@username)"), for the guest page. */
  guestDiscordName: text("guest_discord_name"),
  guestDiscordLinkedAt: integer("guest_discord_linked_at", { mode: "timestamp_ms" }),
  guestDiscordLinkedBy: text("guest_discord_linked_by"),
  /** When the bot last DMed them the claim link; null when it couldn't. */
  guestDiscordDmAt: integer("guest_discord_dm_at", { mode: "timestamp_ms" }),
  // How the member is shown: "picture" = their uploaded picture, else the Discord
  // picture, else initials; "icon" = an emoji on their colour; "initials".
  avatarStyle: text("avatar_style").$type<"picture" | "icon" | "initials">().default("picture").notNull(),
  /** File name of an uploaded picture in the uploads dir, or null. */
  avatarFile: text("avatar_file"),
  /** Emoji shown when avatarStyle is "icon". */
  icon: text("icon"),
  /** Personal colour (one of PROFILE_COLORS), used for rings, seats and lists; null = picked from the user id. */
  color: text("color"),
  /** Gaming and social handles shown on their member profile, keyed by SOCIALS in src/lib/socials.ts. */
  socials: text("socials", { mode: "json" }).$type<Record<string, string>>().default({}).notNull(),
  /**
   * Set when the person deleted their account. The row stays (as "Deleted member", no email, no
   * logins) only so past events and the audit log keep their counts; everything personal is gone.
   */
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(now)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------- App tables ----------

/** A clan / group of friends. Everything (LAN types, events) belongs to one clan. */
export const clan = sqliteTable("clan", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").default("").notNull(),
  /** File name of the uploaded avatar in the uploads dir, or null. */
  avatar: text("avatar"),
  /**
   * "approval": anyone can ask to join, an admin approves; "open": anyone joins
   * directly; "invite": only with an invite link. Invite links always work.
   */
  joinPolicy: text("join_policy").$type<"approval" | "open" | "invite">().default("approval").notNull(),
  /**
   * Can members say "I'm this guest" themselves? "approval": yes, an admin confirms;
   * "match": guests with the same name or nick move over right away, other picks need
   * an admin; "off": only through the guest's claim link or invite email.
   */
  guestClaims: text("guest_claims").$type<GuestClaimMode>().default("approval").notNull(),
  /** How members are shown to each other (see NAME_DISPLAYS in lib/names.ts). */
  nameDisplay: text("name_display").$type<NameDisplay>().default("full").notNull(),
  /** Language of the bot's posts in the clan's Discord channels; null = the instance default. */
  locale: text("locale"),
  /** The default lead to-dos were added once; deleting them all later must not bring them back. */
  leadTasksSeeded: integer("lead_tasks_seeded", { mode: "boolean" }).default(false).notNull(),
  // Voluntary Supporter payments (hosted instances with billing on, see src/lib/billing.ts).
  // supporterUntil is the end of the last paid period; the badge shows while it's in the future.
  supporterUntil: integer("supporter_until", { mode: "timestamp_ms" }),
  supporterPlan: text("supporter_plan").$type<"year" | "month">(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Clan payments (dues, ticket money, shared costs) are on for this clan. See src/lib/payments.ts. */
  paymentsEnabled: integer("payments_enabled", { mode: "boolean" }).default(false).notNull(),
  /** How members pay the clan outside Seatbit: IBAN, TWINT number, "cash to Mike". Shown with open charges. */
  paymentInfo: text("payment_info").default("").notNull(),
  /** Suspended by platform staff: hidden from members, no joining, the bot stays quiet. */
  suspendedAt: integer("suspended_at", { mode: "timestamp_ms" }),
  suspendedReason: text("suspended_reason"),
  /** The clan's own Stripe account (Connect, Standard) for paying charges online. See src/lib/connect.ts. */
  stripeAccountId: text("stripe_account_id"),
  /** Stripe says the account can take payments (onboarding done). */
  stripeChargesEnabled: integer("stripe_charges_enabled", { mode: "boolean" }).default(false).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
});

/** Stripe webhook events already handled, so a retried delivery doesn't apply twice. */
export const billingEvent = sqliteTable("billing_event", {
  id: text("id").primaryKey(), // Stripe event id (evt_...)
  type: text("type").notNull(),
  at: integer("at", { mode: "timestamp_ms" }).default(now).notNull(),
});

/**
 * One-off donations to the instance (see src/lib/donations.ts). Only paid ones are stored:
 * an abandoned Checkout leaves nothing behind.
 */
export const donation = sqliteTable(
  "donation",
  {
    id: id(),
    stripeSessionId: text("stripe_session_id").notNull().unique(),
    paymentIntentId: text("payment_intent_id"),
    /** Who paid. Kept when the account is deleted only as long as the user row exists. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Set when the donor gave on behalf of a clan they manage. */
    clanId: text("clan_id").references(() => clan.id, { onDelete: "set null" }),
    /** In the currency's smallest unit (Rappen, cents). */
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    /** The donor agreed to show a Donor badge. */
    showBadge: integer("show_badge", { mode: "boolean" }).default(true).notNull(),
    refundedAt: integer("refunded_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("donation_user_idx").on(t.userId), index("donation_clan_idx").on(t.clanId)],
);

// Roles and their permissions live in src/lib/clan-roles.ts.
export { CLAN_ROLES, type ClanRole } from "../lib/clan-roles";

export const clanMember = sqliteTable(
  "clan_member",
  {
    clanId: text("clan_id")
      .notNull()
      .references(() => clan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<ClanRole>().default("member").notNull(),
    /**
     * Which of the clan's events the member wants to hear about: null = all of them, otherwise the
     * LAN type ids they care about. Events without a type always count. Drives "new event" notices.
     */
    interestTypes: text("interest_types", { mode: "json" }).$type<string[] | null>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("clan_member_uq").on(t.clanId, t.userId), index("clan_member_user_idx").on(t.userId)],
);

export const GUEST_CLAIM_MODES = ["approval", "match", "off"] as const;
export type GuestClaimMode = (typeof GUEST_CLAIM_MODES)[number];

/**
 * A member says they are one of the clan's guests. "pending" waits for a clan admin;
 * "declined" (by an admin) and "dismissed" ("not me", by the member) keep that guest
 * from being suggested to them again. Approved requests disappear with the guest.
 */
export const guestClaim = sqliteTable(
  "guest_claim",
  {
    id: id(),
    clanId: text("clan_id")
      .notNull()
      .references(() => clan.id, { onDelete: "cascade" }),
    guestId: text("guest_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").$type<"pending" | "declined" | "dismissed">().default("pending").notNull(),
    /** Why it was suggested: same name or nick, or null when the member picked it from the list. */
    match: text("match").$type<"name" | "nick">(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("guest_claim_guest_user").on(t.guestId, t.userId), index("guest_claim_clan_idx").on(t.clanId, t.status)],
);

/** Invite links: anyone with the code can join the clan as a member. */
export const clanInvite = sqliteTable("clan_invite", {
  code: text("code").primaryKey(),
  clanId: text("clan_id")
    .notNull()
    .references(() => clan.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
});

/** A recurring LAN party (e.g. "Lock & Load") that yearly events are created from. */
export const lanType = sqliteTable("lan_type", {
  id: id(),
  clanId: text("clan_id").references(() => clan.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  location: text("location").default("").notNull(),
  websiteUrl: text("website_url").default("").notNull(),
  ticketUrl: text("ticket_url").default("").notNull(),
  price: text("price").default("").notNull(),
  capacity: integer("capacity"),
  reminderDays: integer("reminder_days").default(3).notNull(),
  /** Seats the group usually gets, e.g. "F1-F20". Copied into new events. */
  seatSpec: text("seat_spec").default("").notNull(),
  /** Usual length of the event in hours (e.g. Fri 18:00 to Sun 16:00 = 46): fills the end when the start is set. */
  durationHours: integer("duration_hours").default(46).notNull(),
  /** "Answer by" this many days before the start; null = no answer deadline by default. */
  answerDaysBefore: integer("answer_days_before").default(30),
  /** Where the Discord bot puts each event of this type: see DISCORD_MODES. */
  discordMode: text("discord_mode").$type<DiscordMode>().default("channel").notNull(),
  /** Link to a member's profile on the event's site, with {id} for their LAN ID (e.g. https://example.com/user/?id={id}). */
  profileUrl: text("profile_url").default("").notNull(),
  /** Events of this type also get the clan's lead to-dos "for all LAN types", not only their own. */
  clanLeadTasks: integer("clan_lead_tasks", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
});

export const lan = sqliteTable("lan", {
  id: id(),
  clanId: text("clan_id").references(() => clan.id, { onDelete: "cascade" }),
  typeId: text("type_id").references(() => lanType.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  location: text("location").default("").notNull(),
  /** The event's own website (the LAN is run by someone else). */
  websiteUrl: text("website_url").default("").notNull(),
  /** Where members buy their ticket. */
  ticketUrl: text("ticket_url").default("").notNull(),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
  endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
  /** Members must say whether they come by this date (e.g. before the group books its seat block). */
  signupDeadline: integer("signup_deadline", { mode: "timestamp_ms" }),
  /** Members must have bought their ticket by this date. */
  paymentDueDate: integer("payment_due_date", { mode: "timestamp_ms" }),
  price: text("price").default("").notNull(),
  /** Spots the group has at the event (e.g. size of the reserved seat block); null = unlimited. */
  capacity: integer("capacity"),
  /**
   * When a spot opens, move the first person on the waitlist to coming by themselves. Off: the leads
   * get a notice and pick who moves up (e.g. they want to ask first who still has time).
   */
  waitlistAuto: integer("waitlist_auto", { mode: "boolean" }).default(true).notNull(),
  /** Send due-date reminders this many days before a deadline. */
  reminderDays: integer("reminder_days").default(3).notNull(),
  seatRows: integer("seat_rows").default(6).notNull(),
  seatCols: integer("seat_cols").default(10).notNull(),
  /** When the leads finalized the seat plan (the last seat step, also after self pick); members only see seats after this. */
  seatsPublishedAt: integer("seats_published_at", { mode: "timestamp_ms" }),
  /** Whether attendees may pick their own seats. */
  seatingOpen: integer("seating_open", { mode: "boolean" }).default(true).notNull(),
  // Optional self-pick step: while on and the plan isn't final, members who are coming choose their own free seat.
  // Stays on after finalizing (the event used self pick); reopening the plan turns it off.
  seatPicking: integer("seat_picking", { mode: "boolean" }).default(false).notNull(),
  /**
   * The event's own seat plan (e.g. lal.gg's DotLAN "Sitzplan" page), where each
   * member books the seat the leads gave them. Per event: the plan id changes every year.
   */
  externalPlanUrl: text("external_plan_url").default("").notNull(),
  /** Profile link pattern with {id} for the member's LAN ID; empty = the LAN type's. */
  profileUrl: text("profile_url").default("").notNull(),
  /**
   * When a lead published the event. Null = draft: only leads and clan admins see it, and nobody is
   * notified (no Discord post, no reminders) until it's published.
   */
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  /** A draft with this set goes live by itself at that time. */
  publishAt: integer("publish_at", { mode: "timestamp_ms" }),
  /**
   * Optional first phase: members only say whether they're interested, before sign-up, tickets and
   * seats. A lead then opens sign-up (sets it false).
   */
  interestCheck: integer("interest_check", { mode: "boolean" }).default(false).notNull(),
  /**
   * The date isn't fixed yet (only allowed during the interest check). startsAt/endsAt then hold a
   * placeholder for sorting; show `dateHint` (e.g. "spring 2027") instead.
   */
  dateTbd: integer("date_tbd", { mode: "boolean" }).default(false).notNull(),
  dateHint: text("date_hint").default("").notNull(),
  /** Cancelled events stay visible (greyed out) but take no answers and send no reminders. */
  cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
  cancelReason: text("cancel_reason").default("").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
});

export const ATTENDANCE_STATUSES = ["going", "maybe", "declined", "waitlist"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const attendance = sqliteTable(
  "attendance",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").$type<AttendanceStatus>().notNull(),
    /** Set by the attendee: "I bought my ticket". */
    ticketBought: integer("ticket_bought", { mode: "boolean" }).default(false).notNull(),
    /** Set by a lead: payment / ticket confirmed. */
    paid: integer("paid", { mode: "boolean" }).default(false).notNull(),
    note: text("note").default("").notNull(),
    /** Seat wishes as ranked rules, most important first (see src/lib/seat-rules.ts). */
    wishRules: text("wish_rules", { mode: "json" }).$type<SeatRule[]>().default([]).notNull(),
    wishNote: text("wish_note").default("").notNull(),
    /** Set by the attendee: "I booked my seat on the event's own seat plan". Cleared when their seat changes. */
    seatBooked: integer("seat_booked", { mode: "boolean" }).default(false).notNull(),
    /** Checked in at the venue on the day ("I'm here"). */
    arrivedAt: integer("arrived_at", { mode: "timestamp_ms" }),
    /**
     * Place in line while on the waitlist (earliest first); null otherwise. Not createdAt: someone who
     * answered "unsure" weeks ago must not jump ahead of people who said "coming" before them.
     */
    waitlistedAt: integer("waitlisted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("attendance_lan_user_uq").on(t.lanId, t.userId)],
);

/** Organisers of a LAN: may edit its details, seats and attendance. */
export const lanOrga = sqliteTable(
  "lan_orga",
  {
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("lan_orga_uq").on(t.lanId, t.userId)],
);

/**
 * Nicknames. Scope: lanId set = one event only; typeId set = every event of
 * that LAN type; both null = default nick everywhere.
 */
export const nickname = sqliteTable(
  "nickname",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lanId: text("lan_id").references(() => lan.id, { onDelete: "cascade" }),
    typeId: text("type_id").references(() => lanType.id, { onDelete: "cascade" }),
    nick: text("nick").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).default(false).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("nickname_user_idx").on(t.userId, t.lanId)],
);

/**
 * A member's own participant number at a LAN (user ID on lal.gg, SwitzerLAN
 * ticket number, ...). Same scopes as nicknames: per LAN type (normal), or per
 * single event when the event has no type. Shown to leads and in the export.
 */
export const lanAccount = sqliteTable(
  "lan_account",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lanId: text("lan_id").references(() => lan.id, { onDelete: "cascade" }),
    typeId: text("type_id").references(() => lanType.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("lan_account_user_idx").on(t.userId)],
);

/** One row per seat cell in a LAN's seating grid. Cells without a row are aisles/empty. */
export const seat = sqliteTable(
  "seat",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    row: integer("row").notNull(),
    col: integer("col").notNull(),
    label: text("label").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Held seats can't be claimed by members, only assigned by leads. */
    locked: integer("locked", { mode: "boolean" }).default(false).notNull(),
  },
  (t) => [
    uniqueIndex("seat_lan_pos_uq").on(t.lanId, t.row, t.col),
    uniqueIndex("seat_lan_user_uq").on(t.lanId, t.userId),
  ],
);

export const REMINDER_KINDS = [
  "signup",
  "payment",
  "event",
  "waitlist_promoted",
  "games",
  "book_seat",
  "published",
  "signup_open",
  // Lead nudges from the "Who's missing" tab (one row per step, re-sent updates sent_at).
  "nudge_interest",
  "nudge_answer",
  "nudge_unsure",
  "nudge_ticket",
  "nudge_nick",
  "nudge_seat",
  "nudge_book",
  "cancelled",
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const reminderLog = sqliteTable(
  "reminder_log",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ReminderKind>().notNull(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("reminder_log_uq").on(t.lanId, t.userId, t.kind)],
);

export const SWAP_STATUSES = ["pending", "accepted", "declined", "approved", "rejected", "cancelled"] as const;
export type SwapStatus = (typeof SWAP_STATUSES)[number];

/**
 * A member asks another seated member to swap seats. The other one accepts,
 * then a lead approves and the seats are swapped ("pending" -> "accepted" -> "approved").
 */
export const seatSwap = sqliteTable(
  "seat_swap",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").$type<SwapStatus>().default("pending").notNull(),
    note: text("note").default("").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("seat_swap_lan_idx").on(t.lanId)],
);

// ---------- Games ----------

/** A game someone suggested playing at a LAN. */
export const game = sqliteTable(
  "game",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Download size in GB, so people know what to install before they leave. */
    sizeGb: integer("size_gb"),
    /** Store or download page. */
    url: text("url").default("").notNull(),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("game_lan_idx").on(t.lanId)],
);

/** A member's vote for a game and whether they installed it. */
export const gameVote = sqliteTable(
  "game_vote",
  {
    gameId: text("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vote: integer("vote", { mode: "boolean" }).default(false).notNull(),
    installed: integer("installed", { mode: "boolean" }).default(false).notNull(),
  },
  (t) => [uniqueIndex("game_vote_uq").on(t.gameId, t.userId)],
);

// ---------- Chat integrations ----------

/** Discord channels the bot posts a clan's LAN announcements and reminders to. A server belongs to one clan. */
export const discordChannel = sqliteTable(
  "discord_channel",
  {
    id: id(),
    clanId: text("clan_id")
      .notNull()
      .references(() => clan.id, { onDelete: "cascade" }),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull().unique(),
    /** Channel name when it was linked, for display only. */
    channelName: text("channel_name").default("").notNull(),
    /** Server name, filled in when the bot first creates an invite. */
    guildName: text("guild_name").default("").notNull(),
    /** Invite link to the server for clan members who aren't on it yet (set by an admin, or created by the bot). */
    inviteUrl: text("invite_url").default("").notNull(),
    /** Discord user id of whoever ran /seatbit here. */
    addedBy: text("added_by"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("discord_channel_clan_idx").on(t.clanId), index("discord_channel_guild_idx").on(t.guildId)],
);

/** The announcement message for a LAN in a Discord channel, kept up to date with the attendee list. */
export const discordMessage = sqliteTable(
  "discord_message",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    /** Thread started on the post: reminders and news go there. */
    threadId: text("thread_id"),
    /** Channel the bot made for this event: the post lives there, and reminders and news too. */
    eventChannelId: text("event_channel_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("discord_message_lan_channel_uq").on(t.lanId, t.channelId)],
);

/** Reminders posted to chat channels, so each goes out once per LAN, channel and kind. */
export const channelReminderLog = sqliteTable(
  "channel_reminder_log",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    kind: text("kind").$type<ReminderKind>().notNull(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("channel_reminder_log_uq").on(t.lanId, t.channelId, t.kind)],
);

// ---------- Travel (carpools, sleeping spots) ----------

export const TRAVEL_KINDS = ["ride", "sleep"] as const;
export type TravelKind = (typeof TRAVEL_KINDS)[number];

/**
 * A member offers or asks for a ride or a place to sleep for a LAN, from/in a
 * town. Offers have free places that others join (travel_spot).
 */
export const travelPost = sqliteTable(
  "travel_post",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<TravelKind>().notNull(),
    mode: text("mode").$type<"offer" | "request">().notNull(),
    /** Ride: where the car leaves from. Sleep: where the place is. */
    town: text("town").default("").notNull(),
    /** Offer: free places. Request: people looking (e.g. 2 friends). */
    places: integer("places").default(1).notNull(),
    /** Free text, e.g. "Fri 16:00, back Sun evening". */
    whenText: text("when_text").default("").notNull(),
    note: text("note").default("").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("travel_post_lan_idx").on(t.lanId)],
);

/** Someone who took a place in a ride or sleeping-spot offer. */
export const travelSpot = sqliteTable(
  "travel_spot",
  {
    id: id(),
    postId: text("post_id")
      .notNull()
      .references(() => travelPost.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("travel_spot_uq").on(t.postId, t.userId)],
);

// ---------- Gear ----------

/** A member's own packing list: items they ticked as packed. Private to them. */
export const gearPacked = sqliteTable(
  "gear_packed",
  {
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    item: text("item").notNull(),
  },
  (t) => [uniqueIndex("gear_packed_uq").on(t.lanId, t.userId, t.item)],
);

/** Items a member added to their own packing list for a LAN. Private to them. */
export const packingItem = sqliteTable(
  "packing_item",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    packed: integer("packed", { mode: "boolean" }).default(false).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("packing_item_lan_user_idx").on(t.lanId, t.userId)],
);

export type User = typeof user.$inferSelect;
export type Lan = typeof lan.$inferSelect;
export type LanType = typeof lanType.$inferSelect;
export type Clan = typeof clan.$inferSelect;
export type Donation = typeof donation.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type Nickname = typeof nickname.$inferSelect;
export type LanAccount = typeof lanAccount.$inferSelect;
export type Seat = typeof seat.$inferSelect;
export type TravelPost = typeof travelPost.$inferSelect;
export type SeatSwap = typeof seatSwap.$inferSelect;
export type Game = typeof game.$inferSelect;

// ---------- Platform settings ----------

/**
 * Admin-editable platform settings (SMTP, OAuth, bot tokens, ...). A row here
 * overrides the matching environment variable. Secret values are stored
 * AES-256-GCM encrypted (see src/lib/settings.ts) and never sent to the browser.
 */
export const appSetting = sqliteTable("app_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  encrypted: integer("encrypted", { mode: "boolean" }).default(false).notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(now).notNull(),
});

/**
 * Which days someone used Seatbit (a date, no time, no pages), for the platform usage stats.
 * At most one row per person and day; rows older than USAGE_KEEP_DAYS are removed.
 */
export const userActivity = sqliteTable(
  "user_activity",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD in the server's time zone. */
    day: text("day").notNull(),
  },
  (t) => [uniqueIndex("user_activity_user_day_idx").on(t.userId, t.day), index("user_activity_day_idx").on(t.day)],
);

export const INTEREST_ANSWERS = ["yes", "maybe", "no"] as const;
export type InterestAnswer = (typeof INTEREST_ANSWERS)[number];

/** Answers during an event's interest check (before sign-up opens). */
export const lanInterest = sqliteTable(
  "lan_interest",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    answer: text("answer").$type<InterestAnswer>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("lan_interest_uq").on(t.lanId, t.userId)],
);

/** Short updates from the leads to everyone at an event ("doors open 10:00"). */
export const lanNews = sqliteTable(
  "lan_news",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("lan_news_lan_idx").on(t.lanId)],
);

// ---------- Audit log ----------

/**
 * Changes leads and admins make (seat moves, answer overrides, role changes, guest edits,
 * publish/cancel, ...). Clan admins see their clan's entries, platform admins all of them.
 * Names are looked up when the log is shown (actor / target), so a deleted account shows as
 * "Deleted member" here too; `data` only holds non-personal details (seat labels, statuses,
 * the event name). Entries older than a year are removed.
 */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    at: integer("at", { mode: "timestamp_ms" }).default(now).notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    /** null = platform-wide (settings, platform roles) or the clan was deleted. */
    clanId: text("clan_id").references(() => clan.id, { onDelete: "set null" }),
    lanId: text("lan_id").references(() => lan.id, { onDelete: "set null" }),
    targetUserId: text("target_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().default({}).notNull(),
  },
  (t) => [index("audit_log_clan_idx").on(t.clanId, t.at), index("audit_log_lan_idx").on(t.lanId), index("audit_log_at_idx").on(t.at)],
);

export type AuditEntry = typeof auditLog.$inferSelect;

// ---------- Emergency info ----------

/**
 * A member's emergency contact and dietary needs / allergies (health data, so kept out of the
 * user row). Only the leads of events the member is coming to see it, and every look is logged.
 * Left out of exports, mails and Discord; deleted with the account.
 */
export const emergencyInfo = sqliteTable("emergency_info", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  contactName: text("contact_name").default("").notNull(),
  contactPhone: text("contact_phone").default("").notNull(),
  /** Free text: "vegetarian", "nut allergy, carries an EpiPen". */
  diet: text("diet").default("").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(now).notNull(),
});

export type EmergencyInfo = typeof emergencyInfo.$inferSelect;

// ---------- Food orders ----------

export const FOOD_ORDER_STATUSES = ["open", "closed", "ordered"] as const;
export type FoodOrderStatus = (typeof FOOD_ORDER_STATUSES)[number];

/** A food run at the LAN ("Pizza Saturday 19:00"): everyone adds what they want, one person orders. */
export const foodOrder = sqliteTable(
  "food_order",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Where from, e.g. "Pizzeria Roma". */
    shop: text("shop").default("").notNull(),
    menuUrl: text("menu_url").default("").notNull(),
    note: text("note").default("").notNull(),
    /** Last call for orders (optional). */
    closesAt: integer("closes_at", { mode: "timestamp_ms" }),
    status: text("status").$type<FoodOrderStatus>().default("open").notNull(),
    /** Who collects the order and the money (the one who started it). */
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("food_order_lan_idx").on(t.lanId)],
);

/** One line of a food order: "2x Margherita, no olives". */
export const foodItem = sqliteTable(
  "food_item",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => foodOrder.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    item: text("item").notNull(),
    qty: integer("qty").default(1).notNull(),
    /** Price per piece in cents (optional). */
    priceCents: integer("price_cents"),
    note: text("note").default("").notNull(),
    /** Set by whoever collects the money. */
    paid: integer("paid", { mode: "boolean" }).default(false).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("food_item_order_idx").on(t.orderId)],
);

// ---------- Clan payments ----------

export const CHARGE_KINDS = ["dues", "event", "other"] as const;
export type ChargeKind = (typeof CHARGE_KINDS)[number];

/**
 * Money a clan collects from its members: yearly dues, ticket money for an event, a shared cost.
 * One row per thing; what each person owes is a charge_item.
 */
export const charge = sqliteTable(
  "charge",
  {
    id: id(),
    clanId: text("clan_id")
      .notNull()
      .references(() => clan.id, { onDelete: "cascade" }),
    /** The event it's for, if any. Deleting the event keeps the charge (money may still be owed). */
    lanId: text("lan_id").references(() => lan.id, { onDelete: "set null" }),
    kind: text("kind").$type<ChargeKind>().default("other").notNull(),
    title: text("title").notNull(),
    note: text("note").default("").notNull(),
    currency: text("currency").default("CHF").notNull(),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("charge_clan_idx").on(t.clanId), index("charge_lan_idx").on(t.lanId)],
);

/**
 * "open": owes it. "reported": the member says they paid, a lead hasn't checked yet.
 * "paid": a lead (or Stripe) confirmed it. "waived": doesn't have to pay after all.
 */
export const CHARGE_ITEM_STATUSES = ["open", "reported", "paid", "waived"] as const;
export type ChargeItemStatus = (typeof CHARGE_ITEM_STATUSES)[number];
export const PAID_VIA = ["cash", "bank", "twint", "stripe", "other"] as const;
export type PaidVia = (typeof PAID_VIA)[number];

/** What one person owes for a charge, and whether it's paid. */
export const chargeItem = sqliteTable(
  "charge_item",
  {
    id: id(),
    chargeId: text("charge_id")
      .notNull()
      .references(() => charge.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").$type<ChargeItemStatus>().default("open").notNull(),
    paidVia: text("paid_via").$type<PaidVia>(),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    /** Who marked it paid or waived (null for Stripe or the member's own report). */
    markedBy: text("marked_by").references(() => user.id, { onDelete: "set null" }),
    /** The Stripe PaymentIntent when it was paid online (on the clan's account), for refunds. */
    stripePaymentId: text("stripe_payment_id"),
    /** Last reminder about it, by hand or before the due date. */
    remindedAt: integer("reminded_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("charge_item_uq").on(t.chargeId, t.userId), index("charge_item_user_idx").on(t.userId)],
);

export type Charge = typeof charge.$inferSelect;
export type ChargeItem = typeof chargeItem.$inferSelect;

export type FoodOrder = typeof foodOrder.$inferSelect;
export type FoodItem = typeof foodItem.$inferSelect;

// ---------- Lead to-dos and organizer contacts ----------

/**
 * People at the LAN's own organizers (not the clan) the leads deal with: ticket desk, seat
 * planner, ... Per LAN type, since the organizers stay the same from year to year.
 */
export const leadContact = sqliteTable(
  "lead_contact",
  {
    id: id(),
    typeId: text("type_id")
      .notNull()
      .references(() => lanType.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** What they do for the group, e.g. "Seat planning". */
    role: text("role").default("").notNull(),
    email: text("email").default("").notNull(),
    discord: text("discord").default("").notNull(),
    phone: text("phone").default("").notNull(),
    url: text("url").default("").notNull(),
    note: text("note").default("").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("lead_contact_type_idx").on(t.typeId)],
);

/**
 * A to-do the leads tick off by hand. Scope: typeId and lanId null = every event of the clan,
 * typeId = events of that LAN type, lanId = that one event only.
 */
export const leadTask = sqliteTable(
  "lead_task",
  {
    id: id(),
    clanId: text("clan_id")
      .notNull()
      .references(() => clan.id, { onDelete: "cascade" }),
    typeId: text("type_id").references(() => lanType.id, { onDelete: "cascade" }),
    lanId: text("lan_id").references(() => lan.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    note: text("note").default("").notNull(),
    /** Opens once these are done: built-in lead steps ("finalize") or other to-dos ("task:<id>"). */
    after: text("after", { mode: "json" }).$type<string[]>().default([]).notNull(),
    /** Due this many days before the event starts (negative = after the start); null = no due date. */
    dueDays: integer("due_days"),
    contactId: text("contact_id").references(() => leadContact.id, { onDelete: "set null" }),
    sort: integer("sort").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("lead_task_clan_idx").on(t.clanId)],
);

/** A to-do's state at one event: who has it, who ticked it and when. */
export const lanTask = sqliteTable(
  "lan_task",
  {
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => leadTask.id, { onDelete: "cascade" }),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
    doneById: text("done_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("lan_task_uq").on(t.lanId, t.taskId)],
);

export type LeadContact = typeof leadContact.$inferSelect;
export type LeadTask = typeof leadTask.$inferSelect;
export type LanTask = typeof lanTask.$inferSelect;

// ---------- Abuse reports ----------

// Reasons and states live in src/lib/report-reasons.ts.
import type { ReportReason, ReportStatus } from "../lib/report-reasons";
export { REPORT_REASONS, REPORT_STATUSES, type ReportReason, type ReportStatus } from "../lib/report-reasons";

/** A member's report about a clan or an event, for the platform moderators' queue. */
export const report = sqliteTable(
  "report",
  {
    id: id(),
    /** The reported clan (also set for an event report, so a clan's reports stay together). */
    clanId: text("clan_id").references(() => clan.id, { onDelete: "set null" }),
    /** Set when an event was reported. */
    lanId: text("lan_id").references(() => lan.id, { onDelete: "set null" }),
    /** Name at the time of the report, so the queue still makes sense after a deletion. */
    subject: text("subject").default("").notNull(),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    reason: text("reason").$type<ReportReason>().notNull(),
    message: text("message").default("").notNull(),
    status: text("status").$type<ReportStatus>().default("open").notNull(),
    handledBy: text("handled_by").references(() => user.id, { onDelete: "set null" }),
    handledAt: integer("handled_at", { mode: "timestamp_ms" }),
    /** Moderator's note on the outcome; only staff see it. */
    note: text("note").default("").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("report_status_idx").on(t.status, t.createdAt), index("report_clan_idx").on(t.clanId)],
);

export type Report = typeof report.$inferSelect;

// ---------- Shared costs ----------

/**
 * Something one person paid for the group at an event (group tickets, fuel, snacks), split
 * between some of the people there. Unlike clan payments, the money goes between members.
 */
export const costExpense = sqliteTable(
  "cost_expense",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paidBy: text("paid_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    note: text("note").default("").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("cost_expense_lan_idx").on(t.lanId)],
);

/** One person's part of an expense. The parts of an expense add up to its amount. */
export const costShare = sqliteTable(
  "cost_share",
  {
    expenseId: text("expense_id")
      .notNull()
      .references(() => costExpense.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [uniqueIndex("cost_share_uq").on(t.expenseId, t.userId), index("cost_share_user_idx").on(t.userId)],
);

/** Money paid back between two people at an event ("Anna paid Mike CHF 20"). */
export const costSettlement = sqliteTable(
  "cost_settlement",
  {
    id: id(),
    lanId: text("lan_id")
      .notNull()
      .references(() => lan.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    /** Who ticked it off: either of the two, or a lead. */
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [index("cost_settlement_lan_idx").on(t.lanId)],
);

export type CostExpense = typeof costExpense.$inferSelect;
export type CostSettlement = typeof costSettlement.$inferSelect;
