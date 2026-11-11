import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ---------- Better Auth tables ----------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  role: text("role").default("member").notNull(), // "admin" | "member"
  emailReminders: integer("email_reminders", { mode: "boolean" }).default(true).notNull(),
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
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
});

/** "pending" = asked to join, waiting for an admin. */
export const CLAN_ROLES = ["admin", "member", "pending"] as const;
export type ClanRole = (typeof CLAN_ROLES)[number];

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
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (t) => [uniqueIndex("clan_member_uq").on(t.clanId, t.userId), index("clan_member_user_idx").on(t.userId)],
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
  /** Send due-date reminders this many days before a deadline. */
  reminderDays: integer("reminder_days").default(3).notNull(),
  seatRows: integer("seat_rows").default(6).notNull(),
  seatCols: integer("seat_cols").default(10).notNull(),
  /** When the orgas published the seat plan; members only see seats after this. */
  seatsPublishedAt: integer("seats_published_at", { mode: "timestamp_ms" }),
  /** Whether attendees may pick their own seats. */
  seatingOpen: integer("seating_open", { mode: "boolean" }).default(true).notNull(),
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
    /** Set by an orga: payment / ticket confirmed. */
    paid: integer("paid", { mode: "boolean" }).default(false).notNull(),
    note: text("note").default("").notNull(),
    /** Seat wishes: user ids to sit near / not next to (JSON arrays). */
    wishNear: text("wish_near", { mode: "json" }).$type<string[]>().default([]).notNull(),
    wishAvoid: text("wish_avoid", { mode: "json" }).$type<string[]>().default([]).notNull(),
    wishPosition: text("wish_position").$type<"any" | "edge" | "middle">().default("any").notNull(),
    /** Preferred seat label, e.g. "F7". */
    wishSeat: text("wish_seat").default("").notNull(),
    wishNote: text("wish_note").default("").notNull(),
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
    /** Held seats can't be claimed by members, only assigned by orgas. */
    locked: integer("locked", { mode: "boolean" }).default(false).notNull(),
  },
  (t) => [
    uniqueIndex("seat_lan_pos_uq").on(t.lanId, t.row, t.col),
    uniqueIndex("seat_lan_user_uq").on(t.lanId, t.userId),
  ],
);

export const REMINDER_KINDS = ["signup", "payment", "event", "waitlist_promoted"] as const;
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

export type User = typeof user.$inferSelect;
export type Lan = typeof lan.$inferSelect;
export type LanType = typeof lanType.$inferSelect;
export type Clan = typeof clan.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type Nickname = typeof nickname.$inferSelect;
export type Seat = typeof seat.$inferSelect;
